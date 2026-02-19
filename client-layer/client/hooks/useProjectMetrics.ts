import { useEffect, useRef, useCallback, useState } from 'react'

export interface ProjectMetrics {
  projectId: string
  production?: any
  staging?: any
  availableDataTypes: string[]
  notAvailable: string[]
  timeRange: string
  timestamp: string
  latencyDistribution?: any[]
  statusCodes?: any[]
  endpoints?: any[]
  geographicData?: any[]
  heatmapData?: any[]
  requestsData?: any[]
  timeSeriesData?: any[]
}

export interface UseProjectMetricsOptions {
  projectId: string
  timeRange?: string
}

export interface UseProjectMetricsReturn {
  metrics: ProjectMetrics | null
  isConnected: boolean
  lastUpdate: Date | null
  error: string | null
}

const MONITORING_SERVICE_URL = process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL || 'http://localhost:5110'

export function useProjectMetrics(options: UseProjectMetricsReturn): UseProjectMetricsReturn {
  return options
}

export function useProjectMetricsUpdates(projectId: string, timeRange: string = '24h') {
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const connectedRef = useRef(false)
  const projectIdRef = useRef(projectId)
  const timeRangeRef = useRef(timeRange)
  const hasReceivedDataRef = useRef(false)
  const timeRangeKeyRef = useRef(timeRange)

  projectIdRef.current = projectId
  timeRangeRef.current = timeRange
  timeRangeKeyRef.current = timeRange

  const connectSSE = useCallback((forcedTimeRange?: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    connectedRef.current = false
    hasReceivedDataRef.current = false
    const currentProjectId = projectIdRef.current
    const currentTimeRange = forcedTimeRange || timeRangeRef.current

    console.log('[metrics] connectSSE using timeRange:', currentTimeRange, 'forced:', forcedTimeRange)
    const url = `${MONITORING_SERVICE_URL}/api/projects/${currentProjectId}/metrics/sse?timeRange=${currentTimeRange}`
    console.log('[metrics] SSE connecting to:', url)
    
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      if (eventSourceRef.current !== eventSource) return
      console.log('[metrics] SSE OPENED')
      connectedRef.current = true
      setIsConnected(true)
      setError(null)
      reconnectAttemptsRef.current = 0
    }

    eventSource.addEventListener('connected', (e) => {
      if (eventSourceRef.current !== eventSource) return
      console.log('[metrics] connected event:', e.data)
      connectedRef.current = true
      hasReceivedDataRef.current = true
      setIsConnected(true)
    })

    eventSource.addEventListener('metrics', (e) => {
      if (eventSourceRef.current !== eventSource) return
      hasReceivedDataRef.current = true
      try {
        const data = JSON.parse(e.data)
        if (data.metrics) {
          setMetrics(data.metrics)
          setLastUpdate(new Date())
        }
      } catch (err) {
        console.error('[metrics] Failed to parse metrics:', err)
      }
    })

    eventSource.addEventListener('heartbeat', () => {
      if (eventSourceRef.current !== eventSource) return
      setLastUpdate(new Date())
    })

    eventSource.onerror = (err) => {
      if (eventSourceRef.current !== eventSource) return
      
      const state = eventSource.readyState
      console.log('[metrics] SSE error, readyState:', state)
      
      if (state === EventSource.CLOSED) {
        setIsConnected(false)
        
        // Only reconnect if timeRange hasn't changed - pass current timeRange explicitly
        if (hasReceivedDataRef.current && reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current++
          const delay = 2000
          const currentTimeRange = timeRangeKeyRef.current
          console.log(`[metrics] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}, timeRange: ${currentTimeRange})`)
          reconnectTimeoutRef.current = setTimeout(() => connectSSE(currentTimeRange), delay)
        } else {
          console.log('[metrics] Skipping reconnect')
        }
      }
    }
  }, [])

  useEffect(() => {
    reconnectAttemptsRef.current = 0
    connectSSE(timeRange)

    return () => {
      console.log('[metrics] Cleanup: closing SSE connection')
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setIsConnected(false)
    }
  }, [timeRange, connectSSE])

  return {
    metrics,
    isConnected,
    lastUpdate,
    error,
  }
}
