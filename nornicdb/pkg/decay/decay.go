// Package decay implements the memory decay system for NornicDB.
//
// The decay system mimics how human memory works with three tiers:
//   - Episodic: Short-term memories (7-day half-life) for temporary data
//   - Semantic: Medium-term memories (69-day half-life) for facts and knowledge
//   - Procedural: Long-term memories (693-day half-life) for skills and patterns
//
// Each memory has a decay score (0.0-1.0) calculated from:
//   - Recency: How recently it was accessed (exponential decay)
//   - Frequency: How often it's been accessed (logarithmic growth)
//   - Importance: Manual weight or tier default
//
// The system automatically:
//   - Decays memories over time using exponential curves
//   - Reinforces memories when accessed (neural potentiation)
//   - Archives memories below threshold (default 0.05)
//
// Example Usage:
//
//	manager := decay.New(decay.DefaultConfig())
//
//	// Create a memory
//	info := &decay.MemoryInfo{
//		ID:           "mem-123",
//		Tier:         decay.TierSemantic,
//		CreatedAt:    time.Now(),
//		LastAccessed: time.Now(),
//		AccessCount:  1,
//	}
//
//	// Calculate decay score
//	score := manager.CalculateScore(info)
//	fmt.Printf("Score: %.2f\n", score) // Score: 0.68
//
//	// Reinforce when accessed
//	info = manager.Reinforce(info)
//
//	// Check if should archive
//	if manager.ShouldArchive(score) {
//		fmt.Println("Memory should be archived")
//	}
//
// ELI12 (Explain Like I'm 12):
//
// Think of your brain like a bookshelf. Some books (episodic memories) are magazines
// you'll throw away in a week. Some books (semantic memories) are textbooks you need
// for a few months. Some books (procedural memories) are skills like riding a bike
// that you never forget.
//
// Every day, books you don't use get dustier and harder to find. But when you take
// a book off the shelf and read it, it gets cleaned and moved to the front. That's
// what "reinforcement" means - using a memory makes it stronger!
package decay

import (
	"context"
	"math"
	"sync"
	"time"
)

// Tier represents a memory decay tier in the three-tier memory system.
//
// The three tiers mimic human memory:
//   - Episodic: Events and temporary context (fast decay)
//   - Semantic: Facts and knowledge (medium decay)
//   - Procedural: Skills and patterns (slow decay)
//
// Each tier has a different half-life determining how quickly memories fade.
//
// Example:
//
//	var tier decay.Tier = decay.TierSemantic
//	halfLife := decay.HalfLife(tier)
//	fmt.Printf("%s memories last %.0f days\n", tier, halfLife)
//	// Output: SEMANTIC memories last 69 days
type Tier string

const (
	// TierEpisodic represents short-term episodic memories with a 7-day half-life.
	//
	// Use for: Chat context, temporary notes, session data, recent events.
	//
	// ELI12: Like remembering what you had for breakfast. You remember it now,
	// but in a week you probably won't unless it was special.
	//
	// Example:
	//
	//	info := &decay.MemoryInfo{
	//		Tier: decay.TierEpisodic,
	//		Content: "User prefers dark mode",
	//	}
	TierEpisodic Tier = "EPISODIC"

	// TierSemantic represents medium-term semantic memories with a 69-day half-life.
	//
	// Use for: User preferences, project decisions, facts, business rules.
	//
	// ELI12: Like knowing Paris is the capital of France. Facts you learned and
	// use regularly. They last longer than events but can fade if never used.
	//
	// Example:
	//
	//	info := &decay.MemoryInfo{
	//		Tier: decay.TierSemantic,
	//		Content: "PostgreSQL is our primary database",
	//		Importance: 0.8,
	//	}
	TierSemantic Tier = "SEMANTIC"

	// TierProcedural represents long-term procedural memories with a 693-day half-life.
	//
	// Use for: Coding patterns, workflows, best practices, skills.
	//
	// ELI12: Like knowing how to ride a bike. Once you learn it, you never really
	// forget even if you don't do it for years. It's muscle memory!
	//
	// Example:
	//
	//	info := &decay.MemoryInfo{
	//		Tier: decay.TierProcedural,
	//		Content: "Always validate user input to prevent XSS",
	//		Importance: 1.0,
	//	}
	TierProcedural Tier = "PROCEDURAL"
)

