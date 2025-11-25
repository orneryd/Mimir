// Package server provides an HTTP REST API server for NornicDB.
// Implements Neo4j-compatible HTTP endpoints with JWT authentication and RBAC.
// Compatible with Neo4j Browser and drivers using HTTP transport.
package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/orneryd/nornicdb/pkg/audit"
	"github.com/orneryd/nornicdb/pkg/auth"
	"github.com/orneryd/nornicdb/pkg/gpu"
	"github.com/orneryd/nornicdb/pkg/nornicdb"
)

// Errors for HTTP operations.
var (
	ErrServerClosed     = fmt.Errorf("server closed")
	ErrUnauthorized     = fmt.Errorf("unauthorized")
	ErrForbidden        = fmt.Errorf("forbidden")
	ErrBadRequest       = fmt.Errorf("bad request")
	ErrNotFound         = fmt.Errorf("not found")
	ErrMethodNotAllowed = fmt.Errorf("method not allowed")
	ErrInternalError    = fmt.Errorf("internal server error")
)

// Config holds HTTP server configuration.
type Config struct {
	// Address to bind to (default: "0.0.0.0")
	Address string
	// Port to listen on (default: 7474)
	Port int
	// ReadTimeout for requests
	ReadTimeout time.Duration
	// WriteTimeout for responses
	WriteTimeout time.Duration
	// IdleTimeout for keep-alive connections
	IdleTimeout time.Duration
	// MaxRequestSize in bytes (default: 10MB)
	MaxRequestSize int64
	// EnableCORS for cross-origin requests
	EnableCORS bool
	// CORSOrigins allowed (default: "*")
	CORSOrigins []string
	// EnableCompression for responses
	EnableCompression bool
	// TLSCertFile for HTTPS
	TLSCertFile string
	// TLSKeyFile for HTTPS
	TLSKeyFile string
}

// DefaultConfig returns default server configuration.
func DefaultConfig() *Config {
	return &Config{
		Address:           "0.0.0.0",
		Port:              7474,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxRequestSize:    10 * 1024 * 1024, // 10MB
		EnableCORS:        true,
		CORSOrigins:       []string{"*"},
		EnableCompression: true,
	}
}

// Server is the HTTP API server for NornicDB.
type Server struct {
	config *Config
	db     *nornicdb.DB
	auth   *auth.Authenticator
	audit  *audit.Logger

	httpServer *http.Server
	listener   net.Listener

	mu      sync.RWMutex
	closed  atomic.Bool
	started time.Time

	// Metrics
	requestCount   atomic.Int64
	errorCount     atomic.Int64
	activeRequests atomic.Int64
}

// New creates a new HTTP server.
func New(db *nornicdb.DB, authenticator *auth.Authenticator, config *Config) (*Server, error) {
	if config == nil {
		config = DefaultConfig()
	}
	if db == nil {
		return nil, fmt.Errorf("database required")
	}

	s := &Server{
		config: config,
		db:     db,
		auth:   authenticator,
	}

	return s, nil
}

// SetAuditLogger sets the audit logger for compliance logging.
func (s *Server) SetAuditLogger(logger *audit.Logger) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audit = logger
}

// Start begins listening for HTTP connections.
func (s *Server) Start() error {
	if s.closed.Load() {
		return ErrServerClosed
	}

	addr := fmt.Sprintf("%s:%d", s.config.Address, s.config.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}

	s.listener = listener
	s.started = time.Now()

	// Build router
	mux := s.buildRouter()

	s.httpServer = &http.Server{
		Handler:      mux,
		ReadTimeout:  s.config.ReadTimeout,
		WriteTimeout: s.config.WriteTimeout,
		IdleTimeout:  s.config.IdleTimeout,
	}

	// Start serving
	go func() {
		var err error
		if s.config.TLSCertFile != "" && s.config.TLSKeyFile != "" {
			err = s.httpServer.ServeTLS(listener, s.config.TLSCertFile, s.config.TLSKeyFile)
		} else {
			err = s.httpServer.Serve(listener)
		}
		if err != nil && err != http.ErrServerClosed {
			// Log error but don't crash
			fmt.Printf("HTTP server error: %v\n", err)
		}
	}()

	return nil
}

