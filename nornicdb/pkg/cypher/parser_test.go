// Package cypher tests for the Cypher parser and executor.
package cypher

import (
	"context"
	"testing"
)

func TestNewParser(t *testing.T) {
	parser := NewParser()
	if parser == nil {
		t.Error("NewParser() returned nil")
	}
}

func TestParseEmptyQuery(t *testing.T) {
	parser := NewParser()
	_, err := parser.Parse("")
	if err == nil {
		t.Error("expected error for empty query")
	}
}

func TestParseMatch(t *testing.T) {
	parser := NewParser()

	tests := []struct {
		name    string
		cypher  string
		wantErr bool
	}{
		{
			name:    "simple match",
			cypher:  "MATCH (n) RETURN n",
			wantErr: false,
		},
		{
			name:    "match with label",
			cypher:  "MATCH (n:Person) RETURN n",
			wantErr: false,
		},
		{
			name:    "match with relationship",
			cypher:  "MATCH (a)-[r]->(b) RETURN a, b",
			wantErr: false,
		},
		{
			name:    "optional match",
			cypher:  "OPTIONAL MATCH (n) RETURN n",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query, err := parser.Parse(tt.cypher)
			if (err != nil) != tt.wantErr {
				t.Errorf("Parse() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && query == nil {
				t.Error("expected query result")
			}
		})
	}
}

func TestParseCreate(t *testing.T) {
	parser := NewParser()

	tests := []struct {
		name    string
		cypher  string
		wantErr bool
	}{
		{
			name:    "simple create",
			cypher:  "CREATE (n)",
			wantErr: false,
		},
		{
			name:    "create with label",
			cypher:  "CREATE (n:Person)",
			wantErr: false,
		},
		{
			name:    "create with properties",
			cypher:  "CREATE (n:Person {name: 'Alice'})",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query, err := parser.Parse(tt.cypher)
			if (err != nil) != tt.wantErr {
				t.Errorf("Parse() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && query.Type != QueryCreate {
				t.Errorf("expected QueryCreate, got %v", query.Type)
			}
		})
	}
}

func TestParseReturn(t *testing.T) {
	parser := NewParser()

	query, err := parser.Parse("MATCH (n) RETURN n")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	hasReturn := false
	for _, clause := range query.Clauses {
		if _, ok := clause.(*ReturnClause); ok {
			hasReturn = true
			break
		}
	}

	if !hasReturn {
		t.Error("expected RETURN clause")
	}
}

func TestParseWhere(t *testing.T) {
	parser := NewParser()

	query, err := parser.Parse("MATCH (n) WHERE n.name = 'Alice' RETURN n")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	hasWhere := false
	for _, clause := range query.Clauses {
		if _, ok := clause.(*WhereClause); ok {
			hasWhere = true
			break
		}
	}

	if !hasWhere {
		t.Error("expected WHERE clause")
	}
}

func TestParseSet(t *testing.T) {
	parser := NewParser()

	query, err := parser.Parse("MATCH (n) SET n.name = 'Bob' RETURN n")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	if query.Type != QuerySet {
		t.Errorf("expected QuerySet, got %v", query.Type)
	}
}

func TestParseDelete(t *testing.T) {
	parser := NewParser()

	t.Run("simple delete", func(t *testing.T) {
		query, err := parser.Parse("MATCH (n) DELETE n")
		if err != nil {
			t.Fatalf("Parse() error = %v", err)
		}
		if query.Type != QueryDelete {
			t.Errorf("expected QueryDelete, got %v", query.Type)
		}
	})

	t.Run("detach delete", func(t *testing.T) {
		query, err := parser.Parse("MATCH (n) DETACH DELETE n")
		if err != nil {
			t.Fatalf("Parse() error = %v", err)
		}
		if query.Type != QueryDelete {
			t.Errorf("expected QueryDelete, got %v", query.Type)
		}

		hasDetachDelete := false
		for _, clause := range query.Clauses {
			if dc, ok := clause.(*DeleteClause); ok && dc.Detach {
				hasDetachDelete = true
				break
			}
		}
		if !hasDetachDelete {
			t.Error("expected DETACH DELETE clause")
		}
	})
}

