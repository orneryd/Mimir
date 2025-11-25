// Package auth provides authentication and authorization for NornicDB.
// Implements Mimir-compatible authentication with JWT tokens and role-based access control.
// Designed to meet GDPR Art.32, HIPAA §164.312(a), and FISMA AC controls.
//
// This package follows the same patterns as Mimir's authentication:
// - JWT-based stateless tokens (HS256)
// - Multiple credential sources (Bearer header, cookie, query param)
// - Role-based access control with configurable roles
// - Dev user support via environment variables
// - OAuth 2.0 compatible token endpoint format
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Errors for authentication operations.
var (
	ErrUserNotFound       = errors.New("user not found")
	ErrUserExists         = errors.New("user already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountLocked      = errors.New("account locked due to failed login attempts")
	ErrPasswordTooShort   = errors.New("password does not meet minimum length requirement")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrInsufficientRole   = errors.New("insufficient role permissions")
	ErrSessionExpired     = errors.New("session expired")
	ErrNoCredentials      = errors.New("no credentials provided")
	ErrMissingSecret      = errors.New("JWT secret not configured")
)

// Role represents a user role with associated permissions.
// Follows Mimir's role naming conventions.
type Role string

// Predefined roles following Neo4j/Mimir conventions.
const (
	RoleAdmin  Role = "admin"  // Full access including user management
	RoleEditor Role = "editor" // Read/write data
	RoleViewer Role = "viewer" // Read only (default)
	RoleNone   Role = "none"   // No access
)

// Permission represents an action that can be performed.
type Permission string

// Permissions map to Neo4j-compatible actions.
const (
	PermRead       Permission = "read"
	PermWrite      Permission = "write"
	PermCreate     Permission = "create"
	PermDelete     Permission = "delete"
	PermAdmin      Permission = "admin"
	PermSchema     Permission = "schema"
	PermUserManage Permission = "user_manage"
)

// RolePermissions maps roles to their allowed permissions.
// Follows Mimir's RBAC model.
var RolePermissions = map[Role][]Permission{
	RoleAdmin:  {PermRead, PermWrite, PermCreate, PermDelete, PermAdmin, PermSchema, PermUserManage},
	RoleEditor: {PermRead, PermWrite, PermCreate, PermDelete},
	RoleViewer: {PermRead},
	RoleNone:   {},
}

// User represents an authenticated user.
type User struct {
	ID           string            `json:"id"`
	Username     string            `json:"username"`
	Email        string            `json:"email,omitempty"`
	PasswordHash string            `json:"-"` // Never serialize
	Roles        []Role            `json:"roles"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
	LastLogin    time.Time         `json:"last_login,omitempty"`
	FailedLogins int               `json:"-"` // Internal tracking
	LockedUntil  time.Time         `json:"-"` // Internal tracking
	Disabled     bool              `json:"disabled,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

// HasRole checks if user has a specific role.
func (u *User) HasRole(role Role) bool {
	for _, r := range u.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// HasPermission checks if user has a specific permission through any of their roles.
func (u *User) HasPermission(perm Permission) bool {
	for _, role := range u.Roles {
		perms, ok := RolePermissions[role]
		if !ok {
			continue
		}
		for _, p := range perms {
			if p == perm {
				return true
			}
		}
	}
	return false
}

// JWTClaims represents the claims in a JWT token.
// Compatible with Mimir's JWT structure.
type JWTClaims struct {
	Sub      string   `json:"sub"`                   // Subject (user ID)
	Email    string   `json:"email,omitempty"`       // User email
	Username string   `json:"username,omitempty"`    // Username
	Roles    []string `json:"roles"`                 // User roles
	Iat      int64    `json:"iat"`                   // Issued at (Unix timestamp)
	Exp      int64    `json:"exp,omitempty"`         // Expiration (Unix timestamp, 0 = never)
}

// TokenResponse follows OAuth 2.0 RFC 6749 token response format.
// Compatible with Mimir's /auth/token endpoint.
type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`           // Always "Bearer"
	ExpiresIn   int64  `json:"expires_in,omitempty"` // Seconds until expiration (omitted if never expires)
	Scope       string `json:"scope,omitempty"`
}

// AuthConfig holds authentication configuration.
// Follows Mimir's configuration patterns.
type AuthConfig struct {
	// Password policy
	MinPasswordLength int
	BcryptCost        int

	// Token settings
	JWTSecret   []byte
	TokenExpiry time.Duration // 0 = never expire (Mimir default)

	// Lockout settings
	MaxFailedLogins int
	LockoutDuration time.Duration

	// Feature flags
	SecurityEnabled bool
}

// DefaultAuthConfig returns default authentication configuration.
// Matches Mimir's defaults for compatibility.
func DefaultAuthConfig() AuthConfig {
	return AuthConfig{
		MinPasswordLength: 8,
		BcryptCost:        bcrypt.DefaultCost,
		TokenExpiry:       0, // Never expire by default (Mimir behavior)
		MaxFailedLogins:   5,
		LockoutDuration:   15 * time.Minute,
		SecurityEnabled:   true,
	}
}

// Authenticator manages users and authentication.
type Authenticator struct {
	mu       sync.RWMutex
	users    map[string]*User // keyed by username
	config   AuthConfig

	// Audit callback for compliance logging
	auditLog func(event AuditEvent)
}

// AuditEvent represents an authentication-related event for compliance logging.
// Required for GDPR Art.30, HIPAA §164.312(b), FISMA AU controls.
type AuditEvent struct {
	Timestamp   time.Time `json:"timestamp"`
	EventType   string    `json:"event_type"`
	Username    string    `json:"username,omitempty"`
	UserID      string    `json:"user_id,omitempty"`
	IPAddress   string    `json:"ip_address,omitempty"`
	UserAgent   string    `json:"user_agent,omitempty"`
	Success     bool      `json:"success"`
	Details     string    `json:"details,omitempty"`
	RequestPath string    `json:"request_path,omitempty"`
}

// NewAuthenticator creates a new authenticator with the given configuration.
func NewAuthenticator(config AuthConfig) (*Authenticator, error) {
	if config.SecurityEnabled && len(config.JWTSecret) == 0 {
		return nil, ErrMissingSecret
	}

	if config.BcryptCost == 0 {
		config.BcryptCost = bcrypt.DefaultCost
	}
	if config.MinPasswordLength == 0 {
		config.MinPasswordLength = 8
	}
	if config.MaxFailedLogins == 0 {
		config.MaxFailedLogins = 5
	}
	if config.LockoutDuration == 0 {
		config.LockoutDuration = 15 * time.Minute
	}

	return &Authenticator{
		users:  make(map[string]*User),
		config: config,
	}, nil
}

// SetAuditLogger sets the audit logging callback.
func (a *Authenticator) SetAuditLogger(fn func(AuditEvent)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.auditLog = fn
}

func (a *Authenticator) logAudit(event AuditEvent) {
	if a.auditLog != nil {
		event.Timestamp = time.Now()
		a.auditLog(event)
	}
}

// CreateUser creates a new user with the given credentials.
func (a *Authenticator) CreateUser(username, password string, roles []Role) (*User, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Check if user exists
	if _, exists := a.users[username]; exists {
		a.logAudit(AuditEvent{
			EventType: "user_create",
			Username:  username,
			Success:   false,
			Details:   "user already exists",
		})
		return nil, ErrUserExists
	}

	// Validate password
	if len(password) < a.config.MinPasswordLength {
		return nil, fmt.Errorf("%w: minimum %d characters required", ErrPasswordTooShort, a.config.MinPasswordLength)
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), a.config.BcryptCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Default to viewer role if none specified
	if len(roles) == 0 {
		roles = []Role{RoleViewer}
	}

	// Create user
	now := time.Now()
	user := &User{
		ID:           generateID(),
		Username:     username,
		Email:        username + "@localhost", // Mimir pattern for dev users
		PasswordHash: string(hash),
		Roles:        roles,
		CreatedAt:    now,
		UpdatedAt:    now,
		Metadata:     make(map[string]string),
	}

	a.users[username] = user

	a.logAudit(AuditEvent{
		EventType: "user_create",
		Username:  username,
		UserID:    user.ID,
		Success:   true,
		Details:   fmt.Sprintf("created with roles %v", roles),
	})

	// Return copy without password hash
	return a.copyUserSafe(user), nil
}

// Authenticate verifies credentials and returns a JWT token response.
// Compatible with Mimir's /auth/token endpoint (OAuth 2.0 password grant).
func (a *Authenticator) Authenticate(username, password, ipAddress, userAgent string) (*TokenResponse, *User, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		a.logAudit(AuditEvent{
			EventType: "login",
			Username:  username,
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Success:   false,
			Details:   "user not found",
		})
		return nil, nil, ErrInvalidCredentials // Don't reveal if user exists
	}

	// Check if account is locked
	if !user.LockedUntil.IsZero() && time.Now().Before(user.LockedUntil) {
		a.logAudit(AuditEvent{
			EventType: "login",
			Username:  username,
			UserID:    user.ID,
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Success:   false,
			Details:   "account locked",
		})
		return nil, nil, ErrAccountLocked
	}

	// Check if account is disabled
	if user.Disabled {
		a.logAudit(AuditEvent{
			EventType: "login",
			Username:  username,
			UserID:    user.ID,
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Success:   false,
			Details:   "account disabled",
		})
		return nil, nil, ErrInvalidCredentials
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		// Increment failed login counter
		user.FailedLogins++
		if user.FailedLogins >= a.config.MaxFailedLogins {
			user.LockedUntil = time.Now().Add(a.config.LockoutDuration)
		}
		user.UpdatedAt = time.Now()

		a.logAudit(AuditEvent{
			EventType: "login",
			Username:  username,
			UserID:    user.ID,
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Success:   false,
			Details:   fmt.Sprintf("invalid password (attempt %d/%d)", user.FailedLogins, a.config.MaxFailedLogins),
		})
		return nil, nil, ErrInvalidCredentials
	}

	// Reset failed login counter on success
	user.FailedLogins = 0
	user.LockedUntil = time.Time{}
	user.LastLogin = time.Now()
	user.UpdatedAt = time.Now()

	// Generate JWT token (Mimir-compatible)
	token, err := a.generateJWT(user)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate token: %w", err)
	}

	// Build OAuth 2.0 compliant response
	response := &TokenResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		Scope:       "default",
	}

	// Only include expires_in if token actually expires
	if a.config.TokenExpiry > 0 {
		response.ExpiresIn = int64(a.config.TokenExpiry.Seconds())
	}

	a.logAudit(AuditEvent{
		EventType: "login",
		Username:  username,
		UserID:    user.ID,
		IPAddress: ipAddress,
		UserAgent: userAgent,
		Success:   true,
		Details:   "token generated",
	})

	return response, a.copyUserSafe(user), nil
}

// ValidateToken validates a JWT token and returns the claims if valid.
// Supports Bearer tokens from Authorization header, cookies, or query params.
func (a *Authenticator) ValidateToken(token string) (*JWTClaims, error) {
	if !a.config.SecurityEnabled {
		// Security disabled - return dummy claims
		return &JWTClaims{
			Sub:   "anonymous",
			Roles: []string{string(RoleAdmin)},
		}, nil
	}

	if token == "" {
		return nil, ErrNoCredentials
	}

	// Strip "Bearer " prefix if present
	token = strings.TrimPrefix(token, "Bearer ")
	token = strings.TrimSpace(token)

	return a.verifyJWT(token)
}

// GetUserByID retrieves a user by their ID.
func (a *Authenticator) GetUserByID(id string) (*User, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	for _, user := range a.users {
		if user.ID == id {
			return a.copyUserSafe(user), nil
		}
	}
	return nil, ErrUserNotFound
}

// GetUser returns user info by username without sensitive data.
func (a *Authenticator) GetUser(username string) (*User, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	user, exists := a.users[username]
	if !exists {
		return nil, ErrUserNotFound
	}

	return a.copyUserSafe(user), nil
}

// ListUsers returns all users without sensitive data.
func (a *Authenticator) ListUsers() []*User {
	a.mu.RLock()
	defer a.mu.RUnlock()

	users := make([]*User, 0, len(a.users))
	for _, u := range a.users {
		users = append(users, a.copyUserSafe(u))
	}
	return users
}

// ChangePassword updates a user's password.
func (a *Authenticator) ChangePassword(username, oldPassword, newPassword string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		return ErrUserNotFound
	}

	// Verify old password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
		a.logAudit(AuditEvent{
			EventType: "password_change",
			Username:  username,
			UserID:    user.ID,
			Success:   false,
			Details:   "old password incorrect",
		})
		return ErrInvalidCredentials
	}

	// Validate new password
	if len(newPassword) < a.config.MinPasswordLength {
		return fmt.Errorf("%w: minimum %d characters required", ErrPasswordTooShort, a.config.MinPasswordLength)
	}

	// Hash new password
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), a.config.BcryptCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	user.PasswordHash = string(hash)
	user.UpdatedAt = time.Now()

	a.logAudit(AuditEvent{
		EventType: "password_change",
		Username:  username,
		UserID:    user.ID,
		Success:   true,
	})

	return nil
}

// UpdateRoles changes a user's roles.
func (a *Authenticator) UpdateRoles(username string, newRoles []Role) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		return ErrUserNotFound
	}

	oldRoles := user.Roles
	user.Roles = newRoles
	user.UpdatedAt = time.Now()

	a.logAudit(AuditEvent{
		EventType: "role_change",
		Username:  username,
		UserID:    user.ID,
		Success:   true,
		Details:   fmt.Sprintf("roles changed from %v to %v", oldRoles, newRoles),
	})

	return nil
}

// DisableUser disables a user account.
func (a *Authenticator) DisableUser(username string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		return ErrUserNotFound
	}

	user.Disabled = true
	user.UpdatedAt = time.Now()

	a.logAudit(AuditEvent{
		EventType: "user_disable",
		Username:  username,
		UserID:    user.ID,
		Success:   true,
	})

	return nil
}

// EnableUser re-enables a disabled user account.
func (a *Authenticator) EnableUser(username string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		return ErrUserNotFound
	}

	user.Disabled = false
	user.FailedLogins = 0
	user.LockedUntil = time.Time{}
	user.UpdatedAt = time.Now()

	a.logAudit(AuditEvent{
		EventType: "user_enable",
		Username:  username,
		UserID:    user.ID,
		Success:   true,
	})

	return nil
}

// UnlockUser manually unlocks a locked user account.
func (a *Authenticator) UnlockUser(username string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		return ErrUserNotFound
	}

	user.FailedLogins = 0
	user.LockedUntil = time.Time{}
	user.UpdatedAt = time.Now()

	a.logAudit(AuditEvent{
		EventType: "user_unlock",
		Username:  username,
		UserID:    user.ID,
		Success:   true,
	})

	return nil
}

// DeleteUser removes a user.
func (a *Authenticator) DeleteUser(username string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	user, exists := a.users[username]
	if !exists {
		return ErrUserNotFound
	}

	userID := user.ID
	delete(a.users, username)

	a.logAudit(AuditEvent{
		EventType: "user_delete",
		Username:  username,
		UserID:    userID,
		Success:   true,
	})

	return nil
}

// UserCount returns the number of registered users.
func (a *Authenticator) UserCount() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return len(a.users)
}

// IsSecurityEnabled returns whether security is enabled.
func (a *Authenticator) IsSecurityEnabled() bool {
	return a.config.SecurityEnabled
}

// JWT Generation and Validation (Mimir-compatible)

// generateJWT creates a JWT token for the user.
// Uses HS256 algorithm matching Mimir's implementation.
func (a *Authenticator) generateJWT(user *User) (string, error) {
	if len(a.config.JWTSecret) == 0 {
		return "", ErrMissingSecret
	}

	now := time.Now().Unix()

	// Convert roles to strings
	roles := make([]string, len(user.Roles))
	for i, r := range user.Roles {
		roles[i] = string(r)
	}

	claims := JWTClaims{
		Sub:      user.ID,
		Email:    user.Email,
		Username: user.Username,
		Roles:    roles,
		Iat:      now,
	}

	// Only set expiration if configured (0 = never expire, Mimir default)
	if a.config.TokenExpiry > 0 {
		claims.Exp = now + int64(a.config.TokenExpiry.Seconds())
	}

	// Build JWT manually (header.payload.signature)
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}

	headerJSON, _ := json.Marshal(header)
	claimsJSON, _ := json.Marshal(claims)

	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsJSON)

	// Sign with HMAC-SHA256
	message := headerB64 + "." + claimsB64
	mac := hmac.New(sha256.New, a.config.JWTSecret)
	mac.Write([]byte(message))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return message + "." + signature, nil
}

// verifyJWT validates a JWT token and returns the claims.
func (a *Authenticator) verifyJWT(token string) (*JWTClaims, error) {
	if len(a.config.JWTSecret) == 0 {
		return nil, ErrMissingSecret
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}

	// Verify signature
	message := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, a.config.JWTSecret)
	mac.Write([]byte(message))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	// Constant-time comparison to prevent timing attacks
	if !SecureCompare(parts[2], expectedSig) {
		return nil, ErrInvalidToken
	}

	// Decode claims
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrInvalidToken
	}

	var claims JWTClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, ErrInvalidToken
	}

	// Check expiration (0 = never expires)
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, ErrSessionExpired
	}

	return &claims, nil
}

// copyUserSafe returns a copy of user without sensitive data.
func (a *Authenticator) copyUserSafe(u *User) *User {
	roles := make([]Role, len(u.Roles))
	copy(roles, u.Roles)

	metadata := make(map[string]string)
	for k, v := range u.Metadata {
		metadata[k] = v
	}

	return &User{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Roles:     roles,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
		LastLogin: u.LastLogin,
		Disabled:  u.Disabled,
		Metadata:  metadata,
	}
}

// Helper functions

func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// SecureCompare performs a constant-time string comparison.
// Prevents timing attacks on token validation.
func SecureCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// ValidRole checks if a role is valid.
func ValidRole(r Role) bool {
	switch r {
	case RoleAdmin, RoleEditor, RoleViewer, RoleNone:
		return true
	default:
		return false
	}
}

// RoleFromString converts a string to a Role.
func RoleFromString(s string) (Role, error) {
	r := Role(s)
	if !ValidRole(r) {
		return RoleNone, fmt.Errorf("invalid role: %s", s)
	}
	return r, nil
}

// HasCredentials checks if a request has any form of authentication credentials.
// Compatible with Mimir's hasAuthCredentials() helper.
// Checks: Authorization header, X-API-Key header, cookie, query params.
func HasCredentials(authHeader, apiKeyHeader, cookie, queryToken, queryAPIKey string) bool {
	return authHeader != "" ||
		apiKeyHeader != "" ||
		cookie != "" ||
		queryToken != "" ||
		queryAPIKey != ""
}

// ExtractToken extracts the token from various sources.
// Priority: Authorization header > X-API-Key > Cookie > Query param
// Compatible with Mimir's token extraction pattern.
func ExtractToken(authHeader, apiKeyHeader, cookie, queryToken, queryAPIKey string) string {
	// 1. Authorization: Bearer header (OAuth 2.0 RFC 6750 standard)
	if authHeader != "" {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}

	// 2. X-API-Key header (common alternative)
	if apiKeyHeader != "" {
		return apiKeyHeader
	}

	// 3. Cookie (browser sessions)
	if cookie != "" {
		return cookie
	}

	// 4. Query parameter (SSE connections that can't send headers)
	if queryToken != "" {
		return queryToken
	}
	if queryAPIKey != "" {
		return queryAPIKey
	}

	return ""
}
