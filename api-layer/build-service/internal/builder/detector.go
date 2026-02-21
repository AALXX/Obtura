package builder

import (
	"build-service/pkg"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Framework struct {
	Name        string            `json:"name"`
	Version     string            `json:"version,omitempty"`
	BuildCmd    string            `json:"buildCmd"`
	Runtime     string            `json:"runtime"`
	Port        int               `json:"port"`
	Path        string            `json:"path"`
	StartCmd    string            `json:"startCmd,omitempty"`
	OutputDir   string            `json:"outputDir,omitempty"`
	IsStatic    bool              `json:"isStatic"`
	EnvVars     map[string]string `json:"envVars,omitempty"`
	HealthCheck string            `json:"healthCheck,omitempty"`
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
	} else if pkg.FileExists(filepath.Join(dirPath, "deno.json")) ||
		pkg.FileExists(filepath.Join(dirPath, "deno.jsonc")) ||
		pkg.FileExists(filepath.Join(dirPath, "deno.config.ts")) ||
		detectDenoProject(dirPath) {
		framework, err = detectDenoFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "bunfig.toml")) ||
		pkg.FileExists(filepath.Join(dirPath, "bun.lockb")) ||
		detectBunProject(dirPath) {
		framework, err = detectBunFramework(dirPath)
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
	} else if pkg.FileExists(filepath.Join(dirPath, "*.csproj")) ||
		pkg.FileExists(filepath.Join(dirPath, "*.fsproj")) ||
		detectDotNetProject(dirPath) {
		framework, err = detectDotNetFramework(dirPath)
	} else if pkg.FileExists(filepath.Join(dirPath, "mix.exs")) {
		framework, err = detectElixirFramework(dirPath)
	} else if isStaticSite(dirPath) {
		framework, err = detectStaticSite(dirPath)
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
		Name            string            `json:"name"`
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
		Scripts         map[string]string `json:"scripts"`
		Main            string            `json:"main"`
		Module          string            `json:"module"`
		Type            string            `json:"type"`
	}

	if err := json.Unmarshal(data, &packageJSON); err != nil {
		return nil, err
	}

	allDeps := make(map[string]string)
	for k, v := range packageJSON.Dependencies {
		allDeps[k] = v
	}
	for k, v := range packageJSON.DevDependencies {
		allDeps[k] = v
	}

	startCmd := detectStartCommand(packageJSON.Scripts, packageJSON.Main)

	if _, ok := allDeps["next"]; ok {
		return &Framework{
			Name:     "Next.js",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
			StartCmd: startCmd,
			EnvVars: map[string]string{
				"NODE_ENV": "production",
			},
		}, nil
	}

	if _, ok := allDeps["@astrojs/astro"]; ok {
		outputDir := "dist"
		if _, hasSSR := allDeps["@astrojs/node"]; hasSSR {
			return &Framework{
				Name:      "Astro (SSR)",
				Runtime:   "node:20-alpine",
				BuildCmd:  "npm run build",
				Port:      4321,
				StartCmd:  "node ./dist/server/entry.mjs",
				IsStatic:  false,
				OutputDir: "dist",
			}, nil
		}
		return &Framework{
			Name:      "Astro",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: outputDir,
		}, nil
	}

	if _, ok := allDeps["@remix-run/node"]; ok {
		return &Framework{
			Name:     "Remix",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
			StartCmd: startCmd,
			EnvVars: map[string]string{
				"NODE_ENV": "production",
			},
		}, nil
	}

	if _, ok := allDeps["@sveltejs/kit"]; ok {
		if _, hasAdapter := allDeps["@sveltejs/adapter-static"]; hasAdapter {
			return &Framework{
				Name:      "SvelteKit (Static)",
				Runtime:   "node:20-alpine",
				BuildCmd:  "npm run build",
				Port:      80,
				IsStatic:  true,
				OutputDir: "build",
			}, nil
		}
		return &Framework{
			Name:     "SvelteKit",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
			StartCmd: "node build",
			EnvVars: map[string]string{
				"NODE_ENV": "production",
				"PORT":     "3000",
			},
		}, nil
	}

	if _, ok := allDeps["solid-js"]; ok {
		if _, hasStart := allDeps["@solidjs/start"]; hasStart {
			return &Framework{
				Name:     "SolidStart",
				Runtime:  "node:20-alpine",
				BuildCmd: "npm run build",
				Port:     3000,
				StartCmd: startCmd,
			}, nil
		}
		if _, hasVite := allDeps["vite"]; hasVite {
			return &Framework{
				Name:      "Solid (Vite)",
				Runtime:   "node:20-alpine",
				BuildCmd:  "npm run build",
				Port:      80,
				IsStatic:  true,
				OutputDir: "dist",
			}, nil
		}
	}

	if _, ok := allDeps["@angular/core"]; ok {
		return &Framework{
			Name:      "Angular",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: "dist/browser",
		}, nil
	}

	if _, ok := allDeps["@nestjs/core"]; ok {
		return &Framework{
			Name:        "NestJS",
			Runtime:     "node:20-alpine",
			BuildCmd:    "npm run build",
			Port:        3000,
			StartCmd:    "node dist/main",
			HealthCheck: "/health",
		}, nil
	}

	if _, ok := allDeps["hono"]; ok {
		return &Framework{
			Name:        "Hono",
			Runtime:     "node:20-alpine",
			BuildCmd:    "npm run build",
			Port:        3000,
			StartCmd:    startCmd,
			HealthCheck: "/",
		}, nil
	}

	if _, ok := allDeps["nuxt"]; ok {
		return &Framework{
			Name:     "Nuxt.js",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     3000,
			StartCmd: "node .output/server/index.mjs",
		}, nil
	}

	if _, ok := allDeps["vite"]; ok {
		if _, hasReact := allDeps["react"]; hasReact {
			return &Framework{
				Name:      "Vite + React",
				Runtime:   "node:20-alpine",
				BuildCmd:  "npm run build",
				Port:      80,
				IsStatic:  true,
				OutputDir: "dist",
			}, nil
		}
		if _, hasVue := allDeps["vue"]; hasVue {
			return &Framework{
				Name:      "Vite + Vue",
				Runtime:   "node:20-alpine",
				BuildCmd:  "npm run build",
				Port:      80,
				IsStatic:  true,
				OutputDir: "dist",
			}, nil
		}
		if _, hasSvelte := allDeps["svelte"]; hasSvelte {
			return &Framework{
				Name:      "Vite + Svelte",
				Runtime:   "node:20-alpine",
				BuildCmd:  "npm run build",
				Port:      80,
				IsStatic:  true,
				OutputDir: "dist",
			}, nil
		}
		return &Framework{
			Name:      "Vite",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: "dist",
		}, nil
	}

	if _, hasReact := allDeps["react"]; hasReact {
		return &Framework{
			Name:      "Create React App",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: "build",
		}, nil
	}

	if _, ok := allDeps["express"]; ok {
		return &Framework{
			Name:        "Express.js",
			Runtime:     "node:20-alpine",
			BuildCmd:    "npm install",
			Port:        3000,
			StartCmd:    startCmd,
			HealthCheck: "/health",
		}, nil
	}

	if _, ok := allDeps["fastify"]; ok {
		return &Framework{
			Name:        "Fastify",
			Runtime:     "node:20-alpine",
			BuildCmd:    "npm install",
			Port:        3000,
			StartCmd:    startCmd,
			HealthCheck: "/health",
		}, nil
	}

	if _, ok := allDeps["koa"]; ok {
		return &Framework{
			Name:     "Koa",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm install",
			Port:     3000,
			StartCmd: startCmd,
		}, nil
	}

	if _, ok := allDeps["@fastify/swagger"]; ok {
		return &Framework{
			Name:     "Fastify",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm install",
			Port:     3000,
			StartCmd: startCmd,
		}, nil
	}

	if _, ok := allDeps["strapi"]; ok {
		return &Framework{
			Name:     "Strapi",
			Runtime:  "node:20-alpine",
			BuildCmd: "npm run build",
			Port:     1337,
			StartCmd: "npm start",
		}, nil
	}

	if _, ok := allDeps["gatsby"]; ok {
		return &Framework{
			Name:      "Gatsby",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: "public",
		}, nil
	}

	if _, ok := allDeps["@11ty/eleventy"]; ok {
		return &Framework{
			Name:      "Eleventy",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: "_site",
		}, nil
	}

	if _, ok := allDeps["hexo"]; ok {
		return &Framework{
			Name:      "Hexo",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: "public",
		}, nil
	}

	if _, ok := allDeps["@vuepress/cli"]; ok {
		return &Framework{
			Name:      "VuePress",
			Runtime:   "node:20-alpine",
			BuildCmd:  "npm run build",
			Port:      80,
			IsStatic:  true,
			OutputDir: ".vuepress/dist",
		}, nil
	}

	return &Framework{
		Name:     "Node.js",
		Runtime:  "node:20-alpine",
		BuildCmd: "npm install",
		Port:     3000,
		StartCmd: startCmd,
	}, nil
}

