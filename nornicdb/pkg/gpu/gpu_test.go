// Package gpu tests for GPU acceleration.
package gpu

import (
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()

	if config.Enabled {
		t.Error("GPU should be disabled by default")
	}
	if config.PreferredBackend != BackendNone {
		t.Error("preferred backend should be none by default")
	}
	if config.BatchSize != 10000 {
		t.Errorf("expected batch size 10000, got %d", config.BatchSize)
	}
	if !config.FallbackOnError {
		t.Error("fallback on error should be true by default")
	}
}

func TestNewManager(t *testing.T) {
	t.Run("disabled by default", func(t *testing.T) {
		m, err := NewManager(nil)
		if err != nil {
			t.Fatalf("NewManager() error = %v", err)
		}
		if m.IsEnabled() {
			t.Error("should be disabled by default")
		}
	})

	t.Run("with config disabled", func(t *testing.T) {
		config := &Config{Enabled: false}
		m, err := NewManager(config)
		if err != nil {
			t.Fatalf("NewManager() error = %v", err)
		}
		if m.IsEnabled() {
			t.Error("should be disabled")
		}
	})

	t.Run("enabled with fallback", func(t *testing.T) {
		config := &Config{
			Enabled:         true,
			FallbackOnError: true,
		}
		m, err := NewManager(config)
		if err != nil {
			t.Fatalf("NewManager() error = %v", err)
		}
		// Should fall back to disabled since no GPU available
		if m.IsEnabled() {
			t.Error("should fall back to disabled without GPU")
		}
	})

	t.Run("enabled without fallback", func(t *testing.T) {
		config := &Config{
			Enabled:         true,
			FallbackOnError: false,
		}
		_, err := NewManager(config)
		if err == nil {
			// If no GPU is available, should error
			// But this test may pass on GPU-equipped machines
		}
	})
}

func TestManagerEnableDisable(t *testing.T) {
	m, _ := NewManager(nil)

	if m.IsEnabled() {
		t.Error("should start disabled")
	}

	// Enable should fail without GPU
	err := m.Enable()
	if err == nil {
		// Only passes if GPU is available
		m.Disable()
		if m.IsEnabled() {
			t.Error("should be disabled after Disable()")
		}
	}

	// Disable should be safe to call when already disabled
	m.Disable()
	if m.IsEnabled() {
		t.Error("should remain disabled")
	}
}

func TestManagerDevice(t *testing.T) {
	m, _ := NewManager(nil)

	// Device() returns nil when no GPU
	dev := m.Device()
	if dev != nil {
		t.Error("Device() should return nil when no GPU")
	}
}

func TestManagerStats(t *testing.T) {
	m, _ := NewManager(nil)
	stats := m.Stats()

	if stats.OperationsGPU != 0 {
		t.Error("initial GPU ops should be 0")
	}
	if stats.OperationsCPU != 0 {
		t.Error("initial CPU ops should be 0")
	}
}

func TestManagerAllocatedMemory(t *testing.T) {
	m, _ := NewManager(nil)

	if m.AllocatedMemoryMB() != 0 {
		t.Error("initial allocated memory should be 0")
	}
}

