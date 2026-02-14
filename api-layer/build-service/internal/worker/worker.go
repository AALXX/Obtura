package worker

import (
	"bufio"
	"build-service/internal/builder"
	"build-service/internal/git"
	"build-service/internal/logger"
	"build-service/internal/security"
	"build-service/internal/storage"
	"build-service/pkg"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Worker struct {
	conn        *amqp.Connection
	channel     *amqp.Channel
	db          *pkg.Database
	builder     *builder.Builder
	rateLimiter *security.RateLimiter
	storage     *storage.MinIOStorage
	projectID   string
	companyID   string
}

type EnvConfig struct {
	ServiceName string
	Content     string
	Location    string
}

func NewWorker(rabbitmqURL string, db *pkg.Database, rateLimiter *security.RateLimiter, minioStorage *storage.MinIOStorage) (*Worker, error) {
	conn, err := amqp.Dial(rabbitmqURL)
	if err != nil {
		return nil, err
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	bldr, err := builder.NewBuilder()
	if err != nil {
		conn.Close()
		channel.Close()
		return nil, err
	}

	return &Worker{
		conn:        conn,
		channel:     channel,
		db:          db,
		builder:     bldr,
		rateLimiter: rateLimiter,
		storage:     minioStorage,
	}, nil
}

func (w *Worker) Start() error {
	err := w.channel.ExchangeDeclare(
		"obtura.builds",
		"topic",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	queue, err := w.channel.QueueDeclare(
		"build-queue",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	err = w.channel.QueueBind(
		queue.Name,
		"build.triggered",
		"obtura.builds",
		false,
		nil,
	)
	if err != nil {
		return err
	}

	messages, err := w.channel.Consume(
		queue.Name,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	log.Println("✅ Build Service is now listening for messages...")

	for msg := range messages {
		log.Printf("📨 Received message: %s", string(msg.Body))
		go w.handleBuildJob(msg)
	}

	return nil
}

func (w *Worker) Close() error {
	if w.channel != nil {
		w.channel.Close()
	}
	if w.conn != nil {
		return w.conn.Close()
	}
	return nil
}

func (w *Worker) fetchEnvConfigs(ctx context.Context, projectID string) ([]EnvConfig, error) {
	query := `
		SELECT service_name, env_content 
		FROM project_env_configs 
		WHERE project_id = $1
		ORDER BY service_name
	`

	rows, err := w.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to query env configs: %w", err)
	}
	defer rows.Close()

	var configs []EnvConfig
	for rows.Next() {
		var serviceName, encryptedContent string
		if err := rows.Scan(&serviceName, &encryptedContent); err != nil {
			return nil, fmt.Errorf("failed to scan env config: %w", err)
		}

		content, err := pkg.DecryptEnvContent(encryptedContent)
		if err != nil {
			log.Printf("⚠️ Failed to decrypt env for service %s: %v", serviceName, err)
			continue
		}

		configs = append(configs, EnvConfig{
			ServiceName: serviceName,
			Content:     content,
		})
	}

	return configs, nil
}

func (w *Worker) writeEnvFiles(
	buildID string,
	workDir string,
	envConfigs []EnvConfig,
	frameworks []*builder.Framework,
	isMonorepo bool,
) error {
	servicePathMap := make(map[string]string)
	for _, fw := range frameworks {
		serviceName := builder.NormalizeServiceName(fw.Path)
		servicePathMap[serviceName] = fw.Path
	}

	for _, config := range envConfigs {
		var targetPath string

		if config.ServiceName == "shared" {
			targetPath = filepath.Join(workDir, ".env")
			w.streamLog(buildID, "Writing shared .env file")
		} else {
			if servicePath, exists := servicePathMap[config.ServiceName]; exists {
				targetPath = filepath.Join(workDir, servicePath, ".env")
				w.streamLog(buildID, fmt.Sprintf("Writing .env for service: %s", config.ServiceName))
			} else {
				matched := false
				for name, path := range servicePathMap {
					if strings.Contains(name, config.ServiceName) || strings.Contains(config.ServiceName, name) {
						targetPath = filepath.Join(workDir, path, ".env")
						w.streamLog(buildID, fmt.Sprintf("Writing .env for service: %s (matched to %s)", config.ServiceName, name))
						matched = true
						break
					}
				}
				if !matched {
					w.streamLog(buildID, fmt.Sprintf("⚠️ No matching service found for env config: %s", config.ServiceName))
					continue
				}
			}
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return fmt.Errorf("failed to create directory for %s: %w", targetPath, err)
		}

		if err := os.WriteFile(targetPath, []byte(config.Content), 0644); err != nil {
			return fmt.Errorf("failed to write env file to %s: %w", targetPath, err)
		}

		w.streamLog(buildID, fmt.Sprintf("✅ Written .env to %s", targetPath))
	}

	return nil
}

func (w *Worker) handleBuildJob(msg amqp.Delivery) {
	var job struct {
		GitURL       string  `json:"git_repo_url"`
		BuildID      string  `json:"buildId"`
		DeploymentID *string `json:"deploymentId,omitempty"`
		ProjectID    string  `json:"projectId"`
		Branch       string  `json:"branch"`
		CommitHash   string  `json:"commitHash"`
		Deploy       *bool   `json:"deploy,omitempty"`
	}
	ctx := context.Background()

	err := json.Unmarshal(msg.Body, &job)
	if err != nil {
		log.Printf("❌ Failed to parse message: %v", err)
		msg.Nack(false, false)
		return
	}

	// Get company ID from project
	var companyID string
	err = w.db.QueryRowContext(ctx, "SELECT company_id FROM projects WHERE id = $1", job.ProjectID).Scan(&companyID)
	if err != nil {
		log.Printf("❌ Failed to get company ID: %v", err)
		w.streamLog(job.BuildID, "Failed to get company information")
		w.streamStatus(job.BuildID, "failed", "Failed to get company information")
		msg.Nack(false, false)
		return
	}

	w.projectID = job.ProjectID
	w.companyID = companyID

	// Get quota for company (not project)
	quotaService := security.NewQuotaService(w.db.DB)
	quotaLimits, err := quotaService.GetQuotaForCompany(ctx, companyID)
	if err != nil {
		log.Printf("❌ Failed to get quota limits: %v", err)
		w.streamLog(job.BuildID, "Failed to get company quota")
		w.streamStatus(job.BuildID, "failed", "Failed to get company quota")
		msg.Nack(false, false)
		return
	}

	var planName string
	planQuery := `
		SELECT sp.id
		FROM companies c
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		WHERE c.id = $1
		  AND s.status = 'active'
		LIMIT 1
	`
	if err := w.db.QueryRowContext(ctx, planQuery, companyID).Scan(&planName); err != nil {
		planName = "starter"
	}

	limits := security.BuildLimits{
		MaxConcurrent: quotaLimits.MaxConcurrentBuilds,
		MaxPerMonth:   quotaLimits.MaxBuildsPerMonth,
	}

	log.Printf("🏗️ Starting build %s for project %s, company %s (%s)",
		job.BuildID, job.ProjectID, companyID, planName)

	w.streamStatus(job.BuildID, "queued", "Build queued")
	buildStartTime := time.Now()

	// Check rate limits at COMPANY level
	err = w.rateLimiter.CheckAndIncrementBuildLimit(ctx, companyID, limits)
	if err != nil {
		log.Printf("❌ Rate limit exceeded: %v", err)
		w.streamLog(job.BuildID, fmt.Sprintf("Build rejected: %v", err))
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'rejected', error_message = $1 WHERE id = $2",
			err.Error(), job.BuildID)
		msg.Nack(false, false)
		return
	}

	// Decrement on completion
	defer w.rateLimiter.DecrementConcurrentBuilds(ctx, companyID)

	buildCtx, cancel := context.WithTimeout(ctx, quotaLimits.MaxBuildDuration)
	defer cancel()

	buildDone := make(chan bool, 1)
	go func() {
		select {
		case <-buildCtx.Done():
			if buildCtx.Err() == context.DeadlineExceeded {
				log.Printf("⏱️ Build %s exceeded time limit (%v)", job.BuildID, quotaLimits.MaxBuildDuration)
				w.streamLog(job.BuildID, fmt.Sprintf("❌ Build exceeded time limit of %v", quotaLimits.MaxBuildDuration))
				w.streamStatus(job.BuildID, "timeout", "Build timeout")
				w.db.ExecContext(ctx, "UPDATE builds SET status = 'timeout', error_message = $1 WHERE id = $2",
					fmt.Sprintf("Build exceeded %v limit", quotaLimits.MaxBuildDuration), job.BuildID)
			}
		case <-buildDone:
		}
	}()
	defer func() {
		buildDone <- true
	}()

	w.db.ExecContext(buildCtx, "UPDATE builds SET status = 'running', started_at = NOW() WHERE id = $1", job.BuildID)
	w.streamStatus(job.BuildID, "running", "Build started")

	// Send to unified platform logging
	logger.BuildStart(buildCtx, job.BuildID, job.ProjectID, companyID, 0, job.CommitHash, job.Branch)

	row := w.db.QueryRowContext(buildCtx, "SELECT git_repo_url FROM projects WHERE id = $1", job.ProjectID)
	if err := row.Scan(&job.GitURL); err != nil {
		if err == sql.ErrNoRows {
			log.Printf("❌ Project not found: %s", job.ProjectID)
			w.streamLog(job.BuildID, fmt.Sprintf("Project not found: %s", job.ProjectID))
		} else {
			log.Printf("❌ Failed to get project: %v", err)
			w.streamLog(job.BuildID, fmt.Sprintf("Failed to get project: %v", err))
		}
		w.streamStatus(job.BuildID, "failed", "Project not found")
		buildTimeSeconds := int(time.Since(buildStartTime).Seconds())

		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', build_time_seconds = $2 WHERE id = $1", buildTimeSeconds, job.BuildID)
		msg.Nack(false, false)
		return
	}

	log.Printf("🔨 Building project %s, build %s (tier: %s)", job.ProjectID, job.BuildID, planName)
	w.streamLog(job.BuildID, fmt.Sprintf("Starting build (tier: %s, timeout: %v)", planName, quotaLimits.MaxBuildDuration))

	envConfigs, err := w.fetchEnvConfigs(buildCtx, job.ProjectID)
	if err != nil {
		log.Printf("⚠️ Failed to fetch env configs: %v", err)
		w.streamLog(job.BuildID, "⚠️ No environment configurations found")
	} else {
		log.Printf("📋 Found %d env configurations for project", len(envConfigs))
		w.streamLog(job.BuildID, fmt.Sprintf("Loaded %d environment configuration(s)", len(envConfigs)))
	}

	workDir := fmt.Sprintf("/tmp/builds/%s", job.BuildID)
	minioPrefix := fmt.Sprintf("builds/%s/%s", job.ProjectID, job.BuildID)

	defer func() {
		if err := w.uploadBuildArtifacts(ctx, workDir, minioPrefix); err != nil {
			log.Printf("⚠️ Failed to upload build artifacts to MinIO: %v", err)
		}

		if err := os.RemoveAll(workDir); err != nil {
			log.Printf("⚠️ Failed to cleanup workspace: %v", err)
		}

		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanupCancel()

		if err := w.builder.CleanupBuildArtifacts(cleanupCtx); err != nil {
			log.Printf("⚠️ Failed to cleanup Docker artifacts: %v", err)
		} else {
			log.Printf("🧹 Docker cleanup completed")
		}
	}()

	w.streamLog(job.BuildID, "Cloning repository...")
	w.streamStatus(job.BuildID, "cloning", "Cloning repository")

	githubToken, err := w.fetchGitHubToken(buildCtx, job.ProjectID)
	if err != nil {
		log.Printf("⚠️ Failed to fetch GitHub token: %v", err)
		w.streamLog(job.BuildID, "⚠️ No GitHub integration found, attempting public clone")
	}

	var cloneErr error
	if githubToken != "" {
		w.streamLog(job.BuildID, "Using GitHub App authentication")
		cloneErr = git.CloneRepositoryWithGitHubApp(job.GitURL, job.Branch, workDir, githubToken)
	} else {
		w.streamLog(job.BuildID, "⚠️ No GitHub integration found")
		cloneErr = fmt.Errorf("no GitHub integration configured")
	}

	if cloneErr != nil {
		log.Printf("❌ Failed to clone repository: %v", cloneErr)
		w.streamLog(job.BuildID, fmt.Sprintf("Failed to clone repository: %v", cloneErr))
		w.streamStatus(job.BuildID, "failed", "Failed to clone repository")
		buildTimeSeconds := int(time.Since(buildStartTime).Seconds())

		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", cloneErr.Error(), job.BuildID, buildTimeSeconds)
		msg.Nack(false, false)
		return
	}

	w.streamLog(job.BuildID, "✅ Repository cloned successfully")

	buildSize, err := w.calculateDirectorySize(workDir)
	if err != nil {
		log.Printf("⚠️ Failed to calculate build size: %v", err)
	} else if buildSize > quotaLimits.MaxBuildSize {
		errMsg := fmt.Sprintf("Build context size (%d MB) exceeds limit (%d MB)",
			buildSize/(1024*1024), quotaLimits.MaxBuildSize/(1024*1024))
		log.Printf("❌ %s", errMsg)
		w.streamLog(job.BuildID, fmt.Sprintf("❌ %s", errMsg))
		buildTimeSeconds := int(time.Since(buildStartTime).Seconds())

		w.streamStatus(job.BuildID, "failed", "Build size exceeds limit")
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", errMsg, job.BuildID, buildTimeSeconds)
		msg.Nack(false, false)
		return
	}

	w.streamLog(job.BuildID, "Repository cloned successfully")
	w.streamStatus(job.BuildID, "installing", "Detecting frameworks")

	result, err := builder.DetectAllFrameworks(workDir)
	if err != nil {
		log.Printf("❌ Failed to detect frameworks: %v", err)
		w.streamLog(job.BuildID, fmt.Sprintf("Failed to detect frameworks: %v", err))
		w.streamStatus(job.BuildID, "failed", "Failed to detect frameworks")

		buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID, buildTimeSeconds)
		msg.Nack(false, false)
		return
	}

	if result.IsMonorepo {
		log.Printf("📦 Detected monorepo with %d services:", len(result.Frameworks))
		w.streamLog(job.BuildID, fmt.Sprintf("Detected monorepo with %d services", len(result.Frameworks)))
		for _, fw := range result.Frameworks {
			w.streamLog(job.BuildID, fmt.Sprintf("  - %s in %s/", fw.Name, fw.Path))
		}
	} else {
		log.Printf("📦 Detected single service: %s", result.Frameworks[0].Name)
		w.streamLog(job.BuildID, fmt.Sprintf("Detected framework: %s", result.Frameworks[0].Name))
	}

	if len(result.Architecture.Databases) > 0 {
		log.Printf("🗄️ Detected %d database dependencies:", len(result.Architecture.Databases))
		w.streamLog(job.BuildID, fmt.Sprintf("🗄️ Detected %d database dependencies", len(result.Architecture.Databases)))
		for _, db := range result.Architecture.Databases {
			w.streamLog(job.BuildID, fmt.Sprintf("  - %s (%s)", db.Name, db.Type))
		}
	}

	if len(result.Architecture.Services) > 0 {
		log.Printf("🔗 Detected %d external services:", len(result.Architecture.Services))
		w.streamLog(job.BuildID, fmt.Sprintf("🔗 Detected %d external services", len(result.Architecture.Services)))
		for _, svc := range result.Architecture.Services {
			w.streamLog(job.BuildID, fmt.Sprintf("  - %s (%s)", svc.Name, svc.Type))
		}
	}

	frameworksJSON, _ := json.Marshal(map[string]interface{}{
		"frameworks":   result.Frameworks,
		"isMonorepo":   result.IsMonorepo,
		"architecture": result.Architecture,
		"plan":         planName,
		"buildSize":    buildSize,
		"quota": map[string]interface{}{
			"maxServices":      quotaLimits.MaxServices,
			"maxBuildSize":     quotaLimits.MaxBuildSize,
			"maxBuildDuration": quotaLimits.MaxBuildDuration.String(),
			"cpuCores":         quotaLimits.CPUCores,
			"memoryGB":         quotaLimits.MemoryGB,
		},
	})
	w.db.ExecContext(buildCtx, "UPDATE builds SET metadata = $1 WHERE id = $2", string(frameworksJSON), job.BuildID)

	if len(envConfigs) > 0 {
		if err := w.writeEnvFiles(job.BuildID, workDir, envConfigs, result.Frameworks, result.IsMonorepo); err != nil {
			log.Printf("⚠️ Failed to write env files: %v", err)
			w.streamLog(job.BuildID, fmt.Sprintf("Failed to write env files: %v", err))
		} else {
			w.streamLog(job.BuildID, "🔍 Validating environment variables...")
			if err := w.validateEnvVariables(job.BuildID, workDir, result.Frameworks); err != nil {
				log.Printf("❌ Environment validation failed: %v", err)
				w.streamStatus(job.BuildID, "failed", "Missing required environment variables")
				buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
				w.db.ExecContext(ctx, "UPDATE bui]lds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3",
					fmt.Sprintf("Missing required environment variables: %v", err), job.BuildID, buildTimeSeconds)
				msg.Nack(false, false)
				return
			}
		}
	} else {
		w.streamLog(job.BuildID, "⚠️ No environment configurations uploaded")
		if err := w.validateEnvVariables(job.BuildID, workDir, result.Frameworks); err != nil {
			log.Printf("⚠️ Environment validation warning: %v", err)
			w.streamLog(job.BuildID, "⚠️ BUILD WARNING: Application may require environment variables!")
		}
	}

	for _, framework := range result.Frameworks {
		serviceDir := filepath.Join(workDir, framework.Path)
		dockerfilePath := filepath.Join(serviceDir, "Dockerfile")

		if !pkg.FileExists(dockerfilePath) {
			w.streamLog(job.BuildID, fmt.Sprintf("Generating Dockerfile for %s...", framework.Name))

			dockerfile, err := builder.GenerateDockerfile(framework, serviceDir)
			if err != nil {
				log.Printf("❌ Failed to generate Dockerfile for %s: %v", framework.Name, err)
				w.streamLog(job.BuildID, fmt.Sprintf("Failed to generate Dockerfile for %s: %v", framework.Name, err))
				w.streamStatus(job.BuildID, "failed", "Failed to generate Dockerfile")
				buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
				w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", err.Error(), job.BuildID, buildTimeSeconds)
				msg.Nack(false, false)
				return
			}

			if err := os.WriteFile(dockerfilePath, []byte(dockerfile), 0644); err != nil {
				log.Printf("❌ Failed to write Dockerfile for %s: %v", framework.Name, err)
				w.streamLog(job.BuildID, fmt.Sprintf("Failed to write Dockerfile for %s: %v", framework.Name, err))
				w.streamStatus(job.BuildID, "failed", "Failed to write Dockerfile")
				buildTimeSeconds := int(time.Since(buildStartTime).Seconds())

				w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", err.Error(), job.BuildID, buildTimeSeconds)
				msg.Nack(false, false)
				return
			}

			w.streamLog(job.BuildID, fmt.Sprintf("✅ Generated Dockerfile for %s in %s/", framework.Name, framework.Path))
		} else {
			w.streamLog(job.BuildID, fmt.Sprintf("Using existing Dockerfile for %s in %s/", framework.Name, framework.Path))
		}

		if err := builder.EnsureNginxConfig(framework, serviceDir); err != nil {
			log.Printf("⚠️ Failed to generate nginx config for %s: %v", framework.Name, err)
		}
	}

	if result.IsMonorepo {
		composeFile, err := builder.GenerateDockerCompose(result, job.ProjectID, job.BuildID)
		if err != nil {
			log.Printf("❌ Failed to generate docker-compose.yml: %v", err)
			w.streamLog(job.BuildID, fmt.Sprintf("Failed to generate docker-compose.yml: %v", err))
			w.streamStatus(job.BuildID, "failed", "Failed to generate docker-compose.yml")
			buildTimeSeconds := int(time.Since(buildStartTime).Seconds())

			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", err.Error(), job.BuildID, buildTimeSeconds)
			msg.Nack(false, false)
			return
		}

		composePath := filepath.Join(workDir, "docker-compose.yml")
		if err := os.WriteFile(composePath, []byte(composeFile), 0644); err != nil {
			log.Printf("❌ Failed to write docker-compose.yml: %v", err)
			w.streamLog(job.BuildID, fmt.Sprintf("Failed to write docker-compose.yml: %v", err))
			w.streamStatus(job.BuildID, "failed", "Failed to write docker-compose.yml")
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
			msg.Nack(false, false)
			return
		}

		w.streamLog(job.BuildID, "Generated docker-compose.yml for monorepo")

		if err := builder.GenerateReadme(result, workDir); err != nil {
			log.Printf("⚠️ Failed to generate BUILD_README.md: %v", err)
		} else {
			w.streamLog(job.BuildID, "Generated BUILD_README.md with deployment instructions")
		}
	}
	w.streamStatus(job.BuildID, "building", "Building Docker images")

	minMemory := quotaLimits.MemoryGB
	if minMemory < 2 {
		minMemory = 2
		w.streamLog(job.BuildID, "⚠️ Increasing memory to 2GB minimum for build compatibility")
	}

	sandboxConfig := security.SandboxConfig{
		CPUQuota:     int64(quotaLimits.CPUCores) * 100000,
		MemoryLimit:  int64(minMemory) * 1024 * 1024 * 1024,
		PidsLimit:    512,
		NoNewPrivs:   true,
		ReadOnlyRoot: false,
		NetworkMode:  "bridge",
	}

	w.streamLog(job.BuildID, fmt.Sprintf("Build resources: %d CPU cores, %d GB RAM",
		quotaLimits.CPUCores, quotaLimits.MemoryGB))

	var imageTags []string
	for i, framework := range result.Frameworks {
		select {
		case <-buildCtx.Done():
			log.Printf("⏱️ Build timeout during image %d/%d", i+1, len(result.Frameworks))
			w.streamLog(job.BuildID, "❌ Build timeout reached")
			w.streamStatus(job.BuildID, "timeout", "Build timeout")
			buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'timeout' WHERE id = $1, build_time_seconds = $2", job.BuildID, buildTimeSeconds)
			msg.Nack(false, false)
			return
		default:
		}

		serviceName := builder.NormalizeServiceName(framework.Path)
		imageTag := fmt.Sprintf("obtura/%s-%s:%s", job.ProjectID, serviceName, job.BuildID)
		imageTags = append(imageTags, imageTag)

		serviceDir := filepath.Join(workDir, framework.Path)
		w.streamLog(job.BuildID, fmt.Sprintf("Building image for %s: %s", framework.Name, imageTag))

		buildOutput, err := w.builder.BuildImageWithSandbox(buildCtx, serviceDir, imageTag, sandboxConfig)
		if err != nil {
			log.Printf("❌ Docker build failed for %s: %v", framework.Name, err)
			w.streamLog(job.BuildID, fmt.Sprintf("Docker build failed for %s: %v", framework.Name, err))
			w.streamStatus(job.BuildID, "failed", fmt.Sprintf("Docker build failed for %s", framework.Name))
			buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", err.Error(), job.BuildID, buildTimeSeconds)
			msg.Nack(false, false)
			return
		}

		buildFailed := false
		criticalError := false
		var lastError string
		scanner := bufio.NewScanner(buildOutput)

		for scanner.Scan() {
			line := scanner.Text()
			w.streamLog(job.BuildID, line)

			if strings.Contains(line, "ESLint:") ||
				strings.Contains(line, "⨯ ESLint") ||
				strings.Contains(line, "Failed to load config") {
				continue
			}

			if strings.Contains(line, "Error occurred prerendering") {
				w.streamLog(job.BuildID, "💡 Prerender error detected - check environment variables")
				criticalError = true
			}

			var buildMsg struct {
				Error       string `json:"error"`
				ErrorDetail struct {
					Code    int    `json:"code"`
					Message string `json:"message"`
				} `json:"errorDetail"`
			}

			if json.Unmarshal([]byte(line), &buildMsg) == nil {
				if buildMsg.Error != "" || buildMsg.ErrorDetail.Message != "" {
					errorMsg := buildMsg.Error
					if errorMsg == "" {
						errorMsg = buildMsg.ErrorDetail.Message
					}

					if strings.Contains(errorMsg, "returned a non-zero code") ||
						strings.Contains(errorMsg, "executor failed") ||
						strings.Contains(errorMsg, "The command") {
						buildFailed = true
						criticalError = true
						lastError = errorMsg
						log.Printf("❌ Critical build error detected: %s", lastError)
					}
				}
			}
		}
		buildOutput.Close()

		if err := scanner.Err(); err != nil {
			log.Printf("⚠️ Error reading build output: %v", err)
			buildFailed = true
			criticalError = true
		}

		if buildFailed && criticalError {
			log.Printf("❌ Docker build failed for %s", framework.Name)
			w.streamLog(job.BuildID, fmt.Sprintf("❌ Docker build failed for %s", framework.Name))
			w.streamStatus(job.BuildID, "failed", "Build failed")

			if strings.Contains(lastError, "npm run build") || strings.Contains(lastError, "prerender") {
				w.streamLog(job.BuildID, "🔍 Troubleshooting tips:")
				w.streamLog(job.BuildID, "   • Verify all required environment variables are configured")
				w.streamLog(job.BuildID, "   • Check that NEXT_PUBLIC_* variables are set for client-side code")
			}

			buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3",
				"Docker build failed", job.BuildID, buildTimeSeconds)
			w.builder.CleanupBuildArtifacts(context.Background())
			msg.Nack(false, false)
			return
		}

		w.streamLog(job.BuildID, fmt.Sprintf("✅ Image built successfully for %s", framework.Name))

		w.streamLog(job.BuildID, fmt.Sprintf("Pushing image for %s...", framework.Name))
		if err := w.builder.PushImage(buildCtx, imageTag); err != nil {
			log.Printf("❌ Image push failed for %s: %v", framework.Name, err)
			w.streamLog(job.BuildID, fmt.Sprintf("Image push failed for %s: %v", framework.Name, err))
			w.streamStatus(job.BuildID, "failed", "Image push failed")
			buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2, build_time_seconds = $3", err.Error(), job.BuildID, buildTimeSeconds)
			msg.Nack(false, false)
			return
		}

		w.streamLog(job.BuildID, fmt.Sprintf("✅ Image pushed successfully for %s", framework.Name))

	}

	buildTimeSeconds := int(time.Since(buildStartTime).Seconds())
	imageTagsJSON, _ := json.Marshal(imageTags)
	w.db.ExecContext(ctx,
		"UPDATE builds SET image_tags = $1, status = 'completed', completed_at = NOW(), build_time_seconds = $2 WHERE id = $3",
		string(imageTagsJSON), buildTimeSeconds, job.BuildID)

	log.Printf("✅ Build %s completed successfully with %d services in %d seconds",
		job.BuildID, len(result.Frameworks), buildTimeSeconds)
	w.streamLog(job.BuildID, fmt.Sprintf("✅ Build completed successfully with %d service(s) in %dm %ds",
		len(result.Frameworks), buildTimeSeconds/60, buildTimeSeconds%60))

	// Send to unified platform logging
	logger.BuildComplete(ctx, job.BuildID, job.ProjectID, w.companyID, true, int64(buildTimeSeconds)*1000)

	if job.Deploy != nil && *job.Deploy {
		fmt.Println("Deploy is enabled")

		// Fetch deployment details from database
		var environment, strategy, domain string
		var subdomain sql.NullString

		deployQuery := `
        SELECT environment, deployment_strategy, domain, subdomain
        FROM deployments
        WHERE id = $1
    `
		err := w.db.QueryRowContext(ctx, deployQuery, job.DeploymentID).Scan(
			&environment, &strategy, &domain, &subdomain,
		)
		if err != nil {
			log.Printf("❌ Failed to fetch deployment details: %v", err)
			return
		}

		subdomainValue := ""
		if subdomain.Valid {
			subdomainValue = subdomain.String
		}

		deployMsg := map[string]interface{}{
			"buildId":      job.BuildID,
			"deploymentId": job.DeploymentID,
			"projectId":    job.ProjectID,
			"project": map[string]interface{}{
				"id":   job.ProjectID,
				"slug": "",
				"name": "",
			},
			"build": map[string]interface{}{
				"id":         job.BuildID,
				"imageTags":  imageTags,
				"branch":     job.Branch,
				"commitHash": job.CommitHash,
				"metadata":   result,
			},
			"deployment": map[string]interface{}{
				"id":          job.DeploymentID,
				"environment": environment,
				"strategy":    strategy,
				"domain":      domain,
				"subdomain":   subdomainValue, // Use the extracted value
			},
		}

		msgBody, err := json.Marshal(deployMsg)
		if err != nil {
			log.Printf("❌ Failed to marshal deploy message: %v", err)
			return
		}

		// Publish to exchange with proper routing key
		err = w.channel.Publish(
			"obtura.deploys",
			"deploy.triggered",
			false,
			false,
			amqp.Publishing{
				ContentType: "application/json",
				Body:        msgBody,
				Timestamp:   time.Now(),
			},
		)
		if err != nil {
			log.Printf("❌ Failed to publish deploy message: %v", err)
		} else {
			log.Printf("✅ Published deployment message for build %s", job.BuildID)
		}
	}

	w.streamStatus(job.BuildID, "completed", "Build completed successfully")

	if logBroker := logger.GetLogBroker(); logBroker != nil {
		logBroker.PublishBuildComplete(job.BuildID, "completed")

	}

	msg.Ack(false)
}

func (w *Worker) calculateDirectorySize(path string) (int64, error) {
	var size int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size, err
}

func (w *Worker) uploadBuildArtifacts(ctx context.Context, workDir, minioPrefix string) error {
	composePath := filepath.Join(workDir, "docker-compose.yml")
	if pkg.FileExists(composePath) {
		file, err := os.Open(composePath)
		if err == nil {
			defer file.Close()
			stat, _ := file.Stat()
			objectName := fmt.Sprintf("%s/docker-compose.yml", minioPrefix)
			w.storage.PutObject(ctx, objectName, file, stat.Size())
		}
	}
	readmePath := filepath.Join(workDir, "BUILD_README.md")
	if pkg.FileExists(readmePath) {
		file, err := os.Open(readmePath)
		if err == nil {
			defer file.Close()
			stat, _ := file.Stat()
			objectName := fmt.Sprintf("%s/BUILD_README.md", minioPrefix)
			w.storage.PutObject(ctx, objectName, file, stat.Size())
		}
	}

	err := filepath.Walk(workDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if !info.IsDir() && info.Name() == "Dockerfile" {
			file, err := os.Open(path)
			if err == nil {
				defer file.Close()
				relPath, _ := filepath.Rel(workDir, path)
				objectName := fmt.Sprintf("%s/%s", minioPrefix, relPath)
				w.storage.PutObject(ctx, objectName, file, info.Size())
			}
		}
		return nil
	})

	return err
}

