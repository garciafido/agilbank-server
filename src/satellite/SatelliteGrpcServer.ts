import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import type {
  ISatelliteGrpcServer,
  ISatelliteRegistry,
  ITaskDispatcher,
  SatelliteGrpcServerOptions,
  ConnectedSatellite,
  SatelliteTaskInfo,
  SatelliteCapabilities,
  HeartbeatData,
  SatelliteEventHandler,
  SatelliteEvent,
} from './types';
import { SatelliteTokenService } from './services/SatelliteTokenService';

// Proto definitions path
const PROTO_PATH = path.join(__dirname, 'proto', 'satellite.proto');

// Load proto definitions
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const satelliteProto = grpc.loadPackageDefinition(packageDefinition).satellite as {
  SatelliteService: grpc.ServiceClientConstructor;
};

export class SatelliteGrpcServer implements ISatelliteGrpcServer {
  private server: grpc.Server | null = null;
  private running = false;
  private connectedSatellites = new Map<string, ConnectedSatellite>();
  private eventHandlers: SatelliteEventHandler[] = [];
  private taskTimeoutCheckers = new Map<string, NodeJS.Timeout>();

  private readonly options: Required<SatelliteGrpcServerOptions>;
  private readonly logger: Logger;
  private readonly registry: ISatelliteRegistry;
  private readonly dispatcher: ITaskDispatcher;
  private readonly tokenService: SatelliteTokenService;

