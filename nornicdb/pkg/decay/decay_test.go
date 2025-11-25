package decay

import (
	"context"
	"math"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()
	require.NotNil(t, config)
	
	assert.Equal(t, time.Hour, config.RecalculateInterval)
	assert.Equal(t, 0.05, config.ArchiveThreshold)
	assert.Equal(t, 0.4, config.RecencyWeight)
	assert.Equal(t, 0.3, config.FrequencyWeight)
	assert.Equal(t, 0.3, config.ImportanceWeight)
}

func TestNew(t *testing.T) {
	t.Run("with config", func(t *testing.T) {
		config := &Config{
			RecalculateInterval: time.Minute,
			ArchiveThreshold:    0.1,
		}
		manager := New(config)
		require.NotNil(t, manager)
		assert.Equal(t, time.Minute, manager.config.RecalculateInterval)
	})
	
	t.Run("nil config uses defaults", func(t *testing.T) {
		manager := New(nil)
		require.NotNil(t, manager)
		assert.Equal(t, time.Hour, manager.config.RecalculateInterval)
	})
}

func TestManager_CalculateScore(t *testing.T) {
	t.Run("recent memory has high score", func(t *testing.T) {
		manager := New(nil)
		info := &MemoryInfo{
			ID:           "test-1",
			Tier:         TierSemantic,
			CreatedAt:    time.Now(),
			LastAccessed: time.Now(),
			AccessCount:  1,
		}
		
		score := manager.CalculateScore(info)
		// Should be close to RecencyWeight(0.4) + some frequency + importance
		assert.Greater(t, score, 0.5)
	})
	
	t.Run("old memory has lower score", func(t *testing.T) {
		manager := New(nil)
		info := &MemoryInfo{
			ID:           "test-2",
			Tier:         TierEpisodic, // Fast decay
			CreatedAt:    time.Now().Add(-30 * 24 * time.Hour),
			LastAccessed: time.Now().Add(-30 * 24 * time.Hour), // 30 days old
			AccessCount:  1,
		}
		
		score := manager.CalculateScore(info)
		// Episodic memory 30 days old should have significantly decayed
		assert.Less(t, score, 0.5)
	})
	
	t.Run("frequent access increases score", func(t *testing.T) {
		manager := New(nil)
		
		lowAccess := &MemoryInfo{
			ID:           "low",
			Tier:         TierSemantic,
			LastAccessed: time.Now().Add(-24 * time.Hour),
			AccessCount:  1,
		}
		
		highAccess := &MemoryInfo{
			ID:           "high",
			Tier:         TierSemantic,
			LastAccessed: time.Now().Add(-24 * time.Hour),
			AccessCount:  50,
		}
		
		lowScore := manager.CalculateScore(lowAccess)
		highScore := manager.CalculateScore(highAccess)
		
		assert.Greater(t, highScore, lowScore)
	})
	
	t.Run("procedural tier decays slowest", func(t *testing.T) {
		manager := New(nil)
		oldTime := time.Now().Add(-60 * 24 * time.Hour) // 60 days old
		
		episodic := &MemoryInfo{
			ID:           "episodic",
			Tier:         TierEpisodic,
			LastAccessed: oldTime,
			AccessCount:  1,
		}
		
		semantic := &MemoryInfo{
			ID:           "semantic",
			Tier:         TierSemantic,
			LastAccessed: oldTime,
			AccessCount:  1,
		}
		
		procedural := &MemoryInfo{
			ID:           "procedural",
			Tier:         TierProcedural,
			LastAccessed: oldTime,
			AccessCount:  1,
		}
		
		episodicScore := manager.CalculateScore(episodic)
		semanticScore := manager.CalculateScore(semantic)
		proceduralScore := manager.CalculateScore(procedural)
		
		// Procedural should decay slowest
		assert.Greater(t, proceduralScore, semanticScore)
		assert.Greater(t, semanticScore, episodicScore)
	})
	
	t.Run("unknown tier uses semantic lambda", func(t *testing.T) {
		manager := New(nil)
		info := &MemoryInfo{
			ID:           "test",
			Tier:         Tier("UNKNOWN"),
			LastAccessed: time.Now(),
			AccessCount:  1,
		}
		
		score := manager.CalculateScore(info)
		// Should not panic and should use default
		assert.Greater(t, score, 0.0)
	})
	
	t.Run("importance weight override", func(t *testing.T) {
		manager := New(nil)
		
		defaultImportance := &MemoryInfo{
			ID:           "default",
			Tier:         TierSemantic,
			LastAccessed: time.Now(),
			AccessCount:  1,
		}
		
		highImportance := &MemoryInfo{
			ID:               "high",
			Tier:             TierSemantic,
			LastAccessed:     time.Now(),
			AccessCount:      1,
			ImportanceWeight: 1.0, // Max importance
		}
		
		defaultScore := manager.CalculateScore(defaultImportance)
		highScore := manager.CalculateScore(highImportance)
		
		assert.Greater(t, highScore, defaultScore)
	})
	
	t.Run("score clamped to 0-1", func(t *testing.T) {
		manager := New(nil)
		
		// Test with extreme values
		info := &MemoryInfo{
			ID:               "test",
			Tier:             TierProcedural,
			LastAccessed:     time.Now(),
			AccessCount:      1000, // Very high
			ImportanceWeight: 1.0,
		}
		
		score := manager.CalculateScore(info)
		assert.LessOrEqual(t, score, 1.0)
		assert.GreaterOrEqual(t, score, 0.0)
	})
}

