'use client'
import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, Terminal, Loader2, Rocket, Server, Activity, Clock, TrendingUp, AlertCircle, Hammer, FileText, Radio, Box } from 'lucide-react'
import axios from 'axios'

type DeploymentStatus = 'pending' | 'deploying' | 'active' | 'failed' | 'rolled_back'
type DeploymentPhase = 'preparing' | 'deploying_new' | 'health_checking' | 'switching_traffic' | 'draining_old' | 'monitoring' | 'completed' | 'failed'
type BuildStatus = 'queued' | 'cloning' | 'installing' | 'building' | 'completed' | 'failed' | 'timeout'
type BuildPhase = 'queued' | 'cloning' | 'installing' | 'building' | 'completed' | 'failed'

interface ContainerInfo {
    id: string
    name: string
    status: string
    healthStatus: string
    deploymentGroup: string
    isActive?: boolean
}

interface DeploymentLogsViewerProps {
    deploymentId: string
    projectId: string
    environment: string
    strategy: string
    buildId?: string
    containers?: ContainerInfo[]
    onClose: () => void
    mode?: 'deploying' | 'history'
}

interface LogEntry {
    time: string
    message: string
    type: 'info' | 'success' | 'error' | 'warning'
    source: 'build' | 'deployment' | 'container'
}

interface PhaseInfo {
    phase: DeploymentPhase
    message: string
    timestamp: string
    metadata?: any
}

interface ContainerEvent {
    containerId: string
    containerName: string
    status: string
    health: string
    message?: string
    group: string
}

interface TrafficRouting {
    routingGroup: string
    trafficPercentage: number
    activeContainers: string[]
    message: string
}

interface PlatformLogEvent {
    id: string
    eventType: string
    eventSubtype: string
    severity: 'debug' | 'info' | 'warning' | 'error' | 'fatal'
    message: string
    eventTimestamp: string
    sourceService: string
    metadata?: Record<string, any>
}

const MONITORING_SERVICE_URL = process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL || 'http://localhost/monitoring-service'

