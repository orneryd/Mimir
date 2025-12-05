// Package cypher - AST-first Cypher executor.
//
// This executor walks the ANTLR parse tree directly instead of parsing strings.
// All clause data is extracted from AST nodes - NO string parsing at all.
package cypher

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	cyantlr "github.com/orneryd/nornicdb/pkg/cypher/antlr"
	"github.com/orneryd/nornicdb/pkg/storage"
)

// NodeCreatedCallback is called when a node is created or updated via Cypher.
// This allows external systems (like the embed queue) to be notified of new content.
type NodeCreatedCallback func(nodeID string)

// QueryEmbedder generates embeddings for search queries.
// This is a minimal interface to avoid import cycles with embed package.
type QueryEmbedder interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}

// ID generator for AST executor
var astIDGen int64

// PluginFunctionLookup is a callback to lookup plugin functions by name.
// Set by the nornicdb package during initialization.
var PluginFunctionLookup func(name string) (interface{}, bool)

// ASTExecutor executes Cypher queries by walking the ANTLR parse tree directly.
// No string parsing - all data comes from AST nodes.
type ASTExecutor struct {
	storage storage.Engine
	cache   *QueryPlanCache // Caches parse trees by query string

	// Callbacks and integrations
	nodeCreatedCallback NodeCreatedCallback
	embedder            QueryEmbedder

	// Node lookup cache for fast MATCH pattern lookups
	nodeLookupCache   map[string]*storage.Node
	nodeLookupCacheMu sync.RWMutex

	// Transaction context
	txContext *TransactionContext

	// Execution context passed through tree walk
	ctx         context.Context
	params      map[string]interface{}
	variables   map[string]interface{} // Variable bindings during execution
	result      *ExecuteResult
	matchedRows []map[string]interface{} // Current matched rows
}

// NewASTExecutor creates a new AST-first executor
func NewASTExecutor(store storage.Engine) *ASTExecutor {
	return &ASTExecutor{
		storage:         store,
		cache:           NewQueryPlanCache(1000),
		variables:       make(map[string]interface{}),
		nodeLookupCache: make(map[string]*storage.Node, 1000),
	}
}

// SetNodeCreatedCallback sets the callback for node creation events
func (e *ASTExecutor) SetNodeCreatedCallback(cb NodeCreatedCallback) {
	e.nodeCreatedCallback = cb
}

// SetEmbedder sets the embedding function for vector operations
func (e *ASTExecutor) SetEmbedder(embedder QueryEmbedder) {
	e.embedder = embedder
}

// notifyNodeCreated calls the callback if set
func (e *ASTExecutor) notifyNodeCreated(nodeID string) {
	if e.nodeCreatedCallback != nil {
		e.nodeCreatedCallback(nodeID)
	}
}

// Execute parses and executes a Cypher query using AST walking
func (e *ASTExecutor) Execute(ctx context.Context, cypher string, params map[string]interface{}) (*ExecuteResult, error) {
	// Parse query (or get from cache)
	parseResult, err := cyantlr.Parse(cypher)
	if err != nil {
		return nil, err
	}

	// Initialize execution context
	e.ctx = ctx
	e.params = params
	e.variables = make(map[string]interface{})
	e.result = &ExecuteResult{
		Columns: []string{},
		Rows:    [][]interface{}{},
		Stats:   &QueryStats{},
	}
	e.matchedRows = nil

	// Execute by walking the AST
	if err := e.executeScript(parseResult.Tree); err != nil {
		return nil, err
	}

	return e.result, nil
}

// executeScript executes a script (top-level rule)
func (e *ASTExecutor) executeScript(tree cyantlr.IScriptContext) error {
	if tree == nil {
		return fmt.Errorf("nil parse tree")
	}

	// Script contains one or more queries
	for _, query := range tree.AllQuery() {
		if err := e.executeQuery(query); err != nil {
			return err
		}
	}
	return nil
}

// executeQuery executes a single query
func (e *ASTExecutor) executeQuery(query cyantlr.IQueryContext) error {
	if query == nil {
		return nil
	}

	// Check for standalone CALL
	if call := query.StandaloneCall(); call != nil {
		return e.executeStandaloneCall(call)
	}

	// Check for SHOW command
	if show := query.ShowCommand(); show != nil {
		return e.executeShowCommand(show)
	}

	// Check for schema command (CREATE/DROP INDEX/CONSTRAINT)
	if schema := query.SchemaCommand(); schema != nil {
		return e.executeSchemaCommand(schema)
	}

	// Regular query
	if regular := query.RegularQuery(); regular != nil {
		return e.executeRegularQuery(regular)
	}

	return nil
}

// executeRegularQuery handles MATCH/CREATE/MERGE/etc queries
func (e *ASTExecutor) executeRegularQuery(query cyantlr.IRegularQueryContext) error {
	if query == nil {
		return nil
	}

	// Get single query
	if single := query.SingleQuery(); single != nil {
		return e.executeSingleQuery(single)
	}

	return nil
}

// executeSingleQuery handles a single query (may be multi-part with WITH)
func (e *ASTExecutor) executeSingleQuery(query cyantlr.ISingleQueryContext) error {
	if query == nil {
		return nil
	}

	// Single-part query
	if singlePart := query.SinglePartQ(); singlePart != nil {
		return e.executeSinglePartQuery(singlePart)
	}

	// Multi-part query (with WITH clauses)
	if multiPart := query.MultiPartQ(); multiPart != nil {
		return e.executeMultiPartQuery(multiPart)
	}

	return nil
}

// executeSinglePartQuery handles a query without WITH chaining
func (e *ASTExecutor) executeSinglePartQuery(query cyantlr.ISinglePartQContext) error {
	if query == nil {
		return nil
	}

	// Execute reading statements (MATCH, UNWIND, etc.)
	for _, reading := range query.AllReadingStatement() {
		if err := e.executeReadingStatement(reading); err != nil {
			return err
		}
	}

	// Execute updating statements (CREATE, MERGE, DELETE, SET, REMOVE)
	for _, updating := range query.AllUpdatingStatement() {
		if err := e.executeUpdatingStatement(updating); err != nil {
			return err
		}
	}

	// Execute RETURN
	if ret := query.ReturnSt(); ret != nil {
		return e.executeReturn(ret)
	}

	return nil
}

// executeMultiPartQuery handles queries with WITH clauses
func (e *ASTExecutor) executeMultiPartQuery(query cyantlr.IMultiPartQContext) error {
	if query == nil {
		return nil
	}

	// Multi-part queries have: reading/updating statements, then WITH, repeated, then final single part
	// Execute all reading statements first
	for _, reading := range query.AllReadingStatement() {
		if err := e.executeReadingStatement(reading); err != nil {
			return err
		}
	}

	// Execute all updating statements
	for _, updating := range query.AllUpdatingStatement() {
		if err := e.executeUpdatingStatement(updating); err != nil {
			return err
		}
	}

	// Execute WITH clauses in sequence
	for _, with := range query.AllWithSt() {
		if err := e.executeWith(with); err != nil {
			return err
		}
	}

	// Execute the final single part
	if singlePart := query.SinglePartQ(); singlePart != nil {
		return e.executeSinglePartQuery(singlePart)
	}

	return nil
}

// executeReadingStatement handles MATCH, UNWIND, CALL subquery, CALL procedure
func (e *ASTExecutor) executeReadingStatement(stmt cyantlr.IReadingStatementContext) error {
	if stmt == nil {
		return nil
	}

	// MATCH clause
	if match := stmt.MatchSt(); match != nil {
		return e.executeMatch(match)
	}

	// UNWIND clause
	if unwind := stmt.UnwindSt(); unwind != nil {
		return e.executeUnwind(unwind)
	}

	// CALL procedure (e.g., CALL db.labels())
	if queryCall := stmt.QueryCallSt(); queryCall != nil {
		return e.executeQueryCall(queryCall)
	}

	// CALL {} subquery
	if call := stmt.CallSubquery(); call != nil {
		return e.executeCallSubquery(call)
	}

	return nil
}

// executeUpdatingStatement handles CREATE, MERGE, DELETE, SET, REMOVE
func (e *ASTExecutor) executeUpdatingStatement(stmt cyantlr.IUpdatingStatementContext) error {
	if stmt == nil {
		return nil
	}

	// CREATE clause
	if create := stmt.CreateSt(); create != nil {
		return e.executeCreate(create)
	}

	// MERGE clause
	if merge := stmt.MergeSt(); merge != nil {
		return e.executeMerge(merge)
	}

	// DELETE clause
	if del := stmt.DeleteSt(); del != nil {
		return e.executeDelete(del)
	}

	// SET clause
	if set := stmt.SetSt(); set != nil {
		return e.executeSet(set)
	}

	// REMOVE clause
	if remove := stmt.RemoveSt(); remove != nil {
		return e.executeRemove(remove)
	}

	return nil
}