// Stop gracefully shuts down the server.
func (s *Server) Stop(ctx context.Context) error {
	if !s.closed.CompareAndSwap(false, true) {
		return nil // Already closed
	}

	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

// Addr returns the server's listen address.
func (s *Server) Addr() string {
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return ""
}

// Stats returns server statistics.
func (s *Server) Stats() ServerStats {
	return ServerStats{
		Uptime:         time.Since(s.started),
		RequestCount:   s.requestCount.Load(),
		ErrorCount:     s.errorCount.Load(),
		ActiveRequests: s.activeRequests.Load(),
	}
}

// ServerStats holds server metrics.
type ServerStats struct {
	Uptime         time.Duration `json:"uptime"`
	RequestCount   int64         `json:"request_count"`
	ErrorCount     int64         `json:"error_count"`
	ActiveRequests int64         `json:"active_requests"`
}

// =============================================================================
// Router Setup
// =============================================================================

func (s *Server) buildRouter() http.Handler {
	mux := http.NewServeMux()

	// ==========================================================================
	// Neo4j-Compatible Endpoints (for driver/browser compatibility)
	// ==========================================================================

	// Discovery endpoint (no auth required) - Neo4j compatible
	mux.HandleFunc("/", s.handleDiscovery)

	// Neo4j HTTP API - Transaction endpoints (database-specific)
	// Pattern: /db/{databaseName}/tx/commit for implicit transactions
	// Pattern: /db/{databaseName}/tx for explicit transaction creation
	// Pattern: /db/{databaseName}/tx/{txId} for transaction operations
	// Pattern: /db/{databaseName}/tx/{txId}/commit for transaction commit
	mux.HandleFunc("/db/", s.withAuth(s.handleDatabaseEndpoint, auth.PermRead))

	// ==========================================================================
	// Health/Status Endpoints (no auth required)
	// ==========================================================================
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/status", s.handleStatus)

	// ==========================================================================
	// Authentication Endpoints (NornicDB additions)
	// ==========================================================================
	mux.HandleFunc("/auth/token", s.handleToken)
	mux.HandleFunc("/auth/logout", s.handleLogout)
	mux.HandleFunc("/auth/me", s.withAuth(s.handleMe, auth.PermRead))

	// User management (admin only)
	mux.HandleFunc("/auth/users", s.withAuth(s.handleUsers, auth.PermUserManage))
	mux.HandleFunc("/auth/users/", s.withAuth(s.handleUserByID, auth.PermUserManage))

	// ==========================================================================
	// NornicDB Extension Endpoints (additional features)
	// ==========================================================================

	// Vector search (NornicDB-specific)
	mux.HandleFunc("/nornicdb/search", s.withAuth(s.handleSearch, auth.PermRead))
	mux.HandleFunc("/nornicdb/similar", s.withAuth(s.handleSimilar, auth.PermRead))

	// Memory decay (NornicDB-specific)
	mux.HandleFunc("/nornicdb/decay", s.withAuth(s.handleDecay, auth.PermRead))

	// Admin endpoints (NornicDB-specific)
	mux.HandleFunc("/admin/stats", s.withAuth(s.handleAdminStats, auth.PermAdmin))
	mux.HandleFunc("/admin/config", s.withAuth(s.handleAdminConfig, auth.PermAdmin))
	mux.HandleFunc("/admin/backup", s.withAuth(s.handleBackup, auth.PermAdmin))

	// GPU control endpoints (NornicDB-specific)
	mux.HandleFunc("/admin/gpu/status", s.withAuth(s.handleGPUStatus, auth.PermAdmin))
	mux.HandleFunc("/admin/gpu/enable", s.withAuth(s.handleGPUEnable, auth.PermAdmin))
	mux.HandleFunc("/admin/gpu/disable", s.withAuth(s.handleGPUDisable, auth.PermAdmin))
	mux.HandleFunc("/admin/gpu/test", s.withAuth(s.handleGPUTest, auth.PermAdmin))

	// GDPR compliance endpoints (NornicDB-specific)
	mux.HandleFunc("/gdpr/export", s.withAuth(s.handleGDPRExport, auth.PermRead))
	mux.HandleFunc("/gdpr/delete", s.withAuth(s.handleGDPRDelete, auth.PermDelete))

	// Wrap with middleware
	handler := s.corsMiddleware(mux)
	handler = s.loggingMiddleware(handler)
	handler = s.recoveryMiddleware(handler)
	handler = s.metricsMiddleware(handler)

	return handler
}

// =============================================================================
// Middleware
// =============================================================================

// withAuth wraps a handler with authentication and authorization.
// Supports both Neo4j Basic Auth and Bearer JWT tokens.
func (s *Server) withAuth(handler http.HandlerFunc, requiredPerm auth.Permission) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if auth is enabled
		if s.auth == nil || !s.auth.IsSecurityEnabled() {
			// Auth disabled - allow all
			handler(w, r)
			return
		}

		var claims *auth.JWTClaims
		var err error

		// Try Basic Auth first (Neo4j compatibility)
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Basic ") {
			claims, err = s.handleBasicAuth(authHeader, r)
		} else {
			// Try Bearer/JWT token extraction
			token := auth.ExtractToken(
				authHeader,
				r.Header.Get("X-API-Key"),
				getCookie(r, "token"),
				r.URL.Query().Get("token"),
				r.URL.Query().Get("api_key"),
			)

			if token == "" {
				s.writeNeo4jError(w, http.StatusUnauthorized, "Neo.ClientError.Security.Unauthorized", "No authentication provided")
				return
			}

			claims, err = s.auth.ValidateToken(token)
		}

		if err != nil {
			s.writeNeo4jError(w, http.StatusUnauthorized, "Neo.ClientError.Security.Unauthorized", err.Error())
			return
		}

		// Check permission
		if !hasPermission(claims.Roles, requiredPerm) {
			s.logAudit(r, claims.Sub, "access_denied", false,
				fmt.Sprintf("required permission: %s", requiredPerm))
			s.writeNeo4jError(w, http.StatusForbidden, "Neo.ClientError.Security.Forbidden", "insufficient permissions")
			return
		}

		// Add claims to request context
		ctx := context.WithValue(r.Context(), contextKeyClaims, claims)
		handler(w, r.WithContext(ctx))
	}
}

// handleBasicAuth handles Neo4j-compatible Basic authentication.
func (s *Server) handleBasicAuth(authHeader string, r *http.Request) (*auth.JWTClaims, error) {
	encoded := strings.TrimPrefix(authHeader, "Basic ")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("invalid basic auth encoding")
	}

	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid basic auth format")
	}

	username, password := parts[0], parts[1]

	// Authenticate and get token
	_, user, err := s.auth.Authenticate(username, password, getClientIP(r), r.UserAgent())
	if err != nil {
		return nil, err
	}

	// Convert user to claims
	roles := make([]string, len(user.Roles))
	for i, role := range user.Roles {
		roles[i] = string(role)
	}

	return &auth.JWTClaims{
		Sub:      user.ID,
		Username: user.Username,
		Email:    user.Email,
		Roles:    roles,
	}, nil
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.config.EnableCORS {
			origin := r.Header.Get("Origin")
			if origin == "" {
				origin = "*"
			}

			// Check if origin is allowed
			allowed := false
			for _, o := range s.config.CORSOrigins {
				if o == "*" || o == origin {
					allowed = true
					break
				}
			}

			if allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-API-Key")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}

			// Handle preflight
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status
		wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(wrapped, r)

		// Log request (skip health checks for noise reduction)
		if r.URL.Path != "/health" {
			duration := time.Since(start)
			s.logRequest(r, wrapped.status, duration)
		}
	})
}

