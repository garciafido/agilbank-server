import { injectable, inject } from "tsyringe";
import { PrismaClient } from "../../prisma/generated-client/client";
import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import { sign, verify } from "jsonwebtoken";
import { UnauthorizedError } from "../../common/errors";

// El secreto de 2FA NO se hornea. Antes caía a una constante horneada —pública, commiteada en
// el repo— cuando el entorno no traía APP_SECRET. El env de ejemplo trae solo JWT_SECRET, así
// que un deploy por default dejaba APP_SECRET sin setear y firmaba los tempTokens de 2FA con
// ese valor: forjar {userId} → setupTwoFa → takeover cross-tenant, sin un solo error en los logs.
//
// Orden APP_SECRET-PRIMERO (service-context es JWT-primero, a propósito distinto): así el
// secreto efectivo NO cambia para los deploys que ya setean APP_SECRET —cambiarlo rotaría la
// clave y volvería ilegibles los secretos 2FA guardados—. Solo se corrige el caso del fallback
// público, que era la vulnerabilidad. En producción, sin ninguno de los dos, no arranca.
const APP_SECRET = (() => {
  const s = process.env.APP_SECRET || process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_SECRET (o JWT_SECRET) es obligatorio en producción. Sin secreto, los tokens de 2FA " +
        "se firmarían con un valor por defecto: equivale a no tener 2FA, y el fallo sería silencioso."
    );
  }
  const efimero = randomBytes(32).toString("hex");
  console.warn(
    "[2fa] Sin APP_SECRET/JWT_SECRET: se generó uno efímero para desarrollo. Las inscripciones de " +
      "2FA se invalidan en cada reinicio y esto NO arranca en producción."
  );
  return efimero;
})();

@injectable()
export class TwoFaService {
  private static failedAttempts = new Map<
    string,
    { count: number; firstAt: number }
  >();
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly WINDOW_MS = 5 * 60 * 1000;

  constructor(@inject("PrismaClient") private prisma: PrismaClient) {}

  private checkAttemptLimit(userId: string): void {
    const record = TwoFaService.failedAttempts.get(userId);
    if (!record) return;
    if (Date.now() - record.firstAt > TwoFaService.WINDOW_MS) {
      TwoFaService.failedAttempts.delete(userId);
      return;
    }
    if (record.count >= TwoFaService.MAX_ATTEMPTS) {
      throw new Error(
        "Too many failed verification attempts. Please login again."
      );
    }
  }

  private recordFailedAttempt(userId: string): void {
    const record = TwoFaService.failedAttempts.get(userId);
    if (!record || Date.now() - record.firstAt > TwoFaService.WINDOW_MS) {
      TwoFaService.failedAttempts.set(userId, {
        count: 1,
        firstAt: Date.now(),
      });
    } else {
      record.count++;
    }
  }

  private clearAttempts(userId: string): void {
    TwoFaService.failedAttempts.delete(userId);
  }

  private deriveKey(): Buffer {
    return createHash("sha256").update(APP_SECRET).digest();
  }

  private encryptSecret(plaintext: string): string {
    const key = this.deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return JSON.stringify({ encrypted, iv: iv.toString("hex"), tag });
  }

  private decryptSecret(jsonStr: string): string {
    const { encrypted, iv, tag } = JSON.parse(jsonStr);
    const key = this.deriveKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  private hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }

