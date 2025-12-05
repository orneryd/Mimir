// Package cypher provides Neo4j-compatible Cypher query execution for NornicDB.
package cypher

import (
	"context"
)

// CypherExecutor is the interface for executing Cypher queries.
// Both ASTExecutor (regex-based) and ASTExecutor (ANTLR-based) implement this.
type CypherExecutor interface {
	Execute(ctx context.Context, query string, params map[string]interface{}) (*ExecuteResult, error)
	SetEmbedder(embedder QueryEmbedder)
	SetNodeCreatedCallback(cb NodeCreatedCallback)
}

// Verify ASTExecutor implements the interface at compile time
var _ CypherExecutor = (*ASTExecutor)(nil)
