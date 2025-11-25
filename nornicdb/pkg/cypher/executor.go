// Package cypher provides Cypher query execution for NornicDB.
package cypher

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/orneryd/nornicdb/pkg/storage"
)

// StorageExecutor executes Cypher queries against storage.
type StorageExecutor struct {
	parser  *Parser
	storage *storage.MemoryEngine
}

// NewStorageExecutor creates a new executor with storage backend.
func NewStorageExecutor(store *storage.MemoryEngine) *StorageExecutor {
	return &StorageExecutor{
		parser:  NewParser(),
		storage: store,
	}
}

// ExecuteResult holds execution results in Neo4j-compatible format.
type ExecuteResult struct {
	Columns []string
	Rows    [][]interface{}
	Stats   *QueryStats
}

// QueryStats holds query execution statistics.
type QueryStats struct {
	NodesCreated         int `json:"nodes_created"`
	NodesDeleted         int `json:"nodes_deleted"`
	RelationshipsCreated int `json:"relationships_created"`
	RelationshipsDeleted int `json:"relationships_deleted"`
	PropertiesSet        int `json:"properties_set"`
}

// Execute parses and executes a Cypher query.
func (e *StorageExecutor) Execute(ctx context.Context, cypher string, params map[string]interface{}) (*ExecuteResult, error) {
	// Normalize query
	cypher = strings.TrimSpace(cypher)
	if cypher == "" {
		return nil, fmt.Errorf("empty query")
	}

	// Validate basic syntax
	if err := e.validateSyntax(cypher); err != nil {
		return nil, err
	}

	// Substitute parameters
	cypher = e.substituteParams(cypher, params)

	// Route to appropriate handler based on query type
	upperQuery := strings.ToUpper(cypher)

	// Check for compound queries - MATCH ... DELETE, MATCH ... SET, etc.
	// These need special handling
	if strings.Contains(upperQuery, " DELETE ") || strings.HasSuffix(upperQuery, " DELETE") ||
		strings.Contains(upperQuery, "DETACH DELETE") {
		return e.executeDelete(ctx, cypher)
	}
	if strings.Contains(upperQuery, " SET ") {
		return e.executeSet(ctx, cypher)
	}

	switch {
	case strings.HasPrefix(upperQuery, "MATCH"):
		return e.executeMatch(ctx, cypher)
	case strings.HasPrefix(upperQuery, "CREATE"):
		return e.executeCreate(ctx, cypher)
	case strings.HasPrefix(upperQuery, "MERGE"):
		return e.executeMerge(ctx, cypher)
	case strings.HasPrefix(upperQuery, "DELETE"), strings.HasPrefix(upperQuery, "DETACH DELETE"):
		return e.executeDelete(ctx, cypher)
	case strings.HasPrefix(upperQuery, "CALL"):
		return e.executeCall(ctx, cypher)
	default:
		return nil, fmt.Errorf("unsupported query type: %s", strings.Split(upperQuery, " ")[0])
	}
}

// validateSyntax performs basic syntax validation.
func (e *StorageExecutor) validateSyntax(cypher string) error {
	upper := strings.ToUpper(cypher)

	// Check for valid starting keyword
	validStarts := []string{"MATCH", "CREATE", "MERGE", "DELETE", "DETACH", "CALL", "RETURN", "WITH", "UNWIND", "OPTIONAL"}
	hasValidStart := false
	for _, start := range validStarts {
		if strings.HasPrefix(upper, start) {
			hasValidStart = true
			break
		}
	}
	if !hasValidStart {
		return fmt.Errorf("syntax error: query must start with a valid clause (MATCH, CREATE, MERGE, DELETE, CALL, etc.)")
	}

	// Check balanced parentheses
	parenCount := 0
	bracketCount := 0
	braceCount := 0
	inString := false
	stringChar := byte(0)

	for i := 0; i < len(cypher); i++ {
		c := cypher[i]

		if inString {
			if c == stringChar && (i == 0 || cypher[i-1] != '\\') {
				inString = false
			}
			continue
		}

		switch c {
		case '"', '\'':
			inString = true
			stringChar = c
		case '(':
			parenCount++
		case ')':
			parenCount--
		case '[':
			bracketCount++
		case ']':
			bracketCount--
		case '{':
			braceCount++
		case '}':
			braceCount--
		}

		if parenCount < 0 || bracketCount < 0 || braceCount < 0 {
			return fmt.Errorf("syntax error: unbalanced brackets at position %d", i)
		}
	}

	if parenCount != 0 {
		return fmt.Errorf("syntax error: unbalanced parentheses")
	}
	if bracketCount != 0 {
		return fmt.Errorf("syntax error: unbalanced square brackets")
	}
	if braceCount != 0 {
		return fmt.Errorf("syntax error: unbalanced curly braces")
	}
	if inString {
		return fmt.Errorf("syntax error: unclosed quote")
	}

	return nil
}

// substituteParams replaces $param with actual values.
func (e *StorageExecutor) substituteParams(cypher string, params map[string]interface{}) string {
	if params == nil {
		return cypher
	}

	result := cypher
	for k, v := range params {
		placeholder := "$" + k
		var replacement string
		switch val := v.(type) {
		case string:
			replacement = fmt.Sprintf("'%s'", strings.ReplaceAll(val, "'", "\\'"))
		case int, int64, float64:
			replacement = fmt.Sprintf("%v", val)
		case bool:
			replacement = fmt.Sprintf("%v", val)
		case nil:
			replacement = "null"
		default:
			replacement = fmt.Sprintf("'%v'", val)
		}
		result = strings.ReplaceAll(result, placeholder, replacement)
	}
	return result
}

