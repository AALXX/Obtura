package storage

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
)

// ProviderType represents the AI provider type
type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
	ProviderAzure     ProviderType = "azure_openai"
	ProviderCustom    ProviderType = "custom"
)

// TokenStatus represents the status of an AI provider token
type TokenStatus string

const (
	TokenStatusActive      TokenStatus = "active"
	TokenStatusExpired     TokenStatus = "expired"
	TokenStatusRevoked     TokenStatus = "revoked"
	TokenStatusRateLimited TokenStatus = "rate_limited"
)

// ProviderConfig represents a user-provided AI provider configuration
type ProviderConfig struct {
	ID                  string       `json:"id"`
	ProjectID           string       `json:"projectId"`
	UserID              string       `json:"userId"`
	Provider            ProviderType `json:"provider"`
	ProviderName        string       `json:"providerName"`
	Model               string       `json:"model"`
	BaseURL             *string      `json:"baseUrl,omitempty"`
	IsActive            bool         `json:"isActive"`
	Status              TokenStatus  `json:"status"`
	StatusMessage       *string      `json:"statusMessage,omitempty"`
	MonthlyBudgetUSD    *float64     `json:"monthlyBudgetUsd,omitempty"`
	MonthlyUsageUSD     float64      `json:"monthlyUsageUsd"`
	LastUsageResetAt    time.Time    `json:"lastUsageResetAt"`
	TokensUsedThisMonth int          `json:"tokensUsedThisMonth"`
	CreatedAt           time.Time    `json:"createdAt"`
	UpdatedAt           time.Time    `json:"updatedAt"`

	// Key status indicator (masked, never the full key)
	HasKey  bool   `json:"hasKey"`
	KeyHint string `json:"keyHint,omitempty"` // e.g., "sk-ant-...abcd"

	// Internal field - not exposed in JSON
	APIKeyEncrypted string `json:"-"`
	APIKeyIV        string `json:"-"`
}

// ProviderConfigInput represents input for creating/updating a provider config
type ProviderConfigInput struct {
	Provider         ProviderType `json:"provider"`
	ProviderName     string       `json:"providerName"`
	APIKey           string       `json:"apiKey"`
	Model            string       `json:"model"`
	BaseURL          *string      `json:"baseUrl,omitempty"`
	MonthlyBudgetUSD *float64     `json:"monthlyBudgetUsd,omitempty"`
}

// ProviderStore handles database operations for AI provider configurations
type ProviderStore struct {
	db            *sql.DB
	encryptionKey []byte
}

// NewProviderStore creates a new provider store
func NewProviderStore(db *sql.DB) *ProviderStore {
	return &ProviderStore{
		db:            db,
		encryptionKey: []byte("this-is-a-32-byte-key-32bytes!!!"), // Must be exactly 32 bytes for AES-256
	}
}

// CreateProviderConfig creates a new provider configuration
func (s *ProviderStore) CreateProviderConfig(projectID, userID string, input ProviderConfigInput) (*ProviderConfig, error) {
	id := uuid.New().String()
	now := time.Now()

	// Encrypt the API key
	encryptedKey, iv, err := s.encrypt(input.APIKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt API key: %w", err)
	}

	query := `
		INSERT INTO ai_provider_configs (
			id, project_id, user_id, provider, provider_name, api_key_encrypted, api_key_iv,
			model, base_url, is_active, status, monthly_budget_usd, monthly_usage_usd,
			last_usage_reset_at, tokens_used_this_month, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'active', $10, 0.00, $11, 0, $12, $12)
		RETURNING id, project_id, user_id, provider, provider_name, model, base_url,
			is_active, status, status_message, monthly_budget_usd, monthly_usage_usd,
			last_usage_reset_at, tokens_used_this_month, created_at, updated_at
	`

	var config ProviderConfig
	var statusMsg sql.NullString
	var baseURL sql.NullString
	err = s.db.QueryRow(query, id, projectID, userID, input.Provider, input.ProviderName,
		encryptedKey, iv, input.Model, input.BaseURL, input.MonthlyBudgetUSD, now, now).Scan(
		&config.ID, &config.ProjectID, &config.UserID, &config.Provider, &config.ProviderName,
		&config.Model, &baseURL, &config.IsActive, &config.Status, &statusMsg,
		&config.MonthlyBudgetUSD, &config.MonthlyUsageUSD, &config.LastUsageResetAt,
		&config.TokensUsedThisMonth, &config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create provider config: %w", err)
	}

	if statusMsg.Valid {
		config.StatusMessage = &statusMsg.String
	}
	if baseURL.Valid {
		config.BaseURL = &baseURL.String
	}

	return &config, nil
}

