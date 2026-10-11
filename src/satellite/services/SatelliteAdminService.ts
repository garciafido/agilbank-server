import type { PrismaClient, SatelliteMachine } from '@prisma/client';
import type { Logger } from 'pino';
import { SatelliteTokenService } from './SatelliteTokenService';
import type { SatelliteRegistry } from './SatelliteRegistry';

export type SatelliteStatus =
  | 'pending_authorization'
  | 'authorized'
  | 'online'
  | 'offline'
  | 'suspended'
  | 'revoked';

export interface AdminActionResult {
  success: boolean;
  satellite?: SatelliteMachine;
  plainToken?: string; // Only on create/rotate
  error?: string;
}

export interface CreateSatelliteInput {
  name: string;
  machineCode: string;
  satelliteType?: string;
  region?: string;
  enabled?: boolean;
  // Capabilities
  proxyEnabled?: boolean;
  proxyPort?: number;
  proxyProtocols?: string;
  botEnabled?: boolean;
  botMaxConcurrent?: number;
  workerEnabled?: boolean;
}

export class SatelliteAdminService {
  private tokenService: SatelliteTokenService;

  constructor(
    private prisma: PrismaClient,
    private logger: Logger,
    private satelliteRegistry?: SatelliteRegistry
  ) {
    this.tokenService = new SatelliteTokenService(prisma, logger);
  }

  /**
   * Create a new satellite machine and generate its initial token
   */
  async createSatellite(
    input: CreateSatelliteInput,
    createdById: string
  ): Promise<AdminActionResult> {
    try {
      // Check for duplicate machineCode
      const existing = await this.prisma.satelliteMachine.findUnique({
        where: { machineCode: input.machineCode },
      });

      if (existing) {
        return { success: false, error: 'Machine code already exists' };
      }

      // Generate token
      const { plainToken, tokenHash, lastFour } = this.tokenService.generateToken();
      const now = new Date();

      // Create satellite
      const satellite = await this.prisma.satelliteMachine.create({
        data: {
          name: input.name,
          machineCode: input.machineCode,
          satelliteType: input.satelliteType ?? 'proxy',
          region: input.region,
          enabled: input.enabled ?? true,
          status: 'pending_authorization',
          // Token
          authTokenHash: tokenHash,
          authTokenLastFour: lastFour,
          authTokenCreatedAt: now,
          // Capabilities
          proxyEnabled: input.proxyEnabled ?? false,
          proxyPort: input.proxyPort ?? 1080,
          proxyProtocols: input.proxyProtocols ?? 'socks5,http',
          botEnabled: input.botEnabled ?? false,
          botMaxConcurrent: input.botMaxConcurrent ?? 1,
          workerEnabled: input.workerEnabled ?? false,
          // Metadata
          createdAt_: now,
          createdBy_: { connect: { id: createdById } },
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: createdById } },
        },
      });

      this.logger.info(
        { satelliteId: satellite.id, machineCode: input.machineCode },
        'Satellite created'
      );