// executeMatch handles MATCH queries.
func (e *StorageExecutor) executeMatch(ctx context.Context, cypher string) (*ExecuteResult, error) {
	result := &ExecuteResult{
		Columns: []string{},
		Rows:    [][]interface{}{},
		Stats:   &QueryStats{},
	}

	upper := strings.ToUpper(cypher)

	// Extract return variables
	returnIdx := strings.Index(upper, "RETURN")
	if returnIdx == -1 {
		// No RETURN clause - just match and return count
		result.Columns = []string{"matched"}
		result.Rows = [][]interface{}{{true}}
		return result, nil
	}

	// Parse RETURN part (everything after RETURN, before ORDER BY/SKIP/LIMIT)
	returnPart := cypher[returnIdx+6:]

	// Find end of RETURN clause
	returnEndIdx := len(returnPart)
	for _, keyword := range []string{" ORDER BY ", " SKIP ", " LIMIT "} {
		idx := strings.Index(strings.ToUpper(returnPart), keyword)
		if idx >= 0 && idx < returnEndIdx {
			returnEndIdx = idx
		}
	}
	returnClause := strings.TrimSpace(returnPart[:returnEndIdx])

	// Check for DISTINCT
	distinct := false
	if strings.HasPrefix(strings.ToUpper(returnClause), "DISTINCT ") {
		distinct = true
		returnClause = strings.TrimSpace(returnClause[9:])
	}

	// Parse RETURN items
	returnItems := e.parseReturnItems(returnClause)
	result.Columns = make([]string, len(returnItems))
	for i, item := range returnItems {
		if item.alias != "" {
			result.Columns[i] = item.alias
		} else {
			result.Columns[i] = item.expr
		}
	}

	// Check if this is an aggregation query
	hasAggregation := false
	for _, item := range returnItems {
		upperExpr := strings.ToUpper(item.expr)
		if strings.HasPrefix(upperExpr, "COUNT(") ||
			strings.HasPrefix(upperExpr, "SUM(") ||
			strings.HasPrefix(upperExpr, "AVG(") ||
			strings.HasPrefix(upperExpr, "MIN(") ||
			strings.HasPrefix(upperExpr, "MAX(") ||
			strings.HasPrefix(upperExpr, "COLLECT(") {
			hasAggregation = true
			break
		}
	}

	// Extract pattern between MATCH and WHERE/RETURN
	matchPart := cypher[5:] // Skip "MATCH"
	whereIdx := strings.Index(upper, "WHERE")
	if whereIdx > 0 {
		matchPart = cypher[5:whereIdx]
	} else if returnIdx > 0 {
		matchPart = cypher[5:returnIdx]
	}
	matchPart = strings.TrimSpace(matchPart)

	// Parse node pattern
	nodePattern := e.parseNodePattern(matchPart)

	// Get matching nodes
	var nodes []*storage.Node
	var err error

	if len(nodePattern.labels) > 0 {
		nodes, err = e.storage.GetNodesByLabel(nodePattern.labels[0])
	} else {
		nodes, err = e.storage.AllNodes()
	}
	if err != nil {
		return nil, fmt.Errorf("storage error: %w", err)
	}

	// Apply WHERE filter if present
	if whereIdx > 0 {
		// Find end of WHERE clause (before RETURN)
		wherePart := cypher[whereIdx+5 : returnIdx]
		nodes = e.filterNodes(nodes, nodePattern.variable, strings.TrimSpace(wherePart))
	}

	// Handle aggregation queries
	if hasAggregation {
		return e.executeAggregation(nodes, nodePattern.variable, returnItems, result)
	}

	// Parse ORDER BY
	orderByIdx := strings.Index(upper, "ORDER BY")
	if orderByIdx > 0 {
		orderPart := upper[orderByIdx+8:]
		// Find end
		endIdx := len(orderPart)
		for _, kw := range []string{" SKIP ", " LIMIT "} {
			if idx := strings.Index(orderPart, kw); idx >= 0 && idx < endIdx {
				endIdx = idx
			}
		}
		orderExpr := strings.TrimSpace(cypher[orderByIdx+8 : orderByIdx+8+endIdx])
		nodes = e.orderNodes(nodes, nodePattern.variable, orderExpr)
	}

	// Parse SKIP
	skipIdx := strings.Index(upper, "SKIP")
	skip := 0
	if skipIdx > 0 {
		skipPart := strings.TrimSpace(cypher[skipIdx+4:])
		skipPart = strings.Split(skipPart, " ")[0]
		if s, err := strconv.Atoi(skipPart); err == nil {
			skip = s
		}
	}

	// Parse LIMIT
	limitIdx := strings.Index(upper, "LIMIT")
	limit := -1
	if limitIdx > 0 {
		limitPart := strings.TrimSpace(cypher[limitIdx+5:])
		limitPart = strings.Split(limitPart, " ")[0]
		if l, err := strconv.Atoi(limitPart); err == nil {
			limit = l
		}
	}

	// Build result rows with SKIP and LIMIT
	seen := make(map[string]bool) // For DISTINCT
	rowCount := 0
	for i, node := range nodes {
		// Apply SKIP
		if i < skip {
			continue
		}

		// Apply LIMIT
		if limit >= 0 && rowCount >= limit {
			break
		}

		row := make([]interface{}, len(returnItems))
		for j, item := range returnItems {
			row[j] = e.resolveReturnItem(item, nodePattern.variable, node)
		}

		// Handle DISTINCT
		if distinct {
			key := fmt.Sprintf("%v", row)
			if seen[key] {
				continue
			}
			seen[key] = true
		}

		result.Rows = append(result.Rows, row)
		rowCount++
	}

	return result, nil
}

// executeAggregation handles aggregate functions (COUNT, SUM, AVG, etc.)
func (e *StorageExecutor) executeAggregation(nodes []*storage.Node, variable string, items []returnItem, result *ExecuteResult) (*ExecuteResult, error) {
	row := make([]interface{}, len(items))

	// Case-insensitive regex patterns for aggregation functions
	countPropRe := regexp.MustCompile(`(?i)COUNT\((\w+)\.(\w+)\)`)
	sumRe := regexp.MustCompile(`(?i)SUM\((\w+)\.(\w+)\)`)
	avgRe := regexp.MustCompile(`(?i)AVG\((\w+)\.(\w+)\)`)
	minRe := regexp.MustCompile(`(?i)MIN\((\w+)\.(\w+)\)`)
	maxRe := regexp.MustCompile(`(?i)MAX\((\w+)\.(\w+)\)`)
	collectRe := regexp.MustCompile(`(?i)COLLECT\((\w+)(?:\.(\w+))?\)`)

	for i, item := range items {
		upperExpr := strings.ToUpper(item.expr)

		switch {
		case strings.HasPrefix(upperExpr, "COUNT("):
			// COUNT(*) or COUNT(n)
			if strings.Contains(upperExpr, "*") || strings.Contains(upperExpr, "("+strings.ToUpper(variable)+")") {
				row[i] = int64(len(nodes))
			} else {
				// COUNT(n.property) - count non-null values
				propMatch := countPropRe.FindStringSubmatch(item.expr)
				if len(propMatch) == 3 {
					count := int64(0)
					for _, node := range nodes {
						if _, exists := node.Properties[propMatch[2]]; exists {
							count++
						}
					}
					row[i] = count
				} else {
					row[i] = int64(len(nodes))
				}
			}

		case strings.HasPrefix(upperExpr, "SUM("):
			propMatch := sumRe.FindStringSubmatch(item.expr)
			if len(propMatch) == 3 {
				sum := float64(0)
				for _, node := range nodes {
					if val, exists := node.Properties[propMatch[2]]; exists {
						if num, ok := toFloat64(val); ok {
							sum += num
						}
					}
				}
				row[i] = sum
			} else {
				row[i] = float64(0)
			}

		case strings.HasPrefix(upperExpr, "AVG("):
			propMatch := avgRe.FindStringSubmatch(item.expr)
			if len(propMatch) == 3 {
				sum := float64(0)
				count := 0
				for _, node := range nodes {
					if val, exists := node.Properties[propMatch[2]]; exists {
						if num, ok := toFloat64(val); ok {
							sum += num
							count++
						}
					}
				}
				if count > 0 {
					row[i] = sum / float64(count)
				} else {
					row[i] = nil
				}
			} else {
				row[i] = nil
			}

		case strings.HasPrefix(upperExpr, "MIN("):
			propMatch := minRe.FindStringSubmatch(item.expr)
			if len(propMatch) == 3 {
				var min *float64
				for _, node := range nodes {
					if val, exists := node.Properties[propMatch[2]]; exists {
						if num, ok := toFloat64(val); ok {
							if min == nil || num < *min {
								minVal := num
								min = &minVal
							}
						}
					}
				}
				if min != nil {
					row[i] = *min
				} else {
					row[i] = nil
				}
			} else {
				row[i] = nil
			}

		case strings.HasPrefix(upperExpr, "MAX("):
			propMatch := maxRe.FindStringSubmatch(item.expr)
			if len(propMatch) == 3 {
				var max *float64
				for _, node := range nodes {
					if val, exists := node.Properties[propMatch[2]]; exists {
						if num, ok := toFloat64(val); ok {
							if max == nil || num > *max {
								maxVal := num
								max = &maxVal
							}
						}
					}
				}
				if max != nil {
					row[i] = *max
				} else {
					row[i] = nil
				}
			} else {
				row[i] = nil
			}

		case strings.HasPrefix(upperExpr, "COLLECT("):
			propMatch := collectRe.FindStringSubmatch(item.expr)
			collected := make([]interface{}, 0)
			if len(propMatch) >= 2 {
				for _, node := range nodes {
					if len(propMatch) == 3 && propMatch[2] != "" {
						// COLLECT(n.property)
						if val, exists := node.Properties[propMatch[2]]; exists {
							collected = append(collected, val)
						}
					} else {
						// COLLECT(n)
						collected = append(collected, map[string]interface{}{
							"id":         string(node.ID),
							"labels":     node.Labels,
							"properties": node.Properties,
						})
					}
				}
			}
			row[i] = collected

		default:
			// Non-aggregate in aggregation query - return first value
			if len(nodes) > 0 {
				row[i] = e.resolveReturnItem(item, variable, nodes[0])
			} else {
				row[i] = nil
			}
		}
	}

	result.Rows = [][]interface{}{row}
	return result, nil
}