func detectStartCommand(scripts map[string]string, mainFile string) string {
	if _, ok := scripts["start"]; ok {
		return "npm start"
	}

	if dev, ok := scripts["dev"]; ok {
		if strings.Contains(dev, "node") {
			return "npm run dev"
		}
		return "npm run dev"
	}

	if mainFile != "" {
		return fmt.Sprintf("node %s", mainFile)
	}

	if _, ok := scripts["serve"]; ok {
		return "npm run serve"
	}

	return "node index.js"
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

func detectDenoProject(dirPath string) bool {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if strings.HasSuffix(name, ".ts") || strings.HasSuffix(name, ".js") {
			content, err := os.ReadFile(filepath.Join(dirPath, entry.Name()))
			if err == nil {
				contentStr := string(content)
				if strings.Contains(contentStr, "Deno.serve") ||
					strings.Contains(contentStr, "Deno.listen") ||
					strings.Contains(contentStr, "deno://") ||
					strings.Contains(contentStr, "Deno.read") {
					return true
				}
			}
		}
	}

	mainFile := filepath.Join(dirPath, "main.ts")
	if _, err := os.Stat(mainFile); err == nil {
		return true
	}
	modFile := filepath.Join(dirPath, "mod.ts")
	if _, err := os.Stat(modFile); err == nil {
		return true
	}

	return false
}

