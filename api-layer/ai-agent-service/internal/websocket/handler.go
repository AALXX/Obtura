package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"ai-agent-service/internal/agent"
	"ai-agent-service/internal/llm"
	"ai-agent-service/internal/storage"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// Handler handles WebSocket connections for AI chat
type Handler struct {
	agent             *agent.Agent
	conversationStore *storage.ConversationStore
}

// NewHandler creates a new WebSocket handler
func NewHandler(agent *agent.Agent, conversationStore *storage.ConversationStore) *Handler {
	return &Handler{
		agent:             agent,
		conversationStore: conversationStore,
	}
}

// HandleChat handles WebSocket connections for AI chat
func (h *Handler) HandleChat(c *gin.Context) {
	// Get connection parameters
	projectID := c.Query("projectId")
	conversationID := c.Query("conversationId")
	userID := c.Query("userId")
	sessionID := c.Query("sessionId")

	if sessionID == "" {
		sessionID = "default-session"
	}

	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "projectId is required"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("❌ Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("🤖 New AI chat connection for project: %s", projectID)

	// Create or get conversation
	var conv *storage.ConversationWithMessages
	if conversationID != "" {
		conv, err = h.conversationStore.GetConversation(conversationID)
		if err != nil {
			log.Printf("⚠️ Conversation not found, creating new one: %v", err)
			conv = nil
		}
	}

	if conv == nil {
		newConv, err := h.conversationStore.CreateConversation(projectID, userID, sessionID)
		if err != nil {
			log.Printf("❌ Failed to create conversation: %v", err)
			h.sendError(conn, "Failed to create conversation")
			return
		}
		conv = &storage.ConversationWithMessages{
			Conversation: *newConv,
			Messages:     []storage.Message{},
		}
	}

	// Send conversation info to client
	h.sendMessage(conn, Message{
		Type:           "conversation",
		ConversationID: conv.ID,
	})

	// Main message loop
	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("❌ WebSocket error: %v", err)
			}
			break
		}

		var msg ClientMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			h.sendError(conn, "Invalid message format")
			continue
		}

		switch msg.Type {
		case "message":
			h.handleUserMessage(conn, conv.ID, msg.Content)
		case "stream":
			h.handleStreamMessage(conn, conv.ID, msg.Content)
		default:
			h.sendError(conn, "Unknown message type")
		}
	}

	log.Printf("👋 AI chat connection closed for project: %s", projectID)
}

func (h *Handler) handleUserMessage(conn *websocket.Conn, conversationID, content string) {
	// Store user message
	_, err := h.conversationStore.AddMessage(conversationID, "user", content, nil, nil)
	if err != nil {
		log.Printf("❌ Failed to store user message: %v", err)
		h.sendError(conn, "Failed to store message")
		return
	}

	// Get conversation history
	messages, err := h.conversationStore.GetMessages(conversationID)
	if err != nil {
		log.Printf("❌ Failed to get messages: %v", err)
		h.sendError(conn, "Failed to get conversation history")
		return
	}

	// Convert to LLM messages
	llmMessages := make([]llm.Message, 0, len(messages)+1)
	llmMessages = append(llmMessages, llm.Message{
		Role:    "system",
		Content: h.agent.GetSystemPrompt(),
	})

	for _, msg := range messages {
		llmMessages = append(llmMessages, llm.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// Process with AI
	resp, err := h.agent.Process(llmMessages)
	if err != nil {
		log.Printf("❌ AI processing error: %v", err)
		h.sendError(conn, "AI processing failed")
		return
	}

	// Store assistant message
	_, err = h.conversationStore.AddMessage(conversationID, "assistant", resp.Content, nil, nil)
	if err != nil {
		log.Printf("❌ Failed to store assistant message: %v", err)
	}

	// Send response to client
	h.sendMessage(conn, Message{
		Type:    "message",
		Role:    "assistant",
		Content: resp.Content,
	})
}

func (h *Handler) handleStreamMessage(conn *websocket.Conn, conversationID, content string) {
	// Store user message
	_, err := h.conversationStore.AddMessage(conversationID, "user", content, nil, nil)
	if err != nil {
		log.Printf("❌ Failed to store user message: %v", err)
		h.sendError(conn, "Failed to store message")
		return
	}

	// Get conversation history
	messages, err := h.conversationStore.GetMessages(conversationID)
	if err != nil {
		log.Printf("❌ Failed to get messages: %v", err)
		h.sendError(conn, "Failed to get conversation history")
		return
	}

	// Convert to LLM messages
	llmMessages := make([]llm.Message, 0, len(messages)+1)
	llmMessages = append(llmMessages, llm.Message{
		Role:    "system",
		Content: h.agent.GetSystemPrompt(),
	})

	for _, msg := range messages {
		llmMessages = append(llmMessages, llm.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// Send start message
	h.sendMessage(conn, Message{
		Type: "stream_start",
		Role: "assistant",
	})

	// Stream response
	streamChan, err := h.agent.ProcessStream(llmMessages)
	if err != nil {
		log.Printf("❌ AI streaming error: %v", err)
		h.sendError(conn, "AI streaming failed")
		return
	}

	var fullContent string
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	var buffer string
	for {
		select {
		case chunk, ok := <-streamChan:
			if !ok {
				// Stream ended
				if buffer != "" {
					h.sendMessage(conn, Message{
						Type:    "stream_chunk",
						Content: buffer,
					})
				}
				goto done
			}

			if chunk.Error != nil {
				log.Printf("❌ Stream error: %v", chunk.Error)
				h.sendError(conn, "Streaming error")
				return
			}

			buffer += chunk.Content
			fullContent += chunk.Content

			if chunk.Done {
				if buffer != "" {
					h.sendMessage(conn, Message{
						Type:    "stream_chunk",
						Content: buffer,
					})
				}
				goto done
			}

		case <-ticker.C:
			if buffer != "" {
				h.sendMessage(conn, Message{
					Type:    "stream_chunk",
					Content: buffer,
				})
				buffer = ""
			}
		}
	}

done:

	// Send end message
	h.sendMessage(conn, Message{
		Type: "stream_end",
	})

	// Store complete message
	_, err = h.conversationStore.AddMessage(conversationID, "assistant", fullContent, nil, nil)
	if err != nil {
		log.Printf("❌ Failed to store assistant message: %v", err)
	}
}

func (h *Handler) sendMessage(conn *websocket.Conn, msg Message) {
	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("❌ Failed to send message: %v", err)
	}
}

func (h *Handler) sendError(conn *websocket.Conn, errorMsg string) {
	h.sendMessage(conn, Message{
		Type:    "error",
		Content: errorMsg,
	})
}

// Message represents a message sent to the client
type Message struct {
	Type           string `json:"type"`
	Role           string `json:"role,omitempty"`
	Content        string `json:"content,omitempty"`
	ConversationID string `json:"conversationId,omitempty"`
}

// ClientMessage represents a message received from the client
type ClientMessage struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}