const DeploymentLogsViewer: React.FC<DeploymentLogsViewerProps> = ({ 
    deploymentId, 
    projectId, 
    environment, 
    strategy, 
    buildId,
    containers: initialContainers = [],
    onClose,
    mode = 'deploying'
}) => {
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([])
    const [historicalLogs, setHistoricalLogs] = useState<LogEntry[]>([])
    const [currentPhase, setCurrentPhase] = useState<DeploymentPhase>('preparing')
    const [buildPhase, setBuildPhase] = useState<BuildPhase>('queued')
    const [buildStatus, setBuildStatus] = useState<BuildStatus>('queued')
    const [phaseMetadata, setPhaseMetadata] = useState<any>({})
    const [status, setStatus] = useState<DeploymentStatus>('pending')
    const [containers, setContainers] = useState<Map<string, ContainerEvent>>(() => {
        console.log('[DeploymentLogsViewer] Initial containers:', initialContainers.length, initialContainers)
        const map = new Map<string, ContainerEvent>()
        initialContainers.forEach(container => {
            map.set(container.id, {
                containerId: container.id,
                containerName: container.name,
                status: container.status,
                health: container.healthStatus || 'unknown',
                group: container.deploymentGroup || 'default'
            })
        })
        return map
    })
    const [trafficInfo, setTrafficInfo] = useState<TrafficRouting | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [isBuildConnected, setIsBuildConnected] = useState(false)
    const [deploymentTime, setDeploymentTime] = useState(0)
    const [errorMessage, setErrorMessage] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingHistorical, setIsLoadingHistorical] = useState(false)
    const [activeTab, setActiveTab] = useState<'live' | 'all'>('live')
    const [hasBuildPhase, setHasBuildPhase] = useState(!!buildId)
    const [buildCompleted, setBuildCompleted] = useState(false)
    const [buildError, setBuildError] = useState<string>('')
    const [hasLoadedHistoricalLogs, setHasLoadedHistoricalLogs] = useState(false)
    
    // Container logs state
    const [containerLogs, setContainerLogs] = useState<LogEntry[]>([])
    const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
    const [isContainerConnected, setIsContainerConnected] = useState(false)

    const logsEndRef = useRef<HTMLDivElement>(null)
    const liveLogsEndRef = useRef<HTMLDivElement>(null)
    const startTimeRef = useRef<number>(Date.now())
    const deployEventSourceRef = useRef<EventSource | null>(null)
    const buildEventSourceRef = useRef<EventSource | null>(null)
    const containerEventSourceRef = useRef<EventSource | null>(null)

    const isDeployingMode = mode === 'deploying'

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [historicalLogs, containerLogs])
    
    useEffect(() => {
        liveLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [liveLogs])

    useEffect(() => {
        if (isDeployingMode && !['active', 'failed', 'rolled_back'].includes(status)) {
            const interval = setInterval(() => {
                setDeploymentTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
            }, 1000)
            return () => clearInterval(interval)
        }
    }, [status, isDeployingMode])

    // Helper to convert severity to log type
    const getLogType = (severity: string): 'info' | 'success' | 'error' | 'warning' => {
        switch (severity) {
            case 'error':
            case 'fatal':
                return 'error'
            case 'warning':
                return 'warning'
            case 'debug':
                return 'info'
            default:
                return 'info'
        }
    }

    // Fetch historical logs
    const fetchHistoricalLogs = async () => {
        if (hasLoadedHistoricalLogs) return

        setIsLoadingHistorical(true)
        const allLogs: LogEntry[] = []

        // Fetch build logs from unified API if we have a buildId
        if (buildId) {
            try {
                const buildResp = await axios.get<{ events: PlatformLogEvent[]; total: number }>(
                    `${MONITORING_SERVICE_URL}/api/platform-logs/query?resource_type=build&resource_id=${buildId}&limit=1000`
                )
                if (buildResp.status === 200 && buildResp.data.events && buildResp.data.events.length > 0) {
                    const buildLogs = buildResp.data.events.map((event: PlatformLogEvent) => ({
                        time: new Date(event.eventTimestamp).toLocaleTimeString('en-US', { hour12: false }),
                        message: event.message,
                        type: getLogType(event.severity),
                        source: 'build' as const
                    }))
                    allLogs.push(...buildLogs)
                }
            } catch (error) {
                console.error('Error fetching historical build logs from unified API:', error)
                // Fallback to old API
                try {
                    const buildResp = await axios.get<{ logs: any[] }>(`${process.env.NEXT_PUBLIC_BUILD_SERVICE_URL}/builds/${buildId}/logs`)
                    if (buildResp.status === 200 && buildResp.data.logs && buildResp.data.logs.length > 0) {
                        const buildLogs = buildResp.data.logs.map((log: any) => ({
                            time: new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false }),
                            message: log.message,
                            type: log.log_type as 'info' | 'success' | 'error' | 'warning',
                            source: 'build' as const
                        }))
                        allLogs.push(...buildLogs)
                    }
                } catch (fallbackError) {
                    console.error('Fallback build logs API also failed:', fallbackError)
                }
            }
        }

        // Fetch deployment logs from unified API
        try {
            const deployResp = await axios.get<{ events: PlatformLogEvent[]; total: number }>(
                `${MONITORING_SERVICE_URL}/api/platform-logs/query?resource_type=deployment&resource_id=${deploymentId}&limit=1000`
            )
            if (deployResp.status === 200 && deployResp.data.events && deployResp.data.events.length > 0) {
                const deployLogs = deployResp.data.events.map((event: PlatformLogEvent) => ({
                    time: new Date(event.eventTimestamp).toLocaleTimeString('en-US', { hour12: false }),
                    message: event.message,
                    type: getLogType(event.severity),
                    source: 'deployment' as const
                }))
                allLogs.push(...deployLogs)
            }
        } catch (error) {
            console.error('Error fetching historical deployment logs from unified API:', error)
            // Fallback to old API
            try {
                const deployResp = await axios.get<{ logs: any[] }>(`${process.env.NEXT_PUBLIC_DEPLOY_SERVICE_URL}/deployments/${deploymentId}/logs`)
                if (deployResp.status === 200 && deployResp.data.logs && deployResp.data.logs.length > 0) {
                    const deployLogs = deployResp.data.logs.map((log: any) => ({
                        time: new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false }),
                        message: log.message,
                        type: log.log_type as 'info' | 'success' | 'error' | 'warning',
                        source: 'deployment' as const
                    }))
                    allLogs.push(...deployLogs)
                }
            } catch (fallbackError) {
                console.error('Fallback deployment logs API also failed:', fallbackError)
            }
        }

        // Sort logs by time
        allLogs.sort((a, b) => {
            const timeA = new Date(`1970-01-01T${a.time}`).getTime()
            const timeB = new Date(`1970-01-01T${b.time}`).getTime()
            return timeA - timeB
        })
        
        setHistoricalLogs(allLogs)
        setHasLoadedHistoricalLogs(true)
        setIsLoadingHistorical(false)
    }

    // Load historical logs on mount for history mode
    useEffect(() => {
        if (!isDeployingMode && !hasLoadedHistoricalLogs) {
            fetchHistoricalLogs()
        }
    }, [isDeployingMode])

    // Connect to container logs SSE
    const connectToContainerLogs = (containerId: string) => {
        // Close existing connection
        if (containerEventSourceRef.current) {
            containerEventSourceRef.current.close()
            containerEventSourceRef.current = null
        }

        setContainerLogs([])
        setSelectedContainerId(containerId)
        
        const deployServiceUrl = process.env.NEXT_PUBLIC_DEPLOY_SERVICE_URL 
        const eventSource = new EventSource(`${deployServiceUrl}/deployments/${deploymentId}/containers/${containerId}/logs/stream`)
        containerEventSourceRef.current = eventSource

        console.log(`🔌 Connecting to container logs SSE: ${deployServiceUrl}/deployments/${deploymentId}/containers/${containerId}/logs/stream`)

        eventSource.onopen = () => {
            setIsContainerConnected(true)
            console.log('✅ Connected to container logs stream')
        }

        eventSource.addEventListener('connected', event => {
            setIsContainerConnected(true)
        })

        eventSource.addEventListener('log', event => {
            try {
                const data = JSON.parse((event as MessageEvent).data)
                const time = new Date(data.timestamp || Date.now()).toLocaleTimeString('en-US', { hour12: false })

                setContainerLogs(prev => [...prev, {
                    time,
                    message: data.log,
                    type: (data.type || 'info') as 'info' | 'success' | 'error' | 'warning',
                    source: 'container'
                }])
            } catch (error) {
                console.error('Error parsing container log event:', error)
            }
        })

        eventSource.addEventListener('error', event => {
            console.error('Container logs error:', event)
        })

        eventSource.onerror = error => {
            console.error('❌ Container SSE error:', error)
            setIsContainerConnected(false)
        }
    }

    // Cleanup container logs connection when unmounting or switching tabs
    useEffect(() => {
        return () => {
            if (containerEventSourceRef.current) {
                console.log('🧹 Cleaning up container SSE connection')
                containerEventSourceRef.current.close()
                containerEventSourceRef.current = null
            }
        }
    }, [])
    
    // Disconnect from container logs when switching away from live tab
    useEffect(() => {
        if (!isDeployingMode && activeTab !== 'live') {
            if (containerEventSourceRef.current) {
                containerEventSourceRef.current.close()
                containerEventSourceRef.current = null
                setIsContainerConnected(false)
            }
        }
    }, [activeTab, isDeployingMode])

    // Connect to build service SSE if we have a buildId and in deploying mode
    useEffect(() => {
        if (!buildId || !isDeployingMode) return

        const connectToBuildSSE = () => {
            // Try unified API first, fallback to old API on error
            const unifiedEventSource = new EventSource(
                `${MONITORING_SERVICE_URL}/api/platform-logs/stream/build/${buildId}`
            )
            buildEventSourceRef.current = unifiedEventSource

            unifiedEventSource.onopen = () => {
                setIsBuildConnected(true)
            }

            unifiedEventSource.addEventListener('log', event => {
                try {
                    const data: PlatformLogEvent = JSON.parse((event as MessageEvent).data)
                    const time = new Date(data.eventTimestamp).toLocaleTimeString('en-US', { hour12: false })

                    setLiveLogs(prev => [...prev, {
                        time,
                        message: data.message,
                        type: getLogType(data.severity),
                        source: 'build'
                    }])

                    // Update build phase based on event subtype
                    if (data.eventSubtype === 'build_start' || data.eventSubtype === 'build_step') {
                        setBuildPhase(data.metadata?.stepName || 'building')
                    }
                    if (data.eventSubtype === 'build_complete') {
                        setBuildStatus(data.severity === 'error' ? 'failed' : 'completed')
                        setBuildPhase(data.severity === 'error' ? 'failed' : 'completed')
                        setBuildCompleted(true)
                        if (data.severity === 'error') {
                            setBuildError(data.message)
                        }
                    }
                } catch (error) {
                    console.error('Error parsing build log event:', error)
                }
            })

            unifiedEventSource.onerror = error => {
                console.error('Unified build SSE error, falling back to legacy API:', error)
                unifiedEventSource.close()
                
                // Fallback to old build service API
                const buildServiceUrl = process.env.NEXT_PUBLIC_BUILD_SERVICE_URL 
                const eventSource = new EventSource(`${buildServiceUrl}/builds/${buildId}/logs/stream`)
                buildEventSourceRef.current = eventSource

                eventSource.onopen = () => {
                    setIsBuildConnected(true)
                }

                eventSource.addEventListener('log', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })

                        setLiveLogs(prev => [...prev, {
                            time,
                            message: data.message,
                            type: data.type as 'info' | 'success' | 'error' | 'warning',
                            source: 'build'
                        }])
                    } catch (error) {
                        console.error('Error parsing build log event:', error)
                    }
                })

                eventSource.addEventListener('status', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setBuildStatus(data.status)
                        setBuildPhase(data.status)

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLiveLogs(prev => [...prev, {
                            time,
                            message: `Phase: ${data.status} - ${data.message}`,
                            type: 'info',
                            source: 'build'
                        }])
                    } catch (error) {
                        console.error('Error parsing build status event:', error)
                    }
                })

                eventSource.addEventListener('complete', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setBuildStatus(data.status)
                        setBuildPhase(data.status)
                        setBuildCompleted(true)

                        if (data.status === 'failed') {
                            setBuildError(data.errorMessage || 'Build failed')
                        }

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLiveLogs(prev => [...prev, {
                            time,
                            message: data.status === 'completed' ? '✓ Build completed successfully' : '✗ Build failed',
                            type: data.status === 'completed' ? 'success' : 'error',
                            source: 'build'
                        }])

                        eventSource.close()
                    } catch (error) {
                        console.error('Error parsing build completion event:', error)
                    }
                })

                eventSource.onerror = error => {
                    console.error('Build SSE error:', error)
                    if (isBuildConnected) {
                        setIsBuildConnected(false)
                    }
                }
            }
        }

        connectToBuildSSE()

        return () => {
            if (buildEventSourceRef.current) {
                buildEventSourceRef.current.close()
                buildEventSourceRef.current = null
            }
        }
    }, [buildId, isDeployingMode])

    // Connect to deployment service SSE (only in deploying mode)
    useEffect(() => {
        if (!isDeployingMode) return

        const shouldConnect = ['pending', 'deploying'].includes(status)

        if (shouldConnect) {
            // Try unified API first
            const unifiedEventSource = new EventSource(
                `${MONITORING_SERVICE_URL}/api/platform-logs/stream/deployment/${deploymentId}`
            )
            deployEventSourceRef.current = unifiedEventSource

            unifiedEventSource.onopen = () => {
                setIsConnected(true)
            }

            unifiedEventSource.addEventListener('connected', event => {
                setIsConnected(true)
            })

            unifiedEventSource.addEventListener('log', event => {
                try {
                    const data: PlatformLogEvent = JSON.parse((event as MessageEvent).data)
                    const time = new Date(data.eventTimestamp).toLocaleTimeString('en-US', { hour12: false })

                    setLiveLogs(prev => [...prev, {
                        time,
                        message: data.message,
                        type: getLogType(data.severity),
                        source: 'deployment'
                    }])

                    // Update deployment phase based on event subtype
                    if (data.eventSubtype === 'deploy_start') {
                        setCurrentPhase('deploying_new')
                    } else if (data.eventSubtype === 'health_check') {
                        setCurrentPhase('health_checking')
                    } else if (data.eventSubtype === 'traffic_switch') {
                        setCurrentPhase('switching_traffic')
                    } else if (data.eventSubtype === 'deploy_complete') {
                        if (data.severity === 'error') {
                            setStatus('failed')
                            setCurrentPhase('failed')
                        } else {
                            setStatus('active')
                            setCurrentPhase('completed')
                        }
                    }

                    // Handle metadata for container and traffic info
                    if (data.metadata) {
                        setPhaseMetadata(data.metadata)
                        
                        if (data.metadata.containerId) {
                            setContainers(prev => {
                                const updated = new Map(prev)
                                updated.set(data.metadata!.containerId, {
                                    containerId: data.metadata!.containerId,
                                    containerName: data.metadata!.containerName || 'unknown',
                                    status: data.metadata!.status || 'running',
                                    health: data.metadata!.healthStatus || 'healthy',
                                    group: data.metadata!.deploymentGroup || 'default'
                                })
                                return updated
                            })
                        }
                    }
                } catch (error) {
                    console.error('Error parsing deployment log event:', error)
                }
            })

            unifiedEventSource.onerror = error => {
                console.error('Unified deployment SSE error, falling back to legacy API:', error)
                unifiedEventSource.close()
                
                // Fallback to old deployment service API
                const deployServiceUrl = process.env.NEXT_PUBLIC_DEPLOY_SERVICE_URL 
                const eventSource = new EventSource(`${deployServiceUrl}/deployments/${deploymentId}/logs/stream`)
                deployEventSourceRef.current = eventSource

                eventSource.onopen = () => {
                    setIsConnected(true)
                }

                eventSource.addEventListener('connected', event => {
                    setIsConnected(true)
                })

                eventSource.addEventListener('log', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })

                        setLiveLogs(prev => [...prev, {
                            time,
                            message: data.message,
                            type: data.type as 'info' | 'success' | 'error' | 'warning',
                            source: 'deployment'
                        }])
                    } catch (error) {
                        console.error('Error parsing log event:', error)
                    }
                })

                eventSource.addEventListener('phase', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setCurrentPhase(data.phase)
                        if (data.metadata) {
                            setPhaseMetadata(data.metadata)
                        }

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLiveLogs(prev => [...prev, {
                            time,
                            message: `📍 ${data.message}`,
                            type: 'info',
                            source: 'deployment'
                        }])
                    } catch (error) {
                        console.error('Error parsing phase event:', error)
                    }
                })

                eventSource.addEventListener('container', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setContainers(prev => {
                            const updated = new Map(prev)
                            updated.set(data.containerId, data)
                            return updated
                        })

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLiveLogs(prev => [...prev, {
                            time,
                            message: `🐳 ${data.message}`,
                            type: data.health === 'healthy' ? 'success' : data.health === 'unhealthy' ? 'error' : 'info',
                            source: 'deployment'
                        }])
                    } catch (error) {
                        console.error('Error parsing container event:', error)
                    }
                })

                eventSource.addEventListener('traffic', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setTrafficInfo(data)

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLiveLogs(prev => [...prev, {
                            time,
                            message: `🚦 ${data.message}`,
                            type: 'info',
                            source: 'deployment'
                        }])
                    } catch (error) {
                        console.error('Error parsing traffic event:', error)
                    }
                })

                eventSource.addEventListener('complete', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        const newStatus = data.status as DeploymentStatus
                        setStatus(newStatus)
                        
                        if (newStatus === 'active') {
                            setCurrentPhase('completed')
                        } else if (newStatus === 'failed') {
                            setCurrentPhase('failed')
                        }

                        if (data.errorMessage) {
                            setErrorMessage(data.errorMessage)
                        }

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLiveLogs(prev => [...prev, {
                            time,
                            message: data.message,
                            type: data.status === 'active' ? 'success' : 'error',
                            source: 'deployment'
                        }])

                        eventSource.close()
                    } catch (error) {
                        console.error('Error parsing completion event:', error)
                    }
                })

                eventSource.addEventListener('heartbeat', () => {
                    // Keep connection alive
                })

                eventSource.onerror = error => {
                    console.error('Deployment SSE error:', error)
                    if (isConnected) {
                        setIsConnected(false)
                    }
                }
            }
        }

        return () => {
            if (deployEventSourceRef.current) {
                deployEventSourceRef.current.close()
                deployEventSourceRef.current = null
            }
        }
    }, [deploymentId, status, isDeployingMode])

    const formatDeploymentTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
    }

    const getPhaseDisplay = () => {
        const phases: Record<DeploymentPhase, { icon: any; text: string; color: string }> = {
            preparing: { icon: Loader2, text: 'Preparing Deployment', color: 'text-blue-500' },
            deploying_new: { icon: Rocket, text: 'Deploying New Version', color: 'text-orange-500' },
            health_checking: { icon: Activity, text: 'Health Checking', color: 'text-blue-500' },
            switching_traffic: { icon: TrendingUp, text: 'Switching Traffic', color: 'text-purple-500' },
            draining_old: { icon: Server, text: 'Draining Old Containers', color: 'text-yellow-500' },
            monitoring: { icon: Activity, text: 'Monitoring Deployment', color: 'text-blue-500' },
            completed: { icon: CheckCircle2, text: 'Deployment Complete', color: 'text-green-500' },
            failed: { icon: XCircle, text: 'Deployment Failed', color: 'text-red-500' }
        }
        return phases[currentPhase] || phases['preparing']
    }

    const getBuildPhaseDisplay = () => {
        const phases: Record<BuildPhase, { icon: any; text: string; color: string }> = {
            queued: { icon: Clock, text: 'Build Queued', color: 'text-blue-500' },
            cloning: { icon: Loader2, text: 'Cloning Repository', color: 'text-blue-500' },
            installing: { icon: Loader2, text: 'Installing Dependencies', color: 'text-blue-500' },
            building: { icon: Hammer, text: 'Building Application', color: 'text-orange-500' },
            completed: { icon: CheckCircle2, text: 'Build Complete', color: 'text-green-500' },
            failed: { icon: XCircle, text: 'Build Failed', color: 'text-red-500' }
        }
        return phases[buildPhase] || phases['queued']
    }

    const phaseDisplay = getPhaseDisplay()
    const PhaseIcon = phaseDisplay.icon
    const isDeploying = isDeployingMode && !['completed', 'failed'].includes(currentPhase)

    const buildPhaseDisplay = getBuildPhaseDisplay()
    const BuildPhaseIcon = buildPhaseDisplay.icon
    const isBuilding = isDeployingMode && !['completed', 'failed'].includes(buildPhase)

    const getStatusBadge = () => {
        switch (status) {
            case 'active':
                return (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-500">
                        <CheckCircle2 size={12} />
                        Active
                    </span>
                )
            case 'failed':
                return (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500">
                        <XCircle size={12} />
                        Failed
                    </span>
                )
            case 'deploying':
                return (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-500">
                        <Loader2 size={12} className="animate-spin" />
                        Deploying
                    </span>
                )
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-500">
                        <Clock size={12} />
                        Pending
                    </span>
                )
        }
    }

    const getModeBadge = () => {
        if (isDeployingMode) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-500">
                    <Rocket size={12} />
                    Deploying
                </span>
            )
        }
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-3 py-1 text-xs font-medium text-zinc-400">
                <FileText size={12} />
                History
            </span>
        )
    }

    const availableContainers = Array.from(containers.values())
    
    // Auto-select first container when containers become available in history mode
    useEffect(() => {
        if (!isDeployingMode && activeTab === 'live' && availableContainers.length > 0 && !selectedContainerId) {
            connectToContainerLogs(availableContainers[0].containerId)
        }
    }, [availableContainers, isDeployingMode, activeTab, selectedContainerId])

    return (
        <div className="flex h-full w-full flex-col bg-[#0f0f0f]">
            {/* Header - Enterprise Style */}
            <div className="border-b border-zinc-800 bg-[#1a1a1a] p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800`}>
                            {isDeployingMode ? (
                                <PhaseIcon className={`${phaseDisplay.color} ${isDeploying ? 'animate-spin' : ''}`} size={28} />
                            ) : (
                                <FileText className="text-zinc-400" size={28} />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-xl font-semibold text-white">
                                    {isDeployingMode ? phaseDisplay.text : 'Deployment Logs'}
                                </h2>
                                {getModeBadge()}
                                {getStatusBadge()}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-zinc-500">
                                <span className="flex items-center gap-1.5">
                                    <Server size={14} />
                                    {environment}
                                </span>
                                <span className="text-zinc-700">|</span>
                                <span className="flex items-center gap-1.5">
                                    <Activity size={14} />
                                    {strategy.replace(/_/g, ' ')}
                                </span>
                                {isDeployingMode && isDeploying && (
                                    <>
                                        <span className="text-zinc-700">|</span>
                                        <span className="flex items-center gap-1.5 text-orange-400">
                                            <Clock size={14} />
                                            {formatDeploymentTime(deploymentTime)}
                                        </span>
                                    </>
                                )}
                                {isDeployingMode && hasBuildPhase && (
                                    <>
                                        <span className="text-zinc-700">|</span>
                                        <span className="flex items-center gap-1.5">
                                            {buildCompleted ? (
                                                <CheckCircle2 size={14} className="text-green-500" />
                                            ) : (
                                                <Loader2 size={14} className="animate-spin text-blue-500" />
                                            )}
                                            Build {buildCompleted ? 'Complete' : 'In Progress'}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {(isConnected || isBuildConnected) && isDeploying ? (
                            <span className="flex items-center gap-2 text-xs text-green-500">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
                                Live
                            </span>
                        ) : isLoading ? (
                            <span className="flex items-center gap-2 text-xs text-zinc-500">
                                <Loader2 size={14} className="animate-spin" />
                                Loading...
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Build Phase Progress - Only show in Deploying Mode */}
            {isDeployingMode && hasBuildPhase && isDeploying && !buildCompleted && (
                <div className="border-b border-zinc-800 bg-zinc-900/30 p-6">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                            <Hammer size={16} className="text-blue-500" />
                        </div>
                        Build Phase
                    </div>
                    <div className="flex items-center justify-between px-4">
                        {(['queued', 'cloning', 'installing', 'building'] as const).map((phase, idx) => {
                            const phases: BuildPhase[] = ['queued', 'cloning', 'installing', 'building', 'completed']
                            const currentIndex = phases.indexOf(buildPhase)
                            const phaseIndex = phases.indexOf(phase)

                            const isComplete = currentIndex > phaseIndex
                            const isCurrent = currentIndex === phaseIndex
                            const isFailed = buildPhase === 'failed'

                            return (
                                <React.Fragment key={phase}>
                                    <div className="flex flex-col items-center gap-2">
                                        <div
                                            className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all duration-300 ${
                                                isFailed 
                                                    ? 'border-red-500/50 bg-red-500/10 text-red-500' 
                                                    : isComplete 
                                                        ? 'border-green-500/50 bg-green-500/10 text-green-500' 
                                                        : isCurrent 
                                                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-500 shadow-lg shadow-blue-500/20' 
                                                            : 'border-zinc-800 bg-zinc-900 text-zinc-600'
                                            }`}
                                        >
                                            {isFailed ? <XCircle size={20} /> : isComplete ? <CheckCircle2 size={20} /> : isCurrent ? <Loader2 size={20} className="animate-spin" /> : idx + 1}
                                        </div>
                                        <span className={`text-xs capitalize ${isCurrent ? 'font-medium text-zinc-300' : 'text-zinc-600'}`}>
                                            {phase.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    {idx < 3 && (
                                        <div className={`h-0.5 flex-1 mx-2 ${isComplete ? 'bg-green-500/50' : 'bg-zinc-800'}`} />
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Deployment Phase Progress - Only show in Deploying Mode */}
            {isDeployingMode && isDeploying && strategy === 'blue_green' && buildCompleted && (
                <div className="border-b border-zinc-800 bg-zinc-900/30 p-6">
                    <div className="flex items-center justify-between px-4">
                        {(['deploying_new', 'health_checking', 'switching_traffic'] as const).map((phase, idx) => {
                            const phases: DeploymentPhase[] = ['preparing', 'deploying_new', 'health_checking', 'switching_traffic', 'completed']
                            const currentIndex = phases.indexOf(currentPhase)
                            const phaseIndex = phases.indexOf(phase)

                            const isComplete = currentIndex > phaseIndex
                            const isCurrent = currentIndex === phaseIndex
                            const isFailed = currentPhase === 'failed'

                            return (
                                <React.Fragment key={phase}>
                                    <div className="flex flex-col items-center gap-2">
                                        <div
                                            className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all duration-300 ${
                                                isFailed 
                                                    ? 'border-red-500/50 bg-red-500/10 text-red-500' 
                                                    : isComplete 
                                                        ? 'border-green-500/50 bg-green-500/10 text-green-500' 
                                                        : isCurrent 
                                                            ? 'border-orange-500/50 bg-orange-500/10 text-orange-500 shadow-lg shadow-orange-500/20' 
                                                            : 'border-zinc-800 bg-zinc-900 text-zinc-600'
                                            }`}
                                        >
                                            {isFailed ? <XCircle size={20} /> : isComplete ? <CheckCircle2 size={20} /> : isCurrent ? <Loader2 size={20} className="animate-spin" /> : idx + 1}
                                        </div>
                                        <span className={`text-xs capitalize ${isCurrent ? 'font-medium text-zinc-300' : 'text-zinc-600'}`}>
                                            {phase.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    {idx < 2 && (
                                        <div className={`h-0.5 flex-1 mx-2 ${isComplete ? 'bg-green-500/50' : 'bg-zinc-800'}`} />
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Status Banners - Only show in Deploying Mode */}
            {isDeployingMode && (
                <>
                    {/* Build Error Banner */}
                    {buildPhase === 'failed' && (
                        <div className="border-b border-zinc-800 bg-red-500/5 p-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                                    <XCircle className="text-red-500" size={20} />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-red-500">Build Failed</div>
                                    {buildError && <div className="text-sm text-zinc-400">{buildError}</div>}
                                    <div className="text-xs text-zinc-500 mt-1">Deployment cannot proceed until the build is fixed.</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Success Banner */}
                    {status === 'active' && (
                        <div className="border-b border-zinc-800 bg-green-500/5 p-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                                    <CheckCircle2 className="text-green-500" size={20} />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-green-500">Deployment Successful!</div>
                                    <div className="text-sm text-zinc-400">Application is now live in {environment} environment</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Banner */}
                    {status === 'failed' && (
                        <div className="border-b border-zinc-800 bg-red-500/5 p-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                                    <XCircle className="text-red-500" size={20} />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-red-500">Deployment Failed</div>
                                    {errorMessage && <div className="text-sm text-zinc-400">{errorMessage}</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Containers Info */}
                    {containers.size > 0 && (
                        <div className="border-b border-zinc-800 bg-zinc-900/30 p-4">
                            <div className="mb-3 text-sm font-semibold text-zinc-300">Active Containers ({containers.size})</div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                {Array.from(containers.values()).map(container => (
                                    <div key={container.containerId} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs">
                                        <div className={`h-2.5 w-2.5 rounded-full ${container.health === 'healthy' ? 'bg-green-500' : container.health === 'unhealthy' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                        <span className="font-mono text-zinc-300">{container.containerName}</span>
                                        <span className="ml-auto text-zinc-500">{container.group}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Traffic Routing Info */}
                    {trafficInfo && (
                        <div className="border-b border-zinc-800 bg-blue-500/5 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                                        <TrendingUp className="text-blue-500" size={18} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-blue-400">Traffic Routing</div>
                                        <div className="text-xs text-zinc-400">
                                            {trafficInfo.routingGroup} group receiving {trafficInfo.trafficPercentage}% traffic
                                        </div>
                                    </div>
                                </div>
                                <div className="text-3xl font-bold text-blue-400">{trafficInfo.trafficPercentage}%</div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Tab Navigation - Only in History Mode */}
            {!isDeployingMode && (
                <div className="border-b border-zinc-800 bg-zinc-900/50 px-6">
                    <div className="flex gap-1">
                        <button 
                            onClick={() => setActiveTab('live')} 
                            className={`flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium transition-all ${
                                activeTab === 'live' 
                                    ? 'border-orange-500 text-white' 
                                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <Radio size={16} className={activeTab === 'live' ? 'text-orange-500' : ''} />
                            Live Container Logs
                        </button>
                        <button 
                            onClick={() => setActiveTab('all')} 
                            className={`flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium transition-all ${
                                activeTab === 'all' 
                                    ? 'border-orange-500 text-white' 
                                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <FileText size={16} className={activeTab === 'all' ? 'text-orange-500' : ''} />
                            All Deployment Logs
                        </button>
                    </div>
                </div>
            )}

            {/* Logs Terminal */}
            <div className="flex-1 overflow-hidden p-6">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800">
                            <Terminal size={16} />
                        </div>
                        <span className="font-medium text-zinc-300">
                            {isDeployingMode 
                                ? (hasBuildPhase ? 'Build & Deployment Logs' : 'Deployment Logs')
                                : activeTab === 'live' 
                                    ? 'Live Container Logs' 
                                    : 'All Deployment Logs'
                            }
                        </span>
                        {isDeployingMode && hasBuildPhase && (
                            <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                                <span className="text-blue-400">Build</span>
                                <span className="text-zinc-600 mx-1">+</span>
                                <span className="text-purple-400">Deploy</span>
                            </span>
                        )}
                        {!isDeployingMode && hasBuildPhase && activeTab === 'all' && (
                            <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                                <span className="text-blue-400">Build</span>
                                <span className="text-zinc-600 mx-1">+</span>
                                <span className="text-purple-400">Deploy</span>
                            </span>
                        )}
                        {isDeployingMode && isDeploying && (
                            <span className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full">
                                <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                                Streaming...
                            </span>
                        )}
                        {!isDeployingMode && activeTab === 'live' && isContainerConnected && (
                            <span className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 px-3 py-1 rounded-full">
                                <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                                Connected
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-zinc-600">
                        {isDeployingMode 
                            ? `${liveLogs.length} entries` 
                            : activeTab === 'all' 
                                ? `${historicalLogs.length} entries` 
                                : `${containerLogs.length} entries`
                        }
                    </div>
                </div>
                
                {/* Container Selector - Only in Live Logs Tab */}
                {!isDeployingMode && activeTab === 'live' && availableContainers.length > 0 && (
                    <div className="mb-4 flex items-center gap-3">
                        <span className="text-sm text-zinc-500">Container:</span>
                        <div className="flex gap-2 flex-wrap">
                            {availableContainers.map(container => (
                                <button
                                    key={container.containerId}
                                    onClick={() => connectToContainerLogs(container.containerId)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        selectedContainerId === container.containerId
                                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                                            : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300'
                                    }`}
                                >
                                    <Box size={12} />
                                    <span className="font-mono">{container.containerName}</span>
                                    <div className={`h-2 w-2 rounded-full ${
                                        container.health === 'healthy' ? 'bg-green-500' : 
                                        container.health === 'unhealthy' ? 'bg-red-500' : 
                                        'bg-yellow-500'
                                    }`} />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Legend */}
                {(isDeployingMode || (!isDeployingMode && activeTab === 'all')) && (
                    <div className="mb-3 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                Build
                            </span>
                            <span className="text-zinc-600">Build service logs</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                Deploy
                            </span>
                            <span className="text-zinc-600">Deployment service logs</span>
                        </div>
                    </div>
                )}
                
                {!isDeployingMode && activeTab === 'live' && (
                    <div className="mb-3 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                                Container
                            </span>
                            <span className="text-zinc-600">Live container stdout/stderr</span>
                        </div>
                    </div>
                )}

                <div className="h-[calc(100%-6rem)] overflow-y-auto rounded-xl border border-zinc-800 bg-black p-5 font-mono text-xs shadow-inner">
                    {isDeployingMode ? (
                        // Deploying Mode - Show Live Logs with both Build and Deployment
                        liveLogs.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-zinc-600">
                                <div className="text-center">
                                    <Loader2 size={32} className="animate-spin mx-auto mb-3 text-zinc-700" />
                                    <p>Initializing deployment...</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {liveLogs.map((log, idx) => (
                                    <div key={idx} className="mb-2 flex gap-3 hover:bg-zinc-900/30 px-2 py-1.5 rounded transition-colors items-start">
                                        <span className="text-zinc-700 shrink-0 w-16">[{log.time}]</span>
                                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                                            log.source === 'build' 
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                        }`}>
                                            {log.source}
                                        </span>
                                        <span className={`flex-1 break-all ${
                                            log.type === 'error' ? 'text-red-400' : 
                                            log.type === 'success' ? 'text-green-400' : 
                                            log.type === 'warning' ? 'text-yellow-400' : 
                                            'text-zinc-400'
                                        }`}>
                                            {log.message}
                                        </span>
                                    </div>
                                ))}
                                <div ref={liveLogsEndRef} />
                            </>
                        )
                    ) : (
                        // History Mode - Show based on active tab
                        activeTab === 'live' ? (
                            // Live Logs Tab - Show container logs
                            !selectedContainerId ? (
                                <div className="flex h-full items-center justify-center text-zinc-600">
                                    <div className="text-center">
                                        <Box size={48} className="mx-auto mb-4 text-zinc-800" />
                                        <p className="text-lg font-medium text-zinc-500 mb-2">Select a Container</p>
                                        <p className="text-sm text-zinc-700">Choose a container above to view live logs</p>
                                    </div>
                                </div>
                            ) : containerLogs.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-zinc-600">
                                    <div className="text-center">
                                        {isContainerConnected ? (
                                            <>
                                                <Loader2 size={32} className="animate-spin mx-auto mb-3 text-zinc-700" />
                                                <p>Waiting for container logs...</p>
                                            </>
                                        ) : (
                                            <>
                                                <Radio size={48} className="mx-auto mb-4 text-zinc-800" />
                                                <p className="text-lg font-medium text-zinc-500 mb-2">Connecting...</p>
                                                <p className="text-sm text-zinc-700">Establishing connection to container</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {containerLogs.map((log, idx) => (
                                        <div key={idx} className="mb-2 flex gap-3 hover:bg-zinc-900/30 px-2 py-1.5 rounded transition-colors items-start">
                                            <span className="text-zinc-700 shrink-0 w-16">[{log.time}]</span>
                                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0 mt-0.5 bg-green-500/10 text-green-400 border border-green-500/20">
                                                Container
                                            </span>
                                            <span className={`flex-1 break-all ${
                                                log.type === 'error' ? 'text-red-400' : 
                                                log.type === 'success' ? 'text-green-400' : 
                                                log.type === 'warning' ? 'text-yellow-400' : 
                                                'text-zinc-400'
                                            }`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </>
                            )
                        ) : activeTab === 'all' && isLoadingHistorical ? (
                            <div className="flex h-full items-center justify-center text-zinc-500">
                                <div className="text-center">
                                    <Loader2 className="animate-spin mx-auto mb-3" size={32} />
                                    <p>Loading deployment history...</p>
                                </div>
                            </div>
                        ) : activeTab === 'all' && historicalLogs.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-zinc-600">
                                <div className="text-center">
                                    <FileText size={48} className="mx-auto mb-4 text-zinc-800" />
                                    <p className="text-lg font-medium text-zinc-500 mb-2">No Logs Available</p>
                                    <p className="text-sm text-zinc-700">No deployment logs found for this deployment</p>
                                </div>
                            </div>
                        ) : (
                            // All Logs Tab - Show Historical Logs
                            <>
                                {historicalLogs.map((log, idx) => (
                                    <div key={idx} className="mb-2 flex gap-3 hover:bg-zinc-900/30 px-2 py-1.5 rounded transition-colors items-start">
                                        <span className="text-zinc-700 shrink-0 w-16">[{log.time}]</span>
                                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                                            log.source === 'build' 
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                        }`}>
                                            {log.source}
                                        </span>
                                        <span className={`flex-1 break-all ${
                                            log.type === 'error' ? 'text-red-400' : 
                                            log.type === 'success' ? 'text-green-400' : 
                                            log.type === 'warning' ? 'text-yellow-400' : 
                                            'text-zinc-400'
                                        }`}>
                                            {log.message}
                                        </span>
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </>
                        )
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/30 px-6 py-5">
                <div className="text-sm">
                    {isDeployingMode ? (
                        // Deploying Mode Footer
                        <>
                            {buildPhase === 'failed' && (
                                <span className="flex items-center gap-2 text-red-400">
                                    <XCircle size={16} />
                                    Build failed. Fix errors and retry.
                                </span>
                            )}
                            {status === 'failed' && buildPhase !== 'failed' && (
                                <span className="flex items-center gap-2 text-red-400">
                                    <XCircle size={16} />
                                    Deployment failed. Check logs for details.
                                </span>
                            )}
                            {status === 'active' && (
                                <span className="flex items-center gap-2 text-green-400">
                                    <CheckCircle2 size={16} />
                                    Deployment completed in {formatDeploymentTime(deploymentTime)}
                                </span>
                            )}
                            {['pending', 'deploying'].includes(status) && (
                                <span className="flex items-center gap-2 text-orange-400">
                                    <Loader2 className="animate-spin" size={16} />
                                    {hasBuildPhase && !buildCompleted ? 'Building application...' : 'Deploying application...'}
                                </span>
                            )}
                        </>
                    ) : (
                        // History Mode Footer
                        <>
                            {!isDeployingMode && activeTab === 'live' && selectedContainerId && (
                                <span className="flex items-center gap-2 text-green-400">
                                    <Radio size={16} />
                                    Streaming from {availableContainers.find(c => c.containerId === selectedContainerId)?.containerName}
                                </span>
                            )}
                            {!isDeployingMode && activeTab === 'live' && !selectedContainerId && (
                                <span className="flex items-center gap-2 text-zinc-500">
                                    <Box size={16} />
                                    Select a container to view live logs
                                </span>
                            )}
                            {activeTab === 'all' && status === 'failed' && (
                                <span className="flex items-center gap-2 text-red-400">
                                    <XCircle size={16} />
                                    Deployment Failed
                                </span>
                            )}
                            {activeTab === 'all' && status === 'active' && (
                                <span className="flex items-center gap-2 text-green-400">
                                    <CheckCircle2 size={16} />
                                    Deployment Successful
                                </span>
                            )}
                            {activeTab === 'all' && status === 'pending' && (
                                <span className="flex items-center gap-2 text-blue-400">
                                    <Clock size={16} />
                                    Deployment Pending
                                </span>
                            )}
                        </>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onClose} 
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default DeploymentLogsViewer
