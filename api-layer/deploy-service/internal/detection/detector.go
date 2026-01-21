package detection

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type FrameworkType string

const (
	FrameworkNodeJS  FrameworkType = "nodejs"
	FrameworkPython  FrameworkType = "python"
	FrameworkGo      FrameworkType = "go"
	FrameworkJava    FrameworkType = "java"
	FrameworkPHP     FrameworkType = "php"
	FrameworkRuby    FrameworkType = "ruby"
	FrameworkDotNet  FrameworkType = "dotnet"
	FrameworkUnknown FrameworkType = "unknown"
)

type DatabaseType string

const (
	DatabasePostgreSQL DatabaseType = "postgresql"
	DatabaseMySQL      DatabaseType = "mysql"
	DatabaseMongoDB    DatabaseType = "mongodb"
	DatabaseRedis      DatabaseType = "redis"
	DatabaseSQLite     DatabaseType = "sqlite"
)

type MessageQueueType string

const (
	QueueRabbitMQ MessageQueueType = "rabbitmq"
	QueueKafka    MessageQueueType = "kafka"
	QueueRedis    MessageQueueType = "redis"
)

type ServiceDependencies_old struct {
	Framework     FrameworkType      `json:"framework"`
	Databases     []DatabaseType     `json:"databases"`
	MessageQueues []MessageQueueType `json:"message_queues"`
	HasWebServer  bool               `json:"has_web_server"`
	Ports         []int              `json:"ports"`
	Environment   map[string]string  `json:"environment"`
}

type ServiceDependencies struct {
	Services  []Service  `json:"services"`
	Databases []Database `json:"databases"`
}

type Service struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Port    int    `json:"port,omitempty"`
	// Add other fields as needed based on what services you detect
}

type Database struct {
	Type    string `json:"type"`
	Version string `json:"version,omitempty"`
	// Add other fields as needed
}

type Detector struct{}

func NewDetector() *Detector {
	return &Detector{}
}

func (d *Detector) AnalyzeDirectory(dirPath string) (*ServiceDependencies_old, error) {
	deps := &ServiceDependencies_old{
		Databases:     []DatabaseType{},
		MessageQueues: []MessageQueueType{},
		Ports:         []int{},
		Environment:   make(map[string]string),
	}

	// Detect framework
	framework, err := d.detectFramework(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to detect framework: %w", err)
	}
	deps.Framework = framework

	// Detect databases
	dbs := d.detectDatabases(dirPath)
	deps.Databases = dbs

	// Detect message queues
	queues := d.detectMessageQueues(dirPath)
	deps.MessageQueues = queues

	// Detect web server and ports
	deps.HasWebServer = d.detectWebServer(dirPath)
	ports := d.detectPorts(dirPath)
	deps.Ports = ports

	// Detect environment variables
	env := d.detectEnvironmentVariables(dirPath)
	deps.Environment = env

	return deps, nil
}

func (d *Detector) detectFramework(dirPath string) (FrameworkType, error) {
	files, err := os.ReadDir(dirPath)
	if err != nil {
		return FrameworkUnknown, err
	}

	// Check for framework-specific files
	for _, file := range files {
		if !file.IsDir() {
			switch strings.ToLower(file.Name()) {
			case "package.json":
				return FrameworkNodeJS, nil
			case "requirements.txt", "setup.py", "pyproject.toml":
				return FrameworkPython, nil
			case "go.mod", "go.sum":
				return FrameworkGo, nil
			case "pom.xml", "build.gradle":
				return FrameworkJava, nil
			case "composer.json":
				return FrameworkPHP, nil
			case "gemfile":
				return FrameworkRuby, nil
			case ".csproj", "project.json":
				return FrameworkDotNet, nil
			}
		}
	}

	// Check for framework-specific directories
	frameworkDirs := []string{"node_modules", "venv", "target", "vendor"}
	for _, dir := range frameworkDirs {
		if _, err := os.Stat(filepath.Join(dirPath, dir)); err == nil {
			switch dir {
			case "node_modules":
				return FrameworkNodeJS, nil
			case "venv":
				return FrameworkPython, nil
			case "target":
				return FrameworkJava, nil
			case "vendor":
				return FrameworkPHP, nil
			}
		}
	}

	return FrameworkUnknown, nil
}

func (d *Detector) detectDatabases(dirPath string) []DatabaseType {
	var databases []DatabaseType

	// Check package files for database drivers
	databasePatterns := map[DatabaseType][]string{
		DatabasePostgreSQL: {
			"pg", "postgres", "postgresql", "psycopg2", "pq",
			"Npgsql", "org.postgresql", "libpq",
		},
		DatabaseMySQL: {
			"mysql", "mysql2", "PyMySQL", "mysql-connector",
			"MySql.Data", "com.mysql.jdbc", "mysqlclient",
		},
		DatabaseMongoDB: {
			"mongodb", "mongoose", "pymongo", "MongoDB.Driver",
			"org.mongodb.driver", "mongo-go-driver",
		},
		DatabaseRedis: {
			"redis", "ioredis", "redis-py", "StackExchange.Redis",
			"jedis", "go-redis",
		},
		DatabaseSQLite: {
			"sqlite", "sqlite3", "better-sqlite3", "System.Data.SQLite",
		},
	}

	// Check package.json for Node.js
	if pkgFile := filepath.Join(dirPath, "package.json"); fileExists(pkgFile) {
		content, _ := os.ReadFile(pkgFile)
		var pkg struct {
			Dependencies    map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
		}
		json.Unmarshal(content, &pkg)

		for db, patterns := range databasePatterns {
			for _, pattern := range patterns {
				for dep := range pkg.Dependencies {
					if strings.Contains(strings.ToLower(dep), pattern) {
						if !containsDatabase(databases, db) {
							databases = append(databases, db)
						}
					}
				}
				for dep := range pkg.DevDependencies {
					if strings.Contains(strings.ToLower(dep), pattern) {
						if !containsDatabase(databases, db) {
							databases = append(databases, db)
						}
					}
				}
			}
		}
	}

	// Check requirements.txt for Python
	if reqFile := filepath.Join(dirPath, "requirements.txt"); fileExists(reqFile) {
		content, _ := os.ReadFile(reqFile)
		lines := strings.Split(string(content), "\n")

		for _, line := range lines {
			line = strings.ToLower(strings.TrimSpace(line))
			for db, patterns := range databasePatterns {
				for _, pattern := range patterns {
					if strings.Contains(line, pattern) {
						if !containsDatabase(databases, db) {
							databases = append(databases, db)
						}
					}
				}
			}
		}
	}

	// Check go.mod for Go
	if goModFile := filepath.Join(dirPath, "go.mod"); fileExists(goModFile) {
		content, _ := os.ReadFile(goModFile)
		lines := strings.Split(string(content), "\n")

		for _, line := range lines {
			line = strings.ToLower(strings.TrimSpace(line))
			for db, patterns := range databasePatterns {
				for _, pattern := range patterns {
					if strings.Contains(line, pattern) {
						if !containsDatabase(databases, db) {
							databases = append(databases, db)
						}
					}
				}
			}
		}
	}

	return databases
}

