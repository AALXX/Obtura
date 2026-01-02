export interface ApiResponse {
    error: boolean
    data: ProjectData
}

export interface ProjectData {
    id: string
    name: string
    slug: string
    teamName: string
    framework: string
    isMonorepo: boolean
    frameworks: FrameworkConfig[]
    status: 'active' | 'inactive' | 'paused' | string
    production: EnvironmentDeployment
    staging: EnvironmentDeployment
    preview: PreviewDeployment[]
    metrics: ProjectMetrics
}

export interface FrameworkConfig {
    Name: string
    Path: string
    Port: number
    Runtime: string
    Version: string
    BuildCmd: string
}

export interface EnvironmentDeployment {
    url: string | null
    status: string | null
    lastDeployment: string
    commit: string | null
    branch: string | null
    buildTime: string | null
    framework: string | null
}

export interface PreviewDeployment {
    url?: string
    status?: string
    createdAt?: string
    commit?: string
    branch?: string
}

export interface ProjectMetrics {
    uptime: string
    avgResponseTime: string
    requests24h: string
    errors24h: string
}

export interface ProjectResponse {
    id: string
    projectName: string
    createdAt: string
    slug: string
    teamName: string
    memberCount: number
}
