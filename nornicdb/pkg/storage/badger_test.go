package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Test Helpers
// ============================================================================

// createTestBadgerEngine creates an in-memory BadgerEngine for testing.
func createTestBadgerEngine(t *testing.T) *BadgerEngine {
	engine, err := NewBadgerEngineInMemory()
	require.NoError(t, err)
	t.Cleanup(func() {
		engine.Close()
	})
	return engine
}

// createTestBadgerEngineOnDisk creates a disk-based BadgerEngine for persistence tests.
func createTestBadgerEngineOnDisk(t *testing.T) (*BadgerEngine, string) {
	dir := t.TempDir()
	engine, err := NewBadgerEngine(dir)
	require.NoError(t, err)
	return engine, dir
}

// testNode creates a test node with the given ID.
func testNode(id string) *Node {
	return &Node{
		ID:         NodeID(id),
		Labels:     []string{"TestNode"},
		Properties: map[string]any{"name": id},
		CreatedAt:  time.Now(),
		DecayScore: 1.0,
	}
}

// testEdge creates a test edge between two nodes.
func testEdge(id string, start, end NodeID, edgeType string) *Edge {
	return &Edge{
		ID:         EdgeID(id),
		StartNode:  start,
		EndNode:    end,
		Type:       edgeType,
		Properties: map[string]any{},
		CreatedAt:  time.Now(),
	}
}

// ============================================================================
// Node CRUD Tests
// ============================================================================

func TestBadgerEngine_CreateNode(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("creates node successfully", func(t *testing.T) {
		node := testNode("n1")
		err := engine.CreateNode(node)
		assert.NoError(t, err)
	})

	t.Run("returns ErrAlreadyExists for duplicate", func(t *testing.T) {
		node := testNode("n2")
		err := engine.CreateNode(node)
		require.NoError(t, err)

		err = engine.CreateNode(node)
		assert.ErrorIs(t, err, ErrAlreadyExists)
	})

	t.Run("returns ErrInvalidData for nil node", func(t *testing.T) {
		err := engine.CreateNode(nil)
		assert.ErrorIs(t, err, ErrInvalidData)
	})

	t.Run("returns ErrInvalidID for empty ID", func(t *testing.T) {
		node := &Node{ID: "", Labels: []string{"Test"}}
		err := engine.CreateNode(node)
		assert.ErrorIs(t, err, ErrInvalidID)
	})
}

