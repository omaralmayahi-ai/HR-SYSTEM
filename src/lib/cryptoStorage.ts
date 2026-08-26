// src/lib/cryptoStorage.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits standard for AES-GCM

export interface EncryptedPayload {
  version: 'aes-256-gcm';
  iv: string;
  authTag: string;
  data: string;
}

/**
 * Derives a 32-byte (256-bit) buffer key from the environment or fallback
 */
export function getEncryptionKey(overrideKey?: string): Buffer {
  const rawKey = overrideKey || process.env.LOCAL_DB_ENCRYPTION_KEY;
  if (rawKey) {
    const trimmed = rawKey.trim();
    if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
  }
  // Deterministic fallback key for development only
  return crypto.createHash('sha256').update('hr-system-iraq-local-storage-encryption-key-2026', 'utf8').digest();
}

/**
 * Encrypts a plain-text string using AES-256-GCM
 */
export function encryptData(plainText: string, keyBuffer?: Buffer): string {
  const key = keyBuffer || getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    version: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Decrypts an encrypted JSON payload using AES-256-GCM
 * Supports safe backward-compatibility fallback for legacy unencrypted JSON state
 */
export function decryptData(cipherPayload: string, keyBuffer?: Buffer): string {
  if (!cipherPayload || typeof cipherPayload !== 'string') {
    throw new Error('Invalid cipher payload: Payload must be a non-empty string');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cipherPayload);
  } catch (err) {
    throw new Error('Failed to parse cipher payload as JSON');
  }

  // Backward compatibility: If the file is legacy unencrypted state (contains inMemoryEmployees, etc.)
  if (parsed && (parsed.inMemoryEmployees || parsed.genericMemoryStores || parsed.systemSettingsStore)) {
    console.warn('[SECURITY WARNING] Detected legacy unencrypted local_storage.json. Decrypting as plain-text and scheduling re-encryption.');
    return cipherPayload;
  }

  if (!parsed || parsed.version !== 'aes-256-gcm' || !parsed.iv || !parsed.authTag || !parsed.data) {
    throw new Error('Encrypted payload is malformed or missing required AES-256-GCM attributes (iv, authTag, data)');
  }

  const key = keyBuffer || getEncryptionKey();
  const iv = Buffer.from(parsed.iv, 'hex');
  const authTag = Buffer.from(parsed.authTag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
