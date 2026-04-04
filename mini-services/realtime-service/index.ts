import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthPayload {
  userId: string
  role: 'parent' | 'nanny' | 'admin'
}

interface CallRequestPayload {
  toUserId: string
  callId: string
  callerName: string
  callerRole: string
}

interface CallActionPayload {
  callId: string
  toUserId: string
}

interface NotificationPayload {
  toUserId: string
  notification: {
    type: string
    title: string
    message: string
    data?: Record<string, unknown>
  }
}

interface TypingPayload {
  toUserId: string
  conversationId: string
}

interface OnlineUser {
  userId: string
  role: string
  connectedAt: number
}

// ─── State ───────────────────────────────────────────────────────────────────

const PORT = 3003

/** Map of userId -> socket.id for targeted messaging */
const userSockets = new Map<string, string>()

/** Map of socket.id -> userId for reverse lookups */
const socketUsers = new Map<string, string>()

/** Set of online userIds for quick presence checks */
const onlineUsers = new Set<string>()

/** Detailed online user info list */
const onlineUserInfo = new Map<string, OnlineUser>()

// ─── HTTP & Socket.IO Server ────────────────────────────────────────────────

const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path — it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['*'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOnlineUsersList(): OnlineUser[] {
  return Array.from(onlineUserInfo.values())
}

function getSocketByUserId(userId: string): Socket | undefined {
  const socketId = userSockets.get(userId)
  if (!socketId) return undefined
  return io.sockets.sockets.get(socketId)
}

function logEvent(socket: Socket, event: string, data?: unknown) {
  const userId = socketUsers.get(socket.id) || socket.id
  const timestamp = new Date().toISOString()
  if (data) {
    console.log(`[${timestamp}] [${userId}] ${event}:`, JSON.stringify(data))
  } else {
    console.log(`[${timestamp}] [${userId}] ${event}`)
  }
}

// ─── Connection ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] New connection: ${socket.id} (total sockets: ${io.sockets.sockets.size})`)

  // Send current online users list to the newly connected client
  socket.emit('online-users', { users: getOnlineUsersList() })

  // ─── Authentication ──────────────────────────────────────────────────────

  socket.on('auth', (payload: AuthPayload) => {
    const { userId, role } = payload

    logEvent(socket, 'auth', { userId, role })

    // Store mappings
    socket.data.userId = userId
    socket.data.role = role
    userSockets.set(userId, socket.id)
    socketUsers.set(socket.id, userId)
    onlineUsers.add(userId)
    onlineUserInfo.set(userId, {
      userId,
      role,
      connectedAt: Date.now(),
    })

    // Notify all clients about the new online user
    io.emit('user-online', { userId, role })

    // Send updated online users list to everyone
    io.emit('online-users', { users: getOnlineUsersList() })

    console.log(`[✓] User ${userId} (${role}) authenticated — online users: ${onlineUsers.size}`)
  })

  // ─── Call Events ─────────────────────────────────────────────────────────

  socket.on('call-request', (payload: CallRequestPayload) => {
    const { toUserId, callId, callerName, callerRole } = payload
    logEvent(socket, 'call-request', { toUserId, callId, callerName, callerRole })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      const callerUserId = socket.data.userId
      targetSocket.emit('incoming-call', {
        callId,
        callerUserId,
        callerName,
        callerRole,
      })
      logEvent(socket, '→ incoming-call delivered', { toUserId, callId })
    } else {
      logEvent(socket, '→ incoming-call FAILED (user offline)', { toUserId })
      // Inform caller that the target is offline
      socket.emit('call-error', {
        callId,
        toUserId,
        error: 'User is currently offline',
      })
    }
  })

  socket.on('call-accept', (payload: CallActionPayload) => {
    const { callId, toUserId } = payload
    logEvent(socket, 'call-accept', { callId, toUserId })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      const accepterUserId = socket.data.userId
      targetSocket.emit('call-accepted', {
        callId,
        accepterUserId,
      })
      logEvent(socket, '→ call-accepted delivered', { toUserId, callId })
    }
  })

  socket.on('call-reject', (payload: CallActionPayload) => {
    const { callId, toUserId } = payload
    logEvent(socket, 'call-reject', { callId, toUserId })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      const rejecterUserId = socket.data.userId
      targetSocket.emit('call-rejected', {
        callId,
        rejecterUserId,
      })
      logEvent(socket, '→ call-rejected delivered', { toUserId, callId })
    }
  })

  socket.on('call-end', (payload: CallActionPayload) => {
    const { callId, toUserId } = payload
    logEvent(socket, 'call-end', { callId, toUserId })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      const enderUserId = socket.data.userId
      targetSocket.emit('call-ended', {
        callId,
        enderUserId,
      })
      logEvent(socket, '→ call-ended delivered', { toUserId, callId })
    }
  })

  // ─── Notification Events ────────────────────────────────────────────────

  socket.on('send-notification', (payload: NotificationPayload) => {
    const { toUserId, notification } = payload
    logEvent(socket, 'send-notification', { toUserId, type: notification.type })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      targetSocket.emit('new-notification', {
        ...notification,
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      })
      logEvent(socket, '→ new-notification delivered', { toUserId })
    } else {
      logEvent(socket, '→ new-notification NOT delivered (user offline)', { toUserId })
    }
  })

  // ─── Presence / Typing Events ───────────────────────────────────────────

  socket.on('typing', (payload: TypingPayload) => {
    const { toUserId, conversationId } = payload
    logEvent(socket, 'typing', { toUserId, conversationId })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      const senderUserId = socket.data.userId
      targetSocket.emit('user-typing', {
        userId: senderUserId,
        conversationId,
        timestamp: Date.now(),
      })
    }
  })

  // ─── WebRTC Signaling (pass-through) ────────────────────────────────────

  socket.on('signal', (payload: { toUserId: string; signal: unknown; callId: string }) => {
    const { toUserId, signal, callId } = payload
    logEvent(socket, 'signal', { toUserId, callId, signalType: typeof signal })

    const targetSocket = getSocketByUserId(toUserId)
    if (targetSocket) {
      const senderUserId = socket.data.userId
      targetSocket.emit('signal', {
        fromUserId: senderUserId,
        signal,
        callId,
      })
    }
  })

  // ─── Disconnect ─────────────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    logEvent(socket, 'disconnect', { reason })

    const userId = socketUsers.get(socket.id)
    if (userId) {
      const role = socket.data.role
      const wasOnline = onlineUsers.has(userId)

      // Clean up all mappings
      userSockets.delete(userId)
      socketUsers.delete(socket.id)
      onlineUsers.delete(userId)
      onlineUserInfo.delete(userId)

      // Broadcast offline status
      if (wasOnline) {
        io.emit('user-offline', { userId, role })
        io.emit('online-users', { users: getOnlineUsersList() })
        console.log(`[✗] User ${userId} (${role}) disconnected — online users: ${onlineUsers.size}`)
      }
    }

    console.log(`[-] Socket disconnected: ${socket.id} (reason: ${reason}) (total sockets: ${io.sockets.sockets.size})`)
  })

  // ─── Error Handling ─────────────────────────────────────────────────────

  socket.on('error', (error) => {
    console.error(`[!] Socket error (${socket.id}):`, error.message || error)
  })
})

// ─── Start Server ────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  MUMAA Realtime Service — Socket.IO Server`)
  console.log(`  Port: ${PORT}`)
  console.log(`  CORS: All origins enabled`)
  console.log(`  Ready for connections...`)
  console.log('═══════════════════════════════════════════════════════════')
})

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

function gracefulShutdown(signal: string) {
  console.log(`\n[!] Received ${signal}, shutting down gracefully...`)

  // Notify all connected clients
  io.emit('server-shutdown', {
    message: 'Server is shutting down for maintenance',
    timestamp: new Date().toISOString(),
  })

  // Close all sockets
  io.disconnectSockets(true)

  httpServer.close(() => {
    console.log('[✓] HTTP server closed')
    console.log('[✓] MUMAA Realtime Service stopped')
    process.exit(0)
  })

  // Force exit after 5 seconds if connections don't close
  setTimeout(() => {
    console.error('[!] Forcing shutdown after timeout')
    process.exit(1)
  }, 5000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[!!!] Uncaught Exception:', error)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error('[!!!] Unhandled Rejection:', reason)
})
