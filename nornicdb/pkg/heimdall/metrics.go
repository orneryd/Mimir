// Package heimdall provides comprehensive metrics collection for the cognitive guardian.
package heimdall

import (
	"context"
	"runtime"
	"sync"
	"time"
)

// ============================================================================
// Comprehensive Metrics Collection
// ============================================================================

// NornicDBMetrics aggregates ALL database metrics for the SLM.
// This is the single source of truth for database observability.
type NornicDBMetrics struct {
	// Server metrics
	Server ServerMetrics `json:"server"`

	// Database metrics
	Database DatabaseMetrics `json:"database"`

	// Storage engine metrics
	Storage StorageMetrics `json:"storage"`

	// Cache metrics
	Cache CacheMetrics `json:"cache"`

	// Embedding metrics
	Embedding EmbeddingMetrics `json:"embedding"`

	// GPU metrics
	GPU GPUMetrics `json:"gpu"`

	// Query metrics
	Query QueryMetrics `json:"query"`

	// Runtime metrics
	Runtime RuntimeMetrics `json:"runtime"`

	// Timestamp
	CollectedAt time.Time `json:"collected_at"`
}

// ServerMetrics contains HTTP server statistics.
type ServerMetrics struct {
	Uptime          time.Duration `json:"uptime"`
	RequestsTotal   int64         `json:"requests_total"`
	ErrorsTotal     int64         `json:"errors_total"`
	ActiveRequests  int64         `json:"active_requests"`
	SlowQueryCount  int64         `json:"slow_query_count"`
	RequestsPerSec  float64       `json:"requests_per_sec"`
}

// DatabaseMetrics contains core database statistics.
type DatabaseMetrics struct {
	NodeCount         int64            `json:"node_count"`
	EdgeCount         int64            `json:"edge_count"`
	LabelCounts       map[string]int64 `json:"label_counts,omitempty"`
	IndexCount        int              `json:"index_count"`
	PropertyIndexes   int              `json:"property_indexes"`
	CompositeIndexes  int              `json:"composite_indexes"`
}

// StorageMetrics contains storage engine statistics.
type StorageMetrics struct {
	// Async engine stats
	PendingWrites int64 `json:"pending_writes"`
	TotalFlushes  int64 `json:"total_flushes"`

	// WAL stats
	WALSequence    uint64    `json:"wal_sequence"`
	WALEntries     uint64    `json:"wal_entries"`
	WALBytes       uint64    `json:"wal_bytes"`
	WALTotalWrites uint64    `json:"wal_total_writes"`
	WALTotalSyncs  uint64    `json:"wal_total_syncs"`
	WALLastSync    time.Time `json:"wal_last_sync"`

	// Node config stats
	NodeConfigs    int64   `json:"node_configs"`
	ConfigChecks   int64   `json:"config_checks"`
	ConfigsBlocked int64   `json:"configs_blocked"`
	BlockRate      float64 `json:"block_rate"`

	// Edge meta stats
	EdgeMetaRecords      int64            `json:"edge_meta_records"`
	EdgeMetaMaterialized int64            `json:"edge_meta_materialized"`
	EdgeMetaBySignal     map[string]int64 `json:"edge_meta_by_signal,omitempty"`
}

// CacheMetrics contains query cache statistics.
type CacheMetrics struct {
	Size       int     `json:"size"`
	MaxSize    int     `json:"max_size"`
	Hits       uint64  `json:"hits"`
	Misses     uint64  `json:"misses"`
	HitRate    float64 `json:"hit_rate"`
	Evictions  uint64  `json:"evictions"`
	TTL        string  `json:"ttl"`
}

// EmbeddingMetrics contains embedding worker statistics.
type EmbeddingMetrics struct {
	WorkerRunning    bool   `json:"worker_running"`
	Processed        int    `json:"processed"`
	Failed           int    `json:"failed"`
	QueueLength      int    `json:"queue_length"`
	NodesWithEmbed   int64  `json:"nodes_with_embeddings"`
	NodesWithoutEmbed int64 `json:"nodes_without_embeddings"`
	EmbedRate        float64 `json:"embed_rate"`
	Provider         string `json:"provider"`
	Model            string `json:"model"`
	Dimensions       int    `json:"dimensions"`
}

// GPUMetrics contains GPU acceleration statistics.
type GPUMetrics struct {
	Available      bool   `json:"available"`
	Enabled        bool   `json:"enabled"`
	DeviceName     string `json:"device_name,omitempty"`
	Backend        string `json:"backend,omitempty"`
	MemoryMB       int    `json:"memory_mb,omitempty"`
	AllocatedMB    int    `json:"allocated_mb"`
	OperationsGPU  int64  `json:"operations_gpu"`
	OperationsCPU  int64  `json:"operations_cpu"`
	FallbackCount  int64  `json:"fallback_count"`
}

// QueryMetrics contains Cypher query statistics.
type QueryMetrics struct {
	TotalQueries     int64         `json:"total_queries"`
	SlowQueries      int64         `json:"slow_queries"`
	AvgExecutionTime time.Duration `json:"avg_execution_time"`
	CacheHitRate     float64       `json:"cache_hit_rate"`
	ThresholdMs      int64         `json:"threshold_ms"`
}

// ============================================================================
// Metrics Collector Implementation
// ============================================================================

// MetricsCollector collects metrics from all NornicDB subsystems.
type MetricsCollector struct {
	mu sync.RWMutex

	// Database reference for metrics collection
	db DatabaseMetricsSource

	// Server reference for server metrics
	server ServerMetricsSource

	// Cache for expensive metrics
	cache     *NornicDBMetrics
	cacheTTL  time.Duration
	lastCache time.Time
}

