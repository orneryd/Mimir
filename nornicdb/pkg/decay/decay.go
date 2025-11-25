// Package decay implements the memory decay system for NornicDB.
package decay

import (
	"context"
	"math"
	"sync"
	"time"
)

// Tier represents a memory decay tier.
type Tier string

const (
	// TierEpisodic has fast decay (7-day half-life)
	TierEpisodic Tier = "EPISODIC"
	// TierSemantic has medium decay (69-day half-life)
	TierSemantic Tier = "SEMANTIC"
	// TierProcedural has slow decay (693-day half-life)
	TierProcedural Tier = "PROCEDURAL"
)

// Lambda values for decay calculation (per hour)
// Formula: score = exp(-lambda * hours)
// Half-life = ln(2) / lambda
var tierLambda = map[Tier]float64{
	TierEpisodic:   0.00412,  // ~7 day half-life (168 hours)
	TierSemantic:   0.000418, // ~69 day half-life (1656 hours)
	TierProcedural: 0.0000417, // ~693 day half-life (16632 hours)
}

// Default tier importance weights
var tierBaseImportance = map[Tier]float64{
	TierEpisodic:   0.3,
	TierSemantic:   0.6,
	TierProcedural: 0.9,
}

// Config holds decay manager configuration.
type Config struct {
	// How often to recalculate decay scores
	RecalculateInterval time.Duration

	// Threshold below which memories are archived
	ArchiveThreshold float64

	// Weights for the decay formula
	RecencyWeight    float64
	FrequencyWeight  float64
	ImportanceWeight float64
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		RecalculateInterval: time.Hour,
		ArchiveThreshold:    0.05,
		RecencyWeight:       0.4,
		FrequencyWeight:     0.3,
		ImportanceWeight:    0.3,
	}
}

// Manager handles memory decay calculations.
type Manager struct {
	config *Config
	mu     sync.RWMutex
	
	// For background recalculation
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// New creates a new decay manager.
func New(config *Config) *Manager {
	if config == nil {
		config = DefaultConfig()
	}

	ctx, cancel := context.WithCancel(context.Background())
	
	return &Manager{
		config: config,
		ctx:    ctx,
		cancel: cancel,
	}
}

// MemoryInfo contains the information needed to calculate decay.
type MemoryInfo struct {
	ID               string
	Tier             Tier
	CreatedAt        time.Time
	LastAccessed     time.Time
	AccessCount      int64
	ImportanceWeight float64 // Optional manual override
}

// CalculateScore calculates the current decay score for a memory.
// Returns a value between 0.0 and 1.0.
func (m *Manager) CalculateScore(info *MemoryInfo) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	now := time.Now()
	
	// 1. Recency factor (exponential decay)
	hoursSinceAccess := now.Sub(info.LastAccessed).Hours()
	lambda := tierLambda[info.Tier]
	if lambda == 0 {
		lambda = tierLambda[TierSemantic] // Default
	}
	recencyFactor := math.Exp(-lambda * hoursSinceAccess)

	// 2. Frequency factor (logarithmic, capped at 100 accesses)
	maxAccesses := 100.0
	frequencyFactor := math.Log(1+float64(info.AccessCount)) / math.Log(1+maxAccesses)
	if frequencyFactor > 1.0 {
		frequencyFactor = 1.0
	}

	// 3. Importance factor (tier default or manual override)
	importanceFactor := info.ImportanceWeight
	if importanceFactor == 0 {
		importanceFactor = tierBaseImportance[info.Tier]
		if importanceFactor == 0 {
			importanceFactor = 0.5
		}
	}

	// Combine factors
	score := m.config.RecencyWeight*recencyFactor +
		m.config.FrequencyWeight*frequencyFactor +
		m.config.ImportanceWeight*importanceFactor

	// Clamp to [0, 1]
	if score < 0 {
		score = 0
	}
	if score > 1 {
		score = 1
	}

	return score
}

// Reinforce boosts a memory's score (like neural potentiation).
// Called when a memory is accessed.
func (m *Manager) Reinforce(info *MemoryInfo) *MemoryInfo {
	info.LastAccessed = time.Now()
	info.AccessCount++
	return info
}

// ShouldArchive returns true if the memory should be archived.
func (m *Manager) ShouldArchive(score float64) bool {
	return score < m.config.ArchiveThreshold
}

// Start begins background decay recalculation.
func (m *Manager) Start(recalculateFunc func(context.Context) error) {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		
		ticker := time.NewTicker(m.config.RecalculateInterval)
		defer ticker.Stop()

		for {
			select {
			case <-m.ctx.Done():
				return
			case <-ticker.C:
				if err := recalculateFunc(m.ctx); err != nil {
					// Log error but continue
				}
			}
		}
	}()
}

// Stop stops background decay recalculation.
func (m *Manager) Stop() {
	m.cancel()
	m.wg.Wait()
}

// Stats holds decay statistics.
type Stats struct {
	TotalMemories   int64
	EpisodicCount   int64
	SemanticCount   int64
	ProceduralCount int64
	ArchivedCount   int64
	AvgDecayScore   float64
	AvgByTier       map[Tier]float64
}

// GetStats returns current decay statistics.
func (m *Manager) GetStats(memories []MemoryInfo) *Stats {
	stats := &Stats{
		AvgByTier: make(map[Tier]float64),
	}

	tierScores := make(map[Tier][]float64)
	var totalScore float64

	for _, mem := range memories {
		stats.TotalMemories++
		
		score := m.CalculateScore(&mem)
		totalScore += score
		
		switch mem.Tier {
		case TierEpisodic:
			stats.EpisodicCount++
		case TierSemantic:
			stats.SemanticCount++
		case TierProcedural:
			stats.ProceduralCount++
		}
		
		tierScores[mem.Tier] = append(tierScores[mem.Tier], score)

		if m.ShouldArchive(score) {
			stats.ArchivedCount++
		}
	}

	if stats.TotalMemories > 0 {
		stats.AvgDecayScore = totalScore / float64(stats.TotalMemories)
	}

	for tier, scores := range tierScores {
		if len(scores) > 0 {
			var sum float64
			for _, s := range scores {
				sum += s
			}
			stats.AvgByTier[tier] = sum / float64(len(scores))
		}
	}

	return stats
}

// HalfLife returns the half-life for a tier in days.
func HalfLife(tier Tier) float64 {
	lambda := tierLambda[tier]
	if lambda == 0 {
		return 0
	}
	// Half-life in hours, converted to days
	return (math.Log(2) / lambda) / 24
}