// orderNodes sorts nodes by the given expression
func (e *StorageExecutor) orderNodes(nodes []*storage.Node, variable, orderExpr string) []*storage.Node {
	// Parse: n.property [ASC|DESC]
	desc := strings.HasSuffix(strings.ToUpper(orderExpr), " DESC")
	orderExpr = strings.TrimSuffix(strings.TrimSuffix(orderExpr, " DESC"), " ASC")
	orderExpr = strings.TrimSpace(orderExpr)

	// Extract property name
	var propName string
	if strings.HasPrefix(orderExpr, variable+".") {
		propName = orderExpr[len(variable)+1:]
	} else {
		propName = orderExpr
	}

	// Sort using a simple bubble sort (could use sort.Slice for efficiency)
	sorted := make([]*storage.Node, len(nodes))
	copy(sorted, nodes)

	for i := 0; i < len(sorted)-1; i++ {
		for j := 0; j < len(sorted)-i-1; j++ {
			val1, _ := sorted[j].Properties[propName]
			val2, _ := sorted[j+1].Properties[propName]

			shouldSwap := false
			num1, ok1 := toFloat64(val1)
			num2, ok2 := toFloat64(val2)

			if ok1 && ok2 {
				if desc {
					shouldSwap = num1 < num2
				} else {
					shouldSwap = num1 > num2
				}
			} else {
				str1 := fmt.Sprintf("%v", val1)
				str2 := fmt.Sprintf("%v", val2)
				if desc {
					shouldSwap = str1 < str2
				} else {
					shouldSwap = str1 > str2
				}
			}

			if shouldSwap {
				sorted[j], sorted[j+1] = sorted[j+1], sorted[j]
			}
		}
	}

	return sorted
}

// executeCreate handles CREATE queries.
func (e *StorageExecutor) executeCreate(ctx context.Context, cypher string) (*ExecuteResult, error) {
	result := &ExecuteResult{
		Columns: []string{},
		Rows:    [][]interface{}{},
		Stats:   &QueryStats{},
	}

	// Parse CREATE pattern
	pattern := cypher[6:] // Skip "CREATE"
	upper := strings.ToUpper(cypher)

	returnIdx := strings.Index(upper, "RETURN")
	if returnIdx > 0 {
		pattern = cypher[6:returnIdx]
	}
	pattern = strings.TrimSpace(pattern)

	// Check for relationship pattern: (a)-[r:TYPE]->(b)
	if strings.Contains(pattern, "->") || strings.Contains(pattern, "<-") || strings.Contains(pattern, "-[") {
		return e.executeCreateRelationship(ctx, cypher, pattern, returnIdx)
	}

	// Handle multiple node patterns: CREATE (a:Person), (b:Company)
	// Split by comma but respect parentheses
	nodePatterns := e.splitNodePatterns(pattern)
	createdNodes := make(map[string]*storage.Node)

	for _, nodePatternStr := range nodePatterns {
		nodePatternStr = strings.TrimSpace(nodePatternStr)
		if nodePatternStr == "" {
			continue
		}

		nodePattern := e.parseNodePattern(nodePatternStr)

		// Create the node
		node := &storage.Node{
			ID:         storage.NodeID(e.generateID()),
			Labels:     nodePattern.labels,
			Properties: nodePattern.properties,
		}

		if err := e.storage.CreateNode(node); err != nil {
			return nil, fmt.Errorf("failed to create node: %w", err)
		}

		result.Stats.NodesCreated++

		if nodePattern.variable != "" {
			createdNodes[nodePattern.variable] = node
		}
	}

	// Handle RETURN clause
	if returnIdx > 0 {
		returnPart := strings.TrimSpace(cypher[returnIdx+6:])
		returnItems := e.parseReturnItems(returnPart)

		result.Columns = make([]string, len(returnItems))
		row := make([]interface{}, len(returnItems))

		for i, item := range returnItems {
			if item.alias != "" {
				result.Columns[i] = item.alias
			} else {
				result.Columns[i] = item.expr
			}

			// Find the matching node for this return item
			for variable, node := range createdNodes {
				if strings.HasPrefix(item.expr, variable) || item.expr == variable {
					row[i] = e.resolveReturnItem(item, variable, node)
					break
				}
			}
		}
		result.Rows = [][]interface{}{row}
	}

	return result, nil
}

// splitNodePatterns splits a CREATE pattern into individual node patterns
func (e *StorageExecutor) splitNodePatterns(pattern string) []string {
	var patterns []string
	var current strings.Builder
	depth := 0

	for _, c := range pattern {
		switch c {
		case '(':
			depth++
			current.WriteRune(c)
		case ')':
			depth--
			current.WriteRune(c)
			if depth == 0 {
				patterns = append(patterns, current.String())
				current.Reset()
			}
		case ',':
			if depth == 0 {
				// Skip comma between patterns
				continue
			}
			current.WriteRune(c)
		default:
			if depth > 0 {
				current.WriteRune(c)
			}
		}
	}

	// Handle any remaining content
	if current.Len() > 0 {
		patterns = append(patterns, current.String())
	}

	return patterns
}

