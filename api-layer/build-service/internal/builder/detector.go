package builder

import (
	"build-service/pkg"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Framework struct {
	Name     string
	Version  string
	BuildCmd string
	Runtime  string
	Port     int
	Path     string
}

type DatabaseDependency struct {
	Name     string
	Type     string // "relational", "nosql", "cache", etc.
	Required bool
}

type ServiceDependency struct {
	Name     string
	Type     string // "cache", "message_queue", "storage", etc.
	Required bool
}

type ArchitectureInfo struct {
	Databases []DatabaseDependency
	Services  []ServiceDependency
}

type ProjectStructure struct {
	Frameworks   []*Framework
	IsMonorepo   bool
	Architecture *ArchitectureInfo
}

var commonSubdirs = []string{
	"client", "frontend", "web", "ui", "app",
	"backend", "server", "api", "services",
	"packages", "apps",
}

func DetectFramework(projectPath string) (*Framework, error) {
	result, err := DetectAllFrameworks(projectPath)
	if err != nil {
		return nil, err
	}

	if len(result.Frameworks) == 0 {
		return nil, errors.New("unable to detect framework: no recognized project files found")
	}

	return result.Frameworks[0], nil
}

func DetectAllFrameworks(projectPath string) (*ProjectStructure, error) {
	result := &ProjectStructure{
		Frameworks: make([]*Framework, 0),
		IsMonorepo: false,
		Architecture: &ArchitectureInfo{
			Databases: make([]DatabaseDependency, 0),
			Services:  make([]ServiceDependency, 0),
		},
	}

	framework := detectFrameworkInDir(projectPath, ".")
	if framework != nil {
		result.Frameworks = append(result.Frameworks, framework)
	}

	entries, err := os.ReadDir(projectPath)
	if err != nil {
		if len(result.Frameworks) > 0 {
			return result, nil
		}
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		dirName := strings.ToLower(entry.Name())

		if dirName == "node_modules" || dirName == ".git" ||
			dirName == "vendor" || dirName == "dist" ||
			dirName == "build" || dirName == ".venv" ||
			dirName == "venv" || dirName == "__pycache__" {
			continue
		}

		isCommonSubdir := false
		for _, commonDir := range commonSubdirs {
			if dirName == commonDir || strings.Contains(dirName, commonDir) {
				isCommonSubdir = true
				break
			}
		}

		if isCommonSubdir {
			subPath := filepath.Join(projectPath, entry.Name())
			subFramework := detectFrameworkInDir(subPath, entry.Name())
			if subFramework != nil {
				result.Frameworks = append(result.Frameworks, subFramework)
			}
		}
	}

	if len(result.Frameworks) == 0 {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			dirName := entry.Name()
			if dirName == "node_modules" || dirName == ".git" ||
				dirName == "vendor" || dirName == "dist" ||
				dirName == "build" || dirName == ".venv" ||
				dirName == "venv" || dirName == "__pycache__" {
				continue
			}

			subPath := filepath.Join(projectPath, entry.Name())
			subFramework := detectFrameworkInDir(subPath, entry.Name())
			if subFramework != nil {
				result.Frameworks = append(result.Frameworks, subFramework)
			}
		}
	}

	if len(result.Frameworks) == 0 {
		return nil, errors.New("unable to detect framework: no recognized project files found")
	}

	// Determine if this is a monorepo based on number of frameworks detected
	result.IsMonorepo = len(result.Frameworks) > 1

	// Analyze architecture requirements
	analyzeArchitecture(projectPath, result)

	return result, nil
}

