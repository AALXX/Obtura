package builder

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func GenerateDockerfile(framework *Framework, projectPath string) (string, error) {
	switch {
	case framework.Name == "Next.js":
		return generateNextJsDockerfile(framework, projectPath)
	case framework.Name == "Nuxt.js":
		return generateNuxtDockerfile(framework)
	case framework.Name == "Express.js":
		return generateExpressDockerfile(framework)
	case framework.Name == "NestJS":
		return generateNestJSDockerfile(framework)
	case strings.HasPrefix(framework.Name, "Vite"):
		return generateViteDockerfile(framework)
	case framework.Name == "Create React App":
		return generateCRADockerfile(framework)
	case framework.Name == "Django":
		return generateDjangoDockerfile(framework)
	case framework.Name == "Flask":
		return generateFlaskDockerfile(framework)
	case framework.Name == "FastAPI":
		return generateFastAPIDockerfile(framework)
	case strings.HasPrefix(framework.Name, "Go"):
		return generateGoDockerfile(framework)
	case framework.Name == "Laravel":
		return generateLaravelDockerfile(framework)
	case framework.Name == "Ruby on Rails":
		return generateRailsDockerfile(framework)
	case framework.Name == "Spring Boot":
		return generateSpringBootDockerfile(framework)
	case strings.HasPrefix(framework.Name, "Rust"):
		return generateRustDockerfile(framework)
	default:
		return generateGenericDockerfile(framework)
	}
}

func ensureNextConfigStandalone(projectPath string) (bool, error) {
	configFiles := []string{
		"next.config.js",
		"next.config.mjs",
		"next.config.ts",
	}

	var configPath string
	var configContent []byte
	var fileExt string

	for _, configFile := range configFiles {
		path := filepath.Join(projectPath, configFile)
		if _, err := os.Stat(path); err == nil {
			configPath = path
			configContent, err = os.ReadFile(path)
			if err != nil {
				return false, fmt.Errorf("failed to read config file: %w", err)
			}
			fileExt = filepath.Ext(configFile)
			break
		}
	}

	if configPath == "" {
		configPath = filepath.Join(projectPath, "next.config.js")
		newConfig := `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}

module.exports = nextConfig
`
		if err := os.WriteFile(configPath, []byte(newConfig), 0644); err != nil {
			return false, fmt.Errorf("failed to create next.config.js: %w", err)
		}
		return true, nil
	}

	content := string(configContent)

	standalonePattern := regexp.MustCompile(`output:\s*['"\x60]standalone['"\x60]`)
	if standalonePattern.MatchString(content) {
		return false, nil // Already configured
	}

	// Attempt different strategies to add standalone
	modified := false
	var newContent string

	outputPattern := regexp.MustCompile(`(output:\s*)['"\x60]([^'"\x60]+)['"\x60]`)
	if outputPattern.MatchString(content) {
		newContent = outputPattern.ReplaceAllString(content, `${1}'standalone'`)
		modified = true
	} else {
		// Strategy 2: Find the main config object and add output property
		// This handles various formats more robustly
		
		// Look for patterns like:
		// const nextConfig = { ... }
		// module.exports = { ... }
		// export default { ... }
		
		configPatterns := []string{
			`(const\s+\w+\s*=\s*\{)(\s*)`,
			`(module\.exports\s*=\s*\{)(\s*)`,
			`(export\s+default\s+\{)(\s*)`,
		}

		for _, pattern := range configPatterns {
			re := regexp.MustCompile(pattern)
			if re.MatchString(content) {
				// Add output as first property
				newContent = re.ReplaceAllString(content, "$1\n  output: 'standalone',\n$2")
				modified = true
				break
			}
		}

		// Strategy 3: If config uses spread or is complex, wrap it
		if !modified {
			// For .mjs or .ts files, use export default
			if fileExt == ".mjs" || fileExt == ".ts" {
				// Check if there's already an export default with a variable
				exportDefaultPattern := regexp.MustCompile(`export\s+default\s+(\w+)`)
				matches := exportDefaultPattern.FindStringSubmatch(content)
				
				if len(matches) > 1 {
					varName := matches[1]
					newContent = exportDefaultPattern.ReplaceAllString(content, 
						fmt.Sprintf(`export default {
  ...%s,
  output: 'standalone',
}`, varName))
					modified = true
				} else if strings.Contains(content, "export default") {
					inlineExportPattern := regexp.MustCompile(`(export\s+default\s+\{)(\s*)`)
					if inlineExportPattern.MatchString(content) {
						newContent = inlineExportPattern.ReplaceAllString(content, "$1\n  output: 'standalone',\n$2")
						modified = true
					}
				} else {
					newContent = content + `

export default {
  output: 'standalone',
}
`
					modified = true
				}
			} else {
				moduleExportsPattern := regexp.MustCompile(`module\.exports\s*=\s*(\w+)`)
				matches := moduleExportsPattern.FindStringSubmatch(content)
				
				if len(matches) > 1 {
					varName := matches[1]
					newContent = moduleExportsPattern.ReplaceAllString(content,
						fmt.Sprintf(`module.exports = {
  ...%s,
  output: 'standalone',
}`, varName))
					modified = true
				} else {
					newContent = content + `

// Standalone output added by build system
const originalConfig = module.exports || {}
module.exports = {
  ...originalConfig,
  output: 'standalone',
}
`
					modified = true
				}
			}
		}
	}

	if modified {
		// Write the modified config
		if err := os.WriteFile(configPath, []byte(newContent), 0644); err != nil {
			return false, fmt.Errorf("failed to write updated config: %w", err)
		}
		return true, nil
	}

	return false, nil
}

