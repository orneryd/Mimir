// Package audit provides compliance audit logging for NornicDB.
// Implements immutable audit trails required by:
// - GDPR Art.30 (records of processing activities)
// - HIPAA §164.312(b) (audit controls)
// - FISMA AU controls (audit and accountability)
// - SOC2 CC7 (system monitoring)
package audit

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// EventType categorizes audit events for compliance reporting.
type EventType string

const (
	// Authentication events
	EventLogin         EventType = "LOGIN"
	EventLogout        EventType = "LOGOUT"
	EventLoginFailed   EventType = "LOGIN_FAILED"
	EventPasswordChange EventType = "PASSWORD_CHANGE"

	// Authorization events
	EventAccessDenied  EventType = "ACCESS_DENIED"
	EventRoleChange    EventType = "ROLE_CHANGE"

	// Data access events (GDPR Art.15 - right of access)
	EventDataRead      EventType = "DATA_READ"
	EventDataCreate    EventType = "DATA_CREATE"
	EventDataUpdate    EventType = "DATA_UPDATE"
	EventDataDelete    EventType = "DATA_DELETE"
	EventDataExport    EventType = "DATA_EXPORT"

	// Data subject rights (GDPR)
	EventErasureRequest EventType = "ERASURE_REQUEST"
	EventErasureComplete EventType = "ERASURE_COMPLETE"
	EventConsentGiven   EventType = "CONSENT_GIVEN"
	EventConsentRevoked EventType = "CONSENT_REVOKED"

	// System events
	EventConfigChange   EventType = "CONFIG_CHANGE"
	EventBackup         EventType = "BACKUP"
	EventRestore        EventType = "RESTORE"
	EventSchemaChange   EventType = "SCHEMA_CHANGE"

	// Security events
	EventSecurityAlert  EventType = "SECURITY_ALERT"
	EventBreach         EventType = "BREACH_DETECTED"
)

// Event represents an immutable audit log entry.
// Fields are designed for compliance reporting requirements.
type Event struct {
	// Unique event identifier
	ID string `json:"id"`

	// Timestamp in RFC3339 format (ISO 8601)
	Timestamp time.Time `json:"timestamp"`

	// Event classification
	Type EventType `json:"type"`

	// Actor information
	UserID    string `json:"user_id,omitempty"`
	Username  string `json:"username,omitempty"`
	IPAddress string `json:"ip_address,omitempty"`
	UserAgent string `json:"user_agent,omitempty"`

	// Resource information
	Resource   string `json:"resource,omitempty"`   // e.g., "node", "edge", "user"
	ResourceID string `json:"resource_id,omitempty"`
	Action     string `json:"action,omitempty"`     // e.g., "create", "read", "update", "delete"

	// Outcome
	Success bool   `json:"success"`
	Reason  string `json:"reason,omitempty"` // Failure reason or additional context

	// Data classification (for HIPAA PHI tracking)
	DataClassification string `json:"data_classification,omitempty"` // e.g., "PHI", "PII", "PUBLIC"

	// Request context
	RequestID   string `json:"request_id,omitempty"`
	SessionID   string `json:"session_id,omitempty"`
	RequestPath string `json:"request_path,omitempty"`

	// Additional metadata
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Logger handles audit log writing with compliance guarantees.
type Logger struct {
	mu       sync.Mutex
	writer   io.Writer
	file     *os.File
	config   Config
	sequence uint64
	closed   bool

	// Callback for real-time alerting (breach detection)
	alertCallback func(Event)
}

// Config holds audit logger configuration.
type Config struct {
	// Enabled controls whether audit logging is active
	Enabled bool

	// LogPath is the path to the audit log file
	LogPath string

	// RetentionDays is how long to keep audit logs (HIPAA: 2190 days/6 years, SOC2: 2555 days/7 years)
	RetentionDays int

	// RotationSize is the max file size before rotation (bytes)
	RotationSize int64

	// RotationInterval is how often to rotate logs
	RotationInterval time.Duration

	// SyncWrites forces fsync after each write (slower but more durable)
	SyncWrites bool

	// IncludeStackTrace adds stack traces to error events
	IncludeStackTrace bool

	// AlertOnEvents triggers alerts for specific event types
	AlertOnEvents []EventType
}

// DefaultConfig returns sensible defaults for audit logging.
func DefaultConfig() Config {
	return Config{
		Enabled:          true,
		LogPath:          "./logs/audit.log",
		RetentionDays:    2555, // 7 years for SOC2
		RotationSize:     100 * 1024 * 1024, // 100MB
		RotationInterval: 24 * time.Hour,
		SyncWrites:       true,
		AlertOnEvents:    []EventType{EventBreach, EventSecurityAlert, EventAccessDenied},
	}
}

// NewLogger creates a new audit logger.
func NewLogger(config Config) (*Logger, error) {
	if !config.Enabled {
		return &Logger{config: config}, nil
	}

	// Ensure log directory exists
	dir := filepath.Dir(config.LogPath)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("creating audit log directory: %w", err)
	}

	// Open log file with append mode
	file, err := os.OpenFile(config.LogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0640)
	if err != nil {
		return nil, fmt.Errorf("opening audit log file: %w", err)
	}

	return &Logger{
		writer: file,
		file:   file,
		config: config,
	}, nil
}

