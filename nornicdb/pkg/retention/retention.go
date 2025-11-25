// Package retention provides data lifecycle and retention policy management for NornicDB.
//
// This package implements compliance-driven data retention following:
//   - GDPR Art.5(1)(e): Storage limitation principle
//   - GDPR Art.17: Right to erasure ("right to be forgotten")
//   - HIPAA §164.530(j): Record retention (6 years)
//   - FISMA AU-11: Audit Record Retention
//   - SOC2 CC7.4: Records retention
//
// Features:
//   - Configurable retention policies per data type
//   - Automatic data expiration and cleanup
//   - Legal hold support
//   - Data subject erasure (GDPR right to erasure)
//   - Archive before deletion option
//   - Retention policy inheritance
package retention

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Errors
var (
	ErrPolicyNotFound   = errors.New("retention: policy not found")
	ErrLegalHold        = errors.New("retention: data under legal hold cannot be deleted")
	ErrInvalidPolicy    = errors.New("retention: invalid policy configuration")
	ErrAlreadyExists    = errors.New("retention: policy already exists")
	ErrErasureInProgress = errors.New("retention: erasure already in progress")
)

// DataCategory represents a category of data for retention purposes.
type DataCategory string

const (
	// Standard categories
	CategorySystem    DataCategory = "SYSTEM"    // System/infrastructure data
	CategoryAudit     DataCategory = "AUDIT"     // Audit logs
	CategoryUser      DataCategory = "USER"      // User-created data
	CategoryAnalytics DataCategory = "ANALYTICS" // Analytics/metrics data
	CategoryBackup    DataCategory = "BACKUP"    // Backup data
	CategoryArchive   DataCategory = "ARCHIVE"   // Archived data

	// Compliance-specific categories
	CategoryPHI      DataCategory = "PHI"      // Protected Health Information (HIPAA)
	CategoryPII      DataCategory = "PII"      // Personally Identifiable Information (GDPR)
	CategoryFinancial DataCategory = "FINANCIAL" // Financial records (SOX)
	CategoryLegal    DataCategory = "LEGAL"    // Legal documents
)

// RetentionPeriod defines a time-based retention period.
type RetentionPeriod struct {
	Duration   time.Duration // How long to retain
	Indefinite bool          // Retain forever
}

// Policy defines a retention policy for a data category.
type Policy struct {
	// Unique policy identifier
	ID string `json:"id"`

	// Human-readable name
	Name string `json:"name"`

	// Data category this policy applies to
	Category DataCategory `json:"category"`

	// How long to retain data
	RetentionPeriod RetentionPeriod `json:"retention_period"`

	// Archive data before deletion
	ArchiveBeforeDelete bool `json:"archive_before_delete"`

	// Archive location path
	ArchivePath string `json:"archive_path,omitempty"`

	// Compliance frameworks this policy satisfies
	ComplianceFrameworks []string `json:"compliance_frameworks,omitempty"`

	// Whether policy is active
	Active bool `json:"active"`

	// When policy was created
	CreatedAt time.Time `json:"created_at"`

	// When policy was last modified
	UpdatedAt time.Time `json:"updated_at"`

	// Description/notes
	Description string `json:"description,omitempty"`
}

// Validate checks if the policy is valid.
func (p *Policy) Validate() error {
	if p.ID == "" {
		return fmt.Errorf("%w: ID required", ErrInvalidPolicy)
	}
	if p.Category == "" {
		return fmt.Errorf("%w: category required", ErrInvalidPolicy)
	}
	if !p.RetentionPeriod.Indefinite && p.RetentionPeriod.Duration <= 0 {
		return fmt.Errorf("%w: retention period required", ErrInvalidPolicy)
	}
	if p.ArchiveBeforeDelete && p.ArchivePath == "" {
		return fmt.Errorf("%w: archive path required when archiving", ErrInvalidPolicy)
	}
	return nil
}

// IsExpired returns true if data created at the given time should be deleted.
func (p *Policy) IsExpired(createdAt time.Time) bool {
	if p.RetentionPeriod.Indefinite {
		return false
	}
	return time.Now().After(createdAt.Add(p.RetentionPeriod.Duration))
}