func detectFrameworkInDir(dirPath, relativePath string) *Framework {
	var framework *Framework
	var err error

	if pkg.FileExists(filepath.Join(dirPath, "package.json")) {
		framework, err = detectNodeFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "requirements.txt")) ||
		pkg.FileExists(filepath.Join(dirPath, "Pipfile")) ||
		pkg.FileExists(filepath.Join(dirPath, "pyproject.toml")) {
		framework, err = detectPythonFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "go.mod")) {
		framework, err = detectGoFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "composer.json")) {
		framework, err = detectPHPFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "Gemfile")) {
		framework, err = detectRubyFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "pom.xml")) ||
		pkg.FileExists(filepath.Join(dirPath, "build.gradle")) ||
		pkg.FileExists(filepath.Join(dirPath, "build.gradle.kts")) {
		framework, err = detectJVMFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "Cargo.toml")) {
		framework, err = detectRustFramework(dirPath)
	}

	if err != nil || framework == nil {
		return nil
	}

	framework.Path = relativePath
	return framework
}

func detectNodeFramework(projectPath string) (*Framework, error) {
	data, err := pkg.ReadFile(filepath.Join(projectPath, "package.json"))
	if err != nil {
		return nil, err
	}

	var packageJSON struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
		Scripts         map[string]string `json:"scripts"`
	}

	if err := json.Unmarshal(data, &packageJSON); err != nil {
		return nil, err
	}

	if _, ok := packageJSON.Dependencies["next"]; ok {
		return &Framework{
			Name:     "Next.js",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
		}, nil
	}

	if _, ok := packageJSON.Dependencies["nuxt"]; ok {
		return &Framework{
			Name:     "Nuxt.js",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
		}, nil
	}

	if _, hasReact := packageJSON.Dependencies["react"]; hasReact {
		if _, hasVite := packageJSON.DevDependencies["vite"]; hasVite {
			return &Framework{
				Name:     "Vite + React",
				Runtime:  "node:20-alpine",
				BuildCmd: "npm run build",
				Port:     5173,
			}, nil
		}
		return &Framework{
			Name:     "Create React App",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
		}, nil
	}

	if _, hasVue := packageJSON.Dependencies["vue"]; hasVue {
		if _, hasVite := packageJSON.DevDependencies["vite"]; hasVite {
			return &Framework{
				Name:     "Vite + Vue",
				Runtime:  "node:20-alpine",
				BuildCmd: "npm run build",
				Port:     5173,
			}, nil
		}
	}

	if _, ok := packageJSON.Dependencies["express"]; ok {
		return &Framework{
			Name:     "Express.js",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm install",
			Port:     3000,
		}, nil
	}

	if _, ok := packageJSON.Dependencies["@nestjs/core"]; ok {
		return &Framework{
			Name:     "NestJS",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
		}, nil
	}

	if _, ok := packageJSON.Dependencies["fastify"]; ok {
		return &Framework{
			Name:     "Fastify",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm install",
			Port:     3000,
		}, nil
	}

	return &Framework{
		Name:     "Node.js",
		Runtime:  "node:20-alpine",
		BuildCmd: "npm install",
		Port:     3000,
	}, nil
}

func detectPythonFramework(projectPath string) (*Framework, error) {
	if pkg.FileExists(filepath.Join(projectPath, "manage.py")) {
		return &Framework{
			Name:     "Django",
			Runtime:  "python:3.11-slim",
			BuildCmd: "pip install -r requirements.txt",
			Port:     8000,
		}, nil
	}

	requirementsPath := filepath.Join(projectPath, "requirements.txt")
	if pkg.FileExists(requirementsPath) {
		content, err := pkg.ReadFile(requirementsPath)
		if err == nil && strings.Contains(strings.ToLower(string(content)), "flask") {
			return &Framework{
				Name:     "Flask",
				Runtime:  "python:3.11-slim",
				BuildCmd: "pip install -r requirements.txt",
				Port:     5000,
			}, nil
		}

		if strings.Contains(strings.ToLower(string(content)), "fastapi") {
			return &Framework{
				Name:     "FastAPI",
				Runtime:  "python:3.11-slim",
				BuildCmd: "pip install -r requirements.txt",
				Port:     8000,
			}, nil
		}
	}

	return &Framework{
		Name:     "Python",
		Runtime:  "python:3.11-slim",
		BuildCmd: "pip install -r requirements.txt",
		Port:     8000,
	}, nil
}

