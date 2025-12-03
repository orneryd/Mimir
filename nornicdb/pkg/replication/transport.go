// Package replication provides cluster replication for NornicDB.
//
// Transport Architecture:
//
// NornicDB cluster communication uses a hybrid approach:
//
// 1. **Bolt Protocol (Port 7687)** - Used for:
//   - Write forwarding from followers to leader
//   - Query routing in the cluster
//   - Existing Neo4j driver compatibility
//
// 2. **Cluster Protocol (Port 7688)** - Used for:
//   - Raft consensus (RequestVote, AppendEntries)
//   - WAL streaming for HA standby
//   - Heartbeats and health checks
//   - Cluster coordination
//
// This separation allows:
//   - Client-facing Bolt remains pure Neo4j compatible
//   - Cluster protocol is optimized for low-latency consensus
//   - Existing Bolt infrastructure reused where appropriate
//
// Example Configuration:
//
//	NORNICDB_CLUSTER_MODE=raft
//	NORNICDB_CLUSTER_BIND_ADDR=0.0.0.0:7688
//	NORNICDB_BOLT_PORT=7687
package replication

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

// ClusterMessageType identifies cluster protocol messages.
type ClusterMessageType uint8

const (
	// Raft consensus messages
	ClusterMsgVoteRequest ClusterMessageType = iota + 1
	ClusterMsgVoteResponse
	ClusterMsgAppendEntries
	ClusterMsgAppendEntriesResponse

	// HA standby messages
	ClusterMsgWALBatch
	ClusterMsgWALBatchResponse
	ClusterMsgHeartbeat
	ClusterMsgHeartbeatResponse
	ClusterMsgFence
	ClusterMsgFenceResponse
	ClusterMsgPromote
	ClusterMsgPromoteResponse

	// Cluster management
	ClusterMsgJoin
	ClusterMsgJoinResponse
	ClusterMsgLeave
	ClusterMsgLeaveResponse
	ClusterMsgStatus
	ClusterMsgStatusResponse
)

// ClusterMessage is the on-wire format for cluster communication.
type ClusterMessage struct {
	Type    ClusterMessageType `json:"t"`
	NodeID  string             `json:"n,omitempty"`
	Payload json.RawMessage    `json:"p,omitempty"`
}

// ClusterTransport handles cluster-to-cluster communication.
//
// For client-facing queries, use the standard Bolt server (pkg/bolt).
// ClusterTransport is specifically for:
//   - Raft consensus protocol
//   - WAL streaming for HA
//   - Cluster coordination
type ClusterTransport struct {
	mu           sync.RWMutex
	nodeID       string
	bindAddr     string
	listener     net.Listener
	connections  map[string]*ClusterConnection
	closed       atomic.Bool
	closeCh      chan struct{}
	wg           sync.WaitGroup
	dialTimeout  time.Duration
	readTimeout  time.Duration
	writeTimeout time.Duration
	maxMsgSize   int

	// Message handlers
	handlers map[ClusterMessageType]MessageHandler
}

// MessageHandler processes incoming cluster messages.
type MessageHandler func(ctx context.Context, nodeID string, msg *ClusterMessage) (*ClusterMessage, error)

// ClusterTransportConfig configures the cluster transport.
type ClusterTransportConfig struct {
	NodeID       string
	BindAddr     string
	DialTimeout  time.Duration
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	MaxMsgSize   int
}

// DefaultClusterTransportConfig returns production defaults.
func DefaultClusterTransportConfig() *ClusterTransportConfig {
	return &ClusterTransportConfig{
		DialTimeout:  5 * time.Second,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 10 * time.Second,
		MaxMsgSize:   64 * 1024 * 1024, // 64MB max
	}
}

