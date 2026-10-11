import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';

// ============================================================================
// SATELLITE MACHINE TYPES
// ============================================================================

export type SatelliteStatus =
  | 'pending_authorization'
  | 'authorized'
  | 'online'
  | 'offline'
  | 'suspended'
  | 'revoked';

export interface SatelliteCapabilities {
  proxy: {
    enabled: boolean;
    protocols: ('http' | 'socks5')[];
    maxConnections: number;
    allowedPorts?: number[];
  };
  bots: {
    enabled: boolean;
    allowedTypes: string[];
    maxConcurrent: number;
  };
  worker: {
    enabled: boolean;
    allowedTasks: string[];
    maxConcurrent: number;
  };
}

export interface SatelliteInfo {
  id: string;
  machineCode: string;
  name: string;
  status: SatelliteStatus;
  capabilities: SatelliteCapabilities;
  publicIp?: string;
  location?: string;
  countryCode?: string;
  certificateFingerprint: string;
  lastHeartbeatAt?: Date;
  connectedAt?: Date;
  tunnelConnectedAt?: Date;
  // Companies this satellite is allowed to run tasks for. undefined/empty means the
  // machine has no allow-list declared and (fail-closed) receives no company's tasks.
  allowedTenantIds?: string[];
}

// ============================================================================
// TASK TYPES
// ============================================================================

export type SatelliteTaskStatus =
  | 'queued'
  | 'sent'
  | 'acknowledged'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type SatelliteTaskType = 'proxy_request' | 'bot_execution' | 'worker_task';

export interface CreateSatelliteTaskInput {
  taskType: SatelliteTaskType;
  input: Record<string, unknown>;
  correlationId: string;
  priority?: number;
  timeoutMs?: number;
  maxRetries?: number;
  targetSatelliteId?: string; // Specific satellite, or null for auto-assign
  metadata?: Record<string, string>;
  botRunId?: string;
}

export interface SatelliteTaskInfo {
  id: string;
  taskType: SatelliteTaskType;
  status: SatelliteTaskStatus;
  priority: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  correlationId: string;
  timeoutMs: number;
  retryCount: number;
  maxRetries: number;
  queuedAt: Date;
  sentAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  satelliteId?: string;
  botRunId?: string;
}

// ============================================================================
// HEARTBEAT TYPES
// ============================================================================

export interface HeartbeatMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  availableMemoryMb: number;
  availableDiskMb: number;
}

export interface HeartbeatProxyStats {
  activeConnections: number;
  bytesSent: number;
  bytesReceived: number;
  totalRequests: number;
  failedRequests: number;
}

export interface HeartbeatData {
  satelliteId: string;
  publicIp?: string;
  metrics: HeartbeatMetrics;
  activeTasks: number;
  proxyStats?: HeartbeatProxyStats;
  uptimeSeconds: number;
  version: string;
}

// ============================================================================
// PROXY POOL TYPES
// ============================================================================

export interface ProxyInfo {
  satelliteId: string;
  satelliteName: string;
  host: string;
  port: number;
  protocol: 'socks5';
  region?: string;
  countryCode?: string;
  viaTunnel?: boolean;
}

export interface ProxyPoolOptions {
  region?: string;
  countryCode?: string;
}

export interface IProxyPool {
  getNextProxy(options?: ProxyPoolOptions): Promise<ProxyInfo | null>;
  listAvailableProxies(options?: ProxyPoolOptions): Promise<ProxyInfo[]>;
  getProxyBySatelliteId(satelliteId: string): Promise<ProxyInfo | null>;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

export interface ISatelliteRegistry {
  findByFingerprint(fingerprint: string): Promise<SatelliteInfo | null>;
  findById(id: string): Promise<SatelliteInfo | null>;
  findOnlineSatellites(): Promise<SatelliteInfo[]>;
  findByCapability(capability: keyof SatelliteCapabilities, taskType?: string): Promise<SatelliteInfo[]>;
  updateStatus(id: string, status: SatelliteStatus): Promise<void>;
  updateHeartbeat(id: string, data: HeartbeatData): Promise<void>;
  recordHeartbeat(id: string, data: HeartbeatData): Promise<void>;
  setConnected(id: string, publicIp?: string): Promise<void>;
  setDisconnected(id: string): Promise<void>;
  setTunnelConnected(id: string): Promise<void>;
  setTunnelDisconnected(id: string): Promise<void>;
  isAuthorized(fingerprint: string): Promise<boolean>;
}

export interface ITaskDispatcher {
  enqueue(task: CreateSatelliteTaskInput, tenantId: string, userId: string): Promise<string>;
  getNextTask(satelliteId: string, capabilities: SatelliteCapabilities, allowedTenantIds?: string[]): Promise<SatelliteTaskInfo | null>;
  markSent(taskId: string, satelliteId: string): Promise<void>;
  markAcknowledged(taskId: string): Promise<void>;
  markRunning(taskId: string): Promise<void>;
  markCompleted(taskId: string, output: Record<string, unknown>, durationMs: number): Promise<void>;
  markFailed(taskId: string, error: Record<string, unknown>, durationMs: number): Promise<void>;
  markCancelled(taskId: string, reason: string): Promise<void>;
  markTimeout(taskId: string): Promise<void>;
  cancelTask(taskId: string, reason: string): Promise<boolean>;
  getTaskById(taskId: string): Promise<SatelliteTaskInfo | null>;
  getPendingTasksForSatellite(satelliteId: string): Promise<SatelliteTaskInfo[]>;
  reassignOrphanedTasks(disconnectedSatelliteId: string): Promise<number>;
}

export interface ISatelliteGrpcServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getConnectedSatellites(): Map<string, ConnectedSatellite>;
  dispatchTask(satelliteId: string, task: SatelliteTaskInfo): Promise<boolean>;
  cancelTask(satelliteId: string, taskId: string, reason: string): Promise<boolean>;
  broadcastConfigUpdate(config: Partial<SatelliteCapabilities>): Promise<void>;
}

// ============================================================================
// CONNECTION TYPES
// ============================================================================

export interface ConnectedSatellite {
  id: string;
  machineCode: string;
  name: string;
  fingerprint: string;
  capabilities: SatelliteCapabilities;
  publicIp?: string;
  connectedAt: Date;
  lastHeartbeatAt: Date;
  activeTasks: Set<string>;
  allowedTenantIds?: string[];
  streamWriter?: unknown; // gRPC stream writer
}

// ============================================================================
// GRPC SERVER OPTIONS
// ============================================================================

export interface SatelliteGrpcServerOptions {
  port: number;
  host?: string;
  tlsEnabled: boolean;
  caCertPath?: string;
  serverCertPath?: string;
  serverKeyPath?: string;
  requireClientCert?: boolean;
  maxConcurrentStreams?: number;
  keepaliveTimeMs?: number;
  keepaliveTimeoutMs?: number;
  logger: Logger;
  prisma: PrismaClient;
  registry: ISatelliteRegistry;
  dispatcher: ITaskDispatcher;
}

// ============================================================================
// EVENTS
// ============================================================================

export type SatelliteEventType =
  | 'satellite:connected'
  | 'satellite:disconnected'
  | 'satellite:heartbeat'
  | 'task:assigned'
  | 'task:acknowledged'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled'
  | 'task:timeout';

export interface SatelliteEvent {
  type: SatelliteEventType;
  satelliteId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export type SatelliteEventHandler = (event: SatelliteEvent) => void | Promise<void>;
