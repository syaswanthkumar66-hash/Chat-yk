import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, Avatar, Button, cn } from './UI';
import { useStore, shallowEqual, generateInitialsAvatar } from '../store';
import { webrtcService } from '../services/webrtcService';
import { CallError, CallErrorDetails } from '../types';
import { diagnosticLogger, DiagnosticEntry } from '../services/diagnosticLogService';

interface Participant {
  id: string;
  name: string;
  avatar: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  status: 'online' | 'ringing' | 'offline';
  streamId?: string;
}

const VideoPlayer = ({ 
  stream, 
  isLocal = false, 
  isVideoOff = false, 
  className,
  speakerMode = 'speaker'
}: { 
  stream: MediaStream | null, 
  isLocal?: boolean, 
  isVideoOff?: boolean, 
  className?: string,
  speakerMode?: 'speaker' | 'earpiece'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      if (el.srcObject !== stream) {
        console.log(`[Diagnostic] Binding stream to VideoPlayer (isLocal: ${isLocal}). Tracks: ${stream.getTracks().length}`);
        el.srcObject = stream;
      }
      
      el.volume = 1.0;
      
      const attemptPlay = () => {
        el.play()
          .then(() => {
            console.log(`[Diagnostic] VideoPlayer stream playback active (isLocal: ${isLocal}, muted: ${el.muted})`);
            webrtcService.clearCallError(CallError.PLAYBACK_BLOCKED);
          })
          .catch(err => {
            console.warn(`[Diagnostic] Autoplay prevented for stream. Attaching user gesture listener...`, err);
            if (!isLocal) {
              webrtcService.dispatchCallError(CallError.PLAYBACK_BLOCKED);
            }
            
            const handleInteraction = () => {
              el.play()
                .then(() => {
                  console.log(`[Diagnostic] VideoPlayer playing after user interaction`);
                  webrtcService.clearCallError(CallError.PLAYBACK_BLOCKED);
                  document.removeEventListener('click', handleInteraction);
                  document.removeEventListener('touchstart', handleInteraction);
                })
                .catch(playErr => {
                  console.error(`[Diagnostic] Explicit play failed even after gesture:`, playErr);
                });
            };
            document.addEventListener('click', handleInteraction, { once: true });
            document.addEventListener('touchstart', handleInteraction, { once: true });
          });
      };

      attemptPlay();

      const handleTrackChange = () => {
        console.log(`[Diagnostic] Track change detected on stream in VideoPlayer. Re-triggering play...`);
        attemptPlay();
      };

      stream.addEventListener('addtrack', handleTrackChange);
      stream.addEventListener('removetrack', handleTrackChange);

      return () => {
        stream.removeEventListener('addtrack', handleTrackChange);
        stream.removeEventListener('removetrack', handleTrackChange);
      };
    } else {
      el.srcObject = null;
    }
  }, [stream, isLocal, isVideoOff]);

  useEffect(() => {
    const applyAudioSink = async () => {
      const el = videoRef.current;
      if (!el || isLocal || !stream) return;

      if (typeof (el as any).setSinkId === 'function') {
        try {
          if (speakerMode === 'earpiece') {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const outputs = devices.filter(d => d.kind === 'audiooutput');
            
            const earpiece = outputs.find(d => {
              const label = d.label.toLowerCase();
              return label.includes('earpiece') || 
                     label.includes('receiver') || 
                     label.includes('handset') || 
                     label.includes('internal') || 
                     label.includes('phone') || 
                     label.includes('builtin') ||
                     label.includes('built-in');
            });
            
            if (earpiece) {
              console.log(`[AudioRouting] Switching output to earpiece: ${earpiece.label} (${earpiece.deviceId})`);
              await (el as any).setSinkId(earpiece.deviceId);
            } else {
              console.warn(`[AudioRouting] Earpiece mode selected, but no matching earpiece device found.`);
            }
          } else {
            console.log(`[AudioRouting] Switching output to default speaker`);
            await (el as any).setSinkId('');
          }
        } catch (err) {
          console.error('[AudioRouting] Failed to set audio sink ID:', err);
        }
      }
    };

    applyAudioSink();
  }, [speakerMode, isLocal, stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={cn(
        "size-full object-cover transition-opacity duration-300",
        isVideoOff ? "opacity-0 absolute inset-0 pointer-events-none" : "relative opacity-100",
        className
      )}
    />
  );
};

const playPingSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {
    console.error("Ping sound failed", e);
  }
};

const playPongSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {
    console.error("Pong sound failed", e);
  }
};

