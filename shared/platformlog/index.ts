/**
 * Unified Platform Logging SDK for Node.js/TypeScript
 * Used by core-api and other Node.js services
 */

export type LogEventType = 'build' | 'deployment' | 'container' | 'system' | 'security' | 'audit';
export type LogEventSubtype = 
  | 'build_start' | 'build_step' | 'build_complete' | 'build_error' | 'build_cancel'
  | 'deploy_start' | 'deploy_step' | 'deploy_complete' | 'deploy_error' | 'deploy_rollback' | 'health_check' | 'traffic_switch'
  | 'container_start' | 'container_log' | 'container_health' | 'container_restart' | 'container_stop'
  | 'system_startup' | 'system_shutdown' | 'queue_job' | 'config_change'
  | 'login' | 'logout' | 'permission_change' | 'api_key_action';
export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
export type ResourceType = 'build' | 'deployment' | 'project' | 'company' | 'system';

export interface LogEventMetadata {
  // Build metadata
  buildId?: string;
  buildNumber?: number;
  commitHash?: string;
  branch?: string;
  stepName?: string;
  stepNumber?: number;
  totalSteps?: number;
  durationMs?: number;
  exitCode?: number;

  // Deployment metadata
  deploymentId?: string;
  environment?: string;
  strategy?: string;
  healthCheckUrl?: string;
  trafficPercentage?: number;
  previousDeploymentId?: string;
  image?: string;
  port?: number;

  // Container metadata
  containerId?: string;
  containerName?: string;
  cpuUsagePercent?: number;
  memoryUsageMb?: number;
  restartCount?: number;

  // System metadata
  component?: string;
  operation?: string;
  queueName?: string;
  jobId?: string;

  // Security metadata
  userId?: string;
  action?: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;

  // Generic extra fields
  extra?: Record<string, any>;
}

export interface LogEvent {
  id: string;
  eventType: LogEventType;
  eventSubtype: LogEventSubtype;
  resourceType: ResourceType;
  resourceId: string;
  projectId?: string;
  companyId?: string;
  containerId?: string;
  containerName?: string;
  severity: Severity;
  message: string;
  metadata?: LogEventMetadata;
  sourceService: string;
  sourceHost?: string;
  eventTimestamp: Date;
}

export interface PlatformLoggerConfig {
  serviceName: string;
  monitoringServiceUrl: string;
  apiKey?: string;
  batchSize?: number;
  flushIntervalMs?: number;
}

export class PlatformLogger {
  private config: PlatformLoggerConfig;
  private buffer: LogEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private hostname: string;

  constructor(config: PlatformLoggerConfig) {
    this.config = {
      batchSize: 100,
      flushIntervalMs: 100,
      ...config,
    };
    this.hostname = process.env.HOSTNAME || require('os').hostname() || 'unknown';
    this.startFlushTimer();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(`${this.config.monitoringServiceUrl}/api/platform-logs/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        console.error(`Failed to send logs: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to flush logs:', error);
    }
  }

  public log(
    eventType: LogEventType,
    subtype: LogEventSubtype,
    resourceType: ResourceType,
    resourceId: string,
    severity: Severity,
    message: string,
    metadata?: LogEventMetadata,
    projectId?: string,
    companyId?: string
  ): void {
    const event: LogEvent = {
      id: this.generateId(),
      eventType,
      eventSubtype: subtype,
      resourceType,
      resourceId,
      projectId,
      companyId,
      severity,
      message,
      metadata,
      sourceService: this.config.serviceName,
      sourceHost: this.hostname,
      eventTimestamp: new Date(),
    };

    this.buffer.push(event);

    if (this.buffer.length >= this.config.batchSize!) {
      this.flush();
    }
  }

  // Build logging helpers
  public buildStart(
    buildId: string,
    projectId: string,
    companyId: string,
    buildNumber: number,
    commitHash: string,
    branch: string
  ): void {
    this.log(
      'build',
      'build_start',
      'build',
      buildId,
      'info',
      `Build #${buildNumber} started for branch ${branch}`,
      { buildId, buildNumber, commitHash, branch },
      projectId,
      companyId
    );
  }

  public buildStep(
    buildId: string,
    stepName: string,
    stepNumber: number,
    totalSteps: number,
    message: string,
    projectId?: string
  ): void {
    this.log(
      'build',
      'build_step',
      'build',
      buildId,
      'info',
      message,
      { buildId, stepName, stepNumber, totalSteps },
      projectId
    );
  }

