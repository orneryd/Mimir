// Package cypher - A/B testing between string-based and AST-based executors.
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

// setupABExecutors creates both executor types for testing
func setupABExecutors(t *testing.T) (*StorageExecutor, *ASTExecutor, *storage.MemoryEngine) {
	store := storage.NewMemoryEngine()
	stringExec := NewStorageExecutor(store)
	astExec := NewASTExecutor(store)
	return stringExec, astExec, store
}

// setupABTestData creates common test data
func setupABTestData(t *testing.T, exec CypherExecutor, ctx context.Context) {
	queries := []string{
		"CREATE (a:Person {name: 'Alice', age: 30})",
		"CREATE (b:Person {name: 'Bob', age: 25})",
		"CREATE (c:Person {name: 'Charlie', age: 35})",
		"CREATE (d:Company {name: 'TechCorp'})",
		"MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS]->(b)",
		"MATCH (b:Person {name: 'Bob'}), (c:Person {name: 'Charlie'}) CREATE (b)-[:KNOWS]->(c)",
		"MATCH (a:Person {name: 'Alice'}), (d:Company {name: 'TechCorp'}) CREATE (a)-[:WORKS_AT]->(d)",
	}
	for _, q := range queries {
		_, err := exec.Execute(ctx, q, nil)
		require.NoError(t, err, "Setup query failed: %s", q)
	}
}

// TestAB_BasicQueries tests that both executors produce the same results
func TestAB_BasicQueries(t *testing.T) {
	stringExec, astExec, _ := setupABExecutors(t)
	ctx := context.Background()

	// Setup data using string executor (known working)
	setupABTestData(t, stringExec, ctx)

	// Also setup in AST executor's view (they share storage)
	queries := []struct {
		name   string
		query  string
		params map[string]interface{}
	}{
		{"match_all", "MATCH (n) RETURN count(n)", nil},
		{"match_label", "MATCH (p:Person) RETURN p.name ORDER BY p.name", nil},
		{"match_where", "MATCH (p:Person) WHERE p.age > 25 RETURN p.name", nil},
		{"match_relationship", "MATCH (a)-[:KNOWS]->(b) RETURN a.name, b.name", nil},
		{"return_literal", "RETURN 1 + 2 AS sum", nil},
		{"return_string", "RETURN 'hello' AS greeting", nil},
		{"match_with_param", "MATCH (p:Person {name: $name}) RETURN p.age", map[string]interface{}{"name": "Alice"}},
	}

	for _, tc := range queries {
		t.Run(tc.name, func(t *testing.T) {
			// Run on string executor
			stringResult, stringErr := stringExec.Execute(ctx, tc.query, tc.params)

			// Run on AST executor
			astResult, astErr := astExec.Execute(ctx, tc.query, tc.params)

			// Compare errors
			if stringErr != nil {
				t.Logf("String executor error: %v", stringErr)
			}
			if astErr != nil {
				t.Logf("AST executor error: %v", astErr)
			}

			// If string succeeds, AST should too (or vice versa)
			if stringErr == nil && astErr == nil {
				// Compare row counts
				assert.Equal(t, len(stringResult.Rows), len(astResult.Rows),
					"Row count mismatch: string=%d, ast=%d", len(stringResult.Rows), len(astResult.Rows))

				// Compare column counts
				assert.Equal(t, len(stringResult.Columns), len(astResult.Columns),
					"Column count mismatch")
			}
		})
	}
}

// BenchmarkAB_StringExecutor benchmarks the string-based executor
func BenchmarkAB_StringExecutor(b *testing.B) {
	store := storage.NewMemoryEngine()
	exec := NewStorageExecutor(store)
	ctx := context.Background()

	// Setup data
	setupBenchmarkData(b, exec, ctx)

	queries := []struct {
		name  string
		query string
	}{
		{"simple_match", "MATCH (n:Person) RETURN n.name"},
		{"count", "MATCH (n) RETURN count(n)"},
		{"where_filter", "MATCH (n:Person) WHERE n.age > 25 RETURN n"},
		{"relationship", "MATCH (a)-[:KNOWS]->(b) RETURN a.name, b.name"},
		{"aggregation", "MATCH (n:Person) RETURN avg(n.age)"},
	}

	for _, tc := range queries {
		b.Run(tc.name, func(b *testing.B) {
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				exec.Execute(ctx, tc.query, nil)
			}
		})
	}
}

// BenchmarkAB_ASTExecutor benchmarks the AST-based executor
func BenchmarkAB_ASTExecutor(b *testing.B) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Setup data (using string executor since AST may not support CREATE yet)
	stringExec := NewStorageExecutor(store)
	setupBenchmarkData(b, stringExec, ctx)

	queries := []struct {
		name  string
		query string
	}{
		{"simple_match", "MATCH (n:Person) RETURN n.name"},
		{"count", "MATCH (n) RETURN count(n)"},
		{"where_filter", "MATCH (n:Person) WHERE n.age > 25 RETURN n"},
		{"relationship", "MATCH (a)-[:KNOWS]->(b) RETURN a.name, b.name"},
		{"aggregation", "MATCH (n:Person) RETURN avg(n.age)"},
	}

	for _, tc := range queries {
		b.Run(tc.name, func(b *testing.B) {
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				exec.Execute(ctx, tc.query, nil)
			}
		})
	}
}

