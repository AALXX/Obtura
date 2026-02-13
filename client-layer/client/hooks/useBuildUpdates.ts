// hooks/useBuildUpdates.ts
import { useEffect, useState, useRef, useMemo } from 'react'
import { Build, BuildStatus } from '@/features/projects/Types/ProjectTypes'

export function useBuildUpdates(projectId: string, initialBuilds: Build[]) {
    const [updatedBuilds, setUpdatedBuilds] = useState<Build[]>(initialBuilds)
    const eventSourcesRef = useRef<Map<string, EventSource>>(new Map())

    useEffect(() => {
        const currentBuildsMap = new Map(updatedBuilds.map(b => [b.id, b]))
        const incomingBuildsMap = new Map(initialBuilds.map(b => [b.id, b]))

        const newBuilds = initialBuilds.filter(b => !currentBuildsMap.has(b.id))

        if (newBuilds.length > 0) {
            console.log(
                newBuilds.map(b => b.id.substring(0, 8))
            )

            setUpdatedBuilds(prev => {
                const merged = [...newBuilds, ...prev]
                console.log(merged.map(b => `${b.id.substring(0, 8)}:${b.status}`))
                return merged
            })
        }

        const removedBuilds = updatedBuilds.filter(b => !incomingBuildsMap.has(b.id))
        if (removedBuilds.length > 0) {
            console.log(
                removedBuilds.map(b => b.id.substring(0, 8))
            )
            setUpdatedBuilds(prev => prev.filter(b => incomingBuildsMap.has(b.id)))
        }
    }, [initialBuilds])
    const buildsKey = useMemo(() => {
        return `${updatedBuilds.length}:${updatedBuilds.map(b => b.id).join(',')}`
    }, [updatedBuilds.length])

    useEffect(() => {
        const normalizeStatus = (status: string): BuildStatus => {
            if (status === 'queued') return 'queued'
            if (status === 'cloning') return 'cloning'
            if (status === 'installing') return 'installing'
            if (status === 'building') return 'building'
            if (status === 'deploying') return 'deploying'
            if (status === 'running') return 'running'
            if (status === 'failed') return 'failed'
            if (status === 'timeout') return 'cancelled'
            if (status === 'rejected') return 'failed'
            if (status === 'completed' || status === 'complete') return 'success'

            return status as BuildStatus
        }

        const activeBuilds = updatedBuilds.filter(b => ['queued', 'running', 'cloning', 'installing', 'building', 'deploying'].includes(b.status))

        if (activeBuilds.length === 0) {
            if (eventSourcesRef.current.size > 0) {
                console.log('Cleaning up lingering connections')
                eventSourcesRef.current.forEach(es => es.close())
                eventSourcesRef.current.clear()
            }
            return
        }

        console.log(
            activeBuilds.map(b => `${b.id.substring(0, 8)}(${b.status})`)
        )
        console.log(
            Array.from(eventSourcesRef.current.keys()).map(id => id.substring(0, 8))
        )

        activeBuilds.forEach(build => {
            if (eventSourcesRef.current.has(build.id)) {
                console.log(`Connection already exists for ${build.id.substring(0, 8)}`)
                return
            }

            const url = `${process.env.NEXT_PUBLIC_BUILD_SERVICE_URL}/builds/${build.id}/logs/stream`
            console.log(`Creating SSE connection for build ${build.id.substring(0, 8)}`)

            const eventSource = new EventSource(url)

            eventSource.onopen = () => {
                console.log(`SSE OPENED for build ${build.id.substring(0, 8)}`)
            }

            eventSource.addEventListener('status', e => {
                const data = JSON.parse(e.data)
                const newStatus = normalizeStatus(data.status)

                console.log(`STATUS: ${data.buildId.substring(0, 8)} → ${newStatus}`)

                setUpdatedBuilds(prev => {
                    const updated = prev.map(b => (b.id === data.buildId ? { ...b, status: newStatus, duration: data.duration || b.duration, errorMessage: data.errorMessage } : b))
                    return updated
                })
            })

            eventSource.addEventListener('complete', e => {
                const data = JSON.parse(e.data)
                const newStatus = normalizeStatus(data.status || 'completed')

                console.log(`COMPLETE: ${data.buildId.substring(0, 8)} → ${newStatus}`)

                setUpdatedBuilds(prev => prev.map(b => (b.id === data.buildId ? { ...b, status: newStatus, duration: data.duration || b.duration, errorMessage: data.errorMessage } : b)))

                console.log(`Closing connection for ${data.buildId.substring(0, 8)}`)
                eventSource.close()
                eventSourcesRef.current.delete(data.buildId)
            })

            eventSource.onerror = error => {
                // Don't treat connection close as an error - it happens when build completes
                if (eventSource.readyState === EventSource.CLOSED || eventSource.readyState === EventSource.CONNECTING) {
                    console.log(`Connection ${eventSource.readyState === EventSource.CLOSED ? 'closed' : 'connecting'} for ${build.id.substring(0, 8)}`)
                    eventSourcesRef.current.delete(build.id)
                    return
                }
                console.error(`SSE ERROR for build ${build.id.substring(0, 8)}`, 'ReadyState:', eventSource.readyState)
            }

            eventSourcesRef.current.set(build.id, eventSource)
        })

        const activeBuildIds = new Set(activeBuilds.map(b => b.id))
        eventSourcesRef.current.forEach((es, buildId) => {
            if (!activeBuildIds.has(buildId)) {
                console.log(`Closing completed build connection: ${buildId.substring(0, 8)}`)
                es.close()
                eventSourcesRef.current.delete(buildId)
            }
        })

        return () => {
            console.log('Component cleanup: closing all connections')
            eventSourcesRef.current.forEach(es => es.close())
            eventSourcesRef.current.clear()
        }
    }, [buildsKey])

    return updatedBuilds
}
