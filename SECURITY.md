# Security Policy

## Overview

Security is a top priority for pilotstack Desktop. This application captures your screen and handles sensitive authentication tokens, so we've implemented multiple layers of protection to ensure your data remains secure.

This document outlines our security measures, audit results, and responsible disclosure process.

---

## 🔒 Security Architecture

### Multi-Layer Defense

```
┌──────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                          │
│  • Zod validation on all IPC channels                        │
│  • Rate limiting on sensitive operations                     │
│  • Input sanitization and type checking                      │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    ELECTRON SECURITY                          │
│  • Context Isolation: enabled                                │
│  • Node Integration: disabled                                │
│  • Sandbox: enabled                                          │
│  • Web Security: enabled                                     │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    OS-LEVEL SECURITY                          │
│  • Keychain (macOS) / DPAPI (Windows) / Secret Service       │
│  • Encrypted credential storage                              │
│  • Platform-specific security APIs                           │
└──────────────────────────────────────────────────────────────┘
```

### Key Security Features

| Feature | Implementation | Purpose |
|---------|----------------|---------|
| **No Embedded Secrets** | OAuth PKCE flow | No API keys or secrets in codebase |
| **Sandboxed Renderer** | `nodeIntegration: false` | UI cannot access Node.js/system APIs |
| **Context Isolation** | `contextIsolation: true` | Preload script isolated from renderer |
| **Secure Storage** | `safeStorage` API | Encrypted token storage (OS keychain) |
| **Request Signing** | HMAC-SHA256 | All API requests cryptographically signed |
| **IPC Validation** | Zod schemas | Runtime type checking on all channels |
| **CSP Headers** | Content Security Policy | Prevent XSS attacks |

---

## 🔍 Security Audit Results

### Audit Date: December 2025

We conducted a comprehensive security audit of the entire codebase. Below are the results:

#### ✅ Secrets Scan

**Finding:** No secrets, API keys, or credentials found in the codebase.

**Verified:**
- No hardcoded API keys
- No OAuth secrets or tokens
- No database credentials
- No private keys or certificates
- No test accounts with real credentials

**Evidence:**
```bash
# Scanned patterns
- API keys: sk_, pk_, key_, secret_
- Tokens: access_token, bearer, jwt
- Credentials: password, passwd, credential
- AWS keys: AKIA, aws_access
```

#### ✅ IPC Security

**Finding:** All IPC channels properly validated with Zod schemas.

**Verified:**
- 23/23 channels use `handleWithValidation()`
- All schemas use `.strict()` to reject unknown fields
- No unvalidated `ipcMain.on()` handlers
- Proper error boundaries on all handlers

**Example:**
```typescript
const captureStartSchema = z.object({
  sourceId: z.string().min(1).max(256),
}).strict();

handleWithValidation("capture:start", captureStartSchema, async (event, data) => {
  // data is fully typed and validated
});
```

#### ✅ Credential Storage

**Finding:** Credentials properly encrypted using Electron's `safeStorage` API.

**Verified:**
- Access tokens encrypted at rest
- Refresh tokens encrypted at rest
- Device secrets encrypted at rest
- Uses OS-native encryption:
  - **macOS:** Keychain Services
  - **Windows:** Data Protection API (DPAPI)
  - **Linux:** Secret Service API (libsecret) with encrypted fallback

**Code Location:** `electron/services/auth/token-manager.ts`

#### ✅ Network Security

**Finding:** All API requests use HTTPS with proper signature verification.

**Verified:**
- TLS 1.3 enforced
- Certificate validation enabled
- HMAC-SHA256 request signing
- Timestamp validation to prevent replay attacks
- Device fingerprinting for additional security

**Request Headers:**
```
Authorization: Bearer <access_token>
X-Device-ID: dev_<device_id>
X-Device-Fingerprint: <sha256_hash>
X-Timestamp: <unix_timestamp>
X-Signature: <hmac_sha256_signature>
```

#### ✅ Dependency Security

**Finding:** No known vulnerabilities in dependencies.

**Verified:**
- Regular `pnpm audit` checks
- Automated Dependabot updates enabled
- No critical or high-severity vulnerabilities
- Dependencies pinned to specific versions

**Latest Audit:**
```bash
$ pnpm audit
found 0 vulnerabilities
```

#### ⚠️ Known Limitations