// Lambda values for exponential decay calculation (per hour).
//
// The decay formula is: score = exp(-lambda × hours_since_access)
//
// Where lambda determines the decay rate:
//   - Higher lambda = faster decay
//   - Lower lambda = slower decay
//
// Half-life formula: halfLife = ln(2) / lambda
//
// ELI12: Lambda is like how fast ice cream melts. High lambda = fast melt
// (episodic memories fade quickly). Low lambda = slow melt (procedural
// memories last forever).
//
// Mathematical proof:
//
//	At half-life, score = 0.5:
//	0.5 = exp(-lambda × t)
//	ln(0.5) = -lambda × t
//	-ln(2) = -lambda × t
//	t = ln(2) / lambda
var tierLambda = map[Tier]float64{
	TierEpisodic:   0.00412,   // ~7 day half-life (168 hours)
	TierSemantic:   0.000418,  // ~69 day half-life (1656 hours)
	TierProcedural: 0.0000417, // ~693 day half-life (16632 hours)
}

// Default tier importance weights used when no manual weight is specified.
//
// These represent the base importance of each tier:
//   - Episodic: 0.3 (low importance, temporary data)
//   - Semantic: 0.6 (medium importance, facts and knowledge)
//   - Procedural: 0.9 (high importance, core skills)
//
// You can override these per-memory using the ImportanceWeight field.
var tierBaseImportance = map[Tier]float64{
	TierEpisodic:   0.3,
	TierSemantic:   0.6,
	TierProcedural: 0.9,
}

// Config holds decay manager configuration options.
//
// All weights must sum to 1.0 for proper normalization:
//   - RecencyWeight + FrequencyWeight + ImportanceWeight = 1.0
//
// Example:
//
//	config := &decay.Config{
//		RecalculateInterval: time.Hour,
//		ArchiveThreshold:    0.05,
//		RecencyWeight:       0.4, // 40% based on how recent
//		FrequencyWeight:     0.3, // 30% based on access count
//		ImportanceWeight:    0.3, // 30% based on importance
//	}
type Config struct {
	// RecalculateInterval determines how often to recalculate all decay scores.
	//
	// Default: 1 hour
	//
	// Lower values = more accurate but more CPU usage.
	// Higher values = less accurate but better performance.
	RecalculateInterval time.Duration

	// ArchiveThreshold is the score below which memories should be archived.
	//
	// Default: 0.05 (5%)
	//
	// Memories with decay scores below this value are considered "forgotten"
	// and can be archived or deleted to save space.
	//
	// Example thresholds:
	//   - 0.05 (5%): Aggressive cleanup
	//   - 0.10 (10%): Balanced
	//   - 0.01 (1%): Conservative, keep almost everything
	ArchiveThreshold float64

	// RecencyWeight determines how much recent access affects the score (0.0-1.0).
	//
	// Default: 0.4 (40%)
	//
	// Higher values emphasize recently-accessed memories.
	// Use higher values for time-sensitive applications (news, events).
	RecencyWeight float64

	// FrequencyWeight determines how much access count affects the score (0.0-1.0).
	//
	// Default: 0.3 (30%)
	//
	// Higher values emphasize frequently-accessed memories.
	// Use higher values for learning systems (flashcards, spaced repetition).
	FrequencyWeight float64

	// ImportanceWeight determines how much manual importance affects the score (0.0-1.0).
	//
	// Default: 0.3 (30%)
	//
	// Higher values emphasize manually-marked important memories.
	// Use higher values for critical data that must persist.
	ImportanceWeight float64
}

// DefaultConfig returns a Config with sensible default values.
//
// Defaults:
//   - RecalculateInterval: 1 hour
//   - ArchiveThreshold: 0.05 (5%)
//   - RecencyWeight: 0.4 (40%)
//   - FrequencyWeight: 0.3 (30%)
//   - ImportanceWeight: 0.3 (30%)
//
// These defaults provide a balanced approach suitable for most applications.
//
// Example:
//
//	config := decay.DefaultConfig()
//	manager := decay.New(config)
func DefaultConfig() *Config {
	return &Config{
		RecalculateInterval: time.Hour,
		ArchiveThreshold:    0.05,
		RecencyWeight:       0.4,
		FrequencyWeight:     0.3,
		ImportanceWeight:    0.3,
	}
}

