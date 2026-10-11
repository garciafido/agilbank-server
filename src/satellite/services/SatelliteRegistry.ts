import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type {
  ISatelliteRegistry,
  SatelliteInfo,
  SatelliteStatus,
  SatelliteCapabilities,
  HeartbeatData,
} from '../types';

const DEFAULT_CAPABILITIES: SatelliteCapabilities = {
  proxy: { enabled: false, protocols: [], maxConnections: 0 },
  bots: { enabled: false, allowedTypes: [], maxConcurrent: 0 },
  worker: { enabled: false, allowedTasks: [], maxConcurrent: 0 },
};

export class SatelliteRegistry implements ISatelliteRegistry {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  async findByFingerprint(fingerprint: string): Promise<SatelliteInfo | null> {
    const satellite = await this.prisma.satelliteMachine.findFirst({
      where: { certificateFingerprint: fingerprint },
    });

    if (!satellite) return null;

    return this.mapToSatelliteInfo(satellite);
  }

  async findById(id: string): Promise<SatelliteInfo | null> {
    const satellite = await this.prisma.satelliteMachine.findUnique({
      where: { id },
    });

    if (!satellite) return null;

    return this.mapToSatelliteInfo(satellite);
  }

  async findOnlineSatellites(): Promise<SatelliteInfo[]> {
    const satellites = await this.prisma.satelliteMachine.findMany({
      where: { status: 'online' },
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    return satellites.map((s) => this.mapToSatelliteInfo(s));
  }

  async findByCapability(
    capability: keyof SatelliteCapabilities,
    taskType?: string
  ): Promise<SatelliteInfo[]> {
    const satellites = await this.prisma.satelliteMachine.findMany({
      where: {
        status: 'online',
      },
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    return satellites
      .map((s) => this.mapToSatelliteInfo(s))
      .filter((s) => {
        const cap = s.capabilities[capability];
        if (!cap || !cap.enabled) return false;

        if (taskType) {
          if (capability === 'bots') {
            return s.capabilities.bots.allowedTypes.includes(taskType);
          }
          if (capability === 'worker') {
            return s.capabilities.worker.allowedTasks.includes(taskType);
          }
        }

        return true;
      });
  }

  async updateStatus(id: string, status: SatelliteStatus): Promise<void> {
    this.logger.info({ satelliteId: id, status }, 'Updating satellite status');

    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        status,
        ...(status === 'suspended' && { suspendedAt: new Date() }),
      },
    });
  }

  async updateHeartbeat(id: string, data: HeartbeatData): Promise<void> {
    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        lastHeartbeatAt: new Date(),
        lastHeartbeatMetrics: {
          cpuUsage: data.metrics.cpuUsage,
          memoryUsage: data.metrics.memoryUsage,
          diskUsage: data.metrics.diskUsage,
          activeTasks: data.activeTasks,
          proxyStats: data.proxyStats,
          uptimeSeconds: data.uptimeSeconds,
          version: data.version,
        },
        ...(data.publicIp && { publicIp: data.publicIp }),
      },
    });
  }

  async recordHeartbeat(id: string, data: HeartbeatData): Promise<void> {
    const now = new Date();

    // Update satellite and record heartbeat in parallel
    await Promise.all([
      this.updateHeartbeat(id, data),
      this.prisma.satelliteHeartbeat.create({
        data: {
          version_: '0',
          createdAt_: now,
          lastUpdatedAt_: now,
          createdBy_: { connect: { id: 'SYSTEM' } },
          tenant_: { connect: { id: "AGILMIND" } },
          satelliteMachine: { connect: { id } },
          receivedAt: now,
          publicIp: data.publicIp,
          cpuUsage: data.metrics.cpuUsage,
          memoryUsage: data.metrics.memoryUsage,
          diskUsage: data.metrics.diskUsage,
          activeTasksCount: data.activeTasks,
          proxyStats: data.proxyStats,
          systemInfo: {
            uptimeSeconds: data.uptimeSeconds,
            version: data.version,
          },
        },
      }),
    ]);
  }

  async setConnected(id: string, publicIp?: string): Promise<void> {
    this.logger.info({ satelliteId: id, publicIp }, 'Satellite connected');

    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        status: 'online',
        connectedAt: new Date(),
        disconnectedAt: null,
        ...(publicIp && { publicIp }),
      },
    });
  }

  async setDisconnected(id: string): Promise<void> {
    this.logger.info({ satelliteId: id }, 'Satellite disconnected');

    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        status: 'offline',
        disconnectedAt: new Date(),
        tunnelConnectedAt: null, // Clear tunnel on disconnect
      },
    });
  }

  async setTunnelConnected(id: string): Promise<void> {
    this.logger.info({ satelliteId: id }, 'Satellite tunnel connected');

    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        tunnelConnectedAt: new Date(),
      },
    });
  }

  async setTunnelDisconnected(id: string): Promise<void> {
    this.logger.info({ satelliteId: id }, 'Satellite tunnel disconnected');

    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        tunnelConnectedAt: null,
      },
    });
  }

  async isAuthorized(fingerprint: string): Promise<boolean> {
    const satellite = await this.prisma.satelliteMachine.findFirst({
      where: {
        certificateFingerprint: fingerprint,
        status: { in: ['authorized', 'online', 'offline'] },
      },
      select: { id: true },
    });

    return satellite !== null;
  }

  // ============================================================================
  // ADMIN OPERATIONS
  // ============================================================================

  async authorize(
    id: string,
    authorizedById: string,
    tenantId: string
  ): Promise<void> {
    this.logger.info({ satelliteId: id, authorizedById }, 'Authorizing satellite');

    const now = new Date();
    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        status: 'authorized',
        authorizedAt: now,
        authorizedBy: { connect: { id: authorizedById } },
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: authorizedById } },
      },
    });
  }

  async suspend(
    id: string,
    suspendedById: string,
    reason: string
  ): Promise<void> {
    this.logger.info({ satelliteId: id, suspendedById, reason }, 'Suspending satellite');

    const now = new Date();
    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        status: 'suspended',
        suspendedAt: now,
        suspendedBy: { connect: { id: suspendedById } },
        suspensionReason: reason,
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: suspendedById } },
      },
    });
  }

  async revoke(id: string, revokedById: string): Promise<void> {
    this.logger.info({ satelliteId: id, revokedById }, 'Revoking satellite');

    const now = new Date();
    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        status: 'revoked',
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: revokedById } },
      },
    });
  }

  async updateCapabilities(
    id: string,
    capabilities: SatelliteCapabilities,
    updatedById: string
  ): Promise<void> {
    this.logger.info({ satelliteId: id, capabilities }, 'Updating satellite capabilities');

    const now = new Date();
    await this.prisma.satelliteMachine.update({
      where: { id },
      data: {
        proxyEnabled: capabilities.proxy.enabled,
        proxyPort: capabilities.proxy.allowedPorts?.[0] || null,
        proxyProtocols: capabilities.proxy.protocols.join(','),
        botEnabled: capabilities.bots.enabled,
        botMaxConcurrent: capabilities.bots.maxConcurrent,
        workerEnabled: capabilities.worker.enabled,
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: updatedById } },
      },
    });
  }

  // ============================================================================
  // FORCE DISCONNECT
  // ============================================================================

  private disconnectHandler: ((satelliteId: string) => void) | null = null;

  /**
   * Set handler for force disconnect (called by SatelliteGrpcServer)
   */
  setDisconnectHandler(handler: (satelliteId: string) => void): void {
    this.disconnectHandler = handler;
  }

  /**
   * Force disconnect a satellite (closes its gRPC stream)
   */
  forceDisconnect(satelliteId: string): void {
    if (this.disconnectHandler) {
      this.disconnectHandler(satelliteId);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private mapToSatelliteInfo(satellite: {
    id: string;
    machineCode: string;
    name: string;
    status: string;
    proxyEnabled: boolean;
    proxyPort: number | null;
    proxyProtocols: string | null;
    botEnabled: boolean;
    botMaxConcurrent: number | null;
    workerEnabled: boolean;
    publicIp: string | null;
    location: string | null;
    countryCode: string | null;
    certificateFingerprint: string;
    allowedTenantIds: string | null;
    lastHeartbeatAt: Date | null;
    connectedAt: Date | null;
    tunnelConnectedAt: Date | null;
  }): SatelliteInfo {
    const capabilities: SatelliteCapabilities = {
      proxy: {
        enabled: satellite.proxyEnabled,
        protocols: (satellite.proxyProtocols?.split(',') || []) as ('http' | 'socks5')[],
        maxConnections: 100,
        allowedPorts: satellite.proxyPort ? [satellite.proxyPort] : undefined,
      },
      bots: {
        enabled: satellite.botEnabled,
        allowedTypes: [],
        maxConcurrent: satellite.botMaxConcurrent || 0,
      },
      worker: {
        enabled: satellite.workerEnabled,
        allowedTasks: [],
        maxConcurrent: 0,
      },
    };

    return {
      id: satellite.id,
      machineCode: satellite.machineCode,
      name: satellite.name,
      status: satellite.status as SatelliteStatus,
      capabilities,
      publicIp: satellite.publicIp || undefined,
      location: satellite.location || undefined,
      countryCode: satellite.countryCode || undefined,
      certificateFingerprint: satellite.certificateFingerprint,
      allowedTenantIds: satellite.allowedTenantIds
        ? satellite.allowedTenantIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      lastHeartbeatAt: satellite.lastHeartbeatAt || undefined,
      connectedAt: satellite.connectedAt || undefined,
      tunnelConnectedAt: satellite.tunnelConnectedAt || undefined,
    };
  }
}
