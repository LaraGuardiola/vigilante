# AGENTS.md - Agentic Coding Guidelines for Vigilante

This file provides guidelines for agentic coding agents operating in this repository.

## Project Overview

Vigilante is a TypeScript/Bun-based security camera streaming server. It serves:
- A mobile client (`/camera`) for streaming camera feeds
- A viewer client (root URL) for viewing multiple camera streams
- WebSocket-based real-time communication
- AI-powered person detection using TensorFlow.js

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
```bash
bun tsc --noEmit
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
- **Runtime**: Bun (use Bun APIs like `Bun.serve`, `file()`, etc.)
- **TypeScript**: Strict mode enabled in `tsconfig.json`

### File Organization
- Single main entry point: `index.ts`
- Keep related code in the same file unless it grows significantly
- Certificate files in `./certs/` directory

### TypeScript Conventions

**Types & Interfaces**
```typescript
// Use interfaces for object shapes
interface CameraData {
  name: string;
  resolution: string;
  ws: any;
}

// Use explicit return types for public methods
async detectPerson(frameBase64: string): Promise<{
  hasPerson: boolean;
  count: number;
  confidence: number;
  boxes: Array<{ x: number; y: number; width: number; height: number }>;
}> {
  // ...
}
```

**Type Annotations**
- Use explicit types for function parameters and return types
- Use `any` sparingly - prefer explicit types when possible
- Enable strict TypeScript settings in tsconfig.json

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

### WebSocket Patterns

```typescript
// Server WebSocket handling
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

### HTML/CSS in TypeScript

- Store HTML templates as template literals
- Use inline styles for embedded HTML
- Keep CSS minimal and embedded in the HTML

### AI/ML Integration

- Load models lazily (only when needed)
- Handle model loading errors gracefully
- Provide fallback behavior when AI is unavailable

## Common Tasks

### Adding a New WebSocket Message Type
1. Add the case to the switch in `handleWebSocketMessage`
2. Define the expected data shape
3. Handle the message in both client and server

### Modifying the UI
- Mobile client: Edit `MOBILE_CLIENT_HTML` constant
- Viewer client: Edit `VIEWER_CLIENT_HTML` constant (uses a function to inject localIP/port)

### Changing the Port
Update the `PORT` constant at the top of `index.ts`

### Adding Dependencies
```bash
bun add <package>
```
