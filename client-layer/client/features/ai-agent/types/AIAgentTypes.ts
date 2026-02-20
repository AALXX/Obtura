export interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
    metadata?: {
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

export interface AISettings {
    openai_api_key: string
    claude_api_key: string
    gemini_api_key: string
    defaultProvider: string
    autoAnalyze: boolean
    showInsights: boolean
    model?: string
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
    setProjectId: (projectId: string) => void
    setAccessToken: (accessToken: string) => void
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
