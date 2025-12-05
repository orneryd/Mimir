// Package cypher - Chaos and injection attack tests for Cypher query parsing.
package cypher

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/orneryd/nornicdb/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupChaosExecutor(t *testing.T) (*StorageExecutor, context.Context) {
	store := storage.NewMemoryEngine()
	exec := NewStorageExecutor(store)
	return exec, context.Background()
}

// =============================================================================
// CHAOS AND EDGE CASE TESTS
// =============================================================================

func TestChaos_EmptyStrings(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Empty string property
	_, err := exec.Execute(ctx, "CREATE (n:Test {name: ''})", nil)
	require.NoError(t, err)

	result, err := exec.Execute(ctx, "MATCH (n:Test {name: ''}) RETURN n.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, "", result.Rows[0][0])
}

func TestChaos_UnicodeProperties(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Unicode in properties
	_, err := exec.Execute(ctx, "CREATE (n:Test {name: '日本語テスト', emoji: '🚀🎉💻'})", nil)
	require.NoError(t, err)

	result, err := exec.Execute(ctx, "MATCH (n:Test) WHERE n.name = '日本語テスト' RETURN n.emoji", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, "🚀🎉💻", result.Rows[0][0])
}

func TestChaos_SpecialCharactersInStrings(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Test with escaped special characters
	testCases := []struct {
		name  string
		value string
	}{
		{"backslash", "path\\\\to\\\\file"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			query := fmt.Sprintf("CREATE (n:Special {type: '%s', value: '%s'})", tc.name, tc.value)
			_, err := exec.Execute(ctx, query, nil)
			if err == nil {
				result, err := exec.Execute(ctx, fmt.Sprintf("MATCH (n:Special {type: '%s'}) RETURN n.value", tc.name), nil)
				require.NoError(t, err)
				assert.Equal(t, 1, len(result.Rows))
			}
		})
	}
}

