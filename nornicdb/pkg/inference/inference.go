// Package inference provides automatic relationship detection for NornicDB.
package inference

import (
	"context"
	"sync"
	"time"
)

// EdgeSuggestion represents a suggested edge.
type EdgeSuggestion struct {
	SourceID   string
	TargetID   string
	Type       string
	Confidence float64
	Reason     string
	Method     string // similarity, co_access, temporal, transitive
}

// Config holds inference engine configuration.
type Config struct {
	// Similarity-based linking
	SimilarityThreshold float64 // Default: 0.82
	SimilarityTopK      int     // How many similar nodes to check

	// Co-access pattern detection
	CoAccessEnabled     bool
	CoAccessWindow      time.Duration // Time window for co-access
	CoAccessMinCount    int           // Minimum co-accesses to suggest edge

	// Temporal proximity
	TemporalEnabled     bool
	TemporalWindow      time.Duration // Window for "same session"

	// Transitive inference
	TransitiveEnabled   bool
	TransitiveMinConf   float64 // Minimum confidence for transitive edges
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		SimilarityThreshold: 0.82,
		SimilarityTopK:      10,
		CoAccessEnabled:     true,
		CoAccessWindow:      30 * time.Second,
		CoAccessMinCount:    3,
		TemporalEnabled:     true,
		TemporalWindow:      30 * time.Minute,
		TransitiveEnabled:   true,
		TransitiveMinConf:   0.5,
	}
}

// Engine handles automatic relationship inference.
type Engine struct {
	config *Config
	mu     sync.RWMutex

	// Co-access tracking
	accessHistory []accessRecord
	coAccessCounts map[coAccessKey]int

	// For similarity lookups (injected dependency)
	similaritySearch func(ctx context.Context, embedding []float32, k int) ([]SimilarityResult, error)
}

type accessRecord struct {
	NodeID    string
	Timestamp time.Time
}

type coAccessKey struct {
	NodeA string
	NodeB string
}

// SimilarityResult from vector search.
type SimilarityResult struct {
	ID    string
	Score float64
}

// New creates a new inference engine.
func New(config *Config) *Engine {
	if config == nil {
		config = DefaultConfig()
	}

	return &Engine{
		config:         config,
		accessHistory:  make([]accessRecord, 0),
		coAccessCounts: make(map[coAccessKey]int),
	}
}

// SetSimilaritySearch sets the similarity search function.
func (e *Engine) SetSimilaritySearch(fn func(ctx context.Context, embedding []float32, k int) ([]SimilarityResult, error)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.similaritySearch = fn
}

// OnStore is called when a new memory is stored.
// Returns suggested edges based on similarity.
func (e *Engine) OnStore(ctx context.Context, nodeID string, embedding []float32) ([]EdgeSuggestion, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	suggestions := make([]EdgeSuggestion, 0)

	// 1. Similarity-based suggestions
	if e.similaritySearch != nil && len(embedding) > 0 {
		similar, err := e.similaritySearch(ctx, embedding, e.config.SimilarityTopK)
		if err == nil {
			for _, result := range similar {
				if result.ID == nodeID {
					continue // Skip self
				}
				if result.Score >= e.config.SimilarityThreshold {
					conf := e.scoreToConfidence(result.Score)
					suggestions = append(suggestions, EdgeSuggestion{
						SourceID:   nodeID,
						TargetID:   result.ID,
						Type:       "RELATES_TO",
						Confidence: conf,
						Reason:     "High embedding similarity",
						Method:     "similarity",
					})
				}
			}
		}
	}

	return suggestions, nil
}

