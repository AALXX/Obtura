export interface UserSubscription {
    plan: {
        id: string
        name: string
        price_monthly: number
        max_users: number | null
        max_projects: number | null
        max_deployments_per_month: number
        max_apps: number
        storage_gb: number
    }
    status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused'
    current_period_end: string
    current_users_count: number
    current_projects_count: number
    current_deployments_count: number
    current_storage_used_gb: number
}

export interface SessionInfo {
    id: string
    ip_address: string
    user_agent: string
    created_at: string
    last_used_at: string
}

export interface UserResponse {
    error?: string
    email: string
    name: string
    accountType: 'email' | 'google'
    memberSince: string
    activeSessions: SessionInfo[]
    userSubscription: UserSubscription | null
    companyName?: string
    companyRole?: {name: string, display_name: string}
}