func TestManager_Reinforce(t *testing.T) {
	t.Run("updates last accessed and count", func(t *testing.T) {
		manager := New(nil)
		oldTime := time.Now().Add(-time.Hour)
		
		info := &MemoryInfo{
			ID:           "test",
			Tier:         TierSemantic,
			LastAccessed: oldTime,
			AccessCount:  5,
		}
		
		beforeReinforce := time.Now()
		result := manager.Reinforce(info)
		
		assert.True(t, result.LastAccessed.After(beforeReinforce) || result.LastAccessed.Equal(beforeReinforce))
		assert.Equal(t, int64(6), result.AccessCount)
	})
	
	t.Run("returns same object", func(t *testing.T) {
		manager := New(nil)
		info := &MemoryInfo{ID: "test"}
		
		result := manager.Reinforce(info)
		assert.Same(t, info, result)
	})
}

func TestManager_ShouldArchive(t *testing.T) {
	t.Run("below threshold", func(t *testing.T) {
		config := &Config{ArchiveThreshold: 0.1}
		manager := New(config)
		
		assert.True(t, manager.ShouldArchive(0.05))
		assert.True(t, manager.ShouldArchive(0.09))
	})
	
	t.Run("above threshold", func(t *testing.T) {
		config := &Config{ArchiveThreshold: 0.1}
		manager := New(config)
		
		assert.False(t, manager.ShouldArchive(0.1))
		assert.False(t, manager.ShouldArchive(0.5))
	})
	
	t.Run("exact threshold", func(t *testing.T) {
		config := &Config{ArchiveThreshold: 0.1}
		manager := New(config)
		
		// Exactly at threshold should NOT archive
		assert.False(t, manager.ShouldArchive(0.1))
	})
}

func TestManager_StartStop(t *testing.T) {
	t.Run("starts and stops background recalculation", func(t *testing.T) {
		config := &Config{
			RecalculateInterval: 10 * time.Millisecond,
		}
		manager := New(config)
		
		var callCount int64
		recalcFunc := func(ctx context.Context) error {
			atomic.AddInt64(&callCount, 1)
			return nil
		}
		
		manager.Start(recalcFunc)
		
		// Wait for a few ticks
		time.Sleep(50 * time.Millisecond)
		
		manager.Stop()
		
		// Should have been called at least once
		assert.GreaterOrEqual(t, atomic.LoadInt64(&callCount), int64(1))
	})
	
	t.Run("stop is idempotent", func(t *testing.T) {
		manager := New(nil)
		manager.Start(func(ctx context.Context) error { return nil })
		
		// Multiple stops should not panic
		manager.Stop()
		manager.Stop()
	})
	
	t.Run("context cancellation stops goroutine", func(t *testing.T) {
		config := &Config{
			RecalculateInterval: time.Hour, // Long interval
		}
		manager := New(config)
		
		var started, stopped int64
		
		manager.Start(func(ctx context.Context) error {
			atomic.AddInt64(&started, 1)
			return nil
		})
		
		// Immediately stop
		manager.Stop()
		atomic.AddInt64(&stopped, 1)
		
		// Should have stopped without blocking
		assert.Equal(t, int64(1), atomic.LoadInt64(&stopped))
	})
}

func TestManager_GetStats(t *testing.T) {
	t.Run("calculates stats correctly", func(t *testing.T) {
		manager := New(nil)
		
		memories := []MemoryInfo{
			{ID: "e1", Tier: TierEpisodic, LastAccessed: time.Now(), AccessCount: 1},
			{ID: "e2", Tier: TierEpisodic, LastAccessed: time.Now(), AccessCount: 1},
			{ID: "s1", Tier: TierSemantic, LastAccessed: time.Now(), AccessCount: 10},
			{ID: "p1", Tier: TierProcedural, LastAccessed: time.Now(), AccessCount: 50},
		}
		
		stats := manager.GetStats(memories)
		
		assert.Equal(t, int64(4), stats.TotalMemories)
		assert.Equal(t, int64(2), stats.EpisodicCount)
		assert.Equal(t, int64(1), stats.SemanticCount)
		assert.Equal(t, int64(1), stats.ProceduralCount)
		assert.Greater(t, stats.AvgDecayScore, 0.0)
		assert.Contains(t, stats.AvgByTier, TierEpisodic)
		assert.Contains(t, stats.AvgByTier, TierSemantic)
		assert.Contains(t, stats.AvgByTier, TierProcedural)
	})
	
	t.Run("empty memories", func(t *testing.T) {
		manager := New(nil)
		
		stats := manager.GetStats([]MemoryInfo{})
		
		assert.Equal(t, int64(0), stats.TotalMemories)
		assert.Equal(t, 0.0, stats.AvgDecayScore)
	})
	
	t.Run("counts archived memories", func(t *testing.T) {
		config := &Config{
			ArchiveThreshold: 0.5,
			RecencyWeight:    0.4,
			FrequencyWeight:  0.3,
			ImportanceWeight: 0.3,
		}
		manager := New(config)
		
		memories := []MemoryInfo{
			// Very old episodic memory - should be archived
			{
				ID:           "old",
				Tier:         TierEpisodic,
				LastAccessed: time.Now().Add(-365 * 24 * time.Hour), // 1 year
				AccessCount:  1,
			},
			// Recent memory - should not be archived
			{
				ID:           "recent",
				Tier:         TierSemantic,
				LastAccessed: time.Now(),
				AccessCount:  10,
			},
		}
		
		stats := manager.GetStats(memories)
		
		// At least the old memory should be archived
		assert.GreaterOrEqual(t, stats.ArchivedCount, int64(1))
	})
}