func TestVectorIndex(t *testing.T) {
	m, _ := NewManager(nil)
	vi := NewVectorIndex(m, 3)

	t.Run("add and search", func(t *testing.T) {
		err := vi.Add("vec1", []float32{1, 0, 0})
		if err != nil {
			t.Fatalf("Add() error = %v", err)
		}

		err = vi.Add("vec2", []float32{0, 1, 0})
		if err != nil {
			t.Fatalf("Add() error = %v", err)
		}

		err = vi.Add("vec3", []float32{0.9, 0.1, 0})
		if err != nil {
			t.Fatalf("Add() error = %v", err)
		}

		results, err := vi.Search([]float32{1, 0, 0}, 2)
		if err != nil {
			t.Fatalf("Search() error = %v", err)
		}

		if len(results) != 2 {
			t.Errorf("expected 2 results, got %d", len(results))
		}

		// First result should be vec1 (exact match)
		if results[0].ID != "vec1" {
			t.Errorf("expected vec1, got %s", results[0].ID)
		}
		if results[0].Score < 0.99 {
			t.Errorf("expected score ~1.0, got %f", results[0].Score)
		}

		// Second should be vec3 (similar)
		if results[1].ID != "vec3" {
			t.Errorf("expected vec3, got %s", results[1].ID)
		}
	})

	t.Run("dimension mismatch", func(t *testing.T) {
		err := vi.Add("bad", []float32{1, 2}) // Wrong dimensions
		if err != ErrInvalidDimensions {
			t.Errorf("expected ErrInvalidDimensions, got %v", err)
		}

		_, err = vi.Search([]float32{1, 2}, 1)
		if err != ErrInvalidDimensions {
			t.Errorf("expected ErrInvalidDimensions, got %v", err)
		}
	})

	t.Run("search more than available", func(t *testing.T) {
		results, err := vi.Search([]float32{1, 0, 0}, 100)
		if err != nil {
			t.Fatalf("Search() error = %v", err)
		}
		if len(results) != 3 {
			t.Errorf("expected 3 results, got %d", len(results))
		}
	})

	t.Run("empty index", func(t *testing.T) {
		emptyVI := NewVectorIndex(m, 3)
		results, err := emptyVI.Search([]float32{1, 0, 0}, 5)
		if err != nil {
			t.Fatalf("Search() error = %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 results, got %d", len(results))
		}
	})
}

func TestCosineSimilarity(t *testing.T) {
	tests := []struct {
		name     string
		a        []float32
		b        []float32
		expected float32
		delta    float32
	}{
		{
			name:     "identical",
			a:        []float32{1, 0, 0},
			b:        []float32{1, 0, 0},
			expected: 1.0,
			delta:    0.01,
		},
		{
			name:     "orthogonal",
			a:        []float32{1, 0, 0},
			b:        []float32{0, 1, 0},
			expected: 0.0,
			delta:    0.01,
		},
		{
			name:     "opposite",
			a:        []float32{1, 0, 0},
			b:        []float32{-1, 0, 0},
			expected: -1.0,
			delta:    0.01,
		},
		{
			name:     "different lengths",
			a:        []float32{1, 2},
			b:        []float32{1, 2, 3},
			expected: 0.0,
			delta:    0.01,
		},
		{
			name:     "zero vector",
			a:        []float32{0, 0, 0},
			b:        []float32{1, 0, 0},
			expected: 0.0,
			delta:    0.01,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cosineSimilarity(tt.a, tt.b)
			if result < tt.expected-tt.delta || result > tt.expected+tt.delta {
				t.Errorf("expected %f, got %f", tt.expected, result)
			}
		})
	}
}

func TestSqrt32(t *testing.T) {
	tests := []struct {
		input    float32
		expected float32
		delta    float32
	}{
		{4, 2, 0.001},
		{9, 3, 0.001},
		{16, 4, 0.001},
		{0, 0, 0.001},
		{-1, 0, 0.001},
		{1, 1, 0.001},
		{2, 1.414, 0.01},
	}

	for _, tt := range tests {
		result := sqrt32(tt.input)
		if result < tt.expected-tt.delta || result > tt.expected+tt.delta {
			t.Errorf("sqrt32(%f) = %f, expected %f", tt.input, result, tt.expected)
		}
	}
}

// REMOVED: TestTransactionBuffer
// TransactionBuffer has been removed from the codebase as it provided
// no actual GPU benefit - it was just a map wrapper with no GPU operations.

// REMOVED: TestGraphAccelerator
// GraphAccelerator has been removed from the codebase as all methods
// were unimplemented TODOs with CPU fallbacks. Complex to implement,
// low ROI compared to focusing on EmbeddingIndex vector search.

func TestListDevices(t *testing.T) {
	devices, err := ListDevices()
	// Expected to fail without GPU
	if err != ErrGPUNotAvailable {
		if devices != nil {
			t.Logf("Found %d GPU devices", len(devices))
		}
	}
}

