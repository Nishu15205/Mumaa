import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import { Database } from 'bun:sqlite'

// ─── Database ──────────────────────────────────────────────────────────────

const DB_PATH = '../../db/custom.db'

let db: Database | null = null

try {
  db = new Database(DB_PATH, { readonly: true })
  console.log('[db] Connected to SQLite database via bun:sqlite')
} catch (err) {
  console.warn('[db] Could not open database, running without DB access:', (err as Error).message)
}

/** Safely query user info from the database */
function getUserById(userId: string): { id: string; name: string; role: string } | null {
  if (!db) return null
  try {
    const row = db.query('SELECT id, name, role FROM User WHERE id = ?').get(userId) as any
    return row ? { id: row.id, name: row.name, role: row.role } : null
  } catch {
    return null
  }
}

/** Safely query a call session by id */
function getCallSession(callId: string): any {
  if (!db) return null
  try {
    return db.query('SELECT * FROM CallSession WHERE id = ?').get(callId)
  } catch {
    return null
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface AuthPayload {
  userId: string
  role: string
}

interface OnlineUser {
  userId: string
  role: string
  connectedAt: number
  socketId: string
}

// ─── State ─────────────────────────────────────────────────────────────────

const PORT = 3003

/** userId → socket.id */
const userSockets = new Map<string, string>()

/** socket.id → userId */
const socketUsers = new Map<string, string>()

/** Set of currently online userIds */
const onlineUsers = new Set<string>()

/** Detailed online user info */
const onlineUserInfo = new Map<string, OnlineUser>()

// ─── HTTP & Socket.IO Server ───────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  // ─── HTTP API for server-to-server event emission ───────────────
  if (req.method === 'POST' && req.url === '/emit') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const { toUserId, event, data } = JSON.parse(body)
        if (!toUserId || !event) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'toUserId and event are required' }))
          return
        }

        const target = getSocketByUserId(toUserId)
        if (target) {
          target.emit(event, data || {})
          console.log(`[http-emit] -> ${event} to ${toUserId}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, delivered: true }))
        } else {
          console.log(`[http-emit] -> ${event} to ${toUserId} FAILED (offline)`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, delivered: false, reason: 'user_offline' }))
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      }
    })
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', onlineUsers: onlineUsers.size, port: PORT }))
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

const io = new Server(httpServer, {
  path: '/socket.io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ─── Helpers ───────────────────────────────────────────────────────────────

function getSocketByUserId(userId: string): Socket | undefined {
  const socketId = userSockets.get(userId)
  if (!socketId) return undefined
  return io.sockets.sockets.get(socketId)
}

function getOnlineUsersList(): OnlineUser[] {
  return Array.from(onlineUserInfo.values())
}

function log(socket: Socket, event: string, data?: unknown) {
  const userId = socketUsers.get(socket.id) || socket.id
  const ts = new Date().toISOString().split('T')[1].slice(0, 12)
  if (data) {
    console.log(`[${ts}] [${userId}] ${event}:`, typeof data === 'string' ? data : JSON.stringify(data))
  } else {
    console.log(`[${ts}] [${userId}] ${event}`)
  }
}

// ─── Connection ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address || 'unknown'
  console.log(`[+] Connection ${socket.id} from ${clientIp} (total: ${io.sockets.sockets.size})`)

  // Send the current online users list to this new client
  socket.emit('online-users', { users: getOnlineUsersList() })

  // ─── Auth ───────────────────────────────────────────────────────────────

  socket.on('auth', (payload: AuthPayload) => {
    const { userId, role } = payload

    if (!userId || !role) {
      log(socket, 'auth failed — missing userId or role')
      socket.emit('auth-error', { message: 'Authentication failed: missing credentials' })
      return
    }

    // Optionally verify user exists in the database
    const user = getUserById(userId)
    if (user) {
      log(socket, 'auth verified from DB', { name: user.name, role: user.role })
    } else if (db) {
      log(socket, 'auth — user not found in DB, allowing anyway')
    } else {
      log(socket, 'auth — no DB, trusting client-provided role')
    }

    // Store socket ↔ user mappings
    socket.data.userId = userId
    socket.data.role = role
    userSockets.set(userId, socket.id)
    socketUsers.set(socket.id, userId)
    onlineUsers.add(userId)
    onlineUserInfo.set(userId, {
      userId,
      role,
      connectedAt: Date.now(),
      socketId: socket.id,
    })

    // Have the socket join its own room and a role-based room
    socket.join(`user:${userId}`)
    socket.join(`role:${role.toLowerCase()}`)

    // Broadcast presence to everyone
    io.emit('user-online', { userId, role })
    io.emit('online-users', { users: getOnlineUsersList() })

    // Send auth confirmation back
    socket.emit('auth-success', { userId, role })

    console.log(`[ok] ${userId} (${role}) authenticated — online: ${onlineUsers.size}`)
  })

  // ─── Incoming Call (parent → nanny) ─────────────────────────────────────

  socket.on('incoming-call', (payload: { toUserId: string; callId: string; callerName: string; callType?: string }) => {
    const { toUserId, callId, callerName, callType } = payload
    log(socket, 'incoming-call', { toUserId, callId })

    const callerId = socket.data.userId
    if (!callerId) {
      log(socket, 'incoming-call rejected — not authenticated')
      return
    }

    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('incoming-call', {
        callId,
        callerId,
        callerName: callerName || 'Unknown',
        callerAvatar: null,
        callType: callType || 'INSTANT',
      })
      log(socket, '-> incoming-call delivered', { toUserId, callId })
    } else {
      log(socket, '-> incoming-call FAILED — target offline', { toUserId })
      socket.emit('call-error', { callId, toUserId, error: 'User is currently offline' })
    }
  })

  // ─── Call Accepted (nanny → parent) ─────────────────────────────────────

  socket.on('call-accepted', (payload: { callId: string; toUserId: string; roomName?: string }) => {
    const { callId, toUserId, roomName } = payload
    log(socket, 'call-accepted', { callId, toUserId })

    const accepterId = socket.data.userId
    if (!accepterId) return

    const target = getSocketByUserId(toUserId)
    if (target) {
      // Look up call session for extra data
      const session = getCallSession(callId)
      target.emit('call-accepted', {
        callId,
        accepterId,
        roomName: roomName || session?.callRoomId || null,
      })
      log(socket, '-> call-accepted delivered', { toUserId })
    }
  })

  // ─── Call Rejected ──────────────────────────────────────────────────────

  socket.on('call-rejected', (payload: { callId: string; toUserId: string }) => {
    const { callId, toUserId } = payload
    log(socket, 'call-rejected', { callId, toUserId })

    const rejecterId = socket.data.userId
    if (!rejecterId) return

    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('call-rejected', { callId, rejecterId })
      log(socket, '-> call-rejected delivered', { toUserId })
    }
  })

  // ─── Call Ended ─────────────────────────────────────────────────────────

  socket.on('call-ended', (payload: { callId: string; toUserId: string; reason?: string }) => {
    const { callId, toUserId, reason } = payload
    log(socket, 'call-ended', { callId, toUserId, reason })

    const enderId = socket.data.userId
    if (!enderId) return

    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('call-ended', { callId, enderId, reason })
      log(socket, '-> call-ended delivered', { toUserId })
    }
  })

  // ─── New Notification ───────────────────────────────────────────────────

  socket.on('new-notification', (payload: { toUserId: string; notification: any }) => {
    const { toUserId, notification } = payload
    log(socket, 'new-notification', { toUserId, type: notification?.type })

    const target = getSocketByUserId(toUserId)
    if (target) {
      const enriched = {
        ...notification,
        id: notification?.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        timestamp: new Date().toISOString(),
      }
      target.emit('new-notification', { notification: enriched })
      log(socket, '-> new-notification delivered', { toUserId })
    } else {
      log(socket, '-> new-notification skipped — user offline', { toUserId })
    }
  })

  // ─── Typing Indicator ───────────────────────────────────────────────────

  socket.on('typing', (payload: { toUserId: string; conversationId: string; isTyping?: boolean }) => {
    const { toUserId, conversationId, isTyping } = payload
    const senderId = socket.data.userId
    if (!senderId) return

    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('typing', {
        userId: senderId,
        conversationId,
        isTyping: isTyping !== false,
        timestamp: Date.now(),
      })
    }
  })

  // ─── WebRTC Signaling: relay offers, answers, and ICE candidates ───────

  socket.on('webrtc-offer', (payload: { callId: string; toUserId: string; sdp: any }) => {
    const { callId, toUserId, sdp } = payload
    const fromUserId = socket.data.userId
    if (!fromUserId) return
    log(socket, 'webrtc-offer', { callId, to: toUserId })
    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('webrtc-offer', { callId, fromUserId, sdp })
    }
  })

  socket.on('webrtc-answer', (payload: { callId: string; toUserId: string; sdp: any }) => {
    const { callId, toUserId, sdp } = payload
    const fromUserId = socket.data.userId
    if (!fromUserId) return
    log(socket, 'webrtc-answer', { callId, to: toUserId })
    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('webrtc-answer', { callId, fromUserId, sdp })
    }
  })

  socket.on('webrtc-ice-candidate', (payload: { callId: string; toUserId: string; candidate: any }) => {
    const { callId, toUserId, candidate } = payload
    const fromUserId = socket.data.userId
    if (!fromUserId) return
    // Don't log every ICE candidate (too noisy)
    const target = getSocketByUserId(toUserId)
    if (target) {
      target.emit('webrtc-ice-candidate', { callId, fromUserId, candidate })
    }
  })

  // ─── Disconnect ─────────────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    log(socket, 'disconnect', { reason })

    const userId = socketUsers.get(socket.id)
    if (userId) {
      const role = socket.data.role

      // Clean up all mappings
      userSockets.delete(userId)
      socketUsers.delete(socket.id)
      onlineUsers.delete(userId)
      onlineUserInfo.delete(userId)

      // Broadcast offline status
      io.emit('user-offline', { userId, role })
      io.emit('online-users', { users: getOnlineUsersList() })

      console.log(`[-] ${userId} (${role}) disconnected — online: ${onlineUsers.size}`)
    }

    console.log(`[-] Socket ${socket.id} dropped (${reason}) — total: ${io.sockets.sockets.size}`)
  })

  // ─── Error Handling ─────────────────────────────────────────────────────

  socket.on('error', (error) => {
    console.error(`[!] Socket error (${socket.id}):`, error?.message || error)
  })
})

// ─── Start ─────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log('')
  console.log('=======================================================')
  console.log('  MUMAA Socket Service')
  console.log(`  Port: ${PORT}`)
  console.log(`  DB:   ${db ? DB_PATH : 'not available'}`)
  console.log('  CORS: all origins enabled')
  console.log('  Ready for connections')
  console.log('=======================================================')
  console.log('')
})

// ─── Graceful Shutdown ─────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\n[!] ${signal} received, shutting down...`)

  io.emit('server-shutdown', { message: 'Server shutting down', timestamp: new Date().toISOString() })
  io.disconnectSockets(true)

  httpServer.close(() => {
    if (db) db.close()
    console.log('[ok] Socket service stopped')
    process.exit(0)
  })

  setTimeout(() => {
    console.error('[!] Forced shutdown after timeout')
    process.exit(1)
  }, 5000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  console.error('[!!!] Uncaught exception:', err)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error('[!!!] Unhandled rejection:', reason)
})
