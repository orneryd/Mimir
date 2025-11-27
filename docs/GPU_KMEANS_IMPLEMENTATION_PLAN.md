# GPU K-Means Clustering for Mimir/NornicDB: Combined Analysis & Implementation Plan

## Executive Summary

This document combines the theoretical analysis from K-MEANS.md and K-MEANS-RT.md with a critical evaluation of their applicability to Mimir's architecture. It provides a realistic implementation plan for enhancing NornicDB's vector search capabilities with GPU-accelerated k-means clustering.

---

## Part 1: Critical Analysis

### 1.1 Current State of NornicDB GPU Infrastructure

**What Exists:**

- ✅ `pkg/gpu/` package with multi-backend support (Metal, CUDA, OpenCL, Vulkan)
- ✅ `EmbeddingIndex` - GPU-accelerated vector similarity search
- ✅ Working Metal (macOS) and CUDA (NVIDIA) backends
- ✅ CPU fallback for all operations
- ✅ Auto-detected embedding dimensions (inferred from first embedding added)

**What's Missing for K-Means:**

- ❌ No k-means clustering implementation exists
- ❌ No cluster assignment tracking
- ❌ No centroid management
- ❌ No integration with inference engine
- ❌ No real-time clustering hooks

### 1.2 Mimir Context: Why K-Means Matters

From `AGENTS.md` and `README.md`, Mimir's architecture uses:

- **Neo4j Graph Database** for persistent storage
- **Vector embeddings** with auto-detected dimensions (varies by model):
  - `mxbai-embed-large`: 1024 dimensions
  - `nomic-embed-text`: 768 dimensions
  - `text-embedding-3-small` (OpenAI): 1536 dimensions
  - Dimensions are automatically inferred from the embeddings at runtime
- **Semantic search** via `vector_search_nodes` tool
- **File indexing** with chunking (1000-char chunks with embeddings)

**Current Vector Search Flow:**

```
Query → Embedding → vector_search_nodes → Cosine Similarity → Top-K Results
```

**Proposed K-Means Enhanced Flow:**

```
Query → Embedding → Cluster Lookup (O(1)) → Intra-cluster Refinement → Results
```

### 1.3 Critical Gaps in Original Documents

#### K-MEANS.md Concerns:

1. **Python/cuML Focus**: Examples use Python libraries (RAPIDS cuML, FAISS, PyTorch), but NornicDB is Go-based. The Go interface examples are theoretical - no actual CUDA/Metal kernel implementations are provided.

2. **Missing GPU Kernel Code**: The CUDA/Metal kernels shown are simplified pseudocode. Production k-means requires:

   - K-means++ initialization (not shown)
   - Parallel prefix sum for centroid updates
   - Convergence checking across GPU threads
   - Memory coalescing optimizations

3. **Memory Estimates Optimistic**: The 40MB for 10K embeddings assumes contiguous storage. Real overhead includes:

   - GPU command buffers
   - Intermediate results buffers
   - Working memory for reductions
   - Actual: ~80-120MB for 10K embeddings

4. **NornicDB Integration Untested**: The `ConceptClusteringEngine` shown has never been implemented. The interface to `storage.Engine` doesn't match NornicDB's actual storage API.

#### K-MEANS-RT.md Concerns:

1. **3-Tier System Complexity**: While elegant, implementing three tiers simultaneously is risky:

   - Tier 1 (instant reassignment): Simple, low risk
   - Tier 2 (batch updates): Moderate complexity
   - Tier 3 (full re-clustering): Requires careful synchronization

2. **Drift Detection Untested**: The `computeDrift` and `shouldRecluster` heuristics need empirical tuning. Thresholds like 0.1 are arbitrary.

3. **Concurrent Update Handling**: The locking strategy (`sync.RWMutex`) may cause contention under high-throughput scenarios. The document doesn't address:

   - Lock-free alternatives
   - Sharded cluster indices
   - Read-copy-update patterns