// executeCreateRelationship handles CREATE with relationships.
func (e *StorageExecutor) executeCreateRelationship(ctx context.Context, cypher, pattern string, returnIdx int) (*ExecuteResult, error) {
	result := &ExecuteResult{
		Columns: []string{},
		Rows:    [][]interface{}{},
		Stats:   &QueryStats{},
	}

	// Parse relationship pattern: (a:Label {props})-[r:TYPE {props}]->(b:Label {props})
	// Simplified parsing - assumes format (a)-[r:TYPE]->(b)
	relPattern := regexp.MustCompile(`\(([^)]*)\)\s*-\[([^\]]*)\]->\s*\(([^)]*)\)`)
	matches := relPattern.FindStringSubmatch(pattern)

	if len(matches) < 4 {
		// Try other direction
		relPattern = regexp.MustCompile(`\(([^)]*)\)\s*<-\[([^\]]*)\]-\s*\(([^)]*)\)`)
		matches = relPattern.FindStringSubmatch(pattern)
	}

	if len(matches) < 4 {
		return nil, fmt.Errorf("invalid relationship pattern")
	}

	// Parse source node
	sourcePattern := e.parseNodePattern("(" + matches[1] + ")")
	sourceNode := &storage.Node{
		ID:         storage.NodeID(e.generateID()),
		Labels:     sourcePattern.labels,
		Properties: sourcePattern.properties,
	}
	if err := e.storage.CreateNode(sourceNode); err != nil {
		return nil, fmt.Errorf("failed to create source node: %w", err)
	}
	result.Stats.NodesCreated++

	// Parse target node
	targetPattern := e.parseNodePattern("(" + matches[3] + ")")
	targetNode := &storage.Node{
		ID:         storage.NodeID(e.generateID()),
		Labels:     targetPattern.labels,
		Properties: targetPattern.properties,
	}
	if err := e.storage.CreateNode(targetNode); err != nil {
		return nil, fmt.Errorf("failed to create target node: %w", err)
	}
	result.Stats.NodesCreated++

	// Parse relationship
	relPart := matches[2]
	relType := "RELATED_TO"
	if colonIdx := strings.Index(relPart, ":"); colonIdx >= 0 {
		relType = strings.TrimSpace(relPart[colonIdx+1:])
		// Remove any properties from type
		if braceIdx := strings.Index(relType, "{"); braceIdx >= 0 {
			relType = strings.TrimSpace(relType[:braceIdx])
		}
	}

	// Create relationship
	edge := &storage.Edge{
		ID:         storage.EdgeID(e.generateID()),
		StartNode:  sourceNode.ID,
		EndNode:    targetNode.ID,
		Type:       relType,
		Properties: make(map[string]interface{}),
	}
	if err := e.storage.CreateEdge(edge); err != nil {
		return nil, fmt.Errorf("failed to create relationship: %w", err)
	}
	result.Stats.RelationshipsCreated++

	// Handle RETURN
	if returnIdx > 0 {
		returnPart := strings.TrimSpace(cypher[returnIdx+6:])
		returnItems := e.parseReturnItems(returnPart)

		result.Columns = make([]string, len(returnItems))
		row := make([]interface{}, len(returnItems))

		for i, item := range returnItems {
			if item.alias != "" {
				result.Columns[i] = item.alias
			} else {
				result.Columns[i] = item.expr
			}
			// Resolve based on variable name
			switch {
			case strings.HasPrefix(item.expr, sourcePattern.variable):
				row[i] = e.resolveReturnItem(item, sourcePattern.variable, sourceNode)
			case strings.HasPrefix(item.expr, targetPattern.variable):
				row[i] = e.resolveReturnItem(item, targetPattern.variable, targetNode)
			default:
				row[i] = e.resolveReturnItem(item, sourcePattern.variable, sourceNode)
			}
		}
		result.Rows = [][]interface{}{row}
	}

	return result, nil
}

// executeMerge handles MERGE queries.
func (e *StorageExecutor) executeMerge(ctx context.Context, cypher string) (*ExecuteResult, error) {
	// MERGE is like CREATE but checks for existence first
	// For now, treat as CREATE (TODO: implement proper MERGE semantics)
	return e.executeCreate(ctx, strings.Replace(cypher, "MERGE", "CREATE", 1))
}

// executeDelete handles DELETE queries.
func (e *StorageExecutor) executeDelete(ctx context.Context, cypher string) (*ExecuteResult, error) {
	result := &ExecuteResult{
		Columns: []string{},
		Rows:    [][]interface{}{},
		Stats:   &QueryStats{},
	}

	// Parse: MATCH (n) WHERE ... DELETE n or DETACH DELETE n
	upper := strings.ToUpper(cypher)
	detach := strings.Contains(upper, "DETACH")

	// Get MATCH part
	matchIdx := strings.Index(upper, "MATCH")

	// Find the delete clause - could be "DELETE" or "DETACH DELETE"
	var deleteIdx int
	if detach {
		deleteIdx = strings.Index(upper, "DETACH DELETE")
		if deleteIdx == -1 {
			deleteIdx = strings.Index(upper, "DETACH")
		}
	} else {
		deleteIdx = strings.Index(upper, " DELETE ")
		if deleteIdx == -1 {
			deleteIdx = strings.Index(upper, " DELETE")
		}
	}

	if matchIdx == -1 || deleteIdx == -1 {
		return nil, fmt.Errorf("DELETE requires a MATCH clause")
	}

	// Execute the match first
	matchQuery := cypher[matchIdx:deleteIdx] + " RETURN *"
	matchResult, err := e.executeMatch(ctx, matchQuery)
	if err != nil {
		return nil, err
	}

	// Delete matched nodes
	for _, row := range matchResult.Rows {
		for _, val := range row {
			if node, ok := val.(map[string]interface{}); ok {
				if id, ok := node["id"].(string); ok {
					if detach {
						// Delete all connected edges first
						edges, _ := e.storage.GetOutgoingEdges(storage.NodeID(id))
						for _, edge := range edges {
							e.storage.DeleteEdge(edge.ID)
							result.Stats.RelationshipsDeleted++
						}
						edges, _ = e.storage.GetIncomingEdges(storage.NodeID(id))
						for _, edge := range edges {
							e.storage.DeleteEdge(edge.ID)
							result.Stats.RelationshipsDeleted++
						}
					}
					if err := e.storage.DeleteNode(storage.NodeID(id)); err == nil {
						result.Stats.NodesDeleted++
					}
				}
			}
		}
	}

	return result, nil
}