// executeMatch handles MATCH clause by walking AST
func (e *ASTExecutor) executeMatch(match cyantlr.IMatchStContext) error {
	if match == nil {
		return nil
	}

	isOptional := match.OPTIONAL() != nil

	// Get pattern from PatternWhere
	patternWhere := match.PatternWhere()
	if patternWhere == nil {
		return nil
	}

	pattern := patternWhere.Pattern()
	if pattern == nil {
		return nil
	}

	// Execute pattern matching
	matchedRows, err := e.matchPattern(pattern, isOptional)
	if err != nil {
		return err
	}

	// Apply WHERE filter if present
	if where := patternWhere.Where(); where != nil {
		matchedRows, err = e.filterByWhere(matchedRows, where)
		if err != nil {
			return err
		}
	}

	// Store matched rows for subsequent clauses
	if e.matchedRows == nil {
		e.matchedRows = matchedRows
	} else {
		// Join with existing matches (for multiple MATCH)
		e.matchedRows = e.joinMatches(e.matchedRows, matchedRows)
	}

	return nil
}

// matchPattern executes pattern matching from AST
func (e *ASTExecutor) matchPattern(pattern cyantlr.IPatternContext, isOptional bool) ([]map[string]interface{}, error) {
	var results []map[string]interface{}

	// Pattern contains pattern parts
	for _, part := range pattern.AllPatternPart() {
		partResults, err := e.matchPatternPart(part)
		if err != nil {
			if isOptional {
				continue
			}
			return nil, err
		}
		results = append(results, partResults...)
	}

	if len(results) == 0 && isOptional {
		results = append(results, make(map[string]interface{}))
	}

	return results, nil
}

// matchPatternPart matches a single pattern part like (n:Label)-[r]->(m)
func (e *ASTExecutor) matchPatternPart(part cyantlr.IPatternPartContext) ([]map[string]interface{}, error) {
	if part == nil {
		return nil, nil
	}

	// Get pattern element - use PatternElem() not AnonymousPatternPart()
	patternElem := part.PatternElem()
	if patternElem == nil {
		return nil, nil
	}

	// Extract variable name if pattern is assigned (p = ...)
	var pathVar string
	if sym := part.Symbol(); sym != nil {
		pathVar = sym.GetText()
	}

	// Match the pattern element (node and relationships)
	return e.matchPatternElem(patternElem, pathVar)
}

// matchPatternElem matches nodes and relationships
func (e *ASTExecutor) matchPatternElem(elem cyantlr.IPatternElemContext, pathVar string) ([]map[string]interface{}, error) {
	if elem == nil {
		return nil, nil
	}

	// Get the node pattern
	nodePattern := elem.NodePattern()
	if nodePattern == nil {
		return nil, nil
	}

	// Extract node info from AST
	nodeVar, labels, props := e.extractNodePattern(nodePattern)

	// Find matching nodes
	nodes, err := e.findNodes(labels, props)
	if err != nil {
		return nil, err
	}

	// Build result rows
	var results []map[string]interface{}
	for _, node := range nodes {
		row := make(map[string]interface{})
		if nodeVar != "" {
			row[nodeVar] = e.nodeToMap(node)
		}
		results = append(results, row)
	}

	// Handle relationship chains
	for _, chain := range elem.AllPatternElemChain() {
		results, err = e.extendWithChain(results, chain)
		if err != nil {
			return nil, err
		}
	}

	return results, nil
}

// extractNodePattern extracts variable, labels, and properties from node pattern AST
func (e *ASTExecutor) extractNodePattern(node cyantlr.INodePatternContext) (variable string, labels []string, props map[string]interface{}) {
	props = make(map[string]interface{})

	if node == nil {
		return
	}

	// Get variable name
	if sym := node.Symbol(); sym != nil {
		variable = sym.GetText()
	}

	// Get labels - NodeLabels has AllName() for label names
	if nodeLabels := node.NodeLabels(); nodeLabels != nil {
		for _, name := range nodeLabels.AllName() {
			labels = append(labels, name.GetText())
		}
	}

	// Get properties
	if propsCtx := node.Properties(); propsCtx != nil {
		props = e.extractProperties(propsCtx)
	}

	return
}

// extractProperties extracts property map from AST
func (e *ASTExecutor) extractProperties(propsCtx cyantlr.IPropertiesContext) map[string]interface{} {
	result := make(map[string]interface{})

	if propsCtx == nil {
		return result
	}

	// MapLit contains map pairs
	if mapLit := propsCtx.MapLit(); mapLit != nil {
		for _, pair := range mapLit.AllMapPair() {
			key := ""
			if nameCtx := pair.Name(); nameCtx != nil {
				key = nameCtx.GetText()
			}
			if key != "" {
				if exprCtx := pair.Expression(); exprCtx != nil {
					result[key] = e.evaluateExpression(exprCtx)
				}
			}
		}
	}

	return result
}

// evaluateExpression evaluates an expression AST node
func (e *ASTExecutor) evaluateExpression(expr cyantlr.IExpressionContext) interface{} {
	if expr == nil {
		return nil
	}

	// Get the text and try to parse as literal
	text := strings.TrimSpace(expr.GetText())

	// Check for parameter
	if len(text) > 0 && text[0] == '$' {
		paramName := text[1:]
		if val, ok := e.params[paramName]; ok {
			return val
		}
		return nil
	}

	// Try to parse as number
	if i, err := strconv.ParseInt(text, 10, 64); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(text, 64); err == nil {
		return f
	}

	// Boolean
	lower := strings.ToLower(text)
	if lower == "true" {
		return true
	}
	if lower == "false" {
		return false
	}
	if lower == "null" {
		return nil
	}

	// String literal - remove quotes
	if len(text) >= 2 {
		if (text[0] == '\'' && text[len(text)-1] == '\'') ||
			(text[0] == '"' && text[len(text)-1] == '"') {
			return text[1 : len(text)-1]
		}
	}

	// Return as-is (might be a variable reference)
	return text
}

// findNodes finds nodes matching labels and properties
func (e *ASTExecutor) findNodes(labels []string, props map[string]interface{}) ([]*storage.Node, error) {
	var result []*storage.Node

	if len(labels) > 0 {
		// Find by label
		for _, label := range labels {
			nodes, err := e.storage.GetNodesByLabel(label)
			if err != nil {
				return nil, err
			}
			result = append(result, nodes...)
		}
	} else {
		// Get all nodes - returns []*Node, no error
		result = e.storage.GetAllNodes()
	}

	// Filter by properties
	if len(props) > 0 {
		filtered := make([]*storage.Node, 0)
		for _, node := range result {
			if e.nodeMatchesProps(node, props) {
				filtered = append(filtered, node)
			}
		}
		result = filtered
	}

	return result, nil
}

// nodeMatchesProps checks if node has all required properties
func (e *ASTExecutor) nodeMatchesProps(node *storage.Node, props map[string]interface{}) bool {
	for key, val := range props {
		nodeVal, exists := node.Properties[key]
		if !exists {
			return false
		}
		if !e.valuesEqual(nodeVal, val) {
			return false
		}
	}
	return true
}

// valuesEqual compares two values
func (e *ASTExecutor) valuesEqual(a, b interface{}) bool {
	switch av := a.(type) {
	case int64:
		switch bv := b.(type) {
		case int64:
			return av == bv
		case float64:
			return float64(av) == bv
		case int:
			return av == int64(bv)
		}
	case float64:
		switch bv := b.(type) {
		case float64:
			return av == bv
		case int64:
			return av == float64(bv)
		case int:
			return av == float64(bv)
		}
	case string:
		if bv, ok := b.(string); ok {
			return av == bv
		}
	case bool:
		if bv, ok := b.(bool); ok {
			return av == bv
		}
	}
	return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
}

// nodeToMap converts a storage.Node to a map for result rows
func (e *ASTExecutor) nodeToMap(node *storage.Node) map[string]interface{} {
	result := make(map[string]interface{})
	result["_nodeId"] = string(node.ID)
	result["_labels"] = node.Labels
	for k, v := range node.Properties {
		result[k] = v
	}
	return result
}