4. **GPU Kernel Launch Overhead**: Launching GPU kernels for single-node reassignment (~0.1ms claimed) may actually take 0.3-0.5ms due to:
   - Driver overhead
   - Memory synchronization
   - Command queue latency

### 1.4 What the Documents Get Right

**Feasibility**: ✅ GPU k-means on high-dimensional embeddings (768-1536 dims) is absolutely feasible. NornicDB already has the GPU infrastructure.

**Performance Claims**: ✅ The 100-400x speedup over CPU for batch operations is realistic based on existing Metal/CUDA benchmarks.

**Use Cases**: ✅ The three main use cases are valid for Mimir:

1. **Topic Discovery**: Cluster similar file chunks for concept mining
2. **Related Documents**: O(1) lookup of related files via cluster membership
3. **Concept Drift**: Track how codebase topics evolve over indexing

**Hybrid Approach**: ✅ Combining cluster-based filtering with vector refinement is the correct architecture.

---

## Part 2: Realistic Implementation Plan

### Phase 1: Foundation (2-3 weeks)

**Goal**: Implement basic GPU k-means as extension to existing `EmbeddingIndex`

#### 1.1 Extend EmbeddingIndex with Clustering

```go
// pkg/gpu/kmeans.go (NEW FILE)
package gpu

import (
    "sync"
    "sync/atomic"
)

// KMeansConfig configures k-means clustering
type KMeansConfig struct {
    NumClusters    int           // K value (default: sqrt(N/2))
    MaxIterations  int           // Convergence limit (default: 100)
    Tolerance      float32       // Convergence threshold (default: 0.0001)
    InitMethod     string        // "kmeans++" or "random"
    AutoK          bool          // Auto-determine optimal K
    // Note: Dimensions are auto-detected from the first embedding added
}

// DefaultKMeansConfig returns sensible defaults
// Dimensions are auto-detected from the first embedding added
func DefaultKMeansConfig() *KMeansConfig {
    return &KMeansConfig{
        NumClusters:   0,       // Auto-detect based on data size
        MaxIterations: 100,
        Tolerance:     0.0001,
        InitMethod:    "kmeans++",
        AutoK:         true,
    }
}

// ClusterIndex extends EmbeddingIndex with clustering capabilities
type ClusterIndex struct {
    *EmbeddingIndex

    config      *KMeansConfig
    dimensions  int                  // Auto-detected from first embedding

    // Cluster state
    centroids   [][]float32          // [K][dimensions] centroid vectors
    assignments []int                // [N] cluster assignment per embedding
    clusterMap  map[int][]int        // cluster_id -> embedding indices

    // GPU buffers for clustering
    centroidBuffer unsafe.Pointer    // GPU buffer for centroids

    // State tracking
    clustered   bool
    mu          sync.RWMutex

    // Stats
    clusterIterations int64
    lastClusterTime   time.Duration
}

// NewClusterIndex creates a clusterable embedding index
func NewClusterIndex(manager *Manager, embConfig *EmbeddingIndexConfig, kmeansConfig *KMeansConfig) *ClusterIndex {
    if kmeansConfig == nil {
        kmeansConfig = DefaultKMeansConfig()
    }

    return &ClusterIndex{
        EmbeddingIndex: NewEmbeddingIndex(manager, embConfig),
        config:         kmeansConfig,
        clusterMap:     make(map[int][]int),
    }
}
```

#### 1.2 Implement CPU K-Means First

