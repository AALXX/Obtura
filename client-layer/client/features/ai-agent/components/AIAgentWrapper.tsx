'use client'

import React, { useEffect, useRef } from 'react'
import Image from 'next/image'
import { useAIAgentStore } from '../store/aiAgentStore'
import { AIAgentButton } from './AIAgentButton'
import { AIAgentChat } from './AIAgentChat'

interface AIAgentWrapperProps {
    projectId: string
    accessToken: string
}

export function AIAgentWrapper({ projectId, accessToken }: AIAgentWrapperProps) {
    const { openChat, setProjectId, setAccessToken, loadSettings } = useAIAgentStore()
    const hasLoadedRef = useRef(false)

    useEffect(() => {
        console.log('🔄 AI Wrapper useEffect - projectId:', projectId, 'accessToken:', accessToken ? 'present' : 'missing')
        setProjectId(projectId)
        setAccessToken(accessToken)
        
        if (projectId && accessToken && !hasLoadedRef.current) {
            hasLoadedRef.current = true
            console.log('🔄 Loading AI settings for project:', projectId)
            loadSettings()
        }
    }, [projectId, accessToken, setProjectId, setAccessToken, loadSettings])

    const handleOpen = () => {
        console.log('🔔 Opening AI chat with projectId:', projectId)
        if (projectId) {
            openChat(projectId)
        } else {
            console.warn('⚠️ No projectId available for AI chat')
            openChat()
        }
    }

    return (
        <>
            <button
                onClick={handleOpen}
                className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-110 bg-[#0a0a0a] border-2 border-orange-500 hover:border-orange-400 hover:shadow-orange-500/30"
                aria-label="Open AI chat"
            >
                <div className="relative flex h-9 w-9 items-center justify-center">
                    <Image 
                        src="/logo.png" 
                        alt="Obtura AI" 
                        width={36} 
                        height={36}
                        className="h-8 w-8 object-contain"
                    />
                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500"></span>
                    </span>
                </div>
            </button>
            <AIAgentChat />
        </>
    )
}