// executeSet handles MATCH ... SET queries.
func (e *StorageExecutor) executeSet(ctx context.Context, cypher string) (*ExecuteResult, error) {
	result := &ExecuteResult{
		Columns: []string{},
		Rows:    [][]interface{}{},
		Stats:   &QueryStats{},
	}

	upper := strings.ToUpper(cypher)
	matchIdx := strings.Index(upper, "MATCH")
	setIdx := strings.Index(upper, " SET ")
	returnIdx := strings.Index(upper, "RETURN")

	if matchIdx == -1 || setIdx == -1 {
		return nil, fmt.Errorf("SET requires a MATCH clause")
	}

	// Execute the match first
	var matchQuery string
	if returnIdx > 0 {
		matchQuery = cypher[matchIdx:setIdx] + " RETURN *"
	} else {
		matchQuery = cypher[matchIdx:setIdx] + " RETURN *"
	}
	matchResult, err := e.executeMatch(ctx, matchQuery)
	if err != nil {
		return nil, err
	}

	// Parse SET clause: SET n.property = value
	var setPart string
	if returnIdx > 0 {
		setPart = strings.TrimSpace(cypher[setIdx+5 : returnIdx])
	} else {
		setPart = strings.TrimSpace(cypher[setIdx+5:])
	}

	// Parse assignment: n.property = value
	eqIdx := strings.Index(setPart, "=")
	if eqIdx == -1 {
		return nil, fmt.Errorf("SET requires an assignment")
	}

	left := strings.TrimSpace(setPart[:eqIdx])
	right := strings.TrimSpace(setPart[eqIdx+1:])

	// Extract variable and property
	parts := strings.SplitN(left, ".", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("SET requires property access (n.property)")
	}
	variable := parts[0]
	propName := parts[1]
	propValue := e.parseValue(right)

	// Update matched nodes
	for _, row := range matchResult.Rows {
		for _, val := range row {
			if node, ok := val.(map[string]interface{}); ok {
				if id, ok := node["id"].(string); ok {
					storageNode, err := e.storage.GetNode(storage.NodeID(id))
					if err != nil {
						continue
					}
					if storageNode.Properties == nil {
						storageNode.Properties = make(map[string]interface{})
					}
					storageNode.Properties[propName] = propValue
					if err := e.storage.UpdateNode(storageNode); err == nil {
						result.Stats.PropertiesSet++
					}
				}
			}
		}
	}

	// Handle RETURN
	if returnIdx > 0 {
		returnPart := strings.TrimSpace(cypher[returnIdx+6:])
		returnItems := e.parseReturnItems(returnPart)
		result.Columns = make([]string, len(returnItems))
		for i, item := range returnItems {
			if item.alias != "" {
				result.Columns[i] = item.alias
			} else {
				result.Columns[i] = item.expr
			}
		}

		// Re-fetch and return updated nodes
		for _, row := range matchResult.Rows {
			for _, val := range row {
				if node, ok := val.(map[string]interface{}); ok {
					if id, ok := node["id"].(string); ok {
						storageNode, _ := e.storage.GetNode(storage.NodeID(id))
						if storageNode != nil {
							newRow := make([]interface{}, len(returnItems))
							for j, item := range returnItems {
								newRow[j] = e.resolveReturnItem(item, variable, storageNode)
							}
							result.Rows = append(result.Rows, newRow)
						}
					}
				}
			}
		}
	}

	return result, nil
}

// executeCall handles CALL procedure queries.
func (e *StorageExecutor) executeCall(ctx context.Context, cypher string) (*ExecuteResult, error) {
	upper := strings.ToUpper(cypher)

	switch {
	case strings.Contains(upper, "NORNICDB.VERSION"):
		return e.callNornicDbVersion()
	case strings.Contains(upper, "NORNICDB.STATS"):
		return e.callNornicDbStats()
	case strings.Contains(upper, "NORNICDB.DECAY.INFO"):
		return e.callNornicDbDecayInfo()
	case strings.Contains(upper, "DB.SCHEMA.VISUALIZATION"):
		return e.callDbSchemaVisualization()
	case strings.Contains(upper, "DB.SCHEMA.NODEPROPERTIES"):
		return e.callDbSchemaNodeProperties()
	case strings.Contains(upper, "DB.SCHEMA.RELPROPERTIES"):
		return e.callDbSchemaRelProperties()
	case strings.Contains(upper, "DB.LABELS"):
		return e.callDbLabels()
	case strings.Contains(upper, "DB.RELATIONSHIPTYPES"):
		return e.callDbRelationshipTypes()
	case strings.Contains(upper, "DB.INDEXES"):
		return e.callDbIndexes()
	case strings.Contains(upper, "DB.CONSTRAINTS"):
		return e.callDbConstraints()
	case strings.Contains(upper, "DB.PROPERTYKEYS"):
		return e.callDbPropertyKeys()
	case strings.Contains(upper, "DBMS.COMPONENTS"):
		return e.callDbmsComponents()
	case strings.Contains(upper, "DBMS.PROCEDURES"):
		return e.callDbmsProcedures()
	case strings.Contains(upper, "DBMS.FUNCTIONS"):
		return e.callDbmsFunctions()
	default:
		return nil, fmt.Errorf("unknown procedure: %s", cypher)
	}
}

func (e *StorageExecutor) callDbLabels() (*ExecuteResult, error) {
	nodes, err := e.storage.AllNodes()
	if err != nil {
		return nil, err
	}

	labelSet := make(map[string]bool)
	for _, node := range nodes {
		for _, label := range node.Labels {
			labelSet[label] = true
		}
	}

	result := &ExecuteResult{
		Columns: []string{"label"},
		Rows:    make([][]interface{}, 0, len(labelSet)),
	}
	for label := range labelSet {
		result.Rows = append(result.Rows, []interface{}{label})
	}
	return result, nil
}

func (e *StorageExecutor) callDbRelationshipTypes() (*ExecuteResult, error) {
	edges, err := e.storage.AllEdges()
	if err != nil {
		return nil, err
	}

	typeSet := make(map[string]bool)
	for _, edge := range edges {
		typeSet[edge.Type] = true
	}

	result := &ExecuteResult{
		Columns: []string{"relationshipType"},
		Rows:    make([][]interface{}, 0, len(typeSet)),
	}
	for relType := range typeSet {
		result.Rows = append(result.Rows, []interface{}{relType})
	}
	return result, nil
}

func (e *StorageExecutor) callDbIndexes() (*ExecuteResult, error) {
	// Return empty for now - no indexes implemented yet
	return &ExecuteResult{
		Columns: []string{"name", "type", "labelsOrTypes", "properties", "state"},
		Rows:    [][]interface{}{},
	}, nil
}

func (e *StorageExecutor) callDbConstraints() (*ExecuteResult, error) {
	// Return empty for now
	return &ExecuteResult{
		Columns: []string{"name", "type", "labelsOrTypes", "properties"},
		Rows:    [][]interface{}{},
	}, nil
}

func (e *StorageExecutor) callDbmsComponents() (*ExecuteResult, error) {
	return &ExecuteResult{
		Columns: []string{"name", "versions", "edition"},
		Rows: [][]interface{}{
			{"NornicDB", []string{"1.0.0"}, "community"},
		},
	}, nil
}

// NornicDB-specific procedures

func (e *StorageExecutor) callNornicDbVersion() (*ExecuteResult, error) {
	return &ExecuteResult{
		Columns: []string{"version", "build", "edition"},
		Rows: [][]interface{}{
			{"1.0.0", "development", "community"},
		},
	}, nil
}

func (e *StorageExecutor) callNornicDbStats() (*ExecuteResult, error) {
	nodeCount, _ := e.storage.NodeCount()
	edgeCount, _ := e.storage.EdgeCount()

	return &ExecuteResult{
		Columns: []string{"nodes", "relationships", "labels", "relationshipTypes"},
		Rows: [][]interface{}{
			{nodeCount, edgeCount, e.countLabels(), e.countRelTypes()},
		},
	}, nil
}

