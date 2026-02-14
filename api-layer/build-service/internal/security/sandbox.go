package security

import (
	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-units"
	"github.com/opencontainers/runtime-spec/specs-go"
)

type SandboxConfig struct {
	CPUQuota     int64  
	MemoryLimit  int64  
	PidsLimit    int64  
	NoNewPrivs   bool   
	ReadOnlyRoot bool   
	NetworkMode  string 
}

func CreateSecureBuildContainer(config SandboxConfig) (*container.Config, *container.HostConfig) {
	containerConfig := &container.Config{
		User: "1000:1000", // Non-root user
		Labels: map[string]string{
			"obtura.service": "build",
			"obtura.sandbox": "enabled",
		},
	}

	hostConfig := &container.HostConfig{
		// CPU limits
		Resources: container.Resources{
			CPUQuota:  config.CPUQuota,     // 2 cores = 200000
			CPUPeriod: 100000,              // 100ms period
			Memory:    config.MemoryLimit,  // 8GB = 8589934592
			MemorySwap: config.MemoryLimit, // No swap
			PidsLimit:  &config.PidsLimit,  // Max 512 processes
			Ulimits: []*units.Ulimit{
				{
					Name: "nofile",
					Soft: 1024,
					Hard: 1024,
				},
				{
					Name: "nproc",
					Soft: 512,
					Hard: 512,
				},
			},
		},

		SecurityOpt: []string{
			"no-new-privileges:true",
			"seccomp=unconfined", // Or use custom seccomp profile
			"apparmor=docker-default",
		},

		// Capabilities (drop all, add only what's needed)
		CapDrop: []string{"ALL"},
		CapAdd: []string{
			"CHOWN",
			"DAC_OVERRIDE",
			"SETGID",
			"SETUID",
		},

		NetworkMode: container.NetworkMode(config.NetworkMode),

		Privileged: false,

		// Read-only root filesystem
		ReadonlyRootfs: config.ReadOnlyRoot,

		// Tmpfs mounts for writable directories
		Tmpfs: map[string]string{
			"/tmp":     "rw,noexec,nosuid,size=1g",
			"/var/tmp": "rw,noexec,nosuid,size=1g",
		},

		// Log configuration
		LogConfig: container.LogConfig{
			Type: "json-file",
			Config: map[string]string{
				"max-size": "10m",
				"max-file": "3",
			},
		},
	}

	return containerConfig, hostConfig
}

func ApplySeccompProfile() *specs.LinuxSeccomp {
	return &specs.LinuxSeccomp{
		DefaultAction: specs.ActErrno,
		Architectures: []specs.Arch{
			specs.ArchX86_64,
			specs.ArchX86,
			specs.ArchX32,
		},
		Syscalls: []specs.LinuxSyscall{
			{Names: []string{"read", "write", "open", "close", "openat"}, Action: specs.ActAllow},
			{Names: []string{"stat", "fstat", "lstat", "newfstatat"}, Action: specs.ActAllow},
			{Names: []string{"mmap", "munmap", "mprotect", "mremap"}, Action: specs.ActAllow},
			{Names: []string{"brk", "exit", "exit_group"}, Action: specs.ActAllow},
			{Names: []string{"clone", "fork", "vfork", "execve"}, Action: specs.ActAllow},
			{Names: []string{"wait4", "waitid"}, Action: specs.ActAllow},
			{Names: []string{"getpid", "getppid", "getuid", "getgid"}, Action: specs.ActAllow},

			{Names: []string{"ptrace", "process_vm_readv", "process_vm_writev"}, Action: specs.ActKill},
			{Names: []string{"kexec_load", "kexec_file_load"}, Action: specs.ActKill},
			{Names: []string{"create_module", "init_module", "finit_module", "delete_module"}, Action: specs.ActKill},
			{Names: []string{"iopl", "ioperm", "ioprio_set"}, Action: specs.ActKill},
		},
	}
}