// GetProviderConfig retrieves a provider configuration by ID (without API key)
func (s *ProviderStore) GetProviderConfig(configID string) (*ProviderConfig, error) {
	query := `
		SELECT id, project_id, user_id, provider, provider_name, model, base_url,
			is_active, status, status_message, monthly_budget_usd, monthly_usage_usd,
			last_usage_reset_at, tokens_used_this_month, created_at, updated_at
		FROM ai_provider_configs
		WHERE id = $1 AND deleted_at IS NULL
	`

	var config ProviderConfig
	var statusMsg, baseURL sql.NullString
	err := s.db.QueryRow(query, configID).Scan(
		&config.ID, &config.ProjectID, &config.UserID, &config.Provider, &config.ProviderName,
		&config.Model, &baseURL, &config.IsActive, &config.Status, &statusMsg,
		&config.MonthlyBudgetUSD, &config.MonthlyUsageUSD, &config.LastUsageResetAt,
		&config.TokensUsedThisMonth, &config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("provider config not found")
		}
		return nil, fmt.Errorf("failed to get provider config: %w", err)
	}

	if statusMsg.Valid {
		config.StatusMessage = &statusMsg.String
	}
	if baseURL.Valid {
		config.BaseURL = &baseURL.String
	}

	return &config, nil
}

// GetProviderConfigWithKey retrieves a provider configuration including the decrypted API key
func (s *ProviderStore) GetProviderConfigWithKey(configID string) (*ProviderConfig, string, error) {
	query := `
		SELECT id, project_id, user_id, provider, provider_name, api_key_encrypted, api_key_iv,
			model, base_url, is_active, status, status_message, monthly_budget_usd, monthly_usage_usd,
			last_usage_reset_at, tokens_used_this_month, created_at, updated_at
		FROM ai_provider_configs
		WHERE id = $1 AND deleted_at IS NULL AND is_active = true AND status = 'active'
	`

	var config ProviderConfig
	var encryptedKey, iv string
	var statusMsg, baseURL sql.NullString
	err := s.db.QueryRow(query, configID).Scan(
		&config.ID, &config.ProjectID, &config.UserID, &config.Provider, &config.ProviderName,
		&encryptedKey, &iv, &config.Model, &baseURL, &config.IsActive, &config.Status,
		&statusMsg, &config.MonthlyBudgetUSD, &config.MonthlyUsageUSD, &config.LastUsageResetAt,
		&config.TokensUsedThisMonth, &config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, "", fmt.Errorf("provider config not found or inactive")
		}
		return nil, "", fmt.Errorf("failed to get provider config: %w", err)
	}

	if statusMsg.Valid {
		config.StatusMessage = &statusMsg.String
	}
	if baseURL.Valid {
		config.BaseURL = &baseURL.String
	}

	// Decrypt the API key
	apiKey, err := s.decrypt(encryptedKey, iv)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decrypt API key: %w", err)
	}

	return &config, apiKey, nil
}

