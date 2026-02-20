package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"ai-agent-service/internal/agent"
	"ai-agent-service/internal/analyzer"
	"ai-agent-service/internal/clients"
	"ai-agent-service/internal/llm"
	"ai-agent-service/internal/storage"
	"ai-agent-service/internal/worker"
	"ai-agent-service/pkg"

	"github.com/gin-gonic/gin"
)

var defaultModels = map[string]string{
	"openai":    "gpt-4o",
	"anthropic": "claude-sonnet-4-20250514",
	"gemini":    "gemini-1.5-pro",
}

func getDefaultModel(provider string) string {
	if model, ok := defaultModels[provider]; ok {
		return model
	}
	return "gpt-4o"
}

func isValidModelForProvider(provider, model string) bool {
	validModels := map[string][]string{
		"openai": {
			"gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo",
			"gpt-4o-mini", "o1-preview", "o1-mini",
		},
		"anthropic": {
			"claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022",
			"claude-3-opus-20240229", "claude-3-haiku-20240307",
			"claude-3-5-haiku-20241022", "claude-3-sonnet-20240229",
		},
		"gemini": {
			"gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro",
			"gemini-2.0-flash-exp",
		},
	}

	models, ok := validModels[provider]
	if !ok {
		return false
	}

	for _, m := range models {
		if m == model {
			return true
		}
	}
	return false
}

func validateAndInferModel(provider, model string) string {
	if model == "" || !isValidModelForProvider(provider, model) {
		return getDefaultModel(provider)
	}
	return model
}