func (s *Server) recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				// Log panic
				buf := make([]byte, 4096)
				n := runtime.Stack(buf, false)
				fmt.Printf("PANIC: %v\n%s\n", err, buf[:n])

				s.errorCount.Add(1)
				s.writeError(w, http.StatusInternalServerError, "internal server error", ErrInternalError)
			}
		}()

		next.ServeHTTP(w, r)
	})
}

func (s *Server) metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.requestCount.Add(1)
		s.activeRequests.Add(1)
		defer s.activeRequests.Add(-1)

		next.ServeHTTP(w, r)
	})
}

// =============================================================================
// Neo4j-Compatible Database Endpoint Handler
// =============================================================================

// handleDatabaseEndpoint routes /db/{databaseName}/... requests
// Implements Neo4j HTTP API transaction model:
//
//	POST /db/{dbName}/tx/commit - implicit transaction (query and commit)
//	POST /db/{dbName}/tx - open explicit transaction
//	POST /db/{dbName}/tx/{txId} - execute in open transaction
//	POST /db/{dbName}/tx/{txId}/commit - commit transaction
//	DELETE /db/{dbName}/tx/{txId} - rollback transaction
func (s *Server) handleDatabaseEndpoint(w http.ResponseWriter, r *http.Request) {
	// Parse path: /db/{databaseName}/...
	path := strings.TrimPrefix(r.URL.Path, "/db/")
	parts := strings.Split(path, "/")

	if len(parts) < 1 || parts[0] == "" {
		s.writeNeo4jError(w, http.StatusBadRequest, "Neo.ClientError.Request.Invalid", "database name required")
		return
	}

	dbName := parts[0]
	remaining := parts[1:]

	// Route based on remaining path
	switch {
	case len(remaining) == 0:
		// /db/{dbName} - database info
		s.handleDatabaseInfo(w, r, dbName)

	case remaining[0] == "tx":
		// Transaction endpoints
		s.handleTransactionEndpoint(w, r, dbName, remaining[1:])

	case remaining[0] == "cluster":
		// /db/{dbName}/cluster - cluster status
		s.handleClusterStatus(w, r, dbName)

	default:
		s.writeNeo4jError(w, http.StatusNotFound, "Neo.ClientError.Request.Invalid", "unknown endpoint")
	}
}

// handleDatabaseInfo returns database information
func (s *Server) handleDatabaseInfo(w http.ResponseWriter, r *http.Request, dbName string) {
	stats := s.db.Stats()
	response := map[string]interface{}{
		"name":      dbName,
		"status":    "online",
		"default":   dbName == "neo4j",
		"nodeCount": stats.NodeCount,
		"edgeCount": stats.EdgeCount,
	}
	s.writeJSON(w, http.StatusOK, response)
}

// handleClusterStatus returns cluster status (standalone mode)
func (s *Server) handleClusterStatus(w http.ResponseWriter, r *http.Request, dbName string) {
	response := map[string]interface{}{
		"mode":     "standalone",
		"database": dbName,
		"status":   "online",
	}
	s.writeJSON(w, http.StatusOK, response)
}

// handleTransactionEndpoint routes transaction-related requests
func (s *Server) handleTransactionEndpoint(w http.ResponseWriter, r *http.Request, dbName string, remaining []string) {
	switch {
	case len(remaining) == 0:
		// POST /db/{dbName}/tx - open new transaction
		if r.Method != http.MethodPost {
			s.writeNeo4jError(w, http.StatusMethodNotAllowed, "Neo.ClientError.Request.Invalid", "POST required")
			return
		}
		s.handleOpenTransaction(w, r, dbName)

	case remaining[0] == "commit" && len(remaining) == 1:
		// POST /db/{dbName}/tx/commit - implicit transaction
		if r.Method != http.MethodPost {
			s.writeNeo4jError(w, http.StatusMethodNotAllowed, "Neo.ClientError.Request.Invalid", "POST required")
			return
		}
		s.handleImplicitTransaction(w, r, dbName)

	case len(remaining) == 1:
		// POST/DELETE /db/{dbName}/tx/{txId}
		txID := remaining[0]
		switch r.Method {
		case http.MethodPost:
			s.handleExecuteInTransaction(w, r, dbName, txID)
		case http.MethodDelete:
			s.handleRollbackTransaction(w, r, dbName, txID)
		default:
			s.writeNeo4jError(w, http.StatusMethodNotAllowed, "Neo.ClientError.Request.Invalid", "POST or DELETE required")
		}

	case len(remaining) == 2 && remaining[1] == "commit":
		// POST /db/{dbName}/tx/{txId}/commit
		if r.Method != http.MethodPost {
			s.writeNeo4jError(w, http.StatusMethodNotAllowed, "Neo.ClientError.Request.Invalid", "POST required")
			return
		}
		txID := remaining[0]
		s.handleCommitTransaction(w, r, dbName, txID)

	default:
		s.writeNeo4jError(w, http.StatusNotFound, "Neo.ClientError.Request.Invalid", "unknown transaction endpoint")
	}
}

