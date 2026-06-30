import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Avatar, Button, cn } from './UI';
import { useAppStore } from '../store';
import { webrtcService } from '../services/webrtcService';

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

const VideoPlayer = ({ stream, isLocal = false, isVideoOff = false, className }: { stream: MediaStream | null, isLocal?: boolean, isVideoOff?: boolean, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={cn("size-full object-cover", isVideoOff && "hidden", className)}
    />
  );
};

export const GroupCall = ({ groupId, userId, type, onClose }: { groupId?: string, userId?: string, type: 'voice' | 'video', onClose: () => void }) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'voice');
  const [duration, setDuration] = useState(0);
  const [isHold, setIsHold] = useState(false);
  
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRings, setShowRings] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'speaker'>('grid');
  const [speakerMode, setSpeakerMode] = useState<'speaker' | 'earpiece'>('speaker');
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const { removedFriendIds, socket, user, chats, users } = useAppStore();
  
  useEffect(() => {
    if (socket && (groupId || userId)) {
      const roomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
      socket.emit('join_call', { roomId, userId: user?.id });
      
      if (userId) {
        socket.emit('call_user', { to: userId, roomId, type, from: user?.id });
      }

      socket.emit('sfu_signal', {
        roomId,
        from: user?.id,
        signal: { type: 'request_tracks' }
      });

      const handleUserJoined = (data: { userId: string }) => {
        console.log('User joined call:', data.userId);
      };

      socket.on('user_joined_call', handleUserJoined);
      
      return () => {
        socket.off('user_joined_call', handleUserJoined);
      };
    }
  }, [socket, groupId, userId, user]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    const startCall = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: type === 'video',
          audio: true
        });
        if (!mounted) return;
        setLocalStream(stream);

        const roomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
        await webrtcService.publishLocalStream(stream, roomId);
      } catch (err) {
        console.error('Failed to get local media or publish:', err);
      }
    };

    startCall();

    const handleRemoteStream = (e: any) => {
      const { from, stream: newStream } = e.detail;
      setRemoteStreams(prev => ({ ...prev, [from]: newStream }));
      
      // Update participant with streamId
      setParticipants(prev => {
        // Find a participant that doesn't have a streamId yet, or just add a new one
        // For simplicity, we'll just add a new participant if not found
        const existing = prev.find(p => p.id !== 'me' && !p.streamId);
        if (existing) {
          return prev.map(p => p.id === existing.id ? { ...p, streamId: from, status: 'online' } : p);
        } else {
          return [...prev, {
            id: from,
            name: `User ${from.substring(0, 4)}`,
            avatar: `https://picsum.photos/seed/${from}/200`,
            isMuted: false,
            isVideoOff: false,
            isSpeaking: false,
            status: 'online',
            streamId: from
          }];
        }
      });
    };

    window.addEventListener('webrtc_stream', handleRemoteStream);

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      webrtcService.closeSession();
      window.removeEventListener('webrtc_stream', handleRemoteStream);
      
      if (socket) {
        const roomId = groupId || `call-${[user?.id, userId].sort().join('-')}`;
        socket.emit('end_call', { to: userId, roomId });
      }
    };
  }, [type, socket, groupId, userId, user]);

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

  useEffect(() => {
    // Mock participants joining
    const initialParticipants: Participant[] = [
      { id: 'me', name: 'You', avatar: user?.avatar || 'https://picsum.photos/seed/me/200', isMuted: false, isVideoOff: type === 'voice', isSpeaking: false, status: 'online' },
    ];
    
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

      // Transition private call target to online
      setTimeout(() => {
        setParticipants(prev => prev.map(p => p.id === targetUser.id ? { ...p, status: 'online' } : p));
      }, 3000);
    }

    // For group calls, add all participants as ringing/offline initially
    if (chat && !userId) {
      chat.participants.filter(p => p.id !== 'me').forEach(u => {
        initialParticipants.push({
          id: u.id,
          name: u.name,
          avatar: u.avatar,
          isMuted: Math.random() > 0.7,
          isVideoOff: type === 'voice' || Math.random() > 0.8,
          isSpeaking: false,
          status: Math.random() > 0.1 ? 'ringing' : 'offline'
        });
      });
    }

    setParticipants(initialParticipants);

    const timer = setInterval(() => {
      if (!isHold) setDuration(d => d + 1);
    }, 1000);

    // Mock others joining for group calls (transition from ringing to online)
    let joinTimers: any[] = [];
    if (chat && !userId) {
      joinTimers = chat.participants.filter(p => p.id !== 'me').slice(0, 5).map((u, i) => {
        return setTimeout(() => {
          setParticipants(prev => {
            return prev.map(p => p.id === u.id && p.status === 'ringing' 
              ? { 
                  ...p, 
                  status: 'online', 
                  isMuted: Math.random() > 0.8, 
                  isVideoOff: type === 'voice' || Math.random() > 0.7,
                  isSpeaking: Math.random() > 0.7
                } 
              : p
            );
          });
        }, (i + 1) * 2000 + Math.random() * 3000);
      });
    }

    return () => {
      clearInterval(timer);
      joinTimers?.forEach(t => clearTimeout(t));
    };
  }, [groupId, userId, type, targetUser, chat, isHold]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isPipMode = !!userId && participants.length === 2 && type === 'video';
  const isOneOnOne = !!userId && participants.length === 2;

  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.id === 'me') return 1;
    if (b.id === 'me') return -1;
    return 0;
  });

  const onlineParticipants = sortedParticipants.filter(p => p.status === 'online');
  const waitingParticipants = sortedParticipants.filter(p => p.status !== 'online');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-slate-950 flex flex-col text-white overflow-hidden font-sans"
    >
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
              <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">{formatDuration(duration)}</span>
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
                className="size-40 md:size-56 rounded-[3rem] overflow-hidden border-4 border-white/10 p-2 bg-slate-900 shadow-2xl relative z-10"
              >
                {participants[1] && !participants[1].isVideoOff ? (
                  <VideoPlayer 
                    stream={participants[1].streamId ? remoteStreams[participants[1].streamId] : null} 
                    className="size-full rounded-[2.5rem] object-cover" 
                  />
                ) : (
                  <img 
                    src={participants[1]?.avatar || 'https://picsum.photos/seed/user/200'} 
                    className="size-full rounded-[2.5rem] object-cover" 
                    referrerPolicy="no-referrer"
                  />
                )}
              </motion.div>
              
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-slate-900 border border-white/10 px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-2">
                  <div className="size-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest italic">Connected</span>
                </div>
              </div>
            </div>

            <div className="text-center space-y-4 md:space-y-6 relative z-10">
              <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">{participants[1]?.name}</h1>
              <div className="flex items-center justify-center gap-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-white/30">Voice & Video Stream Active</span>
              </div>
            </div>
            
            {/* Self View (PIP) */}
            <motion.div 
              drag
              dragConstraints={{ left: -200, right: 200, top: -200, bottom: 200 }}
              className="absolute bottom-4 md:bottom-8 right-4 md:right-8 size-24 md:size-40 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden border-2 border-white/10 shadow-2xl bg-slate-900 group cursor-move z-30"
            >
              {!participants[0]?.isVideoOff ? (
                <VideoPlayer 
                  stream={localStream} 
                  isLocal={true} 
                  className="size-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                />
              ) : (
                <img src={participants[0]?.avatar} className="size-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-2 md:bottom-3 left-3 md:left-4 flex items-center gap-2">
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

                  {!p.isVideoOff ? (
                    <VideoPlayer 
                      stream={p.id === 'me' ? localStream : (p.streamId ? remoteStreams[p.streamId] : null)} 
                      isLocal={p.id === 'me'}
                      className={cn(
                        "size-full object-cover transition-transform duration-700 group-hover:scale-110"
                      )} 
                    />
                  ) : (
                    <img 
                      src={p.avatar} 
                      className={cn(
                        "size-full object-cover transition-transform duration-700 group-hover:scale-110 blur-2xl opacity-30"
                      )} 
                      referrerPolicy="no-referrer"
                    />
                  )}
                  
                  {/* Video Off Overlay */}
                  {p.isVideoOff && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                      <div className="relative">
                        <Avatar src={p.avatar} className="size-20 md:size-28 border-4 border-white/10" />
                        <div className="absolute -top-2 -right-2 size-10 rounded-2xl bg-slate-900/80 backdrop-blur-md flex items-center justify-center border-2 border-white/10 text-white/60">
                          <Icon name="videocam_off" className="text-lg" />
                        </div>
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
                        {p.isVideoOff && (
                          <div className="bg-white/10 p-1 rounded-lg border border-white/10">
                            <Icon name="videocam_off" className="text-[14px] text-white/60" />
                          </div>
                        )}
                      </div>
                    </div>
                    {p.id !== 'me' && (
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
          >
            <Icon name={isMuted ? 'mic_off' : 'mic'} className="text-lg md:text-2xl" />
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
        </div>
      </footer>

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
    </motion.div>
  );
};
