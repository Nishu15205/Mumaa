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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

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

// Debug logger
const log = (...args: unknown[]) => {
  console.log('[WebRTC]', ...args)
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
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const callStartTimeRef = useRef<Date | null>(null)
  const cleanupCalledRef = useRef(false)

  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isRemoteVideoPresent, setIsRemoteVideoPresent] = useState(false)
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting')
  const [connectionLog, setConnectionLog] = useState<string[]>(['Initializing...'])
  const [isScreenSharing, setIsScreenSharing] = useState(false)

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    log(`[${ts}] ${msg}`)
    setConnectionLog((prev) => [...prev.slice(-4), `[${ts}] ${msg}`])
  }, [])

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  // Cleanup all resources
  const cleanup = useCallback(() => {
    if (cleanupCalledRef.current) return
    cleanupCalledRef.current = true
    addLog('Cleaning up resources')
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null
      pcRef.current.onicecandidate = null
      pcRef.current.onconnectionstatechange = null
      pcRef.current.oniceconnectionstatechange = null
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
  }, [addLog])

  // Handle remote track
  const handleTrack = useCallback((event: RTCTrackEvent) => {
    addLog('Remote track received!')
    const stream = event.streams[0]
    if (stream) {
      remoteStreamRef.current = stream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream
      }
      const videoTracks = stream.getVideoTracks()
      setIsRemoteVideoPresent(videoTracks.length > 0 && videoTracks[0].enabled)
      stream.onremovetrack = () => {
        const vt = stream.getVideoTracks()
        setIsRemoteVideoPresent(vt.length > 0 && vt[0].enabled)
      }
      stream.onaddtrack = () => {
        const vt = stream.getVideoTracks()
        setIsRemoteVideoPresent(vt.length > 0 && vt[0].enabled)
      }
    }
  }, [addLog])

  // Send ICE candidate
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
  const setupConnectionMonitoring = useCallback((pc: RTCPeerConnection) => {
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      addLog(`Connection state: ${state}`)
      if (state === 'connected') {
        callStartTimeRef.current = new Date()
        setCallStatus('connected')
        onConnected()
      } else if (state === 'failed') {
        addLog('Connection FAILED - ICE negotiation may have failed')
        setCallStatus('failed')
        onError('Connection failed. This may be due to network restrictions (NAT/firewall). Both users need a stable internet connection.')
      } else if (state === 'disconnected') {
        addLog('Connection disconnected - attempting recovery...')
        // Wait 5 seconds before declaring failure (may recover)
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            const duration = callStartTimeRef.current
              ? Math.floor((Date.now() - callStartTimeRef.current.getTime()) / 1000)
              : 0
            if (duration > 0) {
              onDisconnected(duration)
            } else {
              setCallStatus('failed')
              onError('Connection lost. Please try again.')
            }
          }
        }, 5000)
      }
    }

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      addLog(`ICE state: ${iceState}`)
      if (iceState === 'failed') {
        addLog('ICE FAILED - TURN server may be needed')
        setCallStatus('failed')
        onError('Could not establish connection. The network may require a TURN server for WebRTC to work.')
      }
    }
  }, [addLog, onConnected, onDisconnected, onError])

  // Create peer connection
  const createPC = useCallback(() => {
    addLog('Creating RTCPeerConnection...')
    const pc = new RTCPeerConnection({
      iceServers: [
        // Google STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Metered TURN servers (free tier)
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        // Additional STUN
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    })
    pcRef.current = pc
    pc.ontrack = handleTrack
    pc.onicecandidate = sendICECandidate
    setupConnectionMonitoring(pc)
    return pc
  }, [handleTrack, sendICECandidate, setupConnectionMonitoring, addLog])

  // Get user media with fallback
  const getMedia = useCallback(async (withVideo: boolean): Promise<MediaStream> => {
    try {
      addLog(`Requesting media (video: ${withVideo})...`)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: withVideo ? {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        } : false,
      })
      addLog(`Media obtained: ${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video tracks`)
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setIsAudioEnabled(true)
      setIsVideoEnabled(withVideo)
      return stream
    } catch (err: any) {
      addLog(`Media error: ${err.name} - ${err.message}`)
      // If video denied, fallback to audio-only
      if (withVideo && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
        addLog('Falling back to audio-only...')
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
        localStreamRef.current = audioStream
        setIsAudioEnabled(true)
        setIsVideoEnabled(false)
        return audioStream
      }
      throw err
    }
  }, [addLog])

  // Caller: initiate call
  const initiateCall = useCallback(async () => {
    const socket = socketRef.current
    if (!socket) {
      addLog('ERROR: Socket not ready, cannot start call')
      return
    }
    if (!socket.connected) {
      addLog('Waiting for socket to connect...')
      // Wait up to 3 seconds for socket to connect
      await new Promise<void>((resolve) => {
        let attempts = 0
        const check = setInterval(() => {
          if (socketRef.current?.connected || attempts > 30) {
            clearInterval(check)
            resolve()
          }
          attempts++
        }, 100)
      })
    }

    try {
      addLog(`Starting call as caller (callId: ${callId})`)
      const stream = await getMedia(true)
      const pc = createPC()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      addLog('Creating SDP offer...')
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      await pc.setLocalDescription(offer)
      addLog('Local description set (offer)')

      if (socketRef.current?.connected) {
        socketRef.current.emit('webrtc-offer', {
          callId,
          toUserId: otherUserId,
          sdp: pc.localDescription?.toJSON(),
        })
        addLog(`Offer sent to ${otherUserId.slice(0, 8)}...`)
      } else {
        addLog('ERROR: Socket disconnected, cannot send offer')
      }
    } catch (err: any) {
      addLog(`Start call failed: ${err.message}`)
      onError(err?.message || 'Failed to start video call. Please allow camera/microphone access.')
    }
  }, [callId, otherUserId, socketRef, getMedia, createPC, onError, addLog])

  // WebRTC signaling — handle offer/answer/ICE from the other peer
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    const onOffer = async (data: any) => {
      addLog(`Received offer from ${data.fromUserId?.slice(0, 8)}`)
      if (data.callId === callId && data.fromUserId === otherUserId) {
        // Get media and create answer
        try {
          addLog('Received offer, creating answer...')
          const stream = await getMedia(true)
          const pc = createPC()
          stream.getTracks().forEach((t) => pc.addTrack(t, stream))

          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          addLog('Remote description set (offer)')
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          addLog('Local description set (answer)')

          if (socketRef.current?.connected) {
            socketRef.current.emit('webrtc-answer', {
              callId,
              toUserId: otherUserId,
              sdp: pc.localDescription?.toJSON(),
            })
            addLog('Answer sent')
          }
        } catch (err: any) {
          addLog(`Accept call failed: ${err.message}`)
          onError(err?.message || 'Failed to accept call.')
        }
      }
    }

    const onAnswer = async (data: any) => {
      addLog(`Received answer from ${data.fromUserId?.slice(0, 8)}`)
      if (data.callId === callId && data.fromUserId === otherUserId) {
        const pc = pcRef.current
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          addLog('Remote description set (answer)')
        } else {
          addLog('ERROR: No peer connection to set answer on')
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
  }, [socketRef, callId, otherUserId, addLog, getMedia, createPC, onError])

  // Auto-start for caller
  useEffect(() => {
    if (isCaller) {
      const timer = setTimeout(() => {
        initiateCall()
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [isCaller, initiateCall])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

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
        const stream = await getMedia(true)
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) {
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) await sender.replaceTrack(videoTrack)
        }
        setIsScreenSharing(false)
      } else {
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
    } catch {
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

  // Expose endCall
  useEffect(() => {
    ;(window as any).__mumaaEndCall = endCall
    return () => { delete (window as any).__mumaaEndCall }
  }, [endCall])

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

      {/* Remote placeholder */}
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

      {/* Local video (PiP) */}
      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <div className={cn(
          'relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20',
          'w-[140px] h-[105px] sm:w-[180px] sm:h-[135px]'
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
                <AvatarFallback className="bg-gray-700 text-gray-300 text-lg">You</AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </div>

      {/* Controls bar - always visible when connecting or connected */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-6 pt-12 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Audio toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleAudio}
            data-action="toggle-audio"
            className={cn(
              'w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors',
              isAudioEnabled
                ? 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                : 'bg-red-500 text-white'
            )}
          >
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </motion.button>

          {/* Video toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleVideo}
            data-action="toggle-video"
            className={cn(
              'w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors',
              isVideoEnabled
                ? 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                : 'bg-red-500 text-white'
            )}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </motion.button>

          {/* End call */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={endCall}
            className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </motion.button>

          {/* Screen share */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleScreenShare}
            className={cn(
              'w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors',
              isScreenSharing
                ? 'bg-emerald-500 text-white'
                : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
            )}
          >
            <MonitorUp className="w-5 h-5" />
          </motion.button>

          {/* Fullscreen */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen()
              } else {
                document.exitFullscreen()
              }
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors"
          >
            <Maximize className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* Connection status indicator */}
      <AnimatePresence>
        {callStatus === 'connecting' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center pt-3 bg-gradient-to-b from-black/60 to-transparent"
          >
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-white text-xs font-medium">Connecting...</span>
            </div>
            {/* Debug log - only visible during connecting */}
            <div className="mt-1 max-w-md px-2">
              {connectionLog.map((log, i) => (
                <p key={i} className="text-white/30 text-[10px] font-mono leading-tight">{log}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connected indicator */}
      <AnimatePresence>
        {callStatus === 'connected' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center py-3 bg-gradient-to-b from-black/50 to-transparent"
          >
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-300 text-xs font-medium">Connected</span>
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
              <p className="text-gray-400 text-sm mb-4">Could not establish video connection.</p>
              {/* Show debug logs */}
              <div className="bg-gray-900 rounded-lg p-3 mb-4 text-left">
                {connectionLog.map((l, i) => (
                  <p key={i} className="text-gray-500 text-[10px] font-mono leading-tight">{l}</p>
                ))}
              </div>
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
