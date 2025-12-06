// Package cypher - HybridExecutor combines fast string execution with background AST building.
//
// Architecture:
// - Query arrives → String executor handles immediately (fast path)
// - Background goroutine builds AST and caches it (warm cache)
// - LLM features use cached AST when available
// - Best of both: fast execution + rich AST for manipulation
package cypher

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	cyantlr "github.com/orneryd/nornicdb/pkg/cypher/antlr"
	"github.com/orneryd/nornicdb/pkg/storage"
)

// HybridExecutor combines fast string-based execution with background AST building.
// Queries execute immediately via the string parser while AST is built asynchronously.
type HybridExecutor struct {
	stringExec *StorageExecutor
	storage    storage.Engine

	// Result cache: query string -> *ExecuteResult
	resultCache   sync.Map
	resultCacheOn atomic.Bool

	// AST cache: query string -> *cyantlr.ParseResult
	astCache sync.Map

	// Background AST builder
	astQueue     chan astBuildRequest
	astQueueSize int
	workers      int
	shutdown     chan struct{}
	wg           sync.WaitGroup

	// Stats
	stats HybridStats

	// Callbacks
	nodeCreatedCallback NodeCreatedCallback
	embedder            QueryEmbedder
}

// astBuildRequest is a request to build AST in background
type astBuildRequest struct {
	query string
}

// HybridStats tracks performance metrics
type HybridStats struct {
	StringExecutions  atomic.Int64
	ASTCacheHits      atomic.Int64
	ASTCacheMisses    atomic.Int64
	ASTBuildsQueued   atomic.Int64
	ASTBuildsComplete atomic.Int64
	ResultCacheHits   atomic.Int64
}

// HybridConfig configures the hybrid executor
type HybridConfig struct {
	// Number of background workers for AST building
	Workers int
	// Size of the AST build queue
	QueueSize int
	// Enable result caching
	EnableResultCache bool
}

// DefaultHybridConfig returns sensible defaults
func DefaultHybridConfig() HybridConfig {
	return HybridConfig{
		Workers:           2,
		QueueSize:         1000,
		EnableResultCache: false, // Disabled by default (write queries invalidate)
	}
}

// NewHybridExecutor creates a new hybrid executor
func NewHybridExecutor(store storage.Engine, cfg HybridConfig) *HybridExecutor {
	if cfg.Workers <= 0 {
		cfg.Workers = 2
	}
	if cfg.QueueSize <= 0 {
		cfg.QueueSize = 1000
	}

	h := &HybridExecutor{
		stringExec:   NewStorageExecutor(store),
		storage:      store,
		astQueue:     make(chan astBuildRequest, cfg.QueueSize),
		astQueueSize: cfg.QueueSize,
		workers:      cfg.Workers,
		shutdown:     make(chan struct{}),
	}
	h.resultCacheOn.Store(cfg.EnableResultCache)

	// Start background AST workers
	for i := 0; i < cfg.Workers; i++ {
		h.wg.Add(1)
		go h.astWorker()
	}

	return h
}

// astWorker processes AST build requests in the background
func (h *HybridExecutor) astWorker() {
	defer h.wg.Done()

	for {
		select {
		case <-h.shutdown:
			return
		case req := <-h.astQueue:
			// Check if already cached
			if _, ok := h.astCache.Load(req.query); ok {
				continue
			}

			// Build AST (this is the slow part, but we're in background)
			result, err := cyantlr.Parse(req.query)
			if err == nil && result != nil {
				h.astCache.Store(req.query, result)
				h.stats.ASTBuildsComplete.Add(1)
			}
		}
	}
}

// Execute runs a query using fast string execution while queueing AST build
func (h *HybridExecutor) Execute(ctx context.Context, query string, params map[string]interface{}) (*ExecuteResult, error) {
	// 1. Check result cache first (if enabled)
	if h.resultCacheOn.Load() {
		if cached, ok := h.resultCache.Load(query); ok {
			h.stats.ResultCacheHits.Add(1)
			return cached.(*ExecuteResult), nil
		}
	}

	// 2. Execute via fast string parser
	h.stats.StringExecutions.Add(1)
	result, err := h.stringExec.Execute(ctx, query, params)

	// 3. Queue AST build in background (non-blocking)
	if err == nil {
		h.queueASTBuild(query)
	}

	// 4. Optionally cache result
	if err == nil && h.resultCacheOn.Load() && isReadOnlyQuery(query) {
		h.resultCache.Store(query, result)
	}

	return result, err
}