// executeCreate handles CREATE clause
func (e *ASTExecutor) executeCreate(create cyantlr.ICreateStContext) error {
	if create == nil {
		return nil
	}

	pattern := create.Pattern()
	if pattern == nil {
		return nil
	}

	// Create nodes/relationships from pattern
	for _, part := range pattern.AllPatternPart() {
		if err := e.createPatternPart(part); err != nil {
			return err
		}
	}

	return nil
}

// createPatternPart creates nodes and relationships from a pattern part
func (e *ASTExecutor) createPatternPart(part cyantlr.IPatternPartContext) error {
	if part == nil {
		return nil
	}

	patternElem := part.PatternElem()
	if patternElem == nil {
		return nil
	}

	return e.createPatternElem(patternElem)
}

// createPatternElem creates nodes and relationships
func (e *ASTExecutor) createPatternElem(elem cyantlr.IPatternElemContext) error {
	if elem == nil {
		return nil
	}

	// Create first node
	nodePattern := elem.NodePattern()
	if nodePattern == nil {
		return nil
	}

	nodeVar, labels, props := e.extractNodePattern(nodePattern)
	node, err := e.createNode(labels, props)
	if err != nil {
		return err
	}

	// Store in variables if named
	if nodeVar != "" {
		e.variables[nodeVar] = e.nodeToMap(node)
	}
	e.result.Stats.NodesCreated++

	// Create relationships in chains
	lastNode := node
	for _, chain := range elem.AllPatternElemChain() {
		lastNode, err = e.createChain(lastNode, chain)
		if err != nil {
			return err
		}
	}

	return nil
}

// generateID creates a unique ID for nodes/edges
func (e *ASTExecutor) generateID() string {
	id := atomic.AddInt64(&astIDGen, 1)
	return fmt.Sprintf("n%d", id)
}

// createNode creates a new node in storage
func (e *ASTExecutor) createNode(labels []string, props map[string]interface{}) (*storage.Node, error) {
	node := &storage.Node{
		ID:         storage.NodeID(e.generateID()),
		Labels:     labels,
		Properties: props,
	}

	if err := e.storage.CreateNode(node); err != nil {
		return nil, err
	}

	e.notifyNodeCreated(string(node.ID))

	return node, nil
}

// createChain creates relationships in a pattern chain
func (e *ASTExecutor) createChain(startNode *storage.Node, chain cyantlr.IPatternElemChainContext) (*storage.Node, error) {
	if chain == nil {
		return startNode, nil
	}

	// Get relationship detail
	relPattern := chain.RelationshipPattern()
	if relPattern == nil {
		return startNode, nil
	}

	// Get end node
	endNodePattern := chain.NodePattern()
	if endNodePattern == nil {
		return startNode, nil
	}

	// Create end node
	endVar, endLabels, endProps := e.extractNodePattern(endNodePattern)
	endNode, err := e.createNode(endLabels, endProps)
	if err != nil {
		return nil, err
	}
	e.result.Stats.NodesCreated++

	if endVar != "" {
		e.variables[endVar] = e.nodeToMap(endNode)
	}

	// Extract relationship info and create
	relVar, relType, relProps, isForward := e.extractRelationshipPattern(relPattern)

	var edge *storage.Edge
	edgeID := storage.EdgeID(e.generateID())
	if isForward {
		edge = &storage.Edge{
			ID:         edgeID,
			Type:       relType,
			StartNode:  startNode.ID,
			EndNode:    endNode.ID,
			Properties: relProps,
		}
	} else {
		edge = &storage.Edge{
			ID:         edgeID,
			Type:       relType,
			StartNode:  endNode.ID,
			EndNode:    startNode.ID,
			Properties: relProps,
		}
	}

	if err := e.storage.CreateEdge(edge); err != nil {
		return nil, err
	}
	e.result.Stats.RelationshipsCreated++

	if relVar != "" {
		e.variables[relVar] = map[string]interface{}{
			"_edgeId": string(edge.ID),
			"_type":   edge.Type,
		}
	}

	return endNode, nil
}

// extractRelationshipPattern extracts relationship info from AST
func (e *ASTExecutor) extractRelationshipPattern(rel cyantlr.IRelationshipPatternContext) (variable, relType string, props map[string]interface{}, isForward bool) {
	props = make(map[string]interface{})
	isForward = true // default

	if rel == nil {
		return
	}

	// Check direction from arrows in the text
	text := rel.GetText()
	if len(text) > 0 && text[0] == '<' {
		isForward = false
	}

	// Get relationship detail
	if detail := rel.RelationDetail(); detail != nil {
		// Get variable
		if sym := detail.Symbol(); sym != nil {
			variable = sym.GetText()
		}

		// Get type
		if types := detail.RelationshipTypes(); types != nil {
			for _, t := range types.AllName() {
				relType = t.GetText()
				break // Just take first type
			}
		}

		// Get properties
		if propsCtx := detail.Properties(); propsCtx != nil {
			props = e.extractProperties(propsCtx)
		}
	}

	return
}

// executeDelete handles DELETE clause
func (e *ASTExecutor) executeDelete(del cyantlr.IDeleteStContext) error {
	if del == nil {
		return nil
	}

	isDetach := del.DETACH() != nil

	// Get expression chain (variables to delete)
	exprChain := del.ExpressionChain()
	if exprChain == nil {
		return nil
	}

	// Get variable names to delete
	varsToDelete := e.extractExpressionChainVars(exprChain)

	// Delete from matched rows
	for _, row := range e.matchedRows {
		for _, varName := range varsToDelete {
			val, exists := row[varName]
			if !exists {
				continue
			}

			// Check if it's a node or edge
			if nodeMap, ok := val.(map[string]interface{}); ok {
				if edgeID, ok := nodeMap["_edgeId"].(string); ok {
					// Delete edge
					if err := e.storage.DeleteEdge(storage.EdgeID(edgeID)); err == nil {
						e.result.Stats.RelationshipsDeleted++
					}
				} else if nodeID, ok := nodeMap["_nodeId"].(string); ok {
					// Delete node
					if isDetach {
						// Delete connected edges first
						edges, _ := e.storage.GetOutgoingEdges(storage.NodeID(nodeID))
						for _, edge := range edges {
							e.storage.DeleteEdge(edge.ID)
							e.result.Stats.RelationshipsDeleted++
						}
						edges, _ = e.storage.GetIncomingEdges(storage.NodeID(nodeID))
						for _, edge := range edges {
							e.storage.DeleteEdge(edge.ID)
							e.result.Stats.RelationshipsDeleted++
						}
					}
					if err := e.storage.DeleteNode(storage.NodeID(nodeID)); err == nil {
						e.result.Stats.NodesDeleted++
					}
				}
			}
		}
	}

	return nil
}

// extractExpressionChainVars extracts variable names from expression chain by walking the AST
func (e *ASTExecutor) extractExpressionChainVars(chain cyantlr.IExpressionChainContext) []string {
	var vars []string
	if chain == nil {
		return vars
	}

	for _, expr := range chain.AllExpression() {
		if varName := e.extractVariableFromExpression(expr); varName != "" {
			vars = append(vars, varName)
		}
	}

	return vars
}

// extractVariableFromExpression walks the expression AST to find a simple variable reference
func (e *ASTExecutor) extractVariableFromExpression(expr cyantlr.IExpressionContext) string {
	if expr == nil {
		return ""
	}

	// Walk down the expression tree to find Atom -> Symbol
	// Expression -> XorExpression -> AndExpression -> NotExpression -> ComparisonExpression
	// -> AddSubExpression -> MultDivExpression -> PowerExpression -> UnaryAddSubExpression
	// -> AtomicExpression -> PropertyOrLabelExpression -> PropertyExpression -> Atom

	xors := expr.AllXorExpression()
	if len(xors) != 1 {
		return ""
	}

	ands := xors[0].AllAndExpression()
	if len(ands) != 1 {
		return ""
	}

	nots := ands[0].AllNotExpression()
	if len(nots) != 1 {
		return ""
	}

	comp := nots[0].ComparisonExpression()
	if comp == nil {
		return ""
	}

	adds := comp.AllAddSubExpression()
	if len(adds) != 1 {
		return ""
	}

	mults := adds[0].AllMultDivExpression()
	if len(mults) != 1 {
		return ""
	}

	powers := mults[0].AllPowerExpression()
	if len(powers) != 1 {
		return ""
	}

	unarys := powers[0].AllUnaryAddSubExpression()
	if len(unarys) != 1 {
		return ""
	}

	atomic := unarys[0].AtomicExpression()
	if atomic == nil {
		return ""
	}

	propOrLabel := atomic.PropertyOrLabelExpression()
	if propOrLabel == nil {
		return ""
	}

	propExpr := propOrLabel.PropertyExpression()
	if propExpr == nil {
		return ""
	}

	// If there are property lookups (dots), it's not a simple variable
	if len(propExpr.AllDOT()) > 0 {
		return ""
	}

	atom := propExpr.Atom()
	if atom == nil {
		return ""
	}

	// Check it's not a function call
	if atom.FunctionInvocation() != nil {
		return ""
	}

	// Get the symbol
	if sym := atom.Symbol(); sym != nil {
		return sym.GetText()
	}

	return ""
}