// NewLoggerWithWriter creates a logger with a custom writer (for testing).
func NewLoggerWithWriter(writer io.Writer, config Config) *Logger {
	return &Logger{
		writer: writer,
		config: config,
	}
}

// SetAlertCallback sets a callback for real-time security alerting.
func (l *Logger) SetAlertCallback(fn func(Event)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.alertCallback = fn
}

// Log records an audit event.
func (l *Logger) Log(event Event) error {
	if !l.config.Enabled {
		return nil
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if l.closed {
		return fmt.Errorf("audit logger is closed")
	}

	// Set timestamp if not provided
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}

	// Generate ID if not provided
	if event.ID == "" {
		l.sequence++
		event.ID = fmt.Sprintf("audit-%d-%d", event.Timestamp.UnixNano(), l.sequence)
	}

	// Serialize to JSON
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshaling audit event: %w", err)
	}

	// Write with newline
	if _, err := l.writer.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("writing audit event: %w", err)
	}

	// Sync if configured
	if l.config.SyncWrites && l.file != nil {
		if err := l.file.Sync(); err != nil {
			return fmt.Errorf("syncing audit log: %w", err)
		}
	}

	// Check for alert-worthy events
	if l.alertCallback != nil {
		for _, alertType := range l.config.AlertOnEvents {
			if event.Type == alertType {
				l.alertCallback(event)
				break
			}
		}
	}

	return nil
}

// LogAuth logs an authentication event.
func (l *Logger) LogAuth(eventType EventType, userID, username, ip, userAgent string, success bool, reason string) error {
	return l.Log(Event{
		Type:      eventType,
		UserID:    userID,
		Username:  username,
		IPAddress: ip,
		UserAgent: userAgent,
		Success:   success,
		Reason:    reason,
		Resource:  "session",
	})
}

// LogDataAccess logs a data access event (GDPR compliance).
func (l *Logger) LogDataAccess(userID, username, resourceType, resourceID, action string, success bool, classification string) error {
	return l.Log(Event{
		Type:               EventType("DATA_" + action),
		UserID:             userID,
		Username:           username,
		Resource:           resourceType,
		ResourceID:         resourceID,
		Action:             action,
		Success:            success,
		DataClassification: classification,
	})
}

// LogErasure logs a data erasure event (GDPR Art.17 - right to be forgotten).
func (l *Logger) LogErasure(userID, username, targetUserID string, complete bool, details string) error {
	eventType := EventErasureRequest
	if complete {
		eventType = EventErasureComplete
	}

	return l.Log(Event{
		Type:       eventType,
		UserID:     userID,
		Username:   username,
		Resource:   "user_data",
		ResourceID: targetUserID,
		Success:    complete,
		Reason:     details,
		Metadata: map[string]string{
			"target_user_id": targetUserID,
		},
	})
}

// LogConsent logs a consent event (GDPR Art.7).
func (l *Logger) LogConsent(userID, username string, granted bool, consentType, version string) error {
	eventType := EventConsentGiven
	if !granted {
		eventType = EventConsentRevoked
	}

	return l.Log(Event{
		Type:     eventType,
		UserID:   userID,
		Username: username,
		Resource: "consent",
		Success:  true,
		Metadata: map[string]string{
			"consent_type":    consentType,
			"consent_version": version,
		},
	})
}

// LogSecurityEvent logs a security-related event.
func (l *Logger) LogSecurityEvent(eventType EventType, userID, ip, details string, metadata map[string]string) error {
	return l.Log(Event{
		Type:      eventType,
		UserID:    userID,
		IPAddress: ip,
		Success:   false, // Security events are typically alerts
		Reason:    details,
		Metadata:  metadata,
	})
}

// Close closes the audit logger.
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.closed = true
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

// Query allows searching audit logs (for compliance reporting).
type Query struct {
	StartTime  time.Time
	EndTime    time.Time
	EventTypes []EventType
	UserID     string
	ResourceID string
	Success    *bool
	Limit      int
	Offset     int
}

// QueryResult holds audit query results.
type QueryResult struct {
	Events     []Event
	TotalCount int
	HasMore    bool
}

// Reader provides audit log reading capabilities.
type Reader struct {
	path string
}

// NewReader creates an audit log reader.
func NewReader(path string) *Reader {
	return &Reader{path: path}
}

