'use client'
import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, Terminal, Loader2, GitBranch, Package, Clock } from 'lucide-react'
import { BuildStatus, Build } from '../Types/ProjectTypes'
import axios from 'axios'

interface BuildLogsViewerProps {
    build: Build
    onClose: () => void
}

interface PlatformLogEvent {
    id: string
    eventType: string
    eventSubtype: string
    severity: 'debug' | 'info' | 'warning' | 'error' | 'fatal'
    message: string
    eventTimestamp: string
    metadata?: Record<string, any>
}

const MONITORING_SERVICE_URL = process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL || 'http://localhost/monitoring-service'

const BuildLogsViewer: React.FC<BuildLogsViewerProps> = ({ build, onClose }) => {
    const [logs, setLogs] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }>>([])
    const [isLoading, setIsLoading] = useState(true)
    const [currentStatus, setCurrentStatus] = useState<BuildStatus>(build.status)
    const logsEndRef = useRef<HTMLDivElement>(null)
    const eventSourceRef = useRef<EventSource | null>(null)
    const hasLoadedHistoricalLogs = useRef(false)

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logs])

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

    useEffect(() => {
        const fetchHistoricalLogs = async () => {
            if (hasLoadedHistoricalLogs.current) return

            setIsLoading(true)
            try {
                // Use unified platform logs API
                const resp = await axios.get<{ events: PlatformLogEvent[]; total: number }>(
                    `${MONITORING_SERVICE_URL}/api/platform-logs/query?resource_type=build&resource_id=${build.id}&limit=1000`
                )

                if (resp.status === 200 && resp.data.events && resp.data.events.length > 0) {
                    const transformedLogs = resp.data.events.map((event: PlatformLogEvent) => ({
                        time: new Date(event.eventTimestamp).toLocaleTimeString('en-US', { hour12: false }),
                        message: event.message,
                        type: getLogType(event.severity)
                    }))

                    setLogs(transformedLogs)
                    hasLoadedHistoricalLogs.current = true
                }
            } catch (error) {
                console.error('Error fetching historical logs:', error)
                // Fallback to old API if unified API is not available
                try {
                    const resp = await axios.get<{ logs: any[] }>(`${process.env.NEXT_PUBLIC_BUILD_SERVICE_URL}/builds/${build.id}/logs`)
                    if (resp.status === 200 && resp.data.logs && resp.data.logs.length > 0) {
                        const transformedLogs = resp.data.logs.map((log: any) => ({
                            time: new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false }),
                            message: log.message,
                            type: log.log_type as 'info' | 'success' | 'error' | 'warning'
                        }))
                        setLogs(transformedLogs)
                        hasLoadedHistoricalLogs.current = true
                    }
                } catch (fallbackError) {
                    console.error('Fallback API also failed:', fallbackError)
                }
            } finally {
                setIsLoading(false)
            }
        }

        const isActive = ['queued', 'cloning', 'installing', 'building', 'running', 'deploying'].includes(currentStatus)

        fetchHistoricalLogs().then(() => {
            if (isActive) {
                // Use unified platform logs streaming API
                const eventSource = new EventSource(
                    `${MONITORING_SERVICE_URL}/api/platform-logs/stream/build/${build.id}`
                )
                eventSourceRef.current = eventSource

                eventSource.addEventListener('connected', e => {
                    console.log('Connected to build logs stream:', e.data)
                })

                eventSource.addEventListener('log', e => {
                    try {
                        const logData: PlatformLogEvent = JSON.parse(e.data)
                        const newLog = {
                            time: new Date(logData.eventTimestamp).toLocaleTimeString('en-US', { hour12: false }),
                            message: logData.message,
                            type: getLogType(logData.severity)
                        }
                        setLogs(prev => [...prev, newLog])
                        
                        // Update status based on event subtype
                        if (logData.eventSubtype === 'build_complete') {
                            setCurrentStatus(logData.severity === 'error' ? 'failed' : 'success')
                        }
                    } catch (error) {
                        console.error('Error parsing log:', error)
                    }
                })

                eventSource.onerror = error => {
                    console.error('SSE error:', error)
                    if (eventSource.readyState === EventSource.CLOSED) {
                        console.log('SSE connection closed')
                    }
                    eventSource.close()
                    
                    // Fallback to old streaming endpoint
                    const fallbackEventSource = new EventSource(`${process.env.NEXT_PUBLIC_BUILD_SERVICE_URL}/builds/${build.id}/logs/stream`)
                    fallbackEventSource.addEventListener('log', e => {
                        try {
                            const logData = JSON.parse(e.data)
                            const newLog = {
                                time: new Date(logData.timestamp).toLocaleTimeString('en-US', { hour12: false }),
                                message: logData.message,
                                type: logData.type
                            }
                            setLogs(prev => [...prev, newLog])
                        } catch (error) {
                            console.error('Error parsing fallback log:', error)
                        }
                    })
                    fallbackEventSource.addEventListener('complete', () => {
                        fallbackEventSource.close()
                    })
                }
            }
        })

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }
        }
    }, [build.id, currentStatus])

    const getStatusDisplay = () => {
        switch (build.status) {
            case 'queued':
                return { icon: Clock, text: 'Queued', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
            case 'cloning':
                return { icon: GitBranch, text: 'Cloning Repository', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
            case 'installing':
                return { icon: Package, text: 'Installing Dependencies', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
            case 'building':
                return { icon: Loader2, text: 'Building Application', color: 'text-orange-500', bgColor: 'bg-orange-500/10' }
            case 'success':
                return { icon: CheckCircle2, text: 'Build Successful', color: 'text-green-500', bgColor: 'bg-green-500/10' }
            case 'failed':
                return { icon: XCircle, text: 'Build Failed', color: 'text-red-500', bgColor: 'bg-red-500/10' }
            case 'cancelled':
                return { icon: XCircle, text: 'Build Cancelled', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
            default:
                return { icon: Terminal, text: 'Unknown Status', color: 'text-gray-500', bgColor: 'bg-gray-500/10' }
        }
    }

    const statusDisplay = getStatusDisplay()
    const StatusIcon = statusDisplay.icon
    const isBuilding = ['queued', 'cloning', 'installing', 'building', 'deploying', 'running'].includes(currentStatus)

    return (
        <div className="flex h-full w-full flex-col">
            {/* Header */}
            <div className="border-b border-zinc-800 p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${statusDisplay.bgColor}`}>
                            <StatusIcon className={`${statusDisplay.color} ${isBuilding ? 'animate-spin' : ''}`} size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">Build #{build.id.substring(0, 8)}</h2>
                            <p className="text-sm text-zinc-400">
                                {statusDisplay.text} • {build.branch}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="border-b border-zinc-800 bg-zinc-900/50 p-5">
                <div className="flex items-center justify-between">
                    {(['cloning', 'installing', 'building'] as const).map((step, idx) => {
                        const stepIndex = ['queued', 'cloning', 'installing', 'building', 'deploying', 'success', 'failed', 'cancelled'].indexOf(currentStatus)
                        const currentStepIndex = ['queued', 'cloning', 'installing', 'building', 'deploying', 'success', 'failed', 'cancelled'].indexOf(step)
                        const isComplete = stepIndex > currentStepIndex || currentStatus === 'success'
                        const isCurrent = currentStatus === step
                        const isFailed = currentStatus === 'failed' && currentStepIndex <= stepIndex

                        return (
                            <React.Fragment key={step}>
                                <div className="flex flex-col items-center gap-2">
                                    <div
                                        className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 ${
                                            isFailed ? 'border-red-500 bg-red-500/20 text-red-500' : isComplete ? 'border-green-500 bg-green-500/20 text-green-500' : isCurrent ? 'border-orange-500 bg-orange-500/20 text-orange-500' : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                                        }`}
                                    >
                                        {isFailed ? <XCircle size={18} /> : isComplete ? <CheckCircle2 size={18} /> : isCurrent ? <Loader2 size={18} className="animate-spin" /> : idx + 1}
                                    </div>
                                    <span className={`text-xs capitalize ${isCurrent ? 'font-medium text-white' : isComplete ? 'text-zinc-400' : 'text-zinc-500'}`}>{step}</span>
                                </div>
                                {idx < 2 && <div className={`h-0.5 flex-1 ${isComplete ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-zinc-800'}`} />}
                            </React.Fragment>
                        )
                    })}
                </div>
            </div>

            {/* Success Banner */}
            {currentStatus === 'success' && (
                <div className="border-b border-zinc-800 bg-green-500/5 p-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="text-green-500" size={20} />
                        <div>
                            <div className="text-sm font-semibold text-green-500">Build Successful!</div>
                            <div className="text-sm text-zinc-400">Build completed in {build.duration}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Failed Banner */}
            {currentStatus === 'failed' && (
                <div className="border-b border-zinc-800 bg-red-500/5 p-4">
                    <div className="flex items-center gap-3">
                        <XCircle className="text-red-500" size={20} />
                        <div>
                            <div className="text-sm font-semibold text-red-500">Build Failed</div>
                            {build.errorMessage && <div className="text-sm text-zinc-400">{build.errorMessage}</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* Logs Terminal */}
            <div className="flex-1 overflow-hidden p-5">
                <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Terminal size={16} />
                    <span className="font-medium">Build Logs</span>
                    {isBuilding && (
                        <span className="flex items-center gap-1 text-xs text-orange-400">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                            Live
                        </span>
                    )}
                </div>
                <div className="h-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-zinc-800 bg-black p-4 font-mono text-xs">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-zinc-400">
                            <Loader2 className="animate-spin" size={16} />
                            <span>Loading build logs...</span>
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
                    {currentStatus === 'failed' && (
                        <span className="flex items-center gap-2 text-red-400">
                            <XCircle size={16} />
                            Build failed. Check logs for details.
                        </span>
                    )}
                    {currentStatus === 'success' && (
                        <span className="flex items-center gap-2 text-green-400">
                            <CheckCircle2 size={16} />
                            Build completed in {build.duration || 'calculating...'}
                        </span>
                    )}
                    {isBuilding && (
                        <span className="flex items-center gap-2 text-orange-400">
                            <Loader2 className="animate-spin" size={16} />
                            Build in progress...
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

export default BuildLogsViewer