func generateNextJsDockerfile(framework *Framework, projectPath string) (string, error) {
	modified, err := ensureNextConfigStandalone(projectPath)
	if err != nil {
		fmt.Printf("⚠️  Failed to modify Next.js config: %v\n", err)
	}
	
	if modified {
		fmt.Printf("✓ Added standalone output to Next.js config\n")
	}

	// Check if we should use standalone mode
	useStandalone := true
	
	// Verify standalone directory will exist after build
	standalonePath := filepath.Join(projectPath, ".next", "standalone")
	_, statErr := os.Stat(standalonePath)
	standaloneExists := statErr == nil

	dockerfile := `FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Skip type checking and linting during build to avoid failures
# These should be done in CI/CD before building
ENV SKIP_ENV_VALIDATION=1

# Build the application with verbose output
RUN npm run build || (cat /root/.npm/_logs/*.log 2>/dev/null; exit 1)

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

`

	if useStandalone && (modified || standaloneExists) {
		dockerfile += `COPY --from=builder /app/public ./public

# Create .next directory with correct permissions
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
`
	} else {
		dockerfile += `COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
`
		fmt.Printf("⚠️  Using fallback Dockerfile (non-standalone) for Next.js\n")
	}

	return dockerfile, nil
}

func generateNuxtDockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nuxtjs

COPY --from=builder --chown=nuxtjs:nodejs /app/.output ./

USER nuxtjs

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["node", "server/index.mjs"]
`, nil
}

func generateExpressDockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

COPY --from=deps --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --chown=expressjs:nodejs . .

USER expressjs

EXPOSE 3000

CMD ["node", "index.js"]
`, nil
}

func generateNestJSDockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build
RUN npm ci --only=production && npm cache clean --force

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main"]
`, nil
}

func generateViteDockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`, nil
}

func generateCRADockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`, nil
}

func generateDjangoDockerfile(framework *Framework) (string, error) {
	return `FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Collect static files
RUN python manage.py collectstatic --noinput

# Create non-root user
RUN useradd -m -u 1001 django && chown -R django:django /app
USER django

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "wsgi:application"]
`, nil
}

func generateFlaskDockerfile(framework *Framework) (string, error) {
	return `FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

RUN useradd -m -u 1001 flask && chown -R flask:flask /app
USER flask

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "app:app"]
`, nil
}

func generateFastAPIDockerfile(framework *Framework) (string, error) {
	return `FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

RUN useradd -m -u 1001 fastapi && chown -R fastapi:fastapi /app
USER fastapi

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
`, nil
}

func generateGoDockerfile(framework *Framework) (string, error) {
	return `FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/main .

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

USER appuser

EXPOSE 8080

CMD ["./main"]
`, nil
}

func generateLaravelDockerfile(framework *Framework) (string, error) {
	return `FROM php:8.2-fpm-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    postgresql-dev \
    zip \
    unzip \
    git

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_pgsql

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Copy composer files
COPY composer.json composer.lock* ./
RUN composer install --no-dev --no-scripts --no-autoloader

# Copy application
COPY . .

RUN composer dump-autoload --optimize && \
    php artisan config:cache && \
    php artisan route:cache && \
    php artisan view:cache

RUN chown -R www-data:www-data /var/www

USER www-data

EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
`, nil
}

func generateRailsDockerfile(framework *Framework) (string, error) {
	return `FROM ruby:3.2-alpine AS base

# Install dependencies
RUN apk add --no-cache \
    build-base \
    postgresql-dev \
    nodejs \
    yarn \
    tzdata

WORKDIR /app

# Install gems
COPY Gemfile Gemfile.lock ./
RUN bundle install --without development test

# Install node packages
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Copy application
COPY . .

# Precompile assets
RUN RAILS_ENV=production bundle exec rake assets:precompile

RUN adduser -D -u 1001 rails && chown -R rails:rails /app
USER rails

EXPOSE 3000

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
`, nil
}

func generateSpringBootDockerfile(framework *Framework) (string, error) {
	return `FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /app

# Copy Maven wrapper and pom.xml
COPY mvnw* pom.xml ./
COPY .mvn .mvn

# Download dependencies
RUN ./mvnw dependency:go-offline

# Copy source and build
COPY src ./src
RUN ./mvnw package -DskipTests

# Final stage
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy the jar from builder
COPY --from=builder /app/target/*.jar app.jar

RUN addgroup -g 1001 -S spring && \
    adduser -u 1001 -S spring -G spring

USER spring

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
`, nil
}

func generateRustDockerfile(framework *Framework) (string, error) {
	return `FROM rust:1.75-alpine AS builder

# Install build dependencies
RUN apk add --no-cache musl-dev

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock* ./

# Build dependencies (cached layer)
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy source and build
COPY . .
RUN touch src/main.rs && cargo build --release

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary
COPY --from=builder /app/target/release/* ./

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

USER appuser

EXPOSE 8080

CMD ["./app"]
`, nil
}

func generateGenericDockerfile(framework *Framework) (string, error) {
	return fmt.Sprintf(`FROM %s

WORKDIR /app

COPY . .

RUN %s

EXPOSE %d

CMD ["/bin/sh", "-c", "echo 'Please configure your start command'"]
`, framework.Runtime, framework.BuildCmd, framework.Port), nil
}