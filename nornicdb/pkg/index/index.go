// Package index provides vector and full-text indexing for NornicDB.
package index

import (
	"context"
	"sync"
)

// SearchResult represents a search result with score.
type SearchResult struct {
	ID    string
	Score float64
}

// HNSWIndex provides HNSW-based vector similarity search.
type HNSWIndex struct {
	dimensions int
	mu         sync.RWMutex
	
	// Internal HNSW structure
	// Will use github.com/viterin/vek for SIMD operations
	vectors map[string][]float32
	
	// HNSW parameters
	M              int     // Max connections per layer
	efConstruction int     // Size of dynamic list during construction
	efSearch       int     // Size of dynamic list during search
}

// HNSWConfig holds HNSW index configuration.
type HNSWConfig struct {
	Dimensions     int
	M              int     // Default: 16
	EfConstruction int     // Default: 200
	EfSearch       int     // Default: 100
}

// DefaultHNSWConfig returns sensible defaults.
func DefaultHNSWConfig(dimensions int) *HNSWConfig {
	return &HNSWConfig{
		Dimensions:     dimensions,
		M:              16,
		EfConstruction: 200,
		EfSearch:       100,
	}
}

// NewHNSW creates a new HNSW index.
func NewHNSW(config *HNSWConfig) *HNSWIndex {
	return &HNSWIndex{
		dimensions:     config.Dimensions,
		M:              config.M,
		efConstruction: config.EfConstruction,
		efSearch:       config.EfSearch,
		vectors:        make(map[string][]float32),
	}
}

// Add adds a vector to the index.
func (h *HNSWIndex) Add(id string, vector []float32) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(vector) != h.dimensions {
		return ErrDimensionMismatch
	}

	// TODO: Implement HNSW insertion
	// For now, just store in map (brute force fallback)
	h.vectors[id] = vector

	return nil
}

// Remove removes a vector from the index.
func (h *HNSWIndex) Remove(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.vectors, id)
	return nil
}

// Search finds the k nearest neighbors.
func (h *HNSWIndex) Search(ctx context.Context, query []float32, k int, threshold float64) ([]SearchResult, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if len(query) != h.dimensions {
		return nil, ErrDimensionMismatch
	}

	// TODO: Implement HNSW search
	// For now, brute force cosine similarity
	results := make([]SearchResult, 0, k)
	
	for id, vec := range h.vectors {
		score := cosineSimilarity(query, vec)
		if score >= threshold {
			results = append(results, SearchResult{ID: id, Score: score})
		}
	}

	// Sort by score descending
	sortResultsByScore(results)

	// Limit to k
	if len(results) > k {
		results = results[:k]
	}

	return results, nil
}

// cosineSimilarity calculates cosine similarity between two vectors.
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}

	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += float64(a[i] * b[i])
		normA += float64(a[i] * a[i])
		normB += float64(b[i] * b[i])
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	return dotProduct / (sqrt(normA) * sqrt(normB))
}

func sqrt(x float64) float64 {
	// Simple sqrt implementation
	if x < 0 {
		return 0
	}
	z := x / 2
	for i := 0; i < 10; i++ {
		z = z - (z*z-x)/(2*z)
	}
	return z
}

func sortResultsByScore(results []SearchResult) {
	// Simple bubble sort for now
	for i := 0; i < len(results)-1; i++ {
		for j := 0; j < len(results)-i-1; j++ {
			if results[j].Score < results[j+1].Score {
				results[j], results[j+1] = results[j+1], results[j]
			}
		}
	}
}

// BleveIndex provides full-text search using Bleve.
type BleveIndex struct {
	// index bleve.Index
	mu sync.RWMutex
}

// NewBleve creates a new Bleve full-text index.
func NewBleve(path string) (*BleveIndex, error) {
	// TODO: Open or create Bleve index
	return &BleveIndex{}, nil
}

// Index adds a document to the full-text index.
func (b *BleveIndex) Index(id string, content string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// TODO: Index in Bleve
	return nil
}

// Delete removes a document from the index.
func (b *BleveIndex) Delete(id string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// TODO: Delete from Bleve
	return nil
}

// Search performs a full-text search.
func (b *BleveIndex) Search(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	// TODO: Search Bleve
	return nil, nil
}

// Close closes the index.
func (b *BleveIndex) Close() error {
	// return b.index.Close()
	return nil
}

// Errors
var (
	ErrDimensionMismatch = &IndexError{Message: "vector dimension mismatch"}
	ErrNotFound          = &IndexError{Message: "not found"}
)

// IndexError represents an index error.
type IndexError struct {
	Message string
}

func (e *IndexError) Error() string {
	return e.Message
}
