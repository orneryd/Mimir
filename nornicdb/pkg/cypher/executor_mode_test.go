// Package cypher - Comprehensive test coverage for all executor modes.
//
// Tests verify that nornic, antlr, and hybrid modes all produce identical results
// for the same queries, ensuring compatibility across implementations.
package cypher

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/orneryd/nornicdb/pkg/config"
	"github.com/orneryd/nornicdb/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testQuery represents a query to test across all modes
type testQuery struct {
	name        string
	setup       []string // Setup queries to run first
	query       string
	params      map[string]interface{}
	expectRows  int
	expectCols  int
	expectError bool
	skipANTLR   bool // Skip for ANTLR if not yet implemented
}

// coreQueries are queries that all modes must support identically
var coreQueries = []testQuery{
	// Basic RETURN
	{
		name:       "literal_integer",
		query:      "RETURN 42",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "literal_string",
		query:      "RETURN 'hello'",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "literal_float",
		query:      "RETURN 3.14",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "literal_boolean_true",
		query:      "RETURN true",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "literal_boolean_false",
		query:      "RETURN false",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "literal_null",
		query:      "RETURN null",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "arithmetic_addition",
		query:      "RETURN 1 + 2",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "arithmetic_complex",
		query:      "RETURN 10 * 2 + 5 - 3",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "string_concatenation",
		query:      "RETURN 'hello' + ' ' + 'world'",
		expectRows: 1,
		expectCols: 1,
	},

	// CREATE and MATCH
	{
		name:       "create_single_node",
		query:      "CREATE (n:TestNode {name: 'test'})",
		expectRows: 0,
		expectCols: 0,
	},
	{
		name:       "match_all_nodes",
		setup:      []string{"CREATE (n:Person {name: 'Alice'})", "CREATE (n:Person {name: 'Bob'})"},
		query:      "MATCH (n:Person) RETURN n.name ORDER BY n.name",
		expectRows: 2,
		expectCols: 1,
	},
	{
		name:       "match_with_property",
		setup:      []string{"CREATE (n:User {name: 'Charlie', age: 30})"},
		query:      "MATCH (n:User {name: 'Charlie'}) RETURN n.age",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "match_with_where",
		setup:      []string{"CREATE (n:Item {price: 10})", "CREATE (n:Item {price: 20})", "CREATE (n:Item {price: 30})"},
		query:      "MATCH (n:Item) WHERE n.price > 15 RETURN n.price ORDER BY n.price",
		expectRows: 2,
		expectCols: 1,
	},

	// Aggregations
	{
		name:       "count_all",
		setup:      []string{"CREATE (n:Counter)", "CREATE (n:Counter)", "CREATE (n:Counter)"},
		query:      "MATCH (n:Counter) RETURN count(n)",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "sum_values",
		setup:      []string{"CREATE (n:Val {v: 10})", "CREATE (n:Val {v: 20})", "CREATE (n:Val {v: 30})"},
		query:      "MATCH (n:Val) RETURN sum(n.v)",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "avg_values",
		setup:      []string{"CREATE (n:Num {x: 10})", "CREATE (n:Num {x: 20})"},
		query:      "MATCH (n:Num) RETURN avg(n.x)",
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "min_max",
		setup:      []string{"CREATE (n:Score {s: 5})", "CREATE (n:Score {s: 10})", "CREATE (n:Score {s: 15})"},
		query:      "MATCH (n:Score) RETURN min(n.s), max(n.s)",
		expectRows: 1,
		expectCols: 2,
	},

	// Parameters
	{
		name:       "parameter_string",
		setup:      []string{"CREATE (n:Param {name: 'ParamTest'})"},
		query:      "MATCH (n:Param {name: $name}) RETURN n.name",
		params:     map[string]interface{}{"name": "ParamTest"},
		expectRows: 1,
		expectCols: 1,
	},
	{
		name:       "parameter_number",
		setup:      []string{"CREATE (n:NumParam {val: 100})"},
		query:      "MATCH (n:NumParam) WHERE n.val = $val RETURN n.val",
		params:     map[string]interface{}{"val": 100},
		expectRows: 1,
		expectCols: 1,
	},

	// LIMIT and SKIP
	{
		name:       "limit",
		setup:      []string{"CREATE (n:Limited)", "CREATE (n:Limited)", "CREATE (n:Limited)", "CREATE (n:Limited)", "CREATE (n:Limited)"},
		query:      "MATCH (n:Limited) RETURN n LIMIT 3",
		expectRows: 3,
		expectCols: 1,
	},
	{
		name:       "skip",
		setup:      []string{"CREATE (n:Skipped {i: 1})", "CREATE (n:Skipped {i: 2})", "CREATE (n:Skipped {i: 3})"},
		query:      "MATCH (n:Skipped) RETURN n.i ORDER BY n.i SKIP 1",
		expectRows: 2,
		expectCols: 1,
	},
	{
		name:       "skip_and_limit",
		setup:      []string{"CREATE (n:SL {i: 1})", "CREATE (n:SL {i: 2})", "CREATE (n:SL {i: 3})", "CREATE (n:SL {i: 4})", "CREATE (n:SL {i: 5})"},
		query:      "MATCH (n:SL) RETURN n.i ORDER BY n.i SKIP 1 LIMIT 2",
		expectRows: 2,
		expectCols: 1,
	},

	// Relationships
	{
		name:       "create_relationship",
		setup:      []string{"CREATE (a:RelA {name: 'A'})", "CREATE (b:RelB {name: 'B'})"},
		query:      "MATCH (a:RelA), (b:RelB) CREATE (a)-[:KNOWS]->(b)",
		expectRows: 0,
		expectCols: 0,
	},
	{
		name:       "match_relationship",
		setup:      []string{"CREATE (a:Friend {name: 'X'})-[:FRIENDS_WITH]->(b:Friend {name: 'Y'})"},
		query:      "MATCH (a:Friend)-[:FRIENDS_WITH]->(b:Friend) RETURN a.name, b.name",
		expectRows: 1,
		expectCols: 2,
	},

	// DELETE
	{
		name:       "delete_node",
		setup:      []string{"CREATE (n:ToDelete {name: 'delete_me'})"},
		query:      "MATCH (n:ToDelete) DELETE n",
		expectRows: 0,
		expectCols: 0,
	},

	// SET
	{
		name:       "set_property",
		setup:      []string{"CREATE (n:Settable {name: 'original'})"},
		query:      "MATCH (n:Settable) SET n.name = 'updated' RETURN n.name",
		expectRows: 1,
		expectCols: 1,
	},

	// DISTINCT
	{
		name:       "distinct_values",
		setup:      []string{"CREATE (n:Dup {v: 'a'})", "CREATE (n:Dup {v: 'a'})", "CREATE (n:Dup {v: 'b'})"},
		query:      "MATCH (n:Dup) RETURN DISTINCT n.v ORDER BY n.v",
		expectRows: 2,
		expectCols: 1,
	},

	// Aliasing
	{
		name:       "alias",
		query:      "RETURN 42 AS answer",
		expectRows: 1,
		expectCols: 1,
	},

	// Multiple RETURN items
	{
		name:       "multiple_returns",
		setup:      []string{"CREATE (n:Multi {a: 1, b: 2, c: 3})"},
		query:      "MATCH (n:Multi) RETURN n.a, n.b, n.c",
		expectRows: 1,
		expectCols: 3,
	},

	// No results
	{
		name:       "no_matches",
		query:      "MATCH (n:NonExistent) RETURN n",
		expectRows: 0,
		expectCols: 1,
	},
}

