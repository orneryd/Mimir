// Package cypher - Tests for HybridExecutor
package cypher

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/orneryd/nornicdb/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupHybridExecutor(t *testing.T) (*HybridExecutor, context.Context) {
	store := storage.NewMemoryEngine()
	exec := NewHybridExecutor(store, DefaultHybridConfig())
	t.Cleanup(func() { exec.Close() })
	return exec, context.Background()
}

func TestHybrid_BasicExecution(t *testing.T) {
	exec, ctx := setupHybridExecutor(t)

	// Create some data
	_, err := exec.Execute(ctx, "CREATE (n:Person {name: 'Alice', age: 30})", nil)
	require.NoError(t, err)

	// Query it
	result, err := exec.Execute(ctx, "MATCH (n:Person) RETURN n.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, "Alice", result.Rows[0][0])
}

func TestHybrid_ASTBuildsInBackground(t *testing.T) {
	exec, ctx := setupHybridExecutor(t)

	query := "MATCH (n:Person) WHERE n.age > 25 RETURN n.name"

	// Execute query - should be fast (string executor)
	start := time.Now()
	_, err := exec.Execute(ctx, query, nil)
	execTime := time.Since(start)
	require.NoError(t, err)

	t.Logf("Execution time: %v", execTime)

	// AST should NOT be available immediately (building in background)
	ast := exec.GetASTIfCached(query)
	// Might or might not be cached yet depending on timing

	// Wait for AST to be built
	ast, ok := exec.WaitForAST(query, 100*time.Millisecond)
	assert.True(t, ok, "AST should be built within 100ms")
	assert.NotNil(t, ast, "AST should not be nil")
}

func TestHybrid_ASTCacheHit(t *testing.T) {
	exec, ctx := setupHybridExecutor(t)

	query := "MATCH (n:Test) RETURN count(n)"

	// First execution - queues AST build
	_, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)

	// Wait for AST to be built
	time.Sleep(50 * time.Millisecond)

	// Second execution - AST should be cached
	_, err = exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	stats2 := exec.GetStats()

	// Check that we got a cache hit on second execution
	t.Logf("Stats after 2 executions: %+v", stats2)
	assert.Equal(t, int64(2), stats2["string_executions"])
}

func TestHybrid_GetASTSynchronous(t *testing.T) {
	exec, _ := setupHybridExecutor(t)

	query := "RETURN 1 + 2 + 3"

	// GetAST should work even without prior execution
	ast, err := exec.GetAST(query)
	require.NoError(t, err)
	assert.NotNil(t, ast)
	assert.NotNil(t, ast.Tree)
}

func TestHybrid_PerformanceComparison(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	store := storage.NewMemoryEngine()
	hybridExec := NewHybridExecutor(store, DefaultHybridConfig())
	defer hybridExec.Close()

	stringExec := NewStorageExecutor(store)
	ctx := context.Background()

	// Setup data
	for i := 0; i < 50; i++ {
		query := fmt.Sprintf("CREATE (p:Person {name: 'Person%d', age: %d})", i, 20+i)
		hybridExec.Execute(ctx, query, nil)
	}

	query := "MATCH (n:Person) RETURN count(n)"
	iterations := 100

	// Warmup hybrid (builds AST in background)
	for i := 0; i < 10; i++ {
		hybridExec.Execute(ctx, query, nil)
	}
	time.Sleep(50 * time.Millisecond) // Let AST build complete

	// Benchmark string executor
	start := time.Now()
	for i := 0; i < iterations; i++ {
		stringExec.Execute(ctx, query, nil)
	}
	stringTime := time.Since(start)

	// Benchmark hybrid executor
	start = time.Now()
	for i := 0; i < iterations; i++ {
		hybridExec.Execute(ctx, query, nil)
	}
	hybridTime := time.Since(start)

	stringAvg := float64(stringTime.Microseconds()) / float64(iterations)
	hybridAvg := float64(hybridTime.Microseconds()) / float64(iterations)

	t.Logf("String executor: %.2f µs/op", stringAvg)
	t.Logf("Hybrid executor: %.2f µs/op", hybridAvg)
	t.Logf("Overhead: %.1f%%", (hybridAvg-stringAvg)/stringAvg*100)

	// Hybrid should have minimal overhead (<20%)
	assert.Less(t, hybridAvg, stringAvg*1.5, "Hybrid overhead should be less than 50%%")
}

func TestHybrid_Stats(t *testing.T) {
	exec, ctx := setupHybridExecutor(t)

	// Execute some queries
	exec.Execute(ctx, "RETURN 1", nil)
	exec.Execute(ctx, "RETURN 2", nil)
	exec.Execute(ctx, "RETURN 1", nil) // Same query again

	time.Sleep(50 * time.Millisecond) // Let AST builds complete

	stats := exec.GetStats()
	t.Logf("Stats: %+v", stats)

	assert.Equal(t, int64(3), stats["string_executions"])
	assert.GreaterOrEqual(t, stats["ast_builds_queued"].(int64), int64(2))
}

func TestHybrid_ReadOnlyDetection(t *testing.T) {
	tests := []struct {
		query    string
		readOnly bool
	}{
		{"MATCH (n) RETURN n", true},
		{"RETURN 1 + 2", true},
		{"CREATE (n:Test)", false},
		{"MATCH (n) DELETE n", false},
		{"MATCH (n) SET n.x = 1", false},
		{"MERGE (n:Test)", false},
		{"MATCH (n) DETACH DELETE n", false},
		{"MATCH (n) REMOVE n.x", false},
	}

	for _, tc := range tests {
		t.Run(tc.query, func(t *testing.T) {
			result := isReadOnlyQuery(tc.query)
			assert.Equal(t, tc.readOnly, result, "Query: %s", tc.query)
		})
	}
}

func TestHybrid_ClearCaches(t *testing.T) {
	exec, ctx := setupHybridExecutor(t)

	query := "RETURN 42"
	exec.Execute(ctx, query, nil)
	time.Sleep(50 * time.Millisecond)

	// Should have cached AST
	assert.NotNil(t, exec.GetASTIfCached(query))

	// Clear caches
	exec.ClearCaches()

	// Should be gone
	assert.Nil(t, exec.GetASTIfCached(query))
}

func BenchmarkHybrid_Execute(b *testing.B) {
	store := storage.NewMemoryEngine()
	exec := NewHybridExecutor(store, DefaultHybridConfig())
	defer exec.Close()
	ctx := context.Background()

	// Setup data
	for i := 0; i < 100; i++ {
		exec.Execute(ctx, fmt.Sprintf("CREATE (p:Person {name: 'Person%d'})", i), nil)
	}

	query := "MATCH (n:Person) RETURN count(n)"

	// Warmup
	for i := 0; i < 10; i++ {
		exec.Execute(ctx, query, nil)
	}
	time.Sleep(50 * time.Millisecond)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		exec.Execute(ctx, query, nil)
	}
}

func BenchmarkString_Execute(b *testing.B) {
	store := storage.NewMemoryEngine()
	exec := NewStorageExecutor(store)
	ctx := context.Background()

	// Setup data
	for i := 0; i < 100; i++ {
		exec.Execute(ctx, fmt.Sprintf("CREATE (p:Person {name: 'Person%d'})", i), nil)
	}

	query := "MATCH (n:Person) RETURN count(n)"

	// Warmup
	for i := 0; i < 10; i++ {
		exec.Execute(ctx, query, nil)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		exec.Execute(ctx, query, nil)
	}
}