// Manager handles memory decay calculations and background recalculation.
//
// The Manager is thread-safe and can be used concurrently from multiple goroutines.
// It provides methods to calculate decay scores, reinforce memories, and manage
// background recalculation.
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//	defer manager.Stop()
//
//	// Start background recalculation
//	manager.Start(func(ctx context.Context) error {
//		// Recalculate all memory scores
//		return nil
//	})
//
//	// Calculate score for a memory
//	info := &decay.MemoryInfo{...}
//	score := manager.CalculateScore(info)
type Manager struct {
	config *Config
	mu     sync.RWMutex

	// For background recalculation
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// New creates a new decay Manager with the given configuration.
//
// If config is nil, DefaultConfig() is used.
//
// The Manager must be closed with Stop() when done to clean up resources.
//
// Example:
//
//	manager := decay.New(nil) // Uses default config
//	defer manager.Stop()
//
//	// Or with custom config:
//	config := &decay.Config{
//		RecalculateInterval: 30 * time.Minute,
//		ArchiveThreshold:    0.10,
//		RecencyWeight:       0.5,
//		FrequencyWeight:     0.3,
//		ImportanceWeight:    0.2,
//	}
//	manager = decay.New(config)
//
// Example 1 - Basic Usage with Default Config:
//
//	manager := decay.New(nil) // Uses DefaultConfig()
//
//	// Create a semantic memory
//	info := &decay.MemoryInfo{
//		ID:           "fact-123",
//		Tier:         decay.TierSemantic,
//		CreatedAt:    time.Now(),
//		LastAccessed: time.Now(),
//		AccessCount:  1,
//	}
//
//	// Calculate initial score
//	score := manager.CalculateScore(info)
//	fmt.Printf("Initial score: %.2f\n", score) // ~0.60 (semantic tier default)
//
// Example 2 - Custom Decay Rates:
//
//	config := &decay.Config{
//		RecalculateInterval: 30 * time.Minute, // Faster updates
//		ArchiveThreshold:    0.1,               // Archive at 10% instead of 5%
//		RecencyWeight:       0.5,               // Emphasize recency
//		FrequencyWeight:     0.3,
//		ImportanceWeight:    0.2,
//	}
//
//	manager := decay.New(config)
//
//	// Old, rarely-accessed memories decay faster
//	oldInfo := &decay.MemoryInfo{
//		ID:           "old-note",
//		Tier:         decay.TierEpisodic,
//		CreatedAt:    time.Now().Add(-14 * 24 * time.Hour), // 2 weeks old
//		LastAccessed: time.Now().Add(-14 * 24 * time.Hour),
//		AccessCount:  1,
//	}
//	score := manager.CalculateScore(oldInfo)
//	// score will be very low (~0.05) due to age and single access
//
// Example 3 - Memory Lifecycle Management:
//
//	manager := decay.New(nil)
//	memories := make(map[string]*decay.MemoryInfo)
//
//	// Simulate memory access over time
//	for day := 0; day < 30; day++ {
//		// Create new memory
//		info := &decay.MemoryInfo{
//			ID:           fmt.Sprintf("mem-%d", day),
//			Tier:         decay.TierSemantic,
//			CreatedAt:    time.Now(),
//			LastAccessed: time.Now(),
//			AccessCount:  1,
//		}
//		memories[info.ID] = info
//
//		// Update existing memories
//		for id, mem := range memories {
//			score := manager.CalculateScore(mem)
//
//			// Archive low-scoring memories
//			if manager.ShouldArchive(score) {
//				delete(memories, id)
//				archiveMemory(mem)
//			}
//
//			// Randomly reinforce some memories
//			if rand.Float64() < 0.3 { // 30% chance
//				memories[id] = manager.Reinforce(mem)
//			}
//		}
//
//		time.Sleep(24 * time.Hour) // Simulate day passing
//	}
//
// ELI12:
//
// Imagine your brain has a "memory manager" that decides what to remember:
//
//  1. New memories start strong (score = 0.6-0.9)
//  2. Every day, memories get weaker like ice cream melting
//  3. When you USE a memory, it gets stronger again!
//  4. Really old, unused memories drop to almost zero and get "archived"
//     (like moving old toys to the attic)
//
// The three tiers are like different types of memories:
//   - Episodic = What you ate for breakfast (forget in days)
//   - Semantic = State capitals (forget in months if not used)
//   - Procedural = How to ride a bike (almost never forget)
//
// Performance:
//   - CalculateScore: O(1) - pure math, very fast
//   - Memory: Minimal overhead, just tracking last access time
//   - Background recalculation: Configurable interval (default 1 hour)
//
// Thread Safety:
//
//	Manager is thread-safe for concurrent score calculations.
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

// GetConfig returns the manager's configuration.
// This is useful for exposing decay settings via API endpoints.
func (m *Manager) GetConfig() *Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	// Return a copy to prevent modification
	return &Config{
		RecalculateInterval: m.config.RecalculateInterval,
		ArchiveThreshold:    m.config.ArchiveThreshold,
		RecencyWeight:       m.config.RecencyWeight,
		FrequencyWeight:     m.config.FrequencyWeight,
		ImportanceWeight:    m.config.ImportanceWeight,
	}
}

