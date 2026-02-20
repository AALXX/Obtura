package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Message represents a chat message stored in the database (matches ai_messages table)
type Message struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversationId"`
	Role           string          `json:"role"`
	Content        string          `json:"content"`
	Context        json.RawMessage `json:"context,omitempty"`
	TokensUsed     *int            `json:"tokensUsed,omitempty"`
	CreatedAt      time.Time       `json:"createdAt"`
}

// Conversation represents a chat conversation stored in the database (matches ai_conversations table)
type Conversation struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	UserID    string    `json:"userId"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ConversationWithMessages includes conversation and its messages
type ConversationWithMessages struct {
	Conversation
	Messages []Message `json:"messages"`
}

// ConversationStore handles database operations for conversations
type ConversationStore struct {
	db *sql.DB
}

// NewConversationStore creates a new conversation store
func NewConversationStore(db *sql.DB) *ConversationStore {
	return &ConversationStore{db: db}
}

// CreateConversation creates a new conversation
func (s *ConversationStore) CreateConversation(projectID, userID, title string) (*Conversation, error) {
	id := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO ai_conversations (id, project_id, user_id, title, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, project_id, user_id, title, created_at, updated_at
	`

	var conv Conversation
	err := s.db.QueryRow(query, id, projectID, userID, title, now, now).Scan(
		&conv.ID, &conv.ProjectID, &conv.UserID, &conv.Title, &conv.CreatedAt, &conv.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	return &conv, nil
}

// GetConversation retrieves a conversation by ID with its messages
func (s *ConversationStore) GetConversation(conversationID string) (*ConversationWithMessages, error) {
	query := `
		SELECT id, project_id, user_id, title, created_at, updated_at
		FROM ai_conversations
		WHERE id = $1
	`

	var conv ConversationWithMessages
	err := s.db.QueryRow(query, conversationID).Scan(
		&conv.ID, &conv.ProjectID, &conv.UserID, &conv.Title, &conv.CreatedAt, &conv.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("conversation not found")
		}
		return nil, fmt.Errorf("failed to get conversation: %w", err)
	}

	// Load messages
	messages, err := s.GetMessages(conversationID)
	if err != nil {
		return nil, err
	}
	conv.Messages = messages

	return &conv, nil
}

// GetConversationsByProject retrieves all conversations for a project
func (s *ConversationStore) GetConversationsByProject(projectID string) ([]Conversation, error) {
	query := `
		SELECT id, project_id, user_id, title, created_at, updated_at
		FROM ai_conversations
		WHERE project_id = $1
		ORDER BY updated_at DESC
	`

	rows, err := s.db.Query(query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get conversations: %w", err)
	}
	defer rows.Close()

	var conversations []Conversation
	for rows.Next() {
		var conv Conversation
		err := rows.Scan(&conv.ID, &conv.ProjectID, &conv.UserID, &conv.Title, &conv.CreatedAt, &conv.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan conversation: %w", err)
		}
		conversations = append(conversations, conv)
	}

	return conversations, nil
}

// UpdateConversationTimestamp updates the conversation's updated_at timestamp
func (s *ConversationStore) UpdateConversationTimestamp(conversationID string) error {
	query := `
		UPDATE ai_conversations
		SET updated_at = $1
		WHERE id = $2
	`
	_, err := s.db.Exec(query, time.Now(), conversationID)
	if err != nil {
		return fmt.Errorf("failed to update conversation: %w", err)
	}
	return nil
}

// UpdateConversationTitle updates the conversation's title
func (s *ConversationStore) UpdateConversationTitle(conversationID, title string) error {
	query := `
		UPDATE ai_conversations
		SET title = $1, updated_at = $2
		WHERE id = $3
	`
	_, err := s.db.Exec(query, title, time.Now(), conversationID)
	if err != nil {
		return fmt.Errorf("failed to update conversation title: %w", err)
	}
	return nil
}

// DeleteConversation deletes a conversation (hard delete - use with caution)
func (s *ConversationStore) DeleteConversation(conversationID string) error {
	// First delete messages
	_, err := s.db.Exec("DELETE FROM ai_messages WHERE conversation_id = $1", conversationID)
	if err != nil {
		return fmt.Errorf("failed to delete messages: %w", err)
	}

	// Then delete conversation
	_, err = s.db.Exec("DELETE FROM ai_conversations WHERE id = $1", conversationID)
	if err != nil {
		return fmt.Errorf("failed to delete conversation: %w", err)
	}

	return nil
}

// AddMessage adds a message to a conversation
func (s *ConversationStore) AddMessage(conversationID, role, content string, context map[string]interface{}, tokensUsed *int) (*Message, error) {
	id := uuid.New().String()
	now := time.Now()

	contextStr := "{}"
	if context != nil {
		contextJSON, err := json.Marshal(context)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal context: %w", err)
		}
		contextStr = string(contextJSON)
	}

	query := `
		INSERT INTO ai_messages (id, conversation_id, role, content, context, tokens_used, created_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
		RETURNING id, conversation_id, role, content, context, tokens_used, created_at
	`

	var msg Message
	err := s.db.QueryRow(query, id, conversationID, role, content, contextStr, tokensUsed, now).Scan(
		&msg.ID, &msg.ConversationID, &msg.Role, &msg.Content, &msg.Context, &msg.TokensUsed, &msg.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to add message: %w", err)
	}

	// Update conversation's updated_at timestamp
	s.UpdateConversationTimestamp(conversationID)

	return &msg, nil
}

// GetMessages retrieves all messages for a conversation
func (s *ConversationStore) GetMessages(conversationID string) ([]Message, error) {
	query := `
		SELECT id, conversation_id, role, content, context, tokens_used, created_at
		FROM ai_messages
		WHERE conversation_id = $1
		ORDER BY created_at ASC
	`

	rows, err := s.db.Query(query, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get messages: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		var context []byte
		var tokensUsed sql.NullInt32
		err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.Role, &msg.Content, &context, &tokensUsed, &msg.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}
		if context != nil {
			msg.Context = context
		}
		if tokensUsed.Valid {
			tokens := int(tokensUsed.Int32)
			msg.TokensUsed = &tokens
		}
		messages = append(messages, msg)
	}

	return messages, nil
}