func (w *Worker) validateEnvVariables(buildID, workDir string, frameworks []*builder.Framework) error {
	for _, framework := range frameworks {
		serviceDir := filepath.Join(workDir, framework.Path)

		if framework.Name == "Next.js" {
			return w.validateNextJsEnv(buildID, serviceDir)
		}
	}
	return nil
}

func (w *Worker) validateNextJsEnv(buildID, serviceDir string) error {
	var requiredVars []string
	requiredVars = w.extractFromEnvExample(filepath.Join(serviceDir, ".env.example"))
	if len(requiredVars) > 0 {
		w.streamLog(buildID, "🔍 Found .env.example with required variables")
		goto ValidateVars
	}

	requiredVars = w.extractFromEnvValidationFiles(serviceDir)
	if len(requiredVars) > 0 {
		w.streamLog(buildID, "🔍 Found environment validation file")
		goto ValidateVars
	}

	requiredVars = w.extractFromPackageJson(serviceDir)
	if len(requiredVars) > 0 {
		w.streamLog(buildID, "🔍 Found env vars in package.json")
		goto ValidateVars
	}

	requiredVars = w.extractFromNextConfig(serviceDir)
	if len(requiredVars) > 0 {
		w.streamLog(buildID, "🔍 Found env vars in Next.js config")
		goto ValidateVars
	}

	w.streamLog(buildID, "ℹ️ Could not detect required environment variables")
	return nil
ValidateVars:
	w.streamLog(buildID, fmt.Sprintf("Found %d environment variable(s):", len(requiredVars)))
	for _, v := range requiredVars {
		w.streamLog(buildID, fmt.Sprintf("   • %s", v))
	}
	envPath := filepath.Join(serviceDir, ".env")
	providedEnvVars := make(map[string]bool)

	if content, err := os.ReadFile(envPath); err == nil {
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) >= 1 {
				providedEnvVars[parts[0]] = true
			}
		}
	}

	var missingVars []string
	for _, envVar := range requiredVars {
		if !providedEnvVars[envVar] {
			missingVars = append(missingVars, envVar)
		}
	}

	if len(missingVars) > 0 {
		w.streamLog(buildID, "❌ Missing required environment variables:")
		for _, v := range missingVars {
			w.streamLog(buildID, fmt.Sprintf("   ✗ %s", v))
		}
		w.streamLog(buildID, "💡 Add these variables to your environment configuration in the dashboard")
		return fmt.Errorf("missing required environment variables: %s", strings.Join(missingVars, ", "))
	}

	w.streamLog(buildID, "✅ All required environment variables are configured")
	return nil
}