// GetProviderConfigsByProject retrieves all provider configurations for a project
func (s *ProviderStore) GetProviderConfigsByProject(projectID string) ([]ProviderConfig, error) {
	query := `
		SELECT id, project_id, user_id, provider, provider_name, model, base_url,
			is_active, status, status_message, monthly_budget_usd, monthly_usage_usd,
			last_usage_reset_at, tokens_used_this_month, created_at, updated_at,
			api_key_encrypted
		FROM ai_provider_configs
		WHERE project_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider configs: %w", err)
	}
	defer rows.Close()

	var configs []ProviderConfig
	for rows.Next() {
		var config ProviderConfig
		var statusMsg, baseURL sql.NullString
		var encryptedKey sql.NullString
		err := rows.Scan(
			&config.ID, &config.ProjectID, &config.UserID, &config.Provider, &config.ProviderName,
			&config.Model, &baseURL, &config.IsActive, &config.Status, &statusMsg,
			&config.MonthlyBudgetUSD, &config.MonthlyUsageUSD, &config.LastUsageResetAt,
			&config.TokensUsedThisMonth, &config.CreatedAt, &config.UpdatedAt,
			&encryptedKey,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan provider config: %w", err)
		}
		if statusMsg.Valid {
			config.StatusMessage = &statusMsg.String
		}
		if baseURL.Valid {
			config.BaseURL = &baseURL.String
		}

		// Set key status indicator
		config.HasKey = encryptedKey.Valid && encryptedKey.String != ""
		if config.HasKey {
			config.KeyHint = "••••••••••••"
		}

		configs = append(configs, config)
	}

	return configs, nil
}

// UpdateProviderConfig updates a provider configuration
func (s *ProviderStore) UpdateProviderConfig(configID string, input ProviderConfigInput) error {
	now := time.Now()

	query := `
		UPDATE ai_provider_configs
		SET provider = $1, provider_name = $2, model = $3, base_url = $4,
			monthly_budget_usd = $5, updated_at = $6
		WHERE id = $7 AND deleted_at IS NULL
	`

	_, err := s.db.Exec(query, input.Provider, input.ProviderName, input.Model,
		input.BaseURL, input.MonthlyBudgetUSD, now, configID)
	if err != nil {
		return fmt.Errorf("failed to update provider config: %w", err)
	}

	return nil
}

// UpdateAPIKey updates only the API key for a provider configuration
func (s *ProviderStore) UpdateAPIKey(configID, apiKey string) error {
	encryptedKey, iv, err := s.encrypt(apiKey)
	if err != nil {
		return fmt.Errorf("failed to encrypt API key: %w", err)
	}

	query := `
		UPDATE ai_provider_configs
		SET api_key_encrypted = $1, api_key_iv = $2, updated_at = $3
		WHERE id = $4 AND deleted_at IS NULL
	`

	_, err = s.db.Exec(query, encryptedKey, iv, time.Now(), configID)
	if err != nil {
		return fmt.Errorf("failed to update API key: %w", err)
	}

	return nil
}

// UpdateStatus updates the status of a provider configuration
func (s *ProviderStore) UpdateStatus(configID string, status TokenStatus, message *string) error {
	query := `
		UPDATE ai_provider_configs
		SET status = $1, status_message = $2, updated_at = $3
		WHERE id = $4
	`

	_, err := s.db.Exec(query, status, message, time.Now(), configID)
	if err != nil {
		return fmt.Errorf("failed to update status: %w", err)
	}

	return nil
}

// UpdateUsage updates the usage statistics for a provider configuration
func (s *ProviderStore) UpdateUsage(configID string, tokensUsed int, costUSD float64) error {
	query := `
		UPDATE ai_provider_configs
		SET tokens_used_this_month = tokens_used_this_month + $1,
			monthly_usage_usd = monthly_usage_usd + $2,
			updated_at = $3
		WHERE id = $4
	`

	_, err := s.db.Exec(query, tokensUsed, costUSD, time.Now(), configID)
	if err != nil {
		return fmt.Errorf("failed to update usage: %w", err)
	}

	return nil
}

// SoftDeleteProviderConfig soft deletes a provider configuration
func (s *ProviderStore) SoftDeleteProviderConfig(configID string) error {
	query := `
		UPDATE ai_provider_configs
		SET deleted_at = $1, is_active = false
		WHERE id = $2
	`

	_, err := s.db.Exec(query, time.Now(), configID)
	if err != nil {
		return fmt.Errorf("failed to delete provider config: %w", err)
	}

	return nil
}

// GetActiveProviderForProject retrieves the active provider configuration for a project
func (s *ProviderStore) GetActiveProviderForProject(projectID string) (*ProviderConfig, string, error) {
	query := `
		SELECT id, project_id, user_id, provider, provider_name, api_key_encrypted, api_key_iv,
			model, base_url, is_active, status, status_message, monthly_budget_usd, monthly_usage_usd,
			last_usage_reset_at, tokens_used_this_month, created_at, updated_at
		FROM ai_provider_configs
		WHERE project_id = $1 AND is_active = true AND status = 'active' AND deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`

	var config ProviderConfig
	var encryptedKey, iv string
	var statusMsg, baseURL sql.NullString
	err := s.db.QueryRow(query, projectID).Scan(
		&config.ID, &config.ProjectID, &config.UserID, &config.Provider, &config.ProviderName,
		&encryptedKey, &iv, &config.Model, &baseURL, &config.IsActive, &config.Status,
		&statusMsg, &config.MonthlyBudgetUSD, &config.MonthlyUsageUSD, &config.LastUsageResetAt,
		&config.TokensUsedThisMonth, &config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, "", fmt.Errorf("no active provider config found")
		}
		return nil, "", fmt.Errorf("failed to get active provider: %w", err)
	}

	if statusMsg.Valid {
		config.StatusMessage = &statusMsg.String
	}
	if baseURL.Valid {
		config.BaseURL = &baseURL.String
	}

	apiKey, err := s.decrypt(encryptedKey, iv)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decrypt API key: %w", err)
	}

	return &config, apiKey, nil
}

// encrypt encrypts plaintext using AES-256-GCM
func (s *ProviderStore) encrypt(plaintext string) (string, string, error) {
	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return "", "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), base64.StdEncoding.EncodeToString(nonce), nil
}

// decrypt decrypts ciphertext using AES-256-GCM
func (s *ProviderStore) decrypt(ciphertextB64, nonceB64 string) (string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