// NewClusterTransport creates a cluster transport.
func NewClusterTransport(config *ClusterTransportConfig) *ClusterTransport {
	if config == nil {
		config = DefaultClusterTransportConfig()
	}
	return &ClusterTransport{
		nodeID:       config.NodeID,
		bindAddr:     config.BindAddr,
		connections:  make(map[string]*ClusterConnection),
		closeCh:      make(chan struct{}),
		dialTimeout:  config.DialTimeout,
		readTimeout:  config.ReadTimeout,
		writeTimeout: config.WriteTimeout,
		maxMsgSize:   config.MaxMsgSize,
		handlers:     make(map[ClusterMessageType]MessageHandler),
	}
}

// RegisterHandler registers a handler for a message type.
func (t *ClusterTransport) RegisterHandler(msgType ClusterMessageType, handler MessageHandler) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.handlers[msgType] = handler
}

// Connect establishes a connection to a peer node.
func (t *ClusterTransport) Connect(ctx context.Context, addr string) (PeerConnection, error) {
	if t.closed.Load() {
		return nil, errors.New("transport closed")
	}

	// Check for existing connection
	t.mu.RLock()
	if conn, ok := t.connections[addr]; ok && conn.IsConnected() {
		t.mu.RUnlock()
		return conn, nil
	}
	t.mu.RUnlock()

	// Dial with timeout
	dialCtx, cancel := context.WithTimeout(ctx, t.dialTimeout)
	defer cancel()

	var d net.Dialer
	netConn, err := d.DialContext(dialCtx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("connect to %s: %w", addr, err)
	}

	conn := t.createConnection(addr, netConn)
	conn.wg.Add(1)
	go conn.readLoop()

	// Store connection
	t.mu.Lock()
	t.connections[addr] = conn
	t.mu.Unlock()

	log.Printf("[Cluster] Connected to peer %s", addr)
	return conn, nil
}

func (t *ClusterTransport) createConnection(addr string, netConn net.Conn) *ClusterConnection {
	return &ClusterConnection{
		transport:    t,
		addr:         addr,
		conn:         netConn,
		reader:       bufio.NewReader(netConn),
		writer:       bufio.NewWriter(netConn),
		readTimeout:  t.readTimeout,
		writeTimeout: t.writeTimeout,
		maxMsgSize:   t.maxMsgSize,
		closeCh:      make(chan struct{}),
		pendingRPCs:  make(map[uint64]chan *ClusterMessage),
	}
}

// Listen starts accepting cluster connections.
func (t *ClusterTransport) Listen(ctx context.Context, addr string, handler ConnectionHandler) error {
	if t.closed.Load() {
		return errors.New("transport closed")
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}

	t.mu.Lock()
	t.listener = listener
	t.mu.Unlock()

	log.Printf("[Cluster] Listening on %s", addr)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.closeCh:
			return nil
		default:
		}

		// Set accept deadline for graceful shutdown
		if tcpListener, ok := listener.(*net.TCPListener); ok {
			tcpListener.SetDeadline(time.Now().Add(time.Second))
		}

		netConn, err := listener.Accept()
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue
			}
			if t.closed.Load() {
				return nil
			}
			log.Printf("[Cluster] Accept error: %v", err)
			continue
		}

		t.wg.Add(1)
		go t.handleIncoming(ctx, netConn)
	}
}