func (w *Worker) extractFromEnvExample(examplePath string) []string {
	vars := []string{}
	content, err := os.ReadFile(examplePath)
	if err != nil {
		return vars
	}
	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) >= 1 {
			varName := strings.TrimSpace(parts[0])
			if strings.HasPrefix(varName, "NEXT_PUBLIC_") {
				vars = append(vars, varName)
			}
		}
	}

	sort.Strings(vars)
	return vars
}

func (w *Worker) extractFromEnvValidationFiles(serviceDir string) []string {
	vars := []string{}
	validationFiles := []string{
		"src/env.mjs", "src/env.js", "src/env.ts",
		"env.mjs", "env.js", "env.ts",
		"lib/env.ts", "config/env.ts",
	}
	re := regexp.MustCompile(`NEXT_PUBLIC_[A-Z_0-9]+`)
	seen := make(map[string]bool)

	for _, validationFile := range validationFiles {
		filePath := filepath.Join(serviceDir, validationFile)
		info, err := os.Stat(filePath)
		if err != nil || info.Size() > 100*1024 {
			continue
		}

		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		matches := re.FindAllString(string(content), -1)
		for _, match := range matches {
			if !seen[match] {
				seen[match] = true
				vars = append(vars, match)
			}
		}
	}

	sort.Strings(vars)
	return vars
}

