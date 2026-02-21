'use client'

import { create } from 'zustand'
import axios from 'axios'
import { AIAgentState, AIAgentActions, Conversation, Message, AISettings, DEFAULT_MODELS } from '../types/AIAgentTypes'

const generateId = () => Math.random().toString(36).substring(2, 15)

const AI_AGENT_URL = process.env.NEXT_PUBLIC_AI_AGENT_SERVICE_URL || 'http://localhost:5120'

const defaultSettings: AISettings = {
    openai_api_key: '',
    claude_api_key: '',
    gemini_api_key: '',
    defaultProvider: 'openai',
    autoAnalyze: true,
    showInsights: true,
    model: DEFAULT_MODELS.openai,
}

const createInitialConversation = () => ({
    id: generateId(),
    title: 'New Conversation',
    messages: [
        {
            id: generateId(),
            role: 'assistant' as const,
            content: `Hello! I'm Obtura AI, your DevOps assistant. I can help you with deployments, monitoring, configuration, and troubleshooting.

You can ask me things like:
- "What went wrong in build:123-abc?"
- "Show me recent deployments"
- "Help me scale my service"

What would you like help with today?`,
            timestamp: new Date()
        }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
})

export const useAIAgentStore = create<AIAgentState & AIAgentActions>((set, get) => ({
    conversations: [createInitialConversation()],
    activeConversationId: null,
    isOpen: false,
    isLoading: false,
    error: null,
    settings: defaultSettings,
    isSaving: false,
    projectId: undefined,
    accessToken: undefined,

    toggleOpen: () => set(state => ({ isOpen: !state.isOpen })),
    
    openChat: (projectId?: string) => {
        const state = get()
        // Always ensure we have a valid projectId
        const effectiveProjectId = projectId || state.projectId
        
        // Update store with projectId if we have one
        if (effectiveProjectId) {
            set({ projectId: effectiveProjectId })
            get().loadSettings()
            get().loadConversations()
        }
        set({ isOpen: true })
    },
    
    closeChat: () => set({ isOpen: false }),

    setProjectId: (projectId: string) => set({ projectId }),

    setAccessToken: (accessToken: string) => set({ accessToken }),

    initializeSettings: (settings: Partial<AISettings>) => {
        set(state => ({
            settings: { ...state.settings, ...settings }
        }))
    },

    sendMessage: async (content: string) => {
        // Get fresh state at the exact moment of sending
        const projectId = get().projectId
        const accessToken = get().accessToken
        
        if (!projectId || projectId.trim() === '') {
            console.error('Cannot send message: projectId is missing or empty')
            return
        }
        
        if (!accessToken) {
            console.error('Cannot send message: accessToken is missing')
            return
        }
        
        const conversations = get().conversations
        const activeConversationId = get().activeConversationId
        
        const userMessage: Message = {
            id: generateId(),
            role: 'user',
            content,
            timestamp: new Date()
        }

        set(state => {
            const activeId = state.activeConversationId || state.conversations[0]?.id
            const conversation = state.conversations.find(c => c.id === activeId)
            if (!conversation) return state

            const updatedConversation = {
                ...conversation,
                messages: [...conversation.messages, userMessage],
                updatedAt: new Date()
            }

            return {
                conversations: state.conversations.map(c =>
                    c.id === activeId ? updatedConversation : c
                ),
                isLoading: true,
                error: null,
                activeConversationId: activeId
            }
        })

        try {
            const activeId = get().activeConversationId || get().conversations[0]?.id
            const conversation = get().conversations.find(c => c.id === activeId)
            
            // Only send conversationId if it looks like a valid UUID (not a local random ID)
            // Local IDs are short random strings, real UUIDs are 36 chars
            const sendConversationId = activeId && activeId.length === 36 ? activeId : undefined
            
            console.log('📤 Sending message - projectId:', projectId, 'conversationId:', sendConversationId)
            
            const response = await axios.post(
                `${AI_AGENT_URL}/api/ai/chat`,
                {
                    message: content,
                    projectId: projectId,
                    conversationId: sendConversationId,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    timeout: 60000,
                }
            )

            const respData = response.data as { content?: string; message?: string; conversationId?: string; title?: string }
            const assistantMessage: Message = {
                id: generateId(),
                role: 'assistant',
                content: respData.content || respData.message || 'No response received',
                timestamp: new Date()
            }

            set(state => {
                const activeId = state.activeConversationId || state.conversations[0]?.id
                const conversation = state.conversations.find(c => c.id === activeId)
                if (!conversation) return state

                const messages = [...conversation.messages, assistantMessage]
                // Use title from backend if available, otherwise generate from first message
                const title = respData.title || (conversation.title === 'New Conversation' && messages.length === 3
                    ? content.slice(0, 30) + (content.length > 30 ? '...' : '')
                    : conversation.title)

                const updatedConversation = {
                    ...conversation,
                    id: respData.conversationId || conversation.id,
                    title,
                    messages,
                    updatedAt: new Date()
                }

                return {
                    conversations: state.conversations.map(c =>
                        c.id === activeId ? updatedConversation : c
                    ),
                    activeConversationId: respData.conversationId || activeConversationId,
                    isLoading: false
                }
            })
        } catch (error: any) {
            console.error('AI Agent error:', error)
            
            let errorMessage = 'Sorry, I encountered an error processing your request.'
            if (error.response?.data?.error) {
                errorMessage = error.response.data.error
            } else if (error.message) {
                errorMessage = `Error: ${error.message}`
            }

            const assistantMessage: Message = {
                id: generateId(),
                role: 'assistant',
                content: errorMessage,
                timestamp: new Date()
            }

            set((state) => {
                const activeId = state.activeConversationId || state.conversations[0]?.id
                const conversation = state.conversations.find(c => c.id === activeId)
                if (!conversation) return state

                const updatedConversation = {
                    ...conversation,
                    messages: [...conversation.messages, assistantMessage],
                    updatedAt: new Date()
                }

                return {
                    conversations: state.conversations.map(c =>
                        c.id === activeId ? updatedConversation : c
                    ),
                    isLoading: false,
                    error: errorMessage
                }
            })
        }
    },

    createNewConversation: () => {
        const newConversation = createInitialConversation()
        set(state => ({
            conversations: [newConversation, ...state.conversations],
            activeConversationId: newConversation.id
        }))
    },

    selectConversation: (conversationId: string) => {
        set({ activeConversationId: conversationId })
    },

    deleteConversation: (conversationId: string) => {
        set(state => {
            const filtered = state.conversations.filter(c => c.id !== conversationId)
            
            if (filtered.length === 0) {
                const newConversation = createInitialConversation()
                return {
                    conversations: [newConversation],
                    activeConversationId: newConversation.id
                }
            }

            return {
                conversations: filtered,
                activeConversationId: state.activeConversationId === conversationId
                    ? filtered[0].id
                    : state.activeConversationId
            }
        })
    },

    clearError: () => set({ error: null }),

    updateSettings: (newSettings: Partial<AISettings>) => {
        set(state => ({
            settings: { ...state.settings, ...newSettings }
        }))
    },

    saveSettings: async (settings: AISettings) => {
        set({ isSaving: true })
        
        const { projectId, accessToken } = get()
        
        if (!projectId || !accessToken) {
            console.error('Cannot save settings: missing projectId or accessToken')
            set({ isSaving: false })
            return
        }

        try {
            const providerMap: Record<string, string> = {
                'openai': 'openai',
                'claude': 'anthropic',
                'gemini': 'gemini',
            }
            
            const mappedProvider = providerMap[settings.defaultProvider] || 'openai'
            const apiKey = settings.defaultProvider === 'openai' 
                ? settings.openai_api_key 
                : settings.defaultProvider === 'claude'
                    ? settings.claude_api_key
                    : settings.gemini_api_key

            if (!apiKey) {
                console.log('No API key provided, only updating preferences')
                set({ 
                    settings: {
                        ...settings,
                        openai_api_key: '',
                        claude_api_key: '',
                        gemini_api_key: '',
                    },
                    isSaving: false 
                })
                return
            }

            const defaultModel = DEFAULT_MODELS[mappedProvider] || DEFAULT_MODELS.openai
            const selectedModel = settings.model || defaultModel

            console.log('Saving settings to backend - provider:', mappedProvider, 'model:', selectedModel)
            
            await axios.post(
                `${AI_AGENT_URL}/api/providers/configs`,
                {
                    projectId,
                    accessToken,
                    input: {
                        provider: mappedProvider,
                        providerName: `${settings.defaultProvider} Key`,
                        apiKey: apiKey,
                        model: selectedModel,
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000,
                }
            )

            set({ 
                settings: {
                    ...settings,
                    openai_api_key: '',
                    claude_api_key: '',
                    gemini_api_key: '',
                },
                
                isSaving: false 
            })
        } catch (error: any) {
            console.error('Failed to save settings:', error.response?.data || error.message)
            set({ isSaving: false })
        }
    },

    loadSettings: async () => {
        const { projectId, accessToken } = get()
        
        if (!projectId || !accessToken) {
            console.log('Cannot load settings: missing projectId or accessToken')
            return
        }

        try {
            const response = await axios.get<{ configs?: Array<{ provider: string; model: string; hasKey: boolean }> }>(
                `${AI_AGENT_URL}/api/providers/configs?projectId=${projectId}`,
                { timeout: 5000 }
            )
            
            const configs = response.data?.configs
            console.log('📡 Loaded AI configs:', configs)
            
            if (configs && configs.length > 0) {
                const providerMap: Record<string, string> = {
                    'openai': 'openai',
                    'anthropic': 'claude',
                    'gemini': 'gemini',
                }

                const hasKeys: { openai: boolean; anthropic: boolean; gemini: boolean } = {
                    openai: false,
                    anthropic: false,
                    gemini: false,
                }

                const defaultProvider = configs[0].provider
                const mappedProvider = providerMap[defaultProvider] || defaultProvider
                const model = configs[0].model

                configs.forEach(config => {
                    const key = config.provider as keyof typeof hasKeys
                    if (key in hasKeys) {
                        hasKeys[key] = config.hasKey
                    }
                })

                console.log('🔄 Mapping provider:', defaultProvider, '->', mappedProvider, 'model:', model, 'hasKeys:', hasKeys)
                
                set(state => ({
                    settings: {
                        ...state.settings,
                        defaultProvider: mappedProvider,
                        model: model,
                        hasKeys: hasKeys,
                    }
                }))
                
                console.log('✅ Settings updated:', get().settings)
            }
        } catch (error) {
            console.error('Failed to load AI settings from backend:', error)
        }
    },

    loadConversations: async () => {
        const { projectId } = get()
        
        if (!projectId) {
            console.log('Cannot load conversations: missing projectId')
            return
        }

        try {
            const response = await axios.get<{ conversations: Array<{
                id: string
                projectId: string
                userId: string
                title: string
                createdAt: string
                updatedAt: string
            }> }>(
                `${AI_AGENT_URL}/api/conversations?projectId=${projectId}`,
                { timeout: 5000 }
            )
            
            const conversations = response.data?.conversations || []
            console.log('📥 Loaded conversations:', conversations)
            
            if (conversations.length > 0) {
                // Load messages for each conversation
                const conversationsWithMessages = await Promise.all(
                    conversations.map(async (conv) => {
                        try {
                            const msgResponse = await axios.get<{
                                id: string
                                projectId: string
                                userId: string
                                title: string
                                createdAt: string
                                updatedAt: string
                                messages: Array<{
                                    id: string
                                    conversationId: string
                                    role: string
                                    content: string
                                    createdAt: string
                                }>
                            }>(
                                `${AI_AGENT_URL}/api/conversations/${conv.id}`,
                                { timeout: 5000 }
                            )
                            return {
                                id: conv.id,
                                title: conv.title || 'New Conversation',
                                messages: msgResponse.data.messages?.map((m: any) => ({
                                    id: m.id,
                                    role: m.role as 'user' | 'assistant',
                                    content: m.content,
                                    timestamp: new Date(m.createdAt)
                                })) || [],
                                createdAt: new Date(conv.createdAt),
                                updatedAt: new Date(conv.updatedAt)
                            }
                        } catch (e) {
                            console.error('Failed to load messages for conversation:', conv.id, e)
                            return {
                                id: conv.id,
                                title: conv.title || 'New Conversation',
                                messages: [],
                                createdAt: new Date(conv.createdAt),
                                updatedAt: new Date(conv.updatedAt)
                            }
                        }
                    })
                )

                set(state => ({
                    conversations: conversationsWithMessages,
                    activeConversationId: conversationsWithMessages[0]?.id || state.activeConversationId
                }))
            } else {
                // No conversations in DB, keep local ones but they won't have real IDs
                console.log('No conversations found in DB, using local')
            }
        } catch (error) {
            console.error('Failed to load conversations:', error)
        }
    },
}))