  public buildComplete(
    buildId: string,
    success: boolean,
    durationMs: number,
    projectId?: string
  ): void {
    this.log(
      'build',
      'build_complete',
      'build',
      buildId,
      success ? 'info' : 'error',
      success
        ? `Build completed successfully in ${durationMs}ms`
        : `Build failed after ${durationMs}ms`,
      { buildId, durationMs },
      projectId
    );
  }

  public buildError(
    buildId: string,
    stepName: string,
    error: Error,
    projectId?: string
  ): void {
    this.log(
      'build',
      'build_error',
      'build',
      buildId,
      'error',
      `Build error in step '${stepName}': ${error.message}`,
      { buildId, stepName },
      projectId
    );
  }

  // Deployment logging helpers
  public deployStart(
    deploymentId: string,
    projectId: string,
    companyId: string,
    environment: string,
    strategy: string
  ): void {
    this.log(
      'deployment',
      'deploy_start',
      'deployment',
      deploymentId,
      'info',
      `Deployment to ${environment} started using ${strategy} strategy`,
      { deploymentId, environment, strategy },
      projectId,
      companyId
    );
  }

  public deployStep(
    deploymentId: string,
    stepName: string,
    message: string,
    projectId?: string
  ): void {
    this.log(
      'deployment',
      'deploy_step',
      'deployment',
      deploymentId,
      'info',
      message,
      { deploymentId },
      projectId
    );
  }

  public deployComplete(
    deploymentId: string,
    success: boolean,
    durationMs: number,
    projectId?: string
  ): void {
    this.log(
      'deployment',
      'deploy_complete',
      'deployment',
      deploymentId,
      success ? 'info' : 'error',
      success
        ? `Deployment completed successfully in ${durationMs}ms`
        : `Deployment failed after ${durationMs}ms`,
      { deploymentId, durationMs },
      projectId
    );
  }

  public healthCheck(
    deploymentId: string,
    containerId: string,
    healthy: boolean,
    responseTimeMs: number,
    projectId?: string
  ): void {
    this.log(
      'deployment',
      'health_check',
      'deployment',
      deploymentId,
      healthy ? 'info' : 'warning',
      `Health check ${healthy ? 'passed' : 'failed'} (response time: ${responseTimeMs}ms)`,
      { deploymentId, containerId },
      projectId
    );
  }

  // Container logging helpers
  public containerLog(
    deploymentId: string,
    containerId: string,
    containerName: string,
    message: string,
    severity: Severity,
    projectId?: string
  ): void {
    this.log(
      'container',
      'container_log',
      'deployment',
      deploymentId,
      severity,
      message,
      { deploymentId, containerId, containerName },
      projectId
    );
  }

  // System logging helpers
  public systemEvent(
    component: string,
    operation: string,
    message: string
  ): void {
    this.log(
      'system',
      'system_startup',
      'system',
      component,
      'info',
      message,
      { component, operation }
    );
  }

  public async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

// Singleton instance for core-api
let globalLogger: PlatformLogger | null = null;

export function initPlatformLogger(config: PlatformLoggerConfig): PlatformLogger {
  globalLogger = new PlatformLogger(config);
  return globalLogger;
}

export function getPlatformLogger(): PlatformLogger {
  if (!globalLogger) {
    throw new Error('Platform logger not initialized. Call initPlatformLogger first.');
  }
  return globalLogger;
}

// Query helpers
export interface LogQueryOptions {
  resourceType: ResourceType;
  resourceId: string;
  projectId?: string;
  eventTypes?: LogEventType[];
  severities?: Severity[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export interface LogQueryResponse {
  events: LogEvent[];
  total: number;
  limit: number;
  offset: number;
}

export async function queryLogs(
  monitoringServiceUrl: string,
  options: LogQueryOptions,
  apiKey?: string
): Promise<LogQueryResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append('resource_type', options.resourceType);
  queryParams.append('resource_id', options.resourceId);
  if (options.projectId) queryParams.append('project_id', options.projectId);
  if (options.limit) queryParams.append('limit', options.limit.toString());
  if (options.offset) queryParams.append('offset', options.offset.toString());

  const response = await fetch(
    `${monitoringServiceUrl}/api/platform-logs/query?${queryParams}`,
    {
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to query logs: ${response.statusText}`);
  }

  return response.json();
}

export function streamLogs(
  monitoringServiceUrl: string,
  resourceType: ResourceType,
  resourceId: string,
  onLog: (event: LogEvent) => void
): EventSource {
  const eventSource = new EventSource(
    `${monitoringServiceUrl}/api/platform-logs/stream/${resourceType}/${resourceId}`
  );

  eventSource.addEventListener('log', (event) => {
    const logEvent = JSON.parse(event.data);
    onLog(logEvent);
  });

  return eventSource;
}