1. **Screen Capture Data Not Encrypted on Disk**
   - **Impact:** Low (requires physical access to machine)
   - **Mitigation:** Users should encrypt their entire disk (FileVault/BitLocker)
   - **Future:** Considering AES-256 encryption for capture frames

2. **No Binary Signing (Free Version)**
   - **Impact:** Low (users see OS warnings on first launch)
   - **Mitigation:** Clear installation instructions provided
   - **Future:** Code signing certificate planned for v2.0

---

## 🛡️ Security Best Practices

### For Users

1. **Download Only from Official Sources**
   - GitHub Releases: https://github.com/pilotstack-app/pilotstack-desktop/releases
   - Verify checksums before installation

2. **Enable Full Disk Encryption**
   - macOS: FileVault
   - Windows: BitLocker
   - Linux: LUKS

3. **Keep the App Updated**
   - Enable automatic updates in settings
   - Check for updates weekly

4. **Review Permissions**
   - Only grant necessary permissions
   - Review access in System Preferences/Settings

5. **Secure Your Account**
   - Use strong passwords
   - Enable 2FA on pilotstack.app
   - Don't share device credentials

### For Developers

1. **Never Commit Secrets**
   - Use `.env` files (git-ignored)
   - Use environment variables for sensitive config
   - Review changes before committing

2. **Validate All Input**
   - Use Zod schemas for IPC
   - Sanitize user input
   - Validate file paths

3. **Follow Electron Security Guidelines**
   - Keep Electron updated
   - Use security-focused defaults
   - Avoid dangerous patterns (`eval`, `innerHTML`)

4. **Review Dependencies**
   - Run `pnpm audit` regularly
   - Update dependencies monthly
   - Review package source code for critical dependencies

---

## 🚨 Reporting Security Vulnerabilities

**We take security issues seriously.**

### Responsible Disclosure

If you discover a security vulnerability, please follow responsible disclosure:

**DO:**
- ✅ Email details to: **pilotstack.app@gmail.com**
- ✅ Include steps to reproduce
- ✅ Provide proof-of-concept if possible
- ✅ Give us time to fix before public disclosure (90 days)

**DON'T:**
- ❌ Open a public GitHub issue
- ❌ Post on social media before we've fixed it
- ❌ Exploit the vulnerability maliciously

### What to Include in Your Report

1. **Description** - Clear explanation of the vulnerability
2. **Impact** - What an attacker could do
3. **Affected Versions** - Which versions are vulnerable
4. **Steps to Reproduce** - Detailed reproduction steps
5. **Proof of Concept** - Code or screenshots (if applicable)
6. **Suggested Fix** - Your recommendation (optional)

### Response Timeline

- **Within 48 hours:** Acknowledge receipt
- **Within 7 days:** Validate and triage severity
- **Within 30 days:** Develop and test fix
- **Within 90 days:** Release patch and public disclosure

### Security Advisories

Critical security fixes will be announced via:
- GitHub Security Advisories
- Release notes
- Email to all registered users
- Twitter/blog post

---

## 🏆 Security Hall of Fame

We recognize security researchers who help make pilotstack more secure:

| Researcher | Date | Vulnerability | Severity |
|------------|------|---------------|----------|
| *Be the first!* | - | - | - |

---

## 📚 Security Resources

### Official Documentation

- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP Desktop App Security](https://owasp.org/www-community/vulnerabilities/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

### Our Security Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) - Security architecture details
- [CONTRIBUTING.md](CONTRIBUTING.md) - Secure development guidelines
- [README.md](README.md) - General security features

### Security Tools We Use

- **Dependabot** - Automated dependency updates
- **ESLint** - Static analysis for code quality
- **TypeScript** - Type safety at compile time
- **Zod** - Runtime validation
- **pnpm audit** - Dependency vulnerability scanning

---

## 📝 Security Policy Updates

This security policy is reviewed and updated quarterly.

**Current Version:** 1.0  
**Last Updated:** December 10, 2025  
**Next Review:** March 10, 2026

---

## 📧 Contact

**Security Email:** pilotstack.app@gmail.com  
**PGP Key:** Available on request  
**Response Time:** Within 48 hours

For non-security issues, please use:
- [GitHub Issues](https://github.com/pilotstack-app/pilotstack-desktop/issues)
- [GitHub Discussions](https://github.com/pilotstack-app/pilotstack-desktop/discussions)

---

<div align="center">

**Thank you for helping keep pilotstack secure!** 🔒

</div>
