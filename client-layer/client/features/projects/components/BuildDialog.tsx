'use client'
import React, { useState, useEffect, useRef } from 'react'
import { X, CheckCircle2, XCircle, Clock, Terminal, Loader2, GitBranch, Package, WifiOff, Wifi, AlertCircle, Info } from 'lucide-react'

type BuildStatus = 'queued' | 'cloning' | 'installing' | 'building' | 'completed' | 'failed' | 'timeout' | 'rejected'

interface BuildDialogProps {
    accessToken: string
    projectId: string
    gitRepoUrl: string
    buildId: string
    onBuildStatusChange: (buildData: { id: string; status: BuildStatus; branch: string; commit: string; startTime: string; endTime?: string; duration: string }) => void
    onClose: () => void
}

interface LogEntry {
    time: string
    message: string
    type: 'info' | 'success' | 'error' | 'warn'
}

const BuildDialog: React.FC<BuildDialogProps> = ({ accessToken, projectId, gitRepoUrl, buildId, onBuildStatusChange, onClose }) => {
    const [status, setStatus] = useState<BuildStatus>('queued')
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [buildTime, setBuildTime] = useState(0)
    const [isConnected, setIsConnected] = useState(false)
    const [connectionError, setConnectionError] = useState<string | null>(null)
    const logsEndRef = useRef<HTMLDivElement>(null)
    const startTimeRef = useRef<number>(Date.now())
    const eventSourceRef = useRef<EventSource | null>(null)

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logs])

    useEffect(() => {
        if (!['completed', 'failed', 'timeout', 'rejected'].includes(status)) {
            const interval = setInterval(() => {
                setBuildTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
            }, 1000)
            return () => clearInterval(interval)
        }
    }, [status])

    useEffect(() => {
        const buildServiceUrl = process.env.NEXT_PUBLIC_BUILD_SERVICE_URL || 'http://localhost:5050'
        const eventSource = new EventSource(`${buildServiceUrl}/builds/${buildId}/logs/stream`)
        eventSourceRef.current = eventSource

        console.log(`🔌 Connecting to SSE: ${buildServiceUrl}/builds/${buildId}/logs/stream`)

        eventSource.onopen = () => {
            setIsConnected(true)
            setConnectionError(null)
        }

        eventSource.addEventListener('connected', event => {
            setIsConnected(true)
        })

        eventSource.addEventListener('log', event => {
            try {
                const data = JSON.parse((event as MessageEvent).data)
                const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })

                setLogs(prev => [
                    ...prev,
                    {
                        time,
                        message: data.message,
                        type: data.type as 'info' | 'success' | 'error' | 'warn'
                    }
                ])
            } catch (error) {
                console.error('Error parsing log message:', error)
            }
        })

        eventSource.addEventListener('status', event => {
            try {
                const data = JSON.parse((event as MessageEvent).data)
                onBuildStatusChange({
                    id: buildId,
                    status: data.status,
                    branch: 'main',
                    commit: 'latest',
                    startTime: new Date(startTimeRef.current).toISOString(),
                    endTime: new Date().toISOString(),
                    duration: formatBuildTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
                })
                if (data.status === 'queued') setStatus('queued')
                else if (data.status === 'cloning') setStatus('cloning')
                else if (data.status === 'installing') setStatus('installing')
                else if (data.status === 'building') setStatus('building')
                else if (data.status === 'completed') setStatus('completed')
                else if (data.status === 'failed') setStatus('failed')
                else if (data.status === 'timeout') setStatus('timeout')
                else if (data.status === 'rejected') setStatus('rejected')
            } catch (error) {
                console.error('Error parsing status message:', error)
            }
        })

        eventSource.addEventListener('complete', event => {
            try {
                const data = JSON.parse((event as MessageEvent).data)

                const finalDuration = formatBuildTime(Math.floor((Date.now() - startTimeRef.current) / 1000))

                onBuildStatusChange({
                    id: buildId,
                    status: data.status === 'completed' ? 'completed' : 'failed',
                    branch: 'main',
                    commit: 'latest',
                    startTime: new Date(startTimeRef.current).toISOString(),
                    endTime: new Date().toISOString(),
                    duration: finalDuration
                })
            } catch (error) {
                console.error('Error parsing completion message:', error)
            }
        })

        eventSource.addEventListener('heartbeat', event => {})

        eventSource.onerror = error => {
            // Only show error if we're actually connected and the connection fails
            // Don't show error for normal connection close when build completes
            if (eventSource.readyState === EventSource.CLOSED || eventSource.readyState === EventSource.CONNECTING) {
                if (eventSource.readyState === EventSource.CLOSED) {
                    console.log('🔌 SSE connection closed (build completed)')
                }
                // Only show connection error if we were previously connected
                if (isConnected && eventSource.readyState === EventSource.CLOSED) {
                    setIsConnected(false)
                    setConnectionError('Connection closed')
                }
                return
            }
            console.error('❌ SSE error:', error)
            if (isConnected) {
                setIsConnected(false)
                setConnectionError('Connection lost')
            }
        }

        return () => {
            console.log('🧹 Cleaning up SSE connection')
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }
        }
    }, [buildId, onBuildStatusChange, isConnected])

    const formatBuildTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
    }

    const getStatusDisplay = () => {
        switch (status) {
            case 'queued':
                return { icon: Clock, text: 'Queued', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
            case 'cloning':
                return { icon: GitBranch, text: 'Cloning Repository', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
            case 'installing':
                return { icon: Package, text: 'Installing Dependencies', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
            case 'building':
                return { icon: Loader2, text: 'Building Application', color: 'text-orange-500', bgColor: 'bg-orange-500/10' }
            case 'completed':
                return { icon: CheckCircle2, text: 'Build Successful', color: 'text-green-500', bgColor: 'bg-green-500/10' }
            case 'failed':
                return { icon: XCircle, text: 'Build Failed', color: 'text-red-500', bgColor: 'bg-red-500/10' }
            case 'timeout':
                return { icon: XCircle, text: 'Build Timeout', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
            case 'rejected':
                return { icon: XCircle, text: 'Build Rejected', color: 'text-red-500', bgColor: 'bg-red-500/10' }
        }
    }

    const statusDisplay = getStatusDisplay()
    const StatusIcon = statusDisplay.icon
    const isBuilding = !['completed', 'failed', 'timeout', 'rejected'].includes(status)

    return (
        <div className="h-full w-full text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-6">
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${statusDisplay.bgColor}`}>
                        <StatusIcon className={`${statusDisplay.color} ${isBuilding ? 'animate-spin' : ''}`} size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">{statusDisplay.text}</h2>
                        <p className="text-sm text-zinc-400">
                            Build time: {formatBuildTime(buildTime)} • {buildId.slice(0, 8)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                <div className="space-y-6">
                    {/* Connection Status Info */}
                    {connectionError ? (
                        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                            <WifiOff className="mt-0.5 flex-shrink-0 text-red-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-red-400">Connection Lost</div>
                                <p className="mt-1 text-xs text-red-300/80">{connectionError}</p>
                            </div>
                        </div>
                    ) : isConnected ? (
                        <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
                                <Wifi className="text-green-500" size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-green-400">Connected</div>
                                <p className="mt-1 text-xs text-green-300/80">Receiving live build updates</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                            <Loader2 className="mt-0.5 flex-shrink-0 animate-spin text-blue-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-blue-400">Connecting...</div>
                                <p className="mt-1 text-xs text-blue-300/80">Establishing connection to build service</p>
                            </div>
                        </div>
                    )}

                    {/* Build Progress Steps */}
                    <div>
                        <label className="mb-3 block text-sm font-medium">Build Progress</label>
                        <div className="flex items-center justify-between">
                            {(['cloning', 'installing', 'building'] as const).map((step, idx) => {
                                const steps: BuildStatus[] = ['queued', 'cloning', 'installing', 'building', 'completed']
                                const currentStepIndex = steps.indexOf(status)
                                const stepIndex = steps.indexOf(step)

                                const isErrorState = ['failed', 'timeout', 'rejected'].includes(status)

                                const isComplete = !isErrorState && currentStepIndex > stepIndex
                                const isCurrent = !isErrorState && currentStepIndex === stepIndex

                                return (
                                    <React.Fragment key={step}>
                                        <div className="flex flex-col items-center gap-2">
                                            <div
                                                className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all ${
                                                    isErrorState ? 'border-zinc-700 bg-zinc-900/50 text-zinc-500' : isComplete ? 'border-green-500 bg-green-500/10 text-green-500' : isCurrent ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-zinc-800 bg-zinc-900/50 text-zinc-500'
                                                }`}
                                            >
                                                {isErrorState ? idx + 1 : isComplete ? <CheckCircle2 size={18} /> : isCurrent ? <Loader2 size={18} className="animate-spin" /> : idx + 1}
                                            </div>
                                            <span className={`text-xs capitalize ${isCurrent ? 'font-medium text-white' : isComplete ? 'text-zinc-400' : 'text-zinc-500'}`}>{step}</span>
                                        </div>
                                        {idx < 2 && <div className={`h-0.5 flex-1 ${isErrorState ? 'bg-zinc-800' : isComplete ? 'bg-green-500' : 'bg-zinc-800'}`} />}
                                    </React.Fragment>
                                )
                            })}
                        </div>
                    </div>

                    {/* Success Message */}
                    {status === 'completed' && (
                        <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                            <CheckCircle2 className="mt-0.5 flex-shrink-0 text-green-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-green-400">Build Successful!</div>
                                <p className="mt-1 text-xs text-green-300/80">Your application has been built successfully and is ready for deployment.</p>
                            </div>
                        </div>
                    )}

                    {/* Error Messages */}
                    {status === 'failed' && (
                        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                            <XCircle className="mt-0.5 flex-shrink-0 text-red-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-red-400">Build Failed</div>
                                <p className="mt-1 text-xs text-red-300/80">The build process encountered an error. Check the logs below for details.</p>
                            </div>
                        </div>
                    )}

                    {status === 'timeout' && (
                        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                            <Clock className="mt-0.5 flex-shrink-0 text-yellow-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-yellow-400">Build Timeout</div>
                                <p className="mt-1 text-xs text-yellow-300/80">The build process exceeded the maximum allowed time.</p>
                            </div>
                        </div>
                    )}

                    {status === 'rejected' && (
                        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                            <AlertCircle className="mt-0.5 flex-shrink-0 text-red-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-red-400">Build Rejected</div>
                                <p className="mt-1 text-xs text-red-300/80">Build was rejected due to quota limits being exceeded.</p>
                            </div>
                        </div>
                    )}

                    {/* Build Logs */}
                    <div>
                        <div className="mb-2 flex items-center gap-2">
                            <Terminal size={16} className="text-zinc-400" />
                            <label className="text-sm font-medium">Build Logs</label>
                            {logs.length > 0 && <span className="text-xs text-zinc-500">({logs.length} entries)</span>}
                        </div>
                        <div className="h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-black p-4 font-mono text-xs">
                            {logs.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center text-zinc-500">
                                    <Loader2 size={24} className="mb-3 animate-spin" />
                                    <p className="flex items-center gap-2">
                                        <Clock size={16} />
                                        Waiting for build logs...
                                    </p>
                                    {!isConnected && <p className="mt-2 text-xs text-zinc-600">Establishing connection to build service...</p>}
                                </div>
                            ) : (
                                <>
                                    {logs.map((log, idx) => (
                                        <div key={idx} className="mb-1.5 flex gap-3">
                                            <span className="text-zinc-600">[{log.time}]</span>
                                            <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-zinc-300'}>{log.message}</span>
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                    {isBuilding && (
                                        <div className="mt-3 flex items-center gap-2 text-orange-400">
                                            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                                            <span>Processing...</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 p-6">
                <button onClick={onClose} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-900">
                    {isBuilding ? 'Close and Run in Background' : 'Close'}
                </button>
                <div className="flex items-center gap-3">
                    {status === 'completed' && (
                        <button onClick={onClose} className="flex items-center gap-2 rounded-lg bg-green-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600">
                            <CheckCircle2 size={18} />
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default BuildDialog
