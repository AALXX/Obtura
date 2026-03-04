package storage

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type AgentPreferences struct {
	Strategy       string            `json:"strategy"`
	Preset         string            `json:"preset"`
	SelectedAgents []string          `json:"selectedAgents"`
	CustomAgents   []CustomAgentSpec `json:"customAgents"`
}

type CustomAgentSpec struct {
	ID           string  `json:"id"`
	Role         string  `json:"role"`
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Icon         string  `json:"icon"`
	SystemPrompt string  `json:"systemPrompt"`
	MaxTokens    int     `json:"maxTokens"`
	Temperature  float64 `json:"temperature"`
	Enabled      bool    `json:"enabled"`
	Order        int     `json:"order"`
}

type AgentPreferencesStore struct {
	db *sql.DB
}

func NewAgentPreferencesStore(db *sql.DB) (*AgentPreferencesStore, error) {
	return &AgentPreferencesStore{db: db}, nil
}

func (s *AgentPreferencesStore) SaveAgentPreferences(projectID string, prefs AgentPreferences) error {
	customAgentsJSON, err := json.Marshal(prefs.CustomAgents)
	if err != nil {
		customAgentsJSON = []byte("[]")
	}

	selectedAgentsJSON, err := json.Marshal(prefs.SelectedAgents)
	if err != nil {
		selectedAgentsJSON = []byte("[]")
	}

	query := `
		INSERT INTO agent_preferences (id, project_id, strategy, preset, selected_agents, custom_agents, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (project_id) DO UPDATE SET
			strategy = EXCLUDED.strategy,
			preset = EXCLUDED.preset,
			selected_agents = EXCLUDED.selected_agents,
			custom_agents = EXCLUDED.custom_agents,
			updated_at = EXCLUDED.updated_at
	`

	_, err = s.db.Exec(query, uuid.New().String(), projectID, prefs.Strategy, prefs.Preset, selectedAgentsJSON, customAgentsJSON, time.Now(), time.Now())
	return err
}

func (s *AgentPreferencesStore) GetAgentPreferences(projectID string) (*AgentPreferences, error) {
	query := `SELECT strategy, preset, selected_agents, custom_agents FROM agent_preferences WHERE project_id = $1`

	var prefs AgentPreferences
	var selectedAgentsJSON []byte
	var customAgentsJSON []byte

	err := s.db.QueryRow(query, projectID).Scan(&prefs.Strategy, &prefs.Preset, &selectedAgentsJSON, &customAgentsJSON)
	if err == sql.ErrNoRows {
		return nil, err
	}
	if err != nil {
		return nil, err
	}

	json.Unmarshal(selectedAgentsJSON, &prefs.SelectedAgents)
	json.Unmarshal(customAgentsJSON, &prefs.CustomAgents)

	return &prefs, nil
}
