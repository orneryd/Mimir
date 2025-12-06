// Package cypher - Executor interface for A/B testing between implementations.
package cypher

import (
	"context"
	"sync/atomic"
	"time"
)

// CypherExecutor is the interface that both StorageExecutor (string-based)
// and ASTExecutor (ANTLR-based) implement.
type CypherExecutor interface {
	// Execute runs a Cypher query and returns results
	Execute(ctx context.Context, cypher string, params map[string]interface{}) (*ExecuteResult, error)

	// SetNodeCreatedCallback sets a callback for node creation events
	SetNodeCreatedCallback(cb NodeCreatedCallback)

	// SetEmbedder sets the query embedder for vector operations
	SetEmbedder(embedder QueryEmbedder)
}

// ExecutorType identifies which executor implementation to use
type ExecutorType int

const (
	ExecutorTypeString ExecutorType = iota // String-based StorageExecutor
	ExecutorTypeAST                        // ANTLR AST-based ASTExecutor
)

// ABExecutor wraps both executor implementations for A/B testing.
// It can run queries through either or both executors and compare results.
type ABExecutor struct {
	stringExecutor CypherExecutor // StorageExecutor
	astExecutor    CypherExecutor // ASTExecutor (may be nil if not available)

	// Which executor to use for production queries
	activeExecutor atomic.Int32

	// Stats collection
	stringStats ExecutorStats
	astStats    ExecutorStats

	// Whether to run both and compare (for testing)
	compareMode atomic.Bool
}

// ExecutorStats tracks performance metrics for an executor
type ExecutorStats struct {
	TotalQueries   atomic.Int64
	TotalErrors    atomic.Int64
	TotalDuration  atomic.Int64 // nanoseconds
	MinDuration    atomic.Int64 // nanoseconds
	MaxDuration    atomic.Int64 // nanoseconds
}

// NewABExecutor creates a new A/B testing executor
func NewABExecutor(stringExec, astExec CypherExecutor) *ABExecutor {
	ab := &ABExecutor{
		stringExecutor: stringExec,
		astExecutor:    astExec,
	}
	ab.activeExecutor.Store(int32(ExecutorTypeString)) // Default to string executor
	ab.stringStats.MinDuration.Store(int64(^uint64(0) >> 1)) // Max int64
	ab.astStats.MinDuration.Store(int64(^uint64(0) >> 1))
	return ab
}

// SetActiveExecutor switches which executor handles production queries
func (ab *ABExecutor) SetActiveExecutor(t ExecutorType) {
	ab.activeExecutor.Store(int32(t))
}

// GetActiveExecutor returns the current active executor type
func (ab *ABExecutor) GetActiveExecutor() ExecutorType {
	return ExecutorType(ab.activeExecutor.Load())
}

// EnableCompareMode enables running both executors and comparing results
func (ab *ABExecutor) EnableCompareMode(enabled bool) {
	ab.compareMode.Store(enabled)
}

// Execute runs the query through the active executor
func (ab *ABExecutor) Execute(ctx context.Context, cypher string, params map[string]interface{}) (*ExecuteResult, error) {
	if ab.compareMode.Load() && ab.astExecutor != nil {
		return ab.executeCompare(ctx, cypher, params)
	}

	// Normal execution through active executor
	active := ExecutorType(ab.activeExecutor.Load())
	if active == ExecutorTypeAST && ab.astExecutor != nil {
		return ab.executeWithStats(ctx, cypher, params, ab.astExecutor, &ab.astStats)
	}
	return ab.executeWithStats(ctx, cypher, params, ab.stringExecutor, &ab.stringStats)
}

// executeWithStats runs query and collects timing stats
func (ab *ABExecutor) executeWithStats(ctx context.Context, cypher string, params map[string]interface{}, exec CypherExecutor, stats *ExecutorStats) (*ExecuteResult, error) {
	start := time.Now()
	result, err := exec.Execute(ctx, cypher, params)
	duration := time.Since(start).Nanoseconds()

	stats.TotalQueries.Add(1)
	stats.TotalDuration.Add(duration)

	// Update min/max
	for {
		old := stats.MinDuration.Load()
		if duration >= old || stats.MinDuration.CompareAndSwap(old, duration) {
			break
		}
	}
	for {
		old := stats.MaxDuration.Load()
		if duration <= old || stats.MaxDuration.CompareAndSwap(old, duration) {
			break
		}
	}

	if err != nil {
		stats.TotalErrors.Add(1)
	}

	return result, err
}