func (e *StorageExecutor) countLabels() int {
	nodes, err := e.storage.AllNodes()
	if err != nil {
		return 0
	}
	labelSet := make(map[string]bool)
	for _, node := range nodes {
		for _, label := range node.Labels {
			labelSet[label] = true
		}
	}
	return len(labelSet)
}

func (e *StorageExecutor) countRelTypes() int {
	edges, err := e.storage.AllEdges()
	if err != nil {
		return 0
	}
	typeSet := make(map[string]bool)
	for _, edge := range edges {
		typeSet[edge.Type] = true
	}
	return len(typeSet)
}

func (e *StorageExecutor) callNornicDbDecayInfo() (*ExecuteResult, error) {
	return &ExecuteResult{
		Columns: []string{"enabled", "halfLifeEpisodic", "halfLifeSemantic", "halfLifeProcedural", "archiveThreshold"},
		Rows: [][]interface{}{
			{true, "7 days", "69 days", "693 days", 0.05},
		},
	}, nil
}

// Neo4j schema procedures

func (e *StorageExecutor) callDbSchemaVisualization() (*ExecuteResult, error) {
	// Return a simplified schema visualization
	nodes, _ := e.storage.AllNodes()
	edges, _ := e.storage.AllEdges()

	// Collect unique labels and relationship types
	labelSet := make(map[string]bool)
	for _, node := range nodes {
		for _, label := range node.Labels {
			labelSet[label] = true
		}
	}

	relTypeSet := make(map[string]bool)
	for _, edge := range edges {
		relTypeSet[edge.Type] = true
	}

	// Build schema nodes (one per label)
	var schemaNodes []map[string]interface{}
	for label := range labelSet {
		schemaNodes = append(schemaNodes, map[string]interface{}{
			"label": label,
		})
	}

	// Build schema relationships
	var schemaRels []map[string]interface{}
	for relType := range relTypeSet {
		schemaRels = append(schemaRels, map[string]interface{}{
			"type": relType,
		})
	}

	return &ExecuteResult{
		Columns: []string{"nodes", "relationships"},
		Rows: [][]interface{}{
			{schemaNodes, schemaRels},
		},
	}, nil
}

func (e *StorageExecutor) callDbSchemaNodeProperties() (*ExecuteResult, error) {
	nodes, _ := e.storage.AllNodes()

	// Collect properties per label
	labelProps := make(map[string]map[string]bool)
	for _, node := range nodes {
		for _, label := range node.Labels {
			if _, ok := labelProps[label]; !ok {
				labelProps[label] = make(map[string]bool)
			}
			for prop := range node.Properties {
				labelProps[label][prop] = true
			}
		}
	}

	result := &ExecuteResult{
		Columns: []string{"nodeLabel", "propertyName", "propertyType"},
		Rows:    [][]interface{}{},
	}

	for label, props := range labelProps {
		for prop := range props {
			result.Rows = append(result.Rows, []interface{}{label, prop, "ANY"})
		}
	}

	return result, nil
}

func (e *StorageExecutor) callDbSchemaRelProperties() (*ExecuteResult, error) {
	edges, _ := e.storage.AllEdges()

	// Collect properties per relationship type
	typeProps := make(map[string]map[string]bool)
	for _, edge := range edges {
		if _, ok := typeProps[edge.Type]; !ok {
			typeProps[edge.Type] = make(map[string]bool)
		}
		for prop := range edge.Properties {
			typeProps[edge.Type][prop] = true
		}
	}

	result := &ExecuteResult{
		Columns: []string{"relType", "propertyName", "propertyType"},
		Rows:    [][]interface{}{},
	}

	for relType, props := range typeProps {
		for prop := range props {
			result.Rows = append(result.Rows, []interface{}{relType, prop, "ANY"})
		}
	}

	return result, nil
}

func (e *StorageExecutor) callDbPropertyKeys() (*ExecuteResult, error) {
	nodes, _ := e.storage.AllNodes()
	edges, _ := e.storage.AllEdges()

	propSet := make(map[string]bool)
	for _, node := range nodes {
		for prop := range node.Properties {
			propSet[prop] = true
		}
	}
	for _, edge := range edges {
		for prop := range edge.Properties {
			propSet[prop] = true
		}
	}

	result := &ExecuteResult{
		Columns: []string{"propertyKey"},
		Rows:    make([][]interface{}, 0, len(propSet)),
	}
	for prop := range propSet {
		result.Rows = append(result.Rows, []interface{}{prop})
	}

	return result, nil
}

func (e *StorageExecutor) callDbmsProcedures() (*ExecuteResult, error) {
	procedures := [][]interface{}{
		{"db.labels", "Lists all labels in the database", "READ"},
		{"db.relationshipTypes", "Lists all relationship types", "READ"},
		{"db.propertyKeys", "Lists all property keys", "READ"},
		{"db.indexes", "Lists all indexes", "READ"},
		{"db.constraints", "Lists all constraints", "READ"},
		{"db.schema.visualization", "Visualizes the database schema", "READ"},
		{"db.schema.nodeProperties", "Lists node properties by label", "READ"},
		{"db.schema.relProperties", "Lists relationship properties by type", "READ"},
		{"dbms.components", "Lists database components", "DBMS"},
		{"dbms.procedures", "Lists available procedures", "DBMS"},
		{"dbms.functions", "Lists available functions", "DBMS"},
		{"nornicdb.version", "Returns NornicDB version", "READ"},
		{"nornicdb.stats", "Returns database statistics", "READ"},
		{"nornicdb.decay.info", "Returns memory decay configuration", "READ"},
	}

	return &ExecuteResult{
		Columns: []string{"name", "description", "mode"},
		Rows:    procedures,
	}, nil
}

func (e *StorageExecutor) callDbmsFunctions() (*ExecuteResult, error) {
	functions := [][]interface{}{
		{"count", "Counts items", "Aggregating"},
		{"sum", "Sums numeric values", "Aggregating"},
		{"avg", "Averages numeric values", "Aggregating"},
		{"min", "Returns minimum value", "Aggregating"},
		{"max", "Returns maximum value", "Aggregating"},
		{"collect", "Collects values into a list", "Aggregating"},
		{"id", "Returns internal ID", "Scalar"},
		{"labels", "Returns labels of a node", "Scalar"},
		{"type", "Returns type of relationship", "Scalar"},
		{"properties", "Returns properties map", "Scalar"},
		{"keys", "Returns property keys", "Scalar"},
		{"coalesce", "Returns first non-null value", "Scalar"},
		{"toString", "Converts to string", "Scalar"},
		{"toInteger", "Converts to integer", "Scalar"},
		{"toFloat", "Converts to float", "Scalar"},
		{"toBoolean", "Converts to boolean", "Scalar"},
		{"size", "Returns size of list/string", "Scalar"},
		{"length", "Returns path length", "Scalar"},
		{"head", "Returns first list element", "List"},
		{"tail", "Returns list without first element", "List"},
		{"last", "Returns last list element", "List"},
		{"range", "Creates a range list", "List"},
	}

	return &ExecuteResult{
		Columns: []string{"name", "description", "category"},
		Rows:    functions,
	}, nil
}

