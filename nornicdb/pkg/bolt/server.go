// Package bolt implements the Neo4j Bolt protocol server for NornicDB.
// This allows existing Neo4j drivers to connect to NornicDB.
package bolt

import (
	"context"
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"
)

// Protocol versions supported
const (
	BoltV4_4 = 0x0404 // Bolt 4.4
	BoltV4_3 = 0x0403 // Bolt 4.3
	BoltV4_2 = 0x0402 // Bolt 4.2
	BoltV4_1 = 0x0401 // Bolt 4.1
	BoltV4_0 = 0x0400 // Bolt 4.0
)

// Message types
const (
	MsgHello    byte = 0x01
	MsgGoodbye  byte = 0x02
	MsgReset    byte = 0x0F
	MsgRun      byte = 0x10
	MsgDiscard  byte = 0x2F
	MsgPull     byte = 0x3F
	MsgBegin    byte = 0x11
	MsgCommit   byte = 0x12
	MsgRollback byte = 0x13
	MsgRoute    byte = 0x66

	// Response messages
	MsgSuccess byte = 0x70
	MsgRecord  byte = 0x71
	MsgIgnored byte = 0x7E
	MsgFailure byte = 0x7F
)

// Server implements a Bolt protocol server.
type Server struct {
	config   *Config
	listener net.Listener
	mu       sync.RWMutex
	sessions map[string]*Session
	closed   atomic.Bool

	// Query executor (injected dependency)
	executor QueryExecutor
}

// QueryExecutor executes Cypher queries.
type QueryExecutor interface {
	Execute(ctx context.Context, query string, params map[string]any) (*QueryResult, error)
}

// QueryResult holds the result of a query.
type QueryResult struct {
	Columns []string
	Rows    [][]any
}

// Config holds Bolt server configuration.
type Config struct {
	Port            int
	MaxConnections  int
	ReadBufferSize  int
	WriteBufferSize int
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		Port:            7687,
		MaxConnections:  100,
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
	}
}

// New creates a new Bolt server.
func New(config *Config, executor QueryExecutor) *Server {
	if config == nil {
		config = DefaultConfig()
	}

	return &Server{
		config:   config,
		sessions: make(map[string]*Session),
		executor: executor,
	}
}

// ListenAndServe starts the Bolt server.
func (s *Server) ListenAndServe() error {
	addr := fmt.Sprintf(":%d", s.config.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	s.listener = listener

	fmt.Printf("Bolt server listening on bolt://localhost:%d\n", s.config.Port)

	return s.serve()
}

// serve accepts connections in a loop.
func (s *Server) serve() error {
	for {
		if s.closed.Load() {
			return nil
		}

		conn, err := s.listener.Accept()
		if err != nil {
			if s.closed.Load() {
				return nil // Clean shutdown
			}
			continue
		}

		go s.handleConnection(conn)
	}
}

// Close stops the Bolt server.
func (s *Server) Close() error {
	s.closed.Store(true)
	if s.listener != nil {
		return s.listener.Close()
	}
	return nil
}

// IsClosed returns whether the server is closed.
func (s *Server) IsClosed() bool {
	return s.closed.Load()
}

// handleConnection handles a single client connection.
func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()

	session := &Session{
		conn:     conn,
		server:   s,
		executor: s.executor,
	}

	// Perform handshake
	if err := session.handshake(); err != nil {
		fmt.Printf("Handshake failed: %v\n", err)
		return
	}

	// Handle messages
	for {
		if s.closed.Load() {
			return
		}
		if err := session.handleMessage(); err != nil {
			if err == io.EOF {
				return
			}
			fmt.Printf("Message handling error: %v\n", err)
			return
		}
	}
}

// Session represents a client session.
type Session struct {
	conn     net.Conn
	server   *Server
	executor QueryExecutor
	version  uint32
	
	// Transaction state
	inTransaction bool
}

// handshake performs the Bolt handshake.
func (s *Session) handshake() error {
	// Read magic number (4 bytes: 0x60 0x60 0xB0 0x17)
	magic := make([]byte, 4)
	if _, err := io.ReadFull(s.conn, magic); err != nil {
		return fmt.Errorf("failed to read magic: %w", err)
	}

	if magic[0] != 0x60 || magic[1] != 0x60 || magic[2] != 0xB0 || magic[3] != 0x17 {
		return fmt.Errorf("invalid magic number: %x", magic)
	}

	// Read supported versions (4 x 4 bytes)
	versions := make([]byte, 16)
	if _, err := io.ReadFull(s.conn, versions); err != nil {
		return fmt.Errorf("failed to read versions: %w", err)
	}

	// Select highest supported version
	// For now, we'll always respond with 4.4
	s.version = BoltV4_4
	
	// Send selected version
	response := []byte{0x00, 0x00, 0x04, 0x04} // Bolt 4.4
	if _, err := s.conn.Write(response); err != nil {
		return fmt.Errorf("failed to send version: %w", err)
	}

	return nil
}

