package deployment

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

func (o *DeploymentOrchestrator) CreateTraefikConfig(job DeploymentJob, container *ContainerInfo) error {
	configDir := "/etc/traefik/dynamic"
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	rule := fmt.Sprintf("Host(`%s`)", job.Domain)

	configContent := fmt.Sprintf(`http:
  routers:
    %s:
      rule: "%s"
      service: "%s"
      entryPoints:
        - web
      priority: 200

  services:
    %s:
      loadBalancer:
        servers:
          - url: "http://docker:%d"
        healthCheck:
          path: /
          interval: 10s
          timeout: 3s
`,
		container.Name,
		rule,
		container.Name,
		container.Name,
		container.Port,
	)

	configPath := filepath.Join(configDir, fmt.Sprintf("%s.yml", container.Name))
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		return fmt.Errorf("failed to write Traefik config: %w", err)
	}

	log.Printf("✅ Created Traefik config: %s -> %s (port %d)",
		container.Name, job.Domain, container.Port)

	return nil
}

func (o *DeploymentOrchestrator) RemoveTraefikConfig(containerName string) error {
	configPath := filepath.Join("/etc/traefik/dynamic", fmt.Sprintf("%s.yml", containerName))

	if err := os.Remove(configPath); err != nil && !os.IsNotExist(err) {
		log.Printf("⚠️ Failed to remove Traefik config for %s: %v", containerName, err)
		return err
	}

	log.Printf("🗑️ Removed Traefik config for %s", containerName)
	return nil
}