// MemoryInfo contains all information needed to calculate a memory's decay score.
//
// Fields:
//   - ID: Unique identifier for the memory
//   - Tier: Memory tier (Episodic, Semantic, or Procedural)
//   - CreatedAt: When the memory was first created
//   - LastAccessed: When the memory was last accessed/used
//   - AccessCount: How many times the memory has been accessed
//   - ImportanceWeight: Optional manual importance (0.0-1.0), overrides tier default
//
// Example:
//
//	info := &decay.MemoryInfo{
//		ID:           "mem-001",
//		Tier:         decay.TierSemantic,
//		CreatedAt:    time.Now().Add(-30 * 24 * time.Hour), // 30 days ago
//		LastAccessed: time.Now().Add(-5 * 24 * time.Hour),  // 5 days ago
//		AccessCount:  12,
//		ImportanceWeight: 0.8, // Manually mark as important
//	}
type MemoryInfo struct {
	ID               string
	Tier             Tier
	CreatedAt        time.Time
	LastAccessed     time.Time
	AccessCount      int64
	ImportanceWeight float64 // Optional manual override
}

// CalculateScore calculates the current decay score for a memory.
//
// The score is a weighted combination of three factors:
//
//  1. Recency Factor (exponential decay):
//     score = exp(-lambda × hours_since_access)
//     Fast decay at first, then slower over time
//
//  2. Frequency Factor (logarithmic growth):
//     score = log(1 + accessCount) / log(101)
//     Lots of improvement early, then levels off
//
//  3. Importance Factor (manual weight):
//     score = importanceWeight or tier default
//     Allows manual boosting of critical memories
//
// Final score = (RecencyWeight × recency) + (FrequencyWeight × frequency) + (ImportanceWeight × importance)
//
// Returns a float64 between 0.0 (completely forgotten) and 1.0 (perfectly remembered).
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//
//	info := &decay.MemoryInfo{
//		Tier:         decay.TierSemantic,
//		CreatedAt:    time.Now().Add(-30 * 24 * time.Hour),
//		LastAccessed: time.Now().Add(-5 * 24 * time.Hour),
//		AccessCount:  12,
//	}
//
//	score := manager.CalculateScore(info)
//	fmt.Printf("Score: %.2f\n", score) // Score: 0.67
//
// ELI12:
//
// Think of the score like a grade on a test. 1.0 = 100% (perfect memory),
// 0.5 = 50% (fading), 0.0 = 0% (forgotten). The score drops over time like
// a bouncing ball losing height, but accessing the memory is like catching
// the ball and throwing it back up!
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

// Reinforce boosts a memory's strength by updating access metadata.
//
// This mimics neural long-term potentiation - the biological process where
// frequently-used neural pathways become stronger.
//
// Reinforcement updates:
//   - LastAccessed: Set to current time (resets recency decay)
//   - AccessCount: Incremented by 1 (improves frequency factor)
//
// Call this function every time a memory is retrieved or used.
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//
//	// Retrieve memory
//	info := getMemory("mem-123")
//	fmt.Printf("Before: Score=%.2f, Accesses=%d\n",
//		manager.CalculateScore(info), info.AccessCount)
//
//	// Reinforce it
//	info = manager.Reinforce(info)
//	updateMemory(info)
//
//	fmt.Printf("After: Score=%.2f, Accesses=%d\n",
//		manager.CalculateScore(info), info.AccessCount)
//	// Score improves due to recent access!
//
// ELI12:
//
// This is like practicing piano. The more you practice a song, the better
// you remember it. Each time you play it, the memory gets stronger. If you
// stop practicing, you slowly forget it (decay). Practicing = reinforcement!
func (m *Manager) Reinforce(info *MemoryInfo) *MemoryInfo {
	info.LastAccessed = time.Now()
	info.AccessCount++
	return info
}

// ShouldArchive returns true if a memory's score is below the archive threshold.
//
// Archived memories can be:
//   - Moved to cold storage
//   - Deleted to save space
//   - Marked as archived for later review
//
// Default threshold: 0.05 (5%)
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//
//	for _, memory := range memories {
//		score := manager.CalculateScore(memory)
//		if manager.ShouldArchive(score) {
//			fmt.Printf("Archiving: %s (score: %.2f)\n", memory.ID, score)
//			archiveMemory(memory)
//		}
//	}
func (m *Manager) ShouldArchive(score float64) bool {
	return score < m.config.ArchiveThreshold
}