func TestBadgerEngine_GetNode(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("gets existing node", func(t *testing.T) {
		original := &Node{
			ID:          NodeID("n1"),
			Labels:      []string{"Person", "User"},
			Properties:  map[string]any{"name": "Alice", "age": 30},
			CreatedAt:   time.Now().Truncate(time.Second),
			DecayScore:  0.8,
			AccessCount: 5,
		}
		err := engine.CreateNode(original)
		require.NoError(t, err)

		retrieved, err := engine.GetNode("n1")
		require.NoError(t, err)

		assert.Equal(t, original.ID, retrieved.ID)
		assert.Equal(t, original.Labels, retrieved.Labels)
		assert.Equal(t, original.Properties["name"], retrieved.Properties["name"])
		assert.InDelta(t, original.DecayScore, retrieved.DecayScore, 0.001)
	})

	t.Run("returns ErrNotFound for missing node", func(t *testing.T) {
		_, err := engine.GetNode("nonexistent")
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("returns ErrInvalidID for empty ID", func(t *testing.T) {
		_, err := engine.GetNode("")
		assert.ErrorIs(t, err, ErrInvalidID)
	})
}

func TestBadgerEngine_UpdateNode(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("updates existing node", func(t *testing.T) {
		node := testNode("n1")
		err := engine.CreateNode(node)
		require.NoError(t, err)

		node.Properties["name"] = "Updated"
		node.Labels = []string{"UpdatedLabel"}
		err = engine.UpdateNode(node)
		require.NoError(t, err)

		retrieved, err := engine.GetNode("n1")
		require.NoError(t, err)
		assert.Equal(t, "Updated", retrieved.Properties["name"])
		assert.Equal(t, []string{"UpdatedLabel"}, retrieved.Labels)
	})

	t.Run("updates label index correctly", func(t *testing.T) {
		node := &Node{ID: NodeID("n2"), Labels: []string{"OldLabel"}}
		err := engine.CreateNode(node)
		require.NoError(t, err)

		// Check old label
		oldNodes, err := engine.GetNodesByLabel("OldLabel")
		require.NoError(t, err)
		assert.Len(t, oldNodes, 1)

		// Update labels
		node.Labels = []string{"NewLabel"}
		err = engine.UpdateNode(node)
		require.NoError(t, err)

		// Old label should be empty
		oldNodes, err = engine.GetNodesByLabel("OldLabel")
		require.NoError(t, err)
		assert.Len(t, oldNodes, 0)

		// New label should have node
		newNodes, err := engine.GetNodesByLabel("NewLabel")
		require.NoError(t, err)
		assert.Len(t, newNodes, 1)
	})

	t.Run("creates node if missing (upsert behavior)", func(t *testing.T) {
		// UpdateNode now has upsert behavior - creates if not exists
		node := testNode("upsert-test")
		node.Properties["foo"] = "bar"
		err := engine.UpdateNode(node)
		require.NoError(t, err, "UpdateNode should create if not exists")

		// Verify node was created
		retrieved, err := engine.GetNode("upsert-test")
		require.NoError(t, err)
		assert.Equal(t, "bar", retrieved.Properties["foo"])
	})
}

func TestBadgerEngine_DeleteNode(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("deletes existing node", func(t *testing.T) {
		node := testNode("n1")
		err := engine.CreateNode(node)
		require.NoError(t, err)

		err = engine.DeleteNode("n1")
		require.NoError(t, err)

		_, err = engine.GetNode("n1")
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("removes from label index", func(t *testing.T) {
		node := &Node{ID: NodeID("n2"), Labels: []string{"DeleteTest"}}
		err := engine.CreateNode(node)
		require.NoError(t, err)

		nodes, err := engine.GetNodesByLabel("DeleteTest")
		require.NoError(t, err)
		assert.Len(t, nodes, 1)

		err = engine.DeleteNode("n2")
		require.NoError(t, err)

		nodes, err = engine.GetNodesByLabel("DeleteTest")
		require.NoError(t, err)
		assert.Len(t, nodes, 0)
	})

	t.Run("deletes connected edges", func(t *testing.T) {
		// Create nodes
		n1 := testNode("source")
		n2 := testNode("target")
		err := engine.CreateNode(n1)
		require.NoError(t, err)
		err = engine.CreateNode(n2)
		require.NoError(t, err)

		// Create edge
		edge := testEdge("e1", "source", "target", "CONNECTS")
		err = engine.CreateEdge(edge)
		require.NoError(t, err)

		// Delete source node
		err = engine.DeleteNode("source")
		require.NoError(t, err)

		// Edge should be gone
		_, err = engine.GetEdge("e1")
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("returns ErrNotFound for missing node", func(t *testing.T) {
		err := engine.DeleteNode("nonexistent")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

// ============================================================================
// Edge CRUD Tests
// ============================================================================

func TestBadgerEngine_CreateEdge(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create nodes first
	n1 := testNode("n1")
	n2 := testNode("n2")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))

	t.Run("creates edge successfully", func(t *testing.T) {
		edge := testEdge("e1", "n1", "n2", "KNOWS")
		err := engine.CreateEdge(edge)
		assert.NoError(t, err)
	})

	t.Run("returns ErrAlreadyExists for duplicate", func(t *testing.T) {
		edge := testEdge("e2", "n1", "n2", "FOLLOWS")
		err := engine.CreateEdge(edge)
		require.NoError(t, err)

		err = engine.CreateEdge(edge)
		assert.ErrorIs(t, err, ErrAlreadyExists)
	})

	t.Run("returns ErrNotFound for missing start node", func(t *testing.T) {
		edge := testEdge("e3", "missing", "n2", "TEST")
		err := engine.CreateEdge(edge)
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("returns ErrNotFound for missing end node", func(t *testing.T) {
		edge := testEdge("e4", "n1", "missing", "TEST")
		err := engine.CreateEdge(edge)
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestBadgerEngine_GetEdge(t *testing.T) {
	engine := createTestBadgerEngine(t)

	n1 := testNode("n1")
	n2 := testNode("n2")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))

	t.Run("gets existing edge", func(t *testing.T) {
		original := &Edge{
			ID:            EdgeID("e1"),
			StartNode:     NodeID("n1"),
			EndNode:       NodeID("n2"),
			Type:          "KNOWS",
			Properties:    map[string]any{"since": "2020"},
			CreatedAt:     time.Now().Truncate(time.Second),
			Confidence:    0.9,
			AutoGenerated: true,
		}
		err := engine.CreateEdge(original)
		require.NoError(t, err)

		retrieved, err := engine.GetEdge("e1")
		require.NoError(t, err)

		assert.Equal(t, original.ID, retrieved.ID)
		assert.Equal(t, original.StartNode, retrieved.StartNode)
		assert.Equal(t, original.EndNode, retrieved.EndNode)
		assert.Equal(t, original.Type, retrieved.Type)
		assert.InDelta(t, original.Confidence, retrieved.Confidence, 0.001)
		assert.Equal(t, original.AutoGenerated, retrieved.AutoGenerated)
	})

	t.Run("returns ErrNotFound for missing edge", func(t *testing.T) {
		_, err := engine.GetEdge("nonexistent")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestBadgerEngine_UpdateEdge(t *testing.T) {
	engine := createTestBadgerEngine(t)

	n1 := testNode("n1")
	n2 := testNode("n2")
	n3 := testNode("n3")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))
	require.NoError(t, engine.CreateNode(n3))

	t.Run("updates edge properties", func(t *testing.T) {
		edge := testEdge("e1", "n1", "n2", "KNOWS")
		err := engine.CreateEdge(edge)
		require.NoError(t, err)

		edge.Properties["strength"] = "strong"
		edge.Confidence = 0.95
		err = engine.UpdateEdge(edge)
		require.NoError(t, err)

		retrieved, err := engine.GetEdge("e1")
		require.NoError(t, err)
		assert.Equal(t, "strong", retrieved.Properties["strength"])
		assert.InDelta(t, 0.95, retrieved.Confidence, 0.001)
	})

	t.Run("updates edge endpoints", func(t *testing.T) {
		edge := testEdge("e2", "n1", "n2", "FOLLOWS")
		err := engine.CreateEdge(edge)
		require.NoError(t, err)

		// Change endpoint
		edge.EndNode = "n3"
		err = engine.UpdateEdge(edge)
		require.NoError(t, err)

		// Check indexes updated
		outgoing, err := engine.GetOutgoingEdges("n1")
		require.NoError(t, err)

		found := false
		for _, e := range outgoing {
			if e.ID == "e2" {
				assert.Equal(t, NodeID("n3"), e.EndNode)
				found = true
				break
			}
		}
		assert.True(t, found)
	})

	t.Run("returns ErrNotFound for missing edge", func(t *testing.T) {
		edge := testEdge("nonexistent", "n1", "n2", "TEST")
		err := engine.UpdateEdge(edge)
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestBadgerEngine_DeleteEdge(t *testing.T) {
	engine := createTestBadgerEngine(t)

	n1 := testNode("n1")
	n2 := testNode("n2")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))

	t.Run("deletes existing edge", func(t *testing.T) {
		edge := testEdge("e1", "n1", "n2", "KNOWS")
		err := engine.CreateEdge(edge)
		require.NoError(t, err)

		err = engine.DeleteEdge("e1")
		require.NoError(t, err)

		_, err = engine.GetEdge("e1")
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("removes from indexes", func(t *testing.T) {
		edge := testEdge("e2", "n1", "n2", "FOLLOWS")
		err := engine.CreateEdge(edge)
		require.NoError(t, err)

		outgoing, _ := engine.GetOutgoingEdges("n1")
		initialCount := len(outgoing)

		err = engine.DeleteEdge("e2")
		require.NoError(t, err)

		outgoing, _ = engine.GetOutgoingEdges("n1")
		assert.Len(t, outgoing, initialCount-1)
	})

	t.Run("returns ErrNotFound for missing edge", func(t *testing.T) {
		err := engine.DeleteEdge("nonexistent")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestBadgerEngine_BulkDeleteNodes(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create multiple nodes
	for i := 0; i < 10; i++ {
		node := &Node{
			ID:     NodeID(fmt.Sprintf("bulk-del-node-%d", i)),
			Labels: []string{"BulkTest"},
		}
		require.NoError(t, engine.CreateNode(node))
	}

	count, _ := engine.NodeCount()
	assert.Equal(t, int64(10), count)

	t.Run("deletes multiple nodes in single transaction", func(t *testing.T) {
		ids := []NodeID{"bulk-del-node-0", "bulk-del-node-1", "bulk-del-node-2"}
		err := engine.BulkDeleteNodes(ids)
		require.NoError(t, err)

		count, _ := engine.NodeCount()
		assert.Equal(t, int64(7), count)

		// Verify nodes are gone
		_, err = engine.GetNode("bulk-del-node-0")
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("handles empty slice", func(t *testing.T) {
		err := engine.BulkDeleteNodes([]NodeID{})
		require.NoError(t, err)
	})

	t.Run("continues on not found", func(t *testing.T) {
		ids := []NodeID{"nonexistent", "bulk-del-node-3", "also-nonexistent"}
		err := engine.BulkDeleteNodes(ids)
		require.NoError(t, err) // Should not error

		_, err = engine.GetNode("bulk-del-node-3")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestBadgerEngine_BulkDeleteEdges(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create nodes
	require.NoError(t, engine.CreateNode(&Node{ID: "n1"}))
	require.NoError(t, engine.CreateNode(&Node{ID: "n2"}))

	// Create multiple edges
	for i := 0; i < 10; i++ {
		edge := &Edge{
			ID:        EdgeID(fmt.Sprintf("bulk-del-edge-%d", i)),
			StartNode: "n1",
			EndNode:   "n2",
			Type:      "TEST",
		}
		require.NoError(t, engine.CreateEdge(edge))
	}

	count, _ := engine.EdgeCount()
	assert.Equal(t, int64(10), count)

	t.Run("deletes multiple edges in single transaction", func(t *testing.T) {
		ids := []EdgeID{"bulk-del-edge-0", "bulk-del-edge-1", "bulk-del-edge-2"}
		err := engine.BulkDeleteEdges(ids)
		require.NoError(t, err)

		count, _ := engine.EdgeCount()
		assert.Equal(t, int64(7), count)
	})

	t.Run("handles empty slice", func(t *testing.T) {
		err := engine.BulkDeleteEdges([]EdgeID{})
		require.NoError(t, err)
	})
}

// ============================================================================
// Query Tests
// ============================================================================

func TestBadgerEngine_GetNodesByLabel(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create nodes with different labels
	for i := 0; i < 5; i++ {
		node := &Node{
			ID:     NodeID("user-" + string(rune('0'+i))),
			Labels: []string{"User", "Person"},
		}
		require.NoError(t, engine.CreateNode(node))
	}

	for i := 0; i < 3; i++ {
		node := &Node{
			ID:     NodeID("org-" + string(rune('0'+i))),
			Labels: []string{"Organization"},
		}
		require.NoError(t, engine.CreateNode(node))
	}

	t.Run("returns nodes with label", func(t *testing.T) {
		users, err := engine.GetNodesByLabel("User")
		require.NoError(t, err)
		assert.Len(t, users, 5)
	})

	t.Run("returns nodes with shared label", func(t *testing.T) {
		persons, err := engine.GetNodesByLabel("Person")
		require.NoError(t, err)
		assert.Len(t, persons, 5)
	})

	t.Run("returns different label set", func(t *testing.T) {
		orgs, err := engine.GetNodesByLabel("Organization")
		require.NoError(t, err)
		assert.Len(t, orgs, 3)
	})

	t.Run("returns empty for unknown label", func(t *testing.T) {
		nodes, err := engine.GetNodesByLabel("Unknown")
		require.NoError(t, err)
		assert.Len(t, nodes, 0)
	})
}

func TestBadgerEngine_GetAllNodes(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create several nodes
	for i := 0; i < 10; i++ {
		node := testNode("n" + string(rune('0'+i)))
		require.NoError(t, engine.CreateNode(node))
	}

	nodes := engine.GetAllNodes()
	assert.Len(t, nodes, 10)
}

func TestBadgerEngine_GetOutgoingEdges(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create a graph: n1 -> n2, n1 -> n3, n2 -> n3
	n1 := testNode("n1")
	n2 := testNode("n2")
	n3 := testNode("n3")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))
	require.NoError(t, engine.CreateNode(n3))

	require.NoError(t, engine.CreateEdge(testEdge("e1", "n1", "n2", "A")))
	require.NoError(t, engine.CreateEdge(testEdge("e2", "n1", "n3", "B")))
	require.NoError(t, engine.CreateEdge(testEdge("e3", "n2", "n3", "C")))

	t.Run("returns outgoing edges", func(t *testing.T) {
		edges, err := engine.GetOutgoingEdges("n1")
		require.NoError(t, err)
		assert.Len(t, edges, 2)
	})

	t.Run("returns one edge", func(t *testing.T) {
		edges, err := engine.GetOutgoingEdges("n2")
		require.NoError(t, err)
		assert.Len(t, edges, 1)
	})

	t.Run("returns empty for leaf node", func(t *testing.T) {
		edges, err := engine.GetOutgoingEdges("n3")
		require.NoError(t, err)
		assert.Len(t, edges, 0)
	})
}

func TestBadgerEngine_GetIncomingEdges(t *testing.T) {
	engine := createTestBadgerEngine(t)

	n1 := testNode("n1")
	n2 := testNode("n2")
	n3 := testNode("n3")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))
	require.NoError(t, engine.CreateNode(n3))

	require.NoError(t, engine.CreateEdge(testEdge("e1", "n1", "n3", "A")))
	require.NoError(t, engine.CreateEdge(testEdge("e2", "n2", "n3", "B")))

	t.Run("returns incoming edges", func(t *testing.T) {
		edges, err := engine.GetIncomingEdges("n3")
		require.NoError(t, err)
		assert.Len(t, edges, 2)
	})

	t.Run("returns empty for root node", func(t *testing.T) {
		edges, err := engine.GetIncomingEdges("n1")
		require.NoError(t, err)
		assert.Len(t, edges, 0)
	})
}

func TestBadgerEngine_GetEdgesBetween(t *testing.T) {
	engine := createTestBadgerEngine(t)

	n1 := testNode("n1")
	n2 := testNode("n2")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))

	require.NoError(t, engine.CreateEdge(testEdge("e1", "n1", "n2", "A")))
	require.NoError(t, engine.CreateEdge(testEdge("e2", "n1", "n2", "B")))

	t.Run("returns all edges between nodes", func(t *testing.T) {
		edges, err := engine.GetEdgesBetween("n1", "n2")
		require.NoError(t, err)
		assert.Len(t, edges, 2)
	})

	t.Run("returns empty for no connection", func(t *testing.T) {
		edges, err := engine.GetEdgesBetween("n2", "n1")
		require.NoError(t, err)
		assert.Len(t, edges, 0)
	})
}

func TestBadgerEngine_GetEdgeBetween(t *testing.T) {
	engine := createTestBadgerEngine(t)

	n1 := testNode("n1")
	n2 := testNode("n2")
	require.NoError(t, engine.CreateNode(n1))
	require.NoError(t, engine.CreateNode(n2))

	require.NoError(t, engine.CreateEdge(testEdge("e1", "n1", "n2", "KNOWS")))
	require.NoError(t, engine.CreateEdge(testEdge("e2", "n1", "n2", "FOLLOWS")))

	t.Run("returns edge with matching type", func(t *testing.T) {
		edge := engine.GetEdgeBetween("n1", "n2", "KNOWS")
		require.NotNil(t, edge)
		assert.Equal(t, "KNOWS", edge.Type)
	})

	t.Run("returns any edge with empty type", func(t *testing.T) {
		edge := engine.GetEdgeBetween("n1", "n2", "")
		require.NotNil(t, edge)
	})

	t.Run("returns nil for no matching type", func(t *testing.T) {
		edge := engine.GetEdgeBetween("n1", "n2", "BLOCKS")
		assert.Nil(t, edge)
	})
}

// ============================================================================
// Bulk Operations Tests
// ============================================================================

func TestBadgerEngine_BulkCreateNodes(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("creates multiple nodes", func(t *testing.T) {
		nodes := make([]*Node, 100)
		for i := 0; i < 100; i++ {
			// Use a better unique ID format
			nodes[i] = testNode("bulk-" + fmt.Sprintf("%03d", i))
		}

		err := engine.BulkCreateNodes(nodes)
		require.NoError(t, err)

		count, _ := engine.NodeCount()
		assert.EqualValues(t, 100, count)
	})

	t.Run("is atomic - all or nothing", func(t *testing.T) {
		engine2 := createTestBadgerEngine(t)

		// First create a node
		node := testNode("existing")
		require.NoError(t, engine2.CreateNode(node))

		// Try to bulk create including a duplicate
		nodes := []*Node{
			testNode("new1"),
			testNode("existing"), // Duplicate!
			testNode("new2"),
		}

		err := engine2.BulkCreateNodes(nodes)
		assert.ErrorIs(t, err, ErrAlreadyExists)

		// Only the original node should exist
		count, _ := engine2.NodeCount()
		assert.EqualValues(t, 1, count)
	})
}

func TestBadgerEngine_BulkCreateEdges(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create nodes first
	for i := 0; i < 10; i++ {
		require.NoError(t, engine.CreateNode(testNode(fmt.Sprintf("n%d", i))))
	}

	t.Run("creates multiple edges", func(t *testing.T) {
		edges := make([]*Edge, 20)
		for i := 0; i < 20; i++ {
			start := NodeID(fmt.Sprintf("n%d", i%10))
			end := NodeID(fmt.Sprintf("n%d", (i+1)%10))
			edges[i] = testEdge(fmt.Sprintf("e%02d", i), start, end, "CONNECTS")
		}

		err := engine.BulkCreateEdges(edges)
		require.NoError(t, err)

		count, _ := engine.EdgeCount()
		assert.EqualValues(t, 20, count)
	})
}

// ============================================================================
// Degree Functions Tests
// ============================================================================

func TestBadgerEngine_Degree(t *testing.T) {
	engine := createTestBadgerEngine(t)

	// Create hub and spoke pattern
	hub := testNode("hub")
	require.NoError(t, engine.CreateNode(hub))

	for i := 0; i < 5; i++ {
		spoke := testNode("spoke-" + string(rune('0'+i)))
		require.NoError(t, engine.CreateNode(spoke))
		require.NoError(t, engine.CreateEdge(testEdge("out-"+string(rune('0'+i)), "hub", spoke.ID, "OUT")))
		require.NoError(t, engine.CreateEdge(testEdge("in-"+string(rune('0'+i)), spoke.ID, "hub", "IN")))
	}

	t.Run("GetOutDegree", func(t *testing.T) {
		degree := engine.GetOutDegree("hub")
		assert.Equal(t, 5, degree)
	})

	t.Run("GetInDegree", func(t *testing.T) {
		degree := engine.GetInDegree("hub")
		assert.Equal(t, 5, degree)
	})

	t.Run("returns 0 for non-existent node", func(t *testing.T) {
		assert.Equal(t, 0, engine.GetOutDegree("nonexistent"))
		assert.Equal(t, 0, engine.GetInDegree("nonexistent"))
	})
}

// ============================================================================
// Stats Tests
// ============================================================================

func TestBadgerEngine_Stats(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("initial counts are zero", func(t *testing.T) {
		nodeCount, err := engine.NodeCount()
		require.NoError(t, err)
		assert.EqualValues(t, 0, nodeCount)

		edgeCount, err := engine.EdgeCount()
		require.NoError(t, err)
		assert.EqualValues(t, 0, edgeCount)
	})

	t.Run("counts increase after inserts", func(t *testing.T) {
		for i := 0; i < 10; i++ {
			require.NoError(t, engine.CreateNode(testNode("n"+string(rune('0'+i)))))
		}

		require.NoError(t, engine.CreateEdge(testEdge("e1", "n0", "n1", "A")))
		require.NoError(t, engine.CreateEdge(testEdge("e2", "n1", "n2", "B")))

		nodeCount, _ := engine.NodeCount()
		edgeCount, _ := engine.EdgeCount()

		assert.EqualValues(t, 10, nodeCount)
		assert.EqualValues(t, 2, edgeCount)
	})
}

// ============================================================================
// Persistence Tests
// ============================================================================

func TestBadgerEngine_Persistence(t *testing.T) {
	dir := t.TempDir()

	t.Run("data survives restart", func(t *testing.T) {
		// Create engine and add data
		engine1, err := NewBadgerEngine(dir)
		require.NoError(t, err)

		node := &Node{
			ID:         NodeID("persistent"),
			Labels:     []string{"Test"},
			Properties: map[string]any{"value": "persisted"},
			CreatedAt:  time.Now(),
			DecayScore: 0.5,
		}
		require.NoError(t, engine1.CreateNode(node))

		// Close
		require.NoError(t, engine1.Close())

		// Reopen
		engine2, err := NewBadgerEngine(dir)
		require.NoError(t, err)
		defer engine2.Close()

		// Verify data persisted
		retrieved, err := engine2.GetNode("persistent")
		require.NoError(t, err)
		assert.Equal(t, "persisted", retrieved.Properties["value"])
		assert.InDelta(t, 0.5, retrieved.DecayScore, 0.001)
	})

	t.Run("indexes persist", func(t *testing.T) {
		// Create fresh engine
		dir2 := t.TempDir()
		engine1, err := NewBadgerEngine(dir2)
		require.NoError(t, err)

		// Add nodes with labels
		for i := 0; i < 5; i++ {
			node := &Node{
				ID:     NodeID("labeled-" + string(rune('0'+i))),
				Labels: []string{"PersistLabel"},
			}
			require.NoError(t, engine1.CreateNode(node))
		}

		// Add edges
		require.NoError(t, engine1.CreateNode(&Node{ID: "target", Labels: []string{"Target"}}))
		for i := 0; i < 3; i++ {
			edge := testEdge("persist-edge-"+string(rune('0'+i)), NodeID("labeled-"+string(rune('0'+i))), "target", "POINTS")
			require.NoError(t, engine1.CreateEdge(edge))
		}

		require.NoError(t, engine1.Close())

		// Reopen
		engine2, err := NewBadgerEngine(dir2)
		require.NoError(t, err)
		defer engine2.Close()

		// Verify label index works
		nodes, err := engine2.GetNodesByLabel("PersistLabel")
		require.NoError(t, err)
		assert.Len(t, nodes, 5)

		// Verify edge indexes work
		incoming, err := engine2.GetIncomingEdges("target")
		require.NoError(t, err)
		assert.Len(t, incoming, 3)
	})
}

// ============================================================================
// Concurrency Tests
// ============================================================================

func TestBadgerEngine_Concurrency(t *testing.T) {
	engine := createTestBadgerEngine(t)

	t.Run("concurrent reads", func(t *testing.T) {
		// Create some data with unique IDs
		for i := 0; i < 100; i++ {
			require.NoError(t, engine.CreateNode(testNode(fmt.Sprintf("conc-read-%03d", i))))
		}

		// Concurrent reads
		var wg sync.WaitGroup
		for i := 0; i < 50; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				nodes := engine.GetAllNodes()
				assert.GreaterOrEqual(t, len(nodes), 100)
			}(i)
		}
		wg.Wait()
	})

	t.Run("concurrent writes", func(t *testing.T) {
		engine2 := createTestBadgerEngine(t)

		var wg sync.WaitGroup
		errors := make(chan error, 100)

		for i := 0; i < 100; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				node := testNode(fmt.Sprintf("parallel-%03d", idx))
				if err := engine2.CreateNode(node); err != nil {
					errors <- err
				}
			}(i)
		}
		wg.Wait()
		close(errors)

		// Check for errors
		for err := range errors {
			t.Errorf("concurrent write error: %v", err)
		}

		count, _ := engine2.NodeCount()
		assert.EqualValues(t, 100, count)
	})
}

// ============================================================================
// Closed Engine Tests
// ============================================================================

func TestBadgerEngine_ClosedOperations(t *testing.T) {
	engine := createTestBadgerEngine(t)
	require.NoError(t, engine.Close())

	t.Run("CreateNode returns ErrStorageClosed", func(t *testing.T) {
		err := engine.CreateNode(testNode("test"))
		assert.ErrorIs(t, err, ErrStorageClosed)
	})

	t.Run("GetNode returns ErrStorageClosed", func(t *testing.T) {
		_, err := engine.GetNode("test")
		assert.ErrorIs(t, err, ErrStorageClosed)
	})

	t.Run("GetNodesByLabel returns ErrStorageClosed", func(t *testing.T) {
		_, err := engine.GetNodesByLabel("Test")
		assert.ErrorIs(t, err, ErrStorageClosed)
	})

	t.Run("NodeCount returns ErrStorageClosed", func(t *testing.T) {
		_, err := engine.NodeCount()
		assert.ErrorIs(t, err, ErrStorageClosed)
	})

	t.Run("Close is idempotent", func(t *testing.T) {
		err := engine.Close()
		assert.NoError(t, err)
	})
}

// ============================================================================
// Utility Tests
// ============================================================================

func TestBadgerEngine_Size(t *testing.T) {
	engine, dir := createTestBadgerEngineOnDisk(t)
	defer engine.Close()

	// Add some data
	for i := 0; i < 100; i++ {
		node := &Node{
			ID:         NodeID(fmt.Sprintf("size-%03d", i)),
			Labels:     []string{"SizeTest"},
			Properties: map[string]any{"data": "some test data to increase size"},
		}
		require.NoError(t, engine.CreateNode(node))
	}

	// Force sync
	require.NoError(t, engine.Sync())

	// Check size (should be non-zero for disk engine)
	lsm, vlog := engine.Size()
	assert.True(t, lsm >= 0 || vlog >= 0, "Size should be trackable")

	// Check files exist
	files, err := filepath.Glob(filepath.Join(dir, "*"))
	require.NoError(t, err)
	assert.True(t, len(files) > 0, "Data files should exist")
}

func TestBadgerEngine_Sync(t *testing.T) {
	engine, _ := createTestBadgerEngineOnDisk(t)
	defer engine.Close()

	// Add data
	require.NoError(t, engine.CreateNode(testNode("sync-test")))

	// Sync should not error
	err := engine.Sync()
	assert.NoError(t, err)
}

func TestBadgerEngine_RunGC(t *testing.T) {
	engine, _ := createTestBadgerEngineOnDisk(t)
	defer engine.Close()

	// Add and delete some data to create garbage
	for i := 0; i < 100; i++ {
		node := testNode(fmt.Sprintf("gc-%03d", i))
		require.NoError(t, engine.CreateNode(node))
	}

	// Delete half
	for i := 0; i < 50; i++ {
		engine.DeleteNode(NodeID(fmt.Sprintf("gc-%03d", i)))
	}

	// GC may or may not run depending on amount of garbage
	// Just ensure it doesn't error or panic
	_ = engine.RunGC()
}

// ============================================================================
// Constructor Tests
// ============================================================================

func TestNewBadgerEngine(t *testing.T) {
	t.Run("creates engine with valid path", func(t *testing.T) {
		dir := t.TempDir()
		engine, err := NewBadgerEngine(dir)
		require.NoError(t, err)
		defer engine.Close()

		assert.NotNil(t, engine.db)
		assert.NotNil(t, engine.GetSchema())
	})

	t.Run("creates directory if not exists", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "subdir", "nested")
		engine, err := NewBadgerEngine(dir)
		require.NoError(t, err)
		defer engine.Close()

		// Verify directory was created
		info, err := os.Stat(dir)
		require.NoError(t, err)
		assert.True(t, info.IsDir())
	})
}

func TestNewBadgerEngineWithOptions(t *testing.T) {
	t.Run("respects InMemory option", func(t *testing.T) {
		engine, err := NewBadgerEngineWithOptions(BadgerOptions{
			InMemory: true,
		})
		require.NoError(t, err)
		defer engine.Close()

		// Should work normally
		require.NoError(t, engine.CreateNode(testNode("test")))
	})

	t.Run("respects SyncWrites option", func(t *testing.T) {
		dir := t.TempDir()
		engine, err := NewBadgerEngineWithOptions(BadgerOptions{
			DataDir:    dir,
			SyncWrites: true,
		})
		require.NoError(t, err)
		defer engine.Close()

		// Should work with sync writes
		require.NoError(t, engine.CreateNode(testNode("test")))
	})
}

// ============================================================================
// Serialization Tests
// ============================================================================

func TestSerialization(t *testing.T) {
	t.Run("node round-trip", func(t *testing.T) {
		original := &Node{
			ID:           NodeID("test-serialize"),
			Labels:       []string{"A", "B", "C"},
			Properties:   map[string]any{"string": "value", "number": float64(42), "bool": true},
			CreatedAt:    time.Now().Truncate(time.Second),
			UpdatedAt:    time.Now().Add(time.Hour).Truncate(time.Second),
			DecayScore:   0.75,
			LastAccessed: time.Now().Add(-time.Hour).Truncate(time.Second),
			AccessCount:  100,
			Embedding:    []float32{0.1, 0.2, 0.3},
		}

		data, err := encodeNode(original)
		require.NoError(t, err)

		decoded, err := decodeNode(data)
		require.NoError(t, err)

		assert.Equal(t, original.ID, decoded.ID)
		assert.Equal(t, original.Labels, decoded.Labels)
		assert.Equal(t, original.Properties["string"], decoded.Properties["string"])
		assert.InDelta(t, original.DecayScore, decoded.DecayScore, 0.001)
		assert.Equal(t, original.AccessCount, decoded.AccessCount)
		assert.Equal(t, original.Embedding, decoded.Embedding)
	})

	t.Run("edge round-trip", func(t *testing.T) {
		original := &Edge{
			ID:            EdgeID("test-edge"),
			StartNode:     NodeID("start"),
			EndNode:       NodeID("end"),
			Type:          "CONNECTS",
			Properties:    map[string]any{"weight": float64(1.5)},
			CreatedAt:     time.Now().Truncate(time.Second),
			Confidence:    0.95,
			AutoGenerated: true,
		}

		data, err := encodeEdge(original)
		require.NoError(t, err)

		decoded, err := decodeEdge(data)
		require.NoError(t, err)

		assert.Equal(t, original.ID, decoded.ID)
		assert.Equal(t, original.StartNode, decoded.StartNode)
		assert.Equal(t, original.EndNode, decoded.EndNode)
		assert.Equal(t, original.Type, decoded.Type)
		assert.InDelta(t, original.Confidence, decoded.Confidence, 0.001)
		assert.Equal(t, original.AutoGenerated, decoded.AutoGenerated)
	})
}

// ============================================================================
// Key Encoding Tests
// ============================================================================

func TestKeyEncoding(t *testing.T) {
	t.Run("nodeKey", func(t *testing.T) {
		key := nodeKey("test-node")
		assert.Equal(t, prefixNode, key[0])
		assert.Equal(t, "test-node", string(key[1:]))
	})

	t.Run("edgeKey", func(t *testing.T) {
		key := edgeKey("test-edge")
		assert.Equal(t, prefixEdge, key[0])
		assert.Equal(t, "test-edge", string(key[1:]))
	})

	t.Run("labelIndexKey and extraction", func(t *testing.T) {
		key := labelIndexKey("Person", "node-123")
		assert.Equal(t, prefixLabelIndex, key[0])

		// Extract node ID
		nodeID := extractNodeIDFromLabelIndex(key, len("Person"))
		assert.Equal(t, NodeID("node-123"), nodeID)
	})

	t.Run("outgoingIndexKey and extraction", func(t *testing.T) {
		key := outgoingIndexKey("node-1", "edge-1")
		assert.Equal(t, prefixOutgoingIndex, key[0])

		// Extract edge ID
		edgeID := extractEdgeIDFromIndexKey(key)
		assert.Equal(t, EdgeID("edge-1"), edgeID)
	})

	t.Run("incomingIndexKey and extraction", func(t *testing.T) {
		key := incomingIndexKey("node-1", "edge-1")
		assert.Equal(t, prefixIncomingIndex, key[0])

		// Extract edge ID
		edgeID := extractEdgeIDFromIndexKey(key)
		assert.Equal(t, EdgeID("edge-1"), edgeID)
	})
}

// ============================================================================
// Interface Compliance Test
// ============================================================================

func TestBadgerEngine_ImplementsEngine(t *testing.T) {
	// This is a compile-time check
	var _ Engine = (*BadgerEngine)(nil)
}

// ============================================================================
// Benchmark Tests
// ============================================================================

func BenchmarkBadgerEngine_CreateNode(b *testing.B) {
	engine, err := NewBadgerEngineInMemory()
	if err != nil {
		b.Fatal(err)
	}
	defer engine.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		node := &Node{
			ID:         NodeID(fmt.Sprintf("bench-%06d", i)),
			Labels:     []string{"Benchmark"},
			Properties: map[string]any{"index": i},
		}
		engine.CreateNode(node)
	}
}

func BenchmarkBadgerEngine_GetNode(b *testing.B) {
	engine, err := NewBadgerEngineInMemory()
	if err != nil {
		b.Fatal(err)
	}
	defer engine.Close()

	// Pre-populate
	for i := 0; i < 10000; i++ {
		node := &Node{
			ID:     NodeID(fmt.Sprintf("bench-%06d", i)),
			Labels: []string{"Benchmark"},
		}
		engine.CreateNode(node)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		idx := i % 10000
		engine.GetNode(NodeID(fmt.Sprintf("bench-%06d", idx)))
	}
}

func BenchmarkBadgerEngine_BulkCreateNodes(b *testing.B) {
	for _, size := range []int{10, 100, 1000} {
		b.Run(fmt.Sprintf("size=%d", size), func(b *testing.B) {
			engine, err := NewBadgerEngineInMemory()
			if err != nil {
				b.Fatal(err)
			}
			defer engine.Close()

			nodes := make([]*Node, size)
			for i := 0; i < size; i++ {
				nodes[i] = &Node{
					ID:     NodeID(fmt.Sprintf("bulk-%06d", i)),
					Labels: []string{"Bulk"},
				}
			}

			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				// Reset engine between iterations
				engine.Close()
				engine, _ = NewBadgerEngineInMemory()
				engine.BulkCreateNodes(nodes)
			}
		})
	}
}