```go
// Cluster performs k-means clustering on current embeddings
func (ci *ClusterIndex) Cluster() error {
    ci.mu.Lock()
    defer ci.mu.Unlock()

    n := len(ci.nodeIDs)
    if n == 0 {
        return nil
    }

    // Auto-determine K if not specified
    k := ci.config.NumClusters
    if k <= 0 || ci.config.AutoK {
        k = optimalK(n)
    }

    // Initialize centroids (k-means++ or random)
    ci.centroids = ci.initCentroids(k)
    ci.assignments = make([]int, n)

    // Iterate until convergence
    start := time.Now()
    for iter := 0; iter < ci.config.MaxIterations; iter++ {
        // Assignment step
        changed := ci.assignToCentroids()

        // Update centroids
        ci.updateCentroids()

        if !changed {
            break
        }

        atomic.AddInt64(&ci.clusterIterations, 1)
    }
    ci.lastClusterTime = time.Since(start)

    // Build cluster map
    ci.buildClusterMap()
    ci.clustered = true

    return nil
}

// optimalK calculates optimal cluster count using rule of thumb
func optimalK(n int) int {
    // sqrt(n/2) is a common heuristic
    k := int(math.Sqrt(float64(n) / 2))
    if k < 10 {
        k = 10 // Minimum clusters
    }
    if k > 1000 {
        k = 1000 // Maximum clusters
    }
    return k
}
```

#### 1.3 Add Metal GPU Kernel

```metal
// pkg/gpu/metal/kernels/kmeans.metal (NEW FILE)

#include <metal_stdlib>
using namespace metal;

// Compute distance from each point to each centroid
kernel void compute_distances(
    device const float* embeddings [[buffer(0)]],  // [N * D]
    device const float* centroids [[buffer(1)]],   // [K * D]
    device float* distances [[buffer(2)]],         // [N * K]
    constant uint& N [[buffer(3)]],
    constant uint& K [[buffer(4)]],
    constant uint& D [[buffer(5)]],
    uint2 gid [[thread_position_in_grid]]
) {
    uint n = gid.x;  // embedding index
    uint k = gid.y;  // centroid index

    if (n >= N || k >= K) return;

    float dist = 0.0f;
    for (uint d = 0; d < D; d++) {
        float diff = embeddings[n * D + d] - centroids[k * D + d];
        dist += diff * diff;
    }

    distances[n * K + k] = dist;
}

// Find nearest centroid for each point
kernel void assign_clusters(
    device const float* distances [[buffer(0)]],   // [N * K]
    device int* assignments [[buffer(1)]],          // [N]
    device atomic_int* changed [[buffer(2)]],      // [1]
    constant uint& N [[buffer(3)]],
    constant uint& K [[buffer(4)]],
    uint gid [[thread_position_in_grid]]
) {
    if (gid >= N) return;

    int old_cluster = assignments[gid];

    float min_dist = distances[gid * K];
    int closest = 0;

    for (uint k = 1; k < K; k++) {
        float d = distances[gid * K + k];
        if (d < min_dist) {
            min_dist = d;
            closest = int(k);
        }
    }

    assignments[gid] = closest;

    if (closest != old_cluster) {
        atomic_fetch_add_explicit(changed, 1, memory_order_relaxed);
    }
}

// Update centroids (parallel sum reduction)
kernel void sum_cluster_points(
    device const float* embeddings [[buffer(0)]],  // [N * D]
    device const int* assignments [[buffer(1)]],    // [N]
    device atomic_float* centroid_sums [[buffer(2)]], // [K * D]
    device atomic_int* cluster_counts [[buffer(3)]],  // [K]
    constant uint& N [[buffer(4)]],
    constant uint& D [[buffer(5)]],
    uint gid [[thread_position_in_grid]]
) {
    if (gid >= N) return;

    int cluster = assignments[gid];

    // Atomic add to centroid sum
    for (uint d = 0; d < D; d++) {
        atomic_fetch_add_explicit(
            &centroid_sums[cluster * D + d],
            embeddings[gid * D + d],
            memory_order_relaxed
        );
    }

    // Increment cluster count
    if (gid == 0 || assignments[gid] != assignments[gid - 1]) {
        atomic_fetch_add_explicit(&cluster_counts[cluster], 1, memory_order_relaxed);
    }
}

// Finalize centroids (divide by count)
kernel void finalize_centroids(
    device float* centroids [[buffer(0)]],         // [K * D]
    device const float* centroid_sums [[buffer(1)]], // [K * D]
    device const int* cluster_counts [[buffer(2)]],   // [K]
    constant uint& K [[buffer(3)]],
    constant uint& D [[buffer(4)]],
    uint2 gid [[thread_position_in_grid]]
) {
    uint k = gid.x;
    uint d = gid.y;

    if (k >= K || d >= D) return;

    int count = cluster_counts[k];
    if (count > 0) {
        centroids[k * D + d] = centroid_sums[k * D + d] / float(count);
    }
}
```