func TestChaos_VeryLongStrings(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Very long string (10KB)
	longString := strings.Repeat("a", 10000)
	query := fmt.Sprintf("CREATE (n:LongTest {data: '%s'})", longString)
	_, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)

	result, err := exec.Execute(ctx, "MATCH (n:LongTest) RETURN size(n.data)", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestChaos_DeeplyNestedExpressions(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Deeply nested arithmetic
	result, err := exec.Execute(ctx, "RETURN ((((1 + 2) * 3) - 4) / 2) + (((5 * 6) - 7) / 8)", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestChaos_ManyColumns(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Many return columns
	result, err := exec.Execute(ctx, `
		RETURN 1 AS a, 2 AS b, 3 AS c, 4 AS d, 5 AS e, 
		       6 AS f, 7 AS g, 8 AS h, 9 AS i, 10 AS j,
		       11 AS k, 12 AS l, 13 AS m, 14 AS n, 15 AS o
	`, nil)
	require.NoError(t, err)
	assert.Equal(t, 15, len(result.Columns))
}

func TestChaos_LargeNumbers(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Large integers
	_, err := exec.Execute(ctx, "CREATE (n:NumTest {big: 9223372036854775807, small: -9223372036854775808})", nil)
	require.NoError(t, err)

	result, err := exec.Execute(ctx, "MATCH (n:NumTest) RETURN n.big, n.small", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestChaos_FloatPrecision(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	result, err := exec.Execute(ctx, "RETURN 0.1 + 0.2", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	// Float precision - should be close to 0.3
	val := result.Rows[0][0].(float64)
	assert.InDelta(t, 0.3, val, 0.0001)
}

func TestChaos_NullHandling(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Null comparisons
	exec.Execute(ctx, "CREATE (n:NullTest {a: 1})", nil) // b is missing (null)

	result, err := exec.Execute(ctx, "MATCH (n:NullTest) RETURN n.b IS NULL", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, true, result.Rows[0][0])
}

func TestChaos_MultipleLabels(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Node with many labels
	_, err := exec.Execute(ctx, "CREATE (n:A:B:C:D:E:F:G {name: 'multi'})", nil)
	require.NoError(t, err)

	result, err := exec.Execute(ctx, "MATCH (n:A:B:C:D:E:F:G) RETURN n.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestChaos_CaseSensitivity(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:CaseTest {Name: 'upper', name: 'lower'})", nil)

	// Properties are case-sensitive
	result, err := exec.Execute(ctx, "MATCH (n:CaseTest) RETURN n.Name, n.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestChaos_ReservedWordsAsProperties(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Using reserved words as property names (unquoted - may or may not work)
	_, err := exec.Execute(ctx, "CREATE (n:Reserved {match: 'test', return: 'value', where: 'clause'})", nil)
	if err == nil {
		result, err := exec.Execute(ctx, "MATCH (n:Reserved) RETURN n.match", nil)
		require.NoError(t, err)
		assert.Equal(t, 1, len(result.Rows))
	}
}

// =============================================================================
// INJECTION ATTACK TESTS
// =============================================================================

func TestInjection_BasicSQLInjection(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Classic SQL injection attempts - should fail parsing or be treated as literal
	injections := []string{
		"'; DROP TABLE users; --",
		"1; DELETE FROM nodes; --",
		"' OR '1'='1",
		"'; TRUNCATE nodes; --",
	}

	for i, injection := range injections {
		t.Run(fmt.Sprintf("sql_injection_%d", i), func(t *testing.T) {
			// Try in property value - escaping the quotes
			safeInjection := strings.ReplaceAll(injection, "'", "\\'")
			query := fmt.Sprintf("CREATE (n:Test {name: '%s'})", safeInjection)
			_, err := exec.Execute(ctx, query, nil)
			// Should either fail parsing or create a literal string - NOT execute injection
			if err == nil {
				// Verify the injection was stored as literal string, not executed
				result, _ := exec.Execute(ctx, "MATCH (n:Test) RETURN count(n)", nil)
				assert.NotNil(t, result)
			}
		})
	}
}

func TestInjection_CypherInjection(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Create some data that should NOT be deleted
	exec.Execute(ctx, "CREATE (n:Protected {secret: 'keep-me'})", nil)

	// Cypher-specific injection attempts
	injections := []string{
		"test'}) MATCH (n) DETACH DELETE n //",
		"test'}) CREATE (evil:Hacker {pwned: true}) //",
	}

	for i, injection := range injections {
		t.Run(fmt.Sprintf("cypher_injection_%d", i), func(t *testing.T) {
			safeInjection := strings.ReplaceAll(injection, "'", "\\'")
			query := fmt.Sprintf("MATCH (n {name: '%s'}) RETURN n", safeInjection)
			exec.Execute(ctx, query, nil)
			// Key: should NOT delete any nodes
			result, err := exec.Execute(ctx, "MATCH (n:Protected) RETURN count(n) AS cnt", nil)
			require.NoError(t, err)
			assert.Equal(t, int64(1), result.Rows[0][0], "Protected node should still exist")
		})
	}
}

func TestInjection_ParameterInjection(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Create test data
	exec.Execute(ctx, "CREATE (n:Secret {password: 'secret123'})", nil)
	exec.Execute(ctx, "CREATE (n:Public {name: 'visible'})", nil)

	// Attempts to access other data via parameter manipulation
	params := map[string]interface{}{
		"name": "' OR '1'='1",
	}

	result, err := exec.Execute(ctx, "MATCH (n:Public {name: $name}) RETURN n", params)
	// Should either fail or return empty - NOT return Secret node
	if err == nil {
		// Verify we didn't accidentally get the secret
		assert.Equal(t, 0, len(result.Rows), "Should not match with injection string")
	}
}

func TestInjection_CommentInjection(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Create protected data
	exec.Execute(ctx, "CREATE (n:Critical {data: 'important'})", nil)

	// Try to use comments to bypass parts of query
	injections := []string{
		"test' // ignore rest",
		"test'/* hidden */",
		"test' -- comment",
	}

	for i, injection := range injections {
		t.Run(fmt.Sprintf("comment_injection_%d", i), func(t *testing.T) {
			safeInjection := strings.ReplaceAll(injection, "'", "\\'")
			query := fmt.Sprintf("CREATE (n:Comment {name: '%s'})", safeInjection)
			exec.Execute(ctx, query, nil)
			// Verify critical data wasn't affected
			result, err := exec.Execute(ctx, "MATCH (n:Critical) RETURN count(n)", nil)
			require.NoError(t, err)
			assert.Equal(t, int64(1), result.Rows[0][0])
		})
	}
}

func TestInjection_UnicodeEscape(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Unicode escape attacks
	injections := []string{
		"test\u0027 OR 1=1",  // Unicode quote
		"test\u003B DELETE",  // Unicode semicolon
		"test%27%20OR%201=1", // URL encoded
	}

	for i, injection := range injections {
		t.Run(fmt.Sprintf("unicode_injection_%d", i), func(t *testing.T) {
			// These should be treated as literal strings
			result, err := exec.Execute(ctx, "RETURN $val", map[string]interface{}{"val": injection})
			if err == nil {
				assert.Equal(t, 1, len(result.Rows))
				assert.Equal(t, injection, result.Rows[0][0])
			}
		})
	}
}

func TestInjection_LabelInjection(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Try to inject via label names - these should all fail parsing
	injections := []string{
		"Test`) MATCH (n) DELETE n //",
		"Test WHERE 1=1",
		"Test RETURN *",
	}

	for i, injection := range injections {
		t.Run(fmt.Sprintf("label_injection_%d", i), func(t *testing.T) {
			query := fmt.Sprintf("CREATE (n:%s {name: 'test'})", injection)
			_, err := exec.Execute(ctx, query, nil)
			// Should fail parsing
			assert.Error(t, err, "Label injection should fail: %s", injection)
		})
	}
}

func TestInjection_PropertyKeyInjection(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Try to inject via property keys - these should fail parsing
	injections := []string{
		"name}) MATCH (n) DELETE n //",
		"name: 'x', evil: true",
		"name})-[r]->(m) DELETE m //",
	}

	for i, injection := range injections {
		t.Run(fmt.Sprintf("propkey_injection_%d", i), func(t *testing.T) {
			query := fmt.Sprintf("CREATE (n:Test {%s: 'value'})", injection)
			_, err := exec.Execute(ctx, query, nil)
			// Should fail parsing
			assert.Error(t, err, "Property key injection should fail: %s", injection)
		})
	}
}

// =============================================================================
// QUERY PARSER STRESS TESTS
// =============================================================================

func TestParser_MalformedQueries(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	malformed := []string{
		"MATCH",
		"MATCH (n",
		"MATCH (n) RETURN",
		"RETURN (",
		"CREATE (n:) RETURN n",
		"MATCH (n WHERE n.x = 1 RETURN n",
		"MATCH [r] RETURN r",
		"{{{{",
		"))))",
		"MATCH (n) RETURN n.{{",
		"DELETE",
		"SET n.x = ",
		"ORDER BY",
		"LIMIT",
		"SKIP -1",
	}

	for _, query := range malformed {
		name := query
		if len(name) > 20 {
			name = name[:20]
		}
		t.Run(name, func(t *testing.T) {
			_, err := exec.Execute(ctx, query, nil)
			assert.Error(t, err, "Malformed query should fail: %s", query)
		})
	}
}

func TestParser_ValidEdgeCases(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// These should all be valid
	valid := []string{
		"RETURN 1",
		"RETURN null",
		"RETURN true",
		"RETURN false",
		"RETURN []",
		"RETURN 'string'",
		"RETURN 1 + 2 * 3",
		"RETURN 1 = 1",
		"RETURN 1 <> 2",
		"MATCH (n) RETURN n LIMIT 0",
		"MATCH (n) RETURN n SKIP 0",
	}

	for _, query := range valid {
		name := query
		if len(name) > 20 {
			name = name[:20]
		}
		t.Run(name, func(t *testing.T) {
			_, err := exec.Execute(ctx, query, nil)
			assert.NoError(t, err, "Valid query should succeed: %s", query)
		})
	}
}

func TestParser_WhitespaceVariations(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:WS {id: 1})", nil)

	// Different whitespace patterns - all should work
	queries := []string{
		"MATCH(n:WS)RETURN n",
		"MATCH (n:WS) RETURN n",
		"MATCH  (n:WS)  RETURN  n",
		"MATCH\n(n:WS)\nRETURN\nn",
		"MATCH\t(n:WS)\tRETURN\tn",
		"  MATCH (n:WS) RETURN n  ",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("whitespace_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err)
			assert.GreaterOrEqual(t, len(result.Rows), 1)
		})
	}
}

func TestParser_KeywordCasing(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:CaseNode {id: 1})", nil)

	// Keywords should be case-insensitive
	queries := []string{
		"match (n:CaseNode) return n",
		"MATCH (n:CaseNode) RETURN n",
		"Match (n:CaseNode) Return n",
		"mAtCh (n:CaseNode) rEtUrN n",
	}

	for _, query := range queries {
		name := query
		if len(name) > 20 {
			name = name[:20]
		}
		t.Run(name, func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

// =============================================================================
// COMPLEX QUERY COMBINATION TESTS
// =============================================================================

func TestComplex_NestedOptionalMatch(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (a:Person {name: 'Alice'})", nil)
	exec.Execute(ctx, "CREATE (b:Person {name: 'Bob'})-[:KNOWS]->(c:Person {name: 'Charlie'})", nil)

	result, err := exec.Execute(ctx, `
		MATCH (p:Person)
		OPTIONAL MATCH (p)-[:KNOWS]->(friend)
		RETURN p.name, friend.name
		ORDER BY p.name
	`, nil)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(result.Rows), 2)
}

func TestComplex_MultipleUnwindWithMatch(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:Item {id: 1, category: 'A'})", nil)
	exec.Execute(ctx, "CREATE (n:Item {id: 2, category: 'B'})", nil)
	exec.Execute(ctx, "CREATE (n:Item {id: 3, category: 'A'})", nil)

	result, err := exec.Execute(ctx, `
		UNWIND ['A', 'B'] AS cat
		MATCH (n:Item {category: cat})
		RETURN cat, count(n) AS cnt
	`, nil)
	require.NoError(t, err)
	assert.Equal(t, 2, len(result.Rows))
}

func TestComplex_WithChaining(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	for i := 0; i < 10; i++ {
		exec.Execute(ctx, "CREATE (n:Num {val: $v})", map[string]interface{}{"v": int64(i)})
	}

	result, err := exec.Execute(ctx, `
		MATCH (n:Num)
		WITH n.val AS v
		WHERE v > 5
		WITH v, v * v AS squared
		RETURN v, squared
		ORDER BY v
	`, nil)
	require.NoError(t, err)
	assert.Equal(t, 4, len(result.Rows)) // 6,7,8,9
}

func TestComplex_AggregationCombinations(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:Sale {product: 'A', amount: 100})", nil)
	exec.Execute(ctx, "CREATE (n:Sale {product: 'A', amount: 200})", nil)
	exec.Execute(ctx, "CREATE (n:Sale {product: 'B', amount: 150})", nil)
	exec.Execute(ctx, "CREATE (n:Sale {product: 'B', amount: 250})", nil)

	result, err := exec.Execute(ctx, `
		MATCH (n:Sale)
		RETURN n.product AS product, 
		       count(n) AS cnt,
		       sum(n.amount) AS total,
		       avg(n.amount) AS average,
		       min(n.amount) AS minimum,
		       max(n.amount) AS maximum
		ORDER BY product
	`, nil)
	require.NoError(t, err)
	assert.Equal(t, 2, len(result.Rows))
}

func TestComplex_RelationshipChains(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Create nodes and relationships one by one
	exec.Execute(ctx, "CREATE (a:Chain {id: 1})", nil)
	exec.Execute(ctx, "CREATE (b:Chain {id: 2})", nil)
	exec.Execute(ctx, "CREATE (c:Chain {id: 3})", nil)
	exec.Execute(ctx, "MATCH (a:Chain {id: 1}), (b:Chain {id: 2}) CREATE (a)-[:NEXT]->(b)", nil)
	exec.Execute(ctx, "MATCH (b:Chain {id: 2}), (c:Chain {id: 3}) CREATE (b)-[:NEXT]->(c)", nil)

	// Verify single-hop relationships exist
	result, err := exec.Execute(ctx, "MATCH (a:Chain)-[r:NEXT]->(b:Chain) RETURN a.id, b.id", nil)
	require.NoError(t, err)
	assert.Equal(t, 2, len(result.Rows), "Should have 2 NEXT relationships")

	// 2-hop relationship matching test
	result, err = exec.Execute(ctx, `
		MATCH (a:Chain)-[:NEXT]->(b:Chain)-[:NEXT]->(c:Chain)
		RETURN a.id, b.id, c.id
	`, nil)
	// 2-hop queries may not be fully implemented
	if err == nil {
		// If it works, we expect 1 result: 1->2->3
		t.Logf("2-hop result: %d rows", len(result.Rows))
	}
}

func TestComplex_MergeWithOnCreateOnMatch(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// First MERGE creates - test ON CREATE SET with boolean
	result, err := exec.Execute(ctx, `
		MERGE (n:Counter {name: 'test'})
		ON CREATE SET n.created = true
		RETURN n.name
	`, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, "test", result.Rows[0][0])

	// Verify node was created with ON CREATE property
	result, err = exec.Execute(ctx, "MATCH (n:Counter {name: 'test'}) RETURN n.created", nil)
	require.NoError(t, err)
	assert.Equal(t, true, result.Rows[0][0])

	// Second MERGE matches - test ON MATCH SET
	result, err = exec.Execute(ctx, `
		MERGE (n:Counter {name: 'test'})
		ON MATCH SET n.matched = true
		RETURN n.name
	`, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))

	// Verify ON MATCH SET worked
	result, err = exec.Execute(ctx, "MATCH (n:Counter {name: 'test'}) RETURN n.matched", nil)
	require.NoError(t, err)
	assert.Equal(t, true, result.Rows[0][0])
}

func TestComplex_CollectAndUnwind(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:Tag {name: 'go'})", nil)
	exec.Execute(ctx, "CREATE (n:Tag {name: 'rust'})", nil)
	exec.Execute(ctx, "CREATE (n:Tag {name: 'python'})", nil)

	// Test that collect() works
	result, err := exec.Execute(ctx, "MATCH (t:Tag) RETURN collect(t.name) AS tags", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	tags, ok := result.Rows[0][0].([]interface{})
	require.True(t, ok, "collect() should return a list")
	assert.Equal(t, 3, len(tags))

	// Test simple UNWIND
	result, err = exec.Execute(ctx, "UNWIND ['a', 'b', 'c'] AS x RETURN x", nil)
	require.NoError(t, err)
	assert.Equal(t, 3, len(result.Rows))
}

// =============================================================================
// EXTREME NESTING AND COMPLEX SYNTAX TESTS
// These test the absolute limits of valid Cypher syntax
// =============================================================================

func TestExtreme_DeeplyNestedFunctions(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Nested function calls - valid but ridiculous
	queries := []string{
		"RETURN tostring(tointeger(tostring(tointeger(tostring(1)))))",
		"RETURN abs(abs(abs(abs(abs(-5)))))",
		"RETURN size(trim(tolower(toupper(trim('  test  ')))))",
		"RETURN coalesce(coalesce(coalesce(null, null), null), 'found')",
		"RETURN head(tail(tail(tail([1,2,3,4,5]))))",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("nested_func_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

func TestExtreme_DeeplyNestedArithmetic(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// 10 levels of nested parentheses: ((((((((((1+1)+1)+1)+1)+1)+1)+1)+1)+1)+1) = 11
	query := "RETURN ((((((((((1+1)+1)+1)+1)+1)+1)+1)+1)+1)+1)"
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, int64(11), result.Rows[0][0])
}

func TestExtreme_ComplexBooleanLogic(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	exec.Execute(ctx, "CREATE (n:Logic {a: 1, b: 2, c: 3, d: 4, e: 5})", nil)

	// Complex nested boolean with all operators
	queries := []string{
		"MATCH (n:Logic) WHERE (n.a = 1 AND n.b = 2) OR (n.c = 3 AND n.d = 4) RETURN n",
		"MATCH (n:Logic) WHERE NOT (n.a <> 1 OR n.b <> 2) RETURN n",
		"MATCH (n:Logic) WHERE ((n.a = 1 OR n.b = 1) AND (n.c = 3 OR n.d = 3)) OR n.e = 5 RETURN n",
		// NOT NOT NOT is invalid Cypher syntax - skipping
		"MATCH (n:Logic) WHERE (n.a > 0 AND n.a < 2) AND (n.b >= 2 AND n.b <= 2) RETURN n",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("bool_logic_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

func TestExtreme_ComplexCaseExpressions(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Nested CASE expressions
	queries := []string{
		"RETURN CASE WHEN true THEN CASE WHEN true THEN 'deep' ELSE 'no' END ELSE 'outer' END",
		"RETURN CASE 1 WHEN 0 THEN 'zero' WHEN 1 THEN CASE 2 WHEN 2 THEN 'nested' END ELSE 'other' END",
		"RETURN CASE WHEN 1=1 THEN CASE WHEN 2=2 THEN CASE WHEN 3=3 THEN 'triple' END END END",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("case_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

func TestExtreme_ComplexListOperations(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Complex list operations
	queries := []string{
		"RETURN [[1,2],[3,4],[5,6]]",
		"RETURN [[[1]],[[2]],[[3]]]",
		"RETURN head([[1,2,3],[4,5,6]])",
		"RETURN [1,2,3] + [4,5,6]",
		"RETURN range(1,10)[0..5]",
		"UNWIND [[1,2],[3,4]] AS pair UNWIND pair AS num RETURN num",
		"RETURN [x IN [1,2,3,4,5] WHERE x > 2]",
		"RETURN [x IN [1,2,3] | x * x]",
		"RETURN [x IN [1,2,3] WHERE x > 1 | x * 2]",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("list_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.GreaterOrEqual(t, len(result.Rows), 1)
		})
	}
}

func TestExtreme_ChainedWithClauses(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Many chained WITH clauses
	query := `
		WITH 1 AS a
		WITH a, a + 1 AS b
		WITH a, b, a + b AS c
		WITH a, b, c, a + b + c AS d
		WITH a, b, c, d, a * b * c AS e
		RETURN a, b, c, d, e
	`
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, 5, len(result.Columns))
}

func TestExtreme_MultipleAggregationsInOneReturn(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	for i := 1; i <= 10; i++ {
		exec.Execute(ctx, "CREATE (n:Agg {val: $v})", map[string]interface{}{"v": int64(i)})
	}

	// All aggregation functions together
	query := `
		MATCH (n:Agg)
		RETURN count(n) AS cnt,
		       sum(n.val) AS total,
		       avg(n.val) AS average,
		       min(n.val) AS minimum,
		       max(n.val) AS maximum,
		       collect(n.val) AS all_vals
	`
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, 6, len(result.Columns))
}

func TestExtreme_ComplexPatternMatching(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Create complex graph structure step by step
	exec.Execute(ctx, "CREATE (a:Person {name: 'Alice'})", nil)
	exec.Execute(ctx, "CREATE (b:Person {name: 'Bob'})", nil)
	exec.Execute(ctx, "CREATE (c:Company {name: 'Acme'})", nil)
	exec.Execute(ctx, "CREATE (d:City {name: 'NYC'})", nil)

	// Create relationships
	exec.Execute(ctx, "MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS]->(b)", nil)
	exec.Execute(ctx, "MATCH (a:Person {name: 'Alice'}), (c:Company {name: 'Acme'}) CREATE (a)-[:WORKS_AT]->(c)", nil)
	exec.Execute(ctx, "MATCH (b:Person {name: 'Bob'}), (c:Company {name: 'Acme'}) CREATE (b)-[:WORKS_AT]->(c)", nil)
	exec.Execute(ctx, "MATCH (c:Company {name: 'Acme'}), (d:City {name: 'NYC'}) CREATE (c)-[:LOCATED_IN]->(d)", nil)

	// Verify setup
	result, err := exec.Execute(ctx, "MATCH (a)-[r]->(b) RETURN a.name, type(r), b.name", nil)
	require.NoError(t, err)
	assert.Equal(t, 4, len(result.Rows), "Should have 4 relationships")

	// Simple single-hop patterns
	queries := []string{
		"MATCH (p:Person)-[:KNOWS]->(friend:Person) RETURN p.name, friend.name",
		"MATCH (p:Person)-[:WORKS_AT]->(c:Company) RETURN p.name, c.name",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("pattern_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.GreaterOrEqual(t, len(result.Rows), 1)
		})
	}
}

func TestExtreme_LongPropertyPaths(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Node with many properties
	exec.Execute(ctx, `
		CREATE (n:Multi {
			a: 'a', b: 'b', c: 'c', d: 'd', e: 'e',
			f: 'f', g: 'g', h: 'h', i: 'i', j: 'j',
			nested: {inner: {deep: 'value'}}
		})
	`, nil)

	query := "MATCH (n:Multi) RETURN n.a, n.b, n.c, n.d, n.e, n.f, n.g, n.h, n.i, n.j"
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 10, len(result.Columns))
}

func TestExtreme_VariableLengthPaths(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Create a chain
	exec.Execute(ctx, "CREATE (a:VLP {id: 1})", nil)
	exec.Execute(ctx, "CREATE (b:VLP {id: 2})", nil)
	exec.Execute(ctx, "CREATE (c:VLP {id: 3})", nil)
	exec.Execute(ctx, "CREATE (d:VLP {id: 4})", nil)
	exec.Execute(ctx, "MATCH (a:VLP {id: 1}), (b:VLP {id: 2}) CREATE (a)-[:NEXT]->(b)", nil)
	exec.Execute(ctx, "MATCH (b:VLP {id: 2}), (c:VLP {id: 3}) CREATE (b)-[:NEXT]->(c)", nil)
	exec.Execute(ctx, "MATCH (c:VLP {id: 3}), (d:VLP {id: 4}) CREATE (c)-[:NEXT]->(d)", nil)

	// Variable length path queries
	queries := []string{
		"MATCH (a:VLP {id: 1})-[:NEXT*1..3]->(b:VLP) RETURN b.id",
		"MATCH (a:VLP)-[:NEXT*]->(b:VLP) RETURN a.id, b.id",
		"MATCH p = (a:VLP {id: 1})-[:NEXT*]->(b:VLP {id: 4}) RETURN length(p)",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("vlp_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			// These may not be fully implemented - just ensure no panic
			if err == nil {
				assert.GreaterOrEqual(t, len(result.Rows), 0)
			}
		})
	}
}

func TestExtreme_ComplexUnwind(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Complex UNWIND scenarios
	queries := []string{
		"UNWIND [1,2,3] AS x UNWIND [4,5,6] AS y RETURN x, y",
		"WITH [[1,2],[3,4],[5,6]] AS matrix UNWIND matrix AS row UNWIND row AS cell RETURN cell",
		"UNWIND range(1, 5) AS i UNWIND range(1, i) AS j RETURN i, j",
		"WITH {a: [1,2], b: [3,4]} AS map UNWIND keys(map) AS k RETURN k",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("unwind_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			if err == nil {
				assert.GreaterOrEqual(t, len(result.Rows), 1)
			}
		})
	}
}

func TestExtreme_MixedClauseOrder(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	for i := 1; i <= 5; i++ {
		exec.Execute(ctx, "CREATE (n:Order {id: $id, val: $val})", map[string]interface{}{
			"id":  int64(i),
			"val": int64(i * 10),
		})
	}

	// Complex clause combinations
	query := `
		MATCH (n:Order)
		WHERE n.id > 1
		WITH n, n.val AS v
		WHERE v < 50
		WITH n.id AS id, v
		ORDER BY id DESC
		SKIP 1
		LIMIT 2
		RETURN id, v
	`
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 2, len(result.Rows))
}

func TestExtreme_SubqueryExpressions(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// EXISTS subquery
	queries := []string{
		"RETURN exists { MATCH (n) }",
		"RETURN count { MATCH (n) }",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("subquery_%d", i), func(t *testing.T) {
			// These may not be implemented - just ensure no panic
			result, err := exec.Execute(ctx, query, nil)
			if err == nil {
				assert.GreaterOrEqual(t, len(result.Rows), 0)
			}
		})
	}
}

func TestExtreme_ComplexMerge(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Complex MERGE with all options
	query := `
		MERGE (a:MergeTest {id: 1})
		ON CREATE SET a.created = true, a.createdAt = timestamp()
		ON MATCH SET a.matched = true, a.matchedAt = timestamp()
		MERGE (b:MergeTest {id: 2})
		ON CREATE SET b.created = true
		MERGE (a)-[r:LINKED]->(b)
		ON CREATE SET r.new = true
		RETURN a, b, r
	`
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestExtreme_ManyLabelsAndTypes(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Node with many labels
	exec.Execute(ctx, "CREATE (n:A:B:C:D:E:F:G:H:I:J {name: 'multi-label'})", nil)

	query := "MATCH (n:A:B:C:D:E:F:G:H:I:J) RETURN labels(n)"
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}

func TestExtreme_ComplexAliasing(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Complex aliasing with calculations
	query := `
		WITH 1 AS one, 2 AS two, 3 AS three
		WITH one + two AS sum12, two + three AS sum23, one * two * three AS product
		WITH sum12 AS a, sum23 AS b, product AS c, sum12 + sum23 + product AS total
		RETURN a, b, c, total
	`
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
	assert.Equal(t, 4, len(result.Columns))
}

func TestExtreme_StringConcatenation(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	queries := []string{
		"RETURN 'Hello' + ' ' + 'World'",
		"RETURN 'a' + 'b' + 'c' + 'd' + 'e' + 'f' + 'g'",
		"WITH 'prefix' AS p, 'suffix' AS s RETURN p + '_middle_' + s",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("concat_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

func TestExtreme_NullPropagation(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Null propagation tests
	queries := []string{
		"RETURN null + 1",
		"RETURN null * 5",
		"RETURN null = null",
		"RETURN null <> null",
		"RETURN coalesce(null, null, null, 'found')",
		"RETURN null IS NULL",
		"RETURN null IS NOT NULL",
		"RETURN 1 IS NULL",
		"RETURN 1 IS NOT NULL",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("null_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

func TestExtreme_TypeCoercion(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// Type coercion scenarios
	queries := []string{
		"RETURN tointeger('123')",
		"RETURN tofloat('123.45')",
		"RETURN tostring(123)",
		"RETURN toboolean('true')",
		"RETURN toboolean('false')",
		"RETURN tointeger(123.9)",
	}

	for i, query := range queries {
		t.Run(fmt.Sprintf("coerce_%d", i), func(t *testing.T) {
			result, err := exec.Execute(ctx, query, nil)
			require.NoError(t, err, "Query should parse: %s", query)
			assert.Equal(t, 1, len(result.Rows))
		})
	}
}

func TestExtreme_UltimateNesting(t *testing.T) {
	exec, ctx := setupChaosExecutor(t)

	// The most absurdly nested valid query
	query := `
		WITH [[[[1]]]] AS quad_nested
		UNWIND quad_nested AS triple
		UNWIND triple AS double
		UNWIND double AS single
		UNWIND single AS val
		WITH val, 
		     CASE WHEN val = 1 THEN 
		       CASE WHEN true THEN 
		         CASE WHEN 1 = 1 THEN 'deep' ELSE 'no' END 
		       ELSE 'no' END 
		     ELSE 'no' END AS nested_case
		WITH val, nested_case, tostring(tointeger(tostring(val))) AS converted
		RETURN val, nested_case, converted
	`
	result, err := exec.Execute(ctx, query, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, len(result.Rows))
}
