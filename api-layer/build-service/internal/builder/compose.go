package builder

import (
	"fmt"
	"log"
	"regexp"
	"strings"
)

func NormalizeServiceName(path string) string {
	if path == "." || path == "" {
		return "app"
	}

	name := strings.Trim(path, "./")

	reg := regexp.MustCompile(`[^a-zA-Z0-9-_]+`)
	name = reg.ReplaceAllString(name, "-")

	name = regexp.MustCompile(`-+`).ReplaceAllString(name, "-")

	name = strings.Trim(name, "-")

	log.Printf("Normalizing %s to %s", path, name)

	return strings.ToLower(name)
}

func GenerateDockerCompose(structure *ProjectStructure, projectID, buildID string) (string, error) {
	if !structure.IsMonorepo || len(structure.Frameworks) == 0 {
		return "", fmt.Errorf("docker-compose generation requires a monorepo with multiple services")
	}

	var sb strings.Builder

	// Header
	sb.WriteString("version: '3.8'\n\n")
	sb.WriteString("services:\n")

	// Generate service definitions
	for _, framework := range structure.Frameworks {
		serviceName := NormalizeServiceName(framework.Path)
		imageTag := fmt.Sprintf("obtura/%s-%s:%s", projectID, serviceName, buildID)

		sb.WriteString(fmt.Sprintf("  %s:\n", serviceName))
		sb.WriteString(fmt.Sprintf("    build:\n"))
		sb.WriteString(fmt.Sprintf("      context: ./%s\n", framework.Path))
		sb.WriteString(fmt.Sprintf("      dockerfile: Dockerfile\n"))
		sb.WriteString(fmt.Sprintf("    image: %s\n", imageTag))
		sb.WriteString(fmt.Sprintf("    container_name: %s-%s\n", projectID, serviceName))
		sb.WriteString(fmt.Sprintf("    ports:\n"))
		sb.WriteString(fmt.Sprintf("      - \"%d:%d\"\n", framework.Port, framework.Port))

		// Add environment variables based on framework
		envVars := getEnvironmentVariables(framework, serviceName)
		if len(envVars) > 0 {
			sb.WriteString("    environment:\n")
			for key, value := range envVars {
				sb.WriteString(fmt.Sprintf("      - %s=%s\n", key, value))
			}
		}

		// Add networks
		sb.WriteString("    networks:\n")
		sb.WriteString("      - app-network\n")

		// Add restart policy
		sb.WriteString("    restart: unless-stopped\n")

		// Add health check for backend services
		if isBackendService(framework) {
			healthCheck := getHealthCheck(framework)
			if healthCheck != "" {
				sb.WriteString("    healthcheck:\n")
				sb.WriteString(healthCheck)
			}
		}

		// Add depends_on for frontend services
		if isFrontendService(framework) {
			backendServices := getBackendServices(structure)
			if len(backendServices) > 0 {
				sb.WriteString("    depends_on:\n")
				for _, backendSvc := range backendServices {
					sb.WriteString(fmt.Sprintf("      - %s\n", backendSvc))
				}
			}
		}

		sb.WriteString("\n")
	}

	// Add networks section
	sb.WriteString("networks:\n")
	sb.WriteString("  app-network:\n")
	sb.WriteString("    driver: bridge\n")

	// Add volumes section if needed
	if hasDatabase(structure) {
		sb.WriteString("\nvolumes:\n")
		sb.WriteString("  postgres-data:\n")
		sb.WriteString("  redis-data:\n")
	}

	return sb.String(), nil
}