### Phase 2: Integration with Mimir (2-3 weeks)

**Goal**: Wire k-means clustering into Mimir's file indexing and search pipelines

#### 2.1 Add MCP Tool for Clustering

```typescript
// New tool: cluster_embeddings
{
    name: "cluster_embeddings",
    description: "Cluster all embeddings into semantic groups for faster related-document lookup",
    inputSchema: {
        type: "object",
        properties: {
            num_clusters: {
                type: "number",
                description: "Number of clusters (auto-detected if not specified)"
            },
            node_types: {
                type: "array",
                items: { type: "string" },
                description: "Node types to cluster (default: all)"
            }
        }
    }
}
```

#### 2.2 Enhance vector_search_nodes with Cluster Filtering

```typescript
// Enhanced vector_search_nodes
async function vectorSearchNodes(params: {
  query: string;
  limit?: number;
  types?: string[];
  use_clusters?: boolean; // NEW: Use pre-computed clusters
  cluster_expansion?: number; // NEW: Search N similar clusters
}) {
  // If clusters are available and enabled, use them
  if (params.use_clusters && clustersAvailable()) {
    // 1. Find query's nearest cluster
    const queryCluster = await findNearestCluster(queryEmbedding);

    // 2. Get similar clusters if expansion requested
    const searchClusters =
      params.cluster_expansion > 1
        ? await getSimilarClusters(queryCluster, params.cluster_expansion)
        : [queryCluster];

    // 3. Get candidates from clusters (O(1) per cluster)
    const candidates = await getClusterMembers(searchClusters);

    // 4. Refine with exact similarity
    return rankBySimilarity(queryEmbedding, candidates, params.limit);
  }

  // Fallback to full vector search
  return fullVectorSearch(queryEmbedding, params.limit);
}
```

#### 2.3 Auto-Cluster After Indexing

```go
// In pkg/inference/inference.go

func (e *InferenceEngine) OnIndexComplete(ctx context.Context) error {
    // After file indexing completes, trigger clustering
    if e.clusterIndex != nil && e.config.AutoClusterEnabled {
        go func() {
            if err := e.clusterIndex.Cluster(); err != nil {
                log.Printf("Auto-clustering failed: %v", err)
            } else {
                log.Printf("Clustered %d embeddings into %d clusters",
                    e.clusterIndex.Count(),
                    e.clusterIndex.NumClusters())
            }
        }()
    }
    return nil
}
```

### Phase 3: Real-Time Updates (3-4 weeks)

**Goal**: Implement the 3-tier system from K-MEANS-RT.md with proper safeguards

#### 3.1 Tier 1: Instant Reassignment

```go
// OnNodeUpdate handles real-time embedding changes
func (ci *ClusterIndex) OnNodeUpdate(nodeID string, newEmbedding []float32) error {
    if !ci.clustered {
        // No clustering yet, just update embedding
        return ci.EmbeddingIndex.Add(nodeID, newEmbedding)
    }

    ci.mu.Lock()
    defer ci.mu.Unlock()

    // Find nearest centroid (use GPU if available)
    newCluster := ci.findNearestCentroid(newEmbedding)

    idx, exists := ci.idToIndex[nodeID]
    if exists {
        oldCluster := ci.assignments[idx]
        if newCluster != oldCluster {
            // Update cluster membership
            ci.removeFromClusterMap(oldCluster, idx)
            ci.addToClusterMap(newCluster, idx)
            ci.assignments[idx] = newCluster

            // Track for batch centroid update
            ci.pendingUpdates = append(ci.pendingUpdates, nodeUpdate{
                idx:        idx,
                oldCluster: oldCluster,
                newCluster: newCluster,
            })
        }
    }

    // Update embedding
    return ci.EmbeddingIndex.Add(nodeID, newEmbedding)
}
```