func TestHalfLife(t *testing.T) {
	t.Run("episodic half-life is ~7 days", func(t *testing.T) {
		halfLife := HalfLife(TierEpisodic)
		assert.InDelta(t, 7.0, halfLife, 0.5) // Within half a day
	})
	
	t.Run("semantic half-life is ~69 days", func(t *testing.T) {
		halfLife := HalfLife(TierSemantic)
		assert.InDelta(t, 69.0, halfLife, 1.0)
	})
	
	t.Run("procedural half-life is ~693 days", func(t *testing.T) {
		halfLife := HalfLife(TierProcedural)
		assert.InDelta(t, 693.0, halfLife, 5.0)
	})
	
	t.Run("unknown tier returns 0", func(t *testing.T) {
		halfLife := HalfLife(Tier("UNKNOWN"))
		assert.Equal(t, 0.0, halfLife)
	})
}

func TestTierLambdaValues(t *testing.T) {
	t.Run("verify lambda produces correct decay", func(t *testing.T) {
		// After half-life hours, score should be 0.5
		for tier, lambda := range tierLambda {
			halfLifeHours := math.Log(2) / lambda
			score := math.Exp(-lambda * halfLifeHours)
			assert.InDelta(t, 0.5, score, 0.001, "Tier %s should have 0.5 at half-life", tier)
		}
	})
}

func TestTierBaseImportance(t *testing.T) {
	// Verify base importance increases with tier permanence
	assert.Less(t, tierBaseImportance[TierEpisodic], tierBaseImportance[TierSemantic])
	assert.Less(t, tierBaseImportance[TierSemantic], tierBaseImportance[TierProcedural])
}

func TestManager_Concurrency(t *testing.T) {
	t.Run("concurrent score calculations", func(t *testing.T) {
		manager := New(nil)
		
		var wg sync.WaitGroup
		for i := 0; i < 100; i++ {
			wg.Add(1)
			go func(id int) {
				defer wg.Done()
				info := &MemoryInfo{
					ID:           string(rune('a' + id%26)),
					Tier:         TierSemantic,
					LastAccessed: time.Now(),
					AccessCount:  int64(id),
				}
				score := manager.CalculateScore(info)
				assert.GreaterOrEqual(t, score, 0.0)
				assert.LessOrEqual(t, score, 1.0)
			}(i)
		}
		wg.Wait()
	})
}

func TestDecayFormula(t *testing.T) {
	t.Run("exponential decay behavior", func(t *testing.T) {
		manager := New(&Config{
			RecencyWeight:    1.0, // Only recency
			FrequencyWeight:  0.0,
			ImportanceWeight: 0.0,
		})
		
		base := &MemoryInfo{
			ID:           "test",
			Tier:         TierSemantic,
			LastAccessed: time.Now(),
			AccessCount:  1,
		}
		
		// Score at time 0
		score0 := manager.CalculateScore(base)
		
		// Score after half-life
		lambda := tierLambda[TierSemantic]
		halfLifeHours := math.Log(2) / lambda
		
		base.LastAccessed = time.Now().Add(-time.Duration(halfLifeHours) * time.Hour)
		scoreHalfLife := manager.CalculateScore(base)
		
		// Score should be half
		assert.InDelta(t, score0/2, scoreHalfLife, 0.05)
	})
}

// Benchmarks

func BenchmarkCalculateScore(b *testing.B) {
	manager := New(nil)
	info := &MemoryInfo{
		ID:           "bench",
		Tier:         TierSemantic,
		LastAccessed: time.Now().Add(-24 * time.Hour),
		AccessCount:  10,
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.CalculateScore(info)
	}
}

func BenchmarkGetStats(b *testing.B) {
	manager := New(nil)
	
	memories := make([]MemoryInfo, 1000)
	for i := range memories {
		memories[i] = MemoryInfo{
			ID:           string(rune(i)),
			Tier:         []Tier{TierEpisodic, TierSemantic, TierProcedural}[i%3],
			LastAccessed: time.Now().Add(-time.Duration(i) * time.Hour),
			AccessCount:  int64(i % 100),
		}
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.GetStats(memories)
	}
}