// OnAccess is called when a memory is accessed.
// Tracks co-access patterns.
func (e *Engine) OnAccess(ctx context.Context, nodeID string) []EdgeSuggestion {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now()
	suggestions := make([]EdgeSuggestion, 0)

	if !e.config.CoAccessEnabled {
		return suggestions
	}

	// Find recent accesses within the window
	windowStart := now.Add(-e.config.CoAccessWindow)
	recentNodes := make([]string, 0)
	
	for _, record := range e.accessHistory {
		if record.Timestamp.After(windowStart) && record.NodeID != nodeID {
			recentNodes = append(recentNodes, record.NodeID)
		}
	}

	// Update co-access counts
	for _, otherID := range recentNodes {
		key := e.makeCoAccessKey(nodeID, otherID)
		e.coAccessCounts[key]++

		// Check if we should suggest an edge
		if e.coAccessCounts[key] >= e.config.CoAccessMinCount {
			conf := float64(e.coAccessCounts[key]) / 10.0
			if conf > 0.8 {
				conf = 0.8 // Cap at 0.8 for co-access
			}
			suggestions = append(suggestions, EdgeSuggestion{
				SourceID:   nodeID,
				TargetID:   otherID,
				Type:       "RELATES_TO",
				Confidence: conf,
				Reason:     "Frequently accessed together",
				Method:     "co_access",
			})
		}
	}

	// Add to history
	e.accessHistory = append(e.accessHistory, accessRecord{
		NodeID:    nodeID,
		Timestamp: now,
	})

	// Prune old history
	e.pruneHistory(windowStart)

	return suggestions
}

// SuggestTransitive suggests edges based on transitive relationships.
// If A->B and B->C with sufficient confidence, suggest A->C.
func (e *Engine) SuggestTransitive(ctx context.Context, edges []ExistingEdge) []EdgeSuggestion {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if !e.config.TransitiveEnabled {
		return nil
	}

	suggestions := make([]EdgeSuggestion, 0)
	
	// Build adjacency map
	outgoing := make(map[string][]ExistingEdge)
	for _, edge := range edges {
		outgoing[edge.SourceID] = append(outgoing[edge.SourceID], edge)
	}

	// For each A->B, look for B->C
	for _, ab := range edges {
		for _, bc := range outgoing[ab.TargetID] {
			if ab.SourceID == bc.TargetID {
				continue // Skip cycles back to origin
			}

			// Calculate transitive confidence
			conf := ab.Confidence * bc.Confidence
			if conf >= e.config.TransitiveMinConf {
				suggestions = append(suggestions, EdgeSuggestion{
					SourceID:   ab.SourceID,
					TargetID:   bc.TargetID,
					Type:       "RELATES_TO",
					Confidence: conf,
					Reason:     "Transitive via " + ab.TargetID,
					Method:     "transitive",
				})
			}
		}
	}

	return suggestions
}

// ExistingEdge represents an edge in the graph.
type ExistingEdge struct {
	SourceID   string
	TargetID   string
	Confidence float64
}

// scoreToConfidence converts similarity score to edge confidence.
func (e *Engine) scoreToConfidence(score float64) float64 {
	// Map similarity score ranges to confidence levels
	switch {
	case score >= 0.95:
		return 0.9
	case score >= 0.90:
		return 0.7
	case score >= 0.85:
		return 0.5
	default:
		return 0.3
	}
}

// makeCoAccessKey creates a consistent key for co-access tracking.
func (e *Engine) makeCoAccessKey(a, b string) coAccessKey {
	// Ensure consistent ordering
	if a < b {
		return coAccessKey{NodeA: a, NodeB: b}
	}
	return coAccessKey{NodeA: b, NodeB: a}
}

// pruneHistory removes old access records.
func (e *Engine) pruneHistory(before time.Time) {
	// Keep records newer than 'before'
	newHistory := make([]accessRecord, 0, len(e.accessHistory))
	for _, record := range e.accessHistory {
		if record.Timestamp.After(before) {
			newHistory = append(newHistory, record)
		}
	}
	e.accessHistory = newHistory
}

// Stats returns inference statistics.
type Stats struct {
	TotalSuggestions   int64
	BySimilarity       int64
	ByCoAccess         int64
	ByTransitive       int64
	TrackedCoAccesses  int
}

// GetStats returns current inference statistics.
func (e *Engine) GetStats() Stats {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return Stats{
		TrackedCoAccesses: len(e.coAccessCounts),
	}
}