#### 3.2 Tier 2: Batch Centroid Updates

```go
// Periodically called to update centroids based on accumulated changes
func (ci *ClusterIndex) updateCentroidsBatch() {
    ci.mu.Lock()
    updates := ci.pendingUpdates
    ci.pendingUpdates = nil
    ci.mu.Unlock()

    if len(updates) == 0 {
        return
    }

    // Group by affected clusters
    affectedClusters := make(map[int]bool)
    for _, u := range updates {
        affectedClusters[u.oldCluster] = true
        affectedClusters[u.newCluster] = true
    }

    // Recompute centroids only for affected clusters
    for clusterID := range affectedClusters {
        ci.recomputeCentroid(clusterID)
    }
}
```

#### 3.3 Tier 3: Scheduled Re-Clustering

```go
// Start background re-clustering worker
func (ci *ClusterIndex) StartClusterMaintenance(interval time.Duration) {
    go func() {
        ticker := time.NewTicker(interval)
        defer ticker.Stop()

        for range ticker.C {
            if ci.shouldRecluster() {
                log.Printf("Triggering full re-clustering (updates=%d, drift=%.4f)",
                    ci.updatesSinceCluster, ci.maxDrift())

                if err := ci.Cluster(); err != nil {
                    log.Printf("Re-clustering failed: %v", err)
                }
            }
        }
    }()
}

func (ci *ClusterIndex) shouldRecluster() bool {
    // Trigger if:
    // 1. Too many updates (>10% of dataset)
    if float64(ci.updatesSinceCluster) > float64(ci.Count())*0.1 {
        return true
    }

    // 2. High centroid drift
    if ci.maxDrift() > ci.config.DriftThreshold {
        return true
    }

    // 3. Time-based (every hour)
    if time.Since(ci.lastClusterTime) > time.Hour {
        return true
    }

    return false
}
```

### Phase 4: Testing & Benchmarking (2 weeks)

#### 4.1 Unit Tests

```go
// pkg/gpu/kmeans_test.go

func TestKMeansBasic(t *testing.T) {
    // Create test embeddings (3 clear clusters)
    // Dimensions are auto-detected from the embeddings themselves
    dims := 1024 // Example: mxbai-embed-large
    embeddings := generateClusteredData(1000, 3, dims)

    manager, _ := NewManager(DefaultConfig())
    index := NewClusterIndex(manager, nil, &KMeansConfig{
        NumClusters:   3,
        MaxIterations: 100,
    })

    for i, emb := range embeddings {
        index.Add(fmt.Sprintf("node-%d", i), emb)
    }

    err := index.Cluster()
    require.NoError(t, err)

    // Verify cluster quality
    stats := index.ClusterStats()
    assert.Equal(t, 3, stats.NumClusters)
    assert.InDelta(t, 333, stats.AvgClusterSize, 50)
}

func TestKMeansGPUvsCPU(t *testing.T) {
    dims := 1024 // Dimensions auto-detected when embeddings are added
    embeddings := generateRandomData(10000, dims)

    // CPU clustering
    cpuConfig := DefaultConfig()
    cpuConfig.Enabled = false
    cpuManager, _ := NewManager(cpuConfig)
    cpuIndex := NewClusterIndex(cpuManager, nil, nil)
    // ... add embeddings ...
    cpuStart := time.Now()
    cpuIndex.Cluster()
    cpuTime := time.Since(cpuStart)

    // GPU clustering
    gpuConfig := DefaultConfig()
    gpuConfig.Enabled = true
    gpuManager, _ := NewManager(gpuConfig)
    gpuIndex := NewClusterIndex(gpuManager, nil, nil)
    // ... add embeddings ...
    gpuStart := time.Now()
    gpuIndex.Cluster()
    gpuTime := time.Since(gpuStart)

    // GPU should be at least 10x faster
    t.Logf("CPU: %v, GPU: %v, Speedup: %.1fx",
        cpuTime, gpuTime, float64(cpuTime)/float64(gpuTime))

    if gpuManager.IsEnabled() {
        assert.Less(t, gpuTime, cpuTime/10)
    }
}
```

