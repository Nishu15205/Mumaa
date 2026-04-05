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