func TestBenchmarkDevice(t *testing.T) {
	_, err := BenchmarkDevice(0)
	// Expected to fail without GPU
	if err != ErrGPUNotAvailable {
		t.Log("Benchmark ran on GPU")
	}
}

func TestBackendConstants(t *testing.T) {
	if BackendNone != "none" {
		t.Error("BackendNone should be 'none'")
	}
	if BackendOpenCL != "opencl" {
		t.Error("BackendOpenCL should be 'opencl'")
	}
	if BackendCUDA != "cuda" {
		t.Error("BackendCUDA should be 'cuda'")
	}
	if BackendMetal != "metal" {
		t.Error("BackendMetal should be 'metal'")
	}
	if BackendVulkan != "vulkan" {
		t.Error("BackendVulkan should be 'vulkan'")
	}
}

// REMOVED: TestBufferType
// BufferType enum has been removed as part of simplification.
// No longer needed without TransactionBuffer and complex buffer management.

func TestErrors(t *testing.T) {
	errors := []error{
		ErrGPUNotAvailable,
		ErrGPUDisabled,
		ErrOutOfMemory,
		ErrKernelFailed,
		ErrDataTooLarge,
		ErrInvalidDimensions,
	}

	for _, err := range errors {
		if err == nil {
			t.Error("error should not be nil")
		}
		if err.Error() == "" {
			t.Error("error message should not be empty")
		}
	}
}

func TestSearchResult(t *testing.T) {
	sr := SearchResult{
		ID:       "test",
		Score:    0.95,
		Distance: 0.05,
	}

	if sr.ID != "test" {
		t.Error("ID mismatch")
	}
	if sr.Score != 0.95 {
		t.Error("Score mismatch")
	}
	if sr.Distance != 0.05 {
		t.Error("Distance mismatch")
	}
}

func TestDeviceInfo(t *testing.T) {
	di := DeviceInfo{
		ID:           0,
		Name:         "Test GPU",
		Vendor:       "Test Vendor",
		Backend:      BackendOpenCL,
		MemoryMB:     4096,
		ComputeUnits: 32,
		MaxWorkGroup: 256,
		Available:    true,
	}

	if di.ID != 0 {
		t.Error("ID mismatch")
	}
	if di.Name != "Test GPU" {
		t.Error("Name mismatch")
	}
	if di.MemoryMB != 4096 {
		t.Error("MemoryMB mismatch")
	}
}

func TestBenchmarkResult(t *testing.T) {
	br := BenchmarkResult{
		DeviceID:          0,
		VectorOpsPerSec:   1000000,
		MemoryBandwidthGB: 200.5,
		LatencyUs:         10,
	}

	if br.VectorOpsPerSec != 1000000 {
		t.Error("VectorOpsPerSec mismatch")
	}
}

func BenchmarkCosineSimilarity(b *testing.B) {
	a := make([]float32, 1024)
	c := make([]float32, 1024)
	for i := range a {
		a[i] = float32(i) / 1024
		c[i] = float32(1024-i) / 1024
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cosineSimilarity(a, c)
	}
}

func BenchmarkVectorSearch(b *testing.B) {
	m, _ := NewManager(nil)
	vi := NewVectorIndex(m, 128)

	// Add 1000 vectors
	for i := 0; i < 1000; i++ {
		vec := make([]float32, 128)
		for j := range vec {
			vec[j] = float32(i*j) / 128000
		}
		vi.Add(string(rune(i)), vec)
	}

	query := make([]float32, 128)
	for i := range query {
		query[i] = 0.5
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		vi.Search(query, 10)
	}
}

// =============================================================================
// EmbeddingIndex Tests - Optimized {nodeId, embedding} GPU storage
// =============================================================================