#### 4.2 Benchmark Suite

```go
func BenchmarkKMeansCluster(b *testing.B) {
    sizes := []int{1000, 10000, 100000}
    clusters := []int{10, 100, 500}
    dimensionSizes := []int{768, 1024, 1536} // Test common embedding model dimensions

    for _, dims := range dimensionSizes {
        for _, n := range sizes {
            for _, k := range clusters {
                b.Run(fmt.Sprintf("N=%d_K=%d_D=%d", n, k, dims), func(b *testing.B) {
                    embeddings := generateRandomData(n, dims)
                    index := setupClusterIndex(embeddings, k) // Dimensions auto-detected

                b.ResetTimer()
                for i := 0; i < b.N; i++ {
                    index.Cluster()
                }
            })
        }
    }
}

func BenchmarkClusterSearch(b *testing.B) {
    // Compare cluster-accelerated search vs brute-force
    // Dimensions auto-detected from indexed embeddings
    index := setupClusteredIndex(100000, 500)
    dims := index.Dimensions() // Get auto-detected dimensions
    query := randomEmbedding(dims)

    b.Run("ClusterSearch", func(b *testing.B) {
        for i := 0; i < b.N; i++ {
            index.SearchWithClusters(query, 10, 3) // Expand to 3 clusters
        }
    })

    b.Run("BruteForceSearch", func(b *testing.B) {
        for i := 0; i < b.N; i++ {
            index.Search(query, 10) // Full vector scan
        }
    })
}
```

---

## Part 3: Configuration

### 3.1 YAML Configuration

```yaml
# nornicdb.example.yaml (additions)

clustering:
  # Enable k-means clustering
  enabled: true

  # Cluster configuration
  num_clusters: 0 # 0 = auto-detect
  # Note: dimensions are auto-detected from embeddings, no config needed
  max_iterations: 100
  tolerance: 0.0001
  init_method: "kmeans++" # "kmeans++" or "random"

  # Auto-clustering triggers
  auto_cluster_on_index: true
  auto_cluster_threshold: 1000 # Min embeddings before clustering

  # Real-time updates (3-tier system)
  realtime:
    enabled: true
    batch_size: 100 # Tier 2 batch threshold
    recluster_threshold: 10000 # Tier 3 update threshold
    recluster_interval: "1h" # Tier 3 time threshold
    drift_threshold: 0.1 # Tier 3 drift threshold

  # GPU settings
  gpu:
    enabled: true
    device: "auto" # "auto", "metal", "cuda"
    max_memory_mb: 4096
```

### 3.2 Environment Variables

```bash
# Enable clustering
export NORNICDB_CLUSTERING_ENABLED=true

# Cluster count (0 = auto)
export NORNICDB_CLUSTERING_NUM_CLUSTERS=500

# Note: Embedding dimensions are auto-detected from the data
# No configuration needed - works with any model (768, 1024, 1536, etc.)

# GPU device
export NORNICDB_CLUSTERING_DEVICE=auto

# Real-time settings
export NORNICDB_CLUSTERING_REALTIME_ENABLED=true
export NORNICDB_CLUSTERING_BATCH_SIZE=100
export NORNICDB_CLUSTERING_RECLUSTER_THRESHOLD=10000
```

---

## Part 4: Timeline & Resources

