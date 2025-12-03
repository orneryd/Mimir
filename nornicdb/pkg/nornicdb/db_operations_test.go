package nornicdb

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDB_GetIndexes(t *testing.T) {
	t.Run("returns empty for new database", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		indexes, err := db.GetIndexes(context.Background())
		require.NoError(t, err)
		assert.NotNil(t, indexes)
		assert.Len(t, indexes, 0)
	})

	t.Run("returns indexes after creation", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		// Create an index
		err = db.CreateIndex(context.Background(), "User", "email", "property")
		require.NoError(t, err)

		indexes, err := db.GetIndexes(context.Background())
		require.NoError(t, err)
		assert.Len(t, indexes, 1)
		assert.Equal(t, "User", indexes[0].Label)
		assert.Equal(t, "email", indexes[0].Property)
	})
}

func TestDB_CreateIndex(t *testing.T) {
	testCases := []struct {
		name      string
		indexType string
		wantErr   bool
	}{
		{"property index", "property", false},
		{"btree index", "btree", false},
		{"fulltext index", "fulltext", false},
		{"vector index", "vector", false},
		{"range index", "range", false},
		{"invalid type", "invalid", true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			db, err := Open("", nil)
			require.NoError(t, err)
			defer db.Close()

			err = db.CreateIndex(context.Background(), "TestLabel", "testProperty", tc.indexType)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestDB_Backup(t *testing.T) {
	t.Run("backup in-memory database as JSON", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		// Add test data
		_, err = db.ExecuteCypher(context.Background(), "CREATE (n:TestNode {name: 'test', value: 123})", nil)
		require.NoError(t, err)

		// Create backup
		backupPath := filepath.Join(t.TempDir(), "backup.json")
		err = db.Backup(context.Background(), backupPath)
		require.NoError(t, err)

		// Verify backup exists and has content
		data, err := os.ReadFile(backupPath)
		require.NoError(t, err)
		assert.Contains(t, string(data), "TestNode")
		assert.Contains(t, string(data), "test")
	})

	t.Run("backup persistent database", func(t *testing.T) {
		dbDir := t.TempDir()
		db, err := Open(dbDir, nil)
		require.NoError(t, err)

		// Add test data
		_, err = db.ExecuteCypher(context.Background(), "CREATE (n:TestNode {name: 'test'})", nil)
		require.NoError(t, err)

		// Create backup
		backupPath := filepath.Join(t.TempDir(), "backup.bin")
		err = db.Backup(context.Background(), backupPath)
		require.NoError(t, err)

		db.Close()

		// Verify backup exists
		info, err := os.Stat(backupPath)
		require.NoError(t, err)
		assert.Greater(t, info.Size(), int64(0))
	})
}

func TestDB_ExportUserData_CSV(t *testing.T) {
	t.Run("exports user data as CSV", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		// Create test nodes with owner_id
		ctx := context.Background()
		_, err = db.ExecuteCypher(ctx, `
			CREATE (u1:User {owner_id: 'user123', name: 'Alice', email: 'alice@example.com', age: 30})
			CREATE (u2:User {owner_id: 'user123', name: 'Bob', email: 'bob@example.com'})
			CREATE (u3:User {owner_id: 'other', name: 'Charlie'})
		`, nil)
		require.NoError(t, err)

		// Export as CSV
		data, err := db.ExportUserData(ctx, "user123", "csv")
		require.NoError(t, err)

		csv := string(data)

		// Verify CSV structure
		lines := strings.Split(strings.TrimSpace(csv), "\n")
		assert.GreaterOrEqual(t, len(lines), 2) // Header + at least 1 data row

		// Verify header
		header := lines[0]
		assert.Contains(t, header, "id")
		assert.Contains(t, header, "labels")
		assert.Contains(t, header, "created_at")

		// Verify data rows contain user data
		csvContent := string(data)
		assert.Contains(t, csvContent, "Alice")
		assert.Contains(t, csvContent, "Bob")
		assert.NotContains(t, csvContent, "Charlie") // Different owner
	})

	t.Run("handles special CSV characters", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		ctx := context.Background()
		_, err = db.ExecuteCypher(ctx, `
			CREATE (u:User {owner_id: 'user123', name: 'Test, User', description: 'Has "quotes" and, commas'})
		`, nil)
		require.NoError(t, err)

		data, err := db.ExportUserData(ctx, "user123", "csv")
		require.NoError(t, err)

		csv := string(data)
		// Verify proper CSV escaping (quotes should be doubled and wrapped in quotes)
		assert.Contains(t, csv, "\"Test, User\"")
		assert.Contains(t, csv, "\"Has \"\"quotes\"\" and, commas\"")
	})

	t.Run("exports empty result for non-existent user", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		data, err := db.ExportUserData(context.Background(), "nonexistent", "csv")
		require.NoError(t, err)

		csv := string(data)
		lines := strings.Split(strings.TrimSpace(csv), "\n")
		assert.Len(t, lines, 1) // Only header
	})
}

func TestDB_ExportUserData_JSON(t *testing.T) {
	t.Run("exports user data as JSON", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		ctx := context.Background()
		_, err = db.ExecuteCypher(ctx, `
			CREATE (u:User {owner_id: 'user456', name: 'Test User'})
		`, nil)
		require.NoError(t, err)

		data, err := db.ExportUserData(ctx, "user456", "json")
		require.NoError(t, err)

		jsonStr := string(data)
		assert.Contains(t, jsonStr, "user456")
		assert.Contains(t, jsonStr, "Test User")
		assert.Contains(t, jsonStr, "data")
		assert.Contains(t, jsonStr, "exported_at")
	})
}

func TestDB_GetDecayInfo(t *testing.T) {
	t.Run("returns enabled for default config", func(t *testing.T) {
		db, err := Open("", nil)
		require.NoError(t, err)
		defer db.Close()

		info := db.GetDecayInfo()
		require.NotNil(t, info)
		// DefaultConfig has DecayEnabled=true
		assert.True(t, info.Enabled)
		assert.Greater(t, info.ArchiveThreshold, 0.0)
	})

	t.Run("returns config when decay enabled", func(t *testing.T) {
		config := DefaultConfig()
		config.DecayEnabled = true
		config.DecayArchiveThreshold = 0.1

		db, err := Open("", config)
		require.NoError(t, err)
		defer db.Close()

		info := db.GetDecayInfo()
		require.NotNil(t, info)
		assert.True(t, info.Enabled)
		assert.Equal(t, 0.1, info.ArchiveThreshold)
		assert.Greater(t, info.RecalcInterval, time.Duration(0))
		assert.Greater(t, info.RecencyWeight, 0.0)
		assert.Greater(t, info.FrequencyWeight, 0.0)
		assert.Greater(t, info.ImportanceWeight, 0.0)
	})
}

func TestEscapeCSV(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"simple", "simple"},
		{"with,comma", "\"with,comma\""},
		{"with\"quote", "\"with\"\"quote\""},
		{"with\nnewline", "\"with\nnewline\""},
		{"with,comma and \"quotes\"", "\"with,comma and \"\"quotes\"\"\""},
		{"", ""},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			result := escapeCSV(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}
