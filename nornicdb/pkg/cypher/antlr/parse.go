// Package antlr provides ANTLR-based Cypher parsing for NornicDB.
//
// OPTIMIZATIONS APPLIED:
// 1. Parser/Lexer pooling - reuse instances via SetInputStream (avoids allocation)
// 2. SLL prediction mode - O(n) vs LL's O(n^4) worst case
// 3. Shared DFA cache - builds up over time for faster decisions
// 4. Parse tree caching - avoid re-parsing identical queries
package antlr

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/antlr4-go/antlr/v4"
)

// ParseResult contains the parsed ANTLR tree and any errors
type ParseResult struct {
	Tree   IScriptContext
	Errors []string
}

// parserWrapper holds reusable parser components
type parserWrapper struct {
	lexer  *CypherLexer
	tokens *antlr.CommonTokenStream
	parser *CypherParser
}

// Global parser pool and cache
var (
	parserPool  sync.Pool
	treeCache   sync.Map // query string -> *ParseResult
	cacheHits   atomic.Int64
	cacheMisses atomic.Int64
	poolOnce    sync.Once
)

// initPool initializes the parser pool
func initPool() {
	parserPool = sync.Pool{
		New: func() interface{} {
			// Create lexer with empty input
			input := antlr.NewInputStream("")
			lexer := NewCypherLexer(input)
			lexer.RemoveErrorListeners()

			// Create token stream
			tokens := antlr.NewCommonTokenStream(lexer, antlr.TokenDefaultChannel)

			// Create parser
			parser := NewCypherParser(tokens)
			parser.RemoveErrorListeners()

			// OPTIMIZATION: Use SLL prediction mode (faster)
			parser.GetInterpreter().SetPredictionMode(antlr.PredictionModeSLL)

			return &parserWrapper{
				lexer:  lexer,
				tokens: tokens,
				parser: parser,
			}
		},
	}
}

// Parse parses a Cypher query string using ANTLR and returns the parse tree
func Parse(query string) (*ParseResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty query")
	}

	// OPTIMIZATION 1: Check cache first
	if cached, ok := treeCache.Load(query); ok {
		cacheHits.Add(1)
		return cached.(*ParseResult), nil
	}
	cacheMisses.Add(1)

	// Initialize pool on first use
	poolOnce.Do(initPool)

	// OPTIMIZATION 2: Get parser from pool (reuse)
	pw := parserPool.Get().(*parserWrapper)
	defer parserPool.Put(pw)

	// OPTIMIZATION 3: Reuse via SetInputStream (avoids allocation)
	input := antlr.NewInputStream(query)
	pw.lexer.SetInputStream(input)
	pw.tokens.SetTokenSource(pw.lexer)
	pw.parser.SetTokenStream(pw.tokens)

	// Add error listener for this parse
	errorListener := &parseErrorListener{}
	pw.parser.AddErrorListener(errorListener)
	pw.lexer.AddErrorListener(errorListener)

	// Parse (SLL mode - fast path)
	tree := pw.parser.Script()

	// Remove error listeners before returning to pool
	pw.parser.RemoveErrorListeners()
	pw.lexer.RemoveErrorListeners()

	result := &ParseResult{
		Tree:   tree,
		Errors: errorListener.errors,
	}

	// Check for errors
	if len(errorListener.errors) > 0 {
		return result, fmt.Errorf("syntax error: %s", strings.Join(errorListener.errors, "; "))
	}

	// OPTIMIZATION 4: Cache successful parses
	treeCache.Store(query, result)

	return result, nil
}

// ParseNoCache parses without caching (for parameterized queries)
func ParseNoCache(query string) (*ParseResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty query")
	}

	poolOnce.Do(initPool)

	pw := parserPool.Get().(*parserWrapper)
	defer parserPool.Put(pw)

	input := antlr.NewInputStream(query)
	pw.lexer.SetInputStream(input)
	pw.tokens.SetTokenSource(pw.lexer)
	pw.parser.SetTokenStream(pw.tokens)

	errorListener := &parseErrorListener{}
	pw.parser.AddErrorListener(errorListener)
	pw.lexer.AddErrorListener(errorListener)

	tree := pw.parser.Script()

	pw.parser.RemoveErrorListeners()
	pw.lexer.RemoveErrorListeners()

	result := &ParseResult{
		Tree:   tree,
		Errors: errorListener.errors,
	}

	if len(errorListener.errors) > 0 {
		return result, fmt.Errorf("syntax error: %s", strings.Join(errorListener.errors, "; "))
	}

	return result, nil
}

// ClearCache clears the parse tree cache
func ClearCache() {
	treeCache = sync.Map{}
}

// CacheStats returns cache hit/miss statistics
func CacheStats() (hits, misses int64) {
	return cacheHits.Load(), cacheMisses.Load()
}

// parseErrorListener collects syntax errors during parsing
type parseErrorListener struct {
	*antlr.DefaultErrorListener
	errors []string
}

func (e *parseErrorListener) SyntaxError(recognizer antlr.Recognizer, offendingSymbol interface{}, line, column int, msg string, ex antlr.RecognitionException) {
	e.errors = append(e.errors, fmt.Sprintf("line %d:%d %s", line, column, msg))
}