  private buildTotp(userId: string, secret: OTPAuth.Secret): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: "Agilbank",
      label: userId,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
  }

  private generateBackupCodes(): { backupCodes: string[]; hashed: string[] } {
    const backupCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const num = randomBytes(4).readUInt32BE(0) % 100000000;
      const code = num.toString().padStart(8, "0");
      backupCodes.push(code.slice(0, 4) + "-" + code.slice(4));
    }
    return { backupCodes, hashed: backupCodes.map((c) => this.hashCode(c)) };
  }

  /**
   * IDEMPOTENTE mientras haya un setup pendiente de verificar, y a propósito.
   *
   * La versión que generaba un secreto nuevo en cada llamada tenía una falla
   * que no deja rastro: si el setup se dispara dos veces —React en desarrollo
   * duplica los efectos de montaje, o el usuario recarga— el QR que queda en
   * pantalla puede ser el de una llamada y el secreto guardado el de otra.
   * Desde ahí, NINGÚN código del authenticator coincide nunca, y el síntoma
   * es "no me toma el código correcto" sin un solo error en ningún lado.
   *
   * El reclamo es atómico vía updateMany condicional: gana exactamente una
   * llamada (Postgres re-evalúa el WHERE tras el lock de fila). Las demás
   * reusan el secreto pendiente, así todos los QR mostrados son el mismo.
   * Los códigos de respaldo sí se regeneran al reusar: se guardan hasheados y
   * no se pueden re-mostrar — los válidos son los de la última respuesta, que
   * es la que la pantalla conserva.
   *
   * Un 2FA ya VERIFICADO no se reconfigura desde acá: se rechaza antes de leer
   * su secreto. Antes el reclamo también ganaba con el 2FA verificado y lo
   * rotaba; como el login daba el mismo token temporal para configurar que para
   * verificar, con solo la contraseña se llegaba a un secreto nuevo y, con un
   * código de ese secreto, a la sesión: el segundo factor se salteaba.
   */
  async generateSetup(userId: string) {
    const secret = new OTPAuth.Secret();
    const { backupCodes, hashed } = this.generateBackupCodes();
    const encryptedSecret = this.encryptSecret(secret.base32);

    // Reclama solo si el usuario no tiene secreto: ni un setup a medias ni un
    // 2FA verificado (ése no se rota con solo la contraseña).
    const claimed = await this.prisma.user.updateMany({
      where: { id: userId, twoFaSecret: null },
      data: {
        twoFaSecret: encryptedSecret,
        twoFaBackupCodes: JSON.stringify(hashed),
      },
    });

    let activeSecret = secret;
    if (claimed.count === 0) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { twoFaSecret: true, twoFaVerifiedAt: true },
      });
      // Ya verificado: se rechaza antes de descifrar nada.
      if (user?.twoFaVerifiedAt) {
        throw new UnauthorizedError("Operación de 2FA no disponible.");
      }
      // Otra llamada ya dejó un secreto pendiente: ese es el que vale.
      try {
        activeSecret = OTPAuth.Secret.fromBase32(
          this.decryptSecret(user!.twoFaSecret!)
        );
        await this.prisma.user.update({
          where: { id: userId },
          data: { twoFaBackupCodes: JSON.stringify(hashed) },
        });
      } catch {
        // El pendiente no descifra (APP_SECRET rotado): inservible, se pisa.
        activeSecret = secret;
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            twoFaSecret: encryptedSecret,
            twoFaBackupCodes: JSON.stringify(hashed),
          },
        });
      }
    }

    const qrCodeDataUrl = await QRCode.toDataURL(
      this.buildTotp(userId, activeSecret).toString()
    );

    return {
      qrCodeDataUrl,
      secret: activeSecret.base32,
      backupCodes,
    };
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    this.checkAttemptLimit(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFaSecret) return false;

    const secretBase32 = this.decryptSecret(user.twoFaSecret);
    const totp = new OTPAuth.TOTP({
      issuer: "Agilbank",
      label: userId,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta !== null) {
      this.clearAttempts(userId);
      return true;
    }
    this.recordFailedAttempt(userId);
    return false;
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    this.checkAttemptLimit(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFaBackupCodes) return false;

    const hashedCodes: string[] = JSON.parse(user.twoFaBackupCodes);
    const hashedInput = this.hashCode(code);
    const index = hashedCodes.indexOf(hashedInput);
    if (index === -1) {
      this.recordFailedAttempt(userId);
      return false;
    }

    hashedCodes.splice(index, 1);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaBackupCodes: JSON.stringify(hashedCodes) },
    });

    this.clearAttempts(userId);
    return true;
  }

  async confirmSetup(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaVerifiedAt: new Date() },
    });
  }

  needsSetup(user: any): boolean {
    return !!user.twoFaseAuth && !user.twoFaVerifiedAt;
  }

  needsVerification(user: any): boolean {
    return !!user.twoFaseAuth && !!user.twoFaVerifiedAt;
  }

  // Dos tipos de token temporal: el de CONFIGURAR (login de un 2FA sin verificar;
  // vale para setupTwoFa y confirmTwoFaSetup) y el de VERIFICAR (login de un 2FA
  // verificado; vale para verifyTwoFa y verifyTwoFaBackupCode). Uno no sirve
  // para lo del otro: con el de verificar no se llega a configurar un secreto.
  // Un kind que no es ninguno de los dos lanza: nunca se compara contra un tipo
  // vacío (pasaría un JWT sin tipo firmado con el mismo secreto).
  private static tempTokenType(kind: "setup" | "verify"): string {
    if (kind === "setup") return "twofa_setup";
    if (kind === "verify") return "twofa_verify";
    throw new Error("Invalid token type");
  }

  createTempToken(userId: string, kind: "setup" | "verify"): string {
    const type = TwoFaService.tempTokenType(kind);
    return sign({ userId, type }, APP_SECRET, { expiresIn: "5m" });
  }

  verifyTempToken(token: string, kind: "setup" | "verify"): { userId: string } {
    const expected = TwoFaService.tempTokenType(kind);
    const payload = verify(token, APP_SECRET) as any;
    if (payload.type !== expected) {
      throw new Error("Invalid token type");
    }
    return { userId: payload.userId };
  }

  // ===== Device trust (remember this device for 10 days after successful 2FA) =====
  // PERSISTIDO en TrustedDevice: revocable, listable y auditable. La cookie
  // httpOnly lleva un token OPACO aleatorio; en DB se guarda solo su SHA-256.

  static readonly DEVICE_COOKIE_NAME = "twofa_device";
  static readonly DEVICE_TRUST_DAYS = 10;

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Crea un dispositivo de confianza: token opaco aleatorio (va a la cookie),
   * persiste su hash + deviceInfo + expiración (DEVICE_TRUST_DAYS). Devuelve el
   * token EN CLARO (solo para la cookie; en DB queda el hash).
   */
  async createDeviceToken(
    userId: string,
    deviceInfo?: {
      browserName?: string | null;
      browserVersion?: string | null;
      osName?: string | null;
      deviceType?: string | null;
      ipAddress?: string | null;
    }
  ): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + TwoFaService.DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000
    );
    await this.prisma.trustedDevice.create({
      data: {
        tokenHash: this.hashToken(token),
        userId,
        expiresAt,
        browserName: deviceInfo?.browserName ?? null,
        browserVersion: deviceInfo?.browserVersion ?? null,
        osName: deviceInfo?.osName ?? null,
        deviceType: deviceInfo?.deviceType ?? null,
        ipAddress: deviceInfo?.ipAddress ?? null,
      },
    });
    return token;
  }

  /**
   * ¿La cookie corresponde a un dispositivo de confianza vigente de este user?
   * Valida contra DB (hash + userId + no revocado + no expirado) y actualiza
   * lastUsedAt. Nunca throwea.
   */
  async isTrustedDevice(
    token: string | undefined,
    userId: string
  ): Promise<boolean> {
    if (!token) return false;
    try {
      const device = await this.prisma.trustedDevice.findUnique({
        where: { tokenHash: this.hashToken(token) },
      });
      if (
        !device ||
        device.userId !== userId ||
        device.revokedAt !== null ||
        device.expiresAt < new Date()
      ) {
        return false;
      }
      await this.prisma.trustedDevice.update({
        where: { id: device.id },
        data: { lastUsedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Revoca un dispositivo de confianza propio del usuario (gestión "tus dispositivos"). */
  async revokeDevice(
    id: string,
    userId: string,
    reason = "user_action"
  ): Promise<void> {
    await this.prisma.trustedDevice.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Revoca TODOS los dispositivos de confianza del usuario. */
  async revokeAllForUser(
    userId: string,
    reason = "user_action"
  ): Promise<void> {
    await this.prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Dispositivos de confianza VIGENTES del usuario (para la pantalla de gestión). */
  async listDevices(userId: string) {
    return this.prisma.trustedDevice.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: {
        id: true,
        browserName: true,
        browserVersion: true,
        osName: true,
        deviceType: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
  }

  /**
   * Parse the value of a cookie from the raw Cookie header. Returns undefined if
   * the cookie is not present. Avoids adding cookie-parser as a dependency.
   */
  static readCookie(
    cookieHeader: string | undefined,
    name: string
  ): string | undefined {
    if (!cookieHeader) return undefined;
    const parts = cookieHeader.split(";");
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const k = part.slice(0, eq).trim();
      if (k === name) {
        return decodeURIComponent(part.slice(eq + 1).trim());
      }
    }
    return undefined;
  }
}
