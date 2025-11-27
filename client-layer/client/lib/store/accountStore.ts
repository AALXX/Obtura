// lib/store/accountStore.ts
import { create } from 'zustand'

interface User {
    name: string
    accountType: string
    image: string
}

interface AccountState {
    user: User | null
    authenticated: boolean
    status: 'idle' | 'loading' | 'succeeded' | 'failed'
    error: string | null

    // Actions
    fetchAccount: () => Promise<void>
    logout: () => void
    clearError: () => void
}

export const useAccountStore = create<AccountState>(set => ({
    // Initial state
    user: null,
    authenticated: false,
    status: 'idle',
    error: null,

    // Actions
    fetchAccount: async () => {
        set({ status: 'loading', error: null })

        try {
            const response = await fetch('/api/account')

            if (!response.ok) {
                throw new Error('Failed to fetch account')
            }

            const data = await response.json()

            if (data.error) {
                throw new Error(data.error)
            }

            set({
                status: 'succeeded',
                user: {
                    name: data.name,
                    accountType: data.accountType,
                    image: data.image
                },
                authenticated: data.authenticated,
                error: null
            })
        } catch (error) {
            console.error('Fetch account error:', error)
            set({
                status: 'failed',
                authenticated: false,
                user: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        }
    },

    logout: () => {
        set({
            user: null,
            authenticated: false,
            status: 'idle',
            error: null
        })
    },

    clearError: () => {
        set({ error: null })
    }
}))
