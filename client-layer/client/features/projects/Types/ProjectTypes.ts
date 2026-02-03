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
    frameworks: FrameworkConfig[] | null
    status: 'active' | 'inactive' | 'paused' | string
    production: EnvironmentDeployment
    staging: EnvironmentDeployment
    preview: PreviewDeployment[]
    metrics: ProjectMetrics
    gitRepoUrl: string
    builds: BuildData[] // Add this
}

export interface BuildData {
    id: string
    commit: string
    branch: string
    status: 'queued' | 'cloning' | 'installing' | 'building' | 'deploying' | 'completed' | 'failed' | 'cancelled' | 'timeout'
    buildTime: string | null
    framework: string | null
    initiatedBy: string | null
    createdAt: string
    errorMessage: string | null
}

export interface FrameworkConfig {
    Name: string
    Path: string
    Port: number
    Runtime: string
    Version: string
    BuildCmd: string
}

export interface Container {
    id: string
    name: string
    status: string
    healthStatus: string
    isActive: boolean
    deploymentGroup: string
    cpuUsage: number | null
    memoryUsage: number | null
    memoryLimit: number | null
    startedAt: string
}

export interface StrategyDetails {
    strategy: string
    currentPhase: string
    activeGroup: string
    standbyGroup: string
    healthyReplicas: number
    unhealthyReplicas: number
    totalReplicas: number
    canaryTrafficPercentage: number
    canaryAnalysisPassed: boolean | null
}

export interface Alert {
    id: string
    type: string
    message: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    timestamp: string
    resolved: boolean
}

export interface EnvironmentDeployment {
    url: string | null
    status: string | null
    deploymentStrategy: string | null
    replicaCount: number | null
    autoScalingEnabled: boolean | null
    instanceType: string | null
    trafficPercentage: number | null
    currentRequestsPerMinute: number | null
    avgResponseTime: string
    errorRate: string
    sslEnabled: boolean | null
    monitoringEnabled: boolean | null
    deploymentTrigger: string | null
    lastDeployment: string
    commit: string | null
    branch: string | null
    buildTime: string | null
    framework: string | null
    containers: Container[]
    totalContainers: number
    healthyContainers: number
    unhealthyContainers: number
    strategyDetails: StrategyDetails | null
    unresolvedAlerts: Alert[]
    unresolvedAlertCount: number
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

export type BuildStatus = 'queued' | 'cloning' | 'installing' | 'building' | 'running'| 'deploying' | 'success' | 'failed' | 'cancelled'

export interface Build {
    id: string
    status: BuildStatus
    branch: string
    commit: string
    startTime: string
    endTime?: string
    duration?: string
    deploymentUrl?: string
    framework?: string
    initiatedBy?: string
    errorMessage?: string
}



export interface DeploymentConfig {
    environment: 'production' | 'staging'
    source: 'build' | 'branch'
    buildId?: string
    branch?: string
    commit?: string
    strategy?: string
    enableMonitoring?: boolean
    autoScaling?: boolean
}