func detectGoFramework(projectPath string) (*Framework, error) {
	goModPath := filepath.Join(projectPath, "go.mod")
	content, err := pkg.ReadFile(goModPath)
	if err != nil {
		return &Framework{
			Name:     "Go",
			Runtime:  "golang:1.22-alpine",
			BuildCmd: "go build -o app .",
			Port:     8080,
		}, nil
	}

	contentStr := string(content)

	if strings.Contains(contentStr, "github.com/gin-gonic/gin") {
		return &Framework{
			Name:     "Go (Gin)",
			Runtime:  "golang:1.22-alpine",
			BuildCmd: "go build -o app .",
			Port:     8080,
		}, nil
	}

	if strings.Contains(contentStr, "github.com/gofiber/fiber") {
		return &Framework{
			Name:     "Go (Fiber)",
			Runtime:  "golang:1.22-alpine",
			BuildCmd: "go build -o app .",
			Port:     3000,
		}, nil
	}

	if strings.Contains(contentStr, "github.com/labstack/echo") {
		return &Framework{
			Name:     "Go (Echo)",
			Runtime:  "golang:1.22-alpine",
			BuildCmd: "go build -o app .",
			Port:     8080,
		}, nil
	}

	return &Framework{
		Name:     "Go",
		Runtime:  "golang:1.22-alpine",
		BuildCmd: "go build -o app .",
		Port:     8080,
	}, nil
}

func detectPHPFramework(projectPath string) (*Framework, error) {
	composerPath := filepath.Join(projectPath, "composer.json")
	if pkg.FileExists(composerPath) {
		content, err := pkg.ReadFile(composerPath)
		if err == nil {
			var composer struct {
				Require map[string]string `json:"require"`
			}
			if json.Unmarshal(content, &composer) == nil {
				if _, ok := composer.Require["laravel/framework"]; ok {
					return &Framework{
						Name:     "Laravel",
						Runtime:  "php:8.2-fpm-alpine",
						BuildCmd: "composer install --no-dev --optimize-autoloader",
						Port:     8000,
					}, nil
				}

				if _, ok := composer.Require["symfony/framework-bundle"]; ok {
					return &Framework{
						Name:     "Symfony",
						Runtime:  "php:8.2-fpm-alpine",
						BuildCmd: "composer install --no-dev --optimize-autoloader",
						Port:     8000,
					}, nil
				}
			}
		}
	}

	return &Framework{
		Name:     "PHP",
		Runtime:  "php:8.2-fpm-alpine",
		BuildCmd: "composer install",
		Port:     8000,
	}, nil
}

func detectRubyFramework(projectPath string) (*Framework, error) {
	gemfilePath := filepath.Join(projectPath, "Gemfile")
	content, err := os.ReadFile(gemfilePath)
	if err == nil {
		contentStr := string(content)

		if strings.Contains(contentStr, "rails") {
			return &Framework{
				Name:     "Ruby on Rails",
				Runtime:  "ruby:3.2-alpine",
				BuildCmd: "bundle install",
				Port:     3000,
			}, nil
		}

		if strings.Contains(contentStr, "sinatra") {
			return &Framework{
				Name:     "Sinatra",
				Runtime:  "ruby:3.2-alpine",
				BuildCmd: "bundle install",
				Port:     4567,
			}, nil
		}
	}

	return &Framework{
		Name:     "Ruby",
		Runtime:  "ruby:3.2-alpine",
		BuildCmd: "bundle install",
		Port:     3000,
	}, nil
}

func detectJVMFramework(projectPath string) (*Framework, error) {
	if pkg.FileExists(filepath.Join(projectPath, "pom.xml")) {
		content, err := pkg.ReadFile(filepath.Join(projectPath, "pom.xml"))
		if err == nil && strings.Contains(string(content), "spring-boot") {
			return &Framework{
				Name:     "Spring Boot",
				Runtime:  "eclipse-temurin:21-jdk-alpine",
				BuildCmd: "mvn clean package -DskipTests",
				Port:     8080,
			}, nil
		}

		return &Framework{
			Name:     "Maven",
			Runtime:  "eclipse-temurin:21-jdk-alpine",
			BuildCmd: "mvn clean package -DskipTests",
			Port:     8080,
		}, nil
	}

	if pkg.FileExists(filepath.Join(projectPath, "build.gradle")) ||
		pkg.FileExists(filepath.Join(projectPath, "build.gradle.kts")) {
		return &Framework{
			Name:     "Gradle",
			Runtime:  "eclipse-temurin:21-jdk-alpine",
			BuildCmd: "./gradlew build",
			Port:     8080,
		}, nil
	}

	return &Framework{
		Name:     "Java",
		Runtime:  "eclipse-temurin:21-jdk-alpine",
		BuildCmd: "javac *.java",
		Port:     8080,
	}, nil
}

