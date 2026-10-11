import { randomBytes, createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';

const TOKEN_PREFIX = 'sat_';
const TOKEN_BYTES = 32; // 256 bits of entropy

export interface TokenGenerationResult {
  /** The plain token (only available at creation time) */
  plainToken: string;
  /** SHA256 hash of the token (stored in DB) */
  tokenHash: string;
  /** Last 4 characters for display */
  lastFour: string;
}

export interface TokenValidationResult {
  valid: boolean;
  satelliteId?: string;
  status?: string;
  enabled?: boolean;
  error?: string;
}

export class SatelliteTokenService {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  /**
   * Generate a new authentication token
   * Returns both the plain token (for the user) and the hash (for storage)
   */
  generateToken(): TokenGenerationResult {
    // Generate random bytes
    const bytes = randomBytes(TOKEN_BYTES);
    const tokenBody = bytes.toString('base64url'); // URL-safe base64
    const plainToken = `${TOKEN_PREFIX}${tokenBody}`;

    // Hash for storage
    const tokenHash = this.hashToken(plainToken);

    // Last 4 for display
    const lastFour = tokenBody.slice(-4);

    return {
      plainToken,
      tokenHash,
      lastFour,
    };
  }

  /**
   * Hash a plain token for storage/comparison
   */
  hashToken(plainToken: string): string {
    return createHash('sha256').update(plainToken).digest('hex');
  }

  /**
   * Validate a token and return the associated satellite info.
   *
   * When `expectedSatelliteId` is provided the lookup is scoped to that
   * machine, so a token is always validated against the satellite that
   * claims it. This is what keeps a duplicated token hash (two machines
   * sharing one token) from resolving to the wrong record and rejecting
   * the legitimate satellite as a mismatch.
   */
  async validateToken(plainToken: string, expectedSatelliteId?: string): Promise<TokenValidationResult> {
    if (!plainToken) {
      return { valid: false, error: 'Token not provided' };
    }

    if (!plainToken.startsWith(TOKEN_PREFIX)) {
      return { valid: false, error: 'Invalid token format' };
    }

    // An explicitly-passed empty satellite id is never a real machine: proto3 sends ''
    // for an omitted string field, which would otherwise degrade the lookup below to a
    // global by-hash search (the token stops being bound to the id the caller claims).
    // Reject rather than un-scope. Passing `undefined` (no id at all) is still a
    // deliberate global lookup and stays allowed.
    if (expectedSatelliteId === '') {
      return { valid: false, error: 'Empty satellite id' };
    }

    const tokenHash = this.hashToken(plainToken);

    try {
      const satellite = await this.prisma.satelliteMachine.findFirst({
        where: expectedSatelliteId
          ? { authTokenHash: tokenHash, id: expectedSatelliteId }
          : { authTokenHash: tokenHash },
        select: {
          id: true,
          status: true,
          enabled: true,
        },
      });

      if (!satellite) {
        this.logger.warn({ tokenHashPrefix: tokenHash.substring(0, 8) }, 'Token not found');
        return { valid: false, error: 'Token not found' };
      }

      // Check status
      const validStatuses = ['authorized', 'online', 'offline'];
      if (!validStatuses.includes(satellite.status)) {
        this.logger.warn(
          { satelliteId: satellite.id, status: satellite.status },
          'Satellite not in valid status'
        );
        return {
          valid: false,
          satelliteId: satellite.id,
          status: satellite.status,
          error: `Satellite status is ${satellite.status}`,
        };
      }

      return {
        valid: true,
        satelliteId: satellite.id,
        status: satellite.status,
        enabled: satellite.enabled,
      };
    } catch (error) {
      this.logger.error({ error }, 'Error validating token');
      return { valid: false, error: 'Database error' };
    }
  }

  /**
   * Rotate the token for a satellite
   * Returns the new plain token (only visible once)
   */
  async rotateToken(
    satelliteId: string,
    rotatedById: string
  ): Promise<{ success: boolean; plainToken?: string; error?: string }> {
    try {
      const satellite = await this.prisma.satelliteMachine.findUnique({
        where: { id: satelliteId },
        select: { id: true, status: true },
      });

      if (!satellite) {
        return { success: false, error: 'Satellite not found' };
      }

      if (satellite.status === 'revoked') {
        return { success: false, error: 'Cannot rotate token for revoked satellite' };
      }

      const { plainToken, tokenHash, lastFour } = this.generateToken();
      const now = new Date();

      await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          authTokenHash: tokenHash,
          authTokenLastFour: lastFour,
          authTokenRotatedAt: now,
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: rotatedById } },
        },
      });

      this.logger.info(
        { satelliteId, rotatedById, lastFour },
        'Token rotated successfully'
      );

      return { success: true, plainToken };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error rotating token');
      return { success: false, error: 'Failed to rotate token' };
    }
  }

  /**
   * Create initial token for a new satellite
   * Called when creating a new SatelliteMachine
   */
  async createInitialToken(
    satelliteId: string,
    createdById: string
  ): Promise<{ success: boolean; plainToken?: string; error?: string }> {
    try {
      const { plainToken, tokenHash, lastFour } = this.generateToken();
      const now = new Date();

      await this.prisma.satelliteMachine.update({
        where: { id: satelliteId },
        data: {
          authTokenHash: tokenHash,
          authTokenLastFour: lastFour,
          authTokenCreatedAt: now,
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: createdById } },
        },
      });

      this.logger.info(
        { satelliteId, createdById, lastFour },
        'Initial token created'
      );

      return { success: true, plainToken };
    } catch (error) {
      this.logger.error({ error, satelliteId }, 'Error creating initial token');
      return { success: false, error: 'Failed to create token' };
    }
  }

  /**
   * Get masked token display (****xxxx)
   */
  getMaskedDisplay(lastFour: string): string {
    return `****${lastFour}`;
  }
}
