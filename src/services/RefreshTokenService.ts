import { injectable, inject } from "tsyringe";
import {
  PrismaClient,
  RefreshToken,
  User,
} from "../prisma/generated-client/client";
import { ServiceContext, APP_SECRET } from "../service-context";
import { logger } from "../utils/logger";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutos
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 días
// Ventana de gracia para REUSO: carreras legítimas (multi-pestaña) refrescan
// con el token recién rotado — dentro de la gracia NO es robo.
const REUSE_GRACE_MS = 60 * 1000;
const MAX_TOKENS_PER_USER = 5; // Límite de dispositivos simultáneos

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number; // segundos
  refreshExpiresIn: number; // segundos
}

export interface RefreshTokenPayload {
  tokenId: string;
  userId: string;
  family: string;
}

export interface DeviceInfo {
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  deviceType?: string;
  ipAddress?: string;
}

export class TokenExpiredError extends Error {
  constructor(message = "Token has expired") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

export class TokenRevokedError extends Error {
  constructor(message = "Token has been revoked") {
    super(message);
    this.name = "TokenRevokedError";
  }
}

export class TokenReuseDetectedError extends Error {
  constructor(message = "Token reuse detected - possible theft attempt") {
    super(message);
    this.name = "TokenReuseDetectedError";
  }
}

@injectable()
export class RefreshTokenService {
  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient
  ) {}

