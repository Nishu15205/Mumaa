---
## Task ID: 4 - realtime-service
### Work Task
Build a Socket.IO mini-service for real-time features of the MUMAA Video Call Platform.

### Work Summary

#### Files Created (2 new files):

1. **`mini-services/realtime-service/package.json`** — Standalone bun project manifest:
   - Package name: `mumaa-realtime-service`
   - Dependencies: `socket.io@^4.8.3`
   - Dev dependencies: `@types/bun`
   - Dev script: `bun --hot index.ts`

2. **`mini-services/realtime-service/index.ts`** — Complete Socket.IO server (344 lines):

   **State Management:**
   - `userSockets` Map (userId → socket.id) for targeted messaging
   - `socketUsers` Map (socket.id → userId) for reverse lookups
   - `onlineUsers` Set for quick presence checks
   - `onlineUserInfo` Map with detailed OnlineUser info (userId, role, connectedAt)

   **Event Handlers Implemented:**

   | Event | Direction | Payload | Emitted To |
   |-------|-----------|---------|------------|
   | `auth` | Client → Server | `{ userId, role }` | Broadcasts `user-online` to all + sends `online-users` list |
   | `call-request` | Client → Server | `{ toUserId, callId, callerName, callerRole }` | Emits `incoming-call` to target; `call-error` to caller if offline |
   | `call-accept` | Client → Server | `{ callId, toUserId }` | Emits `call-accepted` to caller |
   | `call-reject` | Client → Server | `{ callId, toUserId }` | Emits `call-rejected` to caller |
   | `call-end` | Client → Server | `{ callId, toUserId }` | Emits `call-ended` to other party |
   | `send-notification` | Client → Server | `{ toUserId, notification: { type, title, message, data } }` | Emits `new-notification` to target with generated id + timestamp |
   | `typing` | Client → Server | `{ toUserId, conversationId }` | Emits `user-typing` to target |
   | `signal` | Client → Server | `{ toUserId, signal, callId }` | Emits `signal` to target (WebRTC pass-through) |
   | `disconnect` | Server | N/A | Broadcasts `user-offline` + `online-users` to all |

   **Server-Side Emitted Events:**
   - `online-users` — Full list of online users (sent on connect + on every presence change)
   - `user-online` — When a user authenticates
   - `user-offline` — When a user disconnects
   - `incoming-call` — Targeted to the call recipient
   - `call-accepted`, `call-rejected`, `call-ended` — Call lifecycle events
   - `new-notification` — Targeted notification delivery with auto-generated ID
   - `user-typing` — Typing indicator relay
   - `signal` — WebRTC signaling pass-through
   - `call-error` — Sent to caller when target is offline
   - `server-shutdown` — Broadcast on graceful shutdown

   **Infrastructure:**
   - Uses `http.createServer()` with Socket.IO server on port 3003
   - CORS: all origins, all methods, all headers (behind Caddy gateway)
   - `path: '/'` for Caddy `XTransformPort` routing
   - Structured logging with timestamps, userIds, and event names
   - Graceful shutdown with SIGTERM/SIGINT handlers + 5s force-exit timeout
   - Uncaught exception and unhandled rejection handlers
   - `pingTimeout: 60000`, `pingInterval: 25000` for stable connections

   **Dependencies installed:** `socket.io@4.8.3`, `@types/bun@1.3.11`

#### Verification:
- Service starts successfully on port 3003
- Bun install completes without errors
- All TypeScript interfaces and event handlers properly typed
- Caddy-compatible configuration (path: '/', XTransformPort=3003 routing)
