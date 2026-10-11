import { randomBytes, createHash } from "crypto";

// Constantes
export const PASSWORD_MIN_LENGTH = 8;
export const TOKEN_EXPIRY_HOURS = 1;

// Lista de passwords comunes (top 100 más usados)
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwerty123",
  "abc123",
  "monkey",
  "letmein",
  "dragon",
  "master",
  "login",
  "welcome",
  "shadow",
  "sunshine",
  "princess",
  "admin",
  "admin123",
  "root",
  "toor",
  "pass",
  "test",
  "guest",
  "changeme",
  "iloveyou",
  "football",
  "baseball",
  "basketball",
  "soccer",
  "hockey",
  "superman",
  "batman",
  "trustno1",
  "hunter",
  "hunter2",
  "ranger",
  "harley",
  "jennifer",
  "michael",
  "michelle",
  "jessica",
  "ashley",
  "daniel",
  "matthew",
  "111111",
  "000000",
  "121212",
  "654321",
  "666666",
  "696969",
  "777777",
  "888888",
  "passw0rd",
  "p@ssword",
  "p@ssw0rd",
  "password!",
  "Password1",
  "Password123",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1q2w3e4r",
  "1qaz2wsx",
  "access",
  "computer",
  "internet",
  "server",
  "database",
  "security",
  "freedom",
  "whatever",
  "nothing",
  "secret",
  "summer",
  "winter",
  "spring",
  "killer",
  "jordan",
  "pepper",
  "ginger",
  "cookie",
  "cheese",
  "butter",
  "baseball1",
  "football1",
  "soccer1",
  "hockey1",
  "basketball1",
  "letmein1",
  "welcome1",
  "monkey1",
  "dragon1",
  "master1",
  "shadow1",
  "charlie",
  "donald",
  "george",
  "thomas",
  "robert",
  "anthony",
  "andrew",
  "starwars",
  "pokemon",
  "minecraft",
  "nintendo",
  "playstation",
  "xbox",
]);

// Generar password aleatoria (para seed, welcome email)
export async function generatePassword(length: number = 12): Promise<string> {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyz!@#$%&*()ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(Array(length))
    .map(() => chars[Math.round(Math.random() * chars.length)])
    .join("");
}

// Generar token de reset (64 hex chars)
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

// Hash de token para guardar en DB
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Calcular fecha de expiración
export function getTokenExpiration(hours: number = TOKEN_EXPIRY_HOURS): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// Validar robustez de password
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePasswordStrength(
  password: string
): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push("min_length");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("requires_uppercase");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("requires_lowercase");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("requires_number");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~\`]/.test(password)) {
    errors.push("requires_special");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("common_password");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
