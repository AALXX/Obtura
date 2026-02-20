'use client'

import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useAIAgentStore } from '../store/aiAgentStore'
import { SUGGESTED_ACTIONS, AI_MODELS, DEFAULT_MODELS } from '../types/AIAgentTypes'
import DialogCanvas from '@/common-components/DialogCanvas'
import { 
    X, 
    Send, 
    Plus, 
    MessageSquare, 
    Trash2, 
    ChevronLeft,
    Rocket,
    FileText,
    Key,
    TrendingUp,
    User,
    Settings,
    Bot,
    Check,
    AlertCircle,
    Loader2,
    Pencil,
    ShieldCheck
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Rocket,
    FileText,
    Key,
    TrendingUp
}

const AILogo = ({ className }: { className?: string }) => (
    <div className={className}>
        <Image 
            src="/logo.png" 
            alt="AI" 
            width={24} 
            height={24}
            className="h-full w-full object-contain"
        />
    </div>
)

export function AIAgentChat() {
    const {
        conversations,
        activeConversationId,
        isOpen,
        isLoading,
        closeChat,
        sendMessage,
        createNewConversation,
        selectConversation,
        deleteConversation
    } = useAIAgentStore()

    const [inputValue, setInputValue] = useState('')
    const [showSidebar, setShowSidebar] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0]

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [activeConversation?.messages, isLoading])

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isOpen])

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return
        const message = inputValue.trim()
        setInputValue('')
        await sendMessage(message)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleSuggestedAction = (prompt: string) => {
        sendMessage(prompt)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
            <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                onClick={closeChat}
            />
            
            <div className="relative flex h-[80vh] max-h-[700px] w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-800 bg-[#1b1b1b] shadow-2xl">
                {showSidebar && (
                    <div className="flex w-72 flex-col border-r border-zinc-800 bg-[#0a0a0a]">
                        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
                            <span className="text-sm font-medium text-white">Conversations</span>
                            <button
                                onClick={() => setShowSidebar(false)}
                                className="rounded p-1 text-neutral-400 hover:bg-[#1b1b1b] hover:text-white lg:hidden"
                            >
                                <ChevronLeft size={18} />
                            </button>
                        </div>
                        
                        <div className="p-3">
                            <button
                                onClick={createNewConversation}
                                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-[#1b1b1b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#252525]"
                            >
                                <Plus size={16} />
                                New Chat
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 pb-3">
                            {conversations.map(conversation => (
                                <div
                                    key={conversation.id}
                                    className={`group mb-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                                        conversation.id === activeConversationId
                                            ? 'bg-[#252525] text-white'
                                            : 'text-neutral-400 hover:bg-[#1b1b1b] hover:text-white'
                                    }`}
                                >
                                    <button
                                        onClick={() => selectConversation(conversation.id)}
                                        className="flex flex-1 items-center gap-2 truncate text-left"
                                    >
                                        <MessageSquare size={14} />
                                        <span className="truncate">{conversation.title}</span>
                                    </button>
                                    <button
                                        onClick={() => deleteConversation(conversation.id)}
                                        className="rounded p-1 opacity-0 text-neutral-500 transition-opacity hover:bg-[#252525] hover:text-red-400 group-hover:opacity-100"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-1 flex-col">
                    <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowSidebar(!showSidebar)}
                                className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-[#252525] hover:text-white"
                            >
                                <MessageSquare size={18} />
                            </button>
                            
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a0a0a] border border-orange-500 overflow-hidden">
                                    <AILogo className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold tracking-wide text-white uppercase">Obtura AI</h3>
                                    <p className="text-xs text-orange-500 uppercase tracking-wider">Command Center</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSettings(true)}
                                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-[#252525] hover:text-white"
                                title="Settings"
                            >
                                <Settings size={18} />
                            </button>
                            <button
                                onClick={createNewConversation}
                                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-[#252525] hover:text-white"
                                title="New conversation"
                            >
                                <Plus size={18} />
                            </button>
                            <button
                                onClick={closeChat}
                                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-[#252525] hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        {activeConversation?.messages.length === 1 && (
                            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {SUGGESTED_ACTIONS.map(action => {
                                    const IconComponent = iconMap[action.icon]
                                    return (
                                        <button
                                            key={action.id}
                                            onClick={() => handleSuggestedAction(action.prompt)}
                                            className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-[#1b1b1b] p-4 text-left transition-all hover:border-zinc-700 hover:bg-[#202020]"
                                        >
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#252525] group-hover:bg-[#2a2a2a]">
                                                {IconComponent && <IconComponent className="h-4 w-4 text-neutral-400" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{action.label}</p>
                                                <p className="mt-0.5 text-xs text-neutral-500">{action.description}</p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        <div className="space-y-4">
                            {activeConversation?.messages.map(message => (
                                <div
                                    key={message.id}
                                    className={`flex gap-3 ${
                                        message.role === 'user' ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] border border-orange-500 overflow-hidden">
                                            <AILogo className="h-5 w-5" />
                                        </div>
                                    )}
                                    
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                                            message.role === 'user'
                                                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                                                : 'border border-zinc-800 bg-[#1b1b1b] text-neutral-200'
                                        }`}
                                    >
                                        <div className="whitespace-pre-wrap">
                                            {message.content.split('\n').map((line, i) => (
                                                <span key={i}>
                                                    {line}
                                                    {i < message.content.split('\n').length - 1 && <br />}
                                                </span>
                                            ))}
                                        </div>
                                        <p className={`mt-1 text-[10px] ${
                                            message.role === 'user' ? 'text-orange-100' : 'text-neutral-600'
                                        }`}>
                                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>

                                    {message.role === 'user' && (
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#252525]">
                                            <User size={16} className="text-neutral-400" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            
                            {isLoading && (
                                <div className="flex gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] border border-orange-500 overflow-hidden">
                                        <AILogo className="h-5 w-5" />
                                    </div>
                                    <div className="flex items-center gap-1 rounded-2xl border border-zinc-800 bg-[#1b1b1b] px-4 py-3">
                                        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-500 [animation-delay:-0.3s]"></span>
                                        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-500 [animation-delay:-0.15s]"></span>
                                        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    <div className="border-t border-zinc-800 bg-[#1b1b1b] p-4">
                        <div className="flex items-end gap-2 rounded-xl border border-zinc-700 bg-[#0a0a0a] p-2">
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask me about deployments, logs, scaling..."
                                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white placeholder-neutral-500 outline-none"
                                rows={1}
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isLoading}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white transition-colors hover:from-orange-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                        <p className="mt-2 text-center text-[10px] text-neutral-600">
                            Obtura AI can make mistakes. Always verify important information.
                        </p>
                    </div>
                </div>
            </div>

            {showSettings && (
                <AISettingsModal onClose={() => setShowSettings(false)} />
            )}
        </div>
    )
}

function AISettingsModal({ onClose }: { onClose: () => void }) {
    const { settings, updateSettings, isSaving, saveSettings } = useAIAgentStore()
    const [localSettings, setLocalSettings] = useState(settings)
    const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
    const [editingKey, setEditingKey] = useState<Record<string, boolean>>({})

    useEffect(() => {
        console.log('🔄 Settings updated from store:', settings)
        setLocalSettings(settings)
    }, [settings])

    useEffect(() => {
        console.log('📊 Local settings state:', localSettings)
    }, [localSettings])

    const handleSave = async () => {
        setSaveStatus('saving')
        await saveSettings(localSettings)
        setSaveStatus('success')
        setEditingKey({})
        setTimeout(() => setSaveStatus('idle'), 2000)
    }

    const toggleShowKey = (key: string) => {
        setShowApiKey(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const startEditingKey = (providerId: string) => {
        setEditingKey(prev => ({ ...prev, [providerId]: true }))
    }

    const cancelEditingKey = (providerId: string, keyField: string) => {
        setEditingKey(prev => ({ ...prev, [providerId]: false }))
        setLocalSettings({ ...localSettings, [keyField]: '' })
    }

    const providers = [
        { id: 'openai', name: 'OpenAI', key: 'openai_api_key', placeholder: 'sk-...', hasKeyField: 'openai' as const },
        { id: 'anthropic', name: 'Anthropic Claude', key: 'claude_api_key', placeholder: 'sk-ant-...', hasKeyField: 'anthropic' as const },
        { id: 'gemini', name: 'Google Gemini', key: 'gemini_api_key', placeholder: 'AIza...', hasKeyField: 'gemini' as const },
    ]

    return (
        <DialogCanvas closeDialog={onClose}>
            <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between mb-6 border-b border-zinc-800 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#252525]">
                            <Settings className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">AI Settings</h2>
                            <p className="text-sm text-neutral-400">Configure your AI preferences</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    <div>
                        <h3 className="text-sm font-medium text-white mb-3">AI Provider API Keys</h3>
                        <p className="text-xs text-neutral-500 mb-4">
                            Add your own API keys to use specific AI providers. Keys are encrypted and stored securely.
                        </p>
                        
                        <div className="space-y-3">
                            {providers.map(provider => {
                                const hasExistingKey = localSettings.hasKeys?.[provider.hasKeyField] ?? false
                                const isEditing = editingKey[provider.id] ?? false
                                const keyValue = ((localSettings as unknown) as Record<string, string>)[provider.key] || ''
                                const showInput = !hasExistingKey || isEditing

                                return (
                                    <div key={provider.id} className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <label className="text-xs text-neutral-400 mb-1 block">{provider.name}</label>
                                            {showInput ? (
                                                <div className="relative">
                                                    <input
                                                        type={showApiKey[provider.id] ? 'text' : 'password'}
                                                        value={keyValue}
                                                        onChange={e => setLocalSettings({ ...localSettings, [provider.key]: e.target.value })}
                                                        placeholder={hasExistingKey ? 'Enter new key to update' : provider.placeholder}
                                                        className="w-full rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-2 pr-10 text-sm text-white placeholder-neutral-500 outline-none focus:border-orange-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleShowKey(provider.id)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                                                    >
                                                        {showApiKey[provider.id] ? <X size={16} /> : <Bot size={16} />}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                                                    <ShieldCheck size={16} className="text-green-500" />
                                                    <span className="text-sm text-green-400">API key saved securely</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditingKey(provider.id)}
                                                        className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                                    >
                                                        <Pencil size={12} />
                                                        Change
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {isEditing && hasExistingKey && (
                                            <button
                                                type="button"
                                                onClick={() => cancelEditingKey(provider.id, provider.key)}
                                                className="text-xs text-neutral-500 hover:text-white"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="border-t border-zinc-800 pt-4">
                        <h3 className="text-sm font-medium text-white mb-3">Preferences</h3>
                        
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-white">Auto-analyze failed builds</p>
                                    <p className="text-xs text-neutral-500">Automatically analyze build failures</p>
                                </div>
                                <button
                                    onClick={() => setLocalSettings({ ...localSettings, autoAnalyze: !localSettings.autoAnalyze })}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${
                                        localSettings.autoAnalyze ? 'bg-orange-500' : 'bg-zinc-700'
                                    }`}
                                >
                                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                                        localSettings.autoAnalyze ? 'left-6' : 'left-1'
                                    }`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-white">Show build insights</p>
                                    <p className="text-xs text-neutral-500">Display AI insights in build details</p>
                                </div>
                                <button
                                    onClick={() => setLocalSettings({ ...localSettings, showInsights: !localSettings.showInsights })}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${
                                        localSettings.showInsights ? 'bg-orange-500' : 'bg-zinc-700'
                                    }`}
                                >
                                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                                        localSettings.showInsights ? 'left-6' : 'left-1'
                                    }`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-zinc-800 pt-4">
                        <h3 className="text-sm font-medium text-white mb-3">Default Provider</h3>
                        <select
                            value={localSettings.defaultProvider}
                            onChange={e => {
                                const newProvider = e.target.value
                                const providerKey = newProvider === 'claude' ? 'anthropic' : newProvider
                                const defaultModel = DEFAULT_MODELS[providerKey] || DEFAULT_MODELS.openai
                                setLocalSettings({ ...localSettings, defaultProvider: newProvider, model: defaultModel })
                            }}
                            className="w-full rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                        >
                            <option value="openai">OpenAI</option>
                            <option value="claude">Anthropic Claude</option>
                            <option value="gemini">Google Gemini</option>
                        </select>
                    </div>

                    <div className="border-t border-zinc-800 pt-4">
                        <h3 className="text-sm font-medium text-white mb-3">Model</h3>
                        <select
                            value={localSettings.model || DEFAULT_MODELS[localSettings.defaultProvider === 'claude' ? 'anthropic' : localSettings.defaultProvider] || DEFAULT_MODELS.openai}
                            onChange={e => setLocalSettings({ ...localSettings, model: e.target.value })}
                            className="w-full rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                        >
                            {(AI_MODELS[localSettings.defaultProvider === 'claude' ? 'anthropic' : localSettings.defaultProvider] || AI_MODELS.openai).map(model => (
                                <option key={model.id} value={model.id}>{model.name}</option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-neutral-500">Select the AI model to use for chat and analysis</p>
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
                    {saveStatus === 'success' && (
                        <span className="flex items-center gap-1 text-sm text-green-500">
                            <Check size={16} /> Saved
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="flex items-center gap-1 text-sm text-red-500">
                            <AlertCircle size={16} /> Error saving
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-[#252525]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                        className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-50"
                    >
                        {saveStatus === 'saving' && <Loader2 size={16} className="animate-spin" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </DialogCanvas>
    )
}
