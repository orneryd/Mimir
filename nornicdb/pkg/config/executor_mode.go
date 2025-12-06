// Package config - Executor mode configuration for NornicDB.
//
// Controls which Cypher executor implementation is used:
//   - nornic: Fast string-based parser (original implementation)
//   - antlr: Full ANTLR AST-based parser (slower, richer AST)
//   - hybrid: Fast execution + background AST building (default)
//
// Environment variable:
//
//	NORNICDB_EXECUTOR_MODE=hybrid  (default)
//	NORNICDB_EXECUTOR_MODE=nornic
//	NORNICDB_EXECUTOR_MODE=antlr
package config

import (
	"os"
	"strings"
	"sync/atomic"
)

// ExecutorMode represents the Cypher executor implementation to use
type ExecutorMode string

const (
	// ExecutorModeNornic uses the fast string-based parser
	ExecutorModeNornic ExecutorMode = "nornic"

	// ExecutorModeANTLR uses the full ANTLR AST-based parser
	ExecutorModeANTLR ExecutorMode = "antlr"

	// ExecutorModeHybrid uses fast execution + background AST building
	ExecutorModeHybrid ExecutorMode = "hybrid"

	// EnvExecutorMode is the environment variable key
	EnvExecutorMode = "NORNICDB_EXECUTOR_MODE"
)

// Default executor mode
var executorMode atomic.Value

func init() {
	// Default to hybrid
	executorMode.Store(ExecutorModeHybrid)

	// Load from environment
	if env := os.Getenv(EnvExecutorMode); env != "" {
		mode := ExecutorMode(strings.ToLower(strings.TrimSpace(env)))
		switch mode {
		case ExecutorModeNornic, ExecutorModeANTLR, ExecutorModeHybrid:
			executorMode.Store(mode)
		default:
			// Invalid value, keep default (hybrid)
		}
	}
}

// GetExecutorMode returns the current executor mode
func GetExecutorMode() ExecutorMode {
	return executorMode.Load().(ExecutorMode)
}

// SetExecutorMode sets the executor mode (for testing)
func SetExecutorMode(mode ExecutorMode) {
	switch mode {
	case ExecutorModeNornic, ExecutorModeANTLR, ExecutorModeHybrid:
		executorMode.Store(mode)
	default:
		// Invalid, ignore
	}
}

// IsExecutorModeNornic returns true if using the string-based parser
func IsExecutorModeNornic() bool {
	return GetExecutorMode() == ExecutorModeNornic
}

// IsExecutorModeANTLR returns true if using the ANTLR parser
func IsExecutorModeANTLR() bool {
	return GetExecutorMode() == ExecutorModeANTLR
}

// IsExecutorModeHybrid returns true if using the hybrid executor
func IsExecutorModeHybrid() bool {
	return GetExecutorMode() == ExecutorModeHybrid
}

// WithExecutorMode temporarily sets executor mode, returns restore function
func WithExecutorMode(mode ExecutorMode) func() {
	prev := GetExecutorMode()
	SetExecutorMode(mode)
	return func() {
		SetExecutorMode(prev)
	}
}
