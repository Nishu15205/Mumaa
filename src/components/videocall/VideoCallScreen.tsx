'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PhoneOff,
  MessageSquare,
  ArrowLeft,
  Check,
  Video,
  Users,
  Clock,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { CallTimer } from './CallTimer'
import { VideoPlaceholder } from './VideoPlaceholder'
import { ChatPanel } from './ChatPanel'
import { StarRating } from '@/components/common/StarRating'
import { JitsiCall } from './JitsiCall'
import type { JitsiCallHandle } from './JitsiCall'
import { generateRoomName } from '@/lib/jitsi'

type CallState = 'waiting' | 'connecting' | 'active' | 'ended'

const WAIT_TIMEOUT_SECONDS = 5 * 60 // 5 minutes

export function VideoCallScreen() {
  const { currentCall, endCall, waitingForNanny, setWaitingForNanny } = useAppStore()
  const { user } = useAuthStore()

  const [callState, setCallState] = useState<CallState>(() =>
    waitingForNanny ? 'waiting' : 'connecting'
  )
  const [callStartTime, setCallStartTime] = useState<Date | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [otherPersonName, setOtherPersonName] = useState('')
  const [otherPersonId, setOtherPersonId] = useState('')
  const [participantCount, setParticipantCount] = useState(1)
  const [callDurationOnEnd, setCallDurationOnEnd] = useState(0)
  const [jitsiReady, setJitsiReady] = useState(false)

  // Waiting countdown
  const [waitSecondsLeft, setWaitSecondsLeft] = useState(WAIT_TIMEOUT_SECONDS)

  // Ref for JitsiCall component
  const jitsiRef = useRef<JitsiCallHandle>(null)

  // Determine other participant info
  useEffect(() => {
    if (!currentCall || !user) return

    if (user.role === 'PARENT') {
      setOtherPersonName(currentCall.nannyName || 'Nanny')
      setOtherPersonId(currentCall.nannyId)
    } else {
      setOtherPersonName(currentCall.parentName || 'Parent')
      setOtherPersonId(currentCall.parentId)
    }
  }, [currentCall, user])

  // 5-minute countdown timer for waiting state
  useEffect(() => {
    if (callState !== 'waiting') return

    const interval = setInterval(() => {
      setWaitSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          // Auto-cancel after 5 minutes
          handleCancelWait()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [callState])

  // Listen for nanny accepting the call (via socket events in page.tsx)
  useEffect(() => {
    if (callState !== 'waiting') return

    const interval = setInterval(() => {
      const store = useAppStore.getState()
      // If waitingForNanny is set to false externally (by socket handler), transition
      if (!store.waitingForNanny && store.currentCall) {
        setWaitingForNanny(false)
        setCallState('connecting')
        toast.success(`${otherPersonName} joined the call!`)
      }
    }, 300)

    return () => clearInterval(interval)
  }, [callState, otherPersonName, setWaitingForNanny])

  const handleCancelWait = useCallback(() => {
    // Cancel the call request
    if (currentCall) {
      fetch(`/api/calls/${currentCall.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }).catch(() => {})
    }
    setWaitingForNanny(false)
    endCall()
    setCallState('waiting')
    toast.info('Call cancelled', {
      description: 'The nanny didn\'t join in time.',
    })
  }, [currentCall, endCall, setWaitingForNanny])

  // When Jitsi meeting is ready, transition to active state
  const handleMeetingReady = useCallback(() => {
    setJitsiReady(true)
    setCallState('active')
    setCallStartTime(new Date())
  }, [])

  // Handle Jitsi call end
  const handleJitsiCallEnd = useCallback((durationSeconds: number) => {
    setJitsiReady(false)
    setCallDurationOnEnd(durationSeconds)
    setCallState('ended')
    setIsChatOpen(false)

    if (currentCall) {
      persistCallEnd(currentCall.id, durationSeconds)
    }
  }, [currentCall])

  // Handle Jitsi error
  const handleJitsiError = useCallback((error: string) => {
    console.error('[MUMAA] Jitsi error:', error)
    toast.error('Call Error', {
      description: error,
    })
    if (error === 'User cancelled') {
      setJitsiReady(false)
      setCallState('ended')
      setCallDurationOnEnd(0)
      setTimeout(() => {
        endCall()
        setCallState('waiting')
      }, 500)
    }
  }, [endCall])

  // Persist call end to database
  const persistCallEnd = useCallback(async (callId: string, durationSeconds: number) => {
    try {
      await fetch(`/api/calls/${callId}/end`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: durationSeconds }),
      })
    } catch (error) {
      console.error('Failed to persist call end:', error)
    }
  }, [])

  const handleEndCall = useCallback(() => {
    if (jitsiRef.current) {
      jitsiRef.current.endCall()
    } else {
      setJitsiReady(false)
      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
        : 0
      setCallDurationOnEnd(duration)
      setCallState('ended')
      setIsChatOpen(false)
      if (currentCall) {
        persistCallEnd(currentCall.id, duration)
      }
    }
  }, [callStartTime, currentCall, persistCallEnd])

  const handleSubmitReview = useCallback(async () => {
    if (!rating || !currentCall || !user) return
    setIsReviewSubmitting(true)

    try {
      const response = await fetch(`/api/calls/${currentCall.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: user.id,
          toUserId: otherPersonId,
          rating,
          comment: reviewComment || null,
        }),
      })

      if (response.ok) {
        toast.success('Review Submitted')
        setRating(0)
        setReviewComment('')
      } else {
        const data = await response.json()
        toast.error('Review Failed', {
          description: data.error || 'Could not submit review',
        })
      }
    } catch {
      toast.error('Review Failed')
    } finally {
      setIsReviewSubmitting(false)
    }
  }, [rating, currentCall, user, otherPersonId, reviewComment])

  const handleBackToDashboard = useCallback(() => {
    endCall()
    setCallState('waiting')
    setRating(0)
    setReviewComment('')
    setCallStartTime(null)
    setCallDurationOnEnd(0)
    setParticipantCount(1)
    setJitsiReady(false)
    setWaitSecondsLeft(WAIT_TIMEOUT_SECONDS)
    setWaitingForNanny(false)
  }, [endCall, setWaitingForNanny])

  // Don't render if no active call
  if (!currentCall) return null

  const roomName = currentCall.callRoomId
    ? (currentCall.callRoomId.startsWith('mumaa-')
        ? currentCall.callRoomId
        : generateRoomName(currentCall.callRoomId))
    : generateRoomName(currentCall.id)

  const endedDuration = callDurationOnEnd || (callStartTime
    ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
    : 0)
  const endedMinutes = Math.floor(endedDuration / 60)
  const endedSeconds = endedDuration % 60

  // Format wait countdown
  const waitMinutes = Math.floor(waitSecondsLeft / 60)
  const waitSeconds = waitSecondsLeft % 60

  const displayName = user?.name || 'MUMAA User'
  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-gray-950 flex flex-col"
    >
      {/* ============================================================
          WAITING STATE — Clean waiting screen with 5-min countdown
          ============================================================ */}
      <AnimatePresence>
        {callState === 'waiting' && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950 p-4"
          >
            <div className="text-center">
              {/* Nanny avatar */}
              <motion.div
                className="relative inline-block mb-6"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto">
                  <span className="text-3xl font-bold text-white">
                    {getInitials(otherPersonName)}
                  </span>
                </div>
                {/* Pulsing ring */}
                <span className="absolute inset-0 rounded-full border-4 border-emerald-400/30 animate-ping" />
              </motion.div>

              {/* Nanny name */}
              <h2 className="text-2xl font-bold text-white mb-1">{otherPersonName}</h2>

              {/* Waiting status */}
              <p className="text-gray-400 text-sm mb-6">Waiting for nanny to join...</p>

              {/* Countdown timer */}
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-sm mb-8">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-lg font-mono text-white font-medium">
                  {String(waitMinutes).padStart(2, '0')}:{String(waitSeconds).padStart(2, '0')}
                </span>
              </div>

              {/* Cancel button */}
              <div>
                <Button
                  onClick={handleCancelWait}
                  variant="outline"
                  className="bg-white/10 text-white border-white/20 hover:bg-red-500/20 hover:border-red-400/40 hover:text-red-300 rounded-full px-8 h-11 text-sm"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          JitsiCall — ONLY rendered when connecting or active
          ============================================================ */}
      {callState !== 'waiting' && callState !== 'ended' && (
        <JitsiCall
          ref={jitsiRef}
          roomName={roomName}
          userName={displayName}
          userEmail={user?.email || undefined}
          userAvatar={user?.avatar || undefined}
          onCallEnd={handleJitsiCallEnd}
          onError={handleJitsiError}
          onParticipantsChange={setParticipantCount}
          onMeetingReady={handleMeetingReady}
        />
      )}

      {/* ============================================================
          CONNECTING — Minimal overlay
          ============================================================ */}
      <AnimatePresence>
        {callState === 'connecting' && !jitsiReady && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="absolute bottom-8 pointer-events-auto">
              <Button
                onClick={handleBackToDashboard}
                variant="outline"
                className="bg-white/10 text-white border-white/20 hover:bg-white/20 rounded-full px-6"
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>

            <VideoPlaceholder name={otherPersonName} size="full" />

            {/* Pulse ring */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-32 h-32 rounded-full border-2 border-white/20"
              />
            </div>

            {/* Connecting text — minimal */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-white text-xl font-medium"
              >
                Connecting...
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          ACTIVE — Top bar + bottom controls + chat
          ============================================================ */}
      <AnimatePresence>
        {callState === 'active' && jitsiReady && (
          <>
            {/* Top Bar */}
            <motion.div
              key="topbar"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/60 to-transparent"
            >
              <div className="flex items-center gap-3">
                {callStartTime && (
                  <CallTimer startTime={callStartTime} isRunning={true} />
                )}
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-medium text-emerald-400">
                    {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Bottom Controls */}
            <motion.div
              key="bottombar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-6 pt-12 bg-gradient-to-t from-black/70 to-transparent"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Chat toggle */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                    isChatOpen
                      ? 'bg-rose-500 text-white'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                  title="Chat"
                >
                  <MessageSquare className="w-5 h-5" />
                </motion.button>

                {/* End Call */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleEndCall}
                  className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
                  title="End Call"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </motion.button>

                {/* Toggle video */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    try {
                      const container = document.querySelector('[data-jitsi-container]')
                      if (container) {
                        const iframe = container.querySelector('iframe')
                        if (iframe?.contentWindow) {
                          iframe.contentWindow.postMessage({ type: 'toggle-camera' }, '*')
                        }
                      }
                    } catch {
                      // Ignore
                    }
                  }}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors"
                  title="Camera"
                >
                  <Video className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>

            {/* Chat Panel */}
            <ChatPanel
              open={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              otherParticipantName={otherPersonName}
              otherParticipantId={otherPersonId}
            />
          </>
        )}
      </AnimatePresence>

      {/* ============================================================
          ENDED — Call summary + review
          ============================================================ */}
      <AnimatePresence>
        {callState === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="w-full max-w-md bg-gray-900 rounded-3xl p-8 shadow-2xl border border-gray-800"
            >
              {/* Summary */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
                  <PhoneOff className="w-7 h-7 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Call Ended</h2>
                <p className="text-gray-400 text-sm">{otherPersonName}</p>
                {endedDuration > 0 && (
                  <div className="mt-2 inline-flex items-center gap-2 px-4 py-1 rounded-full bg-gray-800">
                    <span className="text-sm text-gray-300 font-mono">
                      {String(endedMinutes).padStart(2, '0')}:{String(endedSeconds).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 mb-5" />

              {/* Rate */}
              <div className="text-center mb-4">
                <p className="text-sm text-gray-400 mb-3">Rate this call</p>
                <div className="flex justify-center">
                  <StarRating value={rating} onChange={setRating} size="lg" />
                </div>
              </div>

              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your thoughts..."
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 text-sm resize-none h-20 rounded-xl focus:ring-rose-500/30 focus:border-rose-500/50 mb-4"
              />

              <Button
                onClick={handleSubmitReview}
                disabled={!rating || isReviewSubmitting}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl h-11 font-medium disabled:opacity-40 mb-3"
              >
                {isReviewSubmitting ? 'Submitting...' : 'Submit Review'}
              </Button>

              <Button
                onClick={handleBackToDashboard}
                variant="outline"
                className="w-full bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white rounded-xl h-11 font-medium"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
