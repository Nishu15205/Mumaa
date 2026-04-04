'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  MessageSquare,
  MoreVertical,
  Wifi,
  WifiOff,
  ArrowLeft,
  Settings,
  RefreshCw,
  Copy,
  Check,
  CameraOff,
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

type CallState = 'connecting' | 'active' | 'ended'

export function VideoCallScreen() {
  const { currentCall, endCall } = useAppStore()
  const { user } = useAuthStore()

  const [callState, setCallState] = useState<CallState>('connecting')
  const [callStartTime, setCallStartTime] = useState<Date | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [callQuality, setCallQuality] = useState<'excellent' | 'good' | 'poor'>('excellent')
  const [rating, setRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [otherPersonName, setOtherPersonName] = useState('')
  const [otherPersonId, setOtherPersonId] = useState('')
  const [cameraDenied, setCameraDenied] = useState(false)

  // Refs for media streams and video element
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const isCleaningUpRef = useRef(false)

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

  // Helper: stop all tracks in a stream
  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    if (!stream) return
    stream.getTracks().forEach((track) => {
      track.stop()
    })
  }, [])

  // Helper: set video element source from a stream
  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }
  }, [])

  // Request camera and microphone when call becomes active
  useEffect(() => {
    if (callState !== 'active') return

    let cancelled = false

    const startLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: true,
        })

        if (cancelled) {
          stopStreamTracks(stream)
          return
        }

        localStreamRef.current = stream
        setCameraDenied(false)

        // Attach to video element
        attachStreamToVideo(stream)

        // Apply current mute/camera state to the new stream
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted
        })
        stream.getVideoTracks().forEach((track) => {
          track.enabled = !isCameraOff
        })
      } catch (error: unknown) {
        if (cancelled) return

        const err = error as DOMException
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          setCameraDenied(true)
          toast.error('Camera/Microphone Access Denied', {
            description:
              'Please allow camera and microphone access in your browser settings to use video calling.',
          })
        } else if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          setCameraDenied(true)
          toast.warning('No Camera/Microphone Found', {
            description:
              'No camera or microphone device was detected on your system.',
          })
        } else {
          setCameraDenied(true)
          toast.error('Media Access Error', {
            description: `Could not access camera/microphone: ${err.message || 'Unknown error'}`,
          })
        }
      }
    }

    startLocalMedia()

    return () => {
      cancelled = true
    }
  }, [callState, isMuted, isCameraOff, stopStreamTracks, attachStreamToVideo])

  // Sync audio track enabled state with isMuted
  useEffect(() => {
    const stream = screenStreamRef.current || localStreamRef.current
    if (!stream) return
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted
    })
  }, [isMuted])

  // Sync video track enabled state with isCameraOff (only when not screen sharing)
  useEffect(() => {
    if (isScreenSharing) return
    if (!localStreamRef.current) return
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff
    })
  }, [isCameraOff, isScreenSharing])

  // Screen sharing toggle
  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing — switch back to camera
      stopStreamTracks(screenStreamRef.current)
      screenStreamRef.current = null
      setIsScreenSharing(false)

      // Restore camera stream to video element
      if (localStreamRef.current) {
        attachStreamToVideo(localStreamRef.current)
      }
      return
    }

    // Start screen sharing
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        } as MediaTrackConstraints,
        audio: false,
      })

      screenStreamRef.current = screenStream
      setIsScreenSharing(true)

      // Replace self-view with screen stream
      attachStreamToVideo(screenStream)

      // Listen for the user stopping screen share via browser UI
      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopStreamTracks(screenStreamRef.current)
        screenStreamRef.current = null
        setIsScreenSharing(false)
        if (localStreamRef.current) {
          attachStreamToVideo(localStreamRef.current)
        }
      })

      toast.success('Screen Sharing Started', {
        description: 'Your screen is now visible to other participants.',
      })
    } catch (error: unknown) {
      // User cancelled the screen share picker — silently ignore
      const err = error as DOMException
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        toast.error('Screen Sharing Failed', {
          description: 'Could not start screen sharing. Please try again.',
        })
      }
    }
  }, [isScreenSharing, stopStreamTracks, attachStreamToVideo])

  // Handle mute toggle
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev)
  }, [])

  // Handle camera toggle
  const handleToggleCamera = useCallback(() => {
    setIsCameraOff((prev) => !prev)
  }, [])

  // Cleanup all streams
  const cleanupStreams = useCallback(() => {
    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true

    stopStreamTracks(localStreamRef.current)
    localStreamRef.current = null
    stopStreamTracks(screenStreamRef.current)
    screenStreamRef.current = null

    // Clear video element source
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    isCleaningUpRef.current = false
  }, [stopStreamTracks])

  // Simulate call connection
  useEffect(() => {
    if (!currentCall) return

    const connectTimer = setTimeout(() => {
      setCallState('active')
      setCallStartTime(new Date())
    }, 2500)

    return () => clearTimeout(connectTimer)
  }, [currentCall])

  // Simulate quality changes
  useEffect(() => {
    if (callState !== 'active') return

    const qualityTimer = setInterval(() => {
      const qualities: Array<'excellent' | 'good' | 'poor'> = ['excellent', 'excellent', 'good', 'excellent', 'good']
      setCallQuality(qualities[Math.floor(Math.random() * qualities.length)])
    }, 10000)

    return () => clearInterval(qualityTimer)
  }, [callState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStreams()
    }
  }, [cleanupStreams])

  const handleEndCall = useCallback(() => {
    cleanupStreams()
    setCallState('ended')
    setIsChatOpen(false)
  }, [cleanupStreams])

  const handleSubmitReview = useCallback(async () => {
    if (!rating || !currentCall) return
    setIsReviewSubmitting(true)

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setIsReviewSubmitting(false)
  }, [rating, currentCall])

  const handleBackToDashboard = useCallback(() => {
    cleanupStreams()
    endCall()
    setCallState('connecting')
    setRating(0)
    setReviewComment('')
    setCameraDenied(false)
    setIsMuted(false)
    setIsCameraOff(false)
    setIsScreenSharing(false)
  }, [endCall, cleanupStreams])

  const copyRoomId = useCallback(() => {
    if (currentCall?.callRoomId) {
      navigator.clipboard.writeText(currentCall.callRoomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [currentCall])

  // Don't render if no active call
  if (!currentCall) return null

  // Calculate call duration for ended state
  const endedDuration = callStartTime
    ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
    : 0
  const endedMinutes = Math.floor(endedDuration / 60)
  const endedSeconds = endedDuration % 60

  // Determine self-view content: real video or fallback placeholder
  const showRealVideo = !cameraDenied && !isCameraOff && localStreamRef.current

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
        {callState === 'active' && callStartTime && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col relative overflow-hidden"
          >
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/50 to-transparent">
              <div className="flex items-center gap-3">
                <CallTimer startTime={callStartTime} isRunning={true} />
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm">
                  {callQuality === 'excellent' ? (
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  ) : callQuality === 'good' ? (
                    <Wifi className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className={`text-[11px] font-medium ${
                    callQuality === 'excellent' ? 'text-emerald-400' :
                    callQuality === 'good' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {callQuality === 'excellent' ? 'Excellent' : callQuality === 'good' ? 'Good' : 'Poor'}
                  </span>
                </div>
                {isScreenSharing && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 backdrop-blur-sm">
                    <MonitorUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-medium text-emerald-400">
                      Sharing
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {currentCall.callRoomId && (
                  <button
                    onClick={copyRoomId}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors"
                  >
                    <span className="text-[11px] text-white/60 font-mono">
                      {currentCall.callRoomId.slice(0, 8)}...
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

            {/* Main Video (other person - placeholder since no peer-to-peer) */}
            <div className="flex-1 relative">
              <VideoPlaceholder
                name={otherPersonName}
                size="full"
                showMuted={true}
              />

              {/* Camera denied banner */}
              {cameraDenied && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm">
                  <CameraOff className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-300 font-medium">
                    Camera unavailable — audio-only mode
                  </span>
                </div>
              )}
            </div>

            {/* Self-view (PiP) */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 z-10 w-36 h-24 sm:w-44 sm:h-32 rounded-2xl overflow-hidden shadow-xl border-2 border-white/20 bg-gray-900"
            >
              {/* Real video feed when available and camera not off */}
              {!cameraDenied && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover rounded-2xl ${
                    !isCameraOff ? 'block' : 'hidden'
                  } ${!isScreenSharing ? '[transform:scaleX(-1)]' : ''}`}
                />
              )}

              {/* Fallback placeholder when camera is off or denied */}
              {(cameraDenied || isCameraOff) && (
                <div className="w-full h-full">
                  <VideoPlaceholder
                    name={user?.name || 'You'}
                    size="small"
                    showMuted={true}
                  />
                </div>
              )}

              {/* Muted indicator overlay */}
              {isMuted && !cameraDenied && !isCameraOff && (
                <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <MicOff className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </motion.div>

            {/* More Options Menu */}
            <AnimatePresence>
              {showMore && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 z-20 bg-gray-800 rounded-xl p-1 shadow-2xl min-w-[160px]"
                >
                  <button
                    onClick={() => { setShowMore(false) }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-white text-sm"
                  >
                    <Settings className="w-4 h-4 text-white/60" />
                    Settings
                  </button>
                  <button
                    onClick={() => { setShowMore(false) }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-white text-sm"
                  >
                    <RefreshCw className="w-4 h-4 text-white/60" />
                    Flip Camera
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Control Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-6 pt-12 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Mute */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleToggleMute}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                    isMuted
                      ? 'bg-white text-gray-900'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </motion.button>

                {/* Camera */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleToggleCamera}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                    isCameraOff
                      ? 'bg-white text-gray-900'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                >
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </motion.button>

                {/* Screen Share */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleToggleScreenShare}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                    isScreenSharing
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                >
                  {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
                </motion.button>

                {/* End Call */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleEndCall}
                  className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </motion.button>

                {/* Chat */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                    isChatOpen
                      ? 'bg-rose-500 text-white'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                </motion.button>

                {/* More */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMore(!showMore)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </motion.button>
              </div>
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
