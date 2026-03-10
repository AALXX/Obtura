package orchestrator

import (
	"context"
	"fmt"
	"strings"

	"ai-agent-service/internal/llm"
)

type Strategy string

const (
	StrategySingle        Strategy = "single"
	StrategyMulti         Strategy = "multi"
	StrategyCollaborative Strategy = "collaborative"
)

type Preset string

const (
	PresetDefault  Preset = "default"
	PresetCrisis   Preset = "crisis"
	PresetSecurity Preset = "security"
	PresetOptimize Preset = "optimize"
	PresetCustom   Preset = "custom"
)

type AgentRole string

const (
	RoleAssistant               AgentRole = "assistant"
	RoleArchitect               AgentRole = "architect"
	RoleOperator                AgentRole = "operator"
	RoleReviewer                AgentRole = "reviewer"
	RoleIncidentCommander       AgentRole = "incident_commander"
	RoleSREOperator             AgentRole = "sre_operator"
	RoleSecurityExpert          AgentRole = "security_expert"
	RolePerformanceEngineer     AgentRole = "performance_engineer"
	RoleDatabaseAdmin           AgentRole = "database_admin"
	RoleDevOpsEngineer          AgentRole = "devops_engineer"
	RoleCodeReviewer            AgentRole = "code_reviewer"
	RoleInfrastructureArchitect AgentRole = "infrastructure_architect"
)

type AgentSpec struct {
	Role        AgentRole
	Name        string
	SystemNotes string
	MaxTokens   int
	Temperature float64
	Enabled     bool
	Order       int
}

type AgentMessage struct {
	Role      AgentRole `json:"role"`
	Name      string    `json:"name"`
	Content   string    `json:"content"`
	StepIndex int       `json:"stepIndex"`
}

var BuiltInAgents = map[AgentRole]AgentSpec{
	RoleArchitect: {
		Role: RoleArchitect,
		Name: "Architect",
		SystemNotes: `You are the Architect.
Create high-level plans and identify the right components/files/services to touch.
Keep it short and structured. Focus on:
- System design and architecture
- Component interactions
- Data flow
- API boundaries`,
		MaxTokens:   650,
		Temperature: 0.3,
		Enabled:     true,
		Order:       1,
	},
	RoleOperator: {
		Role: RoleOperator,
		Name: "Operator",
		SystemNotes: `You are the Operator.
Turn plans into practical steps, commands, and checks.
Prefer safe, reversible actions and validation steps. Focus on:
- Concrete implementation steps
- CLI commands to run
- Validation checks
- Rollback procedures`,
		MaxTokens:   750,
		Temperature: 0.4,
		Enabled:     true,
		Order:       2,
	},
	RoleReviewer: {
		Role: RoleReviewer,
		Name: "Reviewer",
		SystemNotes: `You are the Reviewer.
Critique plans, point out risks, and propose improvements.
End with the final recommended approach. Focus on:
- Security considerations
- Edge cases
- Potential failure modes
- Risk assessment`,
		MaxTokens:   600,
		Temperature: 0.2,
		Enabled:     true,
		Order:       3,
	},
	RoleSecurityExpert: {
		Role: RoleSecurityExpert,
		Name: "Security Expert",
		SystemNotes: `You are the Security Expert.
Analyze for security vulnerabilities, exposure of secrets, and compliance issues.
Provide specific remediation steps. Focus on:
- Authentication and authorization
- Data encryption
- Secret management
- Vulnerability assessment`,
		MaxTokens:   700,
		Temperature: 0.2,
		Enabled:     true,
		Order:       4,
	},
	RolePerformanceEngineer: {
		Role: RolePerformanceEngineer,
		Name: "Performance Engineer",
		SystemNotes: `You are the Performance Engineer.
Identify performance bottlenecks, resource issues, and optimization opportunities.
Provide specific tuning recommendations. Focus on:
- CPU and memory usage
- Database queries
- Caching strategies
- Network latency`,
		MaxTokens:   700,
		Temperature: 0.3,
		Enabled:     true,
		Order:       5,
	},
	RoleDatabaseAdmin: {
		Role: RoleDatabaseAdmin,
		Name: "Database Admin",
		SystemNotes: `You are the Database Admin.
Handle database schema, queries, migrations, and optimization.
Provide SQL statements and schema changes. Focus on:
- Schema design
- Query optimization
- Migration scripts
- Backup strategies`,
		MaxTokens:   700,
		Temperature: 0.3,
		Enabled:     true,
		Order:       6,
	},
	RoleDevOpsEngineer: {
		Role: RoleDevOpsEngineer,
		Name: "DevOps Engineer",
		SystemNotes: `You are the DevOps Engineer.
Manage CI/CD pipelines, infrastructure as code, and deployment strategies.
Provide configuration and automation. Focus on:
- Docker and Kubernetes
- CI/CD pipelines
- Infrastructure as code
- Monitoring and alerting`,
		MaxTokens:   750,
		Temperature: 0.3,
		Enabled:     true,
		Order:       7,
	},
	RoleIncidentCommander: {
		Role: RoleIncidentCommander,
		Name: "Incident Commander",
		SystemNotes: `You are the Incident Commander for an on-call DevOps crisis.
Priorities: stabilize service, reduce blast radius, establish timeline, communicate clearly.
Output format:
1) Situation (1-2 sentences)
2) Immediate actions (bullets, safe-first)
3) Data to gather next (bullets)
4) Mitigation plan + rollback criteria`,
		MaxTokens:   700,
		Temperature: 0.2,
		Enabled:     true,
		Order:       8,
	},
	RoleSREOperator: {
		Role: RoleSREOperator,
		Name: "SRE Operator",
		SystemNotes: `You are the hands-on SRE Operator.
Translate plans into concrete checks/commands and safest operational steps.
Prefer read-only diagnostics first. Include specific places to look:
- Build logs
- Deploy logs
- Metrics
- Health checks`,
		MaxTokens:   800,
		Temperature: 0.3,
		Enabled:     true,
		Order:       9,
	},
	RoleCodeReviewer: {
		Role: RoleCodeReviewer,
		Name: "Code Reviewer",
		SystemNotes: `You are the Code Reviewer.
Perform detailed code review focusing on:
- Code quality and readability
- Best practices
- Error handling
- Test coverage
- Performance implications
Provide specific line-by-line feedback.`,
		MaxTokens:   800,
		Temperature: 0.3,
		Enabled:     true,
		Order:       10,
	},
	RoleInfrastructureArchitect: {
		Role: RoleInfrastructureArchitect,
		Name: "Infrastructure Architect",
		SystemNotes: `You are the Infrastructure Architect.
Design scalable infrastructure and cloud architecture.
Provide Terraform/CDK code and architecture diagrams. Focus on:
- Cloud resource design
- Cost optimization
- High availability
- Disaster recovery`,
		MaxTokens:   800,
		Temperature: 0.3,
		Enabled:     true,
		Order:       11,
	},
}