  /**
   * Crea un nuevo par de tokens (access + refresh)
   */
  public async createTokenPair(
    userId: string,
    deviceInfo?: DeviceInfo
  ): Promise<TokenPair> {
    // Limpiar tokens antiguos si excede el límite
    await this.cleanupOldTokens(userId);

    // Generar familia de tokens
    const family = crypto.randomUUID();

    // Crear refresh token en DB
    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        token: crypto.randomBytes(32).toString("hex"),
        userId,
        family,
        expiresAt: new Date(
          Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        ),
        ...deviceInfo,
      },
    });

    // Crear access token JWT. El tipo "access" es lo único que createContext acepta
    // como sesión: el refresh token y los temporales de 2FA se firman con el mismo
    // secreto y también traen userId, pero no valen como Bearer.
    const accessToken = jwt.sign({ userId, type: "access" }, APP_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Crear refresh token JWT con payload mínimo
    const refreshTokenPayload: RefreshTokenPayload = {
      tokenId: refreshTokenRecord.id,
      userId,
      family,
    };

    const refreshToken = jwt.sign(refreshTokenPayload, APP_SECRET, {
      expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
    });

    // Solo ids: deviceInfo (IP, navegador, sistema operativo) es un dato personal
    // y no va al log.
    logger.info(
      {
        userId,
        tokenId: refreshTokenRecord.id,
        family,
      },
      "Token pair created"
    );

    return {
      accessToken,
      refreshToken,
      accessExpiresIn: 15 * 60, // 15 minutos en segundos
      refreshExpiresIn: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60, // 7 días en segundos
    };
  }

  /**
   * Renueva tokens usando refresh token (rotation)
   */
  public async refreshTokenPair(
    refreshToken: string,
    deviceInfo?: DeviceInfo
  ): Promise<TokenPair> {
    let payload: RefreshTokenPayload;

    // Verificar JWT
    try {
      payload = jwt.verify(refreshToken, APP_SECRET) as RefreshTokenPayload;
    } catch (error) {
      throw new TokenExpiredError("Invalid or expired refresh token");
    }

    // Buscar token en DB
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { id: payload.tokenId },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new TokenRevokedError("Token not found");
    }

    // Verificar si fue revocado
    if (tokenRecord.revokedAt) {
      throw new TokenRevokedError(
        `Token was revoked: ${tokenRecord.revokedReason}`
      );
    }

    // Verificar si ya fue reemplazado (posible reuso)
    if (tokenRecord.replacedBy) {
      // GRACIA DE REUSO: una carrera multi-pestaña legítima usa el token
      // recién rotado. Dentro de la ventana: seguir la cadena replacedBy
      // hasta el token vigente y devolver ESE refresh (con access fresco) —
      // las pestañas convergen al mismo par. Fuera de la ventana: robo real.
      const replacedAt = tokenRecord.replacedAt ?? tokenRecord.lastUsedAt;
      if (replacedAt && Date.now() - replacedAt.getTime() < REUSE_GRACE_MS) {
        let current: typeof tokenRecord | null = tokenRecord;
        for (let i = 0; i < 3 && current && current.replacedBy; i++) {
          current = await this.prisma.refreshToken.findUnique({
            where: { id: current.replacedBy },
            include: { user: true },
          });
        }
        if (
          current &&
          !current.replacedBy &&
          !current.revokedAt &&
          current.expiresAt > new Date()
        ) {
          logger.info(
            {
              userId: tokenRecord.userId,
              family: tokenRecord.family,
            },
            "Refresh race tolerado (gracia de reuso)"
          );
          const graceAccessToken = jwt.sign(
            { userId: current.userId, type: "access" },
            APP_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
          );
          const graceRefreshToken = jwt.sign(
            {
              tokenId: current.id,
              userId: current.userId,
              family: current.family,
            } as RefreshTokenPayload,
            APP_SECRET,
            { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
          );
          return {
            accessToken: graceAccessToken,
            refreshToken: graceRefreshToken,
            accessExpiresIn: 15 * 60,
            refreshExpiresIn: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
          };
        }
      }

      // ALERTA DE SEGURIDAD: Token reusado, revocar toda la familia
      await this.revokeTokenFamily(tokenRecord.family, "reuse_detected");

      logger.warn(
        {
          userId: tokenRecord.userId,
          tokenId: payload.tokenId,
          family: tokenRecord.family,
        },
        "Token reuse detected"
      );

      throw new TokenReuseDetectedError();
    }

    // Verificar expiración
    if (tokenRecord.expiresAt < new Date()) {
      await this.revokeToken(tokenRecord.id, "expired");
      throw new TokenExpiredError("Refresh token has expired");
    }

    // ROTATION: Crear nuevo token y marcar el anterior como reemplazado
    const newTokenRecord = await this.prisma.refreshToken.create({
      data: {
        token: crypto.randomBytes(32).toString("hex"),
        userId: tokenRecord.userId,
        family: tokenRecord.family, // Mantener la misma familia
        expiresAt: new Date(
          Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        ),
        browserName: deviceInfo?.browserName || tokenRecord.browserName,
        browserVersion:
          deviceInfo?.browserVersion || tokenRecord.browserVersion,
        osName: deviceInfo?.osName || tokenRecord.osName,
        deviceType: deviceInfo?.deviceType || tokenRecord.deviceType,
        ipAddress: deviceInfo?.ipAddress || tokenRecord.ipAddress,
      },
    });

    // Marcar token anterior como reemplazado
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        replacedBy: newTokenRecord.id,
        replacedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    // Generar nuevos tokens
    const accessToken = jwt.sign(
      { userId: tokenRecord.userId, type: "access" },
      APP_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const newRefreshTokenPayload: RefreshTokenPayload = {
      tokenId: newTokenRecord.id,
      userId: tokenRecord.userId,
      family: tokenRecord.family,
    };

    const newRefreshToken = jwt.sign(newRefreshTokenPayload, APP_SECRET, {
      expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
    });

    logger.info(
      {
        userId: tokenRecord.userId,
        oldTokenId: tokenRecord.id,
        newTokenId: newTokenRecord.id,
        family: tokenRecord.family,
      },
      "Token refreshed"
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      accessExpiresIn: 15 * 60,
      refreshExpiresIn: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    };
  }

  /**
   * Revoca un token específico
   */
  public async revokeToken(tokenId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  /**
   * Revoca todos los tokens de una familia (seguridad ante reuso)
   */
  public async revokeTokenFamily(
    family: string,
    reason: string
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        family,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    logger.warn({ family, reason }, "Token family revoked");
  }

  /**
   * Revoca todos los tokens de un usuario
   */
  public async revokeUserTokens(
    userId: string,
    reason = "user_logout"
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    logger.info({ userId, reason }, "User tokens revoked");
  }

  /**
   * Limpia tokens antiguos cuando se excede el límite por usuario
   */
  private async cleanupOldTokens(userId: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (tokens.length >= MAX_TOKENS_PER_USER) {
      // Revocar los tokens más antiguos
      const tokensToRevoke = tokens.slice(MAX_TOKENS_PER_USER - 1);

      await this.prisma.refreshToken.updateMany({
        where: {
          id: { in: tokensToRevoke.map((t) => t.id) },
        },
        data: {
          revokedAt: new Date(),
          revokedReason: "max_devices_exceeded",
        },
      });

      logger.info(
        {
          userId,
          revokedCount: tokensToRevoke.length,
        },
        "Old tokens cleaned up"
      );
    }
  }

  /**
   * Limpia tokens expirados (para cron job)
   */
  public async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Revocados hace más de 30 días
          },
        ],
      },
    });

    logger.info({ count: result.count }, "Expired tokens cleaned up");
    return result.count;
  }

  /**
   * Obtiene información de sesiones activas de un usuario
   */
  public async getUserSessions(userId: string): Promise<RefreshToken[]> {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        replacedBy: null, // Solo tokens actuales, no reemplazados
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }
}