func TestTokenize(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "simple query",
			input:    "MATCH (n)",
			expected: []string{"MATCH", "(", "n", ")"},
		},
		{
			name:     "with label",
			input:    "MATCH (n:Person)",
			expected: []string{"MATCH", "(", "n", ":", "Person", ")"},
		},
		{
			name:     "with string",
			input:    "CREATE (n {name: 'Alice'})",
			expected: []string{"CREATE", "(", "n", "{", "name", ":", "'Alice'", "}", ")"},
		},
		{
			name:     "with relationship",
			input:    "MATCH (a)-[r]->(b)",
			expected: []string{"MATCH", "(", "a", ")", "-", "[", "r", "]", "-", ">", "(", "b", ")"},
		},
		{
			name:     "whitespace handling",
			input:    "MATCH   (n)  RETURN n",
			expected: []string{"MATCH", "(", "n", ")", "RETURN", "n"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens := tokenize(tt.input)
			if len(tokens) != len(tt.expected) {
				t.Errorf("expected %d tokens, got %d: %v", len(tt.expected), len(tokens), tokens)
				return
			}
			for i, tok := range tokens {
				if tok != tt.expected[i] {
					t.Errorf("token %d: expected %q, got %q", i, tt.expected[i], tok)
				}
			}
		})
	}
}

func TestQueryTypes(t *testing.T) {
	types := []QueryType{
		QueryMatch,
		QueryCreate,
		QueryMerge,
		QueryDelete,
		QuerySet,
		QueryReturn,
		QueryWith,
	}

	for i, qt := range types {
		if int(qt) != i {
			t.Errorf("QueryType %d has unexpected value %d", i, qt)
		}
	}
}

func TestEdgeDirection(t *testing.T) {
	tests := []struct {
		dir      EdgeDirection
		expected int
	}{
		{EdgeBoth, 0},
		{EdgeOutgoing, 1},
		{EdgeIncoming, 2},
	}

	for _, tt := range tests {
		if int(tt.dir) != tt.expected {
			t.Errorf("expected %d, got %d", tt.expected, tt.dir)
		}
	}
}

func TestClauseMarkers(t *testing.T) {
	// Test that all clause types implement Clause interface
	clauses := []Clause{
		&MatchClause{},
		&CreateClause{},
		&ReturnClause{},
		&WhereClause{},
		&SetClause{},
		&DeleteClause{},
	}

	for _, c := range clauses {
		c.clauseMarker() // Should not panic
	}
}

func TestExpressionMarkers(t *testing.T) {
	// Test that all expression types implement Expression interface
	exprs := []Expression{
		&PropertyAccess{},
		&Comparison{},
		&Literal{},
		&Parameter{},
		&FunctionCall{},
	}

	for _, e := range exprs {
		e.exprMarker() // Should not panic
	}
}

func TestNodePattern(t *testing.T) {
	np := NodePattern{
		Variable:   "n",
		Labels:     []string{"Person", "Employee"},
		Properties: map[string]any{"name": "Alice"},
	}

	if np.Variable != "n" {
		t.Error("wrong variable")
	}
	if len(np.Labels) != 2 {
		t.Error("expected 2 labels")
	}
	if np.Properties["name"] != "Alice" {
		t.Error("wrong property value")
	}
}

func TestEdgePattern(t *testing.T) {
	minHops := 1
	maxHops := 3
	ep := EdgePattern{
		Variable:   "r",
		Type:       "KNOWS",
		Direction:  EdgeOutgoing,
		Properties: map[string]any{"since": 2020},
		MinHops:    &minHops,
		MaxHops:    &maxHops,
	}

	if ep.Variable != "r" {
		t.Error("wrong variable")
	}
	if ep.Direction != EdgeOutgoing {
		t.Error("wrong direction")
	}
	if *ep.MinHops != 1 || *ep.MaxHops != 3 {
		t.Error("wrong hops")
	}
}

func TestReturnItem(t *testing.T) {
	ri := ReturnItem{
		Expression: &PropertyAccess{Variable: "n", Property: "name"},
		Alias:      "personName",
	}

	if ri.Alias != "personName" {
		t.Error("wrong alias")
	}
}

func TestOrderItem(t *testing.T) {
	oi := OrderItem{
		Expression: &PropertyAccess{Variable: "n", Property: "age"},
		Descending: true,
	}

	if !oi.Descending {
		t.Error("expected descending")
	}
}

