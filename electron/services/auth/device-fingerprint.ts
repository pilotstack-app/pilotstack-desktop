/**
 * Device Fingerprint
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Device Fingerprinting
 * 
 * Generates device fingerprint for security.
 * Maps to: utils/crypto-helpers.js fingerprint section
 */

import { generateDeviceFingerprint as generateFingerprint } from "../../utils/crypto-helpers";

/**
 * Device fingerprint generator
 * 
 * Wraps crypto helper for device fingerprinting.
 */
export class DeviceFingerprint {
  /**
   * Generate device fingerprint
   * 
   * Generates a unique device fingerprint based on hardware and system characteristics.
   * Components:
   * - Hostname
   * - Platform
   * - Architecture
   * - CPU model
   * - Total memory
   * - Network interfaces
   * 
   * Hash: SHA-256 of JSON stringified components
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Device Fingerprinting
   * 
   * @returns Device fingerprint hash (hex string)
   */
  async generate(): Promise<string> {
    return generateFingerprint();
  }

  /**
   * Generate device fingerprint (synchronous version)
   * 
   * @returns Device fingerprint hash (hex string)
   */
  generateSync(): string {
    return generateFingerprint();
  }
}