func detectDenoFramework(projectPath string) (*Framework, error) {
	denoConfigPath := filepath.Join(projectPath, "deno.json")
	if pkg.FileExists(denoConfigPath) {
		content, err := pkg.ReadFile(denoConfigPath)
		if err == nil {
			var config struct {
				Tasks map[string]string `json:"tasks"`
			}
			if json.Unmarshal(content, &config) == nil {
				if _, ok := config.Tasks["start"]; ok {
					return &Framework{
						Name:     "Deno",
						Runtime:  "denoland/deno:alpine",
						BuildCmd: "deno cache main.ts",
						Port:     8000,
						StartCmd: "deno task start",
					}, nil
				}
			}
		}
	}

	mainTs := filepath.Join(projectPath, "main.ts")
	if pkg.FileExists(mainTs) {
		return &Framework{
			Name:     "Deno",
			Runtime:  "denoland/deno:alpine",
			BuildCmd: "deno cache main.ts",
			Port:     8000,
			StartCmd: "deno run --allow-net --allow-read main.ts",
		}, nil
	}

	return &Framework{
		Name:     "Deno",
		Runtime:  "denoland/deno:alpine",
		BuildCmd: "deno cache .",
		Port:     8000,
		StartCmd: "deno run --allow-net --allow-read .",
	}, nil
}

