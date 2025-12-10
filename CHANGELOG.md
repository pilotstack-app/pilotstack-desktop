# Changelog

All notable changes to pilotstack Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🎯 In Development
- Multi-monitor recording support
- Custom watermark templates
- Cloud storage sync for recordings library
- Scheduled recording start/stop
- Integration with GitHub commits

---

## [7.8.0] - 2024-12-10

### ✨ Added
- Enhanced CI and Release workflows with improved security measures
- Support for promoting existing tags to latest without rebuilding
- Checksum generation for artifacts across all platforms

### 🔒 Security
- Added actor validation for workflow security
- Implemented minimal permissions model
- Added detailed security notices in workflows

---

## [7.7.0] - 2024-12-09

### 🔧 Changed
- Refactored ESLint configuration to improve TypeScript linting
- Replaced Gitleaks with TruffleHog for secret detection in CI
- Updated Dependabot settings to reduce PR frequency and group updates

### 🐛 Fixed
- Resolved all ESLint warnings and TypeScript errors
- Cleaned up unused ESLint directives in IPC handler files

---

## [7.6.0] - 2024-12-08

### ✨ Added
- Implemented Phase 5: Desktop App Integration for Project Management
- Enhanced auto-detection of projects ensuring projects are loaded before detection

### 🔧 Changed
- Updated CODEOWNERS and release workflow permissions

---

## [7.5.0] - 2024-12-07

### 🔧 Changed
- Refactored video generation handlers with enhanced error reporting
- Refactored IPC capture handlers to improve structure and error handling
- Implemented metrics.json handling for session data preservation

### 📚 Documentation
- Added comprehensive architecture documentation
- Updated project license information

---

## Earlier Versions

For earlier version history, see [GitHub Releases](https://github.com/pilotstack-app/pilotstack-desktop/releases).

## Core Features

### 🎬 Recording
- **Native FFmpeg Capture** - Direct FFmpeg screen capture for extended recording sessions
- **Background Recording** - Capture without workflow interruption
- **Adaptive Quality** - Automatic quality adjustment based on system load (5 levels)
- **Real-time HLS Streaming** - Efficient memory usage during long sessions
- **Session Recovery** - Automatic recovery after crashes or restarts
- **Emergency Stop** - Instant halt button for quick recording termination
- **Activity Tracking** - Comprehensive keyboard, mouse, and clipboard monitoring
- **Idle Detection** - Smart pause/resume based on user activity
- **Multi-Display Support** - Select specific screens or displays to record

### 🎥 Video Generation
- **Smart Timelapse** - Automatic compression of hours into engaging 30-second videos
- **FFmpeg Processing** - Professional-grade video encoding
- **Background Music** - Add music tracks (MP3, M4A) to your timelapses
- **Verified Badge Watermark** - Embed authenticity indicators in videos
- **Stats Overlay** - Display duration, activity score, and metrics
- **HLS to MP4 Conversion** - High-quality final export

### ✅ Verification System
- **Anti-cheat Detection** - Sophisticated activity scoring algorithms
- **Keyboard Analysis** - Typing patterns, WPM tracking, burst detection
- **Mouse Monitoring** - Click tracking, distance traveled, scroll events
- **Clipboard Detection** - Paste event monitoring and large paste flagging
- **Activity Scoring** - Comprehensive authenticity scores (0-100)
- **Verification Metrics** - Detailed breakdown of all tracked activities

### 🔒 Security
- **OAuth PKCE Flow** - Modern authentication without embedded secrets
- **Encrypted Storage** - OS-native credential encryption (Keychain/DPAPI/Secret Service)
- **HMAC-SHA256 Signing** - Cryptographically signed API requests
- **Zod Validation** - Runtime type checking on all IPC channels
- **Sandboxed Renderer** - Isolated UI process with no direct system access
- **Context Isolation** - Full Electron security enabled
- **Open Source** - Fully auditable codebase

### 💻 User Interface
- **Modern React Design** - Built with React 19 and Tailwind CSS
- **Real-time Stats** - Live display of recording metrics
- **Recordings Library** - Manage all your recordings with search and filter
- **Settings Management** - Comprehensive configuration options
- **Dark Mode** - Automatic theme based on OS preferences
- **Smooth Animations** - Framer Motion for polished interactions
- **Cross-Platform** - Consistent experience on macOS, Windows, and Linux

### 🛠️ Technical Stack
- **Electron** 33.2.1 - Desktop application framework
- **React** 19.2.1 - UI library
- **TypeScript** 5.6.3 - Type-safe development
- **Tailwind CSS** 3.4.15 - Utility-first styling
- **Vite** 6.0.1 - Lightning-fast dev server
- **FFmpeg** - Video processing (bundled)
- **Sharp** 0.34.5 - High-performance image processing
- **uiohook-napi** 1.5.4 - Cross-platform activity monitoring
- **pnpm** - Fast, efficient package manager

---

## Release Notes Format

Each release will include:

### Added
- New features and capabilities

### Changed
- Updates to existing functionality

### Deprecated
- Features marked for removal in future versions

### Removed
- Features removed in this version

### Fixed
- Bug fixes and issue resolutions

### Security
- Security fixes and improvements

---

## How to Update

### Automatic Updates (Recommended)

The app checks for updates automatically and prompts when a new version is available.

### Manual Update

1. Download the latest version from [Releases](https://github.com/pilotstack-app/pilotstack-desktop/releases)
2. Install over the existing version
3. Your settings and recordings are preserved

### Check Your Version

Go to **Settings → About** to see your current version.

---

## Migration Guides

### From Pre-Release to v1.0.0

If you used a pre-release version (0.x.x), your data will be automatically migrated:

- ✅ Recordings library preserved
- ✅ Settings migrated to new format
- ✅ Credentials re-encrypted with enhanced security
- ⚠️ Beta recordings may need re-upload (verification scores updated)

**Note:** Back up your `~/pilotstack` folder before upgrading if you have important recordings.

---

## Reporting Issues

Found a bug or have a feature request?

1. Check [existing issues](https://github.com/pilotstack-app/pilotstack-desktop/issues)
2. If not found, [open a new issue](https://github.com/pilotstack-app/pilotstack-desktop/issues/new)
3. Include:
   - Your OS and version
   - pilotstack Desktop version
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots or logs (if applicable)

---

## Links

- **Download:** [GitHub Releases](https://github.com/pilotstack-app/pilotstack-desktop/releases)
- **Documentation:** [docs.pilotstack.app](https://docs.pilotstack.app)
- **Web Platform:** [pilotstack.app](https://pilotstack.app)
- **Issues:** [GitHub Issues](https://github.com/pilotstack-app/pilotstack-desktop/issues)
- **Discussions:** [GitHub Discussions](https://github.com/pilotstack-app/pilotstack-desktop/discussions)

---

<div align="center">

**Built with ❤️ by the pilotstack team**

[Website](https://pilotstack.app) • [GitHub](https://github.com/pilotstack-app) • [Twitter](https://twitter.com/pilotstack_app)

</div>