// queueASTBuild queues an AST build request (non-blocking)
func (h *HybridExecutor) queueASTBuild(query string) {
	// Skip if already cached
	if _, ok := h.astCache.Load(query); ok {
		h.stats.ASTCacheHits.Add(1)
		return
	}
	h.stats.ASTCacheMisses.Add(1)

	// Non-blocking send to queue
	select {
	case h.astQueue <- astBuildRequest{query: query}:
		h.stats.ASTBuildsQueued.Add(1)
	default:
		// Queue full, skip (AST will be built on next occurrence or on-demand)
	}
}

// GetAST returns the cached AST for a query, building synchronously if needed
func (h *HybridExecutor) GetAST(query string) (*cyantlr.ParseResult, error) {
	// Check cache first
	if cached, ok := h.astCache.Load(query); ok {
		h.stats.ASTCacheHits.Add(1)
		return cached.(*cyantlr.ParseResult), nil
	}

	// Build synchronously (for LLM features that need it now)
	result, err := cyantlr.Parse(query)
	if err == nil && result != nil {
		h.astCache.Store(query, result)
	}
	return result, err
}

// GetASTIfCached returns the cached AST or nil (never blocks)
func (h *HybridExecutor) GetASTIfCached(query string) *cyantlr.ParseResult {
	if cached, ok := h.astCache.Load(query); ok {
		return cached.(*cyantlr.ParseResult)
	}
	return nil
}

// WaitForAST waits for the AST to be built (with timeout)
func (h *HybridExecutor) WaitForAST(query string, timeout time.Duration) (*cyantlr.ParseResult, bool) {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		if cached, ok := h.astCache.Load(query); ok {
			return cached.(*cyantlr.ParseResult), true
		}
		time.Sleep(1 * time.Millisecond)
	}

	return nil, false
}

// SetNodeCreatedCallback sets the callback for node creation events
func (h *HybridExecutor) SetNodeCreatedCallback(cb NodeCreatedCallback) {
	h.nodeCreatedCallback = cb
	h.stringExec.SetNodeCreatedCallback(cb)
}

// SetEmbedder sets the query embedder
func (h *HybridExecutor) SetEmbedder(embedder QueryEmbedder) {
	h.embedder = embedder
	h.stringExec.SetEmbedder(embedder)
}

// InvalidateCache invalidates caches for queries affecting given labels
func (h *HybridExecutor) InvalidateCache(labels []string) {
	// For now, just clear all caches on write
	// TODO: More sophisticated label-based invalidation
	h.resultCache = sync.Map{}
}

// ClearCaches clears all caches
func (h *HybridExecutor) ClearCaches() {
	h.resultCache = sync.Map{}
	h.astCache = sync.Map{}
	cyantlr.ClearCache()
}

// GetStats returns performance statistics
func (h *HybridExecutor) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"string_executions":    h.stats.StringExecutions.Load(),
		"ast_cache_hits":       h.stats.ASTCacheHits.Load(),
		"ast_cache_misses":     h.stats.ASTCacheMisses.Load(),
		"ast_builds_queued":    h.stats.ASTBuildsQueued.Load(),
		"ast_builds_complete":  h.stats.ASTBuildsComplete.Load(),
		"result_cache_hits":    h.stats.ResultCacheHits.Load(),
		"result_cache_enabled": h.resultCacheOn.Load(),
	}
}

// Close shuts down the hybrid executor
func (h *HybridExecutor) Close() {
	close(h.shutdown)
	h.wg.Wait()
}

// isReadOnlyQuery checks if a query is read-only (safe to cache results)
func isReadOnlyQuery(query string) bool {
	// Quick check for write operations
	upper := toUpperASCII(query)
	writeKeywords := []string{"CREATE", "DELETE", "SET", "REMOVE", "MERGE", "DETACH"}
	for _, kw := range writeKeywords {
		if containsKeyword(upper, kw) {
			return false
		}
	}
	return true
}

// toUpperASCII converts to uppercase (ASCII only, fast)
func toUpperASCII(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'a' && c <= 'z' {
			c -= 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

// containsKeyword checks if string contains a keyword (word boundary aware)
func containsKeyword(s, keyword string) bool {
	idx := 0
	for {
		pos := indexAt(s, keyword, idx)
		if pos < 0 {
			return false
		}
		// Check word boundaries
		before := pos == 0 || !isAlphaNumericByte(s[pos-1])
		after := pos+len(keyword) >= len(s) || !isAlphaNumericByte(s[pos+len(keyword)])
		if before && after {
			return true
		}
		idx = pos + 1
	}
}

func indexAt(s, substr string, start int) int {
	if start >= len(s) {
		return -1
	}
	for i := start; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