func TestDefaultEmbeddingIndexConfig(t *testing.T) {
	config := DefaultEmbeddingIndexConfig(1024)

	if config.Dimensions != 1024 {
		t.Errorf("expected 1024 dimensions, got %d", config.Dimensions)
	}
	if config.InitialCap != 10000 {
		t.Errorf("expected 10000 initial cap, got %d", config.InitialCap)
	}
	if !config.GPUEnabled {
		t.Error("GPU should be enabled by default")
	}
	if !config.AutoSync {
		t.Error("AutoSync should be enabled by default")
	}
}

func TestNewEmbeddingIndex(t *testing.T) {
	m, _ := NewManager(nil)

	t.Run("with config", func(t *testing.T) {
		config := &EmbeddingIndexConfig{
			Dimensions: 512,
			InitialCap: 5000,
		}
		ei := NewEmbeddingIndex(m, config)

		if ei.dimensions != 512 {
			t.Errorf("expected 512 dimensions, got %d", ei.dimensions)
		}
	})

	t.Run("nil config", func(t *testing.T) {
		ei := NewEmbeddingIndex(m, nil)
		if ei.dimensions != 1024 {
			t.Errorf("expected 1024 default dimensions, got %d", ei.dimensions)
		}
	})
}

func TestEmbeddingIndexAddAndSearch(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 4, InitialCap: 100}
	ei := NewEmbeddingIndex(m, config)

	// Add embeddings
	ei.Add("node-1", []float32{1, 0, 0, 0})
	ei.Add("node-2", []float32{0, 1, 0, 0})
	ei.Add("node-3", []float32{0.9, 0.1, 0, 0})
	ei.Add("node-4", []float32{0, 0, 1, 0})

	if ei.Count() != 4 {
		t.Errorf("expected count 4, got %d", ei.Count())
	}

	// Search for similar to [1,0,0,0]
	results, err := ei.Search([]float32{1, 0, 0, 0}, 2)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}

	// First should be node-1 (exact match)
	if results[0].ID != "node-1" {
		t.Errorf("expected node-1, got %s", results[0].ID)
	}
	if results[0].Score < 0.99 {
		t.Errorf("expected score ~1.0, got %f", results[0].Score)
	}

	// Second should be node-3 (most similar)
	if results[1].ID != "node-3" {
		t.Errorf("expected node-3, got %s", results[1].ID)
	}
}

func TestEmbeddingIndexUpdate(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	// Add initial
	ei.Add("node-1", []float32{1, 0, 0})

	// Update
	ei.Add("node-1", []float32{0, 1, 0})

	// Count should still be 1
	if ei.Count() != 1 {
		t.Errorf("expected count 1 after update, got %d", ei.Count())
	}

	// Get should return updated value
	vec, ok := ei.Get("node-1")
	if !ok {
		t.Fatal("Get() failed")
	}
	if vec[0] != 0 || vec[1] != 1 {
		t.Errorf("expected [0,1,0], got %v", vec)
	}
}

func TestEmbeddingIndexAddBatch(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	nodeIDs := []string{"a", "b", "c"}
	embeddings := [][]float32{
		{1, 0, 0},
		{0, 1, 0},
		{0, 0, 1},
	}

	err := ei.AddBatch(nodeIDs, embeddings)
	if err != nil {
		t.Fatalf("AddBatch() error = %v", err)
	}

	if ei.Count() != 3 {
		t.Errorf("expected count 3, got %d", ei.Count())
	}

	// Test mismatch
	err = ei.AddBatch([]string{"x"}, [][]float32{{1, 0, 0}, {0, 1, 0}})
	if err == nil {
		t.Error("expected error for mismatched lengths")
	}

	// Test wrong dimensions
	err = ei.AddBatch([]string{"y"}, [][]float32{{1, 0}})
	if err != ErrInvalidDimensions {
		t.Errorf("expected ErrInvalidDimensions, got %v", err)
	}
}

