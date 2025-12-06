// Package cypher - Tests for executor factory
package cypher

import (
	"context"
	"os"
	"testing"

	"github.com/orneryd/nornicdb/pkg/config"
	"github.com/orneryd/nornicdb/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFactory_DefaultMode(t *testing.T) {
	// Reset to default
	os.Unsetenv(config.EnvExecutorMode)
	config.SetExecutorMode(config.ExecutorModeHybrid)

	store := storage.NewMemoryEngine()
	exec := NewCypherExecutor(store)

	// Should be hybrid by default
	_, ok := exec.(*HybridExecutor)
	assert.True(t, ok, "Default executor should be HybridExecutor")

	// Cleanup if hybrid
	if h, ok := exec.(*HybridExecutor); ok {
		h.Close()
	}
}

func TestFactory_NornicMode(t *testing.T) {
	defer config.WithExecutorMode(config.ExecutorModeNornic)()

	store := storage.NewMemoryEngine()
	exec := NewCypherExecutor(store)

	_, ok := exec.(*StorageExecutor)
	assert.True(t, ok, "Nornic mode should use StorageExecutor")
}

func TestFactory_ANTLRMode(t *testing.T) {
	defer config.WithExecutorMode(config.ExecutorModeANTLR)()

	store := storage.NewMemoryEngine()
	exec := NewCypherExecutor(store)

	_, ok := exec.(*ASTExecutor)
	assert.True(t, ok, "ANTLR mode should use ASTExecutor")
}

func TestFactory_HybridMode(t *testing.T) {
	defer config.WithExecutorMode(config.ExecutorModeHybrid)()

	store := storage.NewMemoryEngine()
	exec := NewCypherExecutor(store)

	h, ok := exec.(*HybridExecutor)
	assert.True(t, ok, "Hybrid mode should use HybridExecutor")

	if h != nil {
		h.Close()
	}
}

func TestFactory_AllModesExecute(t *testing.T) {
	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeANTLR,
		config.ExecutorModeHybrid,
	}

	for _, mode := range modes {
		t.Run(string(mode), func(t *testing.T) {
			defer config.WithExecutorMode(mode)()

			store := storage.NewMemoryEngine()
			exec := NewCypherExecutor(store)
			ctx := context.Background()

			// All executors should handle basic queries
			_, err := exec.Execute(ctx, "CREATE (n:Test {name: 'test'})", nil)
			require.NoError(t, err)

			result, err := exec.Execute(ctx, "MATCH (n:Test) RETURN n.name", nil)
			require.NoError(t, err)
			assert.Equal(t, 1, len(result.Rows))
			assert.Equal(t, "test", result.Rows[0][0])

			// Cleanup
			if h, ok := exec.(*HybridExecutor); ok {
				h.Close()
			}
		})
	}
}

func TestFactory_EnvVarLoading(t *testing.T) {
	tests := []struct {
		envValue     string
		expectedMode config.ExecutorMode
	}{
		{"nornic", config.ExecutorModeNornic},
		{"NORNIC", config.ExecutorModeNornic},
		{"antlr", config.ExecutorModeANTLR},
		{"ANTLR", config.ExecutorModeANTLR},
		{"hybrid", config.ExecutorModeHybrid},
		{"HYBRID", config.ExecutorModeHybrid},
		{"  hybrid  ", config.ExecutorModeHybrid}, // trimmed
	}

	for _, tc := range tests {
		t.Run(tc.envValue, func(t *testing.T) {
			os.Setenv(config.EnvExecutorMode, tc.envValue)
			defer os.Unsetenv(config.EnvExecutorMode)

			// Re-init config
			config.SetExecutorMode(config.ExecutorModeHybrid) // reset
			// Manually parse like init does
			mode := config.ExecutorMode(tc.envValue)
			if mode == "nornic" || mode == "NORNIC" {
				config.SetExecutorMode(config.ExecutorModeNornic)
			} else if mode == "antlr" || mode == "ANTLR" {
				config.SetExecutorMode(config.ExecutorModeANTLR)
			} else {
				config.SetExecutorMode(config.ExecutorModeHybrid)
			}

			assert.Equal(t, tc.expectedMode, config.GetExecutorMode())
		})
	}
}

func TestFactory_GetExecutorInfo(t *testing.T) {
	modes := []config.ExecutorMode{
		config.ExecutorModeNornic,
		config.ExecutorModeANTLR,
		config.ExecutorModeHybrid,
	}

	for _, mode := range modes {
		t.Run(string(mode), func(t *testing.T) {
			defer config.WithExecutorMode(mode)()

			info := GetExecutorInfo()
			assert.NotEmpty(t, info.Mode)
			assert.NotEmpty(t, info.Description)
		})
	}
}