// TransactionRequest follows Neo4j HTTP API format exactly.
type TransactionRequest struct {
	Statements []StatementRequest `json:"statements"`
}

// StatementRequest is a single Cypher statement.
type StatementRequest struct {
	Statement          string                 `json:"statement"`
	Parameters         map[string]interface{} `json:"parameters,omitempty"`
	ResultDataContents []string               `json:"resultDataContents,omitempty"` // ["row", "graph"]
	IncludeStats       bool                   `json:"includeStats,omitempty"`
}

// TransactionResponse follows Neo4j HTTP API format exactly.
type TransactionResponse struct {
	Results       []QueryResult        `json:"results"`
	Errors        []QueryError         `json:"errors"`
	Commit        string               `json:"commit,omitempty"`        // URL to commit (for open transactions)
	Transaction   *TransactionInfo     `json:"transaction,omitempty"`   // Transaction state
	LastBookmarks []string             `json:"lastBookmarks,omitempty"` // Bookmark for causal consistency
	Notifications []ServerNotification `json:"notifications,omitempty"` // Server notifications
}

// TransactionInfo holds transaction state.
type TransactionInfo struct {
	Expires string `json:"expires"` // RFC1123 format
}

// QueryResult is a single query result.
type QueryResult struct {
	Columns []string    `json:"columns"`
	Data    []ResultRow `json:"data"`
	Stats   *QueryStats `json:"stats,omitempty"`
}

// ResultRow is a row of results with metadata.
type ResultRow struct {
	Row   []interface{} `json:"row"`
	Meta  []interface{} `json:"meta,omitempty"`
	Graph *GraphResult  `json:"graph,omitempty"`
}

// GraphResult holds graph-format results.
type GraphResult struct {
	Nodes         []GraphNode         `json:"nodes"`
	Relationships []GraphRelationship `json:"relationships"`
}

// GraphNode is a node in graph format.
type GraphNode struct {
	ID         string                 `json:"id"`
	ElementID  string                 `json:"elementId"`
	Labels     []string               `json:"labels"`
	Properties map[string]interface{} `json:"properties"`
}

// GraphRelationship is a relationship in graph format.
type GraphRelationship struct {
	ID         string                 `json:"id"`
	ElementID  string                 `json:"elementId"`
	Type       string                 `json:"type"`
	StartNode  string                 `json:"startNodeElementId"`
	EndNode    string                 `json:"endNodeElementId"`
	Properties map[string]interface{} `json:"properties"`
}

// QueryStats holds query execution statistics.
type QueryStats struct {
	NodesCreated         int  `json:"nodes_created,omitempty"`
	NodesDeleted         int  `json:"nodes_deleted,omitempty"`
	RelationshipsCreated int  `json:"relationships_created,omitempty"`
	RelationshipsDeleted int  `json:"relationships_deleted,omitempty"`
	PropertiesSet        int  `json:"properties_set,omitempty"`
	LabelsAdded          int  `json:"labels_added,omitempty"`
	LabelsRemoved        int  `json:"labels_removed,omitempty"`
	IndexesAdded         int  `json:"indexes_added,omitempty"`
	IndexesRemoved       int  `json:"indexes_removed,omitempty"`
	ConstraintsAdded     int  `json:"constraints_added,omitempty"`
	ConstraintsRemoved   int  `json:"constraints_removed,omitempty"`
	ContainsUpdates      bool `json:"contains_updates,omitempty"`
}