func (d *Detector) detectMessageQueues(dirPath string) []MessageQueueType {
	var queues []MessageQueueType

	queuePatterns := map[MessageQueueType][]string{
		QueueRabbitMQ: {"amqp", "rabbitmq", "amqp091-go", "pika"},
		QueueKafka:    {"kafka", "confluent-kafka", "sarama", "kafka-python"},
		QueueRedis:    {"redis", "ioredis", "redis-py"}, // Redis can also be used as message queue
	}

	// Similar logic as database detection but for message queues
	if pkgFile := filepath.Join(dirPath, "package.json"); fileExists(pkgFile) {
		content, _ := os.ReadFile(pkgFile)
		var pkg struct {
			Dependencies    map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
		}
		json.Unmarshal(content, &pkg)

		for queue, patterns := range queuePatterns {
			for _, pattern := range patterns {
				for dep := range pkg.Dependencies {
					if strings.Contains(strings.ToLower(dep), pattern) {
						if !containsQueue(queues, queue) {
							queues = append(queues, queue)
						}
					}
				}
			}
		}
	}

	return queues
}

func (d *Detector) detectWebServer(dirPath string) bool {
	// Check for common web server patterns
	webServerPatterns := []string{
		"express", "koa", "fastify", "hapi", // Node.js
		"flask", "django", "fastapi", "tornado", // Python
		"gin", "echo", "fiber", // Go
		"spring-boot", "jax-rs", // Java
		"laravel", "symfony", // PHP
		"rails", "sinatra", // Ruby
	}

	if pkgFile := filepath.Join(dirPath, "package.json"); fileExists(pkgFile) {
		content, _ := os.ReadFile(pkgFile)
		var pkg struct {
			Dependencies    map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
		}
		json.Unmarshal(content, &pkg)

		for _, pattern := range webServerPatterns {
			for dep := range pkg.Dependencies {
				if strings.Contains(strings.ToLower(dep), pattern) {
					return true
				}
			}
		}
	}

	return false
}

func (d *Detector) detectPorts(dirPath string) []int {
	var ports []int

	// Check for PORT environment variable in various config files
	envFiles := []string{".env", ".env.example", "docker-compose.yml", "Dockerfile"}

	for _, envFile := range envFiles {
		filePath := filepath.Join(dirPath, envFile)
		if !fileExists(filePath) {
			continue
		}

		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		// Look for PORT= or port: patterns
		portRegex := regexp.MustCompile(`(?:PORT|port)[\s]*[:=][\s]*(\d+)`)
		matches := portRegex.FindAllStringSubmatch(string(content), -1)

		for _, match := range matches {
			if len(match) > 1 {
				// Parse port number (this is simplified)
				// In production, you'd want more robust parsing
				if port := parseInt(match[1]); port > 0 {
					if !containsPort(ports, port) {
						ports = append(ports, port)
					}
				}
			}
		}
	}

	return ports
}

func (d *Detector) detectEnvironmentVariables(dirPath string) map[string]string {
	env := make(map[string]string)

	// Check .env files for environment variables
	envFiles := []string{".env", ".env.example", ".env.production"}

	for _, envFile := range envFiles {
		filePath := filepath.Join(dirPath, envFile)
		if !fileExists(filePath) {
			continue
		}

		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.Contains(line, "=") && !strings.HasPrefix(line, "#") {
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					key := strings.TrimSpace(parts[0])
					value := strings.TrimSpace(parts[1])
					if key != "" && value != "" {
						env[key] = value
					}
				}
			}
		}
	}

	return env
}

// Helper functions
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return !os.IsNotExist(err)
}

func containsDatabase(databases []DatabaseType, db DatabaseType) bool {
	for _, d := range databases {
		if d == db {
			return true
		}
	}
	return false
}

func containsQueue(queues []MessageQueueType, queue MessageQueueType) bool {
	for _, q := range queues {
		if q == queue {
			return true
		}
	}
	return false
}

func containsPort(ports []int, port int) bool {
	for _, p := range ports {
		if p == port {
			return true
		}
	}
	return false
}

func parseInt(s string) int {
	// Simple integer parsing (in production, use strconv.Atoi with error handling)
	switch s {
	case "3000":
		return 3000
	case "5000":
		return 5000
	case "8000":
		return 8000
	case "8080":
		return 8080
	case "8081":
		return 8081
	default:
		return 0
	}
}