// Helper types and functions

type nodePatternInfo struct {
	variable   string
	labels     []string
	properties map[string]interface{}
}

type returnItem struct {
	expr  string
	alias string
}

func (e *StorageExecutor) parseNodePattern(pattern string) nodePatternInfo {
	info := nodePatternInfo{
		labels:     []string{},
		properties: make(map[string]interface{}),
	}

	// Remove outer parens
	pattern = strings.TrimSpace(pattern)
	if strings.HasPrefix(pattern, "(") && strings.HasSuffix(pattern, ")") {
		pattern = pattern[1 : len(pattern)-1]
	}

	// Extract properties
	braceIdx := strings.Index(pattern, "{")
	if braceIdx >= 0 {
		propsStr := pattern[braceIdx:]
		pattern = pattern[:braceIdx]
		info.properties = e.parseProperties(propsStr)
	}

	// Parse variable:Label:Label2
	parts := strings.Split(strings.TrimSpace(pattern), ":")
	if len(parts) > 0 && parts[0] != "" {
		info.variable = strings.TrimSpace(parts[0])
	}
	for i := 1; i < len(parts); i++ {
		if label := strings.TrimSpace(parts[i]); label != "" {
			info.labels = append(info.labels, label)
		}
	}

	return info
}

func (e *StorageExecutor) parseProperties(propsStr string) map[string]interface{} {
	props := make(map[string]interface{})

	// Remove braces
	propsStr = strings.TrimSpace(propsStr)
	if strings.HasPrefix(propsStr, "{") {
		propsStr = propsStr[1:]
	}
	if strings.HasSuffix(propsStr, "}") {
		propsStr = propsStr[:len(propsStr)-1]
	}

	// Split by comma (simple parsing)
	pairs := strings.Split(propsStr, ",")
	for _, pair := range pairs {
		kv := strings.SplitN(pair, ":", 2)
		if len(kv) == 2 {
			key := strings.TrimSpace(kv[0])
			value := strings.TrimSpace(kv[1])

			// Remove quotes from string values
			if (strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'")) ||
				(strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"")) {
				value = value[1 : len(value)-1]
				props[key] = value
			} else if v, err := strconv.ParseInt(value, 10, 64); err == nil {
				props[key] = v
			} else if v, err := strconv.ParseFloat(value, 64); err == nil {
				props[key] = v
			} else if value == "true" {
				props[key] = true
			} else if value == "false" {
				props[key] = false
			} else {
				props[key] = value
			}
		}
	}

	return props
}

func (e *StorageExecutor) parseReturnItems(returnPart string) []returnItem {
	items := []returnItem{}

	// Handle LIMIT clause
	upper := strings.ToUpper(returnPart)
	limitIdx := strings.Index(upper, "LIMIT")
	if limitIdx > 0 {
		returnPart = returnPart[:limitIdx]
	}

	// Handle ORDER BY clause
	orderIdx := strings.Index(upper, "ORDER")
	if orderIdx > 0 {
		returnPart = returnPart[:orderIdx]
	}

	// Split by comma
	parts := strings.Split(returnPart, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || part == "*" {
			continue
		}

		item := returnItem{expr: part}

		// Check for AS alias
		upperPart := strings.ToUpper(part)
		asIdx := strings.Index(upperPart, " AS ")
		if asIdx > 0 {
			item.expr = strings.TrimSpace(part[:asIdx])
			item.alias = strings.TrimSpace(part[asIdx+4:])
		}

		items = append(items, item)
	}

	// If empty or *, return all
	if len(items) == 0 {
		items = append(items, returnItem{expr: "*"})
	}

	return items
}

func (e *StorageExecutor) filterNodes(nodes []*storage.Node, variable, whereClause string) []*storage.Node {
	var filtered []*storage.Node

	for _, node := range nodes {
		if e.evaluateWhere(node, variable, whereClause) {
			filtered = append(filtered, node)
		}
	}

	return filtered
}

func (e *StorageExecutor) evaluateWhere(node *storage.Node, variable, whereClause string) bool {
	// Handle multiple conditions with AND/OR
	upperClause := strings.ToUpper(whereClause)

	// Handle AND conditions
	if strings.Contains(upperClause, " AND ") {
		andIdx := strings.Index(upperClause, " AND ")
		left := strings.TrimSpace(whereClause[:andIdx])
		right := strings.TrimSpace(whereClause[andIdx+5:])
		return e.evaluateWhere(node, variable, left) && e.evaluateWhere(node, variable, right)
	}

	// Handle OR conditions
	if strings.Contains(upperClause, " OR ") {
		orIdx := strings.Index(upperClause, " OR ")
		left := strings.TrimSpace(whereClause[:orIdx])
		right := strings.TrimSpace(whereClause[orIdx+4:])
		return e.evaluateWhere(node, variable, left) || e.evaluateWhere(node, variable, right)
	}

	// Handle string operators (case-insensitive check)
	if strings.Contains(upperClause, " CONTAINS ") {
		return e.evaluateStringOp(node, variable, whereClause, "CONTAINS")
	}
	if strings.Contains(upperClause, " STARTS WITH ") {
		return e.evaluateStringOp(node, variable, whereClause, "STARTS WITH")
	}
	if strings.Contains(upperClause, " ENDS WITH ") {
		return e.evaluateStringOp(node, variable, whereClause, "ENDS WITH")
	}
	if strings.Contains(upperClause, " IN ") {
		return e.evaluateInOp(node, variable, whereClause)
	}
	if strings.Contains(upperClause, " IS NULL") {
		return e.evaluateIsNull(node, variable, whereClause, false)
	}
	if strings.Contains(upperClause, " IS NOT NULL") {
		return e.evaluateIsNull(node, variable, whereClause, true)
	}

	// Determine operator and split accordingly
	var op string
	var opIdx int

	// Check operators in order of length (longest first to avoid partial matches)
	operators := []string{"<>", "!=", ">=", "<=", "=~", ">", "<", "="}
	for _, testOp := range operators {
		idx := strings.Index(whereClause, testOp)
		if idx >= 0 {
			op = testOp
			opIdx = idx
			break
		}
	}

	if op == "" {
		return true // No valid operator found, include all
	}

	left := strings.TrimSpace(whereClause[:opIdx])
	right := strings.TrimSpace(whereClause[opIdx+len(op):])

	// Extract property from left side (e.g., "n.name")
	if !strings.HasPrefix(left, variable+".") {
		return true // Not a property comparison we can handle
	}

	propName := left[len(variable)+1:]

	// Get actual value
	actualVal, exists := node.Properties[propName]
	if !exists {
		return false
	}

	// Parse the expected value from right side
	expectedVal := e.parseValue(right)

	// Perform comparison based on operator
	switch op {
	case "=":
		return e.compareEqual(actualVal, expectedVal)
	case "<>", "!=":
		return !e.compareEqual(actualVal, expectedVal)
	case ">":
		return e.compareGreater(actualVal, expectedVal)
	case ">=":
		return e.compareGreater(actualVal, expectedVal) || e.compareEqual(actualVal, expectedVal)
	case "<":
		return e.compareLess(actualVal, expectedVal)
	case "<=":
		return e.compareLess(actualVal, expectedVal) || e.compareEqual(actualVal, expectedVal)
	case "=~":
		return e.compareRegex(actualVal, expectedVal)
	default:
		return true
	}
}