// Start begins background decay recalculation at regular intervals.
//
// The recalculateFunc is called periodically (based on Config.RecalculateInterval)
// to recalculate all memory scores. It should update the decayScore field for
// all memories in your storage.
//
// Start is non-blocking and runs in a background goroutine.
// Always call Stop() when done to clean up resources.
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//	defer manager.Stop()
//
//	manager.Start(func(ctx context.Context) error {
//		// Get all memories from database
//		memories, err := db.GetAllMemories(ctx)
//		if err != nil {
//			return err
//		}
//
//		// Recalculate each score
//		for _, mem := range memories {
//			score := manager.CalculateScore(&mem)
//			db.UpdateScore(ctx, mem.ID, score)
//		}
//
//		return nil
//	})
//
//	// Manager now recalculates scores every hour (or your configured interval)
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

// Stop stops background decay recalculation and waits for cleanup.
//
// This method blocks until the background goroutine has finished.
// Always call Stop() before program exit to prevent resource leaks.
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//	defer manager.Stop() // Ensures cleanup
//
//	manager.Start(recalculateFunc)
//	// ... do work ...
//	manager.Stop() // Graceful shutdown
func (m *Manager) Stop() {
	m.cancel()
	m.wg.Wait()
}

// Stats holds aggregate statistics about memory decay across all tiers.
//
// Useful for monitoring system health and understanding memory patterns.
//
// Example:
//
//	stats := manager.GetStats(allMemories)
//	fmt.Printf("Total memories: %d\n", stats.TotalMemories)
//	fmt.Printf("Average score: %.2f\n", stats.AvgDecayScore)
//	fmt.Printf("Need archiving: %d\n", stats.ArchivedCount)
//	fmt.Printf("Episodic avg: %.2f\n", stats.AvgByTier[decay.TierEpisodic])
type Stats struct {
	TotalMemories   int64
	EpisodicCount   int64
	SemanticCount   int64
	ProceduralCount int64
	ArchivedCount   int64
	AvgDecayScore   float64
	AvgByTier       map[Tier]float64
}

// GetStats calculates aggregate statistics across a set of memories.
//
// Returns:
//   - Total count per tier (Episodic, Semantic, Procedural)
//   - Average decay scores overall and per tier
//   - Count of memories needing archival
//
// Useful for dashboards, monitoring, and understanding memory health.
//
// Example:
//
//	manager := decay.New(decay.DefaultConfig())
//
//	// Get all memories from database
//	memories := []decay.MemoryInfo{ /* ... */ }
//
//	stats := manager.GetStats(memories)
//
//	fmt.Printf("=== Memory Statistics ===\n")
//	fmt.Printf("Total: %d memories\n", stats.TotalMemories)
//	fmt.Printf("Episodic: %d (avg: %.2f)\n",
//		stats.EpisodicCount, stats.AvgByTier[decay.TierEpisodic])
//	fmt.Printf("Semantic: %d (avg: %.2f)\n",
//		stats.SemanticCount, stats.AvgByTier[decay.TierSemantic])
//	fmt.Printf("Procedural: %d (avg: %.2f)\n",
//		stats.ProceduralCount, stats.AvgByTier[decay.TierProcedural])
//	fmt.Printf("Needs archiving: %d\n", stats.ArchivedCount)
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

// HalfLife returns the half-life duration for a given tier in days.
//
// Half-life is the time it takes for a memory's score to decay to 50% of its
// original value (assuming no access).
//
// Returns:
//   - Episodic: ~7 days
//   - Semantic: ~69 days
//   - Procedural: ~693 days
//
// Formula: halfLife = ln(2) / lambda / 24 hours
//
// Example:
//
//	for _, tier := range []decay.Tier{
//		decay.TierEpisodic,
//		decay.TierSemantic,
//		decay.TierProcedural,
//	} {
//		hl := decay.HalfLife(tier)
//		fmt.Printf("%s: %.0f days\n", tier, hl)
//	}
//	// Output:
//	// EPISODIC: 7 days
//	// SEMANTIC: 69 days
//	// PROCEDURAL: 693 days
//
// ELI12:
//
// Half-life is how long until you remember only half as much. Like if you
// scored 100% on a test today, after the half-life you'd only remember 50%
// of it. After another half-life, you'd remember 25%, then 12.5%, etc.
// It keeps cutting in half!
func HalfLife(tier Tier) float64 {
	lambda := tierLambda[tier]
	if lambda == 0 {
		return 0
	}
	// Half-life in hours, converted to days
	return (math.Log(2) / lambda) / 24
}
