---
Task ID: 1
Agent: Main Agent
Task: Fix nanny call notification, add ringtone sound, fix client-side errors

Work Log:
- Diagnosed root cause: Socket service on port 3004 was completely down (ECONNREFUSED)
- Socket service was crashing due to Bun's `http.createServer` + `req.on('data')` hanging on POST bodies
- Rewrote socket service to use single port (3003) with both Socket.IO and HTTP API
- Fixed POST body reading by using `for await (const chunk of req)` async iterator pattern (Bun-compatible)
- Added keepalive mechanism (`setInterval`) to prevent Bun from exiting
- Deployed with auto-restart wrapper (`start.sh`) for resilience
- Updated API routes to use port 3003 for emit endpoint
- Created `src/lib/ringtone.ts` - Web Audio API ringtone utility with sweet two-tone bell sound
- Updated `IncomingCallDialog.tsx` to play ringtone on incoming call, stop on accept/decline/dismiss
- Updated `NannyCalls.tsx` to play notification beep when new incoming call detected via polling
- Fixed NannyCalls component: moved `fetchCalls` before its usage, wrapped in `useCallback`, added proper error logging
- Verified: socket service stable for 60+ seconds, POST /emit working, health check working

Stage Summary:
- Socket service is stable on port 3003 (single port for Socket.IO + HTTP API)
- Ringtone plays when incoming call arrives (Web Audio API - no audio files needed)
- Nanny calls page properly fetches and displays incoming calls with Accept/Decline buttons
- Incoming call dialog shows with ringtone animation and sound
- All API routes correctly point to port 3003

---
Task ID: 2
Agent: Main Agent
Task: Fix WebRTC video call connection failure (nanny black screen, parent stuck in connecting)

Work Log:
- Diagnosed ROOT CAUSE: Multiple socket connections per user causing WebRTC signaling to get lost
  - page.tsx creates Socket A for nanny → authenticated in socket service userSockets map
  - IncomingCallDialog creates temp Socket B → emits call-accepted → disconnects → DELETES nanny from userSockets!
  - VideoCallScreen creates Socket C → connecting... → may not be ready when parent sends offer
  - Parent sends webrtc-offer → socket service looks up nanny → NULL or wrong socket → OFFER LOST
- Solution: Single shared socket architecture
  - Added `socket` and `socketAuthenticated` to useAppStore (global shared state)
  - page.tsx creates socket once and stores it in app-store
  - VideoCallScreen reads from app-store instead of creating new socket
  - IncomingCallDialog uses shared socket instead of temp sockets
  - NannyCalls accept/decline uses shared socket instead of temp sockets
- Fixed socket service disconnect handler: only clear userSockets if disconnecting socket IS the current mapping
  - Prevents temp socket disconnects from clearing the real connection
- Files changed:
  - src/stores/app-store.ts — added socket/socketAuthenticated state
  - src/app/page.tsx — stores socket in app-store after creation
  - src/components/videocall/VideoCallScreen.tsx — uses shared socket from app-store
  - src/components/videocall/IncomingCallDialog.tsx — uses shared socket, no temp sockets
  - src/components/dashboard/nanny/NannyCalls.tsx — uses shared socket for accept/decline
  - mini-services/socket-service/index.ts — fixed disconnect handler

Stage Summary:
- Single shared socket per user — no more duplicate connections
- WebRTC signaling (offer/answer/ICE) uses the already-connected shared socket
- No more temp sockets that break the userSockets mapping
- Socket service handles disconnect gracefully (only removes mapping if it's THE current socket)

---
Task ID: 3
Agent: Main Agent
Task: Fix nanny side still showing timer after joining video call

Work Log:
- Diagnosed ROOT CAUSE: Socket service was dead (port 3003 not listening) — WebRTC signaling couldn't work at all
- Additionally found state management bug: when user switches roles (parent→nanny) in same tab, `waitingForNanny` persists in Zustand store, causing nanny to see waiting timer
- Key fixes applied:
  1. Socket service restarted and made more robust (heartbeat interval every 30s, keepalive interval every 1s)
  2. WebRTC signaling relay in socket service now logs offer/answer routing for debugging
  3. VideoCallScreen.tsx: Nanny can NEVER be in 'waiting' state — derived from `isCaller && waitingForNanny` instead of just `waitingForNanny`
  4. VideoCallScreen.tsx: Added socket-not-ready fallback UI (shows "Connecting to server..." with back button instead of blank screen)
  5. VideoCallScreen.tsx: Added `socketReady` state monitoring with connect/disconnect listeners
  6. NannyCalls.tsx: Explicitly sets `setWaitingForNanny(false)` before calling `startCall()`
  7. NannyCalls.tsx: Same fix in `handleJoinCall()` for nanny joining ACCEPTED calls
  8. IncomingCallDialog.tsx: Sets `setWaitingForNanny(false)` before `startCall()` for nanny
  9. WebRTCCall.tsx: Added Metered TURN servers (openrelay.metered.ca) for NAT traversal in restricted networks
  10. WebRTCCall.tsx: Inlined the offer handler (removed separate `acceptCall` callback) to avoid stale closure issues

- Files changed:
  - mini-services/socket-service/index.ts — WebRTC relay logging, heartbeat interval
  - src/components/videocall/VideoCallScreen.tsx — nanny state fix, socket-ready UI, socketReady monitoring
  - src/components/dashboard/nanny/NannyCalls.tsx — explicit waitingForNanny=false
  - src/components/videocall/IncomingCallDialog.tsx — explicit waitingForNanny=false
  - src/components/videocall/WebRTCCall.tsx — TURN servers, inlined offer handler

Stage Summary:
- Nanny will NEVER see the waiting timer — state is derived from isCaller (parent-only)
- Socket service is running with robust keepalive and debugging
- WebRTC has TURN servers for reliable NAT traversal
- Both sides show meaningful UI when socket is not ready
- WebRTC signaling is properly relayed and logged

---
Task ID: 4
Agent: Main Agent
Task: Make socket service persist as child process of Next.js dev server

Work Log:
- Root cause: Bun background processes get killed when the Bash tool session ends
- Socket service alone survives because it's forked as a detached process
- Solution: Modified package.json `dev` script to start socket service in background before Next.js
  - `"dev": "cd mini-services/socket-service && (bun index.ts &) && cd ../.. && next dev -p 3000 2>&1 | tee dev.log"`
- Created `package.json` for socket service (needed by container's mini-service auto-start)
- Socket service now persists reliably as a child of the `bun run dev` process
- Added WebRTC signaling debug logging to socket service (offer/answer routing)
- Verified: socket service stays alive for 50+ seconds independently

- Files changed:
  - package.json — dev script starts socket service before Next.js
  - mini-services/socket-service/package.json — created for container auto-start
