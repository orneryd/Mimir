// Package storage provides storage implementations.
// This file contains Neo4j JSON import/export functionality.
package storage

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LoadFromNeo4jJSON loads nodes and edges from Neo4j JSON export format.
// It reads both nodes.json and relationships.json from the given directory.
// This enables loading Neo4j databases exported via `apoc.export.json.all()`.
func LoadFromNeo4jJSON(engine Engine, dir string) error {
	// Load nodes first (edges need nodes to exist)
	nodesPath := filepath.Join(dir, "nodes.json")
	if err := loadNodesFile(engine, nodesPath); err != nil {
		return fmt.Errorf("loading nodes: %w", err)
	}

	// Load relationships
	relsPath := filepath.Join(dir, "relationships.json")
	if err := loadRelationshipsFile(engine, relsPath); err != nil {
		return fmt.Errorf("loading relationships: %w", err)
	}

	return nil
}

// LoadFromNeo4jExport loads data from a combined Neo4j export file.
// This matches the format produced by ToNeo4jExport().
func LoadFromNeo4jExport(engine Engine, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("opening file: %w", err)
	}
	defer file.Close()

	var export Neo4jExport
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&export); err != nil {
		return fmt.Errorf("decoding JSON: %w", err)
	}

	nodes, edges := FromNeo4jExport(&export)

	// Bulk insert for efficiency
	if err := engine.BulkCreateNodes(nodes); err != nil {
		return fmt.Errorf("creating nodes: %w", err)
	}

	if err := engine.BulkCreateEdges(edges); err != nil {
		return fmt.Errorf("creating edges: %w", err)
	}

	return nil
}

// SaveToNeo4jExport exports all data to a Neo4j-compatible JSON file.
func SaveToNeo4jExport(engine Engine, path string) error {
	// Collect all nodes
	var allNodes []*Node
	// We need to iterate - for MemoryEngine we can do this through labels
	// For a generic approach, we'd need an AllNodes() method
	// For now, we'll add that method via a type assertion or add to interface

	// Try to get all nodes via memory engine direct access
	if mem, ok := engine.(*MemoryEngine); ok {
		mem.mu.RLock()
		for _, node := range mem.nodes {
			allNodes = append(allNodes, mem.copyNode(node))
		}
		mem.mu.RUnlock()
	} else {
		return fmt.Errorf("SaveToNeo4jExport: engine type %T does not support full export", engine)
	}

	// Collect all edges
	var allEdges []*Edge
	if mem, ok := engine.(*MemoryEngine); ok {
		mem.mu.RLock()
		for _, edge := range mem.edges {
			allEdges = append(allEdges, mem.copyEdge(edge))
		}
		mem.mu.RUnlock()
	}

	export := ToNeo4jExport(allNodes, allEdges)

	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating file: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(export); err != nil {
		return fmt.Errorf("encoding JSON: %w", err)
	}

	return nil
}

// loadNodesFile loads nodes from a Neo4j JSON lines file.
// Each line is a JSON object representing a node.
func loadNodesFile(engine Engine, path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Optional file
		}
		return err
	}
	defer file.Close()

	return loadNodesFromReader(engine, file)
}

// loadNodesFromReader loads nodes from a reader (for testing).
func loadNodesFromReader(engine Engine, r io.Reader) error {
	scanner := bufio.NewScanner(r)
	// Increase buffer for large lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	var nodes []*Node

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var neo4jNode Neo4jNode
		if err := json.Unmarshal(line, &neo4jNode); err != nil {
			return fmt.Errorf("parsing node JSON: %w", err)
		}

		node, err := nodeFromNeo4j(&neo4jNode)
		if err != nil {
			return fmt.Errorf("converting node: %w", err)
		}

		nodes = append(nodes, node)
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanning file: %w", err)
	}

	if len(nodes) > 0 {
		return engine.BulkCreateNodes(nodes)
	}

	return nil
}

