import { createServer } from 'http'
import { Server } from 'socket.io'
import { Database } from 'bun:sqlite'

// ─── Database ──────────────────────────────────────────────────────────────

const DB_PATH = '../../db/custom.db'
let db: Database | null = null
try {
  db = new Database(DB_PATH, { readonly: true })
  console.log('[db] Connected')
} catch (err) {
  console.warn('[db] Not available:', (err as Error).message)
}

function getUserById(userId: string) {
  if (!db) return null
  try { return db.query('SELECT id, name, role FROM User WHERE id = ?').get(userId) as any } catch { return null }
}

function getCallSession(callId: string) {
  if (!db) return null
  try { return db.query('SELECT * FROM CallSession WHERE id = ?').get(callId) } catch { return null }
}

// ─── State ─────────────────────────────────────────────────────────────────

const SOCKET_PORT = 3003
const API_PORT = 3004

const userSockets = new Map<string, any>()
const socketUsers = new Map<string, string>()
const onlineUsers = new Set<string>()
const onlineUserInfo = new Map<string, any>()

function getSocketByUserId(userId: string) { return userSockets.get(userId) || null }

function broadcastOnlineUsers() {
  try { io.emit('online-users', { users: Array.from(onlineUserInfo.values()) }) } catch { /* ignore */ }
}

// ─── Socket.IO (port 3003) ────────────────────────────────────────────────

const httpServer = createServer()

