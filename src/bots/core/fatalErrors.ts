/**
 * Deny-list de errores FATALES conocidos: reintentar es inútil (no se arregla solo)
 * o peligroso (p.ej. reintentos de login FTP fallidos pueden banear).
 *
 * Modelo: el default es REINTENTAR casi todo (los portales dan errores incongruentes
 * que se arreglan reintentando); solo esta lista chica y explícita corta los
 * reintentos → `recoverable: false` → dead_letter inmediato → failure-state honesto
 * (deadLetterHandlers) → intervención humana.
 */
const FATAL_PATTERNS: RegExp[] = [
  // Autenticación FTP: insistir puede banear los intentos siguientes.
  /530/i,
  /wrong user.*password|user.*password.*wrong/i,
  /login (incorrect|failed|denied)/i,
  /auth(entication)? (failed|error|denied)/i,
  // Credenciales inválidas (portales / APIs).
  /invalid credentials|credenciales inv[aá]lidas/i,
  // Recurso inexistente: no se arregla reintentando.
  /\b404\b|not found/i,
];

/** true si el mensaje matchea la deny-list (cortar reintentos → humano). */
export function isFatalErrorMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  return FATAL_PATTERNS.some((p) => p.test(message));
}