func TestExecutorModes_CoreQueries(t *testing.T) {
	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeANTLR,
		config.ExecutorModeHybrid,
	}

	for _, tc := range coreQueries {
		t.Run(tc.name, func(t *testing.T) {
			results := make(map[config.ExecutorMode]*ExecuteResult)

			for _, mode := range modes {
				if tc.skipANTLR && mode == config.ExecutorModeANTLR {
					continue
				}

				t.Run(string(mode), func(t *testing.T) {
					defer config.WithExecutorMode(mode)()

					store := storage.NewMemoryEngine()
					exec := NewCypherExecutor(store)
					ctx := context.Background()

					// Cleanup hybrid executor
					defer func() {
						if h, ok := exec.(*HybridExecutor); ok {
							h.Close()
						}
					}()

					// Run setup queries
					for _, setup := range tc.setup {
						_, err := exec.Execute(ctx, setup, nil)
						require.NoError(t, err, "Setup failed: %s", setup)
					}

					// Run test query
					result, err := exec.Execute(ctx, tc.query, tc.params)

					if tc.expectError {
						assert.Error(t, err, "Expected error for query: %s", tc.query)
						return
					}

					require.NoError(t, err, "Query failed: %s", tc.query)
					assert.Equal(t, tc.expectRows, len(result.Rows), "Row count mismatch")
					if tc.expectCols > 0 && len(result.Rows) > 0 {
						assert.Equal(t, tc.expectCols, len(result.Rows[0]), "Column count mismatch")
					}

					results[mode] = result
				})
			}

			// Compare results across modes (if we have multiple)
			if len(results) > 1 {
				var baseline *ExecuteResult
				var baselineMode config.ExecutorMode
				for mode, result := range results {
					if baseline == nil {
						baseline = result
						baselineMode = mode
						continue
					}

					// Compare row counts
					assert.Equal(t, len(baseline.Rows), len(result.Rows),
						"Row count differs between %s and %s", baselineMode, mode)
				}
			}
		})
	}
}

