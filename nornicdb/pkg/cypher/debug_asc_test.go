package cypher

import (
	"context"
	"testing"

	"github.com/orneryd/nornicdb/pkg/storage"
)

func TestDebugOrderByASC(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Setup - same as TestAggregation_OrderByVariations
	queries := []string{
		`CREATE (n:Product {name: 'Apple', category: 'Fruit', price: 1.50})`,
		`CREATE (n:Product {name: 'Banana', category: 'Fruit', price: 0.75})`,
		`CREATE (n:Product {name: 'Orange', category: 'Fruit', price: 2.00})`,
		`CREATE (n:Product {name: 'Carrot', category: 'Vegetable', price: 0.50})`,
		`CREATE (n:Product {name: 'Broccoli', category: 'Vegetable', price: 1.25})`,
		`CREATE (n:Product {name: 'Milk', category: 'Dairy', price: 3.00})`,
	}
	for _, q := range queries {
		_, err := exec.Execute(ctx, q, nil)
		if err != nil {
			t.Fatalf("setup failed: %v", err)
		}
	}

	// Run the ORDER BY ASC query
	result, err := exec.Execute(ctx, `
		MATCH (p:Product)
		RETURN p.category as cat, count(*) as cnt
		ORDER BY cnt ASC
	`, nil)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}

	t.Logf("Columns: %v", result.Columns)
	t.Logf("Rows: %d", len(result.Rows))
	for i, row := range result.Rows {
		t.Logf("Row %d: cat=%v cnt=%v (types: %T, %T)", i, row[0], row[1], row[0], row[1])
	}
}