// getEnvironmentVariables returns framework-specific environment variables
func getEnvironmentVariables(framework *Framework, serviceName string) map[string]string {
	env := make(map[string]string)

	switch {
	case framework.Name == "Next.js" || framework.Name == "Bun (Next.js)":
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)
		env["HOSTNAME"] = "0.0.0.0"

	case framework.Name == "Nuxt.js":
		env["NODE_ENV"] = "production"
		env["HOST"] = "0.0.0.0"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)

	case framework.Name == "Express.js" || framework.Name == "NestJS" || framework.Name == "Fastify" ||
		framework.Name == "Koa" || framework.Name == "Bun (Express)":
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)

	case strings.HasPrefix(framework.Name, "Astro"):
		env["NODE_ENV"] = "production"
		env["HOST"] = "0.0.0.0"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)

	case framework.Name == "Remix":
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)
		env["HOST"] = "0.0.0.0"

	case strings.HasPrefix(framework.Name, "SvelteKit"):
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)
		env["HOST"] = "0.0.0.0"

	case framework.Name == "SolidStart":
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)

	case framework.Name == "Hono" || framework.Name == "Bun (Hono)":
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)

	case framework.Name == "Django":
		env["DJANGO_SETTINGS_MODULE"] = "config.settings"
		env["PYTHONUNBUFFERED"] = "1"
		env["DATABASE_URL"] = "postgresql://user:password@postgres:5432/dbname"

	case framework.Name == "Flask":
		env["FLASK_ENV"] = "production"
		env["PYTHONUNBUFFERED"] = "1"

	case framework.Name == "FastAPI":
		env["PYTHONUNBUFFERED"] = "1"

	case strings.HasPrefix(framework.Name, "Go"):
		env["GIN_MODE"] = "release"

	case framework.Name == "Laravel":
		env["APP_ENV"] = "production"
		env["APP_DEBUG"] = "false"

	case framework.Name == "Symfony":
		env["APP_ENV"] = "prod"
		env["APP_DEBUG"] = "0"

	case framework.Name == "Ruby on Rails":
		env["RAILS_ENV"] = "production"
		env["RAILS_SERVE_STATIC_FILES"] = "true"

	case strings.HasPrefix(framework.Name, ".NET") || strings.HasPrefix(framework.Name, "ASP.NET"):
		env["ASPNETCORE_ENVIRONMENT"] = "Production"
		env["ASPNETCORE_URLS"] = fmt.Sprintf("http://+: %d", framework.Port)

	case framework.Name == "Phoenix" || strings.HasPrefix(framework.Name, "Elixir"):
		env["PHX_SERVER"] = "true"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)

	case framework.Name == "Deno":
		env["PORT"] = fmt.Sprintf("%d", framework.Port)
		env["HOST"] = "0.0.0.0"

	case strings.HasPrefix(framework.Name, "Bun"):
		env["NODE_ENV"] = "production"
		env["PORT"] = fmt.Sprintf("%d", framework.Port)
	}

	return env
}

// getHealthCheck returns a health check configuration for the framework
func getHealthCheck(framework *Framework) string {
	var check strings.Builder

	switch {
	case framework.Name == "FastAPI" || framework.Name == "Django" || framework.Name == "Flask":
		check.WriteString("      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:8000/health\"]\n")
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")
		check.WriteString("      start_period: 40s\n")

	case framework.Name == "Express.js" || framework.Name == "NestJS" || framework.Name == "Fastify" ||
		framework.Name == "Koa" || framework.Name == "Hono" || framework.Name == "Bun (Express)" ||
		framework.Name == "Bun (Hono)":
		check.WriteString(fmt.Sprintf("      test: [\"CMD\", \"wget\", \"--no-verbose\", \"--tries=1\", \"--spider\", \"http://localhost:%d/health\"]\n", framework.Port))
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")

	case strings.HasPrefix(framework.Name, "Go"):
		check.WriteString(fmt.Sprintf("      test: [\"CMD\", \"wget\", \"--no-verbose\", \"--tries=1\", \"--spider\", \"http://localhost:%d/health\"]\n", framework.Port))
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")

	case framework.Name == "Spring Boot":
		check.WriteString("      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:8080/actuator/health\"]\n")
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")

	case strings.HasPrefix(framework.Name, ".NET") || strings.HasPrefix(framework.Name, "ASP.NET"):
		check.WriteString(fmt.Sprintf("      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:%d/health\"]\n", framework.Port))
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")

	case framework.Name == "Phoenix":
		check.WriteString("      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:4000/health\"]\n")
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")

	case framework.Name == "Ruby on Rails":
		check.WriteString("      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:3000/health\"]\n")
		check.WriteString("      interval: 30s\n")
		check.WriteString("      timeout: 10s\n")
		check.WriteString("      retries: 3\n")
	}

	return check.String()
}

