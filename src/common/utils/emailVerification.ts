import crypto from "crypto";

const APP_SECRET =
  process.env.APP_SECRET || process.env.JWT_SECRET || "change-me-in-production";

/**
 * Generate HMAC-SHA256 signature for email verification URL.
 * No token stored in DB — the URL itself is the proof.
 */
export function generateVerificationSignature(
  verificationId: string,
  email: string,
  tenantId: string
): string {
  const payload = `${verificationId}|${email}|${tenantId}`;
  return crypto.createHmac("sha256", APP_SECRET).update(payload).digest("hex");
}

/**
 * Verify HMAC signature using timing-safe comparison.
 */
export function verifySignature(
  verificationId: string,
  email: string,
  tenantId: string,
  signature: string
): boolean {
  const expected = generateVerificationSignature(
    verificationId,
    email,
    tenantId
  );
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Build verification URL with HMAC signature.
 */
export function buildVerificationUrl(
  verificationId: string,
  email: string,
  tenantId: string
): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const sig = generateVerificationSignature(verificationId, email, tenantId);
  return `${appUrl}/verify-email?vid=${verificationId}&sig=${sig}`;
}

/**
 * Mask email for display in notifications (j***@gmail.com).
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}@${domain}`;
}

/**
 * Lo que pide el enlace vigente de una verificación: 'email' (verificar solo la
 * dirección) o 'data' (además, validar los datos del registro al que apunta).
 */
export type EmailVerificationScopeValue = "email" | "data";

/**
 * El alcance efectivo de una verificación: el campo scope, si el proyecto lo
 * declara y el registro lo tiene. Un registro sin scope (de antes del campo, o
 * de un proyecto que no lo declara) se deduce como antes: 'data' si apunta a un
 * registro (sourceEntity y sourceRecordId), 'email' si no. Lo usan la ruta de la
 * verificación y las rutas propias del proyecto que dependen del enlace (una
 * subida de documentos, por ejemplo): un enlace de solo email no habilita nada
 * de la validación de datos.
 */
export function verificationScopeOf(record: {
  scope?: string | null;
  sourceEntity?: string | null;
  sourceRecordId?: string | null;
}): EmailVerificationScopeValue {
  if (record.scope === "email" || record.scope === "data") return record.scope;
  return record.sourceEntity && record.sourceRecordId ? "data" : "email";
}

/**
 * Normalize email for consistent lookups: lowercase + trim + strip diacritics.
 */
export function normalizeEmail(email: string): string {
  return email
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