  constructor(options: SatelliteGrpcServerOptions) {
    this.options = {
      host: '0.0.0.0',
      requireClientCert: true,
      maxConcurrentStreams: 100,
      keepaliveTimeMs: 30000,
      keepaliveTimeoutMs: 10000,
      ...options,
    } as Required<SatelliteGrpcServerOptions>;

    this.logger = options.logger.child({ module: 'SatelliteGrpcServer' });
    this.registry = options.registry;
    this.dispatcher = options.dispatcher;
    this.tokenService = new SatelliteTokenService(options.prisma, this.logger);

    // Register force disconnect handler with registry
    if (typeof (this.registry as { setDisconnectHandler?: (h: (id: string) => void) => void }).setDisconnectHandler === 'function') {
      (this.registry as { setDisconnectHandler: (h: (id: string) => void) => void }).setDisconnectHandler(
        (satelliteId: string) => this.forceDisconnectSatellite(satelliteId)
      );
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('gRPC server is already running');
    }

    this.logger.info(
      { port: this.options.port, tlsEnabled: this.options.tlsEnabled },
      'Starting Satellite gRPC server'
    );

    this.server = new grpc.Server({
      'grpc.max_concurrent_streams': this.options.maxConcurrentStreams,
      'grpc.keepalive_time_ms': this.options.keepaliveTimeMs,
      'grpc.keepalive_timeout_ms': this.options.keepaliveTimeoutMs,
    });

    // Add service implementation
    this.server.addService(
      (satelliteProto.SatelliteService as unknown as { service: grpc.ServiceDefinition }).service,
      {
        TaskStream: this.handleTaskStream.bind(this),
        Heartbeat: this.handleHeartbeat.bind(this),
        GetConfig: this.handleGetConfig.bind(this),
        AcknowledgeTask: this.handleAcknowledgeTask.bind(this),
      }
    );

    // Configure credentials
    const credentials = this.createServerCredentials();

    // Bind and start
    return new Promise((resolve, reject) => {
      this.server!.bindAsync(
        `${this.options.host}:${this.options.port}`,
        credentials,
        (error, port) => {
          if (error) {
            this.logger.error({ error }, 'Failed to bind gRPC server');
            reject(error);
            return;
          }

          this.running = true;
          this.logger.info({ port }, 'Satellite gRPC server started');
          resolve();
        }
      );
    });
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    this.logger.info('Stopping Satellite gRPC server');

    // Clear all timeout checkers
    for (const [taskId, timeout] of this.taskTimeoutCheckers) {
      clearTimeout(timeout);
      this.taskTimeoutCheckers.delete(taskId);
    }

    // Mark all connected satellites as disconnected
    for (const [satelliteId] of this.connectedSatellites) {
      await this.handleSatelliteDisconnect(satelliteId);
    }

    return new Promise((resolve) => {
      this.server!.tryShutdown(() => {
        this.running = false;
        this.server = null;
        this.logger.info('Satellite gRPC server stopped');
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getConnectedSatellites(): Map<string, ConnectedSatellite> {
    return new Map(this.connectedSatellites);
  }

  async dispatchTask(satelliteId: string, task: SatelliteTaskInfo): Promise<boolean> {
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite || !satellite.streamWriter) {
      this.logger.warn({ satelliteId, taskId: task.id }, 'Cannot dispatch task: satellite not connected');
      return false;
    }

    const message = {
      taskAssign: {
        taskId: task.id,
        taskType: task.taskType,
        input: Buffer.from(JSON.stringify(task.input)),
        timeoutMs: task.timeoutMs,
        priority: task.priority,
        correlationId: task.correlationId,
        metadata: {},
      },
    };

    try {
      (satellite.streamWriter as grpc.ServerWritableStream<unknown, unknown>).write(message);
      await this.dispatcher.markSent(task.id, satelliteId);
      satellite.activeTasks.add(task.id);

      // Start timeout checker
      this.startTaskTimeoutChecker(task.id, task.timeoutMs);

      this.emitEvent({
        type: 'task:assigned',
        satelliteId,
        timestamp: new Date(),
        data: { taskId: task.id, taskType: task.taskType },
      });

      return true;
    } catch (error) {
      this.logger.error({ error, satelliteId, taskId: task.id }, 'Failed to dispatch task');
      return false;
    }
  }

  async cancelTask(satelliteId: string, taskId: string, reason: string): Promise<boolean> {
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite || !satellite.streamWriter) {
      return false;
    }

    const message = {
      taskCancel: {
        taskId,
        reason,
      },
    };

    try {
      (satellite.streamWriter as grpc.ServerWritableStream<unknown, unknown>).write(message);

      this.emitEvent({
        type: 'task:cancelled',
        satelliteId,
        timestamp: new Date(),
        data: { taskId, reason },
      });

      return true;
    } catch (error) {
      this.logger.error({ error, satelliteId, taskId }, 'Failed to cancel task');
      return false;
    }
  }

  async broadcastConfigUpdate(config: Partial<SatelliteCapabilities>): Promise<void> {
    const message = {
      configUpdate: {
        capabilitiesConfig: Buffer.from(JSON.stringify(config)),
        reconnectRequired: false,
      },
    };

    for (const [satelliteId, satellite] of this.connectedSatellites) {
      if (satellite.streamWriter) {
        try {
          (satellite.streamWriter as grpc.ServerWritableStream<unknown, unknown>).write(message);
        } catch (error) {
          this.logger.error({ error, satelliteId }, 'Failed to broadcast config update');
        }
      }
    }
  }

  onEvent(handler: SatelliteEventHandler): void {
    this.eventHandlers.push(handler);
  }

  // ============================================================================
  // gRPC HANDLERS
  // ============================================================================

  private handleTaskStream(
    call: grpc.ServerDuplexStream<
      { satelliteId: string; heartbeat?: unknown; taskResult?: unknown; taskProgress?: unknown },
      unknown
    >
  ): void {
    let satelliteId: string | null = null;

    // Extract peer info for logging
    const peer = call.getPeer();

    // Extract token from metadata
    const authToken = call.metadata.get('x-satellite-token')[0] as string | undefined;

    // The satellite token is mandatory. The claimed satelliteId is self-asserted in the
    // first stream message, and mTLS cannot bind it to an identity (grpc-js does not
    // expose the peer certificate), so the token is the only proof that the caller owns
    // the id it claims. Reject before wiring any handler: a tokenless stream must not be
    // able to register or emit.
    if (!authToken) {
      this.logger.warn({ peer }, 'Satellite stream without auth token - rejected');
      call.destroy(new Error('Authentication required'));
      return;
    }

    // Note: grpc-js does not expose getPeerCertificate() - see https://github.com/grpc/grpc-node/issues/2730
    // When TLS + requireClientCert is enabled, gRPC validates the client certificate automatically.
    // If the certificate is invalid or not signed by the CA, the connection would be rejected
    // at the TLS handshake level before reaching this code.
    if (this.options.tlsEnabled && this.options.requireClientCert) {
      this.logger.debug({ peer }, 'mTLS enabled - client certificate validated by gRPC TLS layer');
    }

    call.on('data', async (message) => {
      try {
        if (!satelliteId && message.satelliteId) {
          satelliteId = message.satelliteId;

          // ================================================================
          // STEP 1: Validate token, bound to the claimed satellite id
          // ================================================================
          const tokenValidation = await this.tokenService.validateToken(authToken, satelliteId);
          if (!tokenValidation.valid) {
            this.logger.warn(
              { satelliteId, error: tokenValidation.error },
              'Token validation failed'
            );
            call.destroy(new Error(`Authentication failed: ${tokenValidation.error}`));
            return;
          }

          // Verify token belongs to this satellite
          if (tokenValidation.satelliteId !== satelliteId) {
            this.logger.warn(
              { claimedSatelliteId: satelliteId, tokenSatelliteId: tokenValidation.satelliteId },
              'Token satellite mismatch'
            );
            call.destroy(new Error('Token does not match satellite ID'));
            return;
          }

          // Check enabled flag
          if (!tokenValidation.enabled) {
            this.logger.warn({ satelliteId }, 'Satellite is disabled');
            call.destroy(new Error('Satellite is disabled'));
            return;
          }

          this.logger.debug({ satelliteId }, 'Token validated successfully');

          // ================================================================
          // STEP 2: Validate satellite exists and status
          // ================================================================
          const satellite = await this.registry.findById(satelliteId);
          if (!satellite) {
            this.logger.warn({ satelliteId }, 'Unknown satellite attempted to connect');
            call.destroy(new Error('Unknown satellite'));
            return;
          }

          // Token validation already checks status; findById re-reads the full record
          // (needed for handleSatelliteConnect) so re-assert it here.
          if (!['authorized', 'online', 'offline'].includes(satellite.status)) {
            this.logger.warn({ satelliteId, status: satellite.status }, 'Satellite not authorized');
            call.destroy(new Error('Satellite not authorized'));
            return;
          }

          // Extract public IP from peer connection (format: "ipv4:IP:PORT" or "ipv6:[IP]:PORT")
          const peerIp = this.extractIpFromPeer(peer);

          // Register connected satellite with peer IP
          await this.handleSatelliteConnect({ ...satellite, publicIp: peerIp || satellite.publicIp }, call);
        }

        if (message.heartbeat) {
          await this.processHeartbeatData(satelliteId!, message.heartbeat);
        }

        if (message.taskResult) {
          await this.processTaskResult(satelliteId!, message.taskResult);
        }

        if (message.taskProgress) {
          await this.processTaskProgress(satelliteId!, message.taskProgress);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : undefined;
        this.logger.error({ error: { message: errMsg, stack: errStack }, satelliteId }, 'Error processing stream message');
      }
    });

    call.on('end', () => {
      if (satelliteId) {
        this.handleSatelliteDisconnect(satelliteId);
      }
      call.end();
    });

    call.on('error', (error) => {
      this.logger.error({ error, satelliteId }, 'Stream error');
      if (satelliteId) {
        this.handleSatelliteDisconnect(satelliteId);
      }
    });
  }

  /**
   * Authenticate a unary RPC. Unary calls carry no stream identity, so without this
   * any caller could name any satelliteId in the request body. The token in metadata
   * must be valid and bound to that satelliteId. Returns an error message to hand back
   * as UNAUTHENTICATED, or null when the token checks out.
   */
  private async authenticateUnaryCall(
    call: grpc.ServerUnaryCall<{ satelliteId: string }, unknown>,
    satelliteId: string
  ): Promise<string | null> {
    const authToken = call.metadata.get('x-satellite-token')[0] as string | undefined;
    if (!authToken) {
      return 'Authentication required';
    }
    const validation = await this.tokenService.validateToken(authToken, satelliteId);
    if (!validation.valid) {
      return validation.error || 'Authentication failed';
    }
    if (validation.satelliteId !== satelliteId) {
      return 'Token does not match satellite ID';
    }
    if (!validation.enabled) {
      return 'Satellite is disabled';
    }
    return null;
  }

  private async handleHeartbeat(
    call: grpc.ServerUnaryCall<{ satelliteId: string; data: unknown }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): Promise<void> {
    const { satelliteId, data } = call.request;

    const authError = await this.authenticateUnaryCall(call, satelliteId);
    if (authError) {
      this.logger.warn({ satelliteId, error: authError }, 'Heartbeat authentication failed');
      callback({ code: grpc.status.UNAUTHENTICATED, message: authError });
      return;
    }

    try {
      const satellite = this.connectedSatellites.get(satelliteId);
      if (!satellite) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: 'Satellite not connected',
        });
        return;
      }

      await this.processHeartbeatData(satelliteId, data);

      // Get pending tasks for this satellite
      const pendingTasks = await this.dispatcher.getPendingTasksForSatellite(satelliteId);

      callback(null, {
        acknowledged: true,
        serverTime: Date.now(),
        heartbeatIntervalMs: 30000,
        pendingTasks: pendingTasks.map((t) => ({
          taskId: t.id,
          taskType: t.taskType,
          priority: t.priority,
        })),
      });
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error handling heartbeat');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal error',
      });
    }
  }

  private async handleGetConfig(
    call: grpc.ServerUnaryCall<{ satelliteId: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): Promise<void> {
    const { satelliteId } = call.request;

    const authError = await this.authenticateUnaryCall(call, satelliteId);
    if (authError) {
      this.logger.warn({ satelliteId, error: authError }, 'GetConfig authentication failed');
      callback({ code: grpc.status.UNAUTHENTICATED, message: authError });
      return;
    }

    try {
      const satellite = await this.registry.findById(satelliteId);
      if (!satellite) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: 'Satellite not found',
        });
        return;
      }

      callback(null, {
        capabilitiesConfig: Buffer.from(JSON.stringify(satellite.capabilities)),
        maxConcurrentTasks: satellite.capabilities.bots.maxConcurrent + satellite.capabilities.worker.maxConcurrent,
        heartbeatIntervalMs: 30000,
        taskTimeoutMs: 60000,
        proxyConfig: Buffer.from(JSON.stringify(satellite.capabilities.proxy)),
      });
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error getting config');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal error',
      });
    }
  }

  private async handleAcknowledgeTask(
    call: grpc.ServerUnaryCall<{ satelliteId: string; taskId: string; accepted: boolean; rejectionReason?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): Promise<void> {
    const { satelliteId, taskId, accepted, rejectionReason } = call.request;

    const authError = await this.authenticateUnaryCall(call, satelliteId);
    if (authError) {
      this.logger.warn({ satelliteId, taskId, error: authError }, 'AcknowledgeTask authentication failed');
      callback({ code: grpc.status.UNAUTHENTICATED, message: authError });
      return;
    }

    // Ownership: a satellite may only acknowledge a task the server dispatched to it.
    // activeTasks holds exactly what was sent to this peer in this session, so a taskId
    // that is not there belongs to another satellite (or was never dispatched).
    const ackSatellite = this.connectedSatellites.get(satelliteId);
    if (!ackSatellite || !ackSatellite.activeTasks.has(taskId)) {
      this.logger.warn({ satelliteId, taskId }, 'Acknowledge for task not assigned to this satellite - ignoring');
      callback({ code: grpc.status.NOT_FOUND, message: 'Task not assigned to this satellite' });
      return;
    }

    try {
      if (accepted) {
        await this.dispatcher.markAcknowledged(taskId);
        await this.dispatcher.markRunning(taskId);

        this.emitEvent({
          type: 'task:acknowledged',
          satelliteId,
          timestamp: new Date(),
          data: { taskId },
        });
      } else {
        // Task rejected, requeue for another satellite
        await this.dispatcher.markFailed(taskId, { rejected: true, reason: rejectionReason }, 0);
        ackSatellite.activeTasks.delete(taskId);
      }

      callback(null, { success: true, message: 'OK' });
    } catch (error) {
      this.logger.error({ error, satelliteId, taskId }, 'Error acknowledging task');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal error',
      });
    }
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  private createServerCredentials(): grpc.ServerCredentials {
    if (!this.options.tlsEnabled) {
      this.logger.warn('TLS disabled - using insecure credentials');
      return grpc.ServerCredentials.createInsecure();
    }

    if (!this.options.caCertPath || !this.options.serverCertPath || !this.options.serverKeyPath) {
      throw new Error('TLS enabled but certificate paths not provided');
    }

    const caCert = fs.readFileSync(this.options.caCertPath);
    const serverCert = fs.readFileSync(this.options.serverCertPath);
    const serverKey = fs.readFileSync(this.options.serverKeyPath);

    return grpc.ServerCredentials.createSsl(
      caCert,
      [{ cert_chain: serverCert, private_key: serverKey }],
      this.options.requireClientCert
    );
  }

  // Note: getCertificateFingerprint removed - grpc-js doesn't expose peer certificates
  // See: https://github.com/grpc/grpc-node/issues/2730

  private extractIpFromPeer(peer: string): string | undefined {
    // gRPC peer format: "ipv4:IP:PORT" or "ipv6:[IP]:PORT"
    const ipv4Match = peer.match(/^ipv4:([^:]+):\d+$/);
    if (ipv4Match) {
      return ipv4Match[1];
    }
    const ipv6Match = peer.match(/^ipv6:\[([^\]]+)\]:\d+$/);
    if (ipv6Match) {
      return ipv6Match[1];
    }
    // Fallback: try to extract any IP-like pattern
    const fallbackMatch = peer.match(/(\d+\.\d+\.\d+\.\d+)/);
    return fallbackMatch?.[1];
  }

  private async handleSatelliteConnect(
    satellite: {
      id: string;
      machineCode: string;
      name: string;
      certificateFingerprint: string;
      capabilities: SatelliteCapabilities;
      publicIp?: string;
      allowedTenantIds?: string[];
    },
    stream: grpc.ServerDuplexStream<unknown, unknown>
  ): Promise<void> {
    this.logger.info({ satelliteId: satellite.id, name: satellite.name }, 'Satellite connected');

    this.connectedSatellites.set(satellite.id, {
      id: satellite.id,
      machineCode: satellite.machineCode,
      name: satellite.name,
      fingerprint: satellite.certificateFingerprint,
      capabilities: satellite.capabilities,
      publicIp: satellite.publicIp,
      connectedAt: new Date(),
      lastHeartbeatAt: new Date(),
      activeTasks: new Set(),
      allowedTenantIds: satellite.allowedTenantIds,
      streamWriter: stream,
    });

    await this.registry.setConnected(satellite.id, satellite.publicIp);

    this.emitEvent({
      type: 'satellite:connected',
      satelliteId: satellite.id,
      timestamp: new Date(),
      data: { name: satellite.name, publicIp: satellite.publicIp },
    });

    // Re-hydrate in-memory ownership from the DB. Tasks already dispatched to this
    // satellite (sent/acknowledged/running) survive a server restart in the DB but not
    // in the activeTasks set, which starts empty on every connect. Without this, after a
    // non-graceful restart the result or ack for an in-flight task would fail the
    // ownership check and the task would be stuck forever (no reassign runs on crash,
    // getNextTask only re-dispatches 'queued'). This restores exactly the tasks the DB
    // already attributes to this satellite, so it never widens ownership.
    const inFlight = await this.dispatcher.getPendingTasksForSatellite(satellite.id);
    const connected = this.connectedSatellites.get(satellite.id);
    if (connected) {
      for (const task of inFlight) {
        connected.activeTasks.add(task.id);
      }
    }

    // Dispatch any pending tasks for this satellite
    await this.dispatchPendingTasks(satellite.id);
  }

  private async handleSatelliteDisconnect(satelliteId: string): Promise<void> {
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite) return;

    this.logger.info({ satelliteId, name: satellite.name }, 'Satellite disconnected');

    // Reassign orphaned tasks
    const reassignedCount = await this.dispatcher.reassignOrphanedTasks(satelliteId);
    if (reassignedCount > 0) {
      this.logger.info({ satelliteId, reassignedCount }, 'Reassigned orphaned tasks');
    }

    // Clear timeout checkers for this satellite's tasks
    for (const taskId of satellite.activeTasks) {
      const timeout = this.taskTimeoutCheckers.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeoutCheckers.delete(taskId);
      }
    }

    this.connectedSatellites.delete(satelliteId);
    await this.registry.setDisconnected(satelliteId);

    this.emitEvent({
      type: 'satellite:disconnected',
      satelliteId,
      timestamp: new Date(),
      data: { name: satellite.name },
    });
  }

  private async processHeartbeatData(satelliteId: string, data: unknown): Promise<void> {
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite) return;

    satellite.lastHeartbeatAt = new Date();

    const heartbeatData: HeartbeatData = {
      satelliteId,
      publicIp: satellite.publicIp || (data as { publicIp?: string }).publicIp,
      metrics: {
        cpuUsage: (data as { metrics?: { cpuUsage?: number } }).metrics?.cpuUsage || 0,
        memoryUsage: (data as { metrics?: { memoryUsage?: number } }).metrics?.memoryUsage || 0,
        diskUsage: (data as { metrics?: { diskUsage?: number } }).metrics?.diskUsage || 0,
        availableMemoryMb: (data as { metrics?: { availableMemoryMb?: number } }).metrics?.availableMemoryMb || 0,
        availableDiskMb: (data as { metrics?: { availableDiskMb?: number } }).metrics?.availableDiskMb || 0,
      },
      activeTasks: (data as { activeTasks?: number }).activeTasks || 0,
      proxyStats: (data as { proxyStats?: HeartbeatData['proxyStats'] }).proxyStats,
      uptimeSeconds: (data as { uptimeSeconds?: number }).uptimeSeconds || 0,
      version: (data as { version?: string }).version || 'unknown',
    };

    await this.registry.recordHeartbeat(satelliteId, heartbeatData);

    this.emitEvent({
      type: 'satellite:heartbeat',
      satelliteId,
      timestamp: new Date(),
      data: heartbeatData,
    });
  }

  private async processTaskResult(
    satelliteId: string,
    result: { taskId: string; status: string; output?: Buffer; errorMessage?: string; errorType?: string; durationMs?: number }
  ): Promise<void> {
    const { taskId, status, output, errorMessage, errorType, durationMs = 0 } = result;

    // Ownership: only accept a result for a task this satellite is actually running.
    // Without this, a connected satellite could report completion/failure for another
    // satellite's taskId. activeTasks is the authoritative set of what was dispatched
    // to this peer in this session.
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite || !satellite.activeTasks.has(taskId)) {
      this.logger.warn({ satelliteId, taskId }, 'Task result for task not assigned to this satellite - ignoring');
      return;
    }
    satellite.activeTasks.delete(taskId);

    // Clear timeout checker
    const timeout = this.taskTimeoutCheckers.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeoutCheckers.delete(taskId);
    }

    const outputData = output ? JSON.parse(output.toString()) : {};

    switch (status) {
      case 'TASK_STATUS_COMPLETED':
        await this.dispatcher.markCompleted(taskId, outputData, durationMs);
        this.emitEvent({
          type: 'task:completed',
          satelliteId,
          timestamp: new Date(),
          data: { taskId, durationMs },
        });
        break;

      case 'TASK_STATUS_FAILED':
        await this.dispatcher.markFailed(
          taskId,
          { message: errorMessage, type: errorType },
          durationMs
        );
        this.emitEvent({
          type: 'task:failed',
          satelliteId,
          timestamp: new Date(),
          data: { taskId, errorMessage, errorType, durationMs },
        });
        break;

      case 'TASK_STATUS_CANCELLED':
        await this.dispatcher.markCancelled(taskId, errorMessage || 'Cancelled by satellite');
        break;

      case 'TASK_STATUS_TIMEOUT':
        await this.dispatcher.markTimeout(taskId);
        this.emitEvent({
          type: 'task:timeout',
          satelliteId,
          timestamp: new Date(),
          data: { taskId },
        });
        break;
    }
  }

  private async processTaskProgress(
    satelliteId: string,
    progress: { taskId: string; progressPercent: number; currentStep?: string; message?: string }
  ): Promise<void> {
    // Ownership: only surface progress for a task this satellite is actually running.
    // Same guard as processTaskResult/handleAcknowledgeTask, so a connected satellite
    // cannot inject progress events attributed to another satellite's taskId.
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite || !satellite.activeTasks.has(progress.taskId)) {
      this.logger.warn({ satelliteId, taskId: progress.taskId }, 'Task progress for task not assigned to this satellite - ignoring');
      return;
    }

    this.emitEvent({
      type: 'task:progress',
      satelliteId,
      timestamp: new Date(),
      data: progress,
    });
  }

  private async dispatchPendingTasks(satelliteId: string): Promise<void> {
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite) return;

    const maxTasks = satellite.capabilities.bots.maxConcurrent + satellite.capabilities.worker.maxConcurrent;
    const currentTasks = satellite.activeTasks.size;

    if (currentTasks >= maxTasks) return;

    const availableSlots = maxTasks - currentTasks;

    for (let i = 0; i < availableSlots; i++) {
      const task = await this.dispatcher.getNextTask(satelliteId, satellite.capabilities, satellite.allowedTenantIds);
      if (!task) break;

      await this.dispatchTask(satelliteId, task);
    }
  }

  private startTaskTimeoutChecker(taskId: string, timeoutMs: number): void {
    const timeout = setTimeout(async () => {
      this.logger.warn({ taskId, timeoutMs }, 'Task timeout triggered');
      await this.dispatcher.markTimeout(taskId);
      this.taskTimeoutCheckers.delete(taskId);
    }, timeoutMs);

    this.taskTimeoutCheckers.set(taskId, timeout);
  }

  private emitEvent(event: SatelliteEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.error({ error, event }, 'Error in event handler');
      }
    }
  }

  // ============================================================================
  // ADMIN OPERATIONS
  // ============================================================================

  /**
   * Force disconnect a satellite (used by admin actions like suspend/revoke)
   */
  forceDisconnectSatellite(satelliteId: string): void {
    const satellite = this.connectedSatellites.get(satelliteId);
    if (!satellite) {
      this.logger.debug({ satelliteId }, 'Satellite not connected, nothing to disconnect');
      return;
    }

    this.logger.info({ satelliteId, name: satellite.name }, 'Force disconnecting satellite');

    // Close the stream
    if (satellite.streamWriter) {
      try {
        (satellite.streamWriter as grpc.ServerDuplexStream<unknown, unknown>).destroy(
          new Error('Disconnected by administrator')
        );
      } catch (error) {
        this.logger.error({ error, satelliteId }, 'Error closing stream');
      }
    }

    // Cleanup will be handled by the 'error' event handler
  }

  /**
   * Check if a satellite is currently connected
   */
  isSatelliteConnected(satelliteId: string): boolean {
    return this.connectedSatellites.has(satelliteId);
  }

  /**
   * Get connection info for a satellite
   */
  getSatelliteConnectionInfo(satelliteId: string): ConnectedSatellite | undefined {
    return this.connectedSatellites.get(satelliteId);
  }
}
