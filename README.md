<div align="center">

<img src="assets/icon_512.png" alt="pilotstack Logo" width="128" height="128">

# pilotstack Desktop

**Open-source desktop application for [pilotstack](https://pilotstack.app) - The Strava for Work**

Record your creative process and generate verified timelapse videos to prove your work

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/pilotstack-app/pilotstack-desktop?style=flat-square)](https://github.com/pilotstack-app/pilotstack-desktop/releases)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/pilotstack-app/pilotstack-desktop/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/pilotstack-app/pilotstack-desktop/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/pilotstack-app/pilotstack-desktop?style=flat-square)](https://github.com/pilotstack-app/pilotstack-desktop/issues)
[![GitHub stars](https://img.shields.io/github/stars/pilotstack-app/pilotstack-desktop?style=flat-square)](https://github.com/pilotstack-app/pilotstack-desktop/stargazers)
[![Downloads](https://img.shields.io/github/downloads/pilotstack-app/pilotstack-desktop/total?style=flat-square)](https://github.com/pilotstack-app/pilotstack-desktop/releases)

[Features](#-features) •
[Download](#-download) •
[Documentation](#-documentation) •
[Building](#-building-from-source) •
[Contributing](#-contributing) •
[Community](#-community)

<img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS">
<img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
<img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">

</div>

---

## 🎯 What is pilotstack Desktop?

pilotstack Desktop is a powerful screen recording application that helps you **prove your work authentically**. Unlike traditional screen recorders, pilotstack captures your workflow in the background and generates beautiful 30-second timelapse videos with built-in anti-cheat verification.

Perfect for:
- 🎨 **Designers** showcasing their creative process
- 💻 **Developers** proving hours of actual coding work
- 📝 **Writers** demonstrating content creation authenticity
- 🎓 **Students** verifying homework and project completion
- 🏢 **Remote workers** building trust with transparent work records

### Why pilotstack?

- ✅ **Verified Work** - Anti-cheat detection proves authentic effort with activity scores
- 🎬 **Effortless Recording** - Runs silently in the background without disrupting your flow
- ⚡ **Smart Compression** - Hours of work compressed into engaging 30-second highlights
- 🌐 **Universal Compatibility** - Works on macOS, Windows, and Linux
- 🔒 **Privacy First** - Open-source and auditable - you control your data
- ☁️ **Cloud Integration** - Optional upload to [pilotstack.app](https://pilotstack.app) for sharing

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎬 Ghost Recording
Record your screen continuously in the background without any interruption to your workflow. No popups, no notifications - just pure focus.

### ⚡ Smart Timelapse
Automatically compress hours of work into beautiful 30-second highlight videos. Perfect for sharing on social media or portfolios.

### ✅ Verified Badge
Built-in anti-cheat detection analyzes keyboard, mouse, and clipboard activity to generate authenticity scores. Prove your work is genuine.

</td>
<td width="50%">

### 📊 Activity Tracking
Comprehensive monitoring of:
- ⌨️ Keyboard strokes & typing patterns
- 🖱️ Mouse clicks, movements & scrolls
- 📋 Clipboard events & paste detection
- ⏱️ Active vs idle time tracking

### 🎵 Background Music
Add licensed background music to your timelapse videos for a professional touch.

### 🖥️ Cross-Platform
Native support for macOS (Intel & Apple Silicon), Windows, and Linux with platform-optimized capture.

</td>
</tr>
</table>

---

## 📥 Download

<div align="center">

### [⬇️ Download for Your Platform](https://pilotstack.app/download)

**Official download page with installation guides for all platforms**

---

**Alternative:** [GitHub Releases](https://github.com/pilotstack-app/pilotstack-desktop/releases/latest)

| Platform | Supported Architectures |
|----------|------------------------|
| **🍎 macOS** | Apple Silicon (M1/M2/M3) • Intel |
| **🪟 Windows** | x64 (64-bit) |
| **🐧 Linux** | x64 AppImage • Debian/Ubuntu DEB |

</div>

### ✅ Verify Your Download

To ensure your download hasn't been tampered with, verify the checksum. Every release includes a `checksums.txt` file and an `sbom.spdx.json` (Software Bill of Materials) for full supply chain transparency.

<details>
<summary><b>How to Verify (Click to Expand)</b></summary>

**macOS:**
```bash
cd ~/Downloads
shasum -a 256 pilotstack-*-mac-arm64.dmg
# Compare output with checksums.txt from the GitHub release
```

**Windows (PowerShell):**
```powershell
Get-FileHash .\pilotstack-*-win-x64.exe -Algorithm SHA256
# Compare output with checksums.txt from the GitHub release
```

**Linux:**
```bash
cd ~/Downloads
sha256sum pilotstack-*-x64.AppImage
# Compare output with checksums.txt from the GitHub release
```

Download `checksums.txt` from the [latest release](https://github.com/pilotstack-app/pilotstack-desktop/releases/latest).

</details>

---

## 📖 Documentation

<table>
<tr>
<td width="33%" align="center">

### 📚 [User Guide](https://docs.pilotstack.app)

Complete guide on using pilotstack Desktop, from installation to advanced features

</td>
<td width="33%" align="center">

### 🏗️ [Architecture](ARCHITECTURE.md)

Deep dive into the technical architecture, perfect for contributors and auditors

</td>
<td width="33%" align="center">

### 🤝 [Contributing](CONTRIBUTING.md)

Want to contribute? Learn how to set up your dev environment and submit PRs

</td>
</tr>
<tr>
<td width="33%" align="center">

### 🔒 [Security](SECURITY.md)

Security policies, audit results, and responsible disclosure process

</td>
<td width="33%" align="center">

### 📜 [Changelog](CHANGELOG.md)

Track what's new, changed, and fixed in each release

</td>
<td width="33%" align="center">

### 💬 [Discussions](https://github.com/pilotstack-app/pilotstack-desktop/discussions)

Ask questions, share ideas, and connect with the community

</td>
</tr>
</table>

---

## 🛠️ Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ (LTS recommended)
- [pnpm](https://pnpm.io/) 9+
- Python 3.11+ (for native modules)
- Platform-specific tools:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools
  - **Linux**: `build-essential` package

### Quick Start

```bash
# Clone the repository
git clone https://github.com/pilotstack-app/pilotstack-desktop.git
cd pilotstack-desktop

# Install dependencies
pnpm install

# Build workspace packages
pnpm run build:packages

# Start development mode (hot-reload enabled)
pnpm run dev
```

### Build Commands

```bash
# Development
pnpm run dev              # Start dev server with hot-reload
pnpm run type-check       # TypeScript type checking
pnpm run lint             # ESLint code quality checks

# Production builds
pnpm run build            # Build for current platform
pnpm run build:mac        # macOS (DMG + ZIP)
pnpm run build:win        # Windows (NSIS installer + ZIP)
pnpm run build:linux      # Linux (AppImage + DEB)
pnpm run build:all        # All platforms (requires specific environment)
```

Build outputs are placed in the `release/` directory.

### Development Tips

- The app uses **Vite** for fast React hot-reloading
- Main process changes require app restart (automatically handled)
- Check `electron-dist/` for compiled main process code
- Use Chrome DevTools in the app: `Cmd/Ctrl+Shift+I`

---

## 🏗️ Architecture Overview

pilotstack Desktop follows Electron's multi-process architecture with strict security boundaries:

```
┌─────────────────────────────────────────────────────────────┐
│                  MAIN PROCESS (Node.js)                      │
│  • Screen capture (FFmpeg native or frame-by-frame)         │
│  • Activity monitoring (keyboard, mouse, clipboard)         │
│  • Video generation with watermarks & music                 │
│  • Cloud upload with multipart support                      │
│  • Secure credential storage (Keychain/DPAPI)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
              IPC (Zod validated)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              RENDERER PROCESS (React)                        │
│  • Beautiful UI with Tailwind CSS                           │
│  • Real-time stats display                                  │
│  • No direct system access (sandboxed)                      │
└─────────────────────────────────────────────────────────────┘
```

**Key Technologies:**

- 🖼️ **Electron** 33.x - Cross-platform desktop framework
- ⚛️ **React** 19.x - Modern UI framework
- 🎨 **Tailwind CSS** - Utility-first styling
- 📹 **FFmpeg** - Video encoding & processing
- 🔒 **Zod** - Runtime type validation for IPC
- 📦 **pnpm** - Fast, efficient package manager
- 🏎️ **Vite** - Lightning-fast dev server

For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🔒 Security

Security is our top priority. This application captures your screen, so we've implemented multiple layers of protection:

### Security Features

✅ **Open Source** - Fully auditable codebase  
✅ **No Embedded Secrets** - OAuth PKCE flow, no API keys in code  
✅ **Sandboxed Renderer** - UI can't access system resources  
✅ **Encrypted Storage** - Keychain (macOS) / DPAPI (Windows) / Secret Service (Linux)  
✅ **Context Isolation** - Full Electron security enabled  
✅ **Signed Requests** - HMAC-SHA256 signatures on all API calls  
✅ **Zod Validation** - Runtime validation on all IPC channels  

### Security Audit

We've conducted a comprehensive security audit of the codebase. Key findings:

- ✅ No hardcoded secrets or API keys
- ✅ No unvalidated IPC channels
- ✅ Proper credential encryption
- ✅ No eval() or dangerous patterns
- ✅ Dependencies regularly updated

See [SECURITY.md](SECURITY.md) for the complete audit report.

### Reporting Security Issues

**Please do not open public issues for security vulnerabilities.**

To report a security issue, email: **pilotstack.app@gmail.com**

We'll respond within 48 hours and work with you to address the issue responsibly.

---

## 🤝 Contributing

We love contributions! Whether it's bug fixes, new features, or documentation improvements, your help makes pilotstack better.

### How to Contribute

1. 🍴 Fork the repository
2. 🌿 Create a feature branch: `git checkout -b feature/amazing-feature`
3. 📝 Make your changes
4. ✅ Run checks: `pnpm run type-check && pnpm run lint`
5. 💾 Commit with a clear message: `git commit -m "feat: add amazing feature"`
6. 🚀 Push to your fork: `git push origin feature/amazing-feature`
7. 🎉 Open a Pull Request

### Verified Work Session

All Pull Requests **must** include a **Verified Work Session** badge from your pilotstack account. This proves authentic contribution and helps maintain our open-source community's integrity:

1. Record your coding session using pilotstack Desktop while working on your contribution
2. Upload the recording to your [pilotstack.app](https://pilotstack.app) account
3. Go to your recording page and copy the verification badge code
4. Paste the complete badge (with table) at the top of your PR description

**Example of required badge format:**

```markdown
## 🛡️ Verified Work Session

[![pilotstack Verified](https://pilotstack.app/api/badges/cmiwyinfk0003l404smvupdyy?style=flat&theme=github)](https://pilotstack.app/r/recording-1282025)

| Metric | Value |
|--------|-------|
| Status | ✅ Verified |
| Focus Time | 0m |
| Score | 78% |
| Keystrokes | 148 |
| Words Typed | ~30 |
| Peak WPM | 66 |
| Avg WPM | 60 |
| Mouse Clicks | 23 |
| Typing Bursts | 1 |
| Paste Events | 0 |

> 🔒 **[Verify these stats →](https://pilotstack.app/r/recording-1282025)** - Click the badge or link to see the full verified recording on pilotstack.

---

*Verified by [pilotstack](https://pilotstack.app) - The Strava for Work*
```

Read our [Contributing Guidelines](CONTRIBUTING.md) for more details.

### Code Quality Standards

- 📝 TypeScript strict mode
- 🔒 Zod validation for all IPC handlers
- 📏 Files ≤500 lines (split larger files)
- 📖 JSDoc comments for public APIs
- ✅ Type all function parameters and returns
- 🧪 Manual testing in dev mode required

---

## 📋 System Requirements

### Minimum Requirements

| OS | Version |
|----|---------|
| **macOS** | 10.15 (Catalina) or later |
| **Windows** | Windows 10 (64-bit) or later |
| **Linux** | Ubuntu 18.04+, Fedora 30+, or equivalent |

### Required Permissions

- 🖥️ **Screen Recording** - To capture your workflow
- ⌨️ **Accessibility** (macOS) - For keyboard/mouse activity detection
- 🌐 **Network** - For cloud sync features (optional)

First launch will prompt for these permissions - they're essential for the app to function.

---

## 🌟 Community

Join our growing community of authentic creators!

<div align="center">

[![Twitter](https://img.shields.io/badge/Twitter-Follow_Us-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/pilotstack_app)
[![GitHub Discussions](https://img.shields.io/badge/GitHub-Discussions-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/pilotstack-app/pilotstack-desktop/discussions)

</div>

- 💬 **[Discussions](https://github.com/pilotstack-app/pilotstack-desktop/discussions)** - Ask questions and share ideas
- 🐛 **[Issues](https://github.com/pilotstack-app/pilotstack-desktop/issues)** - Report bugs or request features
- 📧 **[Email](mailto:pilotstack.app@gmail.com)** - Direct support
- 🌐 **[Website](https://pilotstack.app)** - Web dashboard and cloud platform
- 📚 **[Documentation](https://docs.pilotstack.app)** - Comprehensive guides

---

## 🔗 Related Projects

- **[pilotstack Web](https://pilotstack.app)** - Cloud platform for sharing and discovering verified work
- **[pilotstack Browser Extension](https://github.com/pilotstack-app/pilotstack-extension)** - Capture web-based work sessions
- **[pilotstack API](https://github.com/pilotstack-app/pilotstack-api)** - Public API documentation

---

## 📊 Project Stats

<div align="center">

![GitHub repo size](https://img.shields.io/github/repo-size/pilotstack-app/pilotstack-desktop?style=flat-square)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/pilotstack-app/pilotstack-desktop?style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/pilotstack-app/pilotstack-desktop?style=flat-square)

</div>

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### What does this mean?

- ✅ **Freedom to use** - Use for any purpose, including commercial
- ✅ **Freedom to study** - Access the source code and understand how it works
- ✅ **Freedom to modify** - Make changes and improvements
- ✅ **Freedom to share** - Distribute copies of the original or modified versions

**Important:** If you run a modified version as a network service (SaaS), you **must** release your source code under AGPL-3.0 as well. This ensures the software remains free and open.

See the [LICENSE](LICENSE) file for full legal details.

---

## 🙏 Acknowledgments

pilotstack Desktop is built on the shoulders of giants:

- **[Electron](https://electronjs.org)** - Cross-platform desktop framework
- **[FFmpeg](https://ffmpeg.org)** - Video processing powerhouse
- **[React](https://react.dev)** - UI library
- **[Tailwind CSS](https://tailwindcss.com)** - Styling framework
- **[sharp](https://sharp.pixelplumbing.com)** - High-performance image processing
- **[uiohook-napi](https://github.com/SnosMe/uiohook-napi)** - Cross-platform input hooks

And all our amazing [contributors](https://github.com/pilotstack-app/pilotstack-desktop/graphs/contributors)!

---

## 🚀 Roadmap

Curious what's next? Check out our [GitHub Projects](https://github.com/orgs/pilotstack-app/projects) for:

- 🎯 Upcoming features
- 🐛 Known issues being worked on
- 💡 Community feature requests
- 📅 Release timeline

Want to influence the roadmap? Join the discussion!

---

<div align="center">

**Built with ❤️ by the [pilotstack](https://pilotstack.app) team**

[Get Started](https://github.com/pilotstack-app/pilotstack-desktop/releases) • 
[Documentation](https://docs.pilotstack.app) • 
[Community](https://github.com/pilotstack-app/pilotstack-desktop/discussions) • 
[Support](mailto:pilotstack.app@gmail.com)

⭐ **Star us on GitHub** — it helps!

</div>