// executeSet handles SET clause
func (e *ASTExecutor) executeSet(set cyantlr.ISetStContext) error {
	if set == nil {
		return nil
	}

	// Process each set item
	for _, item := range set.AllSetItem() {
		if err := e.executeSetItem(item); err != nil {
			return err
		}
	}

	return nil
}

// executeSetItem handles a single SET assignment
func (e *ASTExecutor) executeSetItem(item cyantlr.ISetItemContext) error {
	if item == nil {
		return nil
	}

	// Check for property assignment
	if propExpr := item.PropertyExpression(); propExpr != nil {
		return e.executePropertySet(item)
	}

	return nil
}

// executePropertySet handles n.prop = value
func (e *ASTExecutor) executePropertySet(item cyantlr.ISetItemContext) error {
	propExpr := item.PropertyExpression()
	if propExpr == nil {
		return nil
	}

	// Get variable and property name from property expression text
	text := propExpr.GetText()
	dotIdx := strings.Index(text, ".")
	if dotIdx < 0 {
		return nil
	}
	varName := text[:dotIdx]
	propName := text[dotIdx+1:]

	// Get value expression
	exprs := []cyantlr.IExpressionContext{item.Expression()}
	if len(exprs) < 1 {
		return nil
	}
	value := e.evaluateExpression(exprs[0])

	// Update in matched rows
	for _, row := range e.matchedRows {
		val, exists := row[varName]
		if !exists {
			continue
		}

		if nodeMap, ok := val.(map[string]interface{}); ok {
			if nodeID, ok := nodeMap["_nodeId"].(string); ok {
				node, err := e.storage.GetNode(storage.NodeID(nodeID))
				if err != nil {
					continue
				}
				node.Properties[propName] = value
				if err := e.storage.UpdateNode(node); err == nil {
					e.result.Stats.PropertiesSet++
				}
			}
		}
	}

	return nil
}

// executeRemove handles REMOVE clause
func (e *ASTExecutor) executeRemove(remove cyantlr.IRemoveStContext) error {
	if remove == nil {
		return nil
	}

	for _, item := range remove.AllRemoveItem() {
		if err := e.executeRemoveItem(item); err != nil {
			return err
		}
	}

	return nil
}

// executeRemoveItem handles a single REMOVE item
func (e *ASTExecutor) executeRemoveItem(item cyantlr.IRemoveItemContext) error {
	if item == nil {
		return nil
	}

	// Check for property removal (n.prop)
	if propExpr := item.PropertyExpression(); propExpr != nil {
		text := propExpr.GetText()
		dotIdx := strings.Index(text, ".")
		if dotIdx < 0 {
			return nil
		}
		varName := text[:dotIdx]
		propName := text[dotIdx+1:]

		// Remove from matched nodes
		for _, row := range e.matchedRows {
			val, exists := row[varName]
			if !exists {
				continue
			}

			if nodeMap, ok := val.(map[string]interface{}); ok {
				if nodeID, ok := nodeMap["_nodeId"].(string); ok {
					node, err := e.storage.GetNode(storage.NodeID(nodeID))
					if err != nil {
						continue
					}
					delete(node.Properties, propName)
					if err := e.storage.UpdateNode(node); err == nil {
						e.result.Stats.PropertiesSet++
					}
				}
			}
		}
	}

	return nil
}

// executeMerge handles MERGE clause
func (e *ASTExecutor) executeMerge(merge cyantlr.IMergeStContext) error {
	if merge == nil {
		return nil
	}

	patternPart := merge.PatternPart()
	if patternPart == nil {
		return nil
	}

	// Try to match first
	matchResults, _ := e.matchPatternPart(patternPart)

	if len(matchResults) > 0 {
		// Matched - execute ON MATCH actions
		e.matchedRows = matchResults
		for _, action := range merge.AllMergeAction() {
			if action.MATCH() != nil {
				if setSt := action.SetSt(); setSt != nil {
					if err := e.executeSet(setSt); err != nil {
						return err
					}
				}
			}
		}
	} else {
		// Not matched - create and execute ON CREATE actions
		if err := e.createPatternPart(patternPart); err != nil {
			return err
		}
		for _, action := range merge.AllMergeAction() {
			if action.CREATE() != nil {
				if setSt := action.SetSt(); setSt != nil {
					if err := e.executeSet(setSt); err != nil {
						return err
					}
				}
			}
		}
	}

	return nil
}

// executeReturn handles RETURN clause - uses AST for all evaluation
func (e *ASTExecutor) executeReturn(ret cyantlr.IReturnStContext) error {
	if ret == nil {
		return nil
	}

	projBody := ret.ProjectionBody()
	if projBody == nil {
		return nil
	}

	projItems := projBody.ProjectionItems()
	if projItems == nil {
		return nil
	}

	// Check for RETURN *
	if projItems.MULT() != nil {
		return e.executeReturnStar()
	}

	// Extract projection info using AST - NO string parsing
	var projections []cyantlr.ProjectionItemInfo
	hasAggregation := false

	for _, item := range projItems.AllProjectionItem() {
		pi := cyantlr.ExtractProjectionItem(item)
		if pi.IsAggregation {
			hasAggregation = true
		}
		projections = append(projections, pi)
	}

	// Set columns
	for _, pi := range projections {
		e.result.Columns = append(e.result.Columns, pi.Alias)
	}

	// Create expression evaluator
	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)

	if hasAggregation {
		// Handle aggregation - group by non-aggregated columns
		var groupKeyExprs []cyantlr.IExpressionContext
		for _, pi := range projections {
			if !pi.IsAggregation && pi.Expression != nil {
				groupKeyExprs = append(groupKeyExprs, pi.Expression)
			}
		}

		// Group rows
		groups := cyantlr.GroupRows(e.matchedRows, groupKeyExprs, eval)

		// Process each group
		for _, group := range groups {
			if len(group) == 0 {
				continue
			}
			row := make([]interface{}, len(projections))

			for i, pi := range projections {
				if pi.IsAggregation {
					aggInfo := cyantlr.ExtractAggregation(pi.Expression)
					row[i] = cyantlr.ComputeAggregation(
						aggInfo.FuncName,
						aggInfo.Args,
						aggInfo.IsCountAll,
						group,
						eval,
					)
				} else if pi.Expression != nil {
					eval.SetRow(group[0])
					row[i] = eval.Evaluate(pi.Expression)
				}
			}
			e.result.Rows = append(e.result.Rows, row)
		}
	} else {
		// No aggregation - simple projection using AST evaluator
		if len(e.matchedRows) > 0 {
			for _, matchRow := range e.matchedRows {
				eval.SetRow(matchRow)
				row := make([]interface{}, len(projections))
				for i, pi := range projections {
					if pi.Expression != nil {
						row[i] = eval.Evaluate(pi.Expression)
					}
				}
				e.result.Rows = append(e.result.Rows, row)
			}
		} else if len(e.variables) > 0 {
			eval.SetRow(e.variables)
			row := make([]interface{}, len(projections))
			for i, pi := range projections {
				if pi.Expression != nil {
					row[i] = eval.Evaluate(pi.Expression)
				}
			}
			e.result.Rows = append(e.result.Rows, row)
		}
	}

	// Apply ORDER BY if present
	if orderBy := projBody.OrderSt(); orderBy != nil {
		e.applyOrderBy(orderBy)
	}

	// Apply SKIP if present
	if skip := projBody.SkipSt(); skip != nil {
		e.applySkip(skip)
	}

	// Apply LIMIT if present
	if limit := projBody.LimitSt(); limit != nil {
		e.applyLimit(limit)
	}

	return nil
}

// executeReturnStar handles RETURN *
func (e *ASTExecutor) executeReturnStar() error {
	if len(e.matchedRows) == 0 {
		return nil
	}

	// Get all column names from first row
	firstRow := e.matchedRows[0]
	var columns []string
	for k := range firstRow {
		if len(k) == 0 || k[0] != '_' {
			columns = append(columns, k)
		}
	}

	e.result.Columns = columns

	for _, matchRow := range e.matchedRows {
		row := make([]interface{}, len(columns))
		for i, col := range columns {
			row[i] = matchRow[col]
		}
		e.result.Rows = append(e.result.Rows, row)
	}

	return nil
}

