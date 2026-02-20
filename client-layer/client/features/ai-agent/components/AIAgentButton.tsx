'use client'

import React from 'react'
import Image from 'next/image'
import { useAIAgentStore } from '../store/aiAgentStore'

export function AIAgentButton() {
    const { isOpen, toggleOpen } = useAIAgentStore()

    return (
        <button
            onClick={toggleOpen}
            className={`fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-110 ${
                isOpen 
                    ? 'bg-[#1b1b1b] text-white rotate-90' 
                    : 'bg-[#0a0a0a] border-2 border-orange-500 hover:border-orange-400 hover:shadow-orange-500/30'
            }`}
            aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
        >
            {isOpen ? (
                <svg 
                    className="h-6 w-6" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                >
                    <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        d="M6 18L18 6M6 6l12 12" 
                    />
                </svg>
            ) : (
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
            )}
        </button>
    )
}

export function AIAgentBadge() {
    const { toggleOpen } = useAIAgentStore()

    return (
        <button
            onClick={toggleOpen}
            className="group fixed bottom-6 right-6 z-40 flex items-center gap-3 bg-[#0a0a0a] border-2 border-orange-500 rounded-full p-1.5 pr-5 shadow-2xl transition-all duration-300 hover:scale-105 hover:border-orange-400 hover:shadow-orange-500/30"
        >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1b1b1b]">
                <Image 
                    src="/logo.png" 
                    alt="Obtura AI" 
                    width={36} 
                    height={36}
                    className="h-8 w-8 object-contain"
                />
            </div>
            <div className="flex flex-col items-start">
                <span className="text-sm font-bold tracking-wider text-white uppercase">Obtura AI</span>
                <span className="text-[10px] text-orange-400 uppercase tracking-wide">Command Center</span>
            </div>
            <div className="ml-2 flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500"></span>
            </div>
        </button>
    )
}