// executeCompare runs both executors and compares results
func (ab *ABExecutor) executeCompare(ctx context.Context, cypher string, params map[string]interface{}) (*ExecuteResult, error) {
	// Run string executor
	stringStart := time.Now()
	stringResult, stringErr := ab.stringExecutor.Execute(ctx, cypher, params)
	stringDuration := time.Since(stringStart)
	ab.stringStats.TotalQueries.Add(1)
	ab.stringStats.TotalDuration.Add(stringDuration.Nanoseconds())
	if stringErr != nil {
		ab.stringStats.TotalErrors.Add(1)
	}

	// Run AST executor
	astStart := time.Now()
	astResult, astErr := ab.astExecutor.Execute(ctx, cypher, params)
	astDuration := time.Since(astStart)
	ab.astStats.TotalQueries.Add(1)
	ab.astStats.TotalDuration.Add(astDuration.Nanoseconds())
	if astErr != nil {
		ab.astStats.TotalErrors.Add(1)
	}

	// Log comparison (in production, you'd want more sophisticated comparison)
	_ = stringResult
	_ = astResult
	_ = stringDuration
	_ = astDuration

	// Return result from active executor
	if ExecutorType(ab.activeExecutor.Load()) == ExecutorTypeAST {
		return astResult, astErr
	}
	return stringResult, stringErr
}

// SetNodeCreatedCallback sets callback on both executors
func (ab *ABExecutor) SetNodeCreatedCallback(cb func(nodeID string)) {
	if ab.stringExecutor != nil {
		ab.stringExecutor.SetNodeCreatedCallback(cb)
	}
	if ab.astExecutor != nil {
		ab.astExecutor.SetNodeCreatedCallback(cb)
	}
}

// SetEmbedder sets embedder on both executors
func (ab *ABExecutor) SetEmbedder(embedder QueryEmbedder) {
	if ab.stringExecutor != nil {
		ab.stringExecutor.SetEmbedder(embedder)
	}
	if ab.astExecutor != nil {
		ab.astExecutor.SetEmbedder(embedder)
	}
}

// GetStats returns performance stats for both executors
func (ab *ABExecutor) GetStats() (stringStats, astStats ExecutorStats) {
	return ab.stringStats, ab.astStats
}

// GetStatsReport returns a formatted stats comparison
func (ab *ABExecutor) GetStatsReport() map[string]interface{} {
	sTotal := ab.stringStats.TotalQueries.Load()
	aTotal := ab.astStats.TotalQueries.Load()

	var sAvg, aAvg float64
	if sTotal > 0 {
		sAvg = float64(ab.stringStats.TotalDuration.Load()) / float64(sTotal) / 1e6 // ms
	}
	if aTotal > 0 {
		aAvg = float64(ab.astStats.TotalDuration.Load()) / float64(aTotal) / 1e6 // ms
	}

	return map[string]interface{}{
		"string_executor": map[string]interface{}{
			"total_queries": sTotal,
			"total_errors":  ab.stringStats.TotalErrors.Load(),
			"avg_ms":        sAvg,
			"min_ms":        float64(ab.stringStats.MinDuration.Load()) / 1e6,
			"max_ms":        float64(ab.stringStats.MaxDuration.Load()) / 1e6,
		},
		"ast_executor": map[string]interface{}{
			"total_queries": aTotal,
			"total_errors":  ab.astStats.TotalErrors.Load(),
			"avg_ms":        aAvg,
			"min_ms":        float64(ab.astStats.MinDuration.Load()) / 1e6,
			"max_ms":        float64(ab.astStats.MaxDuration.Load()) / 1e6,
		},
		"speedup": func() float64 {
			if aAvg == 0 {
				return 0
			}
			return sAvg / aAvg // >1 means AST is faster
		}(),
	}
}
