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
	NetworkMode   string // "none", "bridge", "obtura_dev"
	NetworkName   string // Actual network name to connect to
	AllowedPorts  []int
	DNSServers    []string
	ExposeToHost  bool // Whether to expose ports to host
	HostPortStart int  // Starting port for host bindings

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
// GetDefaultDeploymentConfig returns secure defaults based on plan tier
func GetDefaultDeploymentConfig(planTier string, environment string) DeploymentSandboxConfig {
	baseConfig := DeploymentSandboxConfig{
		NoNewPrivs:     true,
		ReadOnlyRoot:   false, // CHANGED: false by default for Node.js
		NetworkMode:    "obtura_dev",
		NetworkName:    "obtura_dev",
		Environment:    environment,
		HealthCheckURL: "/health",
		StartupTimeout: 120 * time.Second,
		DNSServers:     []string{"1.1.1.1", "1.0.0.1"},
		ExposeToHost:   false,
		HostPortStart:  9100,
		EnableTraefik:  true,
		TraefikHost:    "",

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

	// Adjust resources based on plan tier (matches subscription_plans table)
	// Next.js minimum: 512MB memory, 0.25 CPU recommended
	switch planTier {
	case "starter":
		baseConfig.CPUQuota = 500000        // 0.5 CPU - matches subscription
		baseConfig.MemoryLimit = 1073741824 // 1GB - matches subscription
		baseConfig.PidsLimit = 512
		baseConfig.StorageLimit = 10 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443, 3000}

	case "team":
		baseConfig.CPUQuota = 1000000       // 1.0 CPU - matches subscription
		baseConfig.MemoryLimit = 2147483648 // 2GB - matches subscription
		baseConfig.PidsLimit = 1024
		baseConfig.StorageLimit = 25 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443, 3000}

	case "business":
		baseConfig.CPUQuota = 2000000       // 2.0 CPU - matches subscription
		baseConfig.MemoryLimit = 4294967296 // 4GB - matches subscription
		baseConfig.PidsLimit = 2048
		baseConfig.StorageLimit = 50 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443, 3000, 9090}

	case "enterprise":
		baseConfig.CPUQuota = 4000000       // 4.0 CPU - matches subscription
		baseConfig.MemoryLimit = 8589934592 // 8GB - matches subscription
		baseConfig.PidsLimit = 4096
		baseConfig.StorageLimit = 100 * units.GiB
		baseConfig.AllowedPorts = []int{8080, 8443, 3000, 3001}

	default:
		return GetDefaultDeploymentConfig("starter", environment)
	}

	// Production environments can be stricter, but still compatible with Node.js
	if environment == "production" {
		baseConfig.ReadOnlyRoot = false // CHANGED: Node.js needs write access
		baseConfig.StartupTimeout = 180 * time.Second
	} else {
		baseConfig.StartupTimeout = 60 * time.Second
		baseConfig.ReadOnlyRoot = false
	}

	return baseConfig
}