func detectRustFramework(projectPath string) (*Framework, error) {
	cargoPath := filepath.Join(projectPath, "Cargo.toml")
	content, err := pkg.ReadFile(cargoPath)
	if err == nil {
		contentStr := string(content)

		if strings.Contains(contentStr, "actix-web") {
			return &Framework{
				Name:     "Rust (Actix Web)",
				Runtime:  "rust:1.75-alpine",
				BuildCmd: "cargo build --release",
				Port:     8080,
			}, nil
		}

		if strings.Contains(contentStr, "rocket") {
			return &Framework{
				Name:     "Rust (Rocket)",
				Runtime:  "rust:1.75-alpine",
				BuildCmd: "cargo build --release",
				Port:     8000,
			}, nil
		}
	}

	return &Framework{
		Name:     "Rust",
		Runtime:  "rust:1.75-alpine",
		BuildCmd: "cargo build --release",
		Port:     8080,
	}, nil
}

func analyzeArchitecture(projectPath string, result *ProjectStructure) {
	// Analyze each framework directory for dependencies
	for _, framework := range result.Frameworks {
		servicePath := filepath.Join(projectPath, framework.Path)

		// Check for database dependencies
		analyzeDatabaseDependencies(servicePath, result.Architecture)

		// Check for service dependencies
		analyzeServiceDependencies(servicePath, result.Architecture)
	}

	// Also check root level for monorepo-wide dependencies
	if result.IsMonorepo {
		analyzeDatabaseDependencies(projectPath, result.Architecture)
		analyzeServiceDependencies(projectPath, result.Architecture)
	}
}