func detectBunProject(dirPath string) bool {
	bunLockPath := filepath.Join(dirPath, "bun.lockb")
	if pkg.FileExists(bunLockPath) {
		return true
	}

	packagePath := filepath.Join(dirPath, "package.json")
	if pkg.FileExists(packagePath) {
		content, err := pkg.ReadFile(packagePath)
		if err == nil {
			return strings.Contains(string(content), `"bun"`)
		}
	}

	return false
}

func detectBunFramework(projectPath string) (*Framework, error) {
	packagePath := filepath.Join(projectPath, "package.json")
	if pkg.FileExists(packagePath) {
		data, err := pkg.ReadFile(packagePath)
		if err != nil {
			return nil, err
		}

		var packageJSON struct {
			Dependencies    map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
			Scripts         map[string]string `json:"scripts"`
			Main            string            `json:"main"`
		}

		if err := json.Unmarshal(data, &packageJSON); err != nil {
			return nil, err
		}

		allDeps := make(map[string]string)
		for k, v := range packageJSON.Dependencies {
			allDeps[k] = v
		}
		for k, v := range packageJSON.DevDependencies {
			allDeps[k] = v
		}

		startCmd := detectBunStartCommand(packageJSON.Scripts, packageJSON.Main)

		if _, ok := allDeps["elysia"]; ok {
			return &Framework{
				Name:     "Bun (Elysia)",
				Runtime:  "oven/bun:alpine",
				BuildCmd: "bun install",
				Port:     3000,
				StartCmd: startCmd,
			}, nil
		}

		if _, ok := allDeps["@hono/node-server"]; ok {
			return &Framework{
				Name:     "Bun (Hono)",
				Runtime:  "oven/bun:alpine",
				BuildCmd: "bun install",
				Port:     3000,
				StartCmd: startCmd,
			}, nil
		}

		if _, ok := allDeps["next"]; ok {
			return &Framework{
				Name:     "Bun (Next.js)",
				Runtime:  "oven/bun:alpine",
				BuildCmd: "bun install && bun run build",
				Port:     3000,
				StartCmd: "bun start",
			}, nil
		}

		if _, ok := allDeps["express"]; ok {
			return &Framework{
				Name:     "Bun (Express)",
				Runtime:  "oven/bun:alpine",
				BuildCmd: "bun install",
				Port:     3000,
				StartCmd: startCmd,
			}, nil
		}

		return &Framework{
			Name:     "Bun",
			Runtime:  "oven/bun:alpine",
			BuildCmd: "bun install",
			Port:     3000,
			StartCmd: startCmd,
		}, nil
	}

	return &Framework{
		Name:     "Bun",
		Runtime:  "oven/bun:alpine",
		BuildCmd: "bun install",
		Port:     3000,
		StartCmd: "bun run index.ts",
	}, nil
}

func detectBunStartCommand(scripts map[string]string, mainFile string) string {
	if start, ok := scripts["start"]; ok {
		if strings.HasPrefix(start, "bun") {
			return start
		}
		return "bun " + start
	}

	if dev, ok := scripts["dev"]; ok {
		return "bun " + dev
	}

	if mainFile != "" {
		return fmt.Sprintf("bun run %s", mainFile)
	}

	return "bun run index.ts"
}

func detectDotNetProject(dirPath string) bool {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasSuffix(name, ".csproj") ||
			strings.HasSuffix(name, ".fsproj") ||
			strings.HasSuffix(name, ".vbproj") {
			return true
		}
	}

	if pkg.FileExists(filepath.Join(dirPath, "global.json")) {
		return true
	}

	return false
}

