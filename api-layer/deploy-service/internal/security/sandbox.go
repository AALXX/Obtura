package security

import (
	"time"
	"github.com/docker/go-units"
)

// DeploymentSandboxConfig defines security constraints for deployed containers
type DeploymentSandboxConfig struct {
	// Resource Limits
	CPUQuota     int64
	MemoryLimit  int64
	PidsLimit    int64
	StorageLimit int64

	// Network Security
	NetworkMode    string   // "none", "bridge", "obtura_dev"
	NetworkName    string   // Actual network name to connect to
	AllowedPorts   []int
	DNSServers     []string
	ExposeToHost   bool     // Whether to expose ports to host
	HostPortStart  int      // Starting port for host bindings

	// Security Options
	NoNewPrivs    bool
	ReadOnlyRoot  bool
	MaskedPaths   []string
	ReadOnlyPaths []string
	

	// Runtime Options
	Environment    string
	HealthCheckURL string
	StartupTimeout time.Duration
	
	// Traefik Integration
	EnableTraefik bool
	TraefikHost   string // e.g., "project-id.s3rbvn.org"
}

// GetDefaultDeploymentConfig returns secure defaults based on plan tier
func GetDefaultDeploymentConfig(planTier string, environment string) DeploymentSandboxConfig {
	baseConfig := DeploymentSandboxConfig{
		NoNewPrivs:     true,
		ReadOnlyRoot:   true,
		NetworkMode:    "obtura_dev",        // Use shared network
		NetworkName:    "obtura_dev",        // Explicit network name
		Environment:    environment,
		HealthCheckURL: "/health",
		StartupTimeout: 120 * time.Second,
		DNSServers:     []string{"1.1.1.1", "1.0.0.1"},
		ExposeToHost:   false,                // Enable host port exposure
		HostPortStart:  9100,                // Start assigning from port 9000
		EnableTraefik:  true,                // Enable Traefik routing
		TraefikHost:    "",                  // Will be set per deployment

		// Default security hardening
		MaskedPaths: []string{
			"/proc/asound",
			"/proc/acpi",
			"/proc/kcore",
			"/proc/keys",
			"/proc/latency_stats",
			"/proc/timer_list",
			"/proc/timer_stats",
			"/proc/sched_debug",
			"/proc/scsi",
			"/sys/firmware",
			"/sys/devices/virtual/powercap",
		},
		ReadOnlyPaths: []string{
			"/proc/bus",
			"/proc/fs",
			"/proc/irq",
			"/proc/sys",
			"/proc/sysrq-trigger",
		},
	}

	// Adjust resources based on plan tier
	switch planTier {
	case "starter":
		baseConfig.CPUQuota = 100000
		baseConfig.MemoryLimit = 536870912
		baseConfig.PidsLimit = 128
		baseConfig.StorageLimit = 5 * units.GiB
		baseConfig.AllowedPorts = []int{8080}

	case "team":
		baseConfig.CPUQuota = 200000
		baseConfig.MemoryLimit = 1073741824
		baseConfig.PidsLimit = 256
		baseConfig.StorageLimit = 20 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443}

	case "business":
		baseConfig.CPUQuota = 400000
		baseConfig.MemoryLimit = 2147483648
		baseConfig.PidsLimit = 512
		baseConfig.StorageLimit = 50 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443, 9090}

	case "enterprise":
		baseConfig.CPUQuota = 800000
		baseConfig.MemoryLimit = 4294967296
		baseConfig.PidsLimit = 1024
		baseConfig.StorageLimit = 100 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443, 9090, 3000}

	default:
		return GetDefaultDeploymentConfig("starter", environment)
	}

	// Production environments get stricter security
	if environment == "production" {
		baseConfig.ReadOnlyRoot = true
		baseConfig.StartupTimeout = 180 * time.Second
	} else {
		baseConfig.StartupTimeout = 60 * time.Second
		// Development can be less restrictive
		baseConfig.ReadOnlyRoot = false
	}

	return baseConfig
}