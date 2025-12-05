/**
 * Crypto Helpers
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Request Signing
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Secure Storage
 * 
 * Migrated from utils/crypto-helpers.js
 * Maps to: utils/crypto-helpers.js
 */

import { safeStorage } from "electron";
import * as crypto from "crypto";
import * as os from "os";

/**
 * Check if safeStorage is available on this platform
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Secure Storage
 */
export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Generate a machine-specific key for fallback encryption
 * Uses hardware identifiers to create a deterministic key
 */
function getMachineKey(): Buffer {
  const machineInfo = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || "unknown",
    os.userInfo().username,
  ].join("-");

  return crypto.createHash("sha256").update(machineInfo).digest();
}

/**
 * Encrypt with a specific key (fallback method)
 */
function encryptWithKey(data: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("hex"),
    data: encrypted,
    tag: authTag.toString("hex"),
  });
}

/**
 * Decrypt with a specific key (fallback method)
 */
function decryptWithKey(encryptedData: string, key: Buffer): string | null {
  try {
    const parsed = JSON.parse(encryptedData);
    const { iv, data, tag } = parsed;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    let decrypted = decipher.update(data, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Key decryption error:", error);
    return null;
  }
}

/**
 * Encrypt sensitive data using safeStorage
 * Falls back to basic encryption if safeStorage is unavailable
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Secure Storage
 */
export function encryptSecure(data: string | null): string | null {
  if (!data) return null;

  try {
    if (isSecureStorageAvailable()) {
      const encrypted = safeStorage.encryptString(data);
      return encrypted.toString("base64");
    } else {
      // Fallback: Use machine-specific key derivation
      const machineKey = getMachineKey();
      return encryptWithKey(data, machineKey);
    }
  } catch (error) {
    console.error("Encryption error:", error);
    return null;
  }
}

/**
 * Decrypt sensitive data using safeStorage
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Secure Storage
 */
export function decryptSecure(encryptedData: string | null): string | null {
  if (!encryptedData) return null;

  try {
    if (isSecureStorageAvailable()) {
      const buffer = Buffer.from(encryptedData, "base64");
      return safeStorage.decryptString(buffer);
    } else {
      // Fallback: Use machine-specific key derivation
      const machineKey = getMachineKey();
      return decryptWithKey(encryptedData, machineKey);
    }
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

/**
 * Generate HMAC-SHA256 signature for request signing
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Request Signing
 */
export function generateRequestSignature(
  timestamp: number,
  body: string,
  secret: string
): string {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify HMAC-SHA256 signature
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Request Signing
 */
export function verifyRequestSignature(
  timestamp: string,
  body: string,
  signature: string,
  secret: string,
  maxAgeMs: number = 5 * 60 * 1000
): boolean {
  // Check timestamp is within acceptable range
  const now = Date.now();
  const timestampMs = parseInt(timestamp, 10);
  if (Math.abs(now - timestampMs) > maxAgeMs) {
    return false;
  }

  const expectedSignature = generateRequestSignature(timestampMs, body, secret);

  // Timing-safe comparison
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate device fingerprint for validation
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Device Fingerprinting
 */
export function generateDeviceFingerprint(): string {
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || "unknown",
    os.totalmem().toString(),
    JSON.stringify(os.networkInterfaces()),
  ];

  const fingerprint = JSON.stringify(components);
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(expiresAt: number, bufferMs: number = 60000): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - bufferMs;
}

/**
 * Calculate token expiration time
 */
export function calculateExpiration(ttlSeconds: number): number {
  return Date.now() + ttlSeconds * 1000;
}