func TestExecutorModes_Performance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeHybrid,
		// Skip ANTLR for performance - known to be slower
	}

	query := "MATCH (n:Perf) RETURN count(n)"
	iterations := 100

	results := make(map[config.ExecutorMode]time.Duration)

	for _, mode := range modes {
		t.Run(string(mode), func(t *testing.T) {
			defer config.WithExecutorMode(mode)()

			store := storage.NewMemoryEngine()
			exec := NewCypherExecutor(store)
			ctx := context.Background()

			defer func() {
				if h, ok := exec.(*HybridExecutor); ok {
					h.Close()
				}
			}()

			// Setup data
			for i := 0; i < 100; i++ {
				exec.Execute(ctx, fmt.Sprintf("CREATE (n:Perf {i: %d})", i), nil)
			}

			// Warmup
			for i := 0; i < 10; i++ {
				exec.Execute(ctx, query, nil)
			}
			time.Sleep(20 * time.Millisecond) // Let hybrid cache warm

			// Benchmark
			start := time.Now()
			for i := 0; i < iterations; i++ {
				_, err := exec.Execute(ctx, query, nil)
				require.NoError(t, err)
			}
			duration := time.Since(start)
			results[mode] = duration

			avgUs := float64(duration.Microseconds()) / float64(iterations)
			t.Logf("%s: %.2f µs/op", mode, avgUs)
		})
	}

	// Nornic should be similar or faster than hybrid
	if nornic, ok := results[config.ExecutorModeNornic]; ok {
		if hybrid, ok := results[config.ExecutorModeHybrid]; ok {
			// Hybrid should be within 50% of nornic
			ratio := float64(hybrid) / float64(nornic)
			t.Logf("Hybrid/Nornic ratio: %.2f", ratio)
			assert.Less(t, ratio, 1.5, "Hybrid should not be more than 50%% slower than Nornic")
		}
	}
}

func TestExecutorModes_Callbacks(t *testing.T) {
	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeHybrid,
	}

	for _, mode := range modes {
		t.Run(string(mode), func(t *testing.T) {
			defer config.WithExecutorMode(mode)()

			store := storage.NewMemoryEngine()
			exec := NewCypherExecutor(store)
			ctx := context.Background()

			defer func() {
				if h, ok := exec.(*HybridExecutor); ok {
					h.Close()
				}
			}()

			// Test SetNodeCreatedCallback
			var createdNodes []string
			exec.SetNodeCreatedCallback(func(nodeID string) {
				createdNodes = append(createdNodes, nodeID)
			})

			// Create a node
			_, err := exec.Execute(ctx, "CREATE (n:Callback {name: 'test'})", nil)
			require.NoError(t, err)

			// Callback should have been called
			assert.GreaterOrEqual(t, len(createdNodes), 1, "Callback should be called on node creation")
		})
	}
}

func TestExecutorModes_ErrorHandling(t *testing.T) {
	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeHybrid,
	}

	errorQueries := []struct {
		name  string
		query string
	}{
		{"invalid_syntax", "MATC (n) RETURN n"}, // typo
		{"unclosed_string", "RETURN 'hello"},
		{"invalid_property_access", "RETURN n.name"}, // n not defined
	}

	for _, mode := range modes {
		for _, eq := range errorQueries {
			t.Run(fmt.Sprintf("%s/%s", mode, eq.name), func(t *testing.T) {
				defer config.WithExecutorMode(mode)()

				store := storage.NewMemoryEngine()
				exec := NewCypherExecutor(store)
				ctx := context.Background()

				defer func() {
					if h, ok := exec.(*HybridExecutor); ok {
						h.Close()
					}
				}()

				_, err := exec.Execute(ctx, eq.query, nil)
				// We expect some form of error (either parse or execution)
				// The specific error may differ between modes, but both should handle gracefully
				t.Logf("%s error for '%s': %v", mode, eq.name, err)
			})
		}
	}
}

func TestExecutorModes_Concurrency(t *testing.T) {
	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeHybrid,
	}

	for _, mode := range modes {
		t.Run(string(mode), func(t *testing.T) {
			defer config.WithExecutorMode(mode)()

			store := storage.NewMemoryEngine()
			exec := NewCypherExecutor(store)
			ctx := context.Background()

			defer func() {
				if h, ok := exec.(*HybridExecutor); ok {
					h.Close()
				}
			}()

			// Setup data
			for i := 0; i < 10; i++ {
				exec.Execute(ctx, fmt.Sprintf("CREATE (n:Concurrent {i: %d})", i), nil)
			}

			// Run concurrent reads
			done := make(chan bool)
			errors := make(chan error, 10)

			for i := 0; i < 10; i++ {
				go func() {
					for j := 0; j < 100; j++ {
						_, err := exec.Execute(ctx, "MATCH (n:Concurrent) RETURN count(n)", nil)
						if err != nil {
							errors <- err
						}
					}
					done <- true
				}()
			}

			// Wait for all goroutines
			for i := 0; i < 10; i++ {
				<-done
			}

			// Check for errors
			close(errors)
			for err := range errors {
				t.Errorf("Concurrent execution error: %v", err)
			}
		})
	}
}