func main() {
	log.Println("🚀 Starting AI Agent Service...")

	pgHost := pkg.GetEnv("POSTGRESQL_HOST", "localhost")
	pgPort := pkg.GetEnv("POSTGRESQL_PORT", "5432")
	pgDatabase := pkg.GetEnv("POSTGRESQL_DATABASE", "obtura_db")
	pgUser := pkg.GetEnv("POSTGRESQL_USER", "postgres")
	pgPassword := pkg.GetEnv("POSTGRESQL_PASSWORD", "")

	pgConnStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		pgHost, pgPort, pgUser, pgPassword, pgDatabase,
	)

	db, err := pkg.NewDatabase(pgConnStr)
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("✅ Successfully connected to PostgreSQL database")

	conversationStore := storage.NewConversationStore(db.DB)
	providerStore := storage.NewProviderStore(db.DB)
	insightsStore := storage.NewInsightsStore(db.DB)
	log.Println("✅ Storage layers initialized")

	llmConfig := &llm.Config{
		OpenAIAPIKey:    pkg.GetEnv("OPENAI_API_KEY", ""),
		ClaudeAPIKey:    pkg.GetEnv("CLAUDE_API_KEY", ""),
		FallbackAPIKey:  pkg.GetEnv("FALLBACK_API_KEY", ""),
		DefaultProvider: llm.ProviderType(pkg.GetEnv("DEFAULT_LLM_PROVIDER", "mock")),
	}
	llmManager := llm.NewManager(llmConfig)
	availableProviders := llmManager.ListAvailableProviders()
	log.Printf("✅ LLM Manager initialized with %d provider(s): %v", len(availableProviders), availableProviders)

	minioClient, err := clients.NewMinioClient(
		pkg.GetEnv("MINIO_ENDPOINT", "localhost:9000"),
		pkg.GetEnv("MINIO_ACCESS_KEY", "minioadmin"),
		pkg.GetEnv("MINIO_SECRET_KEY", "minioadmin"),
		pkg.GetEnv("MINIO_BUCKET", "obtura-builds"),
		pkg.GetEnv("MINIO_USE_SSL", "false") == "true",
	)
	if err != nil {
		log.Printf("⚠️ Failed to connect to MinIO: %v (build logs will not be available)", err)
		minioClient = nil
	} else {
		defer minioClient.Close()
		log.Println("✅ MinIO client initialized")
	}

	buildClient := clients.NewBuildServiceClient(pkg.GetEnv("BUILD_SERVICE_URL", "http://localhost:5050"))
	log.Printf("✅ Build service client initialized")

	buildAnalyzer := analyzer.NewBuildAnalyzer(db.DB, llmManager, minioClient, buildClient)
	log.Println("✅ Build analyzer initialized")

	aiAgent := agent.NewAgentWithDeps(llmManager, buildAnalyzer, buildClient, minioClient)
	log.Println("✅ AI Agent initialized")

	rabbitmqURL := pkg.GetEnv("RABBITMQ_URL", "amqp://obtura:obtura123@localhost:5672")
	buildWorker, err := worker.NewBuildWorker(rabbitmqURL, buildAnalyzer)
	if err != nil {
		log.Printf("⚠️ Failed to create build worker: %v (RabbitMQ events will not be processed)", err)
		buildWorker = nil
	} else {
		if err := buildWorker.Setup(); err != nil {
			log.Printf("⚠️ Failed to setup build worker: %v", err)
			buildWorker = nil
		} else {
			log.Println("✅ Build worker setup complete")
		}
	}

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowedOrigins := []string{
			"http://localhost:3000",
			"http://localhost:5120",
			"https://s3rbvn.org",
			"https://www.s3rbvn.org",
		}

		allowOrigin := "*"
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				allowOrigin = origin
				break
			}
		}
		// Also check if it's a localhost request with no origin header
		if origin == "" && (c.Request.Host == "localhost:5120" || c.Request.Host == "127.0.0.1:5120") {
			allowOrigin = c.Request.Host
		}

		c.Writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Max-Age", "3600")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.GET("/health", func(c *gin.Context) {
		providers := llmManager.ListAvailableProviders()
		hasMinIO := minioClient != nil

		if err := db.Ping(); err != nil {
			c.JSON(503, gin.H{
				"status":   "unhealthy",
				"database": "disconnected",
				"error":    err.Error(),
			})
			return
		}

		c.JSON(200, gin.H{
			"status":    "healthy",
			"database":  "connected",
			"providers": providers,
			"minio":     hasMinIO,
		})
	})

	r.GET("/ws/chat", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "WebSocket endpoint - use SSE or WebSocket client to connect",
		})
	})

	r.POST("/api/ai/chat", func(c *gin.Context) {
		var req struct {
			Message        string `json:"message"`
			ProjectID      string `json:"projectId"`
			ConversationID string `json:"conversationId"`
		}

		if err := c.BindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request body"})
			return
		}

		if req.Message == "" {
			c.JSON(400, gin.H{"error": "message is required"})
			return
		}

		if req.ProjectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		config, apiKey, err := providerStore.GetActiveProviderForProject(req.ProjectID)
		if err != nil {
			c.JSON(200, gin.H{
				"content": "⚠️ No AI provider configured for this project.\n\nPlease add an API key in the AI Settings (gear icon) to enable AI assistance.",
			})
			return
		}

		providerType := llm.ProviderType(config.Provider)
		provider := llm.NewProviderFromConfig(providerType, apiKey, config.Model)
		if !provider.IsAvailable() {
			c.JSON(200, gin.H{
				"content": "⚠️ AI provider is not available.\n\nPlease check your API key in AI Settings.",
			})
			return
		}

		log.Printf("🤖 Using provider: %s, model: %s for project: %s", config.Provider, config.Model, req.ProjectID)

		messages := []llm.Message{
			{Role: "system", Content: aiAgent.GetSystemPrompt()},
			{Role: "user", Content: req.Message},
		}

		completeReq := llm.CompletionRequest{
			Messages:    messages,
			MaxTokens:   2000,
			Temperature: 0.7,
			Model:       config.Model,
		}

		resp, err := provider.Complete(c.Request.Context(), completeReq)
		if err != nil {
			log.Printf("❌ LLM completion error: %v", err)
			errMsg := err.Error()
			if strings.Contains(errMsg, "credit balance is too low") {
				c.JSON(200, gin.H{
					"content": "⚠️ Your Anthropic API credit balance is too low.\n\nPlease add credits to your Anthropic account at https://console.anthropic.com/settings/billing",
				})
				return
			}
			if strings.Contains(errMsg, "invalid_api_key") || strings.Contains(errMsg, "Unauthorized") {
				c.JSON(200, gin.H{
					"content": "⚠️ Your API key appears to be invalid.\n\nPlease update your API key in AI Settings.",
				})
				return
			}
			c.JSON(200, gin.H{
				"content": fmt.Sprintf("⚠️ AI request failed: %s", errMsg),
			})
			return
		}

		c.JSON(200, gin.H{
			"content": resp.Content,
		})
	})

	r.GET("/api/conversations", func(c *gin.Context) {
		projectID := c.Query("projectId")
		if projectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		conversations, err := conversationStore.GetConversationsByProject(projectID)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"conversations": conversations})
	})

	r.GET("/api/conversations/:id", func(c *gin.Context) {
		conversationID := c.Param("id")

		conv, err := conversationStore.GetConversation(conversationID)
		if err != nil {
			c.JSON(404, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, conv)
	})

	r.POST("/api/conversations", func(c *gin.Context) {
		var req struct {
			ProjectID string `json:"projectId"`
			UserID    string `json:"userId"`
			Title     string `json:"title"`
		}

		if err := c.BindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request body"})
			return
		}

		if req.ProjectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		if req.Title == "" {
			req.Title = "New Conversation"
		}

		conv, err := conversationStore.CreateConversation(req.ProjectID, req.UserID, req.Title)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(201, conv)
	})

	r.DELETE("/api/conversations/:id", func(c *gin.Context) {
		conversationID := c.Param("id")

		if err := conversationStore.DeleteConversation(conversationID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Conversation deleted"})
	})

	r.GET("/api/insights", func(c *gin.Context) {
		projectID := c.Query("projectId")
		if projectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		insights, err := insightsStore.GetInsightsByProject(projectID, nil, 50, 0)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"insights": insights})
	})

	r.GET("/api/insights/:id", func(c *gin.Context) {
		insightID := c.Param("id")

		insight, err := insightsStore.GetInsight(insightID)
		if err != nil {
			c.JSON(404, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, insight)
	})

	r.POST("/api/insights/:id/resolve", func(c *gin.Context) {
		insightID := c.Param("id")
		userID := c.Query("userId")

		if err := insightsStore.ResolveInsight(insightID, userID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Insight resolved"})
	})

	r.POST("/api/insights/:id/ignore", func(c *gin.Context) {
		insightID := c.Param("id")

		if err := insightsStore.IgnoreInsight(insightID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Insight ignored"})
	})

	r.GET("/api/build/:buildId/analysis", func(c *gin.Context) {
		buildID := c.Param("buildId")
		projectID := c.Query("projectId")

		if projectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		result, err := buildAnalyzer.AnalyzeBuild(c.Request.Context(), buildID, projectID)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, result)
	})

	r.GET("/api/providers/configs", func(c *gin.Context) {
		projectID := c.Query("projectId")
		if projectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		configs, err := providerStore.GetProviderConfigsByProject(projectID)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"configs": configs})
	})

	r.GET("/api/providers/configs/:id", func(c *gin.Context) {
		configID := c.Param("id")

		config, err := providerStore.GetProviderConfig(configID)
		if err != nil {
			c.JSON(404, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, config)
	})

	r.POST("/api/providers/configs", func(c *gin.Context) {
		var req struct {
			ProjectID   string `json:"projectId"`
			AccessToken string `json:"accessToken"`
			Input       struct {
				Provider         storage.ProviderType `json:"provider"`
				ProviderName     string               `json:"providerName"`
				APIKey           string               `json:"apiKey"`
				Model            string               `json:"model"`
				BaseURL          *string              `json:"baseUrl,omitempty"`
				MonthlyBudgetUSD *float64             `json:"monthlyBudgetUsd,omitempty"`
			} `json:"input"`
		}

		if err := c.BindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request body"})
			return
		}

		if req.ProjectID == "" {
			c.JSON(400, gin.H{"error": "projectId is required"})
			return
		}

		if req.AccessToken == "" {
			c.JSON(400, gin.H{"error": "accessToken is required"})
			return
		}

		userID, err := pkg.GetUserIdFromSessionToken(db.DB, req.AccessToken)
		if err != nil {
			c.JSON(401, gin.H{"error": "Invalid access token: " + err.Error()})
			return
		}

		validatedModel := validateAndInferModel(string(req.Input.Provider), req.Input.Model)
		log.Printf("📝 Provider config: provider=%s, requested_model=%s, validated_model=%s", req.Input.Provider, req.Input.Model, validatedModel)

		input := storage.ProviderConfigInput{
			Provider:         req.Input.Provider,
			ProviderName:     req.Input.ProviderName,
			APIKey:           req.Input.APIKey,
			Model:            validatedModel,
			BaseURL:          req.Input.BaseURL,
			MonthlyBudgetUSD: req.Input.MonthlyBudgetUSD,
		}

		config, err := providerStore.CreateProviderConfig(req.ProjectID, userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(201, config)
	})

	r.DELETE("/api/providers/configs/:id", func(c *gin.Context) {
		configID := c.Param("id")

		if err := providerStore.SoftDeleteProviderConfig(configID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Provider config deleted"})
	})

	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()

	if buildWorker != nil {
		go func() {
			if err := buildWorker.Start(workerCtx); err != nil {
				log.Printf("❌ Build worker error: %v", err)
			}
		}()
	}

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		log.Println("🛑 Shutting down gracefully...")
		workerCancel()
		if buildWorker != nil {
			buildWorker.Close()
		}
		db.Close()
		os.Exit(0)
	}()

	port := pkg.GetEnv("PORT", "5120")
	log.Printf("🚀 AI Agent Service starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