const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['*'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} (${io.sockets.sockets.size})`)

  try { socket.emit('online-users', { users: Array.from(onlineUserInfo.values()) }) } catch { /* ignore */ }

  socket.on('auth', (payload: any) => {
    try {
      const { userId, role } = payload || {}
      if (!userId || !role) return
      const user = getUserById(userId)
      console.log(`[auth] ${user?.name || userId} (${role})`)
      socket.data = { userId, role }
      userSockets.set(userId, socket)
      socketUsers.set(socket.id, userId)
      onlineUsers.add(userId)
      onlineUserInfo.set(userId, { userId, role, connectedAt: Date.now(), socketId: socket.id })
      socket.join(`user:${userId}`)
      socket.join(`role:${role.toLowerCase()}`)
      io.emit('user-online', { userId, role })
      broadcastOnlineUsers()
      socket.emit('auth-success', { userId, role })
      console.log(`[ok] ${userId} online (${onlineUsers.size})`)
    } catch (err) { console.error('[auth] err:', err) }
  })

  socket.on('incoming-call', (p: any) => {
    try {
      const { toUserId, callId, callerName, callType } = p || {}
      if (!socket.data?.userId) return
      const t = getSocketByUserId(toUserId)
      if (t) {
        t.emit('incoming-call', { callId, callerId: socket.data.userId, callerName: callerName || 'Unknown', callerAvatar: null, callType: callType || 'INSTANT' })
        console.log(`[call] incoming -> ${toUserId}`)
      } else {
        console.log(`[call] incoming -> ${toUserId} OFFLINE`)
        socket.emit('call-error', { callId, toUserId, error: 'User is currently offline' })
      }
    } catch (err) { console.error('[call] err:', err) }
  })

  socket.on('call-accepted', (p: any) => {
    try {
      const { callId, toUserId, roomName } = p || {}
      if (!socket.data?.userId) return
      const t = getSocketByUserId(toUserId)
      if (t) {
        const s = getCallSession(callId)
        t.emit('call-accepted', { callId, accepterId: socket.data.userId, roomName: roomName || s?.callRoomId || null })
        console.log(`[call] accepted -> ${toUserId}`)
      }
    } catch (err) { console.error('[call-accepted] err:', err) }
  })

  socket.on('call-rejected', (p: any) => {
    try {
      const { callId, toUserId } = p || {}
      if (!socket.data?.userId) return
      const t = getSocketByUserId(toUserId)
      if (t) { t.emit('call-rejected', { callId, rejecterId: socket.data.userId }); console.log(`[call] rejected -> ${toUserId}`) }
    } catch (err) { console.error('[call-rejected] err:', err) }
  })

  socket.on('call-ended', (p: any) => {
    try {
      const { callId, toUserId, reason } = p || {}
      if (!socket.data?.userId) return
      const t = getSocketByUserId(toUserId)
      if (t) { t.emit('call-ended', { callId, enderId: socket.data.userId, reason }); console.log(`[call] ended -> ${toUserId}`) }
    } catch (err) { console.error('[call-ended] err:', err) }
  })

  socket.on('webrtc-offer', (p: any) => { try { const t = getSocketByUserId(p?.toUserId); if (t) t.emit('webrtc-offer', { callId: p?.callId, fromUserId: socket.data?.userId, sdp: p?.sdp }) } catch {} })
  socket.on('webrtc-answer', (p: any) => { try { const t = getSocketByUserId(p?.toUserId); if (t) t.emit('webrtc-answer', { callId: p?.callId, fromUserId: socket.data?.userId, sdp: p?.sdp }) } catch {} })
  socket.on('webrtc-ice-candidate', (p: any) => { try { const t = getSocketByUserId(p?.toUserId); if (t) t.emit('webrtc-ice-candidate', { callId: p?.callId, fromUserId: socket.data?.userId, candidate: p?.candidate }) } catch {} })

  socket.on('new-notification', (p: any) => {
    try {
      const t = getSocketByUserId(p?.toUserId)
      if (t) {
        t.emit('new-notification', { notification: { ...p.notification, timestamp: new Date().toISOString() } })
      }
    } catch { /* ignore */ }
  })

  socket.on('disconnect', (reason) => {
    try {
      const userId = socketUsers.get(socket.id)
      if (userId) {
        userSockets.delete(userId); socketUsers.delete(socket.id); onlineUsers.delete(userId); onlineUserInfo.delete(userId)
        io.emit('user-offline', { userId, role: socket.data?.role })
        broadcastOnlineUsers()
        console.log(`[-] ${userId} (${socket.data?.role}) — ${onlineUsers.size} online`)
      }
    } catch (err) { console.error('[disconnect] err:', err) }
  })

  socket.on('error', (e: any) => { console.error(`[!] ${socket.id}:`, e?.message || e) })
})

// ─── HTTP API (port 3004) — using http.createServer with TIMEOUT ──────────

const apiServer = createServer((req, res) => {
  const respond = (code: number, data: any) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(data))
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    respond(200, { status: 'ok', onlineUsers: onlineUsers.size, onlineList: Array.from(onlineUsers) })
    return
  }

  if (req.method === 'POST' && req.url === '/emit') {
    // CRITICAL: Set a timeout to prevent hanging if body stream never ends
    const timeout = setTimeout(() => { req.destroy(); respond(408, { error: 'timeout' }) }, 10000)
    let body = ''

    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('error', () => { clearTimeout(timeout); respond(400, { error: 'stream_error' }) })
    req.on('end', () => {
      clearTimeout(timeout)
      try {
        const { toUserId, event, data } = JSON.parse(body)
        if (!toUserId || !event) { respond(400, { error: 'toUserId and event required' }); return }

        const target = getSocketByUserId(toUserId)
        if (target) {
          target.emit(event, data || {})
          console.log(`[api] ${event} -> ${toUserId} ✓`)
          respond(200, { success: true, delivered: true })
        } else {
          console.log(`[api] ${event} -> ${toUserId} ✗ (offline)`)
          respond(200, { success: true, delivered: false, reason: 'user_offline' })
        }
      } catch (err) {
        respond(400, { error: 'invalid json' })
      }
    })
    return
  }

  respond(404, { error: 'Not Found' })
})

// ─── Start ─────────────────────────────────────────────────────────────────

httpServer.listen(SOCKET_PORT, () => {
  console.log(`Socket.IO on :${SOCKET_PORT}`)
  console.log(`HTTP API on :${API_PORT}`)
  console.log(`DB: ${db ? 'ok' : 'not available'}`)
  console.log('Ready!\n')
})

apiServer.listen(API_PORT, () => {
  console.log(`[api] HTTP API server on :${API_PORT}`)
})

// ─── NEVER crash ───────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => { console.error('[!!!] Exception:', err) })
process.on('unhandledRejection', (reason) => { console.error('[!!!] Rejection:', reason) })