func (w *Worker) extractFromPackageJson(serviceDir string) []string {
	vars := []string{}
	packageJsonPath := filepath.Join(serviceDir, "package.json")
	content, err := os.ReadFile(packageJsonPath)
	if err != nil {
		return vars
	}
	var packageJson struct {
		Scripts map[string]string `json:"scripts"`
	}

	if err := json.Unmarshal(content, &packageJson); err != nil {
		return vars
	}

	re := regexp.MustCompile(`NEXT_PUBLIC_[A-Z_0-9]+`)
	seen := make(map[string]bool)

	for _, script := range packageJson.Scripts {
		matches := re.FindAllString(script, -1)
		for _, match := range matches {
			if !seen[match] {
				seen[match] = true
				vars = append(vars, match)
			}
		}
	}

	sort.Strings(vars)
	return vars
}

func (w *Worker) extractFromNextConfig(serviceDir string) []string {
	requiredVars := make(map[string]bool)

	configFiles := []string{
		"next.config.js",
		"next.config.mjs",
		"next.config.ts",
	}

	re := regexp.MustCompile(`process\.env\.(NEXT_PUBLIC_[A-Z_0-9]+)`)

	for _, file := range configFiles {
		filePath := filepath.Join(serviceDir, file)

		info, err := os.Stat(filePath)
		if err != nil || info.Size() > 50*1024 {
			continue
		}

		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		matches := re.FindAllStringSubmatch(string(content), -1)
		for _, match := range matches {
			if len(match) > 1 {
				requiredVars[match[1]] = true
			}
		}
	}

	vars := make([]string, 0, len(requiredVars))
	for v := range requiredVars {
		vars = append(vars, v)
	}
	sort.Strings(vars)

	return vars
}

type GitHubTokenResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token"`
}

func (w *Worker) fetchGitHubToken(ctx context.Context, projectID string) (string, error) {
	coreAPIURL := os.Getenv("CORE_API_URL")
	if coreAPIURL == "" {
		coreAPIURL = "http://core-api:7070"
	}
	url := fmt.Sprintf("%s/github/project-token/%s", coreAPIURL, projectID)
	log.Printf("🔗 Fetching GitHub token from: %s", url)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch GitHub token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		log.Printf("⚠️ No GitHub integration found for project %s", projectID)
		return "", nil
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("unexpected status code: %d, body: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Success bool   `json:"success"`
		Token   string `json:"token"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	log.Printf("✅ Successfully fetched GitHub token for project %s", projectID)
	return result.Token, nil
}

func (w *Worker) streamLog(buildID, message string) {
	log.Printf("[Build %s] %s", buildID, message)

	// Send to unified platform logging
	ctx := context.Background()
	logger.GetPlatformLogger().BuildStep(ctx, buildID, w.projectID, w.companyID, "build", 0, 0, message)

	// Legacy: Keep old logging for backward compatibility during migration
	logType := "info"
	if strings.Contains(message, "❌") || strings.Contains(message, "Failed") || strings.Contains(message, "failed") || strings.Contains(message, "error") {
		logType = "error"
	} else if strings.Contains(message, "⚠️") || strings.Contains(message, "warning") {
		logType = "warn"
	}

	if logBroker := logger.GetLogBroker(); logBroker != nil {
		logBroker.PublishLog(buildID, logType, message)
	}

	// Legacy DB insert
	w.db.ExecContext(ctx,
		"INSERT INTO build_logs (build_id, log_type, message, created_at) VALUES ($1, $2, $3, NOW())",
		buildID, logType, message,
	)
}

func (w *Worker) streamStatus(buildID, status, message string) {
	log.Printf("[Build %s] Status: %s - %s", buildID, status, message)
	if logBroker := logger.GetLogBroker(); logBroker != nil {
		logBroker.PublishStatus(buildID, status, message)
	}

	ctx := context.Background()
	w.db.ExecContext(ctx,
		"UPDATE builds SET status = $1 WHERE id = $2",
		status, buildID,
	)
}