func analyzeDatabaseDependencies(dirPath string, arch *ArchitectureInfo) {
	seenDBs := make(map[string]bool)
	for _, db := range arch.Databases {
		seenDBs[db.Name] = true
	}

	// Check package.json for Node.js databases
	if pkg.FileExists(filepath.Join(dirPath, "package.json")) {
		data, err := pkg.ReadFile(filepath.Join(dirPath, "package.json"))
		if err == nil {
			var packageJSON struct {
				Dependencies    map[string]string `json:"dependencies"`
				DevDependencies map[string]string `json:"devDependencies"`
			}
			if json.Unmarshal(data, &packageJSON) == nil {
				allDeps := make(map[string]string)
				for k, v := range packageJSON.Dependencies {
					allDeps[k] = v
				}
				for k, v := range packageJSON.DevDependencies {
					allDeps[k] = v
				}

				// PostgreSQL
				if _, ok := allDeps["pg"]; ok {
					if !seenDBs["postgresql"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "postgresql",
							Type:     "relational",
							Required: true,
						})
						seenDBs["postgresql"] = true
					}
				}
				if _, ok := allDeps["pg-promise"]; ok {
					if !seenDBs["postgresql"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "postgresql",
							Type:     "relational",
							Required: true,
						})
						seenDBs["postgresql"] = true
					}
				}

				// MySQL
				if _, ok := allDeps["mysql"]; ok {
					if !seenDBs["mysql"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "mysql",
							Type:     "relational",
							Required: true,
						})
						seenDBs["mysql"] = true
					}
				}
				if _, ok := allDeps["mysql2"]; ok {
					if !seenDBs["mysql"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "mysql",
							Type:     "relational",
							Required: true,
						})
						seenDBs["mysql"] = true
					}
				}

				// MongoDB
				if _, ok := allDeps["mongodb"]; ok {
					if !seenDBs["mongodb"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "mongodb",
							Type:     "nosql",
							Required: true,
						})
						seenDBs["mongodb"] = true
					}
				}
				if _, ok := allDeps["mongoose"]; ok {
					if !seenDBs["mongodb"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "mongodb",
							Type:     "nosql",
							Required: true,
						})
						seenDBs["mongodb"] = true
					}
				}

				// Redis
				if _, ok := allDeps["redis"]; ok {
					if !seenDBs["redis"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "redis",
							Type:     "cache",
							Required: true,
						})
						seenDBs["redis"] = true
					}
				}
				if _, ok := allDeps["ioredis"]; ok {
					if !seenDBs["redis"] {
						arch.Databases = append(arch.Databases, DatabaseDependency{
							Name:     "redis",
							Type:     "cache",
							Required: true,
						})
						seenDBs["redis"] = true
					}
				}
			}
		}
	}

	// Check Python requirements
	if pkg.FileExists(filepath.Join(dirPath, "requirements.txt")) {
		content, err := pkg.ReadFile(filepath.Join(dirPath, "requirements.txt"))
		if err == nil {
			contentStr := strings.ToLower(string(content))

			if strings.Contains(contentStr, "psycopg2") || strings.Contains(contentStr, "pg8000") {
				if !seenDBs["postgresql"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "postgresql",
						Type:     "relational",
						Required: true,
					})
					seenDBs["postgresql"] = true
				}
			}

			if strings.Contains(contentStr, "pymysql") || strings.Contains(contentStr, "mysql-connector") {
				if !seenDBs["mysql"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "mysql",
						Type:     "relational",
						Required: true,
					})
					seenDBs["mysql"] = true
				}
			}

			if strings.Contains(contentStr, "pymongo") {
				if !seenDBs["mongodb"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "mongodb",
						Type:     "nosql",
						Required: true,
					})
					seenDBs["mongodb"] = true
				}
			}

			if strings.Contains(contentStr, "redis") {
				if !seenDBs["redis"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "redis",
						Type:     "cache",
						Required: true,
					})
					seenDBs["redis"] = true
				}
			}
		}
	}

	// Check Go modules
	if pkg.FileExists(filepath.Join(dirPath, "go.mod")) {
		content, err := pkg.ReadFile(filepath.Join(dirPath, "go.mod"))
		if err == nil {
			contentStr := string(content)

			if strings.Contains(contentStr, "github.com/lib/pq") || strings.Contains(contentStr, "github.com/jackc/pgx") {
				if !seenDBs["postgresql"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "postgresql",
						Type:     "relational",
						Required: true,
					})
					seenDBs["postgresql"] = true
				}
			}

			if strings.Contains(contentStr, "github.com/go-sql-driver/mysql") {
				if !seenDBs["mysql"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "mysql",
						Type:     "relational",
						Required: true,
					})
					seenDBs["mysql"] = true
				}
			}

			if strings.Contains(contentStr, "go.mongodb.org/mongo-driver") {
				if !seenDBs["mongodb"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "mongodb",
						Type:     "nosql",
						Required: true,
					})
					seenDBs["mongodb"] = true
				}
			}

			if strings.Contains(contentStr, "github.com/redis/go-redis") {
				if !seenDBs["redis"] {
					arch.Databases = append(arch.Databases, DatabaseDependency{
						Name:     "redis",
						Type:     "cache",
						Required: true,
					})
					seenDBs["redis"] = true
				}
			}
		}
	}
}