### Timeline

| Phase                | Duration       | Dependencies | Deliverables                                  |
| -------------------- | -------------- | ------------ | --------------------------------------------- |
| Phase 1: Foundation  | 2-3 weeks      | None         | CPU k-means, Metal kernel, basic ClusterIndex |
| Phase 2: Integration | 2-3 weeks      | Phase 1      | MCP tools, enhanced search, auto-clustering   |
| Phase 3: Real-Time   | 3-4 weeks      | Phase 2      | 3-tier system, maintenance workers            |
| Phase 4: Testing     | 2 weeks        | Phase 3      | Benchmarks, documentation                     |
| **Total**            | **9-12 weeks** |              |                                               |

### Resource Requirements

**Development:**

- 1 Go developer familiar with GPU/Metal/CUDA
- Access to macOS (for Metal testing) and Linux with NVIDIA GPU (for CUDA testing)

**Hardware for Testing:**

- MacBook with M1/M2/M3 (Metal)
- Linux box with RTX 3080+ (CUDA)
- CI runners for both platforms

**Dependencies:**

- No new Go dependencies (Metal/CUDA already wrapped)
- Metal shader compiler (Xcode)
- CUDA toolkit 11.x+ (for NVIDIA testing)

---

## Part 5: Risk Assessment

### High Risk

| Risk                                  | Mitigation                                         |
| ------------------------------------- | -------------------------------------------------- |
| GPU kernel bugs causing crashes       | Extensive CPU fallback, fuzzing tests              |
| Performance regression on CPU path    | Benchmark gates in CI                              |
| Cluster quality degradation over time | Automated quality monitoring, forced re-clustering |

### Medium Risk

| Risk                              | Mitigation                                       |
| --------------------------------- | ------------------------------------------------ |
| Memory pressure on large datasets | Configurable memory limits, streaming clustering |
| Lock contention under high load   | Consider lock-free structures in Phase 4         |
| Cross-platform GPU issues         | Comprehensive platform testing matrix            |

### Low Risk

| Risk                     | Mitigation                              |
| ------------------------ | --------------------------------------- |
| API breaking changes     | Version MCP tools, deprecation warnings |
| Configuration complexity | Sensible defaults, documentation        |

---

## Part 6: Success Metrics

### Performance Targets

| Metric                                  | Target              | Measurement |
| --------------------------------------- | ------------------- | ----------- |
| Clustering 10K embeddings               | <100ms (GPU)        | Benchmark   |
| Clustering 100K embeddings              | <1s (GPU)           | Benchmark   |
| Single-node reassignment                | <1ms                | Benchmark   |
| Related-document lookup                 | <10ms               | E2E test    |
| Search speedup (cluster vs brute-force) | >10x for 100K nodes | Benchmark   |

### Quality Targets

| Metric                          | Target | Measurement   |
| ------------------------------- | ------ | ------------- |
| Cluster purity (synthetic data) | >0.85  | Unit test     |
| Search recall@10 vs brute-force | >0.95  | Benchmark     |
| CPU fallback coverage           | 100%   | Test coverage |

---

## Conclusion

GPU k-means clustering is a valuable enhancement for Mimir/NornicDB that can dramatically improve related-document discovery and semantic search performance. The existing GPU infrastructure in `pkg/gpu/` provides a solid foundation.

**Key Recommendations:**

1. **Start with CPU k-means** - Get the algorithm right before optimizing
2. **Metal first, CUDA second** - macOS is the primary development platform
3. **Prioritize the hybrid search flow** - This delivers the most user value
4. **Don't over-engineer real-time updates initially** - Start with Tier 1 only

**Next Steps:**

1. Review this plan with the team
2. Create tracking issues for each phase
3. Begin Phase 1 implementation

---

_Document Version: 1.0_  
_Last Updated: November 2025_  
_Based on: K-MEANS.md, K-MEANS-RT.md, and NornicDB source analysis_
