// Package cypher - Executor factory for creating the appropriate executor based on config.
//
// Usage:
//
//	// Create executor based on NORNICDB_EXECUTOR_MODE env var
//	exec := cypher.NewExecutor(store)
//
//	// Or explicitly specify mode
//	exec := cypher.NewExecutorWithMode(store, config.ExecutorModeHybrid)
package cypher

import (
	"github.com/orneryd/nornicdb/pkg/config"
	"github.com/orneryd/nornicdb/pkg/storage"
)

// NewCypherExecutor creates a new Cypher executor based on the configured mode.
// The mode is determined by the NORNICDB_EXECUTOR_MODE environment variable:
//   - "nornic": Fast string-based parser
//   - "antlr": Full ANTLR AST-based parser
//   - "hybrid" (default): Fast execution + background AST building
func NewCypherExecutor(store storage.Engine) CypherExecutor {
	return NewCypherExecutorWithMode(store, config.GetExecutorMode())
}

// NewCypherExecutorWithMode creates a new Cypher executor with a specific mode.
func NewCypherExecutorWithMode(store storage.Engine, mode config.ExecutorMode) CypherExecutor {
	switch mode {
	case config.ExecutorModeANTLR:
		return NewASTExecutor(store)
	case config.ExecutorModeHybrid:
		return NewHybridExecutor(store, DefaultHybridConfig())
	case config.ExecutorModeNornic:
		fallthrough
	default:
		return NewStorageExecutor(store)
	}
}

// ExecutorInfo contains information about the current executor
type ExecutorInfo struct {
	Mode        string `json:"mode"`
	Description string `json:"description"`
}

// GetExecutorInfo returns information about the current executor mode
func GetExecutorInfo() ExecutorInfo {
	mode := config.GetExecutorMode()
	switch mode {
	case config.ExecutorModeANTLR:
		return ExecutorInfo{
			Mode:        string(mode),
			Description: "ANTLR AST-based parser - full parse tree, slower execution",
		}
	case config.ExecutorModeHybrid:
		return ExecutorInfo{
			Mode:        string(mode),
			Description: "Hybrid executor - fast string execution + background AST building",
		}
	default:
		return ExecutorInfo{
			Mode:        string(config.ExecutorModeNornic),
			Description: "Nornic string-based parser - fastest execution",
		}
	}
}