// loadRelationshipsFile loads relationships from a Neo4j JSON lines file.
func loadRelationshipsFile(engine Engine, path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Optional file
		}
		return err
	}
	defer file.Close()

	return loadRelationshipsFromReader(engine, file)
}

// loadRelationshipsFromReader loads relationships from a reader.
func loadRelationshipsFromReader(engine Engine, r io.Reader) error {
	scanner := bufio.NewScanner(r)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	var edges []*Edge

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var neo4jRel Neo4jRelationship
		if err := json.Unmarshal(line, &neo4jRel); err != nil {
			return fmt.Errorf("parsing relationship JSON: %w", err)
		}

		edge, err := edgeFromNeo4j(&neo4jRel)
		if err != nil {
			return fmt.Errorf("converting relationship: %w", err)
		}

		edges = append(edges, edge)
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanning file: %w", err)
	}

	if len(edges) > 0 {
		return engine.BulkCreateEdges(edges)
	}

	return nil
}

// nodeFromNeo4j converts a Neo4j JSON node to our Node type.
func nodeFromNeo4j(n *Neo4jNode) (*Node, error) {
	if n.ID == "" {
		return nil, ErrInvalidID
	}

	props := make(map[string]any)
	for k, v := range n.Properties {
		props[k] = v
	}

	node := &Node{
		ID:         NodeID(n.ID),
		Labels:     n.Labels,
		Properties: props,
	}

	// Extract internal properties
	node.ExtractInternalProperties()

	return node, nil
}

// edgeFromNeo4j converts a Neo4j JSON relationship to our Edge type.
func edgeFromNeo4j(r *Neo4jRelationship) (*Edge, error) {
	if r.ID == "" {
		return nil, ErrInvalidID
	}

	props := make(map[string]any)
	for k, v := range r.Properties {
		props[k] = v
	}

	edge := &Edge{
		ID:         EdgeID(r.ID),
		StartNode:  NodeID(r.GetStartID()),
		EndNode:    NodeID(r.GetEndID()),
		Type:       r.Type,
		Properties: props,
	}

	// Extract confidence if present
	if conf, ok := props["_confidence"].(float64); ok {
		edge.Confidence = conf
		delete(edge.Properties, "_confidence")
	}

	// Extract auto-generated flag if present
	if auto, ok := props["_autoGenerated"].(bool); ok {
		edge.AutoGenerated = auto
		delete(edge.Properties, "_autoGenerated")
	}

	return edge, nil
}

// ExportableEngine extends Engine with export capabilities.
type ExportableEngine interface {
	Engine
	AllNodes() ([]*Node, error)
	AllEdges() ([]*Edge, error)
}

// AllNodes returns all nodes in the memory engine.
func (m *MemoryEngine) AllNodes() ([]*Node, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.closed {
		return nil, ErrStorageClosed
	}

	nodes := make([]*Node, 0, len(m.nodes))
	for _, node := range m.nodes {
		nodes = append(nodes, m.copyNode(node))
	}

	return nodes, nil
}

// AllEdges returns all edges in the memory engine.
func (m *MemoryEngine) AllEdges() ([]*Edge, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.closed {
		return nil, ErrStorageClosed
	}

	edges := make([]*Edge, 0, len(m.edges))
	for _, edge := range m.edges {
		edges = append(edges, m.copyEdge(edge))
	}

	return edges, nil
}

// GenericSaveToNeo4jExport works with any ExportableEngine.
func GenericSaveToNeo4jExport(engine ExportableEngine, path string) error {
	nodes, err := engine.AllNodes()
	if err != nil {
		return fmt.Errorf("getting nodes: %w", err)
	}

	edges, err := engine.AllEdges()
	if err != nil {
		return fmt.Errorf("getting edges: %w", err)
	}

	export := ToNeo4jExport(nodes, edges)

	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating file: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(export); err != nil {
		return fmt.Errorf("encoding JSON: %w", err)
	}

	return nil
}

// Verify MemoryEngine implements ExportableEngine
var _ ExportableEngine = (*MemoryEngine)(nil)
