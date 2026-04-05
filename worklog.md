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