// handleMessage handles a single Bolt message.
func (s *Session) handleMessage() error {
	// Read chunk header (2 bytes: size)
	header := make([]byte, 2)
	if _, err := io.ReadFull(s.conn, header); err != nil {
		return err
	}

	size := int(header[0])<<8 | int(header[1])
	if size == 0 {
		return nil // No-op chunk
	}

	// Read message data
	data := make([]byte, size)
	if _, err := io.ReadFull(s.conn, data); err != nil {
		return err
	}

	// Read chunk terminator (2 bytes: 0x00 0x00)
	terminator := make([]byte, 2)
	if _, err := io.ReadFull(s.conn, terminator); err != nil {
		return err
	}

	// Parse and handle message
	if len(data) == 0 {
		return fmt.Errorf("empty message")
	}

	msgType := data[0]

	switch msgType {
	case MsgHello:
		return s.handleHello(data[1:])
	case MsgGoodbye:
		return io.EOF
	case MsgRun:
		return s.handleRun(data[1:])
	case MsgPull:
		return s.handlePull(data[1:])
	case MsgReset:
		return s.handleReset(data[1:])
	case MsgBegin:
		return s.handleBegin(data[1:])
	case MsgCommit:
		return s.handleCommit(data[1:])
	case MsgRollback:
		return s.handleRollback(data[1:])
	default:
		return fmt.Errorf("unknown message type: 0x%02X", msgType)
	}
}

// handleHello handles the HELLO message.
func (s *Session) handleHello(data []byte) error {
	// TODO: Parse HELLO message, extract auth
	// For now, accept all connections
	
	return s.sendSuccess(map[string]any{
		"server":         "NornicDB/0.1.0",
		"connection_id":  "nornic-1",
		"hints":          map[string]any{},
	})
}

// handleRun handles the RUN message (execute Cypher).
func (s *Session) handleRun(data []byte) error {
	// TODO: Parse PackStream to extract query and params
	// For now, placeholder
	
	return s.sendSuccess(map[string]any{
		"fields": []string{},
		"t_first": 0,
	})
}

// handlePull handles the PULL message.
func (s *Session) handlePull(data []byte) error {
	// TODO: Stream results
	
	return s.sendSuccess(map[string]any{
		"has_more": false,
	})
}

// handleReset handles the RESET message.
func (s *Session) handleReset(data []byte) error {
	s.inTransaction = false
	return s.sendSuccess(nil)
}

// handleBegin handles the BEGIN message.
func (s *Session) handleBegin(data []byte) error {
	s.inTransaction = true
	return s.sendSuccess(nil)
}

// handleCommit handles the COMMIT message.
func (s *Session) handleCommit(data []byte) error {
	s.inTransaction = false
	return s.sendSuccess(nil)
}

// handleRollback handles the ROLLBACK message.
func (s *Session) handleRollback(data []byte) error {
	s.inTransaction = false
	return s.sendSuccess(nil)
}

// sendSuccess sends a SUCCESS response.
func (s *Session) sendSuccess(metadata map[string]any) error {
	// TODO: Proper PackStream encoding
	// For now, minimal success response
	
	msg := []byte{MsgSuccess}
	// Add encoded metadata
	
	return s.sendChunk(msg)
}

// sendFailure sends a FAILURE response.
func (s *Session) sendFailure(code, message string) error {
	msg := []byte{MsgFailure}
	// Add encoded failure info
	
	return s.sendChunk(msg)
}

// sendChunk sends a chunk to the client.
func (s *Session) sendChunk(data []byte) error {
	// Chunk header
	size := len(data)
	header := []byte{byte(size >> 8), byte(size)}
	
	if _, err := s.conn.Write(header); err != nil {
		return err
	}
	
	if _, err := s.conn.Write(data); err != nil {
		return err
	}
	
	// Chunk terminator
	terminator := []byte{0x00, 0x00}
	if _, err := s.conn.Write(terminator); err != nil {
		return err
	}
	
	return nil
}