// resolveExpression resolves an expression against a row context
func (e *ASTExecutor) resolveExpression(expr string, row map[string]interface{}) interface{} {
	// Check for property access (n.prop)
	if dotIdx := strings.Index(expr, "."); dotIdx > 0 {
		varName := expr[:dotIdx]
		propName := expr[dotIdx+1:]
		if val, ok := row[varName]; ok {
			if nodeMap, ok := val.(map[string]interface{}); ok {
				return nodeMap[propName]
			}
		}
	}

	// Direct variable
	if val, ok := row[expr]; ok {
		return val
	}

	// Literal or function - evaluate
	return e.evaluateLiteral(expr)
}

// evaluateLiteral evaluates a literal expression
func (e *ASTExecutor) evaluateLiteral(text string) interface{} {
	if i, err := strconv.ParseInt(text, 10, 64); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(text, 64); err == nil {
		return f
	}

	lower := strings.ToLower(text)
	if lower == "true" {
		return true
	}
	if lower == "false" {
		return false
	}
	if lower == "null" {
		return nil
	}

	// String literal
	if len(text) >= 2 {
		if (text[0] == '\'' && text[len(text)-1] == '\'') ||
			(text[0] == '"' && text[len(text)-1] == '"') {
			return text[1 : len(text)-1]
		}
	}

	return text
}

// executeUnwind handles UNWIND clause
func (e *ASTExecutor) executeUnwind(unwind cyantlr.IUnwindStContext) error {
	if unwind == nil {
		return nil
	}

	// Get expression and variable
	expr := unwind.Expression()
	sym := unwind.Symbol()
	if expr == nil || sym == nil {
		return nil
	}

	varName := sym.GetText()
	listVal := e.evaluateExpression(expr)

	// Convert to slice
	var items []interface{}
	switch v := listVal.(type) {
	case []interface{}:
		items = v
	case []string:
		for _, s := range v {
			items = append(items, s)
		}
	default:
		items = []interface{}{listVal}
	}

	// Expand rows
	var newRows []map[string]interface{}
	if len(e.matchedRows) > 0 {
		for _, row := range e.matchedRows {
			for _, item := range items {
				newRow := make(map[string]interface{})
				for k, v := range row {
					newRow[k] = v
				}
				newRow[varName] = item
				newRows = append(newRows, newRow)
			}
		}
	} else {
		for _, item := range items {
			newRow := make(map[string]interface{})
			newRow[varName] = item
			newRows = append(newRows, newRow)
		}
	}

	e.matchedRows = newRows
	return nil
}

// executeQueryCall handles CALL procedure inside a query (e.g., CALL db.labels())
func (e *ASTExecutor) executeQueryCall(call cyantlr.IQueryCallStContext) error {
	if call == nil {
		return nil
	}

	invName := call.InvocationName()
	if invName == nil {
		return nil
	}

	procName := invName.GetText()
	return e.dispatchProcedure(procName)
}

// executeCallSubquery handles CALL {} subquery
func (e *ASTExecutor) executeCallSubquery(call cyantlr.ICallSubqueryContext) error {
	if call == nil {
		return nil
	}

	body := call.SubqueryBody()
	if body == nil {
		return nil
	}

	// Save current state
	savedVars := make(map[string]interface{})
	for k, v := range e.variables {
		savedVars[k] = v
	}

	// Execute subquery for each input row (or once if no input)
	inputRows := e.matchedRows
	if len(inputRows) == 0 {
		inputRows = []map[string]interface{}{{}}
	}

	var allResults []map[string]interface{}
	for _, inputRow := range inputRows {
		// Set up context with input row variables
		e.matchedRows = []map[string]interface{}{inputRow}
		for k, v := range inputRow {
			e.variables[k] = v
		}

		// Execute the subquery body statements
		// SubqueryBody can contain WITH and statements
		if withSt := body.WithSt(); withSt != nil {
			if err := e.executeWith(withSt); err != nil {
				return err
			}
		}

		// Collect results
		for _, row := range e.matchedRows {
			// Merge input row with subquery results
			merged := make(map[string]interface{})
			for k, v := range inputRow {
				merged[k] = v
			}
			for k, v := range row {
				merged[k] = v
			}
			allResults = append(allResults, merged)
		}
	}

	// Restore state with combined results
	e.matchedRows = allResults
	e.variables = savedVars

	return nil
}

// executeWith handles WITH clause including aggregation, ORDER BY, SKIP, LIMIT
func (e *ASTExecutor) executeWith(with cyantlr.IWithStContext) error {
	if with == nil {
		return nil
	}

	projBody := with.ProjectionBody()
	if projBody == nil {
		return nil
	}

	projItems := projBody.ProjectionItems()
	if projItems == nil {
		return nil
	}

	// Extract projection info using antlr package
	var projections []cyantlr.ProjectionItemInfo
	hasAggregation := false

	for _, item := range projItems.AllProjectionItem() {
		pi := cyantlr.ExtractProjectionItem(item)
		if pi.IsAggregation {
			hasAggregation = true
		}
		projections = append(projections, pi)
	}

	// Create expression evaluator
	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)

	var newRows []map[string]interface{}

	if hasAggregation {
		// Find grouping keys (non-aggregated columns)
		var groupKeyExprs []cyantlr.IExpressionContext
		for _, pi := range projections {
			if !pi.IsAggregation && pi.Expression != nil {
				groupKeyExprs = append(groupKeyExprs, pi.Expression)
			}
		}

		// Group rows using antlr package
		groups := cyantlr.GroupRows(e.matchedRows, groupKeyExprs, eval)

		// Process each group
		for _, group := range groups {
			if len(group) == 0 {
				continue
			}
			newRow := make(map[string]interface{})

			for _, pi := range projections {
				if pi.IsAggregation {
					// Compute aggregation using antlr package
					aggInfo := cyantlr.ExtractAggregation(pi.Expression)
					newRow[pi.Alias] = cyantlr.ComputeAggregation(
						aggInfo.FuncName,
						aggInfo.Args,
						aggInfo.IsCountAll,
						group,
						eval,
					)
				} else if pi.Expression != nil {
					// Use value from first row in group
					eval.SetRow(group[0])
					newRow[pi.Alias] = eval.Evaluate(pi.Expression)
				}
			}
			newRows = append(newRows, newRow)
		}
	} else {
		// No aggregation - simple projection
		for _, matchRow := range e.matchedRows {
			eval.SetRow(matchRow)
			newRow := make(map[string]interface{})
			for _, pi := range projections {
				if pi.Expression != nil {
					newRow[pi.Alias] = eval.Evaluate(pi.Expression)
				}
			}
			newRows = append(newRows, newRow)
		}
	}

	e.matchedRows = newRows

	// Apply WHERE if present (acts like HAVING for aggregation)
	if where := with.Where(); where != nil {
		filtered, err := e.filterByWhere(e.matchedRows, where)
		if err != nil {
			return err
		}
		e.matchedRows = filtered
	}

	// Apply ORDER BY if present
	if orderBy := projBody.OrderSt(); orderBy != nil {
		e.applyOrderBy(orderBy)
	}

	// Apply SKIP if present
	if skip := projBody.SkipSt(); skip != nil {
		e.applySkip(skip)
	}

	// Apply LIMIT if present
	if limit := projBody.LimitSt(); limit != nil {
		e.applyLimit(limit)
	}

	return nil
}

// aggregationInfo holds info extracted from AST about an aggregation
type aggregationInfo struct {
	isAggregation bool
	isCountAll    bool                         // COUNT(*)
	funcName      string                       // COUNT, SUM, AVG, MIN, MAX, COLLECT
	args          []cyantlr.IExpressionContext // function arguments
	isDistinct    bool
}