// parseValue extracts the actual value from a Cypher literal
func (e *StorageExecutor) parseValue(s string) interface{} {
	s = strings.TrimSpace(s)

	// Handle quoted strings
	if (strings.HasPrefix(s, "'") && strings.HasSuffix(s, "'")) ||
		(strings.HasPrefix(s, "\"") && strings.HasSuffix(s, "\"")) {
		return s[1 : len(s)-1]
	}

	// Handle booleans
	upper := strings.ToUpper(s)
	if upper == "TRUE" {
		return true
	}
	if upper == "FALSE" {
		return false
	}
	if upper == "NULL" {
		return nil
	}

	// Handle numbers
	if i, err := strconv.ParseInt(s, 10, 64); err == nil {
		return float64(i) // Normalize to float64 for comparison
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}

	return s
}

// compareEqual handles equality comparison with type coercion
func (e *StorageExecutor) compareEqual(actual, expected interface{}) bool {
	// Handle nil
	if actual == nil && expected == nil {
		return true
	}
	if actual == nil || expected == nil {
		return false
	}

	// Try numeric comparison
	actualNum, actualOk := toFloat64(actual)
	expectedNum, expectedOk := toFloat64(expected)
	if actualOk && expectedOk {
		return actualNum == expectedNum
	}

	// String comparison
	return fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", expected)
}

// compareGreater handles > comparison
func (e *StorageExecutor) compareGreater(actual, expected interface{}) bool {
	actualNum, actualOk := toFloat64(actual)
	expectedNum, expectedOk := toFloat64(expected)
	if actualOk && expectedOk {
		return actualNum > expectedNum
	}

	// String comparison as fallback
	return fmt.Sprintf("%v", actual) > fmt.Sprintf("%v", expected)
}

// compareLess handles < comparison
func (e *StorageExecutor) compareLess(actual, expected interface{}) bool {
	actualNum, actualOk := toFloat64(actual)
	expectedNum, expectedOk := toFloat64(expected)
	if actualOk && expectedOk {
		return actualNum < expectedNum
	}

	// String comparison as fallback
	return fmt.Sprintf("%v", actual) < fmt.Sprintf("%v", expected)
}

// compareRegex handles =~ regex comparison
func (e *StorageExecutor) compareRegex(actual, expected interface{}) bool {
	pattern, ok := expected.(string)
	if !ok {
		return false
	}

	actualStr := fmt.Sprintf("%v", actual)
	matched, err := regexp.MatchString(pattern, actualStr)
	if err != nil {
		return false
	}
	return matched
}

// evaluateStringOp handles CONTAINS, STARTS WITH, ENDS WITH
func (e *StorageExecutor) evaluateStringOp(node *storage.Node, variable, whereClause, op string) bool {
	upperClause := strings.ToUpper(whereClause)
	opIdx := strings.Index(upperClause, " "+op+" ")
	if opIdx < 0 {
		return true
	}

	left := strings.TrimSpace(whereClause[:opIdx])
	right := strings.TrimSpace(whereClause[opIdx+len(op)+2:])

	// Extract property
	if !strings.HasPrefix(left, variable+".") {
		return true
	}
	propName := left[len(variable)+1:]

	actualVal, exists := node.Properties[propName]
	if !exists {
		return false
	}

	actualStr := fmt.Sprintf("%v", actualVal)
	expectedStr := fmt.Sprintf("%v", e.parseValue(right))

	switch op {
	case "CONTAINS":
		return strings.Contains(actualStr, expectedStr)
	case "STARTS WITH":
		return strings.HasPrefix(actualStr, expectedStr)
	case "ENDS WITH":
		return strings.HasSuffix(actualStr, expectedStr)
	}
	return true
}

// evaluateInOp handles IN [list] operator
func (e *StorageExecutor) evaluateInOp(node *storage.Node, variable, whereClause string) bool {
	upperClause := strings.ToUpper(whereClause)
	inIdx := strings.Index(upperClause, " IN ")
	if inIdx < 0 {
		return true
	}

	left := strings.TrimSpace(whereClause[:inIdx])
	right := strings.TrimSpace(whereClause[inIdx+4:])

	// Extract property
	if !strings.HasPrefix(left, variable+".") {
		return true
	}
	propName := left[len(variable)+1:]

	actualVal, exists := node.Properties[propName]
	if !exists {
		return false
	}

	// Parse list: [val1, val2, ...]
	if strings.HasPrefix(right, "[") && strings.HasSuffix(right, "]") {
		listContent := right[1 : len(right)-1]
		items := strings.Split(listContent, ",")
		for _, item := range items {
			itemVal := e.parseValue(strings.TrimSpace(item))
			if e.compareEqual(actualVal, itemVal) {
				return true
			}
		}
	}
	return false
}

// evaluateIsNull handles IS NULL / IS NOT NULL
func (e *StorageExecutor) evaluateIsNull(node *storage.Node, variable, whereClause string, expectNotNull bool) bool {
	upperClause := strings.ToUpper(whereClause)
	var propExpr string

	if expectNotNull {
		idx := strings.Index(upperClause, " IS NOT NULL")
		propExpr = strings.TrimSpace(whereClause[:idx])
	} else {
		idx := strings.Index(upperClause, " IS NULL")
		propExpr = strings.TrimSpace(whereClause[:idx])
	}

	// Extract property
	if !strings.HasPrefix(propExpr, variable+".") {
		return true
	}
	propName := propExpr[len(variable)+1:]

	_, exists := node.Properties[propName]

	if expectNotNull {
		return exists
	}
	return !exists
}

// toFloat64 attempts to convert a value to float64
func toFloat64(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case int32:
		return float64(val), true
	case string:
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

func (e *StorageExecutor) resolveReturnItem(item returnItem, variable string, node *storage.Node) interface{} {
	expr := item.expr

	// Handle aggregate functions
	upper := strings.ToUpper(expr)
	if strings.HasPrefix(upper, "COUNT(") {
		return 1 // Simplified - would need proper aggregation
	}

	// Handle property access: n.prop
	if strings.Contains(expr, ".") {
		parts := strings.SplitN(expr, ".", 2)
		if len(parts) == 2 && parts[0] == variable {
			propName := parts[1]
			if val, ok := node.Properties[propName]; ok {
				return val
			}
			// Check for built-in properties
			if propName == "id" {
				return string(node.ID)
			}
			return nil
		}
	}

	// Return whole node if variable matches
	if expr == variable || expr == "*" {
		return map[string]interface{}{
			"id":         string(node.ID),
			"labels":     node.Labels,
			"properties": node.Properties,
		}
	}

	return nil
}

func (e *StorageExecutor) generateID() string {
	// Simple ID generation - use UUID in production
	return fmt.Sprintf("node-%d", e.idCounter())
}

var idCounter int64

func (e *StorageExecutor) idCounter() int64 {
	idCounter++
	return idCounter
}
