'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, Phone, Video } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { apiPut } from '@/lib/api'
import { toast } from 'sonner'
import type { IncomingCall } from '@/types'

interface IncomingCallDialogProps {
  call: IncomingCall | null
}

export function IncomingCallDialog({ call }: IncomingCallDialogProps) {
  const { startCall, setIncomingCall, currentCall } = useAppStore()
  const { user } = useAuthStore()
  const [timeLeft, setTimeLeft] = useState(30)
  const [accepting, setAccepting] = useState(false)

  const handleAccept = useCallback(async () => {
    if (!call || !user || accepting) return

    setAccepting(true)

    try {
      // Update call status to ACCEPTED via API
      await apiPut(`/api/calls/${call.callId}/status`, { status: 'ACCEPTED' })
    } catch {
      // Non-critical: continue even if status update fails
    }

    // Notify caller via socket that we accepted (with auth!)
    try {
      const { io } = await import('socket.io-client')
      const socket = io('/?XTransformPort=3003', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      })
      socket.on('connect', () => {
        socket.emit('auth', { userId: user?.id, role: user?.role })
        socket.emit('call-accepted', {
          callId: call.callId,
          toUserId: call.callerId,
          roomName: call.callRoomId || null,
        })
        setTimeout(() => socket.disconnect(), 1500)
      })
    } catch {
      // Non-critical: socket notification failed
    }

    // Build the correct room name — use the real callRoomId from the socket event
    const roomName = call.callRoomId || `mumaa-${call.callId}`

    // Create a CallSession from incoming call data
    const session: import('@/types').CallSession = {
      id: call.callId,
      parentId: user.role === 'PARENT' ? user.id : call.callerId,
      nannyId: user.role === 'NANNY' ? user.id : call.callerId,
      parentName: user.role === 'PARENT' ? user.name : call.callerName,
      nannyName: user.role === 'NANNY' ? user.name : call.callerName,
      parentAvatar: user.role === 'PARENT' ? (user.avatar || null) : call.callerAvatar,
      nannyAvatar: user.role === 'NANNY' ? (user.avatar || null) : call.callerAvatar,
      type: call.type,
      status: 'ACCEPTED',
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      duration: 0,
      price: 0,
      notes: null,
      callRoomId: roomName,
      rating: null,
      reviewComment: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    startCall(session)
    setIncomingCall(null)
  }, [call, user, startCall, setIncomingCall, accepting])

  const handleDecline = useCallback(async () => {
    if (!call) return

    try {
      // Update call status to CANCELLED
      await apiPut(`/api/calls/${call.callId}/status`, { status: 'CANCELLED' })
    } catch {
      // Non-critical
    }

    // Notify caller via socket that we declined (with auth!)
    try {
      const { io } = await import('socket.io-client')
      const socket = io('/?XTransformPort=3003', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      })
      socket.on('connect', () => {
        socket.emit('auth', { userId: user?.id, role: user?.role })
        socket.emit('call-rejected', {
          callId: call.callId,
          toUserId: call.callerId,
        })
        setTimeout(() => socket.disconnect(), 1500)
      })
    } catch {
      // Non-critical
    }

    setIncomingCall(null)
    toast.info('Call declined')
  }, [call, setIncomingCall])

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (!call) return

    let remaining = 30

    const timer = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(timer)

        // Auto-decline: update status and notify caller
        if (call.callId && call.callerId) {
          apiPut(`/api/calls/${call.callId}/status`, { status: 'CANCELLED' }).catch(() => {})
          import('socket.io-client').then(({ io }) => {
            const socket = io('/?XTransformPort=3003', {
              path: '/socket.io',
              transports: ['websocket', 'polling'],
            })
            socket.on('connect', () => {
              socket.emit('auth', { userId: user?.id, role: user?.role })
              socket.emit('call-rejected', { callId: call.callId, toUserId: call.callerId })
              setTimeout(() => socket.disconnect(), 1500)
            })
          }).catch(() => {})
        }

        setIncomingCall(null)
        return
      }
      setTimeLeft(remaining)
    }, 1000)

    return () => clearInterval(timer)
  }, [call, setIncomingCall])

  // Don't render if there's no incoming call or an active call exists
  if (!call || currentCall) return null

  const initials = call.callerName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const callerRole = user?.role === 'NANNY' ? 'Parent' : 'Nanny'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Ringing animation */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-40 h-40 rounded-full border-2 border-rose-400/30"
          />
          <motion.div
            animate={{ scale: [1, 1.8, 1], opacity: [0.2, 0, 0.2] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            className="absolute w-40 h-40 rounded-full border-2 border-rose-400/20"
          />
          <motion.div
            animate={{ scale: [1, 2.1, 1], opacity: [0.1, 0, 0.1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
            className="absolute w-40 h-40 rounded-full border-2 border-rose-400/10"
          />
        </div>

        {/* Card */}
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 flex flex-col items-center gap-6 rounded-3xl bg-white p-8 shadow-2xl mx-4 min-w-[320px]"
        >
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-400 to-purple-500 flex items-center justify-center shadow-lg">
              <span className="text-3xl font-bold text-white">{initials}</span>
            </div>
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center border-4 border-white"
            >
              <Video className="w-3.5 h-3.5 text-white" />
            </motion.div>
          </div>

          {/* Info */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">{call.callerName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{callerRole}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-emerald-500"
              />
              <span className="text-sm text-emerald-600 font-medium">Incoming Video Call</span>
            </div>
          </div>

          {/* Timer */}
          <p className="text-xs text-gray-400">
            Auto-declines in {timeLeft}s
          </p>

          {/* Actions */}
          <div className="flex items-center gap-8">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDecline}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAccept}
              disabled={accepting}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-colors disabled:opacity-60"
            >
              <Phone className="w-7 h-7 text-white" />
            </motion.button>
          </div>

          <p className="text-[11px] text-gray-400">
            <span className="text-red-400">Decline</span>
            <span className="mx-3">·</span>
            <span className="text-emerald-500">Accept</span>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