// QueryError is an error from a query (Neo4j format).
type QueryError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ServerNotification is a warning/info from the server.
type ServerNotification struct {
	Code        string           `json:"code"`
	Severity    string           `json:"severity"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Position    *NotificationPos `json:"position,omitempty"`
}

// NotificationPos is the position of a notification in the query.
type NotificationPos struct {
	Offset int `json:"offset"`
	Line   int `json:"line"`
	Column int `json:"column"`
}

// handleImplicitTransaction executes statements in an implicit transaction.
// This is the main query endpoint: POST /db/{dbName}/tx/commit
func (s *Server) handleImplicitTransaction(w http.ResponseWriter, r *http.Request, dbName string) {
	var req TransactionRequest
	if err := s.readJSON(r, &req); err != nil {
		s.writeNeo4jError(w, http.StatusBadRequest, "Neo.ClientError.Request.InvalidFormat", "invalid request body")
		return
	}

	response := TransactionResponse{
		Results:       make([]QueryResult, 0, len(req.Statements)),
		Errors:        make([]QueryError, 0),
		LastBookmarks: []string{s.generateBookmark()},
	}

	claims := getClaims(r)
	hasError := false

	for _, stmt := range req.Statements {
		if hasError {
			// Skip remaining statements after error (rollback semantics)
			break
		}

		// Check write permission for mutations
		if isMutationQuery(stmt.Statement) {
			if claims != nil && !hasPermission(claims.Roles, auth.PermWrite) {
				response.Errors = append(response.Errors, QueryError{
					Code:    "Neo.ClientError.Security.Forbidden",
					Message: "Write permission required",
				})
				hasError = true
				continue
			}
		}

		result, err := s.db.ExecuteCypher(r.Context(), stmt.Statement, stmt.Parameters)
		if err != nil {
			response.Errors = append(response.Errors, QueryError{
				Code:    "Neo.ClientError.Statement.SyntaxError",
				Message: err.Error(),
			})
			hasError = true
			continue
		}

		// Convert result to Neo4j format with metadata
		qr := QueryResult{
			Columns: result.Columns,
			Data:    make([]ResultRow, len(result.Rows)),
		}

		for i, row := range result.Rows {
			qr.Data[i] = ResultRow{
				Row:  row,
				Meta: s.generateRowMeta(row),
			}
		}

		if stmt.IncludeStats {
			qr.Stats = &QueryStats{ContainsUpdates: isMutationQuery(stmt.Statement)}
		}

		response.Results = append(response.Results, qr)
	}

	s.writeJSON(w, http.StatusOK, response)
}

// generateRowMeta generates metadata for each value in a row
func (s *Server) generateRowMeta(row []interface{}) []interface{} {
	meta := make([]interface{}, len(row))
	for i, val := range row {
		switch v := val.(type) {
		case map[string]interface{}:
			// Could be a node or relationship
			if id, ok := v["id"]; ok {
				meta[i] = map[string]interface{}{
					"id":        id,
					"elementId": fmt.Sprintf("4:nornicdb:%v", id),
					"type":      "node",
					"deleted":   false,
				}
			} else {
				meta[i] = nil
			}
		default:
			meta[i] = nil
		}
	}
	return meta
}

// generateBookmark generates a bookmark for causal consistency
func (s *Server) generateBookmark() string {
	return fmt.Sprintf("FB:nornicdb:%d", time.Now().UnixNano())
}

// Transaction management (explicit transactions)
// For now, we implement simplified single-request transactions
// TODO: Implement full explicit transaction support with transaction IDs

func (s *Server) handleOpenTransaction(w http.ResponseWriter, r *http.Request, dbName string) {
	// Generate transaction ID
	txID := fmt.Sprintf("%d", time.Now().UnixNano())

	host := s.config.Address
	if host == "0.0.0.0" {
		host = "localhost"
	}

	var req TransactionRequest
	_ = s.readJSON(r, &req) // Optional body

	response := TransactionResponse{
		Results: make([]QueryResult, 0),
		Errors:  make([]QueryError, 0),
		Commit:  fmt.Sprintf("http://%s:%d/db/%s/tx/%s/commit", host, s.config.Port, dbName, txID),
		Transaction: &TransactionInfo{
			Expires: time.Now().Add(30 * time.Second).Format(time.RFC1123),
		},
	}

	// Execute any provided statements
	if len(req.Statements) > 0 {
		for _, stmt := range req.Statements {
			result, err := s.db.ExecuteCypher(r.Context(), stmt.Statement, stmt.Parameters)
			if err != nil {
				response.Errors = append(response.Errors, QueryError{
					Code:    "Neo.ClientError.Statement.SyntaxError",
					Message: err.Error(),
				})
				continue
			}

			qr := QueryResult{
				Columns: result.Columns,
				Data:    make([]ResultRow, len(result.Rows)),
			}
			for i, row := range result.Rows {
				qr.Data[i] = ResultRow{Row: row, Meta: s.generateRowMeta(row)}
			}
			response.Results = append(response.Results, qr)
		}
	}

	s.writeJSON(w, http.StatusCreated, response)
}

func (s *Server) handleExecuteInTransaction(w http.ResponseWriter, r *http.Request, dbName, txID string) {
	// Execute statements in open transaction
	// For simplified implementation, treat as immediate execution
	s.handleImplicitTransaction(w, r, dbName)
}

func (s *Server) handleCommitTransaction(w http.ResponseWriter, r *http.Request, dbName, txID string) {
	var req TransactionRequest
	_ = s.readJSON(r, &req) // Optional final statements

	response := TransactionResponse{
		Results:       make([]QueryResult, 0),
		Errors:        make([]QueryError, 0),
		LastBookmarks: []string{s.generateBookmark()},
	}

	// Execute any final statements
	for _, stmt := range req.Statements {
		result, err := s.db.ExecuteCypher(r.Context(), stmt.Statement, stmt.Parameters)
		if err != nil {
			response.Errors = append(response.Errors, QueryError{
				Code:    "Neo.ClientError.Statement.SyntaxError",
				Message: err.Error(),
			})
			continue
		}

		qr := QueryResult{
			Columns: result.Columns,
			Data:    make([]ResultRow, len(result.Rows)),
		}
		for i, row := range result.Rows {
			qr.Data[i] = ResultRow{Row: row, Meta: s.generateRowMeta(row)}
		}
		response.Results = append(response.Results, qr)
	}

	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleRollbackTransaction(w http.ResponseWriter, r *http.Request, dbName, txID string) {
	// Rollback transaction (for simplified implementation, just acknowledge)
	response := TransactionResponse{
		Results: make([]QueryResult, 0),
		Errors:  make([]QueryError, 0),
	}
	s.writeJSON(w, http.StatusOK, response)
}

// writeNeo4jError writes an error in Neo4j format.
func (s *Server) writeNeo4jError(w http.ResponseWriter, status int, code, message string) {
	s.errorCount.Add(1)
	response := TransactionResponse{
		Results: make([]QueryResult, 0),
		Errors: []QueryError{{
			Code:    code,
			Message: message,
		}},
	}
	s.writeJSON(w, status, response)
}

// handleDecay returns memory decay information (NornicDB-specific)
func (s *Server) handleDecay(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement decay stats
	response := map[string]interface{}{
		"enabled":          true,
		"archiveThreshold": 0.05,
		"interval":         "1h",
	}
	s.writeJSON(w, http.StatusOK, response)
}

// =============================================================================
// Discovery & Health Handlers
// =============================================================================

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		s.writeNeo4jError(w, http.StatusNotFound, "Neo.ClientError.Request.Invalid", "not found")
		return
	}

	// Neo4j-compatible discovery response (exact format)
	host := s.config.Address
	if host == "0.0.0.0" {
		host = "localhost"
	}

	response := map[string]interface{}{
		"bolt_direct":   fmt.Sprintf("bolt://%s:7687", host),
		"bolt_routing":  fmt.Sprintf("neo4j://%s:7687", host),
		"transaction":   fmt.Sprintf("http://%s:%d/db/{databaseName}/tx", host, s.config.Port),
		"neo4j_version": "5.0.0",
		"neo4j_edition": "community",
		// NornicDB extensions in separate namespace
		"nornicdb": map[string]interface{}{
			"version": "1.0.0",
			"features": []string{
				"memory_decay",
				"auto_inference",
				"vector_search",
				"gdpr_compliance",
			},
		},
	}

	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	}
	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	stats := s.Stats()
	dbStats := s.db.Stats()

	response := map[string]interface{}{
		"status": "running",
		"server": map[string]interface{}{
			"uptime_seconds": stats.Uptime.Seconds(),
			"requests":       stats.RequestCount,
			"errors":         stats.ErrorCount,
			"active":         stats.ActiveRequests,
		},
		"database": map[string]interface{}{
			"nodes": dbStats.NodeCount,
			"edges": dbStats.EdgeCount,
		},
	}

	s.writeJSON(w, http.StatusOK, response)
}

// =============================================================================
// Authentication Handlers
// =============================================================================

func (s *Server) handleToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	if s.auth == nil {
		s.writeError(w, http.StatusServiceUnavailable, "authentication not configured", nil)
		return
	}

	// Parse request body
	var req struct {
		Username  string `json:"username"`
		Password  string `json:"password"`
		GrantType string `json:"grant_type"`
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	// Support OAuth 2.0 password grant
	if req.GrantType != "" && req.GrantType != "password" {
		s.writeError(w, http.StatusBadRequest, "unsupported grant_type", ErrBadRequest)
		return
	}

	// Authenticate
	tokenResp, _, err := s.auth.Authenticate(
		req.Username,
		req.Password,
		getClientIP(r),
		r.UserAgent(),
	)

	if err != nil {
		status := http.StatusUnauthorized
		if err == auth.ErrAccountLocked {
			status = http.StatusTooManyRequests
		}
		s.writeError(w, status, err.Error(), ErrUnauthorized)
		return
	}

	s.writeJSON(w, http.StatusOK, tokenResp)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// For stateless JWT, logout is client-side (discard token)
	// But we can audit the event
	claims := getClaims(r)
	if claims != nil {
		s.logAudit(r, claims.Sub, "logout", true, "")
	}

	s.writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.StatusMethodNotAllowed, "method not allowed", ErrMethodNotAllowed)
		return
	}

	claims := getClaims(r)
	if claims == nil {
		s.writeError(w, http.StatusUnauthorized, "no user context", ErrUnauthorized)
		return
	}

	user, err := s.auth.GetUserByID(claims.Sub)
	if err != nil {
		s.writeError(w, http.StatusNotFound, "user not found", ErrNotFound)
		return
	}

	s.writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// List users
		users := s.auth.ListUsers()
		s.writeJSON(w, http.StatusOK, users)

	case http.MethodPost:
		// Create user
		var req struct {
			Username string   `json:"username"`
			Password string   `json:"password"`
			Roles    []string `json:"roles"`
		}

		if err := s.readJSON(r, &req); err != nil {
			s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
			return
		}

		roles := make([]auth.Role, len(req.Roles))
		for i, r := range req.Roles {
			roles[i] = auth.Role(r)
		}

		user, err := s.auth.CreateUser(req.Username, req.Password, roles)
		if err != nil {
			s.writeError(w, http.StatusBadRequest, err.Error(), ErrBadRequest)
			return
		}

		s.writeJSON(w, http.StatusCreated, user)

	default:
		s.writeError(w, http.StatusMethodNotAllowed, "GET or POST required", ErrMethodNotAllowed)
	}
}

func (s *Server) handleUserByID(w http.ResponseWriter, r *http.Request) {
	username := strings.TrimPrefix(r.URL.Path, "/auth/users/")
	if username == "" {
		// Empty username - delegate to list users handler
		s.handleUsers(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		user, err := s.auth.GetUser(username)
		if err != nil {
			s.writeError(w, http.StatusNotFound, "user not found", ErrNotFound)
			return
		}
		s.writeJSON(w, http.StatusOK, user)

	case http.MethodPut:
		var req struct {
			Roles    []string `json:"roles,omitempty"`
			Disabled *bool    `json:"disabled,omitempty"`
		}

		if err := s.readJSON(r, &req); err != nil {
			s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
			return
		}

		if len(req.Roles) > 0 {
			roles := make([]auth.Role, len(req.Roles))
			for i, r := range req.Roles {
				roles[i] = auth.Role(r)
			}
			if err := s.auth.UpdateRoles(username, roles); err != nil {
				s.writeError(w, http.StatusBadRequest, err.Error(), ErrBadRequest)
				return
			}
		}

		if req.Disabled != nil {
			if *req.Disabled {
				s.auth.DisableUser(username)
			} else {
				s.auth.EnableUser(username)
			}
		}

		s.writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})

	case http.MethodDelete:
		if err := s.auth.DeleteUser(username); err != nil {
			s.writeError(w, http.StatusNotFound, "user not found", ErrNotFound)
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})

	default:
		s.writeError(w, http.StatusMethodNotAllowed, "GET, PUT, or DELETE required", ErrMethodNotAllowed)
	}
}

// =============================================================================
// NornicDB-Specific Handlers (Memory OS for LLMs)
// =============================================================================

// Search Handlers
// =============================================================================

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	var req struct {
		Query  string   `json:"query"`
		Labels []string `json:"labels,omitempty"`
		Limit  int      `json:"limit,omitempty"`
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	}

	results, err := s.db.Search(r.Context(), req.Query, req.Labels, req.Limit)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}

	s.writeJSON(w, http.StatusOK, results)
}

func (s *Server) handleSimilar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	var req struct {
		NodeID string `json:"node_id"`
		Limit  int    `json:"limit,omitempty"`
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	}

	results, err := s.db.FindSimilar(r.Context(), req.NodeID, req.Limit)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}

	s.writeJSON(w, http.StatusOK, results)
}

// =============================================================================
// Admin Handlers
// =============================================================================

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	serverStats := s.Stats()
	dbStats := s.db.Stats()

	response := map[string]interface{}{
		"server":   serverStats,
		"database": dbStats,
		"memory": map[string]interface{}{
			"alloc_mb":   getMemoryUsageMB(),
			"goroutines": runtime.NumGoroutine(),
		},
	}

	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleAdminConfig(w http.ResponseWriter, r *http.Request) {
	// Return safe config (no secrets)
	config := map[string]interface{}{
		"address":      s.config.Address,
		"port":         s.config.Port,
		"cors_enabled": s.config.EnableCORS,
		"compression":  s.config.EnableCompression,
		"tls_enabled":  s.config.TLSCertFile != "",
	}

	s.writeJSON(w, http.StatusOK, config)
}

func (s *Server) handleBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	if err := s.db.Backup(r.Context(), req.Path); err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{
		"status": "backup complete",
		"path":   req.Path,
	})
}

// =============================================================================
// GPU Control Handlers
// =============================================================================

func (s *Server) handleGPUStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.StatusMethodNotAllowed, "GET required", ErrMethodNotAllowed)
		return
	}

	gpuManagerIface := s.db.GetGPUManager()
	if gpuManagerIface == nil {
		s.writeJSON(w, http.StatusOK, map[string]interface{}{
			"available": false,
			"enabled":   false,
			"message":   "GPU manager not initialized",
		})
		return
	}

	gpuManager, ok := gpuManagerIface.(*gpu.Manager)
	if !ok {
		s.writeError(w, http.StatusInternalServerError, "invalid GPU manager type", ErrInternalError)
		return
	}

	enabled := gpuManager.IsEnabled()
	device := gpuManager.Device()
	stats := gpuManager.Stats()

	response := map[string]interface{}{
		"available":      device != nil,
		"enabled":        enabled,
		"operations_gpu": stats.OperationsGPU,
		"operations_cpu": stats.OperationsCPU,
		"fallback_count": stats.FallbackCount,
		"allocated_mb":   gpuManager.AllocatedMemoryMB(),
	}

	if device != nil {
		response["device"] = map[string]interface{}{
			"id":            device.ID,
			"name":          device.Name,
			"vendor":        device.Vendor,
			"backend":       device.Backend,
			"memory_mb":     device.MemoryMB,
			"compute_units": device.ComputeUnits,
		}
	}

	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleGPUEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	gpuManagerIface := s.db.GetGPUManager()
	if gpuManagerIface == nil {
		s.writeError(w, http.StatusServiceUnavailable, "GPU manager not initialized", ErrInternalError)
		return
	}

	gpuManager, ok := gpuManagerIface.(*gpu.Manager)
	if !ok {
		s.writeError(w, http.StatusInternalServerError, "invalid GPU manager type", ErrInternalError)
		return
	}

	if err := gpuManager.Enable(); err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "enabled",
		"message": "GPU acceleration enabled",
	})
}

func (s *Server) handleGPUDisable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	gpuManagerIface := s.db.GetGPUManager()
	if gpuManagerIface == nil {
		s.writeError(w, http.StatusServiceUnavailable, "GPU manager not initialized", ErrInternalError)
		return
	}

	gpuManager, ok := gpuManagerIface.(*gpu.Manager)
	if !ok {
		s.writeError(w, http.StatusInternalServerError, "invalid GPU manager type", ErrInternalError)
		return
	}

	gpuManager.Disable()

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "disabled",
		"message": "GPU acceleration disabled (CPU fallback active)",
	})
}

func (s *Server) handleGPUTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	var req struct {
		NodeID string `json:"node_id"`
		Limit  int    `json:"limit,omitempty"`
		Mode   string `json:"mode,omitempty"` // "auto", "cpu", "gpu"
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	}
	if req.Mode == "" {
		req.Mode = "auto"
	}

	gpuManagerIface := s.db.GetGPUManager()
	if gpuManagerIface == nil {
		s.writeError(w, http.StatusServiceUnavailable, "GPU manager not initialized", ErrInternalError)
		return
	}

	gpuManager, ok := gpuManagerIface.(*gpu.Manager)
	if !ok {
		s.writeError(w, http.StatusInternalServerError, "invalid GPU manager type", ErrInternalError)
		return
	}

	// Store original state
	originallyEnabled := gpuManager.IsEnabled()

	// Configure mode for this test
	switch req.Mode {
	case "cpu":
		gpuManager.Disable()
		defer func() {
			if originallyEnabled {
				gpuManager.Enable()
			}
		}()
	case "gpu":
		if err := gpuManager.Enable(); err != nil {
			s.writeError(w, http.StatusInternalServerError, "GPU unavailable: "+err.Error(), ErrInternalError)
			return
		}
		defer func() {
			if !originallyEnabled {
				gpuManager.Disable()
			}
		}()
	case "auto":
		// Use current state
	}

	// Measure search performance
	startTime := time.Now()
	results, err := s.db.FindSimilar(r.Context(), req.NodeID, req.Limit)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}
	elapsedMs := time.Since(startTime).Milliseconds()

	// Get stats
	stats := gpuManager.Stats()
	usedMode := "cpu"
	if gpuManager.IsEnabled() {
		usedMode = "gpu"
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"results": results,
		"performance": map[string]interface{}{
			"elapsed_ms":     elapsedMs,
			"mode":           usedMode,
			"operations_gpu": stats.OperationsGPU,
			"operations_cpu": stats.OperationsCPU,
		},
	})
}

// =============================================================================
// GDPR Compliance Handlers
// =============================================================================

func (s *Server) handleGDPRExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	var req struct {
		UserID string `json:"user_id"`
		Format string `json:"format"` // "json" or "csv"
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	// User can only export own data unless admin
	claims := getClaims(r)
	if claims != nil && claims.Sub != req.UserID && !hasPermission(claims.Roles, auth.PermAdmin) {
		s.writeError(w, http.StatusForbidden, "can only export own data", ErrForbidden)
		return
	}

	data, err := s.db.ExportUserData(r.Context(), req.UserID, req.Format)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}

	s.logAudit(r, req.UserID, "gdpr_export", true, fmt.Sprintf("format: %s", req.Format))

	if req.Format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=user_data.csv")
		w.Write(data)
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=user_data.json")
		w.Write(data)
	}
}

func (s *Server) handleGDPRDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "POST required", ErrMethodNotAllowed)
		return
	}

	var req struct {
		UserID    string `json:"user_id"`
		Anonymize bool   `json:"anonymize"` // Anonymize instead of hard delete
		Confirm   bool   `json:"confirm"`   // Confirmation required
	}

	if err := s.readJSON(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", ErrBadRequest)
		return
	}

	if !req.Confirm {
		s.writeError(w, http.StatusBadRequest, "confirmation required", ErrBadRequest)
		return
	}

	// User can only delete own data unless admin
	claims := getClaims(r)
	if claims != nil && claims.Sub != req.UserID && !hasPermission(claims.Roles, auth.PermAdmin) {
		s.writeError(w, http.StatusForbidden, "can only delete own data", ErrForbidden)
		return
	}

	var err error
	if req.Anonymize {
		err = s.db.AnonymizeUserData(r.Context(), req.UserID)
	} else {
		err = s.db.DeleteUserData(r.Context(), req.UserID)
	}

	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error(), ErrInternalError)
		return
	}

	action := "deleted"
	if req.Anonymize {
		action = "anonymized"
	}

	s.logAudit(r, req.UserID, "gdpr_delete", true, fmt.Sprintf("action: %s", action))

	s.writeJSON(w, http.StatusOK, map[string]string{
		"status":  action,
		"user_id": req.UserID,
	})
}

// =============================================================================
// Helper Functions
// =============================================================================

type contextKey string

const contextKeyClaims = contextKey("claims")

func getClaims(r *http.Request) *auth.JWTClaims {
	claims, _ := r.Context().Value(contextKeyClaims).(*auth.JWTClaims)
	return claims
}

func getCookie(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For first
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	// Check X-Real-IP
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Fall back to RemoteAddr
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	return host
}

func hasPermission(roles []string, required auth.Permission) bool {
	for _, roleStr := range roles {
		role := auth.Role(roleStr)
		perms, ok := auth.RolePermissions[role]
		if !ok {
			continue
		}
		for _, p := range perms {
			if p == required {
				return true
			}
		}
	}
	return false
}

func isMutationQuery(query string) bool {
	upper := strings.ToUpper(strings.TrimSpace(query))
	return strings.HasPrefix(upper, "CREATE") ||
		strings.HasPrefix(upper, "MERGE") ||
		strings.HasPrefix(upper, "DELETE") ||
		strings.HasPrefix(upper, "SET") ||
		strings.HasPrefix(upper, "REMOVE") ||
		strings.HasPrefix(upper, "DROP")
}

func parseIntQuery(r *http.Request, key string, defaultVal int) int {
	valStr := r.URL.Query().Get(key)
	if valStr == "" {
		return defaultVal
	}
	var val int
	fmt.Sscanf(valStr, "%d", &val)
	if val <= 0 {
		return defaultVal
	}
	return val
}

func getMemoryUsageMB() float64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return float64(m.Alloc) / 1024 / 1024
}

// responseWriter wraps http.ResponseWriter to capture status code.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (w *responseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// JSON helpers

func (s *Server) readJSON(r *http.Request, v interface{}) error {
	// Limit body size
	body := io.LimitReader(r.Body, s.config.MaxRequestSize)
	return json.NewDecoder(body).Decode(v)
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (s *Server) writeError(w http.ResponseWriter, status int, message string, err error) {
	s.errorCount.Add(1)

	response := map[string]interface{}{
		"error":   true,
		"message": message,
		"code":    status,
	}

	s.writeJSON(w, status, response)
}

// Logging helpers

func (s *Server) logRequest(r *http.Request, status int, duration time.Duration) {
	// Could be enhanced with structured logging
	fmt.Printf("[HTTP] %s %s %d %v\n", r.Method, r.URL.Path, status, duration)
}

func (s *Server) logAudit(r *http.Request, userID, eventType string, success bool, details string) {
	if s.audit == nil {
		return
	}

	s.audit.Log(audit.Event{
		Timestamp:   time.Now(),
		Type:        audit.EventType(eventType),
		UserID:      userID,
		IPAddress:   getClientIP(r),
		UserAgent:   r.UserAgent(),
		Success:     success,
		Reason:      details,
		RequestPath: r.URL.Path,
	})
}