func normalizePreset(p string) Preset {
	switch strings.ToLower(strings.TrimSpace(p)) {
	case string(PresetCrisis):
		return PresetCrisis
	case string(PresetSecurity):
		return PresetSecurity
	case string(PresetOptimize):
		return PresetOptimize
	case string(PresetCustom):
		return PresetCustom
	default:
		return PresetDefault
	}
}

func normalizeStrategy(s string) Strategy {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case string(StrategyMulti):
		return StrategyMulti
	case string(StrategyCollaborative):
		return StrategyCollaborative
	default:
		return StrategySingle
	}
}

func GetAgentByRole(role AgentRole) (AgentSpec, bool) {
	agent, ok := BuiltInAgents[role]
	return agent, ok
}

func PresetAgents(preset Preset) []AgentSpec {
	switch preset {
	case PresetCrisis:
		return []AgentSpec{
			BuiltInAgents[RoleIncidentCommander],
			BuiltInAgents[RoleSREOperator],
			BuiltInAgents[RoleArchitect],
			BuiltInAgents[RoleReviewer],
		}
	case PresetSecurity:
		return []AgentSpec{
			BuiltInAgents[RoleSecurityExpert],
			BuiltInAgents[RoleArchitect],
			BuiltInAgents[RoleReviewer],
		}
	case PresetOptimize:
		return []AgentSpec{
			BuiltInAgents[RolePerformanceEngineer],
			BuiltInAgents[RoleDatabaseAdmin],
			BuiltInAgents[RoleArchitect],
		}
	default:
		return []AgentSpec{
			BuiltInAgents[RoleArchitect],
			BuiltInAgents[RoleOperator],
			BuiltInAgents[RoleReviewer],
		}
	}
}

func GetAgentsFromSelection(selectedAgentIDs []string) []AgentSpec {
	agents := make([]AgentSpec, 0, len(selectedAgentIDs))
	for _, id := range selectedAgentIDs {
		role := AgentRole(id)
		if agent, ok := BuiltInAgents[role]; ok {
			agents = append(agents, agent)
		}
	}
	return agents
}

