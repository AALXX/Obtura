export interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
    metadata?: {
        agent?: {
            role: string
            name?: string
        }
        strategy?: 'single' | 'multi' | 'collaborative'
        preset?: 'default' | 'crisis' | 'security' | 'optimize' | 'custom'
        action?: string
        data?: unknown
    }
}

export interface Conversation {
    id: string
    title: string
    messages: Message[]
    createdAt: Date
    updatedAt: Date
}

export type AIModel = {
    id: string
    name: string
    provider: 'openai' | 'anthropic' | 'gemini'
}

export const AI_MODELS: Record<string, AIModel[]> = {
    openai: [
        { id: 'gpt-4o', name: 'GPT-4o (Recommended)', provider: 'openai' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
    ],
    anthropic: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Recommended)', provider: 'anthropic' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
    ],
    gemini: [
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Recommended)', provider: 'gemini' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
        { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini' },
    ],
}

export const DEFAULT_MODELS: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-1.5-pro',
}

export type AgentRole = 
    | 'assistant'
    | 'architect'
    | 'operator'
    | 'reviewer'
    | 'security_expert'
    | 'performance_engineer'
    | 'database_admin'
    | 'devops_engineer'
    | 'incident_commander'
    | 'sre_operator'
    | 'code_reviewer'
    | 'infrastructure_architect'
    | 'custom'

export interface AgentDefinition {
    id: string
    role: AgentRole
    name: string
    description: string
    icon: string
    systemPrompt: string
    maxTokens: number
    temperature: number
    enabled: boolean
    order: number
}

export const BUILT_IN_AGENTS: AgentDefinition[] = [
    {
        id: 'architect',
        role: 'architect',
        name: 'Architect',
        description: 'Creates high-level plans and identifies components to modify',
        icon: 'Blueprint',
        systemPrompt: `You are the Architect.
Create high-level plans and identify the right components/files/services to touch.
Keep it short and structured. Focus on:
- System design and architecture
- Component interactions
- Data flow
- API boundaries`,
        maxTokens: 650,
        temperature: 0.3,
        enabled: true,
        order: 1,
    },
    {
        id: 'operator',
        role: 'operator',
        name: 'Operator',
        description: 'Turns plans into practical steps and commands',
        icon: 'Wrench',
        systemPrompt: `You are the Operator.
Turn plans into practical steps, commands, and checks.
Prefer safe, reversible actions and validation steps. Focus on:
- Concrete implementation steps
- CLI commands to run
- Validation checks
- Rollback procedures`,
        maxTokens: 750,
        temperature: 0.4,
        enabled: true,
        order: 2,
    },
    {
        id: 'reviewer',
        role: 'reviewer',
        name: 'Reviewer',
        description: 'Critiques plans and identifies risks',
        icon: 'Search',
        systemPrompt: `You are the Reviewer.
Critique plans, point out risks, and propose improvements.
End with the final recommended approach. Focus on:
- Security considerations
- Edge cases
- Potential failure modes
- Risk assessment`,
        maxTokens: 600,
        temperature: 0.2,
        enabled: true,
        order: 3,
    },
    {
        id: 'security_expert',
        role: 'security_expert',
        name: 'Security Expert',
        description: 'Analyzes security vulnerabilities and recommends fixes',
        icon: 'Shield',
        systemPrompt: `You are the Security Expert.
Analyze for security vulnerabilities, exposure of secrets, and compliance issues.
Provide specific remediation steps. Focus on:
- Authentication and authorization
- Data encryption
- Secret management
- Vulnerability assessment`,
        maxTokens: 700,
        temperature: 0.2,
        enabled: true,
        order: 4,
    },
    {
        id: 'performance_engineer',
        role: 'performance_engineer',
        name: 'Performance Engineer',
        description: 'Identifies performance bottlenecks and optimization opportunities',
        icon: 'Zap',
        systemPrompt: `You are the Performance Engineer.
Identify performance bottlenecks, resource issues, and optimization opportunities.
Provide specific tuning recommendations. Focus on:
- CPU and memory usage
- Database queries
- Caching strategies
- Network latency`,
        maxTokens: 700,
        temperature: 0.3,
        enabled: true,
        order: 5,
    },
    {
        id: 'database_admin',
        role: 'database_admin',
        name: 'Database Admin',
        description: 'Handles database schema, queries, and migrations',
        icon: 'Database',
        systemPrompt: `You are the Database Admin.
Handle database schema, queries, migrations, and optimization.
Provide SQL statements and schema changes. Focus on:
- Schema design
- Query optimization
- Migration scripts
- Backup strategies`,
        maxTokens: 700,
        temperature: 0.3,
        enabled: true,
        order: 6,
    },
    {
        id: 'devops_engineer',
        role: 'devops_engineer',
        name: 'DevOps Engineer',
        description: 'Manages CI/CD, infrastructure, and deployments',
        icon: 'Server',
        systemPrompt: `You are the DevOps Engineer.
Manage CI/CD pipelines, infrastructure as code, and deployment strategies.
Provide configuration and automation. Focus on:
- Docker and Kubernetes
- CI/CD pipelines
- Infrastructure as code
- Monitoring and alerting`,
        maxTokens: 750,
        temperature: 0.3,
        enabled: true,
        order: 7,
    },
    {
        id: 'incident_commander',
        role: 'incident_commander',
        name: 'Incident Commander',
        description: 'Crisis coordination and incident response',
        icon: 'AlertTriangle',
        systemPrompt: `You are the Incident Commander for an on-call DevOps crisis.
Priorities: stabilize service, reduce blast radius, establish timeline, communicate clearly.
Output format:
1) Situation (1-2 sentences)
2) Immediate actions (bullets, safe-first)
3) Data to gather next (bullets)
4) Mitigation plan + rollback criteria`,
        maxTokens: 700,
        temperature: 0.2,
        enabled: true,
        order: 8,
    },
    {
        id: 'sre_operator',
        role: 'sre_operator',
        name: 'SRE Operator',
        description: 'Hands-on diagnostics and operational procedures',
        icon: 'Activity',
        systemPrompt: `You are the hands-on SRE Operator.
Translate plans into concrete checks/commands and safest operational steps.
Prefer read-only diagnostics first. Include specific places to look:
- Build logs
- Deploy logs
- Metrics
- Health checks`,
        maxTokens: 800,
        temperature: 0.3,
        enabled: true,
        order: 9,
    },
    {
        id: 'code_reviewer',
        role: 'code_reviewer',
        name: 'Code Reviewer',
        description: 'Performs detailed code review and suggests improvements',
        icon: 'GitPullRequest',
        systemPrompt: `You are the Code Reviewer.
Perform detailed code review focusing on:
- Code quality and readability
- Best practices
- Error handling
- Test coverage
- Performance implications
Provide specific line-by-line feedback.`,
        maxTokens: 800,
        temperature: 0.3,
        enabled: true,
        order: 10,
    },
    {
        id: 'infrastructure_architect',
        role: 'infrastructure_architect',
        name: 'Infrastructure Architect',
        description: 'Designs scalable infrastructure and cloud architecture',
        icon: 'Cloud',
        systemPrompt: `You are the Infrastructure Architect.
Design scalable infrastructure and cloud architecture.
Provide Terraform/CDK code and architecture diagrams. Focus on:
- Cloud resource design
- Cost optimization
- High availability
- Disaster recovery`,
        maxTokens: 800,
        temperature: 0.3,
        enabled: true,
        order: 11,
    },
]

