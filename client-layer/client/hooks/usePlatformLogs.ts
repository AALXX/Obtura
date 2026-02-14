/**
 * Unified Platform Logs Hook
 * Fetches and streams logs from the unified logging API
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export type LogEventType = 'build' | 'deployment' | 'container' | 'system' | 'security' | 'audit';
export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
export type ResourceType = 'build' | 'deployment' | 'project' | 'company' | 'system';

export interface LogEvent {
  id: string;
  eventType: LogEventType;
  eventSubtype: string;
  resourceType: ResourceType;
  resourceId: string;
  projectId?: string;
  companyId?: string;
  containerId?: string;
  containerName?: string;
  severity: Severity;
  message: string;
  metadata?: Record<string, any>;
  sourceService: string;
  sourceHost?: string;
  eventTimestamp: string;
}

export interface UsePlatformLogsOptions {
  resourceType: ResourceType;
  resourceId: string;
  projectId?: string;
  eventTypes?: LogEventType[];
  severities?: Severity[];
  limit?: number;
  enableStreaming?: boolean;
}

export interface UsePlatformLogsReturn {
  logs: LogEvent[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  isStreaming: boolean;
}

const MONITORING_SERVICE_URL = process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL || 'http://localhost:5090';

export function usePlatformLogs(options: UsePlatformLogsOptions): UsePlatformLogsReturn {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [offset, setOffset] = useState(0);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchLogs = useCallback(async (currentOffset: number, append: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('resource_type', options.resourceType);
      params.append('resource_id', options.resourceId);
      if (options.projectId) params.append('project_id', options.projectId);
      params.append('limit', String(options.limit || 100));
      params.append('offset', String(currentOffset));

      const response = await axios.get<{ events: LogEvent[]; total: number }>(
        `${MONITORING_SERVICE_URL}/api/platform-logs/query?${params}`
      );

      const { events, total } = response.data;
      
      if (append) {
        setLogs(prev => [...prev, ...events]);
      } else {
        setLogs(events);
      }

      setHasMore(events.length + currentOffset < total);
      setOffset(currentOffset + events.length);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch logs'));
    } finally {
      setIsLoading(false);
    }
  }, [options.resourceType, options.resourceId, options.projectId, options.limit]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    await fetchLogs(offset, true);
  }, [fetchLogs, hasMore, isLoading, offset]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await fetchLogs(0, false);
  }, [fetchLogs]);

  // Setup streaming
  useEffect(() => {
    if (!options.enableStreaming) return;

    const setupStreaming = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(
        `${MONITORING_SERVICE_URL}/api/platform-logs/stream/${options.resourceType}/${options.resourceId}`
      );

      eventSourceRef.current = eventSource;
      setIsStreaming(true);

      eventSource.addEventListener('connected', (e) => {
        console.log('Connected to log stream:', e.data);
      });

      eventSource.addEventListener('log', (e) => {
        try {
          const logEvent: LogEvent = JSON.parse(e.data);
          setLogs(prev => [logEvent, ...prev]);
        } catch (error) {
          console.error('Error parsing log event:', error);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Connection is alive
      });

      eventSource.addEventListener('error', (e) => {
        console.error('Log stream error:', e);
        setIsStreaming(false);
      });

      return () => {
        eventSource.close();
        setIsStreaming(false);
      };
    };

    const cleanup = setupStreaming();
    return cleanup;
  }, [options.enableStreaming, options.resourceType, options.resourceId]);

  // Initial fetch
  useEffect(() => {
    fetchLogs(0, false);
  }, [fetchLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    logs,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    isStreaming,
  };
}

// Hook for build logs specifically
export function useBuildLogs(buildId: string, projectId?: string, enableStreaming: boolean = true) {
  return usePlatformLogs({
    resourceType: 'build',
    resourceId: buildId,
    projectId,
    enableStreaming,
  });
}

// Hook for deployment logs specifically
export function useDeploymentLogs(deploymentId: string, projectId?: string, enableStreaming: boolean = true) {
  return usePlatformLogs({
    resourceType: 'deployment',
    resourceId: deploymentId,
    projectId,
    enableStreaming,
  });
}

// Utility to format log timestamp
export function formatLogTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

// Utility to get severity color
export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'fatal':
    case 'error':
      return 'text-red-500';
    case 'warning':
      return 'text-yellow-500';
    case 'info':
      return 'text-blue-500';
    case 'debug':
      return 'text-gray-500';
    default:
      return 'text-gray-300';
  }
}

// Utility to get severity icon
export function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'fatal':
      return '💀';
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    case 'debug':
      return '🐛';
    default:
      return '📝';
  }
}