export const GroupCall = ({ groupId, userId, roomId, callId, type, onClose }: { groupId?: string, userId?: string, roomId?: string, callId?: string, type: 'voice' | 'video', onClose: () => void }) => {
  const { removedFriendIds, socket, user, chats, users } = useStore(s => ({
    removedFriendIds: s.removedFriendIds,
    socket: s.socket,
    user: s.user,
    chats: s.chats,
    users: s.users
  }), shallowEqual);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'voice');
  const [duration, setDuration] = useState(0);
  const [connectionStage, setConnectionStage] = useState<'establishing' | 'testing_ping' | 'established'>('establishing');
  const [isHold, setIsHold] = useState(false);
  const [callError, setCallError] = useState<any | null>(null);
  const [callAttempt, setCallAttempt] = useState(0);
  
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRings, setShowRings] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'speaker'>('grid');
  const [speakerMode, setSpeakerMode] = useState<'speaker' | 'earpiece'>('speaker');
  const [pingSoundsEnabled, setPingSoundsEnabled] = useState(false);
  const pingSoundsEnabledRef = useRef(false);

  useEffect(() => {
    pingSoundsEnabledRef.current = pingSoundsEnabled;
  }, [pingSoundsEnabled]);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerStats, setPeerStats] = useState<Record<string, any>>({});

  const [isRecordingPTT, setIsRecordingPTT] = useState(false);
  const [incomingPTT, setIncomingPTT] = useState<{ url: string, fromName: string, fromId: string } | null>(null);
  const pttMediaRecorder = useRef<MediaRecorder | null>(null);
  const pttChunks = useRef<Blob[]>([]);
  
  const participantsRef = useRef<Participant[]>([]);
  const usersRef = useRef<any[]>([]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const startPTT = async () => {
    try {
      const stream = localStream || await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      let options: any = {};
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac',
        'audio/wav'
      ];
      
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
          options = { mimeType: type };
          selectedMimeType = type;
          break;
        }
      }
      
      const recorder = new MediaRecorder(stream, options);
      pttMediaRecorder.current = recorder;
      pttChunks.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          pttChunks.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (pttChunks.current.length === 0) return;
        const finalMime = selectedMimeType || 'audio/webm';
        const blob = new Blob(pttChunks.current, { type: finalMime });
        const roomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
        console.log(`[PTT] Finished recording live PTT voice note. Size: ${blob.size} bytes. Broadcasting to room: ${roomId}`);
        
        // Broadcast over WebRTC Data Channel
        await webrtcService.broadcastAudioChunks(roomId, blob, finalMime);
        
        diagnosticLogger.log('webrtc', 'ptt_broadcast_done', `Finished broadcasting live P2P voice note (${(blob.size / 1024).toFixed(1)} KB) to all connected peers.`, undefined, roomId);
      };

      recorder.start();
      setIsRecordingPTT(true);
      
      const roomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
      diagnosticLogger.log('webrtc', 'ptt_started', `Started recording live voice note via P2P data channels. Speak now...`, undefined, roomId);
    } catch (err: any) {
      console.error("Failed to start PTT voice recording:", err);
    }
  };

  const stopPTT = () => {
    if (pttMediaRecorder.current && pttMediaRecorder.current.state !== 'inactive') {
      pttMediaRecorder.current.stop();
    }
    setIsRecordingPTT(false);
  };

  const togglePTT = () => {
    if (isRecordingPTT) {
      stopPTT();
    } else {
      startPTT();
    }
  };

  useEffect(() => {
    const handleAudioReceived = (e: any) => {
      const { from, url } = e.detail;
      const sender = participantsRef.current.find(p => p.id === from) || usersRef.current.find(u => u.id === from);
      const senderName = sender?.displayName || sender?.name || `User ${from.substring(0, 4)}`;
      
      setIncomingPTT({
        url,
        fromName: senderName,
        fromId: from
      });

      const audio = new Audio(url);
      audio.onended = () => {
        setIncomingPTT(null);
      };
      audio.onerror = () => {
        setIncomingPTT(null);
      };
      audio.play().catch(playErr => {
        console.warn("Auto-play failed (blocked by browser autoplay policy):", playErr);
        // Still clear after a brief duration
        setTimeout(() => setIncomingPTT(null), 3500);
      });
    };

    window.addEventListener('webrtc_audio_received', handleAudioReceived);
    return () => {
      window.removeEventListener('webrtc_audio_received', handleAudioReceived);
    };
  }, []);

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticEntry[]>([]);
  const [diagFilter, setDiagFilter] = useState('');
  const [diagCategory, setDiagCategory] = useState('all');
  const [expandedLogs, setExpandedLogs] = useState<string[]>([]);

  useEffect(() => {
    setDiagnosticLogs(diagnosticLogger.getLogs());

    const handleNewLog = (e: any) => {
      setDiagnosticLogs(prev => {
        const updated = [...prev, e.detail];
        if (updated.length > 500) updated.shift();
        return updated;
      });
    };

    window.addEventListener('webrtc_diagnostic_log_added', handleNewLog);
    return () => {
      window.removeEventListener('webrtc_diagnostic_log_added', handleNewLog);
    };
  }, []);

  const filteredDiagLogs = diagnosticLogs
    .filter(log => {
      if (diagCategory !== 'all' && log.category !== diagCategory) return false;
      if (diagFilter.trim() !== '') {
        const term = diagFilter.toLowerCase();
        const msgMatch = log.message.toLowerCase().includes(term);
        const eventMatch = log.event.toLowerCase().includes(term);
        const peerMatch = log.peerId?.toLowerCase().includes(term);
        const catMatch = log.category.toLowerCase().includes(term);
        return msgMatch || eventMatch || peerMatch || catMatch;
      }
      return true;
    })
    .reverse();

  const toggleLogExpanded = (id: string) => {
    setExpandedLogs(prev => 
      prev.includes(id) ? prev.filter(lid => lid !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    const startCall = async () => {
      try {
        setCallError(null);
        
        const selectedAudioInput = localStorage.getItem('proto_selected_audioinput');
        const selectedVideoInput = localStorage.getItem('proto_selected_videoinput');
        const echoCancellation = localStorage.getItem('proto_echo_cancellation') !== 'false';
        const noiseSuppression = localStorage.getItem('proto_noise_suppression') !== 'false';
        const autoGainControl = localStorage.getItem('proto_auto_gain_control') !== 'false';

        const audioConstraint: any = {
          echoCancellation,
          noiseSuppression,
          autoGainControl
        };
        if (selectedAudioInput) {
          audioConstraint.deviceId = { ideal: selectedAudioInput };
        }

        const videoConstraint: any = type === 'video' ? (
          selectedVideoInput ? { deviceId: { ideal: selectedVideoInput } } : true
        ) : false;

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: audioConstraint
          });
        } catch (mediaErr) {
          console.warn("[WebRTC] Preferred media device failed, falling back to default:", mediaErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: type === 'video',
            audio: true
          });
        }

        if (!mounted) return;

        // Step 1: getUserMedia logging
        console.log(`[Diagnostic][Step 1] getUserMedia SUCCESS. Obtained stream with ${stream.getTracks().length} tracks.`);
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks.forEach(track => {
            console.log(`[Diagnostic][Step 1] Audio Track Details - ID: "${track.id}", readyState: "${track.readyState}", enabled: ${track.enabled}`);
          });
        } else {
          console.log(`[Diagnostic][Step 1] WARNING: No audio tracks found in the obtained stream.`);
        }

        // Step 0: Diagnostic logging of local tracks
        const tracks = stream.getTracks();
        console.log(`[Diagnostic] getUserMedia() obtained ${tracks.length} tracks:`);
        tracks.forEach(track => {
          console.log(`[Diagnostic] - Track kind: "${track.kind}", ID: "${track.id}", readyState: "${track.readyState}", enabled: ${track.enabled}`);
        });

        setLocalStream(stream);

        const computedRoomId = callId || roomId || groupId || `call-${[user?.id, userId].sort().join('-')}`;
        webrtcService.startRoomHeartbeat(computedRoomId);

        if (socket && mounted) {
          socket.emit('join_call', { roomId: computedRoomId, userId: user?.id, callId });
        }

        await webrtcService.publishLocalStream(stream, computedRoomId);
        if (mounted) {
          setConnectionStage('testing_ping');
          setTimeout(() => {
            if (mounted) {
              setConnectionStage('established');
            }
          }, 2500);
        }

        if (socket && mounted) {
          if (userId) {
            socket.emit('call_user', { to: userId, roomId: computedRoomId, callId, type, from: user?.id });
          }

          socket.emit('sfu_signal', {
            roomId: computedRoomId,
            from: user?.id,
            signal: { type: 'request_tracks' }
          });
        }
      } catch (err: any) {
        console.log(`[Diagnostic][Step 1] getUserMedia FAILED. Error Name: "${err?.name || 'Unknown'}", Message: "${err?.message || 'No message'}"`);
        console.error('Failed to get local media or publish:', err);
        let errorCode = 'MIC_CAPTURE_FAILED';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorCode = 'MIC_PERMISSION_DENIED';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorCode = 'MIC_NOT_FOUND';
        }
        
        const errorDetail = CallErrorDetails[errorCode as CallError] || {
          code: errorCode,
          message: 'Failed to access mic: ' + err.message,
          technicalDescription: err.toString()
        };
        setCallError(errorDetail);
      }
    };

    startCall();

    const handleRemoteStream = (e: any) => {
      const { from, stream: newStream } = e.detail;
      setRemoteStreams(prev => ({ ...prev, [from]: newStream }));
      setConnectionStage('established');
      
      // Update participant with streamId
      setParticipants(prev => {
        // Match the participant by their actual peer ID first, or find one without a streamId
        const existing = prev.find(p => p.id === from) || prev.find(p => p.id !== 'me' && !p.streamId);
        if (existing) {
          return prev.map(p => p.id === existing.id ? { ...p, id: from, streamId: from, status: 'online' } : p);
        } else {
          return [...prev, {
            id: from,
            name: `User ${from.substring(0, 4)}`,
            avatar: generateInitialsAvatar(from, `User ${from.substring(0, 4)}`),
            isMuted: false,
            isVideoOff: false,
            isSpeaking: false,
            status: 'online',
            streamId: from
          }];
        }
      });
    };

    const handleConnectionFailed = (e: any) => {
      const { peerId } = e.detail;
      setParticipants(prev => prev.map(p => 
        p.id === peerId ? { ...p, status: 'offline' } : p
      ));
    };

    const handleWebRTCCallError = (e: any) => {
      console.log("[Diagnostic] Received call error event:", e.detail);
      setCallError(e.detail);
    };

    const handleWebRTCCallErrorCleared = (e: any) => {
      const { code } = e.detail;
      setCallError(prev => (prev && prev.code === code) ? null : prev);
    };

    const handleUserJoined = (data: { userId: string }) => {
      console.log('User joined call:', data.userId);
      setParticipants(prev => prev.map(p => p.id === data.userId ? { ...p, status: 'online' } : p));
    };

    const handleCallStats = (e: any) => {
      setPeerStats(prev => ({
        ...prev,
        [e.detail.peerId]: {
          ...prev[e.detail.peerId],
          ...e.detail
        }
      }));
    };

    const handleRemoteAudit = (data: any) => {
      console.log(`[Diagnostic] Received remote WebRTC audit broadcast from peer ${data.peerId}:`, data);
      setPeerStats(prev => ({
        ...prev,
        [data.peerId]: {
          ...prev[data.peerId],
          remoteIceState: data.iceConnectionState,
          remoteConnectionState: data.connectionState,
          remoteOutboundStalled: data.outboundStalled,
          remoteInboundStalled: data.inboundStalled,
          remoteCandidatePair: data.candidatePairStr,
          remoteLocalCandidateType: data.localCandidateType,
          remoteRemoteCandidateType: data.remoteCandidateType,
          isFlowing: !data.outboundStalled && data.isFlowing,
          receivedDelta: data.sentDelta, 
          sentDelta: data.receivedDelta,
          lastAuditTimestamp: data.timestamp
        }
      }));
    };

    const handleCallPing = (data: any) => {
      const { from } = data;
      if (from !== user?.id && pingSoundsEnabledRef.current) {
        playPongSound();
      }
    };

    window.addEventListener('webrtc_stream', handleRemoteStream);
    window.addEventListener('webrtc_connection_failed', handleConnectionFailed);
    window.addEventListener('webrtc_call_error', handleWebRTCCallError);
    window.addEventListener('webrtc_call_error_cleared', handleWebRTCCallErrorCleared);
    window.addEventListener('webrtc_call_stats', handleCallStats);
    
    if (socket) {
      socket.on('user_joined_call', handleUserJoined);
      socket.on('webrtc_audit_broadcast', handleRemoteAudit);
      socket.on('call_ping', handleCallPing);
    }

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      const computedRoomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
      webrtcService.closeSession(computedRoomId);
      window.removeEventListener('webrtc_stream', handleRemoteStream);
      window.removeEventListener('webrtc_connection_failed', handleConnectionFailed);
      window.removeEventListener('webrtc_call_error', handleWebRTCCallError);
      window.removeEventListener('webrtc_call_error_cleared', handleWebRTCCallErrorCleared);
      window.removeEventListener('webrtc_call_stats', handleCallStats);
      
      if (socket) {
        socket.off('user_joined_call', handleUserJoined);
        socket.off('webrtc_audit_broadcast', handleRemoteAudit);
        socket.off('call_ping', handleCallPing);
      }
      
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      
      if (socket) {
        socket.emit('end_call', { to: userId, roomId: computedRoomId });
      }
    };
  }, [type, socket, groupId, userId, user, callAttempt]);

  // Sync local mute/video state with participants list for "me"
  useEffect(() => {
    setParticipants(prev => prev.map(p => 
      p.id === 'me' ? { ...p, isMuted, isVideoOff } : p
    ));
    
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    }
  }, [isMuted, isVideoOff, localStream]);
  
  const chat = groupId ? chats.find(c => c.id === groupId) : null;
  const targetUser = userId ? users.find(u => u.id === userId) : null;
  const callName = chat ? chat.name : (targetUser ? targetUser.displayName : 'Private Call');

  const friendsList = users.filter(u => !removedFriendIds.includes(u.id) && u.id !== user?.id);
  const addableUsers = (chat?.isGroup ? chat.participants : friendsList).filter(u => 
    u.id !== 'me' && !participants.some(p => p.id === u.id)
  );

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev => 
      prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
    );
  };

  const ringSelectedUsers = () => {
    const usersToRing = addableUsers.filter(u => selectedUserIds.includes(u.id));
    
    const newParticipants: Participant[] = usersToRing.map(u => ({
      id: u.id,
      name: (u as any).name || (u as any).displayName,
      avatar: u.avatar,
      isMuted: Math.random() > 0.7,
      isVideoOff: type === 'voice' || Math.random() > 0.8,
      isSpeaking: false,
      status: 'ringing'
    }));

    setParticipants(prev => [...prev, ...newParticipants]);
    setShowAddFriend(false);
    setSelectedUserIds([]);
    
    // Transition to online after 3-5 seconds (randomized for realism)
    newParticipants.forEach(p => {
      setTimeout(() => {
        setParticipants(prev => prev.map(pt => pt.id === p.id ? { ...pt, status: 'online' } : pt));
      }, 3000 + Math.random() * 2000);
    });
  };

  const sendPing = () => {
    if (!socket) return;
    playPingSound();
    const computedRoomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
    socket.emit('call_ping', { roomId: computedRoomId, from: user?.id });
  };

  const ringAllMembers = () => {
    if (addableUsers.length === 0) return;
    
    setShowRings(true);
    const newParticipants: Participant[] = addableUsers.map(u => ({
      id: u.id,
      name: (u as any).name || (u as any).displayName,
      avatar: u.avatar,
      isMuted: Math.random() > 0.7,
      isVideoOff: type === 'voice' || Math.random() > 0.8,
      isSpeaking: false,
      status: 'ringing'
    }));

    setParticipants(prev => [...prev, ...newParticipants]);
    
    // Transition to online after 3-5 seconds
    newParticipants.forEach(p => {
      setTimeout(() => {
        setParticipants(prev => prev.map(pt => pt.id === p.id ? { ...pt, status: 'online' } : pt));
      }, 3000 + Math.random() * 2000);
    });
  };

  const handleRetry = () => {
    console.log('[Diagnostic] Performing full call re-attempt (Retry)...');
    setCallError(null);
    setRemoteStreams({});
    setLocalStream(null);
    setDuration(0);
    setCallAttempt(prev => prev + 1);
  };

  useEffect(() => {
    // Mock participants joining
    const initialParticipants: Participant[] = [
      { id: 'me', name: 'You', avatar: user?.avatar || generateInitialsAvatar(user?.id || 'me', user?.displayName || 'You'), isMuted: false, isVideoOff: type === 'voice', isSpeaking: false, status: 'online' },
    ];
    
    let privateCallTimeoutId: any = null;
    
    if (targetUser) {
      initialParticipants.push({
        id: targetUser.id,
        name: (targetUser as any).name || (targetUser as any).displayName,
        avatar: targetUser.avatar,
        isMuted: false,
        isVideoOff: type === 'voice',
        isSpeaking: false,
        status: 'ringing'
      });
      // We no longer mock transition for private calls. We wait for WebRTC stream.
    } else if (chat && !userId) {
      // For group calls, add all participants as ringing/offline initially
      chat.participants.filter(p => p.id !== 'me').forEach(u => {
        initialParticipants.push({
          id: u.id,
          name: u.name,
          avatar: u.avatar,
          isMuted: false,
          isVideoOff: type === 'voice',
          isSpeaking: false,
          status: 'ringing'
        });
      });
    }

    setParticipants(initialParticipants);

    const timer = setInterval(() => {
      if (!isHold) setDuration(d => d + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
      if (privateCallTimeoutId) clearTimeout(privateCallTimeoutId);
    };
  }, [groupId, userId, type, targetUser, chat, isHold, callAttempt]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isPipMode = !!userId && participants.length === 2 && type === 'video';
  const isOneOnOne = !!userId && participants.length === 2;
  const isSinkSupported = typeof window !== 'undefined' && typeof (HTMLMediaElement.prototype as any).setSinkId === 'function';

  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.id === 'me') return 1;
    if (b.id === 'me') return -1;
    return 0;
  });

  const onlineParticipants = sortedParticipants.filter(p => p.status === 'online');
  const waitingParticipants = sortedParticipants.filter(p => p.status !== 'online');

  // Outgoing ringtone synthesizer
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let interval: any = null;

    if (waitingParticipants.length > 0 && waitingParticipants.some(p => p.status === 'ringing') && onlineParticipants.length === 1) {
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const playOutgoingRing = () => {
          if (!audioCtx) return;
          oscillator = audioCtx.createOscillator();
          gainNode = audioCtx.createGain();
          
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
          oscillator.frequency.setValueAtTime(480, audioCtx.currentTime + 0.1);
          
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + 1.0);
          gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.2);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 1.3);
        };

        playOutgoingRing();
        interval = setInterval(playOutgoingRing, 3500);
        
      } catch(e) {
        console.warn("Could not play outgoing ringtone:", e);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
      if (oscillator) {
        try { oscillator.stop(); } catch(e) {}
      }
      if (audioCtx) {
        audioCtx.close().catch(console.warn);
      }
    };
  }, [waitingParticipants.length, onlineParticipants.length]);

  // Compute remote participants that are visible in the layout vs those that need a background audio player
  const visibleRemoteIds = isOneOnOne 
    ? [participants[1]?.id].filter(Boolean)
    : onlineParticipants
        .filter(p => viewMode === 'grid' || p.isSpeaking || p.id === 'me')
        .slice(0, viewMode === 'speaker' ? 1 : undefined)
        .map(p => p.id)
        .filter(id => id !== 'me');

  const backgroundRemoteParticipants = onlineParticipants.filter(p => 
    p.id !== 'me' && 
    !visibleRemoteIds.includes(p.id)
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-slate-950 flex flex-col text-white overflow-hidden font-sans"
    >
      {/* PTT Broadcast Overlay */}
      {isRecordingPTT && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[250] bg-emerald-500/90 backdrop-blur-md px-6 py-3 rounded-full border border-emerald-400/30 flex items-center gap-3 shadow-2xl animate-bounce">
          <Icon name="graphic_eq" className="text-xl animate-pulse" />
          <span className="text-xs font-black uppercase tracking-widest">Broadcasting Voice Live...</span>
          <div className="flex gap-1 items-center">
            <span className="h-2 w-0.5 bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-3 w-0.5 bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-4 w-0.5 bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="h-2 w-0.5 bg-white animate-bounce" style={{ animationDelay: '450ms' }} />
          </div>
        </div>
      )}

      {/* PTT Incoming Playback Overlay */}
      {incomingPTT && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[250] bg-primary/95 backdrop-blur-md px-6 py-3 rounded-full border border-primary/30 flex items-center gap-3 shadow-2xl animate-pulse">
          <Icon name="volume_up" className="text-xl animate-bounce" />
          <span className="text-xs font-black uppercase tracking-widest text-white">Playing P2P Voice from {incomingPTT.fromName}...</span>
          <div className="flex gap-1 items-center">
            <span className="h-2 w-0.5 bg-white animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="h-4 w-0.5 bg-white animate-pulse" style={{ animationDelay: '200ms' }} />
            <span className="h-3 w-0.5 bg-white animate-pulse" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
      )}

      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="px-6 md:px-10 py-5 md:py-8 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3 md:gap-5">
          <button 
            onClick={onClose} 
            className="size-9 md:size-12 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all border border-white/5 group"
          >
            <Icon name="arrow_back" className="text-sm md:text-base group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <h2 className="font-black text-base md:text-xl tracking-tighter uppercase italic leading-none">{callName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={cn("size-1.5 rounded-full", connectionStage === 'established' ? "bg-emerald-500 animate-pulse" : "bg-amber-400 animate-ping")} />
              <span className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-white/50">
                {connectionStage === 'establishing' && "1/2 Media Setup..."}
                {connectionStage === 'testing_ping' && "2/2 Connection Test..."}
                {connectionStage === 'established' && formatDuration(duration)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {!isOneOnOne && (
            <button 
              onClick={() => setViewMode(viewMode === 'grid' ? 'speaker' : 'grid')}
              className={cn(
                "size-9 md:size-12 rounded-full flex items-center justify-center transition-all border group",
                viewMode === 'speaker' ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-white/5 text-white hover:bg-white/10"
              )}
              title={viewMode === 'grid' ? "Switch to Speaker View" : "Switch to Grid View"}
            >
              <Icon name={viewMode === 'grid' ? 'grid_view' : 'person'} className="text-sm md:text-base group-hover:scale-110 transition-transform" />
            </button>
          )}
          <div className="bg-white/5 px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/5">
            <span className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-primary">{onlineParticipants.length} Online</span>
          </div>
        </div>
      </header>

      {/* Platform routing warning for Safari/iOS */}
      {speakerMode === 'earpiece' && !isSinkSupported && (
        <div className="bg-amber-500/10 border-y border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 z-40 text-amber-300">
          <Icon name="warning" className="text-sm" />
          <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-wider font-bold">
            Platform Note: iOS/Safari does not support direct audio earpiece routing. Uses system defaults.
          </span>
        </div>
      )}

      {/* Warning call error banner */}
      {callError && (callError.code === 'SINK_SWITCH_FAILED' || callError.code === 'CONNECTION_DISCONNECTED') && (
        <div className="bg-amber-500/10 border-y border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 z-40 text-amber-300">
          <Icon name="warning" className="text-sm animate-pulse" />
          <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-wider font-bold">
            {callError.code}: {callError.message}
          </span>
          <button 
            onClick={() => setCallError(null)}
            className="ml-2 text-[9px] md:text-[10px] font-mono font-bold uppercase underline text-amber-300/60 hover:text-amber-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Critical Call Error Centered Overlay */}
      <AnimatePresence>
        {callError && callError.code !== 'SINK_SWITCH_FAILED' && callError.code !== 'CONNECTION_DISCONNECTED' && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-red-500/20 max-w-md w-full rounded-[2.5rem] p-8 md:p-10 shadow-2xl flex flex-col items-center text-center gap-6"
            >
              <div className="size-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                <Icon name="error_outline" className="text-3xl" />
              </div>
              
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-red-400">{callError.code}</span>
                <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter italic text-white">Call Failure Detected</h3>
                <p className="text-sm text-neutral-muted leading-relaxed mt-1">{callError.message}</p>
              </div>

              {callError.technicalDescription && (
                <div className="bg-black/40 border border-white/5 rounded-2xl p-4 w-full text-left font-mono text-[10px] text-white/50 break-all leading-normal select-text">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Diagnostic Log:</div>
                  {callError.technicalDescription}
                </div>
              )}

              <div className="flex items-center gap-3 w-full mt-2">
                <button 
                  onClick={handleRetry}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest py-4 px-6 rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                >
                  Retry Call
                </button>
                <button 
                  onClick={onClose}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black text-xs uppercase tracking-widest py-4 px-6 rounded-2xl active:scale-95 transition-all"
                >
                  End Call
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Connection Test & Establishment Loading Banner */}
      <AnimatePresence>
        {connectionStage !== 'established' && !callError && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative size-20 mb-6 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
              <div className="absolute inset-0 rounded-full border-2 border-t-primary border-r-primary/50 border-b-transparent border-l-transparent animate-spin" />
              <Icon name={connectionStage === 'establishing' ? 'graphic_eq' : 'wifi_tethering'} className="text-2xl text-primary animate-pulse" />
            </div>
            
            <h3 className="text-lg md:text-xl font-black uppercase tracking-tight text-white mb-2">
              {connectionStage === 'establishing' ? 'Initializing Peer Session...' : 'Running Pre-Flight Connection Test...'}
            </h3>
            <p className="text-xs text-white/60 font-mono max-w-sm mb-5">
              {connectionStage === 'establishing' 
                ? 'Acquiring local microphone stream and establishing signaling room...' 
                : 'Testing peer latency, WebRTC data channels, and packet delivery before connection...'}
            </p>

            <div className="w-56 bg-white/10 rounded-full h-2 overflow-hidden mb-3">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-out"
                style={{ width: connectionStage === 'establishing' ? '40%' : '85%' }}
              />
            </div>
            <span className="text-[10px] font-mono text-primary uppercase font-bold tracking-widest">
              {connectionStage === 'establishing' ? 'Step 1/2 • Media Setup' : 'Step 2/2 • Connection Test Running'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Video Area */}
      <main className="flex-1 relative overflow-y-auto no-scrollbar py-4 md:py-8 px-4 md:px-8">
        {isOneOnOne ? (
          /* One-on-One View */
          <div className="min-h-full flex flex-col items-center justify-center gap-12 md:gap-20 relative">
            <div className="relative">
              {/* Pulse Rings */}
              <AnimatePresence>
                {showRings && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div 
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute size-48 rounded-full border border-primary/30"
                    />
                    <motion.div 
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{ scale: [1, 2], opacity: [0.2, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                      className="absolute size-48 rounded-full border border-primary/20"
                    />
                  </div>
                )}
              </AnimatePresence>

              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="size-40 md:size-56 rounded-[3rem] overflow-hidden border-4 border-white/10 p-2 bg-slate-900 shadow-2xl relative z-10 flex items-center justify-center"
              >
                {participants[1] && (
                  <div className="size-full relative flex items-center justify-center">
                    <VideoPlayer 
                      stream={participants[1] ? (remoteStreams[participants[1].streamId] || remoteStreams[participants[1].id] || null) : null} 
                      className="size-full rounded-[2.5rem] object-cover" 
                      speakerMode={speakerMode}
                      isVideoOff={participants[1].isVideoOff || type === 'voice'}
                    />
                    {(participants[1].isVideoOff || type === 'voice') && (
                      <img 
                        src={participants[1]?.avatar || generateInitialsAvatar(participants[1]?.id || 'user', participants[1]?.name || 'User')} 
                        className="size-full rounded-[2.5rem] object-cover absolute inset-0" 
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                )}
              </motion.div>
              
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                {participants[1] && (peerStats[participants[1].id]?.inboundStalled || peerStats[participants[1].id]?.remoteOutboundStalled) ? (
                  <div className="bg-red-950/90 border border-red-500/30 px-6 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
                    <div className="size-2 rounded-full bg-red-500 animate-ping" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">🔇 VOICE STALLED (WS Audit)</span>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-white/10 px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-2">
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest italic">Connected</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center space-y-4 md:space-y-6 relative z-10">
              <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">{participants[1]?.name}</h1>
              <div className="flex flex-col items-center justify-center gap-2">
                {participants[1] && (peerStats[participants[1].id]?.inboundStalled || peerStats[participants[1].id]?.remoteOutboundStalled) ? (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400 bg-red-500/10 px-4 py-1.5 rounded-xl border border-red-500/10">
                    Warning: Audio stream has stalled. Local/Remote WebRTC state is active but no audio bytes are flowing.
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-white/30">
                    {type === 'voice' ? 'Encrypted Audio Connection Active' : 'Voice & Video Stream Active'}
                  </span>
                )}
              </div>
            </div>
            
            {/* Self View (PIP) */}
            <motion.div 
              drag
              dragConstraints={{ left: -200, right: 200, top: -200, bottom: 200 }}
              className="absolute bottom-4 md:bottom-8 right-4 md:right-8 size-24 md:size-40 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden border-2 border-white/10 shadow-2xl bg-slate-900 group cursor-move z-30"
            >
              <div className="size-full relative">
                <VideoPlayer 
                  stream={localStream} 
                  isLocal={true} 
                  className="size-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                  isVideoOff={participants[0]?.isVideoOff || type === 'voice'}
                />
                {(participants[0]?.isVideoOff || type === 'voice') && (
                  <img 
                    src={participants[0]?.avatar || generateInitialsAvatar(user?.id || 'me', user?.displayName || 'You')} 
                    className="size-full object-cover opacity-80 group-hover:opacity-100 transition-opacity absolute inset-0 bg-slate-900" 
                    referrerPolicy="no-referrer" 
                  />
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-2 md:bottom-3 left-3 md:left-4 flex items-center gap-2 pointer-events-none">
                <div className="size-1 md:size-1.5 rounded-full bg-primary" />
                <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-70">You</span>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Group View */
          <div className="w-full max-w-6xl mx-auto space-y-12 py-6 md:py-10">
            {/* Online Grid */}
            <div className={cn(
              "grid gap-4 md:gap-6",
              viewMode === 'speaker' ? "grid-cols-1" : 
              onlineParticipants.length <= 4 ? "grid-cols-2" :
              "grid-cols-2 lg:grid-cols-3"
            )}>
              {onlineParticipants
                .filter(p => viewMode === 'grid' || p.isSpeaking || p.id === 'me')
                .slice(0, viewMode === 'speaker' ? 1 : undefined)
                .map((p, i) => (
                <motion.div 
                  key={`grid-p-${p.id}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className={cn(
                    "relative rounded-[2rem] md:rounded-[3rem] overflow-hidden bg-slate-900 border transition-all group",
                    viewMode === 'speaker' ? "aspect-video md:min-h-[400px]" : "aspect-square md:aspect-auto md:min-h-[300px]",
                    p.isSpeaking ? "border-primary ring-4 ring-primary/20" : "border-white/5"
                  )}
                >
                  {/* Time Rings (Pulse Effect) */}
                  <AnimatePresence mode="wait">
                    {showRings && (
                      <motion.div 
                        key={`rings-${p.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      >
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: [0.8, 2], opacity: [0.4, 0] }}
                          transition={{ repeat: Infinity, duration: 4, delay: i * 0.8, ease: "easeOut" }}
                          className="absolute size-40 md:size-64 rounded-full border border-primary/30 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.2)]"
                        />
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: [0.8, 2.5], opacity: [0.2, 0] }}
                          transition={{ repeat: Infinity, duration: 4, delay: i * 0.8 + 1, ease: "easeOut" }}
                          className="absolute size-40 md:size-64 rounded-full border border-primary/10"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="size-full relative">
                    <VideoPlayer 
                      stream={p.id === 'me' ? localStream : (p.streamId ? remoteStreams[p.streamId] : null)} 
                      isLocal={p.id === 'me'}
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-110" 
                      speakerMode={speakerMode}
                      isVideoOff={p.isVideoOff || type === 'voice'}
                    />
                    {(p.isVideoOff || type === 'voice') && (
                      <img 
                        src={p.avatar} 
                        className="size-full object-cover transition-transform duration-700 group-hover:scale-110 blur-2xl opacity-30 absolute inset-0 bg-slate-900" 
                        referrerPolicy="no-referrer"
                      />
                    )}

                    {/* Stalled audio banner overlay */}
                    {p.id !== 'me' && (peerStats[p.id]?.inboundStalled || peerStats[p.id]?.remoteOutboundStalled) && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-950/75 backdrop-blur-md p-4 text-center">
                        <div className="size-11 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 animate-pulse mb-2.5">
                          <Icon name="mic_off" className="text-lg" />
                        </div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-400">Audio Stream Stalled</span>
                        <p className="text-[8px] text-white/60 max-w-[160px] mt-1 leading-normal">
                          The remote peer stopped sending voice data. Monitored via active continuous WebSocket socket connection audit.
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Video Off Overlay */}
                  {(p.isVideoOff || type === 'voice') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                      <div className="relative">
                        <Avatar src={p.avatar} className="size-20 md:size-28 border-4 border-white/10" />
                        {type !== 'voice' && (
                          <div className="absolute -top-2 -right-2 size-10 rounded-2xl bg-slate-900/80 backdrop-blur-md flex items-center justify-center border-2 border-white/10 text-white/60">
                            <Icon name="videocam_off" className="text-lg" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-6 left-4 right-4 flex items-center justify-between">
                    <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-3">
                      {p.isSpeaking && <div className="size-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                      <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[100px]">{p.name}</span>
                      
                      {/* Status Icons */}
                      <div className="flex items-center gap-2 border-l border-white/20 ml-2 pl-3">
                        {p.isMuted && (
                          <div className="bg-red-500/20 p-1 rounded-lg border border-red-500/30">
                            <Icon name="mic_off" className="text-[14px] text-red-400" />
                          </div>
                        )}
                        {p.isVideoOff && type !== 'voice' && (
                          <div className="bg-white/10 p-1 rounded-lg border border-white/10">
                            <Icon name="videocam_off" className="text-[14px] text-white/60" />
                          </div>
                        )}
                      </div>
                    </div>
                    {p.id !== 'me' && peerStats[p.id] && (
                      <div className="bg-black/85 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/15 flex flex-col gap-1 text-[8px] font-mono text-white/70 text-right opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap min-w-[140px] z-30 shadow-2xl">
                        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1 mb-1">
                          <span className="text-[7px] text-white/40 uppercase font-bold">WS Audit:</span>
                          <div className="flex items-center gap-1">
                            <span className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[7px] text-emerald-400 uppercase font-black">ACTIVE</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/40">STATUS:</span>
                          <span className={peerStats[p.id].isFlowing ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                            {peerStats[p.id].isFlowing ? 'LIVE AUDIO' : 'SILENT'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/40">ROUTING:</span>
                          <span className={(peerStats[p.id].localCandidateType === 'relay' || peerStats[p.id].remoteLocalCandidateType === 'relay') ? 'text-amber-300 font-bold' : 'text-sky-400 font-bold'}>
                            {(peerStats[p.id].localCandidateType === 'relay' || peerStats[p.id].remoteLocalCandidateType === 'relay') ? 'TURN RELAY 🌐' : 'STUN DIRECT ⚡'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/40">TX RATE:</span>
                          <span>{Math.round((peerStats[p.id].sentDelta || 0) * 8 / 1000 / 5)} kbps</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/40">RX RATE:</span>
                          <span>{Math.round((peerStats[p.id].receivedDelta || 0) * 8 / 1000 / 5)} kbps</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/40">CANDIDATE:</span>
                          <span className="text-[7px] text-white/50 truncate max-w-[80px]">{peerStats[p.id].localCandidateType || 'STUN'}</span>
                        </div>
                      </div>
                    )}
                    {p.id !== 'me' && !peerStats[p.id] && (
                      <button className="size-8 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icon name="more_horiz" className="text-xs" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Waiting/Ringing Section */}
            {waitingParticipants.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 px-4">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-white/20">Waiting to Join ({waitingParticipants.length})</span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                
                <div className="flex flex-wrap justify-center gap-4 px-4">
                  {waitingParticipants.map((p) => (
                    <motion.div 
                      key={`waiting-${p.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 border border-white/5 rounded-2xl p-3 flex items-center gap-4 min-w-[180px]"
                    >
                      <div className="relative">
                        <Avatar src={p.avatar} className={cn("size-10 border-2 transition-all", p.status === 'ringing' ? "border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" : "border-white/10")} />
                        {p.status === 'ringing' && (
                          <>
                            <div className="absolute -top-1 -right-1 size-3 bg-primary rounded-full animate-ping" />
                            <div className="absolute inset-0 rounded-full border border-primary/50 animate-ring-pulse" />
                          </>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest leading-none">{p.name}</p>
                        <p className={cn(
                          "text-[8px] font-bold uppercase tracking-widest mt-1",
                          p.status === 'ringing' ? "text-primary animate-pulse" : "text-white/20"
                        )}>
                          {p.status === 'ringing' ? 'Ringing...' : 'Offline'}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Controls */}
      <footer className="p-6 md:p-10 z-30 shrink-0 flex justify-center">
        <div className="bg-slate-900/40 backdrop-blur-3xl px-5 py-3 md:px-8 md:py-4 rounded-full border border-white/10 shadow-2xl flex items-center gap-5 md:gap-12">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "size-10 md:size-14 rounded-full flex items-center justify-center transition-all",
              isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'
            )}
            title="Mute/Unmute Mic"
          >
            <Icon name={isMuted ? 'mic_off' : 'mic'} className="text-lg md:text-2xl" />
          </button>

          <button 
            onClick={togglePTT}
            className={cn(
              "size-10 md:size-14 rounded-full flex items-center justify-center transition-all relative select-none",
              isRecordingPTT 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-500/20 animate-pulse' 
                : 'bg-white/5 text-white hover:bg-white/10'
            )}
            title="Send Live Voice over P2P Data Channel (Walkie-Talkie)"
          >
            <Icon name="graphic_eq" className={cn("text-lg md:text-2xl", isRecordingPTT && "animate-bounce")} />
            {isRecordingPTT && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            )}
          </button>

          {type === 'video' && (
            <button 
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={cn(
                "size-10 md:size-14 rounded-full flex items-center justify-center transition-all",
                isVideoOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'
              )}
            >
              <Icon name={isVideoOff ? 'videocam_off' : 'videocam'} className="text-lg md:text-2xl" />
            </button>
          )}
          
          <button 
            onClick={onClose}
            className="size-14 md:size-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-600/40 active:scale-90 hover:scale-105 hover:brightness-110 transition-all"
          >
            <Icon name="call_end" className="text-2xl md:text-4xl" />
          </button>

          <button 
            onClick={() => setShowAddFriend(true)}
            className="size-10 md:size-14 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <Icon name="person_add" className="text-lg md:text-2xl" />
          </button>

          {chat?.isGroup && (
            <button 
              onClick={ringAllMembers}
              className="size-10 md:size-14 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all"
              title="Ring All Members"
            >
              <Icon name="stream" className="text-lg md:text-2xl" />
            </button>
          )}

          <button 
            onClick={() => setSpeakerMode(speakerMode === 'speaker' ? 'earpiece' : 'speaker')}
            className={cn(
              "size-10 md:size-14 rounded-full flex items-center justify-center transition-all",
              speakerMode === 'speaker' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white hover:bg-white/10'
            )}
          >
            <Icon name={speakerMode === 'speaker' ? 'volume_up' : 'hearing'} className="text-lg md:text-2xl" />
          </button>

          <button 
            onClick={() => setPingSoundsEnabled(!pingSoundsEnabled)}
            className={cn(
              "size-10 md:size-14 rounded-full flex items-center justify-center transition-all",
              pingSoundsEnabled ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-white/5 text-white hover:bg-white/10'
            )}
            title="Toggle Ping Sounds"
          >
            <Icon name={pingSoundsEnabled ? 'notifications_active' : 'notifications_off'} className="text-lg md:text-2xl" />
          </button>

          {pingSoundsEnabled && (
            <button 
              onClick={sendPing}
              className="size-10 md:size-14 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all hover:text-yellow-400 active:scale-90"
              title="Send Ping"
            >
              <Icon name="vibration" className="text-lg md:text-2xl" />
            </button>
          )}

          <button 
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className={cn(
              "size-10 md:size-14 rounded-full flex items-center justify-center transition-all",
              showDiagnostics ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-white hover:bg-white/10'
            )}
            title="Toggle Diagnostics Log"
          >
            <Icon name="terminal" className="text-lg md:text-2xl" />
          </button>
        </div>
      </footer>

      {/* Background Audio Players for hidden/filtered participants to guarantee audio is never lost */}
      <div className="absolute opacity-0 pointer-events-none w-32 h-32 -bottom-96 -right-96 overflow-hidden" aria-hidden="true">
        {backgroundRemoteParticipants.map(p => (
          <VideoPlayer 
            key={`bg-audio-${p.id}`}
            stream={p.streamId ? remoteStreams[p.streamId] : null}
            isLocal={false}
            isVideoOff={true}
            speakerMode={speakerMode}
          />
        ))}
      </div>

      {/* Add Friend Modal */}
      <AnimatePresence>
        {showAddFriend && (
          <div className="fixed inset-0 z-[210] flex items-end md:items-center justify-center p-0 md:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddFriend(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative bg-slate-900 w-full max-w-md rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-white/5"
            >
              <div className="p-6 border-b border-white/5 flex flex-col gap-4 bg-slate-900/50 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-black uppercase tracking-tighter italic leading-none">Add to Call</h3>
                  </div>
                  <button onClick={() => setShowAddFriend(false)} className="size-10 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-white/40 hover:text-white">
                    <Icon name="close" />
                  </button>
                </div>

                <div className="relative">
                  <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-sm" />
                  <input 
                    type="text"
                    placeholder="Search participants..."
                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-xs font-mono uppercase tracking-widest focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
                {addableUsers
                  .filter(u => 
                    ((u as any).name || (u as any).displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(u => {
                    const isSelected = selectedUserIds.includes(u.id);
                    const isAlreadyInCall = participants.some(p => p.id === u.id);

                    return (
                      <div 
                        key={`add-call-${u.id}`}
                        onClick={() => !isAlreadyInCall && toggleUserSelection(u.id)}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-2xl transition-all cursor-pointer group border",
                          isAlreadyInCall ? "opacity-30 cursor-not-allowed border-transparent" : 
                          isSelected ? "bg-primary/10 border-primary/20" : "hover:bg-white/5 border-transparent hover:border-white/5"
                        )}
                      >
                        <div className="relative">
                          <Avatar src={u.avatar} className="size-12 border-2 border-white/5" />
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 size-5 rounded-full bg-primary flex items-center justify-center border-2 border-slate-900">
                              <Icon name="check" className="text-[10px] text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-black uppercase tracking-tight italic leading-none text-white">{(u as any).name || (u as any).displayName}</p>
                          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 mt-1">{u.username}</p>
                        </div>
                        {!isAlreadyInCall && (
                          <div className={cn(
                            "size-6 rounded-lg border-2 flex items-center justify-center transition-all",
                            isSelected ? "bg-primary border-primary" : "border-white/10 group-hover:border-white/20"
                          )}>
                            {isSelected && <Icon name="check" className="text-xs text-white" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                
                {addableUsers.length === 0 && (
                  <div className="py-12 text-center space-y-4">
                    <div className="size-16 rounded-3xl bg-white/5 flex items-center justify-center mx-auto text-white/20">
                      <Icon name="group" className="text-3xl" />
                    </div>
                    <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">No members available to add</p>
                  </div>
                )}
              </div>

              {selectedUserIds.length > 0 && (
                <div className="p-6 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
                  <button 
                    onClick={ringSelectedUsers}
                    className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest italic flex items-center justify-center gap-3 shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                  >
                    <Icon name="ring_volume" />
                    Ring {selectedUserIds.length} {selectedUserIds.length === 1 ? 'Participant' : 'Participants'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WebRTC Diagnostics Drawer */}
      <AnimatePresence>
        {showDiagnostics && (
          <div className="fixed inset-y-0 right-0 z-[220] flex justify-end">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDiagnostics(false)}
              className="fixed inset-0 bg-black backdrop-blur-sm"
            />
            
            {/* Drawer Body */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-[460px] h-full bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col overflow-hidden text-white font-sans"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-white/5 flex flex-col gap-4 bg-slate-950/60 backdrop-blur-xl shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                      <Icon name="terminal" className="text-base" />
                    </div>
                    <div>
                      <h3 className="text-base font-black uppercase tracking-tighter italic leading-none">RTC Diagnostics Log</h3>
                      <p className="text-[9px] font-mono font-bold tracking-widest text-white/30 uppercase mt-1">Real-time Call Auditing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        diagnosticLogger.clearLogs();
                        setDiagnosticLogs([]);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-[8px] font-mono uppercase tracking-widest font-bold"
                      title="Clear Diagnostics Log Buffer"
                    >
                      Clear
                    </button>
                    <button 
                      onClick={() => setShowDiagnostics(false)} 
                      className="size-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-white/40 hover:text-white"
                    >
                      <Icon name="close" className="text-sm" />
                    </button>
                  </div>
                </div>

                {/* Search Log Field */}
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs" />
                  <input 
                    type="text"
                    placeholder="Filter keyword, event or peer..."
                    className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-3 text-[10px] font-mono uppercase tracking-widest focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
                    value={diagFilter}
                    onChange={(e) => setDiagFilter(e.target.value)}
                  />
                </div>

                {/* Tabs */}
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                  {['all', 'signaling', 'socket', 'webrtc', 'media', 'error'].map(cat => {
                    const count = diagnosticLogs.filter(l => cat === 'all' ? true : l.category === cat).length;
                    const isActive = diagCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setDiagCategory(cat)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg border text-[8px] font-mono uppercase tracking-wider font-bold transition-all shrink-0 flex items-center gap-1.5",
                          isActive 
                            ? "bg-primary border-primary text-white" 
                            : "bg-white/5 border-white/5 text-white/60 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <span>{cat}</span>
                        <span className={cn(
                          "px-1 py-0.5 rounded-md text-[7px]",
                          isActive ? "bg-white/25 text-white" : "bg-white/10 text-white/40"
                        )}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Log List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-950/20 font-mono">
                {filteredDiagLogs.length === 0 ? (
                  <div className="py-16 text-center space-y-4">
                    <div className="size-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto text-white/20">
                      <Icon name="history_edu" className="text-2xl" />
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">No matching logs captured</p>
                  </div>
                ) : (
                  filteredDiagLogs.map((log) => {
                    const isExpanded = expandedLogs.includes(log.id);
                    return (
                      <div 
                        key={log.id} 
                        className={cn(
                          "border rounded-xl p-3 transition-all",
                          log.category === 'error' ? "bg-red-500/5 border-red-500/10" :
                          log.category === 'webrtc' ? "bg-blue-500/5 border-blue-500/10" :
                          log.category === 'signaling' ? "bg-amber-500/5 border-amber-500/10" :
                          log.category === 'socket' ? "bg-purple-500/5 border-purple-500/10" :
                          "bg-white/5 border-white/5"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[8px] font-bold text-white/30 shrink-0">{log.timeStr}</span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider shrink-0",
                                log.category === 'error' ? "bg-red-500/25 text-red-300" :
                                log.category === 'webrtc' ? "bg-blue-500/25 text-blue-300" :
                                log.category === 'signaling' ? "bg-amber-500/25 text-amber-300" :
                                log.category === 'socket' ? "bg-purple-500/25 text-purple-300" :
                                "bg-slate-500/25 text-slate-300"
                              )}>
                                {log.category}
                              </span>
                              <span className="text-[9px] font-black text-white/80 uppercase tracking-tight truncate">{log.event}</span>
                            </div>
                            <p className="text-[9px] text-white/60 leading-relaxed break-words mt-1">{log.message}</p>
                          </div>
                          {log.metadata && (
                            <button 
                              onClick={() => toggleLogExpanded(log.id)}
                              className="size-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all text-white/40 hover:text-white shrink-0"
                            >
                              <Icon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-[10px]" />
                            </button>
                          )}
                        </div>
                        {isExpanded && log.metadata && (
                          <div className="mt-2.5 p-2 bg-black/50 border border-white/5 rounded-lg text-[7px] text-emerald-400 overflow-x-auto select-all leading-tight max-h-[160px] whitespace-pre-wrap font-mono">
                            {JSON.stringify(log.metadata, null, 2)}
                          </div>
                        )}
                        {(log.peerId || log.roomId) && (
                          <div className="flex gap-2 items-center text-[7px] text-white/30 uppercase mt-2 pt-1 border-t border-white/5 font-bold tracking-wider">
                            {log.peerId && <span>PEER: {log.peerId.substring(0, 8)}</span>}
                            {log.roomId && <span>ROOM: {log.roomId}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