func (t *ClusterTransport) handleIncoming(ctx context.Context, netConn net.Conn) {
	defer t.wg.Done()
	defer netConn.Close()

	remoteAddr := netConn.RemoteAddr().String()
	log.Printf("[Cluster] Accepted connection from %s", remoteAddr)

	reader := bufio.NewReader(netConn)
	writer := bufio.NewWriter(netConn)

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.closeCh:
			return
		default:
		}

		// Read message
		netConn.SetReadDeadline(time.Now().Add(t.readTimeout))
		msg, err := readClusterMessage(reader, t.maxMsgSize)
		if err != nil {
			if err != io.EOF && !t.closed.Load() {
				if ne, ok := err.(net.Error); !ok || !ne.Timeout() {
					log.Printf("[Cluster] Read error from %s: %v", remoteAddr, err)
				}
			}
			return
		}

		// Find handler
		t.mu.RLock()
		handler, ok := t.handlers[msg.Type]
		t.mu.RUnlock()

		if !ok {
			log.Printf("[Cluster] No handler for message type %d", msg.Type)
			continue
		}

		// Handle message
		resp, err := handler(ctx, msg.NodeID, msg)
		if err != nil {
			log.Printf("[Cluster] Handler error: %v", err)
			continue
		}

		if resp != nil {
			netConn.SetWriteDeadline(time.Now().Add(t.writeTimeout))
			if err := writeClusterMessage(writer, resp); err != nil {
				log.Printf("[Cluster] Write error to %s: %v", remoteAddr, err)
				return
			}
			if err := writer.Flush(); err != nil {
				log.Printf("[Cluster] Flush error to %s: %v", remoteAddr, err)
				return
			}
		}
	}
}

// Close shuts down the transport.
func (t *ClusterTransport) Close() error {
	if t.closed.Swap(true) {
		return nil
	}

	close(t.closeCh)

	t.mu.Lock()
	if t.listener != nil {
		t.listener.Close()
	}
	for _, conn := range t.connections {
		conn.Close()
	}
	t.mu.Unlock()

	t.wg.Wait()
	log.Printf("[Cluster] Transport closed")
	return nil
}

// ClusterConnection implements PeerConnection for cluster communication.
type ClusterConnection struct {
	transport    *ClusterTransport
	addr         string
	conn         net.Conn
	reader       *bufio.Reader
	writer       *bufio.Writer
	mu           sync.Mutex
	connected    atomic.Bool
	closeCh      chan struct{}
	wg           sync.WaitGroup
	readTimeout  time.Duration
	writeTimeout time.Duration
	maxMsgSize   int

	// RPC tracking
	rpcMu       sync.Mutex
	nextRPCID   uint64
	pendingRPCs map[uint64]chan *ClusterMessage
}

func (c *ClusterConnection) sendRPC(ctx context.Context, msg *ClusterMessage) (*ClusterMessage, error) {
	if !c.connected.Load() {
		return nil, errors.New("not connected")
	}

	// Create response channel
	c.rpcMu.Lock()
	rpcID := c.nextRPCID
	c.nextRPCID++
	respCh := make(chan *ClusterMessage, 1)
	c.pendingRPCs[rpcID] = respCh
	c.rpcMu.Unlock()

	defer func() {
		c.rpcMu.Lock()
		delete(c.pendingRPCs, rpcID)
		c.rpcMu.Unlock()
	}()

	// Send request
	c.mu.Lock()
	c.conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	err := writeClusterMessage(c.writer, msg)
	if err == nil {
		err = c.writer.Flush()
	}
	c.mu.Unlock()

	if err != nil {
		return nil, fmt.Errorf("write: %w", err)
	}

	// Wait for response
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.closeCh:
		return nil, errors.New("connection closed")
	case resp := <-respCh:
		return resp, nil
	}
}

func (c *ClusterConnection) readLoop() {
	defer c.wg.Done()
	c.connected.Store(true)
	defer func() {
		c.connected.Store(false)
		close(c.closeCh)
	}()

	for {
		c.conn.SetReadDeadline(time.Now().Add(c.readTimeout))
		msg, err := readClusterMessage(c.reader, c.maxMsgSize)
		if err != nil {
			if err != io.EOF {
				if ne, ok := err.(net.Error); !ok || !ne.Timeout() {
					log.Printf("[Cluster] Read error: %v", err)
				}
			}
			return
		}

		// Dispatch to pending RPC
		c.rpcMu.Lock()
		for id, ch := range c.pendingRPCs {
			select {
			case ch <- msg:
			default:
			}
			delete(c.pendingRPCs, id)
			break
		}
		c.rpcMu.Unlock()
	}
}

