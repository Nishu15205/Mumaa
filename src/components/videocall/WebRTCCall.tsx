'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Maximize,
  MonitorUp,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { CallSession } from '@/types'

interface WebRTCCallProps {
  callId: string
  otherUserId: string
  otherPersonName: string
  isCaller: boolean
  socketRef: React.MutableRefObject<any>
  onConnected: () => void
  onDisconnected: (duration: number) => void
  onError: (message: string) => void
}

export function WebRTCCall({
  callId,
  otherUserId,
  otherPersonName,
  isCaller,
  socketRef,
  onConnected,
  onDisconnected,
  onError,
}: WebRTCCallProps) {
  // Peer connection
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  // Video elements
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  // State
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isRemoteVideoPresent, setIsRemoteVideoPresent] = useState(false)
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const callStartTimeRef = useRef<Date | null>(null)

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  // Cleanup all resources
  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    remoteStreamRef.current = null
  }, [])

  // Handle remote track (video/audio from other peer)
  const handleTrack = useCallback((event: RTCTrackEvent) => {
    const stream = event.streams[0]
    if (stream) {
      remoteStreamRef.current = stream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream
      }
      // Check if remote has video
      const videoTracks = stream.getVideoTracks()
      setIsRemoteVideoPresent(videoTracks.length > 0 && videoTracks[0].enabled)

      // Listen for track changes (remote toggles video)
      stream.onremovetrack = () => {
        const vt = stream.getVideoTracks()
        setIsRemoteVideoPresent(vt.length > 0 && vt[0].enabled)
      }
      stream.onaddtrack = () => {
        const vt = stream.getVideoTracks()
        setIsRemoteVideoPresent(vt.length > 0 && vt[0].enabled)
      }
    }
  }, [])

  // Send ICE candidate to other peer
  const sendICECandidate = useCallback((event: RTCPandidateEvent) => {
    if (event.candidate && socketRef.current) {
      socketRef.current.emit('webrtc-ice-candidate', {
        callId,
        toUserId: otherUserId,
        candidate: event.candidate.toJSON(),
      })
    }
  }, [callId, otherUserId, socketRef])

  // Monitor connection state
  const onConnectionChange = useCallback(() => {
    const pc = pcRef.current
    if (!pc) return
    if (pc.connectionState === 'connected') {
      callStartTimeRef.current = new Date()
      setCallStatus('connected')
      onConnected()
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      if (callStatus === 'connected') {
        // Calculate duration
        const duration = callStartTimeRef.current
          ? Math.floor((Date.now() - callStartTimeRef.current.getTime()) / 1000)
          : 0
        onDisconnected(duration)
      } else {
        setCallStatus('failed')
        onError('Connection failed. Please check your network and try again.')
      }
    }
  }, [callStatus, onConnected, onDisconnected, onError])

  // Create peer connection
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    })
    pcRef.current = pc
    pc.ontrack = handleTrack
    pc.onicecandidate = sendICECandidate
    pc.onconnectionstatechange = onConnectionChange
    return pc
  }, [handleTrack, sendICECandidate, onConnectionChange])

  // Get user media
  const getMedia = useCallback(async (withVideo: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: withVideo ? {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30 },
        facingMode: 'user',
      } : false,
    })
    localStreamRef.current = stream
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }
    setIsAudioEnabled(true)
    setIsVideoEnabled(withVideo)
    return stream
  }, [])

  // Caller: initiate call
  const startCall = useCallback(async () => {
    try {
      const stream = await getMedia(true)
      const pc = createPC()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      await pc.setLocalDescription(offer)

      if (socketRef.current) {
        socketRef.current.emit('webrtc-offer', {
          callId,
          toUserId: otherUserId,
          sdp: pc.localDescription?.toJSON(),
        })
      }
    } catch (err: any) {
      console.error('[WebRTC] Start failed:', err)
      onError(err?.message || 'Failed to start video call. Please allow camera/microphone access.')
    }
  }, [callId, otherUserId, socketRef, getMedia, createPC, onError])

  // Callee: accept incoming offer
  const acceptCall = useCallback(async (offerSdp: any) => {
    try {
      const stream = await getMedia(true)
      const pc = createPC()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      if (socketRef.current) {
        socketRef.current.emit('webrtc-answer', {
          callId,
          toUserId: otherUserId,
          sdp: pc.localDescription?.toJSON(),
        })
      }
    } catch (err: any) {
      console.error('[WebRTC] Accept failed:', err)
      onError(err?.message || 'Failed to accept call.')
    }
  }, [callId, otherUserId, socketRef, getMedia, createPC, onError])

  // Handle incoming signaling
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    const onOffer = async (data: any) => {
      if (data.callId === callId && data.fromUserId === otherUserId) {
        await acceptCall(data.sdp)
      }
    }

    const onAnswer = async (data: any) => {
      if (data.callId === callId && data.fromUserId === otherUserId) {
        const pc = pcRef.current
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        }
      }
    }

    const onICE = async (data: any) => {
      if (data.callId === callId && data.fromUserId === otherUserId && data.candidate) {
        const pc = pcRef.current
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch {
            // Ignore stale candidates
          }
        }
      }
    }

    socket.on('webrtc-offer', onOffer)
    socket.on('webrtc-answer', onAnswer)
    socket.on('webrtc-ice-candidate', onICE)

    return () => {
      socket.off('webrtc-offer', onOffer)
      socket.off('webrtc-answer', onAnswer)
      socket.off('webrtc-ice-candidate', onICE)
    }
  }, [socketRef, callId, otherUserId, acceptCall])

  // Auto-start for caller
  useEffect(() => {
    if (isCaller) {
      // Delay to ensure socket signaling listeners are ready
      const timer = setTimeout(() => {
        startCall()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isCaller])

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
      setIsAudioEnabled((p) => !p)
    }
  }

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getVideoTracks()
      if (tracks.length > 0) {
        tracks.forEach((t) => { t.enabled = !t.enabled })
        setIsVideoEnabled((p) => !p)
      }
    }
  }

  // Screen share
  const toggleScreenShare = async () => {
    try {
      const pc = pcRef.current
      if (!pc) return

      if (isScreenSharing) {
        // Stop screen share, switch back to camera
        const stream = await getMedia(true)
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) {
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) await sender.replaceTrack(videoTrack)
        }
        setIsScreenSharing(false)
      } else {
        // Start screen share
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        const screenTrack = screenStream.getVideoTracks()[0]
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender && screenTrack) {
          await sender.replaceTrack(screenTrack)
        }
        screenTrack.onended = async () => {
          const stream = await getMedia(true)
          const newVideoTrack = stream.getVideoTracks()[0]
          const sender2 = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender2 && newVideoTrack) await sender2.replaceTrack(newVideoTrack)
          setIsScreenSharing(false)
        }
        setIsScreenSharing(true)
      }
    } catch (err) {
      // User cancelled screen share picker
    }
  }

  // End call
  const endCall = useCallback(() => {
    const duration = callStartTimeRef.current
      ? Math.floor((Date.now() - callStartTimeRef.current.getTime()) / 1000)
      : 0
    cleanup()
    onDisconnected(duration)
  }, [cleanup, onDisconnected])

  // Expose acceptCall for external use (nanny accepting)
  useEffect(() => {
    ;(window as any).__mumaaAcceptCall = acceptCall
    return () => { delete (window as any).__mumaaAcceptCall }
  }, [acceptCall])

  // Expose endCall
  useEffect(() => {
    ;(window as any).__mumaaEndCall = endCall
    return () => { delete (window as any).__mumaaEndCall }
  }, [endCall])

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  return (
    <div className="absolute inset-0 z-10 bg-gray-950" data-webrtc-container>
      {/* Remote video (full screen) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={cn(
          'absolute inset-0 w-full h-full object-cover',
          !isRemoteVideoPresent && 'hidden'
        )}
      />

      {/* Remote placeholder when no video */}
      {!isRemoteVideoPresent && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-center"
          >
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl font-bold text-white">{getInitials(otherPersonName)}</span>
            </div>
            <p className="text-white/80 text-lg font-medium">{otherPersonName}</p>
            {callStatus === 'connecting' && (
              <p className="text-white/40 text-sm mt-1">Waiting for video...</p>
            )}
          </motion.div>
        </div>
      )}

      {/* Local video (picture-in-picture) */}
      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <div className={cn(
          'relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20',
          isVideoEnabled ? 'w-[140px] h-[105px] sm:w-[180px] sm:h-[135px]' : 'w-[140px] h-[105px] sm:w-[180px] sm:h-[135px] bg-gray-800'
        )}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              'w-full h-full object-cover',
              !isVideoEnabled && 'hidden'
            )}
            style={{ transform: 'scaleX(-1)' }}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-gray-700 text-gray-300 text-lg">
                  {getInitials(otherPersonName === 'Nanny' ? 'You' : 'You')}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </div>

      {/* Connection status indicator */}
      <AnimatePresence>
        {callStatus === 'connecting' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center py-3 bg-gradient-to-b from-black/50 to-transparent"
          >
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-white text-xs font-medium">Connecting...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {callStatus === 'failed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6"
          >
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <PhoneOff className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">Connection Failed</h3>
              <p className="text-gray-400 text-sm mb-6">Could not establish video connection. Check your network and try again.</p>
              <Button onClick={endCall} className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-8">
                Go Back
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