func TestSetItem(t *testing.T) {
	si := SetItem{
		Variable: "n",
		Property: "name",
		Value:    &Literal{Value: "Bob"},
	}

	if si.Variable != "n" || si.Property != "name" {
		t.Error("wrong set item")
	}
}

func TestNewExecutor(t *testing.T) {
	executor := NewExecutor()
	if executor == nil {
		t.Error("NewExecutor() returned nil")
	}
	if executor.parser == nil {
		t.Error("executor should have parser")
	}
}

func TestExecutorExecute(t *testing.T) {
	executor := NewExecutor()
	ctx := context.Background()

	t.Run("simple match", func(t *testing.T) {
		result, err := executor.Execute(ctx, "MATCH (n) RETURN n", nil)
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if result == nil {
			t.Error("expected result")
		}
	})

	t.Run("with parameters", func(t *testing.T) {
		params := map[string]any{
			"name": "Alice",
		}
		result, err := executor.Execute(ctx, "MATCH (n {name: $name}) RETURN n", params)
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if result == nil {
			t.Error("expected result")
		}
	})

	t.Run("invalid query", func(t *testing.T) {
		_, err := executor.Execute(ctx, "", nil)
		if err == nil {
			t.Error("expected error for empty query")
		}
	})
}

func TestResult(t *testing.T) {
	result := &Result{
		Columns: []string{"name", "age"},
		Rows: []map[string]any{
			{"name": "Alice", "age": 30},
			{"name": "Bob", "age": 25},
		},
	}

	if result.RowCount() != 2 {
		t.Errorf("expected 2 rows, got %d", result.RowCount())
	}

	if len(result.Columns) != 2 {
		t.Errorf("expected 2 columns, got %d", len(result.Columns))
	}
}

func TestPropertyAccess(t *testing.T) {
	pa := &PropertyAccess{
		Variable: "n",
		Property: "name",
	}

	if pa.Variable != "n" {
		t.Error("wrong variable")
	}
	if pa.Property != "name" {
		t.Error("wrong property")
	}
}

func TestComparison(t *testing.T) {
	comp := &Comparison{
		Left:     &PropertyAccess{Variable: "n", Property: "age"},
		Operator: ">=",
		Right:    &Literal{Value: 18},
	}

	if comp.Operator != ">=" {
		t.Error("wrong operator")
	}
}

func TestLiteral(t *testing.T) {
	tests := []struct {
		name  string
		value any
	}{
		{"string", "hello"},
		{"int", 42},
		{"float", 3.14},
		{"bool", true},
		{"nil", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lit := &Literal{Value: tt.value}
			if lit.Value != tt.value {
				t.Errorf("expected %v, got %v", tt.value, lit.Value)
			}
		})
	}
}

func TestParameter(t *testing.T) {
	param := &Parameter{Name: "userId"}
	if param.Name != "userId" {
		t.Error("wrong parameter name")
	}
}

func TestFunctionCall(t *testing.T) {
	fc := &FunctionCall{
		Name: "count",
		Args: []Expression{
			&PropertyAccess{Variable: "n", Property: "id"},
		},
	}

	if fc.Name != "count" {
		t.Error("wrong function name")
	}
	if len(fc.Args) != 1 {
		t.Error("expected 1 argument")
	}
}

func TestPattern(t *testing.T) {
	pattern := Pattern{
		Nodes: []NodePattern{
			{Variable: "a", Labels: []string{"Person"}},
			{Variable: "b", Labels: []string{"Person"}},
		},
		Edges: []EdgePattern{
			{Variable: "r", Type: "KNOWS", Direction: EdgeOutgoing},
		},
	}

	if len(pattern.Nodes) != 2 {
		t.Error("expected 2 nodes")
	}
	if len(pattern.Edges) != 1 {
		t.Error("expected 1 edge")
	}
}

func TestQuery(t *testing.T) {
	query := &Query{
		Type: QueryMatch,
		Clauses: []Clause{
			&MatchClause{},
			&ReturnClause{},
		},
		Parameters: map[string]any{
			"name": "Alice",
		},
	}

	if query.Type != QueryMatch {
		t.Error("wrong query type")
	}
	if len(query.Clauses) != 2 {
		t.Error("expected 2 clauses")
	}
	if query.Parameters["name"] != "Alice" {
		t.Error("wrong parameter")
	}
}