func detectDotNetFramework(projectPath string) (*Framework, error) {
	var projectFile string
	entries, err := os.ReadDir(projectPath)
	if err == nil {
		for _, entry := range entries {
			name := entry.Name()
			if strings.HasSuffix(name, ".csproj") ||
				strings.HasSuffix(name, ".fsproj") ||
				strings.HasSuffix(name, ".vbproj") {
				projectFile = name
				break
			}
		}
	}

	if projectFile != "" {
		projectPath := filepath.Join(projectPath, projectFile)
		content, err := pkg.ReadFile(projectPath)
		if err == nil {
			contentStr := string(content)

			if strings.Contains(contentStr, "Microsoft.AspNetCore") {
				if strings.Contains(contentStr, "Blazor") {
					if strings.Contains(contentStr, "WebAssembly") {
						return &Framework{
							Name:      "Blazor WebAssembly",
							Runtime:   "mcr.microsoft.com/dotnet/sdk:8.0",
							BuildCmd:  "dotnet publish -c Release -o publish",
							Port:      80,
							IsStatic:  true,
							OutputDir: "publish/wwwroot",
						}, nil
					}
					return &Framework{
						Name:     "Blazor Server",
						Runtime:  "mcr.microsoft.com/dotnet/sdk:8.0",
						BuildCmd: "dotnet publish -c Release -o publish",
						Port:     8080,
						StartCmd: "dotnet publish/{}.dll",
					}, nil
				}

				return &Framework{
					Name:     "ASP.NET Core",
					Runtime:  "mcr.microsoft.com/dotnet/sdk:8.0",
					BuildCmd: "dotnet publish -c Release -o publish",
					Port:     8080,
					StartCmd: "dotnet publish/{}.dll",
				}, nil
			}
		}

		return &Framework{
			Name:     ".NET",
			Runtime:  "mcr.microsoft.com/dotnet/sdk:8.0",
			BuildCmd: "dotnet build",
			Port:     8080,
		}, nil
	}

	return &Framework{
		Name:     ".NET",
		Runtime:  "mcr.microsoft.com/dotnet/sdk:8.0",
		BuildCmd: "dotnet build",
		Port:     8080,
	}, nil
}

func detectElixirFramework(projectPath string) (*Framework, error) {
	mixPath := filepath.Join(projectPath, "mix.exs")
	content, err := pkg.ReadFile(mixPath)
	if err == nil {
		contentStr := string(content)

		if strings.Contains(contentStr, "phoenix") {
			return &Framework{
				Name:     "Phoenix",
				Runtime:  "elixir:1.16-alpine",
				BuildCmd: "mix local.hex --force && mix local.rebar --force && mix deps.get --only prod && MIX_ENV=prod mix compile",
				Port:     4000,
				StartCmd: "mix phx.server",
			}, nil
		}

		if strings.Contains(contentStr, "plug") {
			return &Framework{
				Name:     "Elixir (Plug)",
				Runtime:  "elixir:1.16-alpine",
				BuildCmd: "mix local.hex --force && mix deps.get --only prod && MIX_ENV=prod mix compile",
				Port:     4000,
				StartCmd: "mix run --no-halt",
			}, nil
		}
	}

	return &Framework{
		Name:     "Elixir",
		Runtime:  "elixir:1.16-alpine",
		BuildCmd: "mix local.hex --force && mix deps.get && mix compile",
		Port:     4000,
		StartCmd: "mix run --no-halt",
	}, nil
}

func isStaticSite(dirPath string) bool {
	htmlFiles := []string{"index.html", "index.htm"}
	for _, htmlFile := range htmlFiles {
		if pkg.FileExists(filepath.Join(dirPath, htmlFile)) {
			return true
		}
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := strings.ToLower(entry.Name())
		if strings.HasSuffix(name, ".html") || strings.HasSuffix(name, ".htm") {
			return true
		}
	}

	return false
}

func detectStaticSite(projectPath string) (*Framework, error) {
	outputDir := "."

	entries, err := os.ReadDir(projectPath)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				name := strings.ToLower(entry.Name())
				if name == "public" || name == "www" || name == "site" || name == "dist" || name == "build" {
					if pkg.FileExists(filepath.Join(projectPath, name, "index.html")) {
						outputDir = name
						break
					}
				}
			}
		}
	}

	return &Framework{
		Name:      "Static HTML/CSS",
		Runtime:   "nginx:alpine",
		BuildCmd:  "echo 'Static site - no build required'",
		Port:      80,
		IsStatic:  true,
		OutputDir: outputDir,
	}, nil
}
