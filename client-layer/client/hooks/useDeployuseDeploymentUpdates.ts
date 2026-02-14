import { Deployment } from '@/features/projects/Types/ProjectTypes'
import { useEffect, useState, useRef, useMemo } from 'react'

export type DeploymentStatus = 'pending' | 'deploying' | 'active' | 'failed' | 'rolled_back' | 'terminated'


export function useDeploymentUpdates(projectId: string, initialDeployments: Deployment[]) {
    const [updatedDeployments, setUpdatedDeployments] = useState<Deployment[]>(initialDeployments)
    const eventSourcesRef = useRef<Map<string, EventSource>>(new Map())

    // Sync with incoming initialDeployments changes
    useEffect(() => {
        const currentDeploymentsMap = new Map(updatedDeployments.map(d => [d.id, d]))
        const incomingDeploymentsMap = new Map(initialDeployments.map(d => [d.id, d]))

        // Add new deployments
        const newDeployments = initialDeployments.filter(d => !currentDeploymentsMap.has(d.id))
        if (newDeployments.length > 0) {
            console.log(
                '[deployments] New deployments detected:',
                newDeployments.map(d => d.id.substring(0, 8))
            )
            setUpdatedDeployments(prev => [...newDeployments, ...prev])
        }

        // Remove deployments that are no longer in initialDeployments
        const removedDeployments = updatedDeployments.filter(d => !incomingDeploymentsMap.has(d.id))
        if (removedDeployments.length > 0) {
            console.log(
                '[deployments] Removed deployments:',
                removedDeployments.map(d => d.id.substring(0, 8))
            )
            setUpdatedDeployments(prev => prev.filter(d => incomingDeploymentsMap.has(d.id)))
        }
    }, [initialDeployments])

    // Memoized key to trigger SSE connections
    const deploymentsKey = useMemo(() => {
        return `${updatedDeployments.length}:${updatedDeployments.map(d => d.id).join(',')}`
    }, [updatedDeployments.length])

    // Setup SSE connections for active deployments
    useEffect(() => {
        const normalizeStatus = (status: string): DeploymentStatus => {
            if (status === 'pending') return 'pending'
            if (status === 'deploying') return 'deploying'
            if (status === 'active') return 'active'
            if (status === 'failed') return 'failed'
            if (status === 'rolled_back') return 'rolled_back'
            if (status === 'terminated') return 'terminated'
            return status as DeploymentStatus
        }

        // Only connect to active/deploying deployments
        const activeDeployments = updatedDeployments.filter(d => ['pending', 'deploying'].includes(d.status))

        if (activeDeployments.length === 0) {
            if (eventSourcesRef.current.size > 0) {
                console.log('[deployments] Cleaning up lingering connections')
                eventSourcesRef.current.forEach(es => es.close())
                eventSourcesRef.current.clear()
            }
            return
        }

        console.log(
            '[deployments] Active deployments:',
            activeDeployments.map(d => `${d.id.substring(0, 8)}(${d.status})`)
        )
        console.log(
            '[deployments] Existing connections:',
            Array.from(eventSourcesRef.current.keys()).map(id => id.substring(0, 8))
        )

        activeDeployments.forEach(deployment => {
            if (eventSourcesRef.current.has(deployment.id)) {
                console.log(`[deployments] Connection already exists for ${deployment.id.substring(0, 8)}`)
                return
            }

            const url = `${process.env.NEXT_PUBLIC_DEPLOY_SERVICE_URL}/deployments/${deployment.id}/logs/stream`
            console.log(`[deployments] Creating SSE connection for deployment ${deployment.id.substring(0, 8)}`)

            const eventSource = new EventSource(url)

            eventSource.onopen = () => {
                console.log(`[deployments] SSE OPENED for deployment ${deployment.id.substring(0, 8)}`)
            }

            // Listen for phase changes
            eventSource.addEventListener('phase', e => {
                const data = JSON.parse((e as MessageEvent).data)
                console.log(`[deployments] PHASE: ${data.deploymentId.substring(0, 8)} → ${data.phase}`)

                setUpdatedDeployments(prev => prev.map(d => (d.id === data.deploymentId ? { ...d, strategyPhase: data.phase } : d)))
            })

            // Listen for traffic routing updates
            eventSource.addEventListener('traffic', e => {
                const data = JSON.parse((e as MessageEvent).data)
                console.log(`[deployments] TRAFFIC: ${data.deploymentId.substring(0, 8)} → ${data.trafficPercentage}%`)

                setUpdatedDeployments(prev => prev.map(d => (d.id === data.deploymentId ? { ...d, trafficPercentage: data.trafficPercentage } : d)))
            })

            // Listen for completion
            eventSource.addEventListener('complete', e => {
                const data = JSON.parse((e as MessageEvent).data)
                const newStatus = normalizeStatus(data.status)
                const now = new Date().toISOString()
                
                // Calculate duration if not provided
                let calculatedDuration = data.duration
                if (!calculatedDuration) {
                    const deployment = updatedDeployments.find(d => d.id === data.deploymentId)
                    if (deployment?.startedAt) {
                        const start = new Date(deployment.startedAt).getTime()
                        const end = new Date(now).getTime()
                        calculatedDuration = Math.round((end - start) / 1000) // in seconds
                    }
                }

                console.log(`[deployments] COMPLETE: ${data.deploymentId.substring(0, 8)} → ${newStatus}, duration: ${calculatedDuration}s`)

                // When a deployment becomes active, mark other active deployments in the same environment as rolled_back
                const completedDeployment = updatedDeployments.find(d => d.id === data.deploymentId)
                const targetEnvironment = completedDeployment?.environment

                setUpdatedDeployments(prev => {
                    // First update the completed deployment
                    let updated = prev.map(d =>
                        d.id === data.deploymentId
                            ? {
                                  ...d,
                                  status: newStatus,
                                  duration: calculatedDuration ? String(calculatedDuration) : d.duration,
                                  completedAt: now,
                                  errorMessage: data.errorMessage || d.errorMessage
                              }
                            : d
                    )
                    
                    // If new status is active, mark other active deployments in the same environment as rolled_back
                    if (newStatus === 'active' && targetEnvironment) {
                        updated = updated.map(d => {
                            // Skip the newly completed deployment and only affect same-environment deployments
                            if (d.id === data.deploymentId) return d
                            if (d.environment !== targetEnvironment) return d
                            // Only mark as rolled_back if it's currently active
                            if (d.status === 'active') {
                                console.log(`[deployments] Marking previous deployment ${d.id.substring(0, 8)} as rolled_back`)
                                return { ...d, status: 'rolled_back' as const }
                            }
                            return d
                        })
                    }
                    
                    return updated
                })

                console.log(`[deployments] Closing connection for ${data.deploymentId.substring(0, 8)}`)
                eventSource.close()
                eventSourcesRef.current.delete(data.deploymentId)
            })

            eventSource.onerror = error => {
                console.error(`[deployments] SSE ERROR for deployment ${deployment.id.substring(0, 8)}`, 'ReadyState:', eventSource.readyState)

                if (eventSource.readyState === EventSource.CLOSED) {
                    console.log(`[deployments] Connection closed for ${deployment.id.substring(0, 8)}`)
                    eventSourcesRef.current.delete(deployment.id)
                }
            }

            eventSourcesRef.current.set(deployment.id, eventSource)
        })

        // Cleanup connections for completed deployments
        const activeDeploymentIds = new Set(activeDeployments.map(d => d.id))
        eventSourcesRef.current.forEach((es, deploymentId) => {
            if (!activeDeploymentIds.has(deploymentId)) {
                console.log(`[deployments] Closing completed deployment connection: ${deploymentId.substring(0, 8)}`)
                es.close()
                eventSourcesRef.current.delete(deploymentId)
            }
        })

        return () => {
            console.log('[deployments] Component cleanup: closing all connections')
            eventSourcesRef.current.forEach(es => es.close())
            eventSourcesRef.current.clear()
        }
    }, [deploymentsKey])

    return updatedDeployments
}
