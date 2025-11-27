export interface UserResponse {
    error?: boolean
    email: string
    name: string
    accountType: string 
    memberSince: string 
    activeSessions: ActiveSession[]
    userSubscription: UserSubscription | null
}

export interface ActiveSession {
    id: string
    expires_at: string
    last_used_at: string
    ip_address: string
    user_agent: string
    created_at: string
}

export interface UserSubscription {
    id: string
    status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused'
    current_period_start: string
    current_period_end: string
    cancel_at_period_end: boolean
    plan: SubscriptionPlan
}

export interface SubscriptionPlan {
    id: string // "business", "pro", etc.
    name: string
    description: string | null
    price_monthly: number
    max_users: number
    max_projects: number | null
    max_deployments_per_month: number
    max_apps: number
    storage_gb: number
}