      return { success: true, satellite, plainToken };
    } catch (error) {
      this.logger.error({ error, input }, 'Error creating satellite');
      return { success: false, error: 'Failed to create satellite' };
    }
  }

  /**
   * Authorize a pending satellite
   */
  async authorizeSatellite(
    satelliteId: string,
    authorizedById: string
  ): Promise<AdminActionResult> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      if (satellite.status !== 'pending_authorization') {
        return {
          success: false,
          error: `Cannot authorize satellite in status: ${satellite.status}`,
        };
      }

      const now = new Date();
      const updated = await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          status: 'authorized',
          authorizedAt: now,
          authorizedBy: { connect: { id: authorizedById } },
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: authorizedById } },
        },
      });

      this.logger.info(
        { satelliteId, authorizedById },
        'Satellite authorized'
      );

      return { success: true, satellite: updated };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error authorizing satellite');
      return { success: false, error: 'Failed to authorize satellite' };
    }
  }

  /**
   * Suspend a satellite (temporary block)
   */
  async suspendSatellite(
    satelliteId: string,
    reason: string,
    suspendedById: string
  ): Promise<AdminActionResult> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      if (satellite.status === 'revoked') {
        return { success: false, error: 'Cannot suspend revoked satellite' };
      }

      if (satellite.status === 'suspended') {
        return { success: false, error: 'Satellite already suspended' };
      }

      const now = new Date();
      const updated = await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          status: 'suspended',
          suspendedAt: now,
          suspendedBy: { connect: { id: suspendedById } },
          suspensionReason: reason,
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: suspendedById } },
        },
      });

      // Disconnect if connected
      this.disconnectSatellite(satelliteId);

      this.logger.info(
        { satelliteId, suspendedById, reason },
        'Satellite suspended'
      );

      return { success: true, satellite: updated };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error suspending satellite');
      return { success: false, error: 'Failed to suspend satellite' };
    }
  }

  /**
   * Reactivate a suspended satellite
   */
  async reactivateSatellite(
    satelliteId: string,
    reactivatedById: string
  ): Promise<AdminActionResult> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      if (satellite.status !== 'suspended') {
        return {
          success: false,
          error: `Can only reactivate suspended satellites, current status: ${satellite.status}`,
        };
      }

      const now = new Date();
      const updated = await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          status: 'authorized',
          suspendedAt: null,
          suspendedBy: { disconnect: true },
          suspensionReason: null,
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: reactivatedById } },
        },
      });

      this.logger.info(
        { satelliteId, reactivatedById },
        'Satellite reactivated'
      );

      return { success: true, satellite: updated };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error reactivating satellite');
      return { success: false, error: 'Failed to reactivate satellite' };
    }
  }

  /**
   * Revoke a satellite (permanent block)
   */
  async revokeSatellite(
    satelliteId: string,
    reason: string,
    revokedById: string
  ): Promise<AdminActionResult> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      if (satellite.status === 'revoked') {
        return { success: false, error: 'Satellite already revoked' };
      }

      const now = new Date();
      const updated = await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          status: 'revoked',
          enabled: false,
          suspendedAt: now,
          suspendedBy: { connect: { id: revokedById } },
          suspensionReason: `[REVOKED] ${reason}`,
          // Clear token on revoke
          authTokenHash: null,
          authTokenLastFour: null,
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: revokedById } },
        },
      });

      // Disconnect if connected
      this.disconnectSatellite(satelliteId);

      this.logger.info(
        { satelliteId, revokedById, reason },
        'Satellite revoked'
      );

      return { success: true, satellite: updated };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error revoking satellite');
      return { success: false, error: 'Failed to revoke satellite' };
    }
  }

  /**
   * Toggle enabled flag (quick enable/disable without changing status)
   */
  async setEnabled(
    satelliteId: string,
    enabled: boolean,
    updatedById: string
  ): Promise<AdminActionResult> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      if (satellite.status === 'revoked') {
        return { success: false, error: 'Cannot modify revoked satellite' };
      }

      const now = new Date();
      const updated = await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          enabled,
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: updatedById } },
        },
      });

      if (!enabled) {
        this.disconnectSatellite(satelliteId);
      }

      this.logger.info(
        { satelliteId, enabled, updatedById },
        'Satellite enabled status changed'
      );

      return { success: true, satellite: updated };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error setting enabled');
      return { success: false, error: 'Failed to set enabled' };
    }
  }

  /**
   * Rotate satellite token
   */
  async rotateToken(
    satelliteId: string,
    rotatedById: string
  ): Promise<AdminActionResult> {
    const result = await this.tokenService.rotateToken(satelliteId, rotatedById);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Disconnect to force reconnection with new token
    this.disconnectSatellite(satelliteId);

    const satellite = await this.prisma.satelliteMachine.findUnique({
      where: { id: satelliteId },
    });

    return { success: true, satellite: satellite!, plainToken: result.plainToken };
  }

  /**
   * Get satellite info (with masked token)
   */
  async getSatelliteInfo(satelliteId: string): Promise<AdminActionResult> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
        include: {
          authorizedBy: { select: { id: true, email: true, name: true } },
          suspendedBy: { select: { id: true, email: true, name: true } },
        },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      return { success: true, satellite };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error getting satellite info');
      return { success: false, error: 'Failed to get satellite info' };
    }
  }

  /**
   * Helper to disconnect a satellite via registry
   */
  private disconnectSatellite(satelliteId: string): void {
    if (this.satelliteRegistry) {
      try {
        this.satelliteRegistry.forceDisconnect(satelliteId);
      } catch {
        // Registry might not have this satellite connected
      }
    }
  }
}