func TestEmbeddingIndexRemove(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	ei.Add("a", []float32{1, 0, 0})
	ei.Add("b", []float32{0, 1, 0})
	ei.Add("c", []float32{0, 0, 1})

	// Remove middle element
	removed := ei.Remove("b")
	if !removed {
		t.Error("Remove() should return true")
	}

	if ei.Count() != 2 {
		t.Errorf("expected count 2, got %d", ei.Count())
	}

	if ei.Has("b") {
		t.Error("b should be removed")
	}

	// Remove non-existent
	removed = ei.Remove("nonexistent")
	if removed {
		t.Error("Remove() should return false for non-existent")
	}

	// Remaining elements should still be accessible
	if !ei.Has("a") || !ei.Has("c") {
		t.Error("a and c should still exist")
	}
}

func TestEmbeddingIndexHasAndGet(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	ei.Add("exists", []float32{1, 2, 3})

	if !ei.Has("exists") {
		t.Error("Has() should return true")
	}
	if ei.Has("not-exists") {
		t.Error("Has() should return false")
	}

	vec, ok := ei.Get("exists")
	if !ok {
		t.Error("Get() should return true")
	}
	if vec[0] != 1 || vec[1] != 2 || vec[2] != 3 {
		t.Errorf("expected [1,2,3], got %v", vec)
	}

	_, ok = ei.Get("not-exists")
	if ok {
		t.Error("Get() should return false for non-existent")
	}
}

func TestEmbeddingIndexClear(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	ei.Add("a", []float32{1, 0, 0})
	ei.Add("b", []float32{0, 1, 0})

	ei.Clear()

	if ei.Count() != 0 {
		t.Errorf("expected count 0, got %d", ei.Count())
	}
}

func TestEmbeddingIndexMemoryUsage(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 1024}
	ei := NewEmbeddingIndex(m, config)

	// Add 1000 embeddings
	for i := 0; i < 1000; i++ {
		vec := make([]float32, 1024)
		ei.Add(string(rune('a'+i%26))+string(rune(i)), vec)
	}

	mb := ei.MemoryUsageMB()
	// 1000 * (1024 * 4 + 32) / 1024 / 1024 ≈ 3.9 MB
	if mb < 3 || mb > 5 {
		t.Errorf("expected ~4MB, got %f", mb)
	}
}

func TestEmbeddingIndexStats(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	ei.Add("a", []float32{1, 0, 0})
	ei.Search([]float32{1, 0, 0}, 1)
	ei.Search([]float32{0, 1, 0}, 1)

	stats := ei.Stats()

	if stats.Count != 1 {
		t.Errorf("expected count 1, got %d", stats.Count)
	}
	if stats.Dimensions != 3 {
		t.Errorf("expected 3 dimensions, got %d", stats.Dimensions)
	}
	if stats.SearchesCPU != 2 {
		t.Errorf("expected 2 CPU searches, got %d", stats.SearchesCPU)
	}
}

func TestEmbeddingIndexSyncToGPU(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	ei.Add("a", []float32{1, 0, 0})

	// Should fail - GPU not enabled
	err := ei.SyncToGPU()
	if err != ErrGPUDisabled {
		t.Errorf("expected ErrGPUDisabled, got %v", err)
	}
}

func TestEmbeddingIndexSerializeDeserialize(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	// Add data
	ei.Add("node-1", []float32{1.5, 2.5, 3.5})
	ei.Add("node-2", []float32{4.5, 5.5, 6.5})

	// Serialize
	data, err := ei.Serialize()
	if err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Create new index and deserialize
	ei2 := NewEmbeddingIndex(m, config)
	err = ei2.Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize() error = %v", err)
	}

	// Verify
	if ei2.Count() != 2 {
		t.Errorf("expected count 2, got %d", ei2.Count())
	}

	vec, ok := ei2.Get("node-1")
	if !ok {
		t.Fatal("Get() failed")
	}
	if vec[0] != 1.5 || vec[1] != 2.5 || vec[2] != 3.5 {
		t.Errorf("expected [1.5,2.5,3.5], got %v", vec)
	}
}

func TestEmbeddingIndexSerializeEmpty(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	data, err := ei.Serialize()
	if err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	ei2 := NewEmbeddingIndex(m, config)
	err = ei2.Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize() error = %v", err)
	}

	if ei2.Count() != 0 {
		t.Errorf("expected count 0, got %d", ei2.Count())
	}
}