export type AgentStrategy = 'single' | 'multi' | 'collaborative'
export type AgentPreset = 'default' | 'crisis' | 'security' | 'optimize' | 'custom'

export const AGENT_PRESETS: Record<AgentPreset, string[]> = {
    default: ['architect', 'operator', 'reviewer'],
    crisis: ['incident_commander', 'sre_operator', 'architect', 'reviewer'],
    security: ['security_expert', 'architect', 'reviewer'],
    optimize: ['performance_engineer', 'database_admin', 'architect'],
    custom: [],
}

export interface CustomAgent extends AgentDefinition {
    isCustom: true
    createdAt: Date
    updatedAt: Date
}

export interface AISettings {
    openai_api_key: string
    claude_api_key: string
    gemini_api_key: string
    defaultProvider: string
    autoAnalyze: boolean
    showInsights: boolean
    model?: string
    agentStrategy: AgentStrategy
    agentPreset: AgentPreset
    selectedAgents: string[]
    customAgents: CustomAgent[]
    hasKeys?: {
        openai: boolean
        anthropic: boolean
        gemini: boolean
    }
}

export interface AIAgentState {
    conversations: Conversation[]
    activeConversationId: string | null
    isOpen: boolean
    isLoading: boolean
    error: string | null
    settings: AISettings
    isSaving: boolean
    projectId?: string
    accessToken?: string
}

export interface AIAgentActions {
    toggleOpen: () => void
    openChat: (projectId?: string) => void
    closeChat: () => void
    sendMessage: (content: string) => Promise<void>
    createNewConversation: () => void
    selectConversation: (conversationId: string) => void
    deleteConversation: (conversationId: string) => void
    clearError: () => void
    updateSettings: (settings: Partial<AISettings>) => void
    initializeSettings: (settings: Partial<AISettings>) => void
    saveSettings: (settings: AISettings) => Promise<void>
    loadSettings: () => Promise<void>
    loadConversations: () => Promise<void>
    setProjectId: (projectId: string) => void
    setAccessToken: (accessToken: string) => void
    setAgentStrategy: (strategy: AgentStrategy) => void
    setAgentPreset: (preset: AgentPreset) => void
    toggleAgent: (agentId: string) => void
    addCustomAgent: (agent: Omit<CustomAgent, 'isCustom' | 'createdAt' | 'updatedAt'>) => void
    removeCustomAgent: (agentId: string) => void
    updateCustomAgent: (agentId: string, updates: Partial<CustomAgent>) => void
}

export type SuggestedAction = {
    id: string
    label: string
    description: string
    icon: string
    prompt: string
}

export const SUGGESTED_ACTIONS: SuggestedAction[] = [
    {
        id: 'deploy-project',
        label: 'Deploy Project',
        description: 'Deploy your latest code to production or staging',
        icon: 'Rocket',
        prompt: 'Help me deploy my project'
    },
    {
        id: 'view-logs',
        label: 'View Logs',
        description: 'Check recent deployment or build logs',
        icon: 'FileText',
        prompt: 'Show me the latest deployment logs'
    },
    {
        id: 'analyze-build',
        label: 'Analyze Build',
        description: 'Analyze a failed build and find the root cause',
        icon: 'FileText',
        prompt: 'Analyze my latest failed build'
    },
    {
        id: 'scale-service',
        label: 'Scale Service',
        description: 'Adjust resources for your services',
        icon: 'TrendingUp',
        prompt: 'I need to scale my service'
    }
]
