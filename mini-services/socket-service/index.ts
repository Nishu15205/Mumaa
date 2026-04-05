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

const PORT = 3003

const userSockets = new Map<string, any>()
const socketUsers = new Map<string, string>()
const onlineUsers = new Set<string>()
const onlineUserInfo = new Map<string, any>()

function getSocketByUserId(userId: string) { return userSockets.get(userId) || null }

function broadcastOnlineUsers() {
  try { io.emit('online-users', { users: Array.from(onlineUserInfo.values()) }) } catch { /* ignore */ }
}

// ─── HTTP Server with API routes ───────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = req.url || '/'

  // Let Socket.IO handle its own paths
  if (url.startsWith('/socket.io')) {
    return
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // Health check
  if (req.method === 'GET' && url === '/health') {
    const body = JSON.stringify({
      status: 'ok',
      onlineUsers: onlineUsers.size,
      onlineList: Array.from(onlineUsers),
    })
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
    return
  }

  // Emit event to a connected user — uses async iterator for reliable body reading in Bun
  if (req.method === 'POST' && url === '/emit') {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      const raw = Buffer.concat(chunks).toString()
      const { toUserId, event, data } = JSON.parse(raw)

      if (!toUserId || !event) {
        const errBody = JSON.stringify({ error: 'toUserId and event required' })
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(errBody)
        return
      }

      const target = getSocketByUserId(toUserId)
      if (target) {
        target.emit(event, data || {})
        console.log(`[api] ${event} -> ${toUserId} ✓`)
        const okBody = JSON.stringify({ success: true, delivered: true })
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(okBody)
      } else {
        console.log(`[api] ${event} -> ${toUserId} ✗ (offline)`)
        const offBody = JSON.stringify({ success: true, delivered: false, reason: 'user_offline' })
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(offBody)
      }
    } catch (err) {
      console.error('[api] emit error:', err)
      const errBody = JSON.stringify({ error: 'invalid json' })
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(errBody)
    }
    return
  }

  // 404 for everything else
  const notFound = JSON.stringify({ error: 'Not Found' })
  res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(notFound)
})

// ─── Socket.IO attached to same HTTP server ───────────────────────────────

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

  socket.on('call-joined', (p: any) => {
    try {
      const { callId, toUserId } = p || {}
      if (!socket.data?.userId) return
      const t = getSocketByUserId(toUserId)
      if (t) {
        t.emit('call-joined', { callId, joinerId: socket.data.userId })
        console.log(`[call] joined -> ${toUserId}`)
      }
    } catch (err) { console.error('[call-joined] err:', err) }
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

  socket.on('webrtc-offer', (p: any) => {
    try {
      const t = getSocketByUserId(p?.toUserId)
      if (t) {
        t.emit('webrtc-offer', { callId: p?.callId, fromUserId: socket.data?.userId, sdp: p?.sdp })
        console.log(`[webrtc] offer ${p?.callId?.slice(0,6)} ${socket.data?.userId?.slice(0,6)} -> ${p?.toUserId?.slice(0,6)}`)
      } else {
        console.log(`[webrtc] offer ${p?.callId?.slice(0,6)} -> ${p?.toUserId?.slice(0,6)} OFFLINE`)
      }
    } catch (e) { console.error('[webrtc-offer] err:', e) }
  })
  socket.on('webrtc-answer', (p: any) => {
    try {
      const t = getSocketByUserId(p?.toUserId)
      if (t) {
        t.emit('webrtc-answer', { callId: p?.callId, fromUserId: socket.data?.userId, sdp: p?.sdp })
        console.log(`[webrtc] answer ${p?.callId?.slice(0,6)} ${socket.data?.userId?.slice(0,6)} -> ${p?.toUserId?.slice(0,6)}`)
      } else {
        console.log(`[webrtc] answer ${p?.callId?.slice(0,6)} -> ${p?.toUserId?.slice(0,6)} OFFLINE`)
      }
    } catch (e) { console.error('[webrtc-answer] err:', e) }
  })
  socket.on('webrtc-ice-candidate', (p: any) => {
    try {
      const t = getSocketByUserId(p?.toUserId)
      if (t) {
        t.emit('webrtc-ice-candidate', { callId: p?.callId, fromUserId: socket.data?.userId, candidate: p?.candidate })
      }
    } catch (e) { console.error('[webrtc-ice] err:', e) }
  })

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
      socketUsers.delete(socket.id)
      if (userId) {
        // Only remove user-level state if this was THE socket mapped for that user
        // (prevents temp sockets from clearing the real connection)
        if (userSockets.get(userId) === socket) {
          userSockets.delete(userId)
          onlineUsers.delete(userId)
          onlineUserInfo.delete(userId)
          io.emit('user-offline', { userId, role: socket.data?.role })
          broadcastOnlineUsers()
        }
        console.log(`[-] ${socket.id} (${userId}) — ${onlineUsers.size} online`)
      }
    } catch (err) { console.error('[disconnect] err:', err) }
  })

  socket.on('error', (e: any) => { console.error(`[!] ${socket.id}:`, e?.message || e) })
})

// ─── Start ─────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Socket.IO + HTTP API on :${PORT}`)
  console.log(`DB: ${db ? 'ok' : 'not available'}`)
  console.log('Ready!\n')
})

// ─── NEVER crash ───────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => { console.error('[!!!] Exception:', err) })
process.on('unhandledRejection', (reason) => { console.error('[!!!] Rejection:', reason) })

// Keep process alive — Bun exits when event loop is empty
// The HTTP server listener should keep it alive
setInterval(() => {}, 1000)

// Periodic heartbeat log
setInterval(() => {
  const now = new Date().toLocaleTimeString('en-IN', { hour12: false })
  console.log(`[${now}] heartbeat — ${onlineUsers.size} users online`)
}, 30000)

// Explicitly prevent process exit
process.stdin.on('data', () => {})
