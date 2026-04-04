'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PhoneOff,
  MessageSquare,
  ArrowLeft,
  Copy,
  Check,
  Video,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { CallTimer } from './CallTimer'
import { VideoPlaceholder } from './VideoPlaceholder'
import { ChatPanel } from './ChatPanel'
import { StarRating } from '@/components/common/StarRating'
import { JitsiCall } from './JitsiCall'
import { generateRoomName } from '@/lib/jitsi'

type CallState = 'connecting' | 'active' | 'ended'

export function VideoCallScreen() {
  const { currentCall, endCall } = useAppStore()
  const { user } = useAuthStore()

  const [callState, setCallState] = useState<CallState>('connecting')
  const [callStartTime, setCallStartTime] = useState<Date | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [otherPersonName, setOtherPersonName] = useState('')
  const [otherPersonId, setOtherPersonId] = useState('')
  const [participantCount, setParticipantCount] = useState(1)
  const [callDurationOnEnd, setCallDurationOnEnd] = useState(0)

  // Ref to hold the Jitsi container for end call access
  const jitsiContainerRef = useRef<HTMLDivElement>(null)

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

  // When Jitsi meeting is ready, transition to active state
  const handleMeetingReady = useCallback(() => {
    setCallState('active')
    setCallStartTime(new Date())
    toast.success('Connected', {
      description: `You're now in the call with ${otherPersonName}`,
    })
  }, [otherPersonName])

  // Handle Jitsi call end
  const handleJitsiCallEnd = useCallback((durationSeconds: number) => {
    setCallDurationOnEnd(durationSeconds)
    setCallState('ended')
    setIsChatOpen(false)

    // Persist call end to database
    if (currentCall) {
      persistCallEnd(currentCall.id, durationSeconds)
    }
  }, [currentCall])

  // Handle Jitsi error
  const handleJitsiError = useCallback((error: string) => {
    toast.error('Call Error', {
      description: error,
    })
    // If error is from user cancelling, go back
    if (error === 'User cancelled') {
      handleBackToDashboard()
    }
  }, [handleBackToDashboard])

  // Persist call end to database via API
  const persistCallEnd = useCallback(async (callId: string, durationSeconds: number) => {
    try {
      const response = await fetch(`/api/calls/${callId}/end`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: durationSeconds }),
      })

      if (!response.ok) {
        console.error('Failed to persist call end:', await response.text())
      }
    } catch (error) {
      console.error('Failed to persist call end:', error)
    }
  }, [])

  // Simulate call connection (short delay before Jitsi loads)
  // Actually Jitsi handles this itself, but we show our connecting state
  // until Jitsi reports meeting ready
  useEffect(() => {
    if (!currentCall) return
    // The connecting state will be replaced by Jitsi's loading UI
    // and then the meeting ready callback will transition to active
  }, [currentCall])

  const handleEndCall = useCallback(() => {
    // Try to find the Jitsi container's endCall method
    const container = document.getElementById('mumaa-jitsi-container')
    if (container && (container as HTMLDivElement & { _mumaaEndCall?: () => void })._mumaaEndCall) {
      ;(container as HTMLDivElement & { _mumaaEndCall?: () => void })._mumaaEndCall!()
    } else {
      // Fallback: just transition to ended state
      setCallDurationOnEnd(
        callStartTime
          ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
          : 0
      )
      setCallState('ended')
      setIsChatOpen(false)
      if (currentCall) {
        persistCallEnd(
          currentCall.id,
          callStartTime
            ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
            : 0
        )
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
        toast.success('Review Submitted', {
          description: 'Thank you for your feedback!',
        })
        setRating(0)
        setReviewComment('')
      } else {
        const data = await response.json()
        toast.error('Review Failed', {
          description: data.error || 'Could not submit review',
        })
      }
    } catch {
      toast.error('Review Failed', {
        description: 'Network error. Please try again.',
      })
    } finally {
      setIsReviewSubmitting(false)
    }
  }, [rating, currentCall, user, otherPersonId, reviewComment])

  const handleBackToDashboard = useCallback(() => {
    endCall()
    setCallState('connecting')
    setRating(0)
    setReviewComment('')
    setCallStartTime(null)
    setCallDurationOnEnd(0)
    setParticipantCount(1)
  }, [endCall])

  const copyRoomId = useCallback(() => {
    if (currentCall?.callRoomId) {
      navigator.clipboard.writeText(currentCall.callRoomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Room ID Copied', {
        description: 'Share this ID with your call partner',
      })
    }
  }, [currentCall])

  // Don't render if no active call
  if (!currentCall) return null

  // Build room name: use callRoomId directly if it already has the mumaa- prefix,
  // otherwise generate from the call ID
  const roomName = currentCall.callRoomId
    ? (currentCall.callRoomId.startsWith('mumaa-')
        ? currentCall.callRoomId
        : generateRoomName(currentCall.callRoomId))
    : generateRoomName(currentCall.id)

  // Calculate call duration for ended state
  const endedDuration = callDurationOnEnd || (callStartTime
    ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
    : 0)
  const endedMinutes = Math.floor(endedDuration / 60)
  const endedSeconds = endedDuration % 60

  // Get user display name
  const displayName = user?.name || 'MUMAA User'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-gray-950 flex flex-col"
    >
      <AnimatePresence mode="wait">
        {/* ========== CONNECTING STATE ========== */}
        {callState === 'connecting' && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center relative"
          >
            <VideoPlaceholder name={otherPersonName} size="full" />

            {/* Pulse overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-32 h-32 rounded-full border-2 border-white/20"
              />
            </div>

            {/* Connecting info */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-white/90 text-lg font-medium mb-2"
              >
                Connecting...
              </motion.div>
              <p className="text-white/50 text-sm">Calling {otherPersonName}</p>
            </div>

            {/* Cancel button */}
            <div className="absolute bottom-8">
              <Button
                onClick={handleBackToDashboard}
                variant="outline"
                className="bg-white/10 text-white border-white/20 hover:bg-white/20 rounded-full px-6"
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {/* ========== ACTIVE CALL STATE ========== */}
        {callState === 'active' && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col relative overflow-hidden"
          >
            {/* Jitsi video call fills the entire screen */}
            <JitsiCall
              roomName={roomName}
              userName={displayName}
              userEmail={user?.email || undefined}
              userAvatar={user?.avatar || undefined}
              onCallEnd={handleJitsiCallEnd}
              onError={handleJitsiError}
              onParticipantsChange={setParticipantCount}
              onMeetingReady={handleMeetingReady}
            />

            {/* Top Bar Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/60 to-transparent">
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

              <div className="flex items-center gap-2">
                {currentCall.callRoomId && (
                  <button
                    onClick={copyRoomId}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors"
                  >
                    <span className="text-[11px] text-white/60 font-mono">
                      {roomName.length > 20 ? roomName.slice(0, 20) + '...' : roomName}
                    </span>
                    {copied ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-white/60" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Control Bar Overlay */}
            <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-6 pt-12 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Chat toggle - Jitsi has its own chat, but we also show our panel */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                    isChatOpen
                      ? 'bg-rose-500 text-white'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                  title="In-Call Chat"
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

                {/* Toggle video - uses Jitsi command */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    const container = document.getElementById('mumaa-jitsi-container')
                    if (container) {
                      // Click Jitsi's camera button programmatically
                      const iframe = container.querySelector('iframe')
                      if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage({ type: 'toggle-camera' }, '*')
                      }
                    }
                  }}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors"
                  title="Toggle Camera"
                >
                  <Video className="w-5 h-5" />
                </motion.button>
              </div>
              <p className="text-white/30 text-[10px] mt-2">
                Powered by MUMAA Video
              </p>
            </div>

            {/* Chat Panel */}
            <ChatPanel
              open={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              otherParticipantName={otherPersonName}
              otherParticipantId={otherPersonId}
            />
          </motion.div>
        )}

        {/* ========== ENDED STATE ========== */}
        {callState === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center bg-gray-950 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="w-full max-w-md bg-gray-900 rounded-3xl p-8 shadow-2xl border border-gray-800"
            >
              {/* Call summary */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
                  <PhoneOff className="w-7 h-7 text-red-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">Call Ended</h2>
                <p className="text-gray-400 text-sm">
                  with {otherPersonName}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-800">
                  <span className="text-sm text-gray-300 font-mono">
                    {String(endedMinutes).padStart(2, '0')}:{String(endedSeconds).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-gray-500">duration</span>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-800 mb-6" />

              {/* Rate this call */}
              <div className="text-center mb-6">
                <h3 className="text-base font-semibold text-white mb-1">Rate this call</h3>
                <p className="text-xs text-gray-500 mb-4">How was your experience?</p>
                <div className="flex justify-center">
                  <StarRating
                    value={rating}
                    onChange={setRating}
                    size="lg"
                  />
                </div>
              </div>

              {/* Comment */}
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your thoughts about this call..."
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 text-sm resize-none h-24 rounded-xl focus:ring-rose-500/30 focus:border-rose-500/50 mb-4"
              />

              {/* Submit review */}
              <Button
                onClick={handleSubmitReview}
                disabled={!rating || isReviewSubmitting}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl h-11 font-medium disabled:opacity-40 mb-3"
              >
                {isReviewSubmitting ? 'Submitting...' : 'Submit Review'}
              </Button>

              {/* Back to dashboard */}
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