// SendWALBatch sends WAL entries to the peer.
func (c *ClusterConnection) SendWALBatch(ctx context.Context, entries []*WALEntry) (*WALBatchResponse, error) {
	payload, err := json.Marshal(entries)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	msg := &ClusterMessage{
		Type:    ClusterMsgWALBatch,
		Payload: payload,
	}

	resp, err := c.sendRPC(ctx, msg)
	if err != nil {
		return nil, err
	}

	var result WALBatchResponse
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &result, nil
}

// SendHeartbeat sends a heartbeat to the peer.
func (c *ClusterConnection) SendHeartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	msg := &ClusterMessage{
		Type:    ClusterMsgHeartbeat,
		Payload: payload,
	}

	resp, err := c.sendRPC(ctx, msg)
	if err != nil {
		return nil, err
	}

	var result HeartbeatResponse
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &result, nil
}

// SendFence sends a fence request to the peer.
func (c *ClusterConnection) SendFence(ctx context.Context, req *FenceRequest) (*FenceResponse, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	msg := &ClusterMessage{
		Type:    ClusterMsgFence,
		Payload: payload,
	}

	resp, err := c.sendRPC(ctx, msg)
	if err != nil {
		return nil, err
	}

	var result FenceResponse
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &result, nil
}

// SendPromote sends a promote request to the peer.
func (c *ClusterConnection) SendPromote(ctx context.Context, req *PromoteRequest) (*PromoteResponse, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	msg := &ClusterMessage{
		Type:    ClusterMsgPromote,
		Payload: payload,
	}

	resp, err := c.sendRPC(ctx, msg)
	if err != nil {
		return nil, err
	}

	var result PromoteResponse
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &result, nil
}

// SendRaftVote sends a Raft vote request to the peer.
func (c *ClusterConnection) SendRaftVote(ctx context.Context, req *RaftVoteRequest) (*RaftVoteResponse, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	msg := &ClusterMessage{
		Type:    ClusterMsgVoteRequest,
		Payload: payload,
	}

	resp, err := c.sendRPC(ctx, msg)
	if err != nil {
		return nil, err
	}

	var result RaftVoteResponse
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &result, nil
}

// SendRaftAppendEntries sends Raft append entries to the peer.
func (c *ClusterConnection) SendRaftAppendEntries(ctx context.Context, req *RaftAppendEntriesRequest) (*RaftAppendEntriesResponse, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	msg := &ClusterMessage{
		Type:    ClusterMsgAppendEntries,
		Payload: payload,
	}

	resp, err := c.sendRPC(ctx, msg)
	if err != nil {
		return nil, err
	}

	var result RaftAppendEntriesResponse
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &result, nil
}

// Close closes the connection.
func (c *ClusterConnection) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		c.conn.Close()
	}
	c.wg.Wait()
	return nil
}

// IsConnected returns true if the connection is active.
func (c *ClusterConnection) IsConnected() bool {
	return c.connected.Load()
}

// Wire protocol helpers

func writeClusterMessage(w *bufio.Writer, msg *ClusterMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	// Length prefix (4 bytes, big endian)
	length := uint32(len(data))
	if err := binary.Write(w, binary.BigEndian, length); err != nil {
		return err
	}

	_, err = w.Write(data)
	return err
}

func readClusterMessage(r *bufio.Reader, maxSize int) (*ClusterMessage, error) {
	// Read length prefix
	var length uint32
	if err := binary.Read(r, binary.BigEndian, &length); err != nil {
		return nil, err
	}

	if int(length) > maxSize {
		return nil, fmt.Errorf("message too large: %d > %d", length, maxSize)
	}

	// Read data
	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, err
	}

	var msg ClusterMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}

	return &msg, nil
}

// Verify interface compliance
var _ Transport = (*ClusterTransport)(nil)
var _ PeerConnection = (*ClusterConnection)(nil)
