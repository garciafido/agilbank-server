/**
 * Service for encrypting/decrypting sensitive credentials using AES-256-GCM.
 *
 * This service uses envelope encryption pattern:
 * - A master key (ESIGNATURE_MASTER_KEY) is used to encrypt data
 * - Each encrypted value has its own IV (Initialization Vector)
 * - Authentication tag ensures data integrity
 *
 * Environment variable required:
 * - ESIGNATURE_MASTER_KEY: 64 hex characters (32 bytes = 256 bits)
 *   Generate with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag

export interface EncryptedData {
  encrypted: string; // base64 encoded ciphertext
  iv: string;        // base64 encoded IV
  tag: string;       // base64 encoded auth tag
}

export class CredentialsEncryptionService {
  private masterKey: Buffer;
  private static instance: CredentialsEncryptionService | null = null;

  constructor() {
    const keyHex = process.env.ESIGNATURE_MASTER_KEY;
    if (!keyHex) {
      throw new Error(
        'ESIGNATURE_MASTER_KEY environment variable is not set. ' +
        'Generate one with: openssl rand -hex 32'
      );
    }
    if (keyHex.length !== 64) {
      throw new Error(
        `ESIGNATURE_MASTER_KEY must be exactly 64 hex characters (32 bytes). ` +
        `Current length: ${keyHex.length}`
      );
    }
    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error('ESIGNATURE_MASTER_KEY must contain only hexadecimal characters');
    }
    this.masterKey = Buffer.from(keyHex, 'hex');
  }

  /**
   * Get singleton instance of the encryption service.
   * Lazily initializes to avoid errors during module import if env var is missing.
   */
  static getInstance(): CredentialsEncryptionService {
    if (!CredentialsEncryptionService.instance) {
      CredentialsEncryptionService.instance = new CredentialsEncryptionService();
    }
    return CredentialsEncryptionService.instance;
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   *
   * @param plaintext - The string to encrypt
   * @returns Object with encrypted data, IV, and authentication tag (all base64)
   */
  encrypt(plaintext: string): EncryptedData {
    if (plaintext === null || plaintext === undefined) {
      throw new Error('Cannot encrypt null or undefined value');
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv, {
      authTagLength: TAG_LENGTH
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  /**
   * Decrypts an encrypted value using AES-256-GCM.
   *
   * @param encrypted - Base64 encoded ciphertext
   * @param iv - Base64 encoded initialization vector
   * @param tag - Base64 encoded authentication tag
   * @returns The original plaintext string
   * @throws Error if decryption fails (wrong key, tampered data, etc.)
   */
  decrypt(encrypted: string, iv: string, tag: string): string {
    if (!encrypted || !iv || !tag) {
      throw new Error('Missing required parameters for decryption (encrypted, iv, tag)');
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.masterKey,
        Buffer.from(iv, 'base64'),
        { authTagLength: TAG_LENGTH }
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error: any) {
      // Don't expose internal crypto errors, but log them
      console.error('[CredentialsEncryptionService] Decryption failed:', error.message);
      throw new Error('Failed to decrypt credentials. Data may be corrupted or key may be incorrect.');
    }
  }

  /**
   * Encrypts a JSON object (serializes to string first).
   *
   * @param data - Object to encrypt
   * @returns Encrypted data
   */
  encryptJson(data: Record<string, any>): EncryptedData {
    return this.encrypt(JSON.stringify(data));
  }

  /**
   * Decrypts and parses a JSON object.
   *
   * @param encrypted - Base64 encoded ciphertext
   * @param iv - Base64 encoded IV
   * @param tag - Base64 encoded auth tag
   * @returns Parsed JSON object
   */
  decryptJson<T = Record<string, any>>(encrypted: string, iv: string, tag: string): T {
    const plaintext = this.decrypt(encrypted, iv, tag);
    try {
      return JSON.parse(plaintext) as T;
    } catch {
      throw new Error('Decrypted data is not valid JSON');
    }
  }

  /**
   * Check if the encryption service is properly configured.
   * Useful for health checks.
   */
  static isConfigured(): boolean {
    const keyHex = process.env.ESIGNATURE_MASTER_KEY;
    return !!keyHex && keyHex.length === 64 && /^[0-9a-fA-F]+$/.test(keyHex);
  }
}