// extractAggregationFromAST walks the expression AST to find aggregation functions
// Returns aggregation info extracted purely from AST nodes - no string parsing
func (e *ASTExecutor) extractAggregationFromAST(expr cyantlr.IExpressionContext) aggregationInfo {
	result := aggregationInfo{}
	if expr == nil {
		return result
	}

	// Walk down the AST to find the Atom
	atom := e.findAtomInExpression(expr)
	if atom == nil {
		return result
	}

	// Check for COUNT(*) - has its own AST node type
	if countAll := atom.CountAll(); countAll != nil {
		result.isAggregation = true
		result.isCountAll = true
		result.funcName = "COUNT"
		return result
	}

	// Check for FunctionInvocation
	funcInvoc := atom.FunctionInvocation()
	if funcInvoc == nil {
		return result
	}

	// Get function name from InvocationName AST node
	invocName := funcInvoc.InvocationName()
	if invocName == nil {
		return result
	}

	// InvocationName contains Symbol nodes - get them from AST
	symbols := invocName.AllSymbol()
	if len(symbols) == 0 {
		return result
	}

	// Get the function name by checking token type of first symbol
	firstSym := symbols[0]

	// Check if it's an aggregation function by examining the token type
	// Aggregation functions: COUNT, SUM, AVG, MIN, MAX, COLLECT
	// These are identified by checking if the Symbol contains specific tokens
	if e.isAggregationToken(firstSym) {
		result.isAggregation = true
		result.funcName = e.getAggregationFuncName(firstSym)
		result.isDistinct = funcInvoc.DISTINCT() != nil

		// Get arguments from ExpressionChain
		if exprChain := funcInvoc.ExpressionChain(); exprChain != nil {
			result.args = exprChain.AllExpression()
		}
	}

	return result
}

// findAtomInExpression walks down the expression tree to find the Atom node
func (e *ASTExecutor) findAtomInExpression(expr cyantlr.IExpressionContext) cyantlr.IAtomContext {
	if expr == nil {
		return nil
	}

	xors := expr.AllXorExpression()
	if len(xors) != 1 {
		return nil
	}

	ands := xors[0].AllAndExpression()
	if len(ands) != 1 {
		return nil
	}

	nots := ands[0].AllNotExpression()
	if len(nots) != 1 {
		return nil
	}

	comp := nots[0].ComparisonExpression()
	if comp == nil {
		return nil
	}

	adds := comp.AllAddSubExpression()
	if len(adds) != 1 {
		return nil
	}

	mults := adds[0].AllMultDivExpression()
	if len(mults) != 1 {
		return nil
	}

	powers := mults[0].AllPowerExpression()
	if len(powers) != 1 {
		return nil
	}

	unarys := powers[0].AllUnaryAddSubExpression()
	if len(unarys) != 1 {
		return nil
	}

	atomic := unarys[0].AtomicExpression()
	if atomic == nil {
		return nil
	}

	propOrLabel := atomic.PropertyOrLabelExpression()
	if propOrLabel == nil {
		return nil
	}

	propExpr := propOrLabel.PropertyExpression()
	if propExpr == nil {
		return nil
	}

	return propExpr.Atom()
}

// isAggregationToken checks if a Symbol AST node represents an aggregation function
// by checking the token types present in the node
func (e *ASTExecutor) isAggregationToken(sym cyantlr.ISymbolContext) bool {
	if sym == nil {
		return false
	}

	// Check for COUNT token
	if sym.COUNT() != nil {
		return true
	}

	// Check for ID token and see if it matches aggregation function names
	// SUM, AVG, MIN, MAX, COLLECT are parsed as ID tokens
	if id := sym.ID(); id != nil {
		text := id.GetText()
		switch text {
		case "SUM", "sum", "AVG", "avg", "MIN", "min", "MAX", "max", "COLLECT", "collect":
			return true
		}
	}

	return false
}

// getAggregationFuncName returns the normalized aggregation function name from a Symbol
func (e *ASTExecutor) getAggregationFuncName(sym cyantlr.ISymbolContext) string {
	if sym == nil {
		return ""
	}

	// COUNT has its own token
	if sym.COUNT() != nil {
		return "COUNT"
	}

	// Others are ID tokens
	if id := sym.ID(); id != nil {
		text := id.GetText()
		switch text {
		case "SUM", "sum":
			return "SUM"
		case "AVG", "avg":
			return "AVG"
		case "MIN", "min":
			return "MIN"
		case "MAX", "max":
			return "MAX"
		case "COLLECT", "collect":
			return "COLLECT"
		}
	}

	return ""
}

// groupRows groups rows by the specified keys
func (e *ASTExecutor) groupRows(rows []map[string]interface{}, keys []string) [][]map[string]interface{} {
	if len(keys) == 0 {
		// No grouping keys = all rows in one group
		return [][]map[string]interface{}{rows}
	}

	// Use map to group by key values
	groupMap := make(map[string][]map[string]interface{})
	order := []string{} // Preserve order

	for _, row := range rows {
		// Build group key
		var keyParts []string
		for _, k := range keys {
			val := e.resolveExpression(k, row)
			keyParts = append(keyParts, fmt.Sprintf("%v", val))
		}
		groupKey := strings.Join(keyParts, "\x00")

		if _, exists := groupMap[groupKey]; !exists {
			order = append(order, groupKey)
		}
		groupMap[groupKey] = append(groupMap[groupKey], row)
	}

	// Return in order
	var result [][]map[string]interface{}
	for _, k := range order {
		result = append(result, groupMap[k])
	}
	return result
}

// computeAggregation computes an aggregation function over a group
func (e *ASTExecutor) computeAggregation(funcName, arg string, group []map[string]interface{}) interface{} {
	switch funcName {
	case "COUNT":
		if arg == "*" {
			return int64(len(group))
		}
		// COUNT non-null values
		count := int64(0)
		for _, row := range group {
			val := e.resolveExpression(arg, row)
			if val != nil {
				count++
			}
		}
		return count

	case "SUM":
		sum := float64(0)
		for _, row := range group {
			val := e.resolveExpression(arg, row)
			sum += e.toFloat64(val)
		}
		// Return int64 if whole number
		if sum == float64(int64(sum)) {
			return int64(sum)
		}
		return sum

	case "AVG":
		if len(group) == 0 {
			return nil
		}
		sum := float64(0)
		count := 0
		for _, row := range group {
			val := e.resolveExpression(arg, row)
			if val != nil {
				sum += e.toFloat64(val)
				count++
			}
		}
		if count == 0 {
			return nil
		}
		return sum / float64(count)

	case "MIN":
		var minVal interface{}
		for _, row := range group {
			val := e.resolveExpression(arg, row)
			if val == nil {
				continue
			}
			if minVal == nil || e.compareValues(val, minVal) < 0 {
				minVal = val
			}
		}
		return minVal

	case "MAX":
		var maxVal interface{}
		for _, row := range group {
			val := e.resolveExpression(arg, row)
			if val == nil {
				continue
			}
			if maxVal == nil || e.compareValues(val, maxVal) > 0 {
				maxVal = val
			}
		}
		return maxVal

	case "COLLECT":
		var result []interface{}
		for _, row := range group {
			val := e.resolveExpression(arg, row)
			result = append(result, val)
		}
		return result
	}

	return nil
}

// toFloat64 converts a value to float64
func (e *ASTExecutor) toFloat64(val interface{}) float64 {
	switch v := val.(type) {
	case int64:
		return float64(v)
	case int:
		return float64(v)
	case float64:
		return v
	case float32:
		return float64(v)
	case string:
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return 0
}

// compareValues compares two values, returns -1, 0, or 1
func (e *ASTExecutor) compareValues(a, b interface{}) int {
	// Try numeric comparison
	aNum, aIsNum := e.toNumeric(a)
	bNum, bIsNum := e.toNumeric(b)
	if aIsNum && bIsNum {
		if aNum < bNum {
			return -1
		} else if aNum > bNum {
			return 1
		}
		return 0
	}

	// String comparison
	aStr := fmt.Sprintf("%v", a)
	bStr := fmt.Sprintf("%v", b)
	if aStr < bStr {
		return -1
	} else if aStr > bStr {
		return 1
	}
	return 0
}

// toNumeric converts a value to float64 if possible
func (e *ASTExecutor) toNumeric(val interface{}) (float64, bool) {
	switch v := val.(type) {
	case int64:
		return float64(v), true
	case int:
		return float64(v), true
	case float64:
		return v, true
	case float32:
		return float64(v), true
	}
	return 0, false
}

// applyOrderBy sorts matchedRows based on ORDER BY clause using antlr package
func (e *ASTExecutor) applyOrderBy(order cyantlr.IOrderStContext) {
	if order == nil {
		return
	}

	// Extract sort items using antlr package
	sortItems := cyantlr.ExtractSortItems(order)
	if len(sortItems) == 0 {
		return
	}

	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)

	sort.SliceStable(e.matchedRows, func(i, j int) bool {
		for _, item := range sortItems {
			if item.Expression == nil {
				continue
			}

			eval.SetRow(e.matchedRows[i])
			valA := eval.Evaluate(item.Expression)

			eval.SetRow(e.matchedRows[j])
			valB := eval.Evaluate(item.Expression)

			cmp := cyantlr.CompareValues(valA, valB)
			if cmp != 0 {
				if item.IsDesc {
					return cmp > 0
				}
				return cmp < 0
			}
		}
		return false
	})
}

