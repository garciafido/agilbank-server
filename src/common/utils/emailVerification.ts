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
 * Normalize email for consistent lookups: lowercase + trim + strip diacritics.
 */
export function normalizeEmail(email: string): string {
  return email
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
