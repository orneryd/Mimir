package cypher

import (
	"context"
	"testing"

	"github.com/orneryd/nornicdb/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestASTExecutor_BasicCreate(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Create a node
	result, err := exec.Execute(ctx, "CREATE (n:Person {name: 'Alice', age: 30})", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Stats.NodesCreated)

	// Match the node
	result, err = exec.Execute(ctx, "MATCH (n:Person) RETURN n.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, "Alice", result.Rows[0][0])
}

func TestASTExecutor_CreateWithRelationship(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Create nodes with relationship
	result, err := exec.Execute(ctx, "CREATE (a:Person {name: 'Alice'})-[:KNOWS]->(b:Person {name: 'Bob'})", nil)
	require.NoError(t, err)
	assert.Equal(t, 2, result.Stats.NodesCreated)
	assert.Equal(t, 1, result.Stats.RelationshipsCreated)
}

func TestASTExecutor_MatchAndReturn(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Setup data
	exec.Execute(ctx, "CREATE (n:Person {name: 'Alice', age: 30})", nil)
	exec.Execute(ctx, "CREATE (n:Person {name: 'Bob', age: 25})", nil)

	// Match all
	result, err := exec.Execute(ctx, "MATCH (n:Person) RETURN n.name, n.age", nil)
	require.NoError(t, err)
	assert.Equal(t, 2, len(result.Rows))
}

func TestASTExecutor_Delete(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Create
	exec.Execute(ctx, "CREATE (n:Person {name: 'Alice'})", nil)
	
	// Match to verify
	result, err := exec.Execute(ctx, "MATCH (n:Person) RETURN n", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))

	// Delete
	result, err = exec.Execute(ctx, "MATCH (n:Person) DELETE n", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Stats.NodesDeleted)

	// Verify deleted
	result, err = exec.Execute(ctx, "MATCH (n:Person) RETURN n", nil)
	require.NoError(t, err)
	assert.Equal(t, 0, len(result.Rows))
}

func TestASTExecutor_Set(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Create
	exec.Execute(ctx, "CREATE (n:Person {name: 'Alice'})", nil)

	// Set property
	result, err := exec.Execute(ctx, "MATCH (n:Person) SET n.age = 30", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Stats.PropertiesSet)

	// Verify
	result, err = exec.Execute(ctx, "MATCH (n:Person) RETURN n.age", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, int64(30), result.Rows[0][0])
}

func TestASTExecutor_Merge(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// MERGE creates when not exists
	result, err := exec.Execute(ctx, "MERGE (n:Person {name: 'Alice'})", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Stats.NodesCreated)

	// MERGE again - should not create
	result, err = exec.Execute(ctx, "MERGE (n:Person {name: 'Alice'})", nil)
	require.NoError(t, err)
	assert.Equal(t, 0, result.Stats.NodesCreated)
}

func TestASTExecutor_RelationshipMatch(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Create relationship
	exec.Execute(ctx, "CREATE (a:Person {name: 'Alice'})-[:KNOWS]->(b:Person {name: 'Bob'})", nil)

	// Match relationship
	result, err := exec.Execute(ctx, "MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name, b.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, "Alice", result.Rows[0][0])
	assert.Equal(t, "Bob", result.Rows[0][1])
}

func TestASTExecutor_CallDbLabels(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Create some nodes with labels
	exec.Execute(ctx, "CREATE (n:Person {name: 'Alice'})", nil)
	exec.Execute(ctx, "CREATE (n:Company {name: 'Acme'})", nil)

	// Call db.labels()
	result, err := exec.Execute(ctx, "CALL db.labels()", nil)
	require.NoError(t, err)
	assert.Equal(t, []string{"label"}, result.Columns)
	assert.Equal(t, 2, len(result.Rows))
}
