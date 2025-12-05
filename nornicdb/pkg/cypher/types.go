// Package cypher - Core types for AST-first Cypher executor.
//
// This file contains all type definitions needed for Cypher query execution.
// No string parsing - all query processing uses the ANTLR-generated AST.
package cypher

import (
	"context"
	"regexp"

	"github.com/orneryd/nornicdb/pkg/storage"
)

// ExecuteResult represents the result of executing a Cypher query.
// Contains column names, row data, and statistics about the operation.
type ExecuteResult struct {
	Columns []string        // Column names in result
	Rows    [][]interface{} // Result rows
	Stats   *QueryStats     // Statistics about the operation
}

// QueryStats tracks statistics about query execution.
type QueryStats struct {
	NodesCreated         int
	NodesDeleted         int
	RelationshipsCreated int
	RelationshipsDeleted int
	PropertiesSet        int
	LabelsAdded          int
	LabelsRemoved        int
	IndexesCreated       int
	IndexesDeleted       int
	ConstraintsCreated   int
	ConstraintsDeleted   int
}

// QueryType identifies the type of Cypher query for routing and caching.
type QueryType int

const (
	QueryUnknown QueryType = iota
	QueryMatch
	QueryCreate
	QueryMerge
	QueryDelete
	QuerySet
	QueryRemove
	QueryReturn
	QueryWith
	QueryCall
	QueryShow
	QuerySchema
)

// Clause represents a parsed Cypher clause.
// This interface is used for the query plan cache.
type Clause interface {
	ClauseType() string
}

// MatchClause represents a MATCH clause.
type MatchClause struct {
	Pattern  string
	Where    string
	Optional bool
}

func (m *MatchClause) ClauseType() string { return "MATCH" }

// CreateClause represents a CREATE clause.
type CreateClause struct {
	Pattern string
}

func (c *CreateClause) ClauseType() string { return "CREATE" }

// ReturnClause represents a RETURN clause.
type ReturnClause struct {
	Items []string
}

func (r *ReturnClause) ClauseType() string { return "RETURN" }

// TransactionContext holds the active transaction for a Cypher session.
type TransactionContext struct {
	tx     interface{} // *storage.Transaction or *storage.BadgerTransaction
	engine storage.Engine
	active bool
}

// labelRegex extracts labels from Cypher queries for cache invalidation.
// Matches patterns like :Label, (:Label), [:RELTYPE]
var labelRegex = regexp.MustCompile(`[:|\[]([A-Z][a-zA-Z0-9_]*)`)

// CypherExecutor is the interface for Cypher query execution.
// Both ASTExecutor implements this interface.
type CypherExecutor interface {
	Execute(ctx context.Context, query string, params map[string]interface{}) (*ExecuteResult, error)
	SetEmbedder(embedder QueryEmbedder)
	SetNodeCreatedCallback(cb NodeCreatedCallback)
}

// Compile-time check that ASTExecutor implements CypherExecutor
var _ CypherExecutor = (*ASTExecutor)(nil)

// ParallelConfig controls parallel query execution.
type ParallelConfig struct {
	Enabled      bool
	MaxWorkers   int
	MinBatchSize int
}

// parallelConfig holds the current parallel execution settings.
var parallelConfig = ParallelConfig{
	Enabled:      false,
	MaxWorkers:   4,
	MinBatchSize: 100,
}

// SetParallelConfig updates the parallel execution configuration.
func SetParallelConfig(cfg ParallelConfig) {
	parallelConfig = cfg
}

// GetParallelConfig returns the current parallel configuration.
func GetParallelConfig() ParallelConfig {
	return parallelConfig
}