func TestEmbeddingIndexDeserializeErrors(t *testing.T) {
	m, _ := NewManager(nil)

	t.Run("too short", func(t *testing.T) {
		config := &EmbeddingIndexConfig{Dimensions: 3}
		ei := NewEmbeddingIndex(m, config)

		err := ei.Deserialize([]byte{0, 0, 0})
		if err == nil {
			t.Error("expected error for short data")
		}
	})

	t.Run("dimension mismatch", func(t *testing.T) {
		config := &EmbeddingIndexConfig{Dimensions: 3}
		ei := NewEmbeddingIndex(m, config)

		// Create data with dimensions=5
		data := []byte{
			5, 0, 0, 0, // dims = 5
			0, 0, 0, 0, // count = 0
		}

		err := ei.Deserialize(data)
		if err != ErrInvalidDimensions {
			t.Errorf("expected ErrInvalidDimensions, got %v", err)
		}
	})
}

func TestEmbeddingIndexSearchEmpty(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	results, err := ei.Search([]float32{1, 0, 0}, 5)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results, got %v", results)
	}
}

func TestEmbeddingIndexSearchDimensionMismatch(t *testing.T) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 3}
	ei := NewEmbeddingIndex(m, config)

	ei.Add("a", []float32{1, 0, 0})

	_, err := ei.Search([]float32{1, 0}, 1) // Wrong dimensions
	if err != ErrInvalidDimensions {
		t.Errorf("expected ErrInvalidDimensions, got %v", err)
	}
}

func TestPartialSort(t *testing.T) {
	scores := []float32{0.1, 0.9, 0.5, 0.3, 0.7}
	indices := []int{0, 1, 2, 3, 4}

	partialSort(indices, scores, 3)

	// Top 3 should be in first 3 positions (sorted by score descending)
	if scores[indices[0]] != 0.9 {
		t.Errorf("expected top score 0.9, got %f", scores[indices[0]])
	}
	if scores[indices[1]] != 0.7 {
		t.Errorf("expected second score 0.7, got %f", scores[indices[1]])
	}
	if scores[indices[2]] != 0.5 {
		t.Errorf("expected third score 0.5, got %f", scores[indices[2]])
	}
}

func TestCosineSimilarityFlat(t *testing.T) {
	a := []float32{1, 0, 0}
	b := []float32{1, 0, 0}

	sim := cosineSimilarityFlat(a, b)
	if sim < 0.99 {
		t.Errorf("expected ~1.0, got %f", sim)
	}

	c := []float32{0, 1, 0}
	sim = cosineSimilarityFlat(a, c)
	if sim > 0.01 || sim < -0.01 {
		t.Errorf("expected ~0.0, got %f", sim)
	}
}

func TestFloatConversion(t *testing.T) {
	f := float32(3.14159)
	u := floatToUint32(f)
	f2 := uint32ToFloat(u)

	if f != f2 {
		t.Errorf("round trip failed: %f != %f", f, f2)
	}
}

func BenchmarkEmbeddingIndexSearch(b *testing.B) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 1024, InitialCap: 10000}
	ei := NewEmbeddingIndex(m, config)

	// Add 10K embeddings
	for i := 0; i < 10000; i++ {
		vec := make([]float32, 1024)
		for j := range vec {
			vec[j] = float32(i*j%1000) / 1000
		}
		ei.Add(string(rune(i)), vec)
	}

	query := make([]float32, 1024)
	for i := range query {
		query[i] = 0.5
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ei.Search(query, 10)
	}
}

func BenchmarkEmbeddingIndexAdd(b *testing.B) {
	m, _ := NewManager(nil)
	config := &EmbeddingIndexConfig{Dimensions: 1024}
	ei := NewEmbeddingIndex(m, config)

	vec := make([]float32, 1024)
	for i := range vec {
		vec[i] = float32(i) / 1024
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ei.Add(string(rune(i%65536)), vec)
	}
}