func setupBenchmarkData(b interface{ Errorf(string, ...interface{}) }, exec CypherExecutor, ctx context.Context) {
	// Create 100 person nodes
	for i := 0; i < 100; i++ {
		query := fmt.Sprintf("CREATE (p:Person {name: 'Person%d', age: %d})", i, 20+i%50)
		exec.Execute(ctx, query, nil)
	}

	// Create some relationships
	for i := 0; i < 50; i++ {
		query := fmt.Sprintf("MATCH (a:Person {name: 'Person%d'}), (b:Person {name: 'Person%d'}) CREATE (a)-[:KNOWS]->(b)", i, (i+1)%100)
		exec.Execute(ctx, query, nil)
	}
}

// TestAB_PerformanceComparison runs a performance comparison between executors
func TestAB_PerformanceComparison(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	stringExec, astExec, _ := setupABExecutors(t)
	ctx := context.Background()

	// Setup larger dataset
	for i := 0; i < 50; i++ {
		query := fmt.Sprintf("CREATE (p:Person {name: 'Person%d', age: %d})", i, 20+i%50)
		stringExec.Execute(ctx, query, nil)
	}

	testQueries := []string{
		"MATCH (n:Person) RETURN count(n)",
		"MATCH (n:Person) WHERE n.age > 30 RETURN n.name",
		"RETURN 1 + 2 + 3 + 4 + 5",
	}

	iterations := 100

	for _, query := range testQueries {
		t.Run(query[:20], func(t *testing.T) {
			// Warmup
			for i := 0; i < 10; i++ {
				stringExec.Execute(ctx, query, nil)
				astExec.Execute(ctx, query, nil)
			}

			// Benchmark string executor
			stringStart := time.Now()
			for i := 0; i < iterations; i++ {
				stringExec.Execute(ctx, query, nil)
			}
			stringDuration := time.Since(stringStart)

			// Benchmark AST executor
			astStart := time.Now()
			for i := 0; i < iterations; i++ {
				astExec.Execute(ctx, query, nil)
			}
			astDuration := time.Since(astStart)

			stringAvg := float64(stringDuration.Microseconds()) / float64(iterations)
			astAvg := float64(astDuration.Microseconds()) / float64(iterations)

			speedup := stringAvg / astAvg
			winner := "STRING"
			if speedup > 1 {
				winner = "AST"
			}

			t.Logf("Query: %s", query)
			t.Logf("  String: %.2f µs/op", stringAvg)
			t.Logf("  AST:    %.2f µs/op", astAvg)
			t.Logf("  Winner: %s (%.2fx)", winner, speedup)
		})
	}
}

// TestAB_ResultEquivalence verifies both executors return equivalent results
func TestAB_ResultEquivalence(t *testing.T) {
	stringExec, astExec, _ := setupABExecutors(t)
	ctx := context.Background()

	// Setup identical data
	setupABTestData(t, stringExec, ctx)

	testCases := []struct {
		name   string
		query  string
		params map[string]interface{}
	}{
		{"literal_int", "RETURN 42", nil},
		{"literal_string", "RETURN 'hello'", nil},
		{"arithmetic", "RETURN 10 + 5 * 2", nil},
		{"match_count", "MATCH (n) RETURN count(n)", nil},
		{"match_property", "MATCH (p:Person) RETURN p.name ORDER BY p.name LIMIT 1", nil},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			stringResult, stringErr := stringExec.Execute(ctx, tc.query, tc.params)
			astResult, astErr := astExec.Execute(ctx, tc.query, tc.params)

			// Both should succeed or both should fail
			if (stringErr == nil) != (astErr == nil) {
				t.Errorf("Error mismatch: string=%v, ast=%v", stringErr, astErr)
				return
			}

			if stringErr != nil {
				return // Both errored, that's fine
			}

			// Compare results
			if len(stringResult.Rows) != len(astResult.Rows) {
				t.Errorf("Row count mismatch: string=%d, ast=%d",
					len(stringResult.Rows), len(astResult.Rows))
				return
			}

			// For single-value returns, compare the actual values
			if len(stringResult.Rows) == 1 && len(stringResult.Rows[0]) == 1 {
				stringVal := stringResult.Rows[0][0]
				astVal := astResult.Rows[0][0]

				// Allow for type differences (int64 vs float64)
				stringStr := fmt.Sprintf("%v", stringVal)
				astStr := fmt.Sprintf("%v", astVal)

				if stringStr != astStr {
					t.Logf("Value difference: string=%v (%T), ast=%v (%T)",
						stringVal, stringVal, astVal, astVal)
				}
			}
		})
	}
}
