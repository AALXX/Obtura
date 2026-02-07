'use client'
import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, Terminal, Loader2, Rocket, Server, Activity, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import axios from 'axios'

type DeploymentStatus = 'pending' | 'deploying' | 'active' | 'failed' | 'rolled_back'
type DeploymentPhase = 'preparing' | 'deploying_new' | 'health_checking' | 'switching_traffic' | 'draining_old' | 'monitoring' | 'completed' | 'failed'

interface DeploymentLogsViewerProps {
    deploymentId: string
    projectId: string
    environment: string
    strategy: string
    onClose: () => void
}

interface LogEntry {
    time: string
    message: string
    type: 'info' | 'success' | 'error' | 'warning'
}

interface PhaseInfo {
    phase: DeploymentPhase
    message: string
    timestamp: string
    metadata?: {
        active_group?: string
        standby_group?: string
        total_batches?: number
        current_batch?: number
        canary_traffic_percentage?: number
    }
}

interface ContainerEvent {
    containerId: string
    containerName: string
    status: string
    health: string
    message: string
    group: string
}

interface TrafficRouting {
    routingGroup: string
    trafficPercentage: number
    activeContainers: string[]
    message: string
}

const DeploymentLogsViewer: React.FC<DeploymentLogsViewerProps> = ({ deploymentId, projectId, environment, strategy, onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [currentPhase, setCurrentPhase] = useState<DeploymentPhase>('preparing')
    const [phaseMetadata, setPhaseMetadata] = useState<any>({})
    const [status, setStatus] = useState<DeploymentStatus>('pending')
    const [containers, setContainers] = useState<Map<string, ContainerEvent>>(new Map())
    const [trafficInfo, setTrafficInfo] = useState<TrafficRouting | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [deploymentTime, setDeploymentTime] = useState(0)
    const [errorMessage, setErrorMessage] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [logView, setLogView] = useState<'live' | 'historical'>('live')

    const logsEndRef = useRef<HTMLDivElement>(null)
    const startTimeRef = useRef<number>(Date.now())
    const eventSourceRef = useRef<EventSource | null>(null)
    const hasLoadedHistoricalLogs = useRef(false)

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logs])

    useEffect(() => {
        if (!['active', 'failed', 'rolled_back'].includes(status)) {
            const interval = setInterval(() => {
                setDeploymentTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
            }, 1000)
            return () => clearInterval(interval)
        }
    }, [status])

    useEffect(() => {
        const fetchHistoricalLogs = async () => {
            if (hasLoadedHistoricalLogs.current) return

            setIsLoading(true)
            try {
                const resp = await axios.get<{ logs: any[] }>(`${process.env.NEXT_PUBLIC_DEPLOY_SERVICE_URL}/deployments/${deploymentId}/logs`)

                if (resp.status === 200 && resp.data.logs && resp.data.logs.length > 0) {
                    const transformedLogs = resp.data.logs.map((log: any) => ({
                        time: new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false }),
                        message: log.message,
                        type: log.log_type as 'info' | 'success' | 'error' | 'warning'
                    }))

                    setLogs(transformedLogs)
                    hasLoadedHistoricalLogs.current = true
                    console.log(`✅ Loaded ${transformedLogs.length} historical deployment logs`)
                }
            } catch (error) {
                console.error('Error fetching historical deployment logs:', error)
            } finally {
                setIsLoading(false)
            }
        }

        const isActive = ['pending', 'deploying'].includes(status)

        fetchHistoricalLogs().then(() => {
            // Only connect to SSE if deployment is still active OR if viewing live logs
            if ((isActive || !hasLoadedHistoricalLogs.current) && logView === 'live') {
                const deployServiceUrl = process.env.NEXT_PUBLIC_DEPLOY_SERVICE_URL || 'http://localhost:5070'
                const eventSource = new EventSource(`${deployServiceUrl}/deployments/${deploymentId}/logs/stream`)
                eventSourceRef.current = eventSource

                console.log(`🔌 Connecting to deployment SSE: ${deployServiceUrl}/deployments/${deploymentId}/logs/stream`)

                eventSource.onopen = () => {
                    setIsConnected(true)
                    console.log('✅ Connected to deployment logs stream')
                }

                eventSource.addEventListener('connected', event => {
                    setIsConnected(true)
                    const data = JSON.parse((event as MessageEvent).data)
                    console.log('Connected:', data)
                })

                // Handle log events
                eventSource.addEventListener('log', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })

                        setLogs(prev => [
                            ...prev,
                            {
                                time,
                                message: data.message,
                                type: data.type as 'info' | 'success' | 'error' | 'warning'
                            }
                        ])
                    } catch (error) {
                        console.error('Error parsing log event:', error)
                    }
                })

                // Handle phase changes
                eventSource.addEventListener('phase', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setCurrentPhase(data.phase)
                        if (data.metadata) {
                            setPhaseMetadata(data.metadata)
                        }

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLogs(prev => [
                            ...prev,
                            {
                                time,
                                message: `📍 ${data.message}`,
                                type: 'info'
                            }
                        ])
                    } catch (error) {
                        console.error('Error parsing phase event:', error)
                    }
                })

                // Handle container events
                eventSource.addEventListener('container', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setContainers(prev => {
                            const updated = new Map(prev)
                            updated.set(data.containerId, data)
                            return updated
                        })

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLogs(prev => [
                            ...prev,
                            {
                                time,
                                message: `🐳 ${data.message}`,
                                type: data.health === 'healthy' ? 'success' : data.health === 'unhealthy' ? 'error' : 'info'
                            }
                        ])
                    } catch (error) {
                        console.error('Error parsing container event:', error)
                    }
                })

                // Handle traffic routing events
                eventSource.addEventListener('traffic', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setTrafficInfo(data)

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLogs(prev => [
                            ...prev,
                            {
                                time,
                                message: `🚦 ${data.message}`,
                                type: 'info'
                            }
                        ])
                    } catch (error) {
                        console.error('Error parsing traffic event:', error)
                    }
                })

                // Handle completion
                eventSource.addEventListener('complete', event => {
                    try {
                        const data = JSON.parse((event as MessageEvent).data)
                        setStatus(data.status)
                        setCurrentPhase('completed')

                        if (data.errorMessage) {
                            setErrorMessage(data.errorMessage)
                        }

                        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                        setLogs(prev => [
                            ...prev,
                            {
                                time,
                                message: data.message,
                                type: data.status === 'active' ? 'success' : 'error'
                            }
                        ])

                        console.log('🏁 Deployment completed, closing SSE connection')
                        eventSource.close()
                    } catch (error) {
                        console.error('Error parsing completion event:', error)
                    }
                })

                eventSource.addEventListener('heartbeat', () => {
                    // Keep connection alive
                })

                eventSource.onerror = error => {
                    console.error('❌ SSE error:', error)
                    if (isConnected) {
                        setIsConnected(false)
                    }
                }
            }
        })

        return () => {
            console.log('🧹 Cleaning up deployment SSE connection')
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }
        }
    }, [deploymentId, status, logView])

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

    const phaseDisplay = getPhaseDisplay()
    const PhaseIcon = phaseDisplay.icon
    const isDeploying = !['completed', 'failed'].includes(currentPhase)

    const getStatusBadge = () => {
        switch (status) {
            case 'active':
                return (
                    <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-500">
                        <CheckCircle2 size={12} />
                        Active
                    </span>
                )
            case 'failed':
                return (
                    <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500">
                        <XCircle size={12} />
                        Failed
                    </span>
                )
            case 'deploying':
                return (
                    <span className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-500">
                        <Loader2 size={12} className="animate-spin" />
                        Deploying
                    </span>
                )
            default:
                return (
                    <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-500">
                        <Clock size={12} />
                        Pending
                    </span>
                )
        }
    }

    return (
        <div className="flex h-full w-full flex-col">
            {/* Header */}
            <div className="border-b border-zinc-800 p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg bg-${phaseDisplay.color.split('-')[1]}-500/10`}>
                            <PhaseIcon className={`${phaseDisplay.color} ${isDeploying ? 'animate-spin' : ''}`} size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-semibold text-white">{phaseDisplay.text}</h2>
                                {getStatusBadge()}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-sm text-zinc-400">
                                <span>Environment: {environment}</span>
                                <span>•</span>
                                <span>Strategy: {strategy}</span>
                                <span>•</span>
                                <span>Time: {formatDeploymentTime(deploymentTime)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isConnected && logView === 'live' ? (
                            <span className="flex items-center gap-2 text-xs text-green-500">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
                                Live
                            </span>
                        ) : isLoading ? (
                            <span className="flex items-center gap-2 text-xs text-zinc-500">
                                <Loader2 size={14} className="animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 text-xs text-zinc-500">Historical</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Phase Progress for Blue-Green */}
            {strategy === 'blue_green' && (
                <div className="border-b border-zinc-800 bg-zinc-900/50 p-5">
                    <div className="flex items-center justify-between">
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
                                            className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all ${
                                                isFailed ? 'border-red-500 bg-red-500/20 text-red-500' : isComplete ? 'border-green-500 bg-green-500/20 text-green-500' : isCurrent ? 'border-orange-500 bg-orange-500/20 text-orange-500' : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                                            }`}
                                        >
                                            {isFailed ? <XCircle size={18} /> : isComplete ? <CheckCircle2 size={18} /> : isCurrent ? <Loader2 size={18} className="animate-spin" /> : idx + 1}
                                        </div>
                                        <span className={`text-xs capitalize ${isCurrent ? 'font-medium text-white' : 'text-zinc-500'}`}>{phase.replace(/_/g, ' ')}</span>
                                    </div>
                                    {idx < 2 && <div className={`h-0.5 flex-1 ${isComplete ? 'bg-green-500' : 'bg-zinc-800'}`} />}
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Success Banner */}
            {status === 'active' && (
                <div className="border-b border-zinc-800 bg-green-500/5 p-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="text-green-500" size={20} />
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
                        <XCircle className="text-red-500" size={20} />
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
                    <div className="mb-3 text-sm font-semibold">Active Containers ({containers.size})</div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {Array.from(containers.values()).map(container => (
                            <div key={container.containerId} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs">
                                <div className={`h-2 w-2 rounded-full ${container.health === 'healthy' ? 'bg-green-500' : container.health === 'unhealthy' ? 'bg-red-500' : 'bg-yellow-500'}`} />
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
                        <div>
                            <div className="text-sm font-semibold text-blue-400">Traffic Routing</div>
                            <div className="text-xs text-zinc-400">
                                {trafficInfo.routingGroup} group receiving {trafficInfo.trafficPercentage}% traffic
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-blue-400">{trafficInfo.trafficPercentage}%</div>
                    </div>
                </div>
            )}

            {/* Log View Tabs */}
            <div className="border-b border-zinc-800 bg-zinc-900/30 px-5">
                <div className="flex gap-1">
                    <button onClick={() => setLogView('live')} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${logView === 'live' ? 'border-orange-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>
                        <div className="flex items-center gap-2">
                            <Terminal size={16} />
                            Live Logs
                            {isConnected && logView === 'live' && <span className="flex h-2 w-2 animate-pulse rounded-full bg-green-500"></span>}
                        </div>
                    </button>
                    <button onClick={() => setLogView('historical')} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${logView === 'historical' ? 'border-orange-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>
                        <div className="flex items-center gap-2">
                            <Clock size={16} />
                            All Deployment Logs
                        </div>
                    </button>
                </div>
            </div>

            {/* Logs Terminal */}
            <div className="flex-1 overflow-hidden p-5">
                <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Terminal size={16} />
                    <span className="font-medium">{logView === 'live' ? 'Live Deployment Logs' : 'All Deployment Logs'}</span>
                    {isDeploying && logView === 'live' && (
                        <span className="flex items-center gap-1 text-xs text-orange-400">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                            In Progress
                        </span>
                    )}
                </div>
                <div className="h-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-zinc-800 bg-black p-4 font-mono text-xs">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-zinc-400">
                            <Loader2 className="animate-spin" size={16} />
                            <span>Loading deployment logs...</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-zinc-500">No logs available yet...</div>
                    ) : (
                        <>
                            {logs.map((log, idx) => (
                                <div key={idx} className="mb-1.5 flex gap-3">
                                    <span className="text-zinc-600">[{log.time}]</span>
                                    <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-zinc-400'}>{log.message}</span>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/50 p-5">
                <div className="text-sm text-zinc-400">
                    {status === 'failed' && (
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
                    {isDeploying && (
                        <span className="flex items-center gap-2 text-orange-400">
                            <Loader2 className="animate-spin" size={16} />
                            Deployment in progress...
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default DeploymentLogsViewer
