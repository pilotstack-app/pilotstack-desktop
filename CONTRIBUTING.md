# Contributing to pilotstack Desktop

Thank you for your interest in contributing to pilotstack Desktop! We welcome contributions from the community and are grateful for your help in making this project better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Security Guidelines](#security-guidelines)
- [Architecture Overview](#architecture-overview)
- [Getting Help](#getting-help)

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please be respectful and inclusive in all interactions.

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- [Node.js](https://nodejs.org/) 20 or higher
- [pnpm](https://pnpm.io/) 9 or higher
- Python 3.11 (required for native modules like `sharp` and `uiohook-napi`)
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/pilotstack-desktop.git
cd pilotstack-desktop
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/pilotstack-app/pilotstack-desktop.git
```

4. Create a feature branch:

```bash
git checkout -b feature/my-awesome-feature
```

## Development Setup

### Install Dependencies

```bash
# Install all dependencies
pnpm install

# Build workspace packages (required before first run)
pnpm run build:packages
```

### Run Development Mode

```bash
# Start the development server with hot-reload
pnpm run dev
```

This will:
1. Start the Vite dev server for the React renderer
2. Compile the Electron TypeScript
3. Launch Electron in development mode

### Useful Commands

```bash
# Type checking (both renderer and main process)
pnpm run type-check

# Linting
pnpm run lint

# Build for production
pnpm run build

# Build for specific platform
pnpm run build:mac
pnpm run build:win
pnpm run build:linux
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-dark-mode` - New features
- `fix/upload-timeout` - Bug fixes
- `docs/update-readme` - Documentation changes
- `refactor/capture-manager` - Code refactoring
- `chore/update-deps` - Maintenance tasks

### Commit Messages

Write clear, concise commit messages:

```
feat: add keyboard shortcut for pause/resume

- Add Cmd/Ctrl+Shift+P shortcut
- Update settings view with shortcut display
- Add ipc handler for global shortcuts
```

Follow the conventional commits format:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode (already configured)
- Always define types for function parameters and return values
- Prefer `interface` over `type` for object shapes
- Use Zod for runtime validation, especially in IPC handlers

```typescript
// ✅ Good
interface RecordingOptions {
  sourceId: string;
  quality: "low" | "medium" | "high";
}

async function startRecording(options: RecordingOptions): Promise<void> {
  // Implementation
}

// ❌ Avoid
async function startRecording(options: any) {
  // Implementation
}
```

### File Size Limit

**Files must be ≤500 lines.** If a file exceeds this limit:

1. Split it into smaller, focused modules
2. Create an `index.ts` that re-exports the public API
3. Group related functionality in subdirectories

Example structure:

```
electron/utils/watermark/
├── badge-filter.ts      # Badge rendering
├── stats-filter.ts      # Stats overlay
├── positioning.ts       # Position calculations
├── types.ts             # Type definitions
└── index.ts             # Re-exports
```

### IPC Security

All IPC handlers must use Zod validation:

```typescript
import { z } from "zod";
import { handleWithValidation } from "./validation";

const captureStartSchema = z.object({
  sourceId: z.string().min(1).max(256),
}).strict();

handleWithValidation("capture:start", captureStartSchema, async (event, data) => {
  // data is fully typed and validated
  return captureManager.start(data.sourceId);
});
```

### Documentation

- Document public APIs with JSDoc comments
- Include examples for complex functions
- Keep comments up-to-date with code changes

```typescript
/**
 * Calculates the verification score for a recording session.
 * 
 * @param metrics - Activity metrics from the recording
 * @param metrics.activeDuration - Active time in seconds
 * @param metrics.totalDuration - Total recording duration in seconds
 * @returns Verification score between 0 and 100
 * 
 * @example
 * const score = calculateScore({
 *   activeDuration: 3600,
 *   totalDuration: 4200,
 *   keystrokes: 5000
 * });
 */
export function calculateScore(metrics: ActivityMetrics): number {
  // Implementation
}
```

## Pull Request Process

### Verified Work Session

All Pull Requests must include a **Verified Work Session** badge to prove authorship and effort.

1. Record your coding session using pilotstack Desktop.
2. Once finished, upload the recording to pilotstack.app.
3. On the recording page, click "Add to GitHub PR".
4. Copy the Markdown snippet (Full format recommended).
5. Paste it at the top of your Pull Request description.

This helps maintain the integrity of our open-source community by verifying that contributions are made by real humans with actual effort.

### Before Submitting

1. **Sync with upstream:**

```bash
git fetch upstream
git rebase upstream/main
```

2. **Run all checks:**

```bash
pnpm run type-check
pnpm run lint
```

3. **Test your changes manually** in development mode

### Submitting a PR

1. Push your branch to your fork
2. Open a Pull Request against `main`
3. Fill out the PR template completely
4. Link any related issues
5. **Include your Verified Work Session badge**

### Review Process

- PRs require **2 approvals** before merging
- Security-sensitive files require review from the security team (see CODEOWNERS)
- All CI checks must pass
- Address review feedback promptly

### Security-Sensitive Files

The following files require security team review:

- `electron/ipc/` - IPC handlers
- `electron/services/auth/` - Authentication code
- `electron/config/` - Configuration and storage
- `electron/preload.ts` - Context bridge
- `electron/utils/crypto-helpers.ts` - Cryptographic utilities
- `.github/workflows/` - CI/CD pipelines
- `build/` - Build configuration
- `package.json` - Dependencies

## Security Guidelines

### Never Commit Secrets

- No API keys, tokens, or credentials in code
- No hardcoded URLs that contain sensitive information
- Use environment variables for configuration

```typescript
// ❌ Never do this
const API_KEY = "sk_live_xxxxx";

// ✅ Use environment variables or secure storage
const apiKey = process.env.API_KEY;
```

### IPC Security

- Always validate input with Zod schemas
- Use `.strict()` to reject unknown fields
- Implement rate limiting for sensitive operations
- Never expose Node.js APIs to the renderer

### Reporting Security Issues

**Do not open public issues for security vulnerabilities.**

Report security concerns to: **pilotstack.app@gmail.com**

## Architecture Overview

### Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS (Node.js)                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Capture Manager │  │  Upload Service │  │  Auth Service   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                              │                                   │
│                    ┌─────────┴─────────┐                        │
│                    │  IPC Handlers     │                        │
│                    │  (Zod validated)  │                        │
│                    └─────────┬─────────┘                        │
└──────────────────────────────┼──────────────────────────────────┘
                               │ contextBridge
┌──────────────────────────────┼──────────────────────────────────┐
│                    RENDERER PROCESS (React)                      │
│                    │                                             │
│               window.pilotstack                                  │
│               (isolated API)                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

| Directory | Description |
|-----------|-------------|
| `electron/` | Main process code (Node.js) |
| `electron/config/` | Configuration stores |
| `electron/core/` | Core application logic |
| `electron/ipc/` | IPC handlers with validation |
| `electron/managers/` | Business logic managers |
| `electron/monitors/` | Activity and idle monitoring |
| `electron/services/` | Auth, upload, window services |
| `electron/utils/` | Utilities (FFmpeg, crypto, etc.) |
| `electron/workers/` | Background workers |
| `src/` | Renderer process (React) |
| `src/components/` | Reusable UI components |
| `src/views/` | Application views/pages |
| `packages/types/` | Shared TypeScript types |
| `packages/verification/` | Verification algorithms |

### Key Patterns

1. **IPC Communication**: All main/renderer communication goes through validated IPC channels
2. **State Management**: Main process owns state; renderer receives updates via IPC
3. **Error Handling**: Use typed errors with proper logging
4. **Async Operations**: Use async/await with proper error boundaries

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/pilotstack-app/pilotstack-desktop/discussions)
- **Bugs**: Open an [Issue](https://github.com/pilotstack-app/pilotstack-desktop/issues) with reproduction steps
- **Security**: Email pilotstack.app@gmail.com

---

Thank you for contributing to pilotstack Desktop! 🚀