func analyzeServiceDependencies(dirPath string, arch *ArchitectureInfo) {
	seenServices := make(map[string]bool)
	for _, svc := range arch.Services {
		seenServices[svc.Name] = true
	}

	// Check package.json for Node.js services
	if pkg.FileExists(filepath.Join(dirPath, "package.json")) {
		data, err := pkg.ReadFile(filepath.Join(dirPath, "package.json"))
		if err == nil {
			var packageJSON struct {
				Dependencies    map[string]string `json:"dependencies"`
				DevDependencies map[string]string `json:"devDependencies"`
			}
			if json.Unmarshal(data, &packageJSON) == nil {
				allDeps := make(map[string]string)
				for k, v := range packageJSON.Dependencies {
					allDeps[k] = v
				}
				for k, v := range packageJSON.DevDependencies {
					allDeps[k] = v
				}

				// RabbitMQ
				if _, ok := allDeps["amqplib"]; ok {
					if !seenServices["rabbitmq"] {
						arch.Services = append(arch.Services, ServiceDependency{
							Name:     "rabbitmq",
							Type:     "message_queue",
							Required: true,
						})
						seenServices["rabbitmq"] = true
					}
				}
				if _, ok := allDeps["amqp"]; ok {
					if !seenServices["rabbitmq"] {
						arch.Services = append(arch.Services, ServiceDependency{
							Name:     "rabbitmq",
							Type:     "message_queue",
							Required: true,
						})
						seenServices["rabbitmq"] = true
					}
				}

				// Redis (if not already detected as database)
				if _, ok := allDeps["redis"]; ok {
					if !seenServices["redis"] {
						arch.Services = append(arch.Services, ServiceDependency{
							Name:     "redis",
							Type:     "cache",
							Required: true,
						})
						seenServices["redis"] = true
					}
				}
				if _, ok := allDeps["ioredis"]; ok {
					if !seenServices["redis"] {
						arch.Services = append(arch.Services, ServiceDependency{
							Name:     "redis",
							Type:     "cache",
							Required: true,
						})
						seenServices["redis"] = true
					}
				}

				// MinIO/S3
				if _, ok := allDeps["aws-sdk"]; ok {
					if !seenServices["minio"] {
						arch.Services = append(arch.Services, ServiceDependency{
							Name:     "minio",
							Type:     "storage",
							Required: true,
						})
						seenServices["minio"] = true
					}
				}
				if _, ok := allDeps["minio"]; ok {
					if !seenServices["minio"] {
						arch.Services = append(arch.Services, ServiceDependency{
							Name:     "minio",
							Type:     "storage",
							Required: true,
						})
						seenServices["minio"] = true
					}
				}
			}
		}
	}

	// Check Python requirements for services
	if pkg.FileExists(filepath.Join(dirPath, "requirements.txt")) {
		content, err := pkg.ReadFile(filepath.Join(dirPath, "requirements.txt"))
		if err == nil {
			contentStr := strings.ToLower(string(content))

			if strings.Contains(contentStr, "pika") || strings.Contains(contentStr, "aio-pika") {
				if !seenServices["rabbitmq"] {
					arch.Services = append(arch.Services, ServiceDependency{
						Name:     "rabbitmq",
						Type:     "message_queue",
						Required: true,
					})
					seenServices["rabbitmq"] = true
				}
			}

			if strings.Contains(contentStr, "boto3") || strings.Contains(contentStr, "minio") {
				if !seenServices["minio"] {
					arch.Services = append(arch.Services, ServiceDependency{
						Name:     "minio",
						Type:     "storage",
						Required: true,
					})
					seenServices["minio"] = true
				}
			}
		}
	}

	// Check Go modules for services
	if pkg.FileExists(filepath.Join(dirPath, "go.mod")) {
		content, err := pkg.ReadFile(filepath.Join(dirPath, "go.mod"))
		if err == nil {
			contentStr := string(content)

			if strings.Contains(contentStr, "github.com/rabbitmq/amqp091-go") {
				if !seenServices["rabbitmq"] {
					arch.Services = append(arch.Services, ServiceDependency{
						Name:     "rabbitmq",
						Type:     "message_queue",
						Required: true,
					})
					seenServices["rabbitmq"] = true
				}
			}

			if strings.Contains(contentStr, "github.com/minio/minio-go") {
				if !seenServices["minio"] {
					arch.Services = append(arch.Services, ServiceDependency{
						Name:     "minio",
						Type:     "storage",
						Required: true,
					})
					seenServices["minio"] = true
				}
			}
		}
	}
}