// LegalHold represents a legal hold on data.
type LegalHold struct {
	// Unique identifier
	ID string `json:"id"`

	// Description of the hold
	Description string `json:"description"`

	// Matter/case reference
	Matter string `json:"matter,omitempty"`

	// Who placed the hold
	PlacedBy string `json:"placed_by"`

	// When the hold was placed
	PlacedAt time.Time `json:"placed_at"`

	// When the hold expires (zero = indefinite)
	ExpiresAt time.Time `json:"expires_at,omitempty"`

	// Data subject IDs under hold
	SubjectIDs []string `json:"subject_ids,omitempty"`

	// Data categories under hold
	Categories []DataCategory `json:"categories,omitempty"`

	// Whether hold is active
	Active bool `json:"active"`
}

// IsActive returns true if the legal hold is currently active.
func (h *LegalHold) IsActive() bool {
	if !h.Active {
		return false
	}
	if h.ExpiresAt.IsZero() {
		return true
	}
	return time.Now().Before(h.ExpiresAt)
}

// CoversData returns true if the hold covers the given subject and category.
func (h *LegalHold) CoversData(subjectID string, category DataCategory) bool {
	if !h.IsActive() {
		return false
	}

	// Check subject
	subjectMatch := len(h.SubjectIDs) == 0 // Empty = all subjects
	for _, id := range h.SubjectIDs {
		if id == subjectID {
			subjectMatch = true
			break
		}
	}

	// Check category
	categoryMatch := len(h.Categories) == 0 // Empty = all categories
	for _, cat := range h.Categories {
		if cat == category {
			categoryMatch = true
			break
		}
	}

	return subjectMatch && categoryMatch
}

// ErasureRequest represents a data subject erasure request (GDPR Art.17).
type ErasureRequest struct {
	// Unique request ID
	ID string `json:"id"`

	// Subject ID (user) requesting erasure
	SubjectID string `json:"subject_id"`

	// Email/identifier for verification
	SubjectEmail string `json:"subject_email,omitempty"`

	// When request was received
	RequestedAt time.Time `json:"requested_at"`

	// Deadline for completion (GDPR: 30 days)
	Deadline time.Time `json:"deadline"`

	// Current status
	Status ErasureStatus `json:"status"`

	// Items found for erasure
	ItemsFound int `json:"items_found"`

	// Items erased
	ItemsErased int `json:"items_erased"`

	// Items retained (with reason)
	ItemsRetained int `json:"items_retained"`

	// Reason for any retained items
	RetainedReason string `json:"retained_reason,omitempty"`

	// When processing started
	StartedAt time.Time `json:"started_at,omitempty"`

	// When processing completed
	CompletedAt time.Time `json:"completed_at,omitempty"`

	// Error message if failed
	Error string `json:"error,omitempty"`

	// Whether subject was notified of completion
	SubjectNotified bool `json:"subject_notified"`
}

// ErasureStatus represents the status of an erasure request.
type ErasureStatus string

const (
	ErasureStatusPending    ErasureStatus = "PENDING"
	ErasureStatusInProgress ErasureStatus = "IN_PROGRESS"
	ErasureStatusCompleted  ErasureStatus = "COMPLETED"
	ErasureStatusFailed     ErasureStatus = "FAILED"
	ErasureStatusPartial    ErasureStatus = "PARTIAL" // Some items retained
)

