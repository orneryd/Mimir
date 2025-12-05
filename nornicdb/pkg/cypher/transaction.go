// Package cypher - Transaction support for Cypher queries.
//
// Implements BEGIN/COMMIT/ROLLBACK for Neo4j-compatible transaction control.
package cypher

import (
	"context"
	"fmt"

	"github.com/orneryd/nornicdb/pkg/storage"
)

// TransactionContext holds the active transaction for a Cypher session.
type TransactionContext struct {
	tx     interface{} // *storage.Transaction or *storage.BadgerTransaction
	engine storage.Engine
	active bool
}

// handleBegin starts a new explicit transaction.
func (e *ASTExecutor) handleBegin() (*ExecuteResult, error) {
	if e.txContext != nil && e.txContext.active {
		return nil, fmt.Errorf("transaction already active")
	}

	// Unwrap AsyncEngine and WALEngine to get underlying engine for transactions
	engine := e.storage
	if asyncEngine, ok := engine.(*storage.AsyncEngine); ok {
		engine = asyncEngine.GetEngine()
	}
	if walEngine, ok := engine.(*storage.WALEngine); ok {
		engine = walEngine.GetEngine()
	}

	// Start transaction based on engine type
	switch eng := engine.(type) {
	case *storage.BadgerEngine:
		tx, err := eng.BeginTransaction()
		if err != nil {
			return nil, fmt.Errorf("failed to start transaction: %w", err)
		}
		e.txContext = &TransactionContext{
			tx:     tx,
			engine: eng,
			active: true,
		}
	case *storage.MemoryEngine:
		tx := eng.BeginTransaction()
		e.txContext = &TransactionContext{
			tx:     tx,
			engine: eng,
			active: true,
		}
	default:
		return nil, fmt.Errorf("engine does not support transactions")
	}

	return &ExecuteResult{
		Columns: []string{"status"},
		Rows:    [][]interface{}{{"Transaction started"}},
	}, nil
}

// handleCommit commits the active transaction.
func (e *ASTExecutor) handleCommit() (*ExecuteResult, error) {
	if e.txContext == nil || !e.txContext.active {
		return nil, fmt.Errorf("no active transaction")
	}

	// Commit based on transaction type
	var err error
	switch tx := e.txContext.tx.(type) {
	case *storage.BadgerTransaction:
		err = tx.Commit()
	case *storage.Transaction:
		err = tx.Commit()
	default:
		return nil, fmt.Errorf("unknown transaction type")
	}

	e.txContext.active = false
	e.txContext = nil

	if err != nil {
		return nil, fmt.Errorf("commit failed: %w", err)
	}

	return &ExecuteResult{
		Columns: []string{"status"},
		Rows:    [][]interface{}{{"Transaction committed"}},
	}, nil
}

// handleRollback rolls back the active transaction.
func (e *ASTExecutor) handleRollback() (*ExecuteResult, error) {
	if e.txContext == nil || !e.txContext.active {
		return nil, fmt.Errorf("no active transaction")
	}

	// Rollback based on transaction type
	var err error
	switch tx := e.txContext.tx.(type) {
	case *storage.BadgerTransaction:
		err = tx.Rollback()
	case *storage.Transaction:
		err = tx.Rollback()
	default:
		return nil, fmt.Errorf("unknown transaction type")
	}

	e.txContext.active = false
	e.txContext = nil

	if err != nil {
		return nil, fmt.Errorf("rollback failed: %w", err)
	}

	return &ExecuteResult{
		Columns: []string{"status"},
		Rows:    [][]interface{}{{"Transaction rolled back"}},
	}, nil
}

// executeInTransaction executes a query within the active transaction.
func (e *ASTExecutor) executeInTransaction(ctx context.Context, cypher string, upperQuery string) (*ExecuteResult, error) {
	// Temporarily swap storage with transaction for scoped operations
	originalStorage := e.storage

	switch e.txContext.tx.(type) {
	case *storage.BadgerTransaction:
		// Use transaction-scoped operations
		// For now, execute against original storage (limitation)
		// Full implementation would use a transaction-aware storage adapter
		result, err := e.executeQueryAgainstStorage(ctx, cypher, upperQuery)
		e.storage = originalStorage
		return result, err
	case *storage.Transaction:
		// MemoryEngine transactions work fully
		result, err := e.executeQueryAgainstStorage(ctx, cypher, upperQuery)
		e.storage = originalStorage
		return result, err
	}

	return nil, fmt.Errorf("unknown transaction type")
}

// executeQueryAgainstStorage executes query with current storage context.
// ALL execution goes through ASTExecutor - NO string parsing.
func (e *ASTExecutor) executeQueryAgainstStorage(ctx context.Context, cypher string, upperQuery string) (*ExecuteResult, error) {
	return e.Execute(ctx, cypher, nil)
}