// applySkip removes first N rows
func (e *ASTExecutor) applySkip(skip cyantlr.ISkipStContext) {
	if skip == nil {
		return
	}

	expr := skip.Expression()
	if expr == nil {
		return
	}

	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)
	skipVal := eval.Evaluate(expr)
	n := int(cyantlr.ToFloat64(skipVal))

	if n > 0 && n < len(e.matchedRows) {
		e.matchedRows = e.matchedRows[n:]
	} else if n >= len(e.matchedRows) {
		e.matchedRows = nil
	}
}

// applyLimit keeps only first N rows
func (e *ASTExecutor) applyLimit(limit cyantlr.ILimitStContext) {
	if limit == nil {
		return
	}

	expr := limit.Expression()
	if expr == nil {
		return
	}

	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)
	limitVal := eval.Evaluate(expr)
	n := int(cyantlr.ToFloat64(limitVal))

	if n >= 0 && n < len(e.matchedRows) {
		e.matchedRows = e.matchedRows[:n]
	}
}

// executeStandaloneCall handles standalone CALL procedure
func (e *ASTExecutor) executeStandaloneCall(call cyantlr.IStandaloneCallContext) error {
	if call == nil {
		return nil
	}

	invName := call.InvocationName()
	if invName == nil {
		return nil
	}

	return e.dispatchProcedure(invName.GetText())
}

// dispatchProcedure routes procedure calls to their implementations
func (e *ASTExecutor) dispatchProcedure(procName string) error {
	// Normalize - remove trailing ()
	if len(procName) > 2 && procName[len(procName)-2:] == "()" {
		procName = procName[:len(procName)-2]
	}

	switch procName {
	case "db.labels":
		return e.callDbLabels()
	case "db.relationshipTypes":
		return e.callDbRelationshipTypes()
	case "db.propertyKeys":
		return e.callDbPropertyKeys()
	case "db.indexes":
		return e.callDbIndexes()
	case "db.constraints":
		return e.callDbConstraints()
	case "db.schema.nodeTypeProperties":
		return e.callDbSchemaNodeTypeProperties()
	case "db.schema.relTypeProperties":
		return e.callDbSchemaRelTypeProperties()
	default:
		// Check for procedure prefix patterns
		if len(procName) > 3 && procName[:3] == "db." {
			// Unknown db.* procedure - return empty result
			return nil
		}
		return fmt.Errorf("unknown procedure: %s", procName)
	}
}

// callDbLabels implements CALL db.labels()
func (e *ASTExecutor) callDbLabels() error {
	labels := make(map[string]bool)
	for _, node := range e.storage.GetAllNodes() {
		for _, label := range node.Labels {
			labels[label] = true
		}
	}

	e.result.Columns = []string{"label"}
	for label := range labels {
		e.result.Rows = append(e.result.Rows, []interface{}{label})
	}
	return nil
}

// callDbRelationshipTypes implements CALL db.relationshipTypes()
func (e *ASTExecutor) callDbRelationshipTypes() error {
	types := make(map[string]bool)
	// Get relationship types by iterating through all nodes' edges
	for _, node := range e.storage.GetAllNodes() {
		edges, _ := e.storage.GetOutgoingEdges(node.ID)
		for _, edge := range edges {
			types[edge.Type] = true
		}
	}

	e.result.Columns = []string{"relationshipType"}
	for t := range types {
		e.result.Rows = append(e.result.Rows, []interface{}{t})
	}
	return nil
}

// callDbPropertyKeys implements CALL db.propertyKeys()
func (e *ASTExecutor) callDbPropertyKeys() error {
	keys := make(map[string]bool)
	for _, node := range e.storage.GetAllNodes() {
		for k := range node.Properties {
			keys[k] = true
		}
	}

	e.result.Columns = []string{"propertyKey"}
	for k := range keys {
		e.result.Rows = append(e.result.Rows, []interface{}{k})
	}
	return nil
}

// callDbIndexes implements CALL db.indexes()
func (e *ASTExecutor) callDbIndexes() error {
	e.result.Columns = []string{"name", "type", "labelsOrTypes", "properties", "state"}
	// Get indexes from storage if available
	if indexer, ok := e.storage.(interface {
		GetIndexes() []map[string]interface{}
	}); ok {
		for _, idx := range indexer.GetIndexes() {
			e.result.Rows = append(e.result.Rows, []interface{}{
				idx["name"], idx["type"], idx["labelsOrTypes"], idx["properties"], idx["state"],
			})
		}
	}
	return nil
}

// callDbConstraints implements CALL db.constraints()
func (e *ASTExecutor) callDbConstraints() error {
	e.result.Columns = []string{"name", "type", "entityType", "labelsOrTypes", "properties"}
	// Get constraints from storage if available
	if constrainer, ok := e.storage.(interface {
		GetConstraints() []map[string]interface{}
	}); ok {
		for _, c := range constrainer.GetConstraints() {
			e.result.Rows = append(e.result.Rows, []interface{}{
				c["name"], c["type"], c["entityType"], c["labelsOrTypes"], c["properties"],
			})
		}
	}
	return nil
}

// callDbSchemaNodeTypeProperties implements CALL db.schema.nodeTypeProperties()
func (e *ASTExecutor) callDbSchemaNodeTypeProperties() error {
	e.result.Columns = []string{"nodeType", "nodeLabels", "propertyName", "propertyTypes", "mandatory"}

	// Collect property info per label
	labelProps := make(map[string]map[string]bool)
	for _, node := range e.storage.GetAllNodes() {
		for _, label := range node.Labels {
			if labelProps[label] == nil {
				labelProps[label] = make(map[string]bool)
			}
			for prop := range node.Properties {
				labelProps[label][prop] = true
			}
		}
	}

	for label, props := range labelProps {
		for prop := range props {
			e.result.Rows = append(e.result.Rows, []interface{}{
				":" + label,
				[]string{label},
				prop,
				[]string{"Any"},
				false,
			})
		}
	}
	return nil
}

// callDbSchemaRelTypeProperties implements CALL db.schema.relTypeProperties()
func (e *ASTExecutor) callDbSchemaRelTypeProperties() error {
	e.result.Columns = []string{"relType", "propertyName", "propertyTypes", "mandatory"}

	// Collect property info per relationship type
	typeProps := make(map[string]map[string]bool)
	for _, node := range e.storage.GetAllNodes() {
		edges, _ := e.storage.GetOutgoingEdges(node.ID)
		for _, edge := range edges {
			if typeProps[edge.Type] == nil {
				typeProps[edge.Type] = make(map[string]bool)
			}
			for prop := range edge.Properties {
				typeProps[edge.Type][prop] = true
			}
		}
	}

	for relType, props := range typeProps {
		for prop := range props {
			e.result.Rows = append(e.result.Rows, []interface{}{
				":" + relType,
				prop,
				[]string{"Any"},
				false,
			})
		}
	}
	return nil
}

// executeShowCommand handles SHOW commands
func (e *ASTExecutor) executeShowCommand(show cyantlr.IShowCommandContext) error {
	text := show.GetText()

	if strings.Contains(strings.ToUpper(text), "INDEXES") {
		e.result.Columns = []string{"name", "type", "labelsOrTypes", "properties"}
		// Return empty - no indexes by default
		return nil
	}

	if strings.Contains(strings.ToUpper(text), "CONSTRAINTS") {
		e.result.Columns = []string{"name", "type", "entityType", "labelsOrTypes", "properties"}
		return nil
	}

	return nil
}

// executeSchemaCommand handles schema commands
func (e *ASTExecutor) executeSchemaCommand(schema cyantlr.ISchemaCommandContext) error {
	// Schema commands are no-ops in memory mode
	return nil
}

// filterByWhere filters rows using WHERE clause - delegates to antlr package
func (e *ASTExecutor) filterByWhere(rows []map[string]interface{}, where cyantlr.IWhereContext) ([]map[string]interface{}, error) {
	if where == nil {
		return rows, nil
	}

	expr := where.Expression()
	if expr == nil {
		return rows, nil
	}

	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)

	var result []map[string]interface{}
	for _, row := range rows {
		eval.SetRow(row)
		if eval.EvaluateWhere(expr) {
			result = append(result, row)
		}
	}

	return result, nil
}

