package worker

import (
	"bufio"
	"build-service/internal/builder"
	"build-service/internal/git"
	"build-service/internal/security"
	"build-service/internal/storage"
	"build-service/pkg"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Worker struct {
	conn        *amqp.Connection
	channel     *amqp.Channel
	db          *pkg.Database
	builder     *builder.Builder
	rateLimiter *security.RateLimiter
	storage     *storage.MinIOStorage
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
		GitURL     string `json:"git_repo_url"`
		BuildID    string `json:"buildId"`
		ProjectID  string `json:"projectId"`
		CommitHash string `json:"commitHash"`
		Branch     string `json:"branch"`
	}
	ctx := context.Background()

	err := json.Unmarshal(msg.Body, &job)
	if err != nil {
		log.Printf("❌ Failed to parse message: %v", err)
		msg.Nack(false, false)
		return
	}

	quotaService := security.NewQuotaService(w.db.DB)
	quotaLimits, err := quotaService.GetQuotaForProject(ctx, job.ProjectID)
	if err != nil {
		log.Printf("⚠️ Failed to get quota limits, using free tier: %v", err)
		quotaLimits = quotaService.GetFreeQuota()
	}

	var planName string
	planQuery := `
SELECT sp.id
FROM projects p
JOIN companies c ON c.id = p.company_id
JOIN subscriptions s ON s.company_id = c.id
JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE p.id = $1
  AND s.status = 'active'
LIMIT 1;

`

	if err := w.db.QueryRowContext(ctx, planQuery, job.ProjectID).Scan(&planName); err != nil {
		planName = "free"
	}

	limits := security.BuildLimits{
		MaxConcurrent: quotaLimits.MaxConcurrentBuilds,
		MaxPerHour:    quotaLimits.MaxBuildsPerHour,
		MaxPerDay:     quotaLimits.MaxBuildsPerDay,
	}

	log.Printf("🏗️ Starting build %s for project %s (%s)", job.BuildID, job.ProjectID, planName)

	err = w.rateLimiter.CheckAndIncrementBuildLimit(ctx, job.ProjectID, limits)
	if err != nil {
		log.Printf("❌ Rate limit exceeded: %v", err)
		w.streamLog(job.BuildID, fmt.Sprintf("Build rejected: %v", err))
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'rejected', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
		msg.Nack(false, false)
		return
	}

	defer w.rateLimiter.DecrementConcurrentBuilds(ctx, job.ProjectID)

	buildCtx, cancel := context.WithTimeout(ctx, quotaLimits.MaxBuildDuration)
	defer cancel()

	buildDone := make(chan bool, 1)
	go func() {
		select {
		case <-buildCtx.Done():
			if buildCtx.Err() == context.DeadlineExceeded {
				log.Printf("⏱️ Build %s exceeded time limit (%v)", job.BuildID, quotaLimits.MaxBuildDuration)
				w.streamLog(job.BuildID, fmt.Sprintf("❌ Build exceeded time limit of %v", quotaLimits.MaxBuildDuration))
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

	row := w.db.QueryRowContext(buildCtx, "SELECT git_repo_url FROM projects WHERE id = $1", job.ProjectID)
	dberr := row.Scan(&job.GitURL)
	if dberr != nil {
		if dberr == sql.ErrNoRows {
			log.Printf("❌ Project not found: %s", job.ProjectID)
			w.streamLog(job.BuildID, fmt.Sprintf("Project not found: %s", job.ProjectID))
		} else {
			log.Printf("❌ Failed to get project: %v", dberr)
			w.streamLog(job.BuildID, fmt.Sprintf("Failed to get project: %v", dberr))
		}
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed' WHERE id = $1", job.BuildID)
		msg.Nack(false, false)
		return
	}

	log.Printf("🔨 Building project %s, build %s (tier: %s)", job.ProjectID, job.BuildID, planName)
	w.streamLog(job.BuildID, fmt.Sprintf("Starting build (tier: %s, timeout: %v)", planName, quotaLimits.MaxBuildDuration))

	envConfigs, err := w.fetchEnvConfigs(buildCtx, job.ProjectID)
	if err != nil {
		log.Printf("⚠️ Failed to fetch env configs: %v (continuing without env configs)", err)
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
	}()

	w.streamLog(job.BuildID, "Cloning repository...")
	if err := git.CloneRepository(job.GitURL, job.Branch, workDir); err != nil {
		log.Printf("❌ Failed to clone repository: %v", err)
		w.streamLog(job.BuildID, fmt.Sprintf("Failed to clone repository: %v", err))
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
		msg.Nack(false, false)
		return
	}

	buildSize, err := w.calculateDirectorySize(workDir)
	if err != nil {
		log.Printf("⚠️ Failed to calculate build size: %v", err)
	} else if buildSize > quotaLimits.MaxBuildSize {
		errMsg := fmt.Sprintf("Build context size (%d MB) exceeds limit (%d MB)",
			buildSize/(1024*1024), quotaLimits.MaxBuildSize/(1024*1024))
		log.Printf("❌ %s", errMsg)
		w.streamLog(job.BuildID, fmt.Sprintf("❌ %s", errMsg))
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", errMsg, job.BuildID)
		msg.Nack(false, false)
		return
	}

	w.streamLog(job.BuildID, "Repository cloned successfully")

	result, err := builder.DetectAllFrameworks(workDir)
	if err != nil {
		log.Printf("❌ Failed to detect frameworks: %v", err)
		w.streamLog(job.BuildID, fmt.Sprintf("Failed to detect frameworks: %v", err))
		w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
		msg.Nack(false, false)
		return
	}

	if result.IsMonorepo {
		log.Printf("📦 Detected monorepo with %d services:", len(result.Frameworks))
		w.streamLog(job.BuildID, fmt.Sprintf("Detected monorepo with %d services", len(result.Frameworks)))
		for _, fw := range result.Frameworks {
			log.Printf("  - %s in %s/", fw.Name, fw.Path)
			w.streamLog(job.BuildID, fmt.Sprintf("  - %s in %s/", fw.Name, fw.Path))
		}
	} else {
		log.Printf("📦 Detected single service: %s", result.Frameworks[0].Name)
		w.streamLog(job.BuildID, fmt.Sprintf("Detected framework: %s", result.Frameworks[0].Name))
	}

	frameworksJSON, _ := json.Marshal(map[string]interface{}{
		"frameworks": result.Frameworks,
		"isMonorepo": result.IsMonorepo,
		"plan":       planName,
		"buildSize":  buildSize,
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
		}
	} else {
		w.streamLog(job.BuildID, "⚠️ No environment configurations uploaded - using defaults")
	}

	for _, framework := range result.Frameworks {
		serviceDir := filepath.Join(workDir, framework.Path)
		dockerfilePath := filepath.Join(serviceDir, "Dockerfile")

		if !pkg.FileExists(dockerfilePath) {
			w.streamLog(job.BuildID, fmt.Sprintf("Generating Dockerfile for %s...", framework.Name))

			if framework.Name == "Next.js" {
				w.streamLog(job.BuildID, "Checking Next.js configuration for standalone output...")
			}

			dockerfile, err := builder.GenerateDockerfile(framework, serviceDir)
			if err != nil {
				log.Printf("❌ Failed to generate Dockerfile for %s: %v", framework.Name, err)
				w.streamLog(job.BuildID, fmt.Sprintf("Failed to generate Dockerfile for %s: %v", framework.Name, err))
				w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
				msg.Nack(false, false)
				return
			}

			if err := os.WriteFile(dockerfilePath, []byte(dockerfile), 0644); err != nil {
				log.Printf("❌ Failed to write Dockerfile for %s: %v", framework.Name, err)
				w.streamLog(job.BuildID, fmt.Sprintf("Failed to write Dockerfile for %s: %v", framework.Name, err))
				w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
				msg.Nack(false, false)
				return
			}

			w.streamLog(job.BuildID, fmt.Sprintf("✅ Generated Dockerfile for %s in %s/", framework.Name, framework.Path))

			if framework.Name == "Next.js" {
				configFiles := []string{"next.config.js", "next.config.mjs", "next.config.ts"}
				for _, cf := range configFiles {
					cfPath := filepath.Join(serviceDir, cf)
					if pkg.FileExists(cfPath) {
						w.streamLog(job.BuildID, fmt.Sprintf("Using Next.js config: %s", cf))
						break
					}
				}
			}
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
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
			msg.Nack(false, false)
			return
		}

		composePath := filepath.Join(workDir, "docker-compose.yml")
		if err := os.WriteFile(composePath, []byte(composeFile), 0644); err != nil {
			log.Printf("❌ Failed to write docker-compose.yml: %v", err)
			w.streamLog(job.BuildID, fmt.Sprintf("Failed to write docker-compose.yml: %v", err))
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

	sandboxConfig := security.SandboxConfig{
		CPUQuota:     int64(quotaLimits.CPUCores) * 100000, // Convert cores to quota
		MemoryLimit:  int64(quotaLimits.MemoryGB) * 1024 * 1024 * 1024,
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
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'timeout' WHERE id = $1", job.BuildID)
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
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
			msg.Nack(false, false)
			return
		}

		buildFailed := false
		scanner := bufio.NewScanner(buildOutput)
		for scanner.Scan() {
			line := scanner.Text()
			w.streamLog(job.BuildID, line)

			var buildMsg struct {
				Error       string `json:"error"`
				ErrorDetail struct {
					Code    int    `json:"code"`
					Message string `json:"message"`
				} `json:"errorDetail"`
			}

			if json.Unmarshal([]byte(line), &buildMsg) == nil {
				if buildMsg.Error != "" || buildMsg.ErrorDetail.Message != "" {
					buildFailed = true
					log.Printf("❌ Build error detected: %s", buildMsg.Error)
				}
			}
		}
		buildOutput.Close()

		if err := scanner.Err(); err != nil {
			log.Printf("⚠️ Error reading build output: %v", err)
			buildFailed = true
		}

		if buildFailed {
			log.Printf("❌ Docker build failed for %s", framework.Name)
			w.streamLog(job.BuildID, fmt.Sprintf("❌ Docker build failed for %s", framework.Name))
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2",
				"Docker build failed", job.BuildID)
			msg.Nack(false, false)
			return
		}

		w.streamLog(job.BuildID, fmt.Sprintf("✅ Image built successfully for %s", framework.Name))

		w.streamLog(job.BuildID, fmt.Sprintf("Pushing image for %s...", framework.Name))
		if err := w.builder.PushImage(buildCtx, imageTag); err != nil {
			log.Printf("❌ Image push failed for %s: %v", framework.Name, err)
			w.streamLog(job.BuildID, fmt.Sprintf("Image push failed for %s: %v", framework.Name, err))
			w.db.ExecContext(ctx, "UPDATE builds SET status = 'failed', error_message = $1 WHERE id = $2", err.Error(), job.BuildID)
			msg.Nack(false, false)
			return
		}

		w.streamLog(job.BuildID, fmt.Sprintf("✅ Image pushed successfully for %s", framework.Name))
	}

	imageTagsJSON, _ := json.Marshal(imageTags)
	w.db.ExecContext(ctx, "UPDATE builds SET image_tags = $1, status = 'completed', completed_at = NOW() WHERE id = $2",
		string(imageTagsJSON), job.BuildID)

	log.Printf("✅ Build %s completed successfully with %d services", job.BuildID, len(result.Frameworks))
	w.streamLog(job.BuildID, fmt.Sprintf("✅ Build completed successfully with %d service(s)", len(result.Frameworks)))

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

func (w *Worker) streamLog(buildID, message string) {
	log.Printf("[Build %s] %s", buildID, message)

	// TODO: Implement actual log streaming to database or message queue
	// For example:
	// w.db.InsertBuildLog(context.Background(), buildID, message, time.Now())
	// or publish to a logs exchange in RabbitMQ
}