// Query searches the audit log based on criteria.
// Note: For production, this should use an indexed storage backend.
func (r *Reader) Query(q Query) (*QueryResult, error) {
	file, err := os.Open(r.path)
	if err != nil {
		if os.IsNotExist(err) {
			return &QueryResult{Events: []Event{}}, nil
		}
		return nil, fmt.Errorf("opening audit log: %w", err)
	}
	defer file.Close()

	var events []Event
	decoder := json.NewDecoder(file)

	for {
		var event Event
		if err := decoder.Decode(&event); err != nil {
			if err == io.EOF {
				break
			}
			// Skip malformed entries
			continue
		}

		// Apply filters
		if !q.StartTime.IsZero() && event.Timestamp.Before(q.StartTime) {
			continue
		}
		if !q.EndTime.IsZero() && event.Timestamp.After(q.EndTime) {
			continue
		}
		if len(q.EventTypes) > 0 && !containsEventType(q.EventTypes, event.Type) {
			continue
		}
		if q.UserID != "" && event.UserID != q.UserID {
			continue
		}
		if q.ResourceID != "" && event.ResourceID != q.ResourceID {
			continue
		}
		if q.Success != nil && event.Success != *q.Success {
			continue
		}

		events = append(events, event)
	}

	// Apply pagination
	total := len(events)
	if q.Offset > 0 {
		if q.Offset >= len(events) {
			events = nil
		} else {
			events = events[q.Offset:]
		}
	}
	if q.Limit > 0 && len(events) > q.Limit {
		events = events[:q.Limit]
	}

	return &QueryResult{
		Events:     events,
		TotalCount: total,
		HasMore:    q.Offset+len(events) < total,
	}, nil
}

// GetUserActivity retrieves all audit events for a user (GDPR Art.15 - right of access).
func (r *Reader) GetUserActivity(userID string, start, end time.Time) (*QueryResult, error) {
	return r.Query(Query{
		UserID:    userID,
		StartTime: start,
		EndTime:   end,
	})
}

// GetDataAccessReport generates a data access report for compliance.
func (r *Reader) GetDataAccessReport(start, end time.Time) (*QueryResult, error) {
	return r.Query(Query{
		StartTime: start,
		EndTime:   end,
		EventTypes: []EventType{
			EventDataRead,
			EventDataCreate,
			EventDataUpdate,
			EventDataDelete,
			EventDataExport,
		},
	})
}

// GetSecurityReport generates a security events report.
func (r *Reader) GetSecurityReport(start, end time.Time) (*QueryResult, error) {
	return r.Query(Query{
		StartTime: start,
		EndTime:   end,
		EventTypes: []EventType{
			EventLoginFailed,
			EventAccessDenied,
			EventSecurityAlert,
			EventBreach,
		},
	})
}

func containsEventType(types []EventType, t EventType) bool {
	for _, et := range types {
		if et == t {
			return true
		}
	}
	return false
}

// ComplianceReport generates a compliance report for a time period.
type ComplianceReport struct {
	Period           string            `json:"period"`
	StartTime        time.Time         `json:"start_time"`
	EndTime          time.Time         `json:"end_time"`
	TotalEvents      int               `json:"total_events"`
	EventsByType     map[EventType]int `json:"events_by_type"`
	FailedLogins     int               `json:"failed_logins"`
	AccessDenied     int               `json:"access_denied"`
	DataAccesses     int               `json:"data_accesses"`
	ErasureRequests  int               `json:"erasure_requests"`
	SecurityAlerts   int               `json:"security_alerts"`
	UniqueUsers      int               `json:"unique_users"`
	GeneratedAt      time.Time         `json:"generated_at"`
}

// GenerateComplianceReport creates a summary report for compliance auditors.
func (r *Reader) GenerateComplianceReport(start, end time.Time, periodName string) (*ComplianceReport, error) {
	result, err := r.Query(Query{
		StartTime: start,
		EndTime:   end,
	})
	if err != nil {
		return nil, err
	}

	report := &ComplianceReport{
		Period:       periodName,
		StartTime:    start,
		EndTime:      end,
		TotalEvents:  result.TotalCount,
		EventsByType: make(map[EventType]int),
		GeneratedAt:  time.Now().UTC(),
	}

	uniqueUsers := make(map[string]bool)

	for _, event := range result.Events {
		report.EventsByType[event.Type]++

		if event.UserID != "" {
			uniqueUsers[event.UserID] = true
		}

		switch event.Type {
		case EventLoginFailed:
			report.FailedLogins++
		case EventAccessDenied:
			report.AccessDenied++
		case EventDataRead, EventDataCreate, EventDataUpdate, EventDataDelete:
			report.DataAccesses++
		case EventErasureRequest, EventErasureComplete:
			report.ErasureRequests++
		case EventSecurityAlert, EventBreach:
			report.SecurityAlerts++
		}
	}

	report.UniqueUsers = len(uniqueUsers)

	return report, nil
}
