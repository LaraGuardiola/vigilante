# AGENTS.md - Agentic Coding Guidelines for Vigilante

This file provides guidelines for agentic coding agents operating in this repository.

## Project Overview

Vigilante is a Bun-based security camera streaming server with real-time video monitoring and AI-powered person detection.

### Features
- **Mobile client** (`/camera`) - Stream camera feeds from mobile devices
- **Viewer client** (root URL) - View multiple camera streams on PC
- **Real-time streaming** - WebSocket-based low-latency video transmission
- **AI person detection** - TensorFlow.js with COCO-SSD model
- **Alert system** - Sound alerts and visual notifications when persons are detected
- **HTTPS** - Secure communication with SSL/TLS certificates

### Architecture

```
vigilante/
├── index.ts              # Server (Bun + WebSocket + TensorFlow.js)
├── public/               # Frontend static files
│   ├── index.html       # Viewer client (PC browser)
│   ├── camera.html      # Mobile camera client
│   ├── vigilante.css    # Shared styles
│   └── vigilante.js     # Client-side TypeScript (compiled to JS)
├── certs/               # SSL certificates
│   ├── key.pem
│   └── cert.pem
├── assets/              # Audio files
│   └── sound-effect.mp3
└── alerts/              # Saved detection screenshots
```

## Build & Run Commands

### Install Dependencies
```bash
bun install
```

### Run the Server
```bash
bun run index.ts
```

### Type Checking
Bun has built-in TypeScript support. No tsconfig.json needed - Bun transpiles TypeScript natively.

```bash
bun run index.ts   # Runs and transpiles automatically
```

### Testing
This project currently has no test suite. If tests are added:
```bash
bun test              # Run all tests
bun test <file>      # Run specific test file
bun test --watch     # Watch mode
```

### Linting
No linter is currently configured. Consider adding ESLint or Biome if needed.

## Code Style Guidelines

### Language & Runtime
- **Runtime**: Bun (use Bun APIs like `Bun.serve`, `file()`, `Bun.Transpiler`, etc.)
- **TypeScript**: Native support - no tsconfig.json needed

### File Organization
- Server code: `index.ts` (main entry point)
- Frontend: Static files in `public/` directory
- Certificate files in `./certs/` directory
- Alert images saved to `./alerts/` directory

### TypeScript Conventions

**Types & Interfaces**
```typescript
interface CameraData {
  name: string;
  resolution: string;
  ws: any;
}

async detectPerson(frameBase64: string): Promise<{
  hasPerson: boolean;
  count: number;
  confidence: number;
}> {
  // ...
}
```

**Type Annotations**
- Use explicit types for function parameters and return types
- Use `any` sparingly - prefer explicit types when possible

### Naming Conventions

- **Classes**: PascalCase (`CameraSecurityServer`, `PersonDetector`)
- **Functions/Variables**: camelCase (`getLocalIP`, `startStreaming`)
- **Constants**: UPPER_SNAKE_CASE for magic values (`PORT = 5174`, `CERTS_DIR = "./certs"`)
- **Interfaces**: PascalCase (`CameraData`)

### Import Style

```typescript
import { networkInterfaces } from "os";
import { file } from "bun";
```

- Use ES module syntax (import/export)
- Group external imports first, then local imports if any

### Formatting

- Use 2 spaces for indentation
- No semicolons at end of statements
- Use template literals for string interpolation
- Prefer const over let

### Error Handling

```typescript
try {
  // risky operation
} catch (error) {
  console.error("❌ Error message:", error);
  // handle gracefully or rethrow
} finally {
  // cleanup if needed
}
```

- Always log errors with meaningful messages
- Use meaningful error prefixes (e.g., "❌", "🔴")
- Provide helpful troubleshooting tips in error messages

### Logging

- Use console.log/console.error for logging
- Use emoji prefixes for status messages:
  - ✅ Success
  - ❌ Error
  - 📱 Mobile/Camera events
  - 🖥️ Server events
  - 🔐 Security/Certificates
  - 🚨 Alerts

### WebSocket Patterns

```typescript
Bun.serve({
  websocket: {
    open: (ws) => { /* client connected */ },
    message: (ws, message) => { /* handle message */ },
    close: (ws) => { /* client disconnected */ },
  },
});
```

- Always handle message parsing with try/catch
- Use JSON for message serialization
- Include message types in payloads (`{ type: "...", ... }`)

### Frontend Development

**File Structure**
- `public/index.html` - Viewer client (main page)
- `public/camera.html` - Mobile camera streaming page
- `public/vigilante.css` - Shared styles
- `public/vigilante.ts` - ES module with `CameraClient` and `ViewerClient` classes (served as JS via Bun.Transpiler)

**CSS Guidelines**
- Use CSS variables for colors and spacing
- Mobile-first responsive design
- Use `100dvh` for full viewport height on mobile
- Use flexbox for layout (body: flex column)
- Media queries for desktop (`min-width: 768px`)

**TypeScript Guidelines**
- Use ES modules (`<script type="module">`)
- Export classes: `CameraClient`, `ViewerClient`
- Bun transpiles `.ts` to JavaScript automatically on serve
- Handle WebSocket reconnection with exponential backoff
- Use `localStorage` for persisting user preferences

### AI/ML Integration

- Load models lazily (only when needed)
- Handle model loading errors gracefully
- Provide fallback behavior when AI is unavailable
- Use WASM backend for better performance

## Common Tasks

### Adding a New WebSocket Message Type
1. Add the case to the switch in `handleWebSocketMessage` in `index.ts`
2. Define the expected data shape
3. Handle the message in both client (`vigilante.ts`) and server (`index.ts`)

### Modifying the UI
- Mobile client: Edit `public/camera.html`
- Viewer client: Edit `public/index.html`
- Styles: Edit `public/vigilante.css`
- Client logic: Edit `public/vigilante.ts`

### Changing Configuration
These constants are defined at the top of `index.ts`:
- `PORT` - Server port (default: 5174)
- `CERTS_DIR` - SSL certificates directory
- `SOUND_EFFECT` - Path to alert sound file
- `DETECTION_INTERVAL` - AI detection interval in ms (default: 1000)

### Adding Dependencies
```bash
bun add <package>
```

### Setting up SSL Certificates
1. Create `certs/` directory in project root
2. Add `key.pem` and `cert.pem` files
3. Server will fail to start if certificates are missing
