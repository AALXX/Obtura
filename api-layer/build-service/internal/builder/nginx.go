package builder

import (
	"fmt"
	"os"
	"path/filepath"
)

// GenerateNginxConfig creates an nginx.conf file for static sites
func GenerateNginxConfig() string {
	return `server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
`
}

// EnsureNginxConfig creates nginx.conf if it doesn't exist for static site frameworks
func EnsureNginxConfig(framework *Framework, projectPath string) error {
	// Only create nginx config for frameworks that serve static files
	needsNginx := framework.Name == "Vite + React" ||
		framework.Name == "Vite + Vue" ||
		framework.Name == "Create React App"

	if !needsNginx {
		return nil
	}

	nginxPath := filepath.Join(projectPath, "nginx.conf")
	
	// Don't overwrite existing nginx.conf
	if _, err := os.Stat(nginxPath); err == nil {
		return nil
	}

	config := GenerateNginxConfig()
	return os.WriteFile(nginxPath, []byte(config), 0644)
}

func GenerateEnvTemplate(structure *ProjectStructure, projectPath string) error {
	if !structure.IsMonorepo || len(structure.Frameworks) == 0 {
		return nil
	}

	var content string
	content += "# Environment Variables Template\n"
	content += "# Copy this file to .env and fill in your values\n\n"

	for _, framework := range structure.Frameworks {
		serviceName := NormalizeServiceName(framework.Path)
		content += fmt.Sprintf("# %s (%s)\n", serviceName, framework.Name)
		
		switch {
		case framework.Name == "Next.js":
			content += fmt.Sprintf("NEXT_PUBLIC_API_URL=http://localhost:%d\n", framework.Port)
			
		case framework.Name == "Django":
			content += "DATABASE_URL=postgresql://user:password@postgres:5432/dbname\n"
			content += "SECRET_KEY=your-secret-key-here\n"
			content += "DEBUG=False\n"
			
		case framework.Name == "Flask":
			content += "FLASK_ENV=production\n"
			content += "DATABASE_URL=postgresql://user:password@postgres:5432/dbname\n"
			content += "SECRET_KEY=your-secret-key-here\n"
			
		case framework.Name == "FastAPI":
			content += "DATABASE_URL=postgresql://user:password@postgres:5432/dbname\n"
			content += "SECRET_KEY=your-secret-key-here\n"
			
		case framework.Name == "Laravel":
			content += "APP_NAME=Laravel\n"
			content += "APP_ENV=production\n"
			content += "APP_KEY=\n"
			content += "APP_DEBUG=false\n"
			content += "DB_CONNECTION=pgsql\n"
			content += "DB_HOST=postgres\n"
			content += "DB_PORT=5432\n"
			content += "DB_DATABASE=dbname\n"
			content += "DB_USERNAME=user\n"
			content += "DB_PASSWORD=password\n"
			
		case framework.Name == "Ruby on Rails":
			content += "RAILS_ENV=production\n"
			content += "DATABASE_URL=postgresql://user:password@postgres:5432/dbname\n"
			content += "SECRET_KEY_BASE=your-secret-key-base-here\n"
		}
		
		content += "\n"
	}

	// Always write .env.example
	examplePath := filepath.Join(projectPath, ".env.example")
	if err := os.WriteFile(examplePath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write .env.example: %w", err)
	}

	return nil
}

// GenerateReadme creates a README.md with build and deployment instructions
func GenerateReadme(structure *ProjectStructure, projectPath string) error {
	var content string
	
	content += "# Project Build & Deployment Guide\n\n"
	
	if structure.IsMonorepo {
		content += "This is a monorepo containing multiple services:\n\n"
		for _, fw := range structure.Frameworks {
			content += fmt.Sprintf("- **%s** (%s) - Port %d\n", NormalizeServiceName(fw.Path), fw.Name, fw.Port)
		}
		content += "\n"
	}
	
	content += "## Prerequisites\n\n"
	content += "- Docker and Docker Compose installed\n"
	content += "- Access to the image registry\n\n"
	
	content += "## Local Development\n\n"
	
	if structure.IsMonorepo {
		content += "### Build all services:\n"
		content += "```bash\n"
		content += "docker-compose build\n"
		content += "```\n\n"
		
		content += "### Run all services:\n"
		content += "```bash\n"
		content += "docker-compose up\n"
		content += "```\n\n"
		
		content += "### Run specific service:\n"
		content += "```bash\n"
		content += "docker-compose up <service-name>\n"
		content += "```\n\n"
	} else {
		fw := structure.Frameworks[0]
		content += "### Build the image:\n"
		content += "```bash\n"
		content += fmt.Sprintf("docker build -t my-app:%s .\n", fw.Path)
		content += "```\n\n"
		
		content += "### Run the container:\n"
		content += "```bash\n"
		content += fmt.Sprintf("docker run -p %d:%d my-app\n", fw.Port, fw.Port)
		content += "```\n\n"
	}
	
	content += "## Services Overview\n\n"
	
	for _, fw := range structure.Frameworks {
		serviceName := NormalizeServiceName(fw.Path)
		content += fmt.Sprintf("### %s\n", serviceName)
		content += fmt.Sprintf("- **Framework**: %s\n", fw.Name)
		content += fmt.Sprintf("- **Port**: %d\n", fw.Port)
		content += fmt.Sprintf("- **Path**: `%s/`\n", fw.Path)
		
		if fw.Path != "." {
			content += fmt.Sprintf("- **Build Command**: `cd %s && %s`\n", fw.Path, fw.BuildCmd)
		} else {
			content += fmt.Sprintf("- **Build Command**: `%s`\n", fw.BuildCmd)
		}
		content += "\n"
	}
	
	content += "## Environment Variables\n\n"
	content += "Copy `.env.example` to `.env` and fill in your configuration:\n\n"
	content += "```bash\n"
	content += "cp .env.example .env\n"
	content += "```\n\n"
	
	content += "## Deployment\n\n"
	content += "The build service will automatically:\n"
	content += "1. Detect all frameworks in the project\n"
	content += "2. Generate Dockerfiles for each service\n"
	content += "3. Generate a docker-compose.yml for orchestration\n"
	content += "4. Build and push images to the registry\n\n"
	
	content += "## Troubleshooting\n\n"
	content += "### View logs:\n"
	content += "```bash\n"
	content += "docker-compose logs -f <service-name>\n"
	content += "```\n\n"
	
	content += "### Rebuild a service:\n"
	content += "```bash\n"
	content += "docker-compose build --no-cache <service-name>\n"
	content += "```\n\n"
	
	content += "### Clean up:\n"
	content += "```bash\n"
	content += "docker-compose down -v\n"
	content += "```\n"
	
	readmePath := filepath.Join(projectPath, "BUILD_README.md")
	return os.WriteFile(readmePath, []byte(content), 0644)
}