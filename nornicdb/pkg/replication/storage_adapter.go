// Package replication provides distributed replication for NornicDB.
package replication

import (
	"encoding/json"
	"fmt"
	"io"
	"sync/atomic"

	"github.com/orneryd/nornicdb/pkg/storage"
)

// StorageAdapter bridges the replication.Storage interface to storage.Engine.
// It translates replication commands into storage operations and maintains WAL state.
type StorageAdapter struct {
	engine storage.Engine

	// WAL position tracking (in-memory for now, production would use persistent WAL)
	walPosition atomic.Uint64
	walEntries  []WALEntry
}

// NewStorageAdapter creates a new storage adapter wrapping the given engine.
func NewStorageAdapter(engine storage.Engine) *StorageAdapter {
	return &StorageAdapter{
		engine:     engine,
		walEntries: make([]WALEntry, 0),
	}
}

// ApplyCommand applies a replicated command to storage.
func (a *StorageAdapter) ApplyCommand(cmd *Command) error {
	if cmd == nil {
		return fmt.Errorf("nil command")
	}

	// Record in WAL
	pos := a.walPosition.Add(1)
	entry := WALEntry{
		Position:  pos,
		Timestamp: cmd.Timestamp.UnixNano(),
		Command:   cmd,
	}
	a.walEntries = append(a.walEntries, entry)

	// Execute the command
	switch cmd.Type {
	case CmdCreateNode:
		return a.applyCreateNode(cmd.Data)
	case CmdUpdateNode:
		return a.applyUpdateNode(cmd.Data)
	case CmdDeleteNode:
		return a.applyDeleteNode(cmd.Data)
	case CmdCreateEdge:
		return a.applyCreateEdge(cmd.Data)
	case CmdDeleteEdge:
		return a.applyDeleteEdge(cmd.Data)
	case CmdSetProperty:
		return a.applySetProperty(cmd.Data)
	case CmdBatchWrite:
		return a.applyBatchWrite(cmd.Data)
	case CmdCypher:
		return a.applyCypher(cmd.Data)
	default:
		return fmt.Errorf("unknown command type: %d", cmd.Type)
	}
}

// applyCreateNode creates a node from command data.
func (a *StorageAdapter) applyCreateNode(data []byte) error {
	var node storage.Node
	if err := json.Unmarshal(data, &node); err != nil {
		return fmt.Errorf("unmarshal node: %w", err)
	}
	return a.engine.CreateNode(&node)
}

// applyUpdateNode updates a node from command data.
func (a *StorageAdapter) applyUpdateNode(data []byte) error {
	var node storage.Node
	if err := json.Unmarshal(data, &node); err != nil {
		return fmt.Errorf("unmarshal node: %w", err)
	}
	return a.engine.UpdateNode(&node)
}

// applyDeleteNode deletes a node.
func (a *StorageAdapter) applyDeleteNode(data []byte) error {
	nodeID := string(data)
	return a.engine.DeleteNode(storage.NodeID(nodeID))
}

// applyCreateEdge creates an edge from command data.
func (a *StorageAdapter) applyCreateEdge(data []byte) error {
	var edge storage.Edge
	if err := json.Unmarshal(data, &edge); err != nil {
		return fmt.Errorf("unmarshal edge: %w", err)
	}
	return a.engine.CreateEdge(&edge)
}

// applyDeleteEdge deletes an edge.
func (a *StorageAdapter) applyDeleteEdge(data []byte) error {
	var req struct {
		EdgeID string `json:"edge_id"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return fmt.Errorf("unmarshal delete edge request: %w", err)
	}
	return a.engine.DeleteEdge(storage.EdgeID(req.EdgeID))
}

// applySetProperty sets a property on a node.
func (a *StorageAdapter) applySetProperty(data []byte) error {
	var req struct {
		NodeID string      `json:"node_id"`
		Key    string      `json:"key"`
		Value  interface{} `json:"value"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return fmt.Errorf("unmarshal set property request: %w", err)
	}
	
	// Get node, update property, save
	node, err := a.engine.GetNode(storage.NodeID(req.NodeID))
	if err != nil {
		return err
	}
	if node.Properties == nil {
		node.Properties = make(map[string]interface{})
	}
	node.Properties[req.Key] = req.Value
	return a.engine.UpdateNode(node)
}

