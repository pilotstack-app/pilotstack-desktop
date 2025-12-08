# pilotstack Desktop Architecture

This document provides a comprehensive overview of the pilotstack Desktop application architecture. It is intended for developers who want to understand, contribute to, or audit the codebase.

## Table of Contents

1. [Overview](#overview)
2. [Process Architecture](#process-architecture)
3. [Directory Structure](#directory-structure)
4. [IPC Communication](#ipc-communication)
5. [Data Flow](#data-flow)
6. [Security Model](#security-model)
7. [Key Systems](#key-systems)
8. [Technology Stack](#technology-stack)

---

## Overview

pilotstack Desktop is an Electron application that captures screen recordings and generates verified timelapse videos. The application follows Electron's multi-process architecture with strict security boundaries between processes.

### Core Capabilities

- **Screen Capture**: Records screen frames in the background
- **Activity Monitoring**: Tracks keyboard, mouse, and clipboard activity
- **Video Generation**: Converts frames to timelapse videos with FFmpeg
- **Cloud Sync**: Uploads recordings to pilotstack.app
- **Verification**: Calculates authenticity scores for anti-cheat protection

---

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS (Node.js)                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Core Infrastructure                        │    │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐    │    │
│  │  │  AppContext    │  │   AppState     │  │    AppError        │    │    │
│  │  │  (DI Container)│  │  (State Mgmt)  │  │  (Error Handling)  │    │    │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐     │
│  │    Managers     │  │    Services     │  │       Monitors          │     │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌─────────────────┐   │     │
│  │  │ Capture   │  │  │  │   Auth    │  │  │  │ Clipboard       │   │     │
│  │  │ Manager   │  │  │  │  Service  │  │  │  │ Monitor         │   │     │
│  │  ├───────────┤  │  │  ├───────────┤  │  │  ├─────────────────┤   │     │
│  │  │ Video     │  │  │  │  Upload   │  │  │  │ Keyboard        │   │     │
│  │  │ Manager   │  │  │  │  Service  │  │  │  │ Monitor         │   │     │
│  │  ├───────────┤  │  │  ├───────────┤  │  │  └─────────────────┘   │     │
│  │  │Recordings │  │  │  │  Window   │  │  │                         │     │
│  │  │ Manager   │  │  │  │  Service  │  │  │                         │     │
│  │  └───────────┘  │  │  └───────────┘  │  │                         │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         IPC Handler Layer                            │    │
│  │    • Zod Schema Validation         • Rate Limiting                   │    │
│  │    • Type-Safe Channels            • Error Boundaries                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                              contextBridge.exposeInMainWorld
                                         │
                              ┌──────────▼──────────┐
                              │      preload.ts     │
                              │  (Isolated Bridge)  │
                              └──────────┬──────────┘
                                         │
                                  window.pilotstack
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                         RENDERER PROCESS (React)                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           App.tsx (Router)                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐     │
│  │     Views       │  │   Components    │  │       Types             │     │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌─────────────────┐   │     │
│  │  │ Recording │  │  │  │ TitleBar  │  │  │  │ electron.d.ts   │   │     │
│  │  │ View      │  │  │  │ Controls  │  │  │  │ (API Types)     │   │     │
│  │  ├───────────┤  │  │  │ Stats     │  │  │  └─────────────────┘   │     │
│  │  │Processing │  │  │  │ Selector  │  │  │                         │     │
│  │  │ View      │  │  │  └───────────┘  │  │                         │     │
│  │  ├───────────┤  │  │                  │  │                         │     │
│  │  │ Completed │  │  │                  │  │                         │     │
│  │  │ View      │  │  │                  │  │                         │     │
│  │  └───────────┘  │  │                  │  │                         │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘     │
│                                                                              │
│  Security Constraints:                                                       │
│  • NO direct Node.js access                                                  │
│  • NO direct file system access                                              │
│  • NO direct network access                                                  │
│  • ALL operations through IPC                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Process Responsibilities

| Process | Responsibilities |
|---------|------------------|
| **Main Process** | System APIs, file I/O, FFmpeg, network requests, window management |
| **Renderer Process** | User interface, user interactions, state display |
| **Workers** | Background image processing, frame compression |

---

## Directory Structure

```
pilotstack-desktop/
├── electron/                    # Main Process (Node.js)
│   ├── main.ts                 # Entry point, app lifecycle
│   ├── preload.ts              # Context bridge (IPC exposure)
│   │
│   ├── config/                 # Configuration
│   │   ├── api.ts              # Centralized API URL config
│   │   ├── store.ts            # Electron-store configuration
│   │   └── types.ts            # Configuration types
│   │
│   ├── core/                   # Core Infrastructure
│   │   ├── app-context.ts      # Dependency injection container
│   │   ├── app-error.ts        # Error handling utilities
│   │   └── app-state.ts        # Application state management
│   │
│   ├── ipc/                    # IPC Handlers
│   │   ├── index.ts            # Handler registration
│   │   ├── schemas.ts          # Zod validation schemas
│   │   ├── validation.ts       # Validation utilities
│   │   ├── capture-handlers.ts # Screen capture
│   │   ├── video-handlers.ts   # Video generation
│   │   ├── auth-handlers.ts    # Authentication
│   │   ├── cloud-handlers.ts   # Cloud upload
│   │   └── recordings-handlers.ts  # Recordings library
│   │
│   ├── managers/               # Feature Managers
│   │   ├── capture/            # Screen capture system
│   │   │   ├── capture-manager.ts   # Main orchestrator
│   │   │   ├── capture-loop.ts      # Frame capture loop
│   │   │   ├── capture-state.ts     # State management
│   │   │   ├── quality-adapter.ts   # Adaptive quality
│   │   │   └── screen-capture.ts    # Platform capture
│   │   │
│   │   ├── video/              # Video generation
│   │   │   ├── video-manager.ts     # Main orchestrator
│   │   │   ├── hls-finalizer.ts     # HLS to MP4 conversion
│   │   │   ├── ffmpeg-builder.ts    # FFmpeg command builder
│   │   │   └── watermark-builder.ts # Watermark generation
│   │   │
│   │   ├── streaming/          # Real-time HLS encoding
│   │   │   ├── streaming-encoder.ts # Main encoder
│   │   │   ├── encoder-process.ts   # FFmpeg process mgmt
│   │   │   └── frame-buffer.ts      # Frame buffering
│   │   │
│   │   ├── capture-engine/     # Native FFmpeg capture (NEW)
│   │   │   ├── capture-service.ts   # High-level orchestrator
│   │   │   ├── ffmpeg-pipeline.ts   # FFmpeg process management
│   │   │   ├── platform-utils.ts    # Platform-specific inputs
│   │   │   └── index.ts             # Module exports
│   │   │
│   │   ├── metrics/            # Metrics aggregation (NEW)
│   │   │   ├── metrics-aggregator.ts # Centralized metrics
│   │   │   └── index.ts             # Module exports
│   │   │
│   │   ├── recordings/         # Recordings library
│   │   │   ├── store-operations.ts  # CRUD operations
│   │   │   └── upload-operations.ts # Upload management
│   │   │
│   │   ├── activity-manager.ts # Idle detection
│   │   ├── session-manager.ts  # Session recovery
│   │   └── updater-manager.ts  # Auto-updates
│   │
│   ├── monitors/               # System Monitors
│   │   ├── clipboard-monitor.ts # Paste detection
│   │   └── keyboard-monitor.ts  # Keystroke tracking
│   │
│   ├── services/               # Business Logic Services
│   │   ├── auth/               # Authentication
│   │   │   ├── auth-service.ts     # Token management
│   │   │   ├── token-manager.ts    # Secure storage
│   │   │   └── device-fingerprint.ts
│   │   │
│   │   ├── upload/             # Cloud Upload
│   │   │   ├── upload-service.ts   # Smart upload
│   │   │   ├── multipart-upload.ts # Large file upload
│   │   │   └── compression-service.ts
│   │   │
│   │   └── window/             # Window Management
│   │       ├── window-manager.ts   # Window lifecycle
│   │       ├── tray-manager.ts     # System tray
│   │       └── deep-link-handler.ts # OAuth callbacks
│   │
│   ├── utils/                  # Utilities
│   │   ├── ffmpeg/             # FFmpeg utilities
│   │   ├── watermark/          # Watermark rendering
│   │   ├── crypto-helpers.ts   # HMAC signing
│   │   ├── logger.ts           # File logging
│   │   └── platform.ts         # Platform detection
│   │
│   └── workers/                # Background Workers
│       ├── capture-processor.ts # Image compression
│       └── frame-processor.ts   # Frame validation
│
├── src/                        # Renderer Process (React)
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # Main component
│   ├── index.css              # Global styles
│   │
│   ├── components/            # UI Components
│   │   ├── TitleBar.tsx       # Window controls
│   │   ├── SourceSelector.tsx # Screen picker
│   │   ├── RecordingControls.tsx
│   │   ├── RecordingStats.tsx
│   │   ├── EmergencyStopButton.tsx
│   │   └── SessionRecoveryModal.tsx
│   │
│   ├── views/                 # Application Views
│   │   ├── RecordingView.tsx  # Main recording UI
│   │   ├── ProcessingView.tsx # Video generation
│   │   ├── CompletedView.tsx  # Post-recording
│   │   ├── RecordingsView.tsx # Library
│   │   └── SettingsView.tsx   # Configuration
│   │
│   └── types/                 # TypeScript Definitions
│       └── electron.d.ts      # IPC API types
│
├── packages/                   # Workspace Packages
│   ├── types/                 # @pilotstack/types
│   │   └── src/
│   │       ├── types.ts       # Shared types
│   │       └── constants.ts   # Shared constants
│   │
│   └── verification/          # @pilotstack/verification
│       └── src/
│           ├── calculator.ts  # Score calculation
│           ├── paste-analyzer.ts
│           └── activity-analyzer.ts
│
├── build/                     # Electron Builder Config
│   ├── entitlements.mac.plist # macOS entitlements
│   ├── entitlements.mac.inherit.plist
│   ├── info.plist             # macOS app info
│   └── installer.nsh          # Windows installer
│
├── assets/                    # Application Assets
│   └── icons/                 # App icons (all sizes)
│
└── .github/                   # GitHub Configuration
    └── workflows/
        ├── ci.yml             # CI pipeline
        └── release.yml        # Release pipeline
```

---

## IPC Communication

All communication between Main and Renderer processes uses Electron's IPC (Inter-Process Communication) with strict validation.

### IPC Architecture

```
┌──────────────────┐                    ┌──────────────────┐
│  Renderer (React)│                    │   Main (Node.js) │
│                  │                    │                  │
│  window.pilotstack                    │   ipcMain.handle │
│  .startCapture() │──── invoke ───────▶│  (capture:start) │
│                  │                    │        │         │
│                  │                    │   ┌────▼────┐    │
│                  │                    │   │ Zod     │    │
│                  │                    │   │ Schema  │    │
│                  │                    │   │Validate │    │
│                  │                    │   └────┬────┘    │
│                  │                    │        │         │
│                  │◀─── response ──────│   Handler()     │
└──────────────────┘                    └──────────────────┘
```

### Validation Pattern

All IPC handlers use Zod schemas for runtime validation:

```typescript
// electron/ipc/schemas.ts
export const captureStartSchema = z.object({
  sourceId: z.string().min(1).max(256),
}).strict();

// electron/ipc/capture-handlers.ts
handleWithValidation(
  "capture:start",
  captureStartSchema,
  async (event, data) => {
    // data is typed and validated
    return captureManager.start(data.sourceId);
  }
);
```

### IPC Channels

| Channel | Direction | Validation | Description |
|---------|-----------|------------|-------------|
| `capture:start` | invoke | ✅ Zod | Start recording (uses native capture if supported) |
| `capture:stop` | invoke | - | Stop recording (returns metrics from MetricsAggregator) |
| `capture:pause` | invoke | - | Pause recording (pauses activity tracking) |
| `capture:resume` | invoke | ✅ Zod | Resume recording |
| `capture:emergency-stop` | invoke | - | Force stop all capture |
| `recording:get-state` | invoke | - | Get current recording state with metrics |
| `recording:heartbeat` | send | - | Periodic session state updates (every 5s) |
| `video:generate` | invoke | ✅ Zod | Generate timelapse (auto-detects HLS/frames) |
| `video:progress` | send | - | Progress updates |
| `auth:get-token` | invoke | - | Get auth token |
| `auth:set-device-credentials` | invoke | ✅ Zod | Set credentials |
| `recordings:list` | invoke | - | List recordings |
| `recordings:add` | invoke | ✅ Zod | Add recording (now accepts `metrics` field) |
| `recordings:delete` | invoke | ✅ Zod | Delete recording |
| `cloud:upload-recording` | invoke | ✅ Zod | Upload to cloud (includes full metrics) |

---

## Data Flow

### Recording Flow (Native Capture)

```
User clicks "Start Recording"
         │
         ▼
┌─────────────────────────────────────┐
│ RecordingView.tsx                   │
│ handleStart()                       │
└──────────────┬──────────────────────┘
               │ window.pilotstack.startCapture({ sourceId })
               ▼
┌─────────────────────────────────────┐
│ IPC: capture:start                  │
│ Zod validates: { sourceId: string } │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ CaptureService.start()              │  ◀── NEW Native Capture
│ • Create session folder             │
│ • Spawn FFmpegPipeline              │
│ • Start MetricsAggregator           │
│ • Start activity monitors           │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ FFmpegPipeline (running)            │
│ • Capture screen → HLS segments     │
│ • Platform-specific input           │
│ • Auto-restart on crash             │
└──────────────┬──────────────────────┘
               │
               ├──────────────────────────────────┐
               │                                  ▼
               │               ┌─────────────────────────────────────┐
               │               │ MetricsAggregator (every 30s)       │
               │               │ • Flush metrics.json to disk        │
               │               │ • Compute activity scores           │
               │               └─────────────────────────────────────┘
               │
               │ IPC Event: recording:heartbeat
               ▼
┌─────────────────────────────────────┐
│ RecordingView.tsx                   │
│ Updates UI with live stats          │
└─────────────────────────────────────┘
```

### Recording Flow (Legacy Frame Capture)

```
User clicks "Start Recording"
         │
         ▼
┌─────────────────────────────────────┐
│ RecordingView.tsx                   │
│ handleStart()                       │
└──────────────┬──────────────────────┘
               │ window.pilotstack.startCapture({ sourceId })
               ▼
┌─────────────────────────────────────┐
│ IPC: capture:start                  │
│ Zod validates: { sourceId: string } │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ CaptureManager.start(sourceId)      │  ◀── Fallback path
│ • Create session folder             │
│ • Initialize streaming encoder      │
│ • Start capture loop                │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ Capture Loop (every 1000ms)         │
│ • Capture screen frame              │
│ • Check frame similarity            │
│ • Send to streaming encoder         │
│ • Emit progress event               │
└──────────────┬──────────────────────┘
               │ IPC Event: capture:frame-update
               ▼
┌─────────────────────────────────────┐
│ RecordingView.tsx                   │
│ Updates UI with live stats          │
└─────────────────────────────────────┘
```

### Video Generation Flow

```
User clicks "Generate Video"
         │
         ▼
┌─────────────────────────────────────┐
│ ProcessingView.tsx                  │
│ handleGenerate()                    │
└──────────────┬──────────────────────┘
               │ window.pilotstack.generateVideo({ sessionFolder, musicPath })
               ▼
┌─────────────────────────────────────┐
│ IPC: video:generate                 │
│ Zod validates session path          │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ VideoManager.generate()             │
│ • Detect session type (HLS/frames)  │
│ • Build FFmpeg command              │
│ • Add watermarks & music            │
│ • Execute FFmpeg                    │
└──────────────┬──────────────────────┘
               │ IPC Event: video:progress
               ▼
┌─────────────────────────────────────┐
│ ProcessingView.tsx                  │
│ Updates progress bar                │
└─────────────────────────────────────┘
```

### Authentication Flow

```
┌──────────────────┐                    ┌──────────────────┐
│   Desktop App    │                    │   Web Platform   │
│                  │                    │ (pilotstack.app) │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         │  1. Generate device fingerprint       │
         │     Open browser to /connect          │
         │────────────────────────────────────▶ │
         │                                       │
         │                    2. User logs in    │
         │                       with Clerk      │
         │                                       │
         │  3. Deep link callback:               │
         │     pilotstack://callback?            │
         │       accessToken=xxx&                │
         │       refreshToken=yyy&               │
         │       deviceSecret=zzz                │
         │◀───────────────────────────────────  │
         │                                       │
         │  4. Store credentials securely        │
         │     (Electron safeStorage)            │
         │                                       │
         │  5. API requests with HMAC signature  │
         │     Headers:                          │
         │     - Authorization: Bearer xxx       │
         │     - X-Device-ID: dev_xxx            │
         │     - X-Timestamp: 1234567890         │
         │     - X-Signature: hmac_sha256        │
         │────────────────────────────────────▶ │
         │                                       │
```

---

## Security Model

### Defense in Depth

```
┌──────────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Desktop App (User's Machine)               │  │
│  │  • Can be modified, debugged, reverse-engineered       │  │
│  │  • All data CAN be faked (recordings, activity)        │  │
│  │  • Assume complete compromise is possible              │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                              │
                    HTTPS (TLS 1.3)
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    TRUST BOUNDARY                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   API Gateway                           │  │
│  │  • Rate limiting         • Signature verification      │  │
│  │  • Token validation      • Request validation          │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                              │
┌───────────────────────────────────────────────────────────────┐
│                    TRUSTED ZONE                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 Cloud Platform                          │  │
│  │  • Server-side verification scoring                    │  │
│  │  • Anomaly detection      • Fraud prevention           │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Electron Security Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `nodeIntegration` | `false` | Prevent Node.js access in renderer |
| `contextIsolation` | `true` | Isolate preload from renderer |
| `sandbox` | `true` | Enable Chromium sandbox |
| `webSecurity` | `true` | Enable same-origin policy |

### Credential Storage

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sensitive Data Storage                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌─────────────────────────────────────┐  │
│  │ Access Token │────▶│ Electron safeStorage.encryptString() │  │
│  │ Refresh Token│     │ (macOS Keychain / Windows DPAPI)     │  │
│  │ Device Secret│     └─────────────────────────────────────┘  │
│  └──────────────┘                     │                         │
│                                       ▼                         │
│                      ┌─────────────────────────────────────┐   │
│                      │ electron-store (JSON file)          │   │
│                      │ Non-sensitive settings only         │   │
│                      └─────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Request Signing

All API requests are signed with HMAC-SHA256:

```typescript
// Signature: HMAC-SHA256(timestamp + "." + body, deviceSecret)
const signature = crypto
  .createHmac("sha256", deviceSecret)
  .update(`${timestamp}.${JSON.stringify(body)}`)
  .digest("hex");

// Request headers
{
  "Authorization": "Bearer at_xxx...",
  "X-Device-ID": "dev_xxx...",
  "X-Device-Fingerprint": "sha256_hash...",
  "X-Timestamp": "1733425200000",
  "X-Signature": "hmac_signature..."
}
```

---

## Key Systems

### Capture System

The capture system has two modes: **Native FFmpeg Capture** (default) and **Legacy Frame Capture** (fallback).

#### Native FFmpeg Capture (Recommended)

The new native capture system uses FFmpeg directly for screen capture, eliminating Node.js memory bloat:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CaptureService (NEW)                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                       FFmpegPipeline                                  │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐   │  │
│  │  │ Platform Input │  │   HLS Output   │  │   Auto-Restart       │   │  │
│  │  │ (gdigrab/avf)  │──│   (segments)   │──│ (max 3 attempts)     │   │  │
│  │  └────────────────┘  └────────────────┘  └──────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     MetricsAggregator (NEW)                           │  │
│  │  • Collects keyboard, mouse, clipboard metrics                       │  │
│  │  • Flushes metrics.json every 30 seconds                             │  │
│  │  • Computes activity scores and verification indicators              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Platform-Specific Input Formats:**

| Platform | FFmpeg Input | Description |
|----------|--------------|-------------|
| macOS | `avfoundation` | Uses AVFoundation for screen capture |
| Windows | `gdigrab` | Uses GDI for desktop capture |
| Linux | `x11grab` | Uses X11 for display capture |

**Key Benefits:**

- **No Windows restarts** - Native FFmpeg runs outside Node.js, eliminating memory bloat
- **10+ hour recording support** - HLS streaming means no 30,000+ frame files
- **Metrics never lost** - Persisted to disk every 30 seconds
- **Complete cloud sync** - All keyboard, mouse, clipboard data sent to API

#### Legacy Frame Capture (Fallback)

Used when native capture is unavailable:

```
┌─────────────────────────────────────────────────────────────┐
│                    Capture Manager (Legacy)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Capture Loop │  │Frame Processor│  │ Quality Adapter │   │
│  │ (1 sec/frame)│──│ (compression)│──│ (auto-adjust)   │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Streaming Encoder                      │   │
│  │  • Real-time HLS encoding                           │   │
│  │  • No 30,000+ frame files                           │   │
│  │  • Fast finalization (remux only)                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Adaptive Quality

The system automatically adjusts capture quality based on system load:

| Quality | Scale | JPEG Quality | Use Case |
|---------|-------|--------------|----------|
| `max` | 1.0x | 95% | Low load |
| `high` | 1.0x | 85% | Normal |
| `medium` | 0.8x | 75% | Medium load |
| `low` | 0.65x | 65% | High load |
| `ultra_low` | 0.5x | 50% | Critical load |

### Metrics System

The metrics system aggregates all input activity for verification scoring:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MetricsAggregator                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ KeyboardMonitor │  │ ClipboardMonitor│  │    ActivityManager          │ │
│  │  • Keystrokes   │  │  • Paste events │  │  • Idle detection           │ │
│  │  • WPM          │  │  • Paste sizes  │  │  • Active duration          │ │
│  │  • Mouse clicks │  │  • Large pastes │  │  • Activity ratio           │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                          │                  │
│           └────────────────────┼──────────────────────────┘                  │
│                                ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        metrics.json                                   │  │
│  │  {                                                                    │  │
│  │    "version": 1,                                                      │  │
│  │    "sessionId": "session_1733...",                                    │  │
│  │    "input": {                                                         │  │
│  │      "keyboard": { keystrokes, wpm, burstCount, ... },               │  │
│  │      "mouse": { clicks, distance, scrollEvents },                     │  │
│  │      "clipboard": { pasteCount, totalChars, largePastes }            │  │
│  │    },                                                                 │  │
│  │    "activity": { activityScore, hasNaturalTyping, ... }              │  │
│  │  }                                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  • Flushes to disk every 30 seconds                                         │
│  • Survives crashes and session recovery                                    │
│  • Sent to cloud API on upload finalization                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Metrics Schema:**

| Category | Field | Description |
|----------|-------|-------------|
| **Keyboard** | `estimatedKeystrokes` | Total key presses |
| | `averageWPM` | Average words per minute |
| | `peakWPM` | Maximum WPM burst |
| | `typingBurstCount` | Number of typing sessions |
| | `keyboardActiveTime` | Time with keyboard activity |
| **Mouse** | `mouseClicks` | Total mouse clicks |
| | `mouseDistance` | Pixels traveled |
| | `scrollEvents` | Scroll wheel events |
| **Clipboard** | `pasteEventCount` | Number of paste operations |
| | `totalPastedCharacters` | Characters pasted |
| | `largePasteCount` | Pastes > 500 characters |
| **Activity** | `activityRatio` | Active time / total time |
| | `activityScore` | Computed score (0-100) |
| | `hasNaturalTypingPattern` | Natural behavior indicator |

### Verification System

The verification system calculates authenticity scores:

```
Input Metrics:
├── Active Duration (vs total duration)
├── Paste Event Count & Sizes
├── Keyboard Activity (keystrokes, WPM)
├── Mouse Activity (clicks, scrolls)
└── Idle Periods

         ▼

┌─────────────────────────────────────┐
│     @pilotstack/verification        │
│  ┌─────────────┐  ┌─────────────┐  │
│  │   Paste     │  │  Activity   │  │
│  │  Analyzer   │  │  Analyzer   │  │
│  └─────────────┘  └─────────────┘  │
│           │              │          │
│           └──────┬───────┘          │
│                  ▼                  │
│         ┌─────────────┐             │
│         │ Calculator  │             │
│         └─────────────┘             │
└─────────────────────────────────────┘

         ▼

Output:
├── Score: 0-100
├── Is Verified: score >= 70
└── Analysis Details
```

---

## Technology Stack

### Desktop Application

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Electron | 33.x |
| UI Framework | React | 18.x |
| Language | TypeScript | 5.6.x |
| Build Tool | Vite | 6.x |
| Styling | Tailwind CSS | 3.x |
| Animations | Framer Motion | 11.x |
| Image Processing | Sharp | 0.34.x |
| Video Encoding | FFmpeg | (bundled) |
| System Hooks | uiohook-napi | 1.5.x |
| Storage | electron-store | 8.x |
| Validation | Zod | 3.24.x |

### Shared Packages

| Package | Purpose |
|---------|---------|
| `@pilotstack/types` | Shared TypeScript types |
| `@pilotstack/verification` | Verification algorithms |

### Build & Tooling

| Tool | Purpose |
|------|---------|
| pnpm | Package manager (workspaces) |
| Turborepo | Monorepo build orchestration |
| tsup | Package bundling |
| electron-builder | App packaging |

---

## Further Reading

- [README.md](README.md) - Getting started guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [pilotstack.app](https://pilotstack.app) - Web platform

---

*Document Version: 1.1*  
*Last Updated: December 2025*

### Changelog

**v1.1** (December 2025)
- Added Native FFmpeg Capture System (`CaptureService`, `FFmpegPipeline`)
- Added MetricsAggregator for centralized metrics collection
- Updated Recording Flow diagrams for both capture modes
- Added Metrics System documentation
- Added platform-specific capture input table