// DataRecord represents a record that may be subject to retention.
type DataRecord struct {
	// Unique record ID
	ID string `json:"id"`

	// Subject ID (owner/user)
	SubjectID string `json:"subject_id,omitempty"`

	// Data category
	Category DataCategory `json:"category"`

	// When record was created
	CreatedAt time.Time `json:"created_at"`

	// When record was last accessed
	LastAccessedAt time.Time `json:"last_accessed_at,omitempty"`

	// Record metadata
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Manager manages retention policies and data lifecycle.
type Manager struct {
	mu         sync.RWMutex
	policies   map[string]*Policy
	holds      map[string]*LegalHold
	erasures   map[string]*ErasureRequest
	
	// Callbacks
	onDelete   func(record *DataRecord) error
	onArchive  func(record *DataRecord, archivePath string) error
	
	// Configuration
	defaultPolicy *Policy
}

// NewManager creates a new retention manager.
func NewManager() *Manager {
	return &Manager{
		policies: make(map[string]*Policy),
		holds:    make(map[string]*LegalHold),
		erasures: make(map[string]*ErasureRequest),
	}
}

// SetDefaultPolicy sets the default policy for data without a specific policy.
func (m *Manager) SetDefaultPolicy(policy *Policy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.defaultPolicy = policy
	return nil
}

// SetDeleteCallback sets the function called when data should be deleted.
func (m *Manager) SetDeleteCallback(fn func(record *DataRecord) error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onDelete = fn
}

// SetArchiveCallback sets the function called when data should be archived.
func (m *Manager) SetArchiveCallback(fn func(record *DataRecord, archivePath string) error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onArchive = fn
}

// AddPolicy adds a retention policy.
func (m *Manager) AddPolicy(policy *Policy) error {
	if err := policy.Validate(); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.policies[policy.ID]; exists {
		return ErrAlreadyExists
	}

	if policy.CreatedAt.IsZero() {
		policy.CreatedAt = time.Now().UTC()
	}
	policy.UpdatedAt = time.Now().UTC()

	m.policies[policy.ID] = policy
	return nil
}

// GetPolicy retrieves a policy by ID.
func (m *Manager) GetPolicy(id string) (*Policy, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	policy, ok := m.policies[id]
	if !ok {
		return nil, ErrPolicyNotFound
	}
	return policy, nil
}

// GetPolicyForCategory finds the policy for a data category.
func (m *Manager) GetPolicyForCategory(category DataCategory) (*Policy, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, p := range m.policies {
		if p.Active && p.Category == category {
			return p, nil
		}
	}

	if m.defaultPolicy != nil {
		return m.defaultPolicy, nil
	}

	return nil, ErrPolicyNotFound
}

// UpdatePolicy updates an existing policy.
func (m *Manager) UpdatePolicy(policy *Policy) error {
	if err := policy.Validate(); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.policies[policy.ID]; !exists {
		return ErrPolicyNotFound
	}

	policy.UpdatedAt = time.Now().UTC()
	m.policies[policy.ID] = policy
	return nil
}

// DeletePolicy removes a policy.
func (m *Manager) DeletePolicy(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.policies[id]; !exists {
		return ErrPolicyNotFound
	}

	delete(m.policies, id)
	return nil
}

// ListPolicies returns all policies.
func (m *Manager) ListPolicies() []*Policy {
	m.mu.RLock()
	defer m.mu.RUnlock()

	policies := make([]*Policy, 0, len(m.policies))
	for _, p := range m.policies {
		policies = append(policies, p)
	}
	return policies
}

// PlaceLegalHold places a legal hold.
func (m *Manager) PlaceLegalHold(hold *LegalHold) error {
	if hold.ID == "" {
		return fmt.Errorf("%w: ID required", ErrInvalidPolicy)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if hold.PlacedAt.IsZero() {
		hold.PlacedAt = time.Now().UTC()
	}
	hold.Active = true

	m.holds[hold.ID] = hold
	return nil
}

// ReleaseLegalHold releases a legal hold.
func (m *Manager) ReleaseLegalHold(holdID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	hold, ok := m.holds[holdID]
	if !ok {
		return ErrPolicyNotFound
	}

	hold.Active = false
	return nil
}

// GetLegalHold retrieves a legal hold by ID.
func (m *Manager) GetLegalHold(id string) (*LegalHold, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	hold, ok := m.holds[id]
	if !ok {
		return nil, ErrPolicyNotFound
	}
	return hold, nil
}

// ListLegalHolds returns all legal holds.
func (m *Manager) ListLegalHolds() []*LegalHold {
	m.mu.RLock()
	defer m.mu.RUnlock()

	holds := make([]*LegalHold, 0, len(m.holds))
	for _, h := range m.holds {
		holds = append(holds, h)
	}
	return holds
}

// IsUnderLegalHold checks if data is under any active legal hold.
func (m *Manager) IsUnderLegalHold(subjectID string, category DataCategory) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, hold := range m.holds {
		if hold.CoversData(subjectID, category) {
			return true
		}
	}
	return false
}

// ShouldDelete determines if a record should be deleted based on policies and holds.
func (m *Manager) ShouldDelete(record *DataRecord) (bool, string) {
	// Check legal holds first
	if m.IsUnderLegalHold(record.SubjectID, record.Category) {
		return false, "under legal hold"
	}

	// Get applicable policy
	policy, err := m.GetPolicyForCategory(record.Category)
	if err != nil {
		return false, "no policy found"
	}

	if !policy.Active {
		return false, "policy inactive"
	}

	// Check if expired
	if policy.IsExpired(record.CreatedAt) {
		return true, "retention period expired"
	}

	return false, "within retention period"
}

// ProcessRecord processes a record according to retention policies.
func (m *Manager) ProcessRecord(ctx context.Context, record *DataRecord) error {
	shouldDelete, reason := m.ShouldDelete(record)
	if !shouldDelete {
		return nil
	}

	// Get policy for archiving settings
	policy, _ := m.GetPolicyForCategory(record.Category)

	// Archive if configured
	if policy != nil && policy.ArchiveBeforeDelete {
		m.mu.RLock()
		archiveFn := m.onArchive
		m.mu.RUnlock()

		if archiveFn != nil {
			if err := archiveFn(record, policy.ArchivePath); err != nil {
				return fmt.Errorf("archive failed: %w", err)
			}
		}
	}

	// Delete
	m.mu.RLock()
	deleteFn := m.onDelete
	m.mu.RUnlock()

	if deleteFn != nil {
		if err := deleteFn(record); err != nil {
			return fmt.Errorf("delete failed (%s): %w", reason, err)
		}
	}

	return nil
}

// CreateErasureRequest creates a new data subject erasure request.
func (m *Manager) CreateErasureRequest(subjectID, subjectEmail string) (*ErasureRequest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if erasure already in progress for this subject
	for _, req := range m.erasures {
		if req.SubjectID == subjectID && req.Status == ErasureStatusInProgress {
			return nil, ErrErasureInProgress
		}
	}

	now := time.Now().UTC()
	req := &ErasureRequest{
		ID:           fmt.Sprintf("erasure-%d", now.UnixNano()),
		SubjectID:    subjectID,
		SubjectEmail: subjectEmail,
		RequestedAt:  now,
		Deadline:     now.Add(30 * 24 * time.Hour), // GDPR: 30 days
		Status:       ErasureStatusPending,
	}

	m.erasures[req.ID] = req
	return req, nil
}

// GetErasureRequest retrieves an erasure request by ID.
func (m *Manager) GetErasureRequest(id string) (*ErasureRequest, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	req, ok := m.erasures[id]
	if !ok {
		return nil, ErrPolicyNotFound
	}
	return req, nil
}

// ListErasureRequests returns all erasure requests.
func (m *Manager) ListErasureRequests() []*ErasureRequest {
	m.mu.RLock()
	defer m.mu.RUnlock()

	reqs := make([]*ErasureRequest, 0, len(m.erasures))
	for _, r := range m.erasures {
		reqs = append(reqs, r)
	}
	return reqs
}

// ProcessErasure processes an erasure request with the given records.
func (m *Manager) ProcessErasure(ctx context.Context, requestID string, records []*DataRecord) error {
	m.mu.Lock()
	req, ok := m.erasures[requestID]
	if !ok {
		m.mu.Unlock()
		return ErrPolicyNotFound
	}

	req.Status = ErasureStatusInProgress
	req.StartedAt = time.Now().UTC()
	req.ItemsFound = len(records)
	m.mu.Unlock()

	erased := 0
	retained := 0
	var retainedReasons []string

	for _, record := range records {
		select {
		case <-ctx.Done():
			m.updateErasureStatus(requestID, ErasureStatusFailed, erased, retained, "context cancelled", retainedReasons)
			return ctx.Err()
		default:
		}

		// Check legal holds
		if m.IsUnderLegalHold(record.SubjectID, record.Category) {
			retained++
			retainedReasons = append(retainedReasons, fmt.Sprintf("%s: legal hold", record.ID))
			continue
		}

		// Delete
		m.mu.RLock()
		deleteFn := m.onDelete
		m.mu.RUnlock()

		if deleteFn != nil {
			if err := deleteFn(record); err != nil {
				m.updateErasureStatus(requestID, ErasureStatusFailed, erased, retained, err.Error(), retainedReasons)
				return err
			}
		}
		erased++
	}

	// Determine final status
	status := ErasureStatusCompleted
	if retained > 0 {
		status = ErasureStatusPartial
	}

	m.updateErasureStatus(requestID, status, erased, retained, "", retainedReasons)
	return nil
}

func (m *Manager) updateErasureStatus(requestID string, status ErasureStatus, erased, retained int, errMsg string, retainedReasons []string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	req, ok := m.erasures[requestID]
	if !ok {
		return
	}

	req.Status = status
	req.ItemsErased = erased
	req.ItemsRetained = retained
	req.Error = errMsg
	if len(retainedReasons) > 0 {
		req.RetainedReason = fmt.Sprintf("%d items retained: %v", retained, retainedReasons)
	}
	if status == ErasureStatusCompleted || status == ErasureStatusPartial || status == ErasureStatusFailed {
		req.CompletedAt = time.Now().UTC()
	}
}

// SavePolicies saves all policies to a JSON file.
func (m *Manager) SavePolicies(path string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	policies := make([]*Policy, 0, len(m.policies))
	for _, p := range m.policies {
		policies = append(policies, p)
	}

	data, err := json.MarshalIndent(policies, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// LoadPolicies loads policies from a JSON file.
func (m *Manager) LoadPolicies(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var policies []*Policy
	if err := json.Unmarshal(data, &policies); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, p := range policies {
		if err := p.Validate(); err != nil {
			continue // Skip invalid
		}
		m.policies[p.ID] = p
	}

	return nil
}

// DefaultPolicies returns a set of compliance-ready default policies.
func DefaultPolicies() []*Policy {
	now := time.Now().UTC()
	return []*Policy{
		{
			ID:       "audit-7y",
			Name:     "Audit Logs (7 Years)",
			Category: CategoryAudit,
			RetentionPeriod: RetentionPeriod{
				Duration: 7 * 365 * 24 * time.Hour,
			},
			ArchiveBeforeDelete:  true,
			ArchivePath:          "/archive/audit",
			ComplianceFrameworks: []string{"HIPAA", "SOX", "FISMA"},
			Active:               true,
			CreatedAt:            now,
			UpdatedAt:            now,
			Description:          "Retain audit logs for 7 years per HIPAA/SOX requirements",
		},
		{
			ID:       "phi-6y",
			Name:     "PHI Retention (6 Years)",
			Category: CategoryPHI,
			RetentionPeriod: RetentionPeriod{
				Duration: 6 * 365 * 24 * time.Hour,
			},
			ArchiveBeforeDelete:  true,
			ArchivePath:          "/archive/phi",
			ComplianceFrameworks: []string{"HIPAA"},
			Active:               true,
			CreatedAt:            now,
			UpdatedAt:            now,
			Description:          "Retain PHI for 6 years per HIPAA §164.530(j)",
		},
		{
			ID:       "pii-gdpr",
			Name:     "PII (GDPR Minimization)",
			Category: CategoryPII,
			RetentionPeriod: RetentionPeriod{
				Duration: 3 * 365 * 24 * time.Hour, // 3 years default
			},
			ArchiveBeforeDelete:  false,
			ComplianceFrameworks: []string{"GDPR"},
			Active:               true,
			CreatedAt:            now,
			UpdatedAt:            now,
			Description:          "Retain PII only as long as necessary per GDPR Art.5(1)(e)",
		},
		{
			ID:       "financial-7y",
			Name:     "Financial Records (7 Years)",
			Category: CategoryFinancial,
			RetentionPeriod: RetentionPeriod{
				Duration: 7 * 365 * 24 * time.Hour,
			},
			ArchiveBeforeDelete:  true,
			ArchivePath:          "/archive/financial",
			ComplianceFrameworks: []string{"SOX", "IRS"},
			Active:               true,
			CreatedAt:            now,
			UpdatedAt:            now,
			Description:          "Retain financial records for 7 years per SOX/IRS requirements",
		},
		{
			ID:       "user-1y",
			Name:     "User Data (1 Year)",
			Category: CategoryUser,
			RetentionPeriod: RetentionPeriod{
				Duration: 365 * 24 * time.Hour,
			},
			ArchiveBeforeDelete: false,
			Active:              true,
			CreatedAt:           now,
			UpdatedAt:           now,
			Description:         "Default user data retention - 1 year",
		},
		{
			ID:       "analytics-90d",
			Name:     "Analytics (90 Days)",
			Category: CategoryAnalytics,
			RetentionPeriod: RetentionPeriod{
				Duration: 90 * 24 * time.Hour,
			},
			ArchiveBeforeDelete: false,
			Active:              true,
			CreatedAt:           now,
			UpdatedAt:           now,
			Description:         "Analytics data - 90 days",
		},
		{
			ID:       "system-indefinite",
			Name:     "System Data",
			Category: CategorySystem,
			RetentionPeriod: RetentionPeriod{
				Indefinite: true,
			},
			Active:      true,
			CreatedAt:   now,
			UpdatedAt:   now,
			Description: "System configuration and metadata - retain indefinitely",
		},
	}
}