type MultiAgentInput struct {
	Provider          llm.Provider
	Model             string
	BaseSystemPrompt  string
	EnrichedContext   string        // live platform data injected before the LLM call
	ConversationSlice []llm.Message // non-system history (user/assistant)
	UserMessage       string
	StrategyRaw       string
	PresetRaw         string
	SelectedAgents    []string    // custom agent selection
	CustomAgents      []AgentSpec // custom agent definitions
}

type MultiAgentOutput struct {
	Strategy     Strategy       `json:"strategy"`
	Preset       Preset         `json:"preset"`
	Messages     []AgentMessage `json:"messages"`
	InputTokens  int            `json:"inputTokens"`
	OutputTokens int            `json:"outputTokens"`
}

func GetAgents(in MultiAgentInput) []AgentSpec {
	preset := normalizePreset(in.PresetRaw)

	// If custom agents are provided, use them
	if len(in.CustomAgents) > 0 {
		return in.CustomAgents
	}

	// If specific agents are selected, use those
	if len(in.SelectedAgents) > 0 && preset == PresetCustom {
		return GetAgentsFromSelection(in.SelectedAgents)
	}

	// Otherwise use preset
	return PresetAgents(preset)
}

func Run(ctx context.Context, in MultiAgentInput) (*MultiAgentOutput, error) {
	if in.Provider == nil {
		return nil, fmt.Errorf("provider is nil")
	}
	strategy := normalizeStrategy(in.StrategyRaw)
	preset := normalizePreset(in.PresetRaw)

	base := make([]llm.Message, 0, 3+len(in.ConversationSlice)+6)
	if strings.TrimSpace(in.BaseSystemPrompt) != "" {
		base = append(base, llm.Message{Role: "system", Content: in.BaseSystemPrompt})
	}
	// Inject live platform data (builds, deployments, metrics, logs) when available.
	if strings.TrimSpace(in.EnrichedContext) != "" {
		base = append(base, llm.Message{
			Role:    "system",
			Content: "The following is REAL live data fetched from the Obtura platform. Use it directly in your response — do not say you lack access to this information.\n\n" + in.EnrichedContext,
		})
	}
	base = append(base, in.ConversationSlice...)

	// Single agent = one completion with base prompt.
	if strategy == StrategySingle {
		req := llm.CompletionRequest{
			Messages:    append(base, llm.Message{Role: "user", Content: in.UserMessage}),
			MaxTokens:   2000,
			Temperature: 0.7,
			Stream:      false,
			Model:       in.Model,
		}
		resp, err := in.Provider.Complete(ctx, req)
		if err != nil {
			return nil, err
		}
		return &MultiAgentOutput{
			Strategy:     strategy,
			Preset:       preset,
			InputTokens:  resp.InputTokens,
			OutputTokens: resp.OutputTokens,
			Messages: []AgentMessage{
				{
					Role:      RoleAssistant,
					Name:      "Obtura AI",
					Content:   resp.Content,
					StepIndex: 0,
				},
			},
		}, nil
	}

	agents := GetAgents(in)
	out := &MultiAgentOutput{
		Strategy: strategy,
		Preset:   preset,
		Messages: make([]AgentMessage, 0, len(agents)),
	}

	var crossAgentContext strings.Builder

	for i, spec := range agents {
		msgs := make([]llm.Message, 0, len(base)+4)
		msgs = append(msgs, base...)
		msgs = append(msgs, llm.Message{Role: "system", Content: spec.SystemNotes})

		if crossAgentContext.Len() > 0 {
			msgs = append(msgs, llm.Message{
				Role: "system",
				Content: "Context from other roles so far (do not repeat verbatim; build on it):\n\n" +
					crossAgentContext.String(),
			})
		}

		msgs = append(msgs, llm.Message{Role: "user", Content: in.UserMessage})

		req := llm.CompletionRequest{
			Messages:    msgs,
			MaxTokens:   spec.MaxTokens,
			Temperature: spec.Temperature,
			Stream:      false,
			Model:       in.Model,
		}

		resp, err := in.Provider.Complete(ctx, req)
		if err != nil {
			return nil, err
		}

		out.InputTokens += resp.InputTokens
		out.OutputTokens += resp.OutputTokens

		content := strings.TrimSpace(resp.Content)
		out.Messages = append(out.Messages, AgentMessage{
			Role:      spec.Role,
			Name:      spec.Name,
			Content:   content,
			StepIndex: i,
		})

		// Feed forward a compact labeled transcript.
		if content != "" {
			crossAgentContext.WriteString(fmt.Sprintf("## %s (%s)\n%s\n\n", spec.Name, spec.Role, content))
		}
	}

	return out, nil
}