// applyBatchWrite applies a batch of operations.
func (a *StorageAdapter) applyBatchWrite(data []byte) error {
	var batch struct {
		Nodes []*storage.Node `json:"nodes"`
		Edges []*storage.Edge `json:"edges"`
	}
	if err := json.Unmarshal(data, &batch); err != nil {
		return fmt.Errorf("unmarshal batch: %w", err)
	}

	for _, node := range batch.Nodes {
		if err := a.engine.CreateNode(node); err != nil {
			return err
		}
	}
	for _, edge := range batch.Edges {
		if err := a.engine.CreateEdge(edge); err != nil {
			return err
		}
	}
	return nil
}

// applyCypher executes a Cypher command (for write queries).
func (a *StorageAdapter) applyCypher(data []byte) error {
	// Cypher execution would need the executor - for now, just store the command
	// In production, this would be handled by routing Cypher writes through replication
	return nil
}

// GetWALPosition returns the current WAL position.
func (a *StorageAdapter) GetWALPosition() (uint64, error) {
	return a.walPosition.Load(), nil
}

// GetWALEntries returns WAL entries starting from the given position.
func (a *StorageAdapter) GetWALEntries(fromPosition uint64, maxEntries int) ([]*WALEntry, error) {
	var entries []*WALEntry
	
	for i := range a.walEntries {
		if a.walEntries[i].Position > fromPosition {
			entries = append(entries, &a.walEntries[i])
			if len(entries) >= maxEntries {
				break
			}
		}
	}
	
	return entries, nil
}

// WriteSnapshot writes a full snapshot to the given writer.
func (a *StorageAdapter) WriteSnapshot(w SnapshotWriter) error {
	// Get all nodes and edges
	nodes, err := a.engine.AllNodes()
	if err != nil {
		return fmt.Errorf("get all nodes: %w", err)
	}
	
	edges, err := a.engine.AllEdges()
	if err != nil {
		return fmt.Errorf("get all edges: %w", err)
	}

	snapshot := struct {
		WALPosition uint64          `json:"wal_position"`
		Nodes       []*storage.Node `json:"nodes"`
		Edges       []*storage.Edge `json:"edges"`
	}{
		WALPosition: a.walPosition.Load(),
		Nodes:       nodes,
		Edges:       edges,
	}

	data, err := json.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("marshal snapshot: %w", err)
	}

	_, err = w.Write(data)
	return err
}

// RestoreSnapshot restores state from a snapshot.
func (a *StorageAdapter) RestoreSnapshot(r SnapshotReader) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("read snapshot: %w", err)
	}

	var snapshot struct {
		WALPosition uint64          `json:"wal_position"`
		Nodes       []*storage.Node `json:"nodes"`
		Edges       []*storage.Edge `json:"edges"`
	}

	if err := json.Unmarshal(data, &snapshot); err != nil {
		return fmt.Errorf("unmarshal snapshot: %w", err)
	}

	// Restore nodes
	for _, node := range snapshot.Nodes {
		if err := a.engine.CreateNode(node); err != nil {
			return fmt.Errorf("restore node: %w", err)
		}
	}

	// Restore edges
	for _, edge := range snapshot.Edges {
		if err := a.engine.CreateEdge(edge); err != nil {
			return fmt.Errorf("restore edge: %w", err)
		}
	}

	// Restore WAL position
	a.walPosition.Store(snapshot.WALPosition)

	return nil
}

// Engine returns the underlying storage engine.
func (a *StorageAdapter) Engine() storage.Engine {
	return a.engine
}

// Verify StorageAdapter implements Storage interface.
var _ Storage = (*StorageAdapter)(nil)