// isBackendService checks if a framework is a backend service
func isBackendService(framework *Framework) bool {
	backendFrameworks := []string{
		"Express.js", "NestJS", "Fastify", "Koa", "Hono",
		"Django", "Flask", "FastAPI",
		"Go", "Go (Gin)", "Go (Fiber)", "Go (Echo)",
		"Laravel", "Symfony",
		"Ruby on Rails", "Sinatra",
		"Spring Boot", "Gradle", "Maven",
		"Rust (Actix Web)", "Rust (Rocket)",
		"Phoenix", "Elixir (Plug)",
		"Deno",
		"Bun", "Bun (Express)", "Bun (Elysia)", "Bun (Hono)",
		".NET", "ASP.NET Core", "Blazor Server",
	}

	for _, backend := range backendFrameworks {
		if framework.Name == backend || strings.HasPrefix(framework.Name, backend) {
			return true
		}
	}
	return false
}

// isFrontendService checks if a framework is a frontend service
func isFrontendService(framework *Framework) bool {
	frontendFrameworks := []string{
		"Next.js", "Nuxt.js",
		"Vite + React", "Vite + Vue", "Vite + Svelte", "Vite",
		"Create React App",
		"Astro", "Astro (SSR)",
		"Remix",
		"SvelteKit", "SvelteKit (Static)",
		"SolidStart", "Solid (Vite)",
		"Angular",
		"Gatsby",
		"Eleventy",
		"Hexo",
		"VuePress",
		"Blazor WebAssembly",
	}

	for _, frontend := range frontendFrameworks {
		if framework.Name == frontend {
			return true
		}
	}
	return framework.IsStatic
}

// getBackendServices returns a list of backend service names from the structure
func getBackendServices(structure *ProjectStructure) []string {
	var services []string
	for _, framework := range structure.Frameworks {
		if isBackendService(framework) {
			services = append(services, NormalizeServiceName(framework.Path))
		}
	}
	return services
}

// hasDatabase checks if any framework typically uses a database
func hasDatabase(structure *ProjectStructure) bool {
	databaseFrameworks := []string{
		"Django", "Flask", "FastAPI",
		"Laravel", "Symfony",
		"Ruby on Rails",
		"Spring Boot",
		"Phoenix",
		"Go (Gin)", "Go (Fiber)", "Go (Echo)",
		"NestJS",
		"ASP.NET Core",
	}

	for _, framework := range structure.Frameworks {
		for _, dbFramework := range databaseFrameworks {
			if framework.Name == dbFramework || strings.HasPrefix(framework.Name, dbFramework) {
				return true
			}
		}
	}

	if structure.Architecture != nil && len(structure.Architecture.Databases) > 0 {
		return true
	}

	return false
}

// GenerateDockerComposeForDeployment creates a production-ready docker-compose.yml
func GenerateDockerComposeForDeployment(structure *ProjectStructure, projectID, buildID string) (string, error) {
	compose, err := GenerateDockerCompose(structure, projectID, buildID)
	if err != nil {
		return "", err
	}

	// Add additional production services if needed
	var sb strings.Builder
	sb.WriteString(compose)

	// Add database service if needed
	if hasDatabase(structure) {
		sb.WriteString("\n  postgres:\n")
		sb.WriteString("    image: postgres:15-alpine\n")
		sb.WriteString("    container_name: " + projectID + "-postgres\n")
		sb.WriteString("    environment:\n")
		sb.WriteString("      - POSTGRES_USER=user\n")
		sb.WriteString("      - POSTGRES_PASSWORD=password\n")
		sb.WriteString("      - POSTGRES_DB=dbname\n")
		sb.WriteString("    volumes:\n")
		sb.WriteString("      - postgres-data:/var/lib/postgresql/data\n")
		sb.WriteString("    networks:\n")
		sb.WriteString("      - app-network\n")
		sb.WriteString("    restart: unless-stopped\n\n")

		sb.WriteString("  redis:\n")
		sb.WriteString("    image: redis:7-alpine\n")
		sb.WriteString("    container_name: " + projectID + "-redis\n")
		sb.WriteString("    volumes:\n")
		sb.WriteString("      - redis-data:/data\n")
		sb.WriteString("    networks:\n")
		sb.WriteString("      - app-network\n")
		sb.WriteString("    restart: unless-stopped\n")
	}

	return sb.String(), nil
}