// DatabaseMetricsSource is the interface for collecting database metrics.
type DatabaseMetricsSource interface {
	// Core stats
	Stats() interface{} // Returns DBStats or similar

	// Node/Edge counts
	NodeCount() (int64, error)
	EdgeCount() (int64, error)

	// Embed queue
	EmbedQueueStats() interface{}

	// Storage engine
	GetAsyncEngine() AsyncEngineStats
	GetWAL() WALStats
	GetSchemaManager() SchemaManagerStats

	// Query cache
	GetQueryCache() QueryCacheStats

	// GPU
	GetGPUManager() GPUManagerStats

	// Encryption
	EncryptionStats() map[string]interface{}
}

// AsyncEngineStats is the interface for async storage metrics.
type AsyncEngineStats interface {
	Stats() (pendingWrites, totalFlushes int64)
}

// WALStats is the interface for WAL metrics.
type WALStats interface {
	Stats() interface{}
}

// SchemaManagerStats is the interface for schema/index metrics.
type SchemaManagerStats interface {
	GetIndexStats() interface{}
}

// QueryCacheStats is the interface for cache metrics.
type QueryCacheStats interface {
	Stats() interface{}
}

// GPUManagerStats is the interface for GPU metrics.
type GPUManagerStats interface {
	IsEnabled() bool
	Device() interface{}
	Stats() interface{}
	AllocatedMemoryMB() int
}

// ServerMetricsSource is the interface for collecting server metrics.
type ServerMetricsSource interface {
	Stats() interface{}
	SlowQueryCount() int64
}

// NewMetricsCollector creates a new metrics collector.
func NewMetricsCollector(db DatabaseMetricsSource, server ServerMetricsSource) *MetricsCollector {
	return &MetricsCollector{
		db:       db,
		server:   server,
		cacheTTL: 5 * time.Second, // Cache expensive metrics for 5 seconds
	}
}

// Collect gathers all metrics from the database.
func (c *MetricsCollector) Collect() *NornicDBMetrics {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Return cached metrics if still fresh
	if c.cache != nil && time.Since(c.lastCache) < c.cacheTTL {
		return c.cache
	}

	metrics := &NornicDBMetrics{
		CollectedAt: time.Now(),
	}

	// Collect runtime metrics (always fresh - very cheap)
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	metrics.Runtime = RuntimeMetrics{
		GoroutineCount: runtime.NumGoroutine(),
		MemoryAllocMB:  memStats.Alloc / 1024 / 1024,
		NumGC:          memStats.NumGC,
	}

	// Note: Actual metric collection requires type assertions on the real types
	// The interfaces above define the contract - actual wiring happens in server.go

	c.cache = metrics
	c.lastCache = time.Now()

	return metrics
}

// Runtime returns current runtime metrics (always cheap to collect).
func (c *MetricsCollector) Runtime() RuntimeMetrics {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	return RuntimeMetrics{
		GoroutineCount: runtime.NumGoroutine(),
		MemoryAllocMB:  memStats.Alloc / 1024 / 1024,
		NumGC:          memStats.NumGC,
	}
}

// ============================================================================
// Query Executor Implementation
// ============================================================================

// QueryExecutor provides read-only database access for Heimdall actions.
type QueryExecutor struct {
	db      QueryDatabase
	timeout time.Duration
}

// QueryDatabase is the interface for executing Cypher queries.
type QueryDatabase interface {
	// Query executes a read-only Cypher query
	Query(ctx context.Context, cypher string, params map[string]interface{}) ([]map[string]interface{}, error)

	// Stats returns basic database stats
	Stats() interface{}

	// NodeCount returns total nodes
	NodeCount() (int64, error)

	// EdgeCount returns total edges
	EdgeCount() (int64, error)
}

// NewQueryExecutor creates a query executor with the given database.
func NewQueryExecutor(db QueryDatabase, timeout time.Duration) *QueryExecutor {
	return &QueryExecutor{
		db:      db,
		timeout: timeout,
	}
}

// Query implements DatabaseReader.Query
func (e *QueryExecutor) Query(ctx context.Context, cypher string, params map[string]interface{}) ([]map[string]interface{}, error) {
	// Add timeout to context
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	return e.db.Query(ctx, cypher, params)
}

// Stats implements DatabaseReader.Stats
func (e *QueryExecutor) Stats() DatabaseStats {
	nodeCount, _ := e.db.NodeCount()
	edgeCount, _ := e.db.EdgeCount()

	return DatabaseStats{
		NodeCount:         nodeCount,
		RelationshipCount: edgeCount,
		LabelCounts:       make(map[string]int64), // Can be expanded
	}
}

// ============================================================================
// Real MetricsReader Implementation
// ============================================================================

// RealMetricsReader provides actual runtime metrics.
type RealMetricsReader struct{}

// Runtime returns current runtime metrics.
func (r *RealMetricsReader) Runtime() RuntimeMetrics {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	return RuntimeMetrics{
		GoroutineCount: runtime.NumGoroutine(),
		MemoryAllocMB:  memStats.Alloc / 1024 / 1024,
		NumGC:          memStats.NumGC,
	}
}

// ============================================================================
// Default No-Op Logger Implementation
// ============================================================================

// DefaultLogger is a simple logger implementation.
type DefaultLogger struct {
	prefix string
}

// NewDefaultLogger creates a logger with the given prefix.
func NewDefaultLogger(prefix string) *DefaultLogger {
	return &DefaultLogger{prefix: prefix}
}

func (l *DefaultLogger) Debug(msg string, args ...interface{}) {}
func (l *DefaultLogger) Info(msg string, args ...interface{})  {}
func (l *DefaultLogger) Warn(msg string, args ...interface{})  {}
func (l *DefaultLogger) Error(msg string, args ...interface{}) {}
