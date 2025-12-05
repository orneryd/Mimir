package cypher

import (
	"context"
	
	"testing"

	"github.com/orneryd/nornicdb/pkg/storage"
)

func TestDebugGroupBy(t *testing.T) {
	store := storage.NewMemoryEngine()
	exec := NewASTExecutor(store)
	ctx := context.Background()

	// Setup
	queries := []string{
		`CREATE (n:Order {region: 'East', status: 'Complete', amount: 100})`,
		`CREATE (n:Order {region: 'East', status: 'Complete', amount: 200})`,
		`CREATE (n:Order {region: 'East', status: 'Pending', amount: 50})`,
		`CREATE (n:Order {region: 'West', status: 'Complete', amount: 300})`,
		`CREATE (n:Order {region: 'West', status: 'Pending', amount: 75})`,
	}
	for _, q := range queries {
		_, err := exec.Execute(ctx, q, nil)
		if err != nil {
			t.Fatalf("setup failed: %v", err)
		}
	}

	// Run the query
	result, err := exec.Execute(ctx, `
		MATCH (o:Order)
		WITH o.region as region, o.status as status, count(*) as cnt
		RETURN region, status, cnt
		ORDER BY cnt DESC
	`, nil)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}

	t.Logf("Columns: %v", result.Columns)
	t.Logf("Rows: %d", len(result.Rows))
	for i, row := range result.Rows {
		t.Logf("Row %d: %v (types: %T, %T, %T)", i, row, row[0], row[1], row[2])
	}
}