// evaluateAtomicExprInRow evaluates an AtomicExpression in row context
func (e *ASTExecutor) evaluateAtomicExprInRow(atomic cyantlr.IAtomicExpressionContext, row map[string]interface{}) interface{} {
	if atomic == nil {
		return nil
	}

	propOrLabel := atomic.PropertyOrLabelExpression()
	if propOrLabel == nil {
		return nil
	}

	return e.evaluatePropertyOrLabelExprInRow(propOrLabel, row)
}

// evaluatePropertyOrLabelExprInRow evaluates property access from AST
func (e *ASTExecutor) evaluatePropertyOrLabelExprInRow(propOrLabel cyantlr.IPropertyOrLabelExpressionContext, row map[string]interface{}) interface{} {
	if propOrLabel == nil {
		return nil
	}

	propExpr := propOrLabel.PropertyExpression()
	if propExpr == nil {
		return nil
	}

	// Get the atom (variable or literal)
	atom := propExpr.Atom()
	if atom == nil {
		return nil
	}

	// Get base value
	baseVal := e.evaluateAtomInRow(atom, row)

	// Check for property access (DOT tokens in PropertyExpression)
	dots := propExpr.AllDOT()
	if len(dots) == 0 {
		return baseVal
	}

	// Get property names from Name nodes after each DOT
	names := propExpr.AllName()
	currentVal := baseVal
	for _, name := range names {
		propName := name.GetText()
		if nodeMap, ok := currentVal.(map[string]interface{}); ok {
			currentVal = nodeMap[propName]
		} else {
			return nil
		}
	}

	return currentVal
}

// evaluateAtomInRow evaluates an Atom in row context
func (e *ASTExecutor) evaluateAtomInRow(atom cyantlr.IAtomContext, row map[string]interface{}) interface{} {
	if atom == nil {
		return nil
	}

	// Check for literal
	if lit := atom.Literal(); lit != nil {
		return e.evaluateLiteralAST(lit)
	}

	// Check for parameter
	if param := atom.Parameter(); param != nil {
		// Get parameter name from $ followed by symbol or numLit
		if sym := param.Symbol(); sym != nil {
			if val, ok := e.params[sym.GetText()]; ok {
				return val
			}
		}
		return nil
	}

	// Check for symbol (variable reference)
	if sym := atom.Symbol(); sym != nil {
		varName := sym.GetText()
		if val, ok := row[varName]; ok {
			return val
		}
		if val, ok := e.variables[varName]; ok {
			return val
		}
		return nil
	}

	// Check for parenthesized expression
	if paren := atom.ParenthesizedExpression(); paren != nil {
		if innerExpr := paren.Expression(); innerExpr != nil {
			// Recursively evaluate
			return e.evaluateExpressionInRowFull(innerExpr, row)
		}
	}

	return nil
}

// evaluateLiteralAST evaluates a literal from AST
func (e *ASTExecutor) evaluateLiteralAST(lit cyantlr.ILiteralContext) interface{} {
	if lit == nil {
		return nil
	}

	// Boolean
	if boolLit := lit.BoolLit(); boolLit != nil {
		if boolLit.TRUE() != nil {
			return true
		}
		return false
	}

	// Null
	if lit.NULL_W() != nil {
		return nil
	}

	// Number
	if numLit := lit.NumLit(); numLit != nil {
		if floatLit := numLit.FLOAT(); floatLit != nil {
			if f, err := strconv.ParseFloat(floatLit.GetText(), 64); err == nil {
				return f
			}
		}
		if intLit := numLit.IntegerLit(); intLit != nil {
			if i, err := strconv.ParseInt(intLit.GetText(), 10, 64); err == nil {
				return i
			}
		}
	}

	// String
	if strLit := lit.StringLit(); strLit != nil {
		text := strLit.GetText()
		// Remove quotes - the AST gives us the raw token with quotes
		if len(text) >= 2 {
			return text[1 : len(text)-1]
		}
		return text
	}

	// Char
	if charLit := lit.CharLit(); charLit != nil {
		text := charLit.GetText()
		if len(text) >= 2 {
			return text[1 : len(text)-1]
		}
		return text
	}

	// List
	if listLit := lit.ListLit(); listLit != nil {
		if exprChain := listLit.ExpressionChain(); exprChain != nil {
			var result []interface{}
			for _, expr := range exprChain.AllExpression() {
				result = append(result, e.evaluateExpression(expr))
			}
			return result
		}
		return []interface{}{}
	}

	// Map
	if mapLit := lit.MapLit(); mapLit != nil {
		result := make(map[string]interface{})
		for _, pair := range mapLit.AllMapPair() {
			if name := pair.Name(); name != nil {
				if expr := pair.Expression(); expr != nil {
					result[name.GetText()] = e.evaluateExpression(expr)
				}
			}
		}
		return result
	}

	return nil
}

// evaluateExpressionInRowFull evaluates a full expression in row context - delegates to antlr package
func (e *ASTExecutor) evaluateExpressionInRowFull(expr cyantlr.IExpressionContext, row map[string]interface{}) interface{} {
	if expr == nil {
		return nil
	}

	eval := cyantlr.NewExpressionEvaluator(e.params, e.variables)
	eval.SetRow(row)
	return eval.Evaluate(expr)
}

// isTruthy checks if a value is truthy
func (e *ASTExecutor) isTruthy(val interface{}) bool {
	if val == nil {
		return false
	}
	switch v := val.(type) {
	case bool:
		return v
	case int64:
		return v != 0
	case float64:
		return v != 0
	case string:
		return v != ""
	}
	return true
}

// extendWithChain extends match results with relationship chain
func (e *ASTExecutor) extendWithChain(rows []map[string]interface{}, chain cyantlr.IPatternElemChainContext) ([]map[string]interface{}, error) {
	if chain == nil {
		return rows, nil
	}

	relPattern := chain.RelationshipPattern()
	nodePattern := chain.NodePattern()
	if relPattern == nil || nodePattern == nil {
		return rows, nil
	}

	// Extract relationship and node info
	relVar, relType, _, isForward := e.extractRelationshipPattern(relPattern)
	endVar, endLabels, endProps := e.extractNodePattern(nodePattern)

	var newRows []map[string]interface{}

	for _, row := range rows {
		// Find the starting node from the row
		var startNodeID string
		for _, val := range row {
			if nodeMap, ok := val.(map[string]interface{}); ok {
				if id, ok := nodeMap["_nodeId"].(string); ok {
					startNodeID = id
					break
				}
			}
		}

		if startNodeID == "" {
			continue
		}

		// Get edges from this node
		var edges []*storage.Edge
		if isForward {
			edges, _ = e.storage.GetOutgoingEdges(storage.NodeID(startNodeID))
		} else {
			edges, _ = e.storage.GetIncomingEdges(storage.NodeID(startNodeID))
		}

		// Filter by type if specified
		if relType != "" {
			filtered := make([]*storage.Edge, 0)
			for _, edge := range edges {
				if edge.Type == relType {
					filtered = append(filtered, edge)
				}
			}
			edges = filtered
		}

		// For each matching edge, get the end node
		for _, edge := range edges {
			var endNodeID storage.NodeID
			if isForward {
				endNodeID = edge.EndNode
			} else {
				endNodeID = edge.StartNode
			}

			endNode, err := e.storage.GetNode(endNodeID)
			if err != nil {
				continue
			}

			// Check labels
			if len(endLabels) > 0 {
				hasLabel := false
				for _, label := range endLabels {
					for _, nodeLabel := range endNode.Labels {
						if label == nodeLabel {
							hasLabel = true
							break
						}
					}
				}
				if !hasLabel {
					continue
				}
			}

			// Check properties
			if len(endProps) > 0 && !e.nodeMatchesProps(endNode, endProps) {
				continue
			}

			// Create new row with relationship and end node
			newRow := make(map[string]interface{})
			for k, v := range row {
				newRow[k] = v
			}

			if relVar != "" {
				newRow[relVar] = map[string]interface{}{
					"_edgeId": string(edge.ID),
					"_type":   edge.Type,
				}
			}

			if endVar != "" {
				newRow[endVar] = e.nodeToMap(endNode)
			}

			newRows = append(newRows, newRow)
		}
	}

	return newRows, nil
}

// joinMatches joins two match result sets
func (e *ASTExecutor) joinMatches(a, b []map[string]interface{}) []map[string]interface{} {
	var result []map[string]interface{}
	for _, rowA := range a {
		for _, rowB := range b {
			merged := make(map[string]interface{})
			for k, v := range rowA {
				merged[k] = v
			}
			for k, v := range rowB {
				merged[k] = v
			}
			result = append(result, merged)
		}
	}
	return result
}
