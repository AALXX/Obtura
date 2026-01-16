export interface UserSubscription {
    id: string
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid'
    plan: Plan
    billing_cycle: 'monthly' | 'yearly'
    current_period_start: string
    current_period_end: string
    next_payment_at: string
    last_payment_at: string | null
    cancel_at_period_end: boolean
    canceled_at: string | null
    pending_change_at: string | null
    pending_plan_change_id: string | null
    plan_changed_at: string | null
    previous_plan_id: string | null
    overage_charges: number
    overage_details: Record<string, any>
    custom_limits: Record<string, any>
    feature_flags: Record<string, any>
    metadata: Record<string, any>

    // Current usage
    current_users_count: number
    current_projects_count: number
    current_deployments_count: number
    current_deployments_this_month: number
    current_storage_used_gb: number
    current_bandwidth_used_gb: number
    current_builds_today: number
    current_builds_this_month: number
    current_builds_this_hour: number
    current_concurrent_builds: number
    current_concurrent_deployments: number
    current_team_members_count: number
    current_environments_count: number
    current_preview_environments_count: number
    current_custom_domains_count: number
    current_api_keys_count: number
    current_webhooks_count: number
    current_database_storage_gb: number
    current_build_artifacts_gb: number

    // Reset dates
    bandwidth_reset_at: string
}

export interface Plan {
    id: string
    name: string
    max_users: number | null
    storage_gb: number
    description: string
    price_monthly: number
    max_projects: number | null
    max_deployments_per_month: number
    max_bandwidth_gb_per_month: number
    max_build_minutes_per_month: number
    max_concurrent_builds: number
    max_concurrent_deployments: number
    max_environments_per_project: number
    max_preview_environments: number
    max_custom_domains: number
    max_team_members: number
    max_api_keys: number
    max_webhooks: number
    max_database_storage_gb: number
    support_level: string
    features: any
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
    companyRole?: {
        name: string
        display_name: string
        hierarchy_level: number
    }
    hasCompany?: boolean
}
