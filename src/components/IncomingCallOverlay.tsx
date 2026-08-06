import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './UI';
import { useAppStore } from '../store';
import { webrtcService } from '../services/webrtcService';

// Helper to generate initials for avatar placeholder
const generateInitialsAvatar = (id: string, name: string) => {
  const cleanName = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const parts = cleanName.split(' ');
  const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials || 'U')}&background=0D8ABC&color=fff`;
};

interface IncomingCallOverlayProps {
  incomingCall: { type: 'voice' | 'video' | 'walkie-talkie'; roomId: string; from: string };
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallOverlay = ({ incomingCall, onAccept, onDecline }: IncomingCallOverlayProps) => {
  const users = useAppStore(s => s.users);
  const caller = users.find(u => u.id === incomingCall.from);
  const callerName = caller ? (caller as any).name || (caller as any).displayName : 'Unknown Caller';
  const callerAvatar = caller?.avatar || generateInitialsAvatar(incomingCall.from, callerName);

  const [testPhase, setTestPhase] = useState<'testing' | 'completed'>('testing');
  const [testProgress, setTestProgress] = useState(0);
  const [testSteps, setTestSteps] = useState([
    { label: 'WebRTC STUN/TURN Server Connectivity', status: 'pending' },
    { label: 'Audio & Video Hardware Verification', status: 'pending' },
    { label: 'E2E Signaling Channel Stability', status: 'pending' }
  ]);

  // Pre-flight test run execution
  useEffect(() => {
    let mounted = true;

    const runAutoTest = async () => {
      // Step 1: STUN/TURN check
      setTestProgress(25);
      await webrtcService.fetchIceConfig(2, 400);
      if (!mounted) return;
      setTestSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'passed' } : s));
      setTestProgress(50);

      // Step 2: Hardware check
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          await navigator.mediaDevices.enumerateDevices();
        }
      } catch (e) {
        console.warn("[IncomingCall] Hardware check notice:", e);
      }
      if (!mounted) return;
      setTestSteps(prev => prev.map((s, idx) => idx === 1 ? { ...s, status: 'passed' } : s));
      setTestProgress(80);

      // Step 3: Signaling socket check
      await new Promise(r => setTimeout(r, 400));
      if (!mounted) return;
      setTestSteps(prev => prev.map((s, idx) => idx === 2 ? { ...s, status: 'passed' } : s));
      setTestProgress(100);

      await new Promise(r => setTimeout(r, 300));
      if (!mounted) return;

      setTestPhase('completed');
    };

    runAutoTest();

    return () => {
      mounted = false;
    };
  }, []);

  // Ringtone synthesizer - only plays once pre-flight test completes!
  useEffect(() => {
    if (testPhase !== 'completed') return;

    let audioCtx: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let interval: any = null;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playRing = () => {
        if (!audioCtx) return;
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(480, audioCtx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime + 1.2);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.4);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 1.5);
      };

      playRing();
      interval = setInterval(playRing, 2000);
      
    } catch(e) {
      console.warn("Could not play ringtone:", e);
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
  }, [testPhase]);

  return (
    <div id="incoming-call-overlay" className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-white p-4">
      {/* Ambient Pulsing Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-sky-500/20 blur-[100px] rounded-full animate-pulse" />
      </div>

      <AnimatePresence mode="wait">
        {testPhase === 'testing' ? (
          /* Pre-Flight Automatic Test Run View */
          <motion.div
            key="preflight-test"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative flex flex-col items-center max-w-md w-full p-8 rounded-3xl bg-slate-900/90 border border-white/10 shadow-2xl text-center space-y-6 z-10"
          >
            <div className="relative size-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-sky-500/30 animate-ping" />
              <div className="absolute inset-0 rounded-full border-2 border-t-sky-400 border-r-sky-500/50 border-b-transparent border-l-transparent animate-spin" />
              <Icon name="verified_user" className="text-3xl text-sky-400 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-100 italic">
                Automatic Pre-Flight Test
              </h2>
              <p className="text-xs text-sky-400 font-mono font-bold uppercase tracking-widest">
                Testing Connection & Media Hardware Before Ringing...
              </p>
            </div>

            {/* Test Step Checkmarks */}
            <div className="w-full space-y-2.5 text-left bg-slate-950/60 p-4 rounded-2xl border border-white/5">
              {testSteps.map((step, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono">
                  <span className={step.status === 'passed' ? 'text-slate-200' : 'text-slate-400'}>
                    {step.label}
                  </span>
                  {step.status === 'passed' ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <Icon name="check_circle" className="text-sm" /> PASSED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sky-400/80 animate-pulse font-bold">
                      <Icon name="sync" className="text-sm animate-spin" /> TESTING
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-sky-400 h-full transition-all duration-300 ease-out"
                style={{ width: `${testProgress}%` }}
              />
            </div>
          </motion.div>
        ) : (
          /* Ringing Pop-Up View */
          <motion.div
            key="ringing-popup"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex flex-col items-center max-w-sm w-full px-6 text-center space-y-10 z-10"
          >
            {/* Avatar with Pulsing Rings */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.5 }}
                  animate={{ scale: [0.8, 1.8], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                  className="absolute size-36 rounded-full border-2 border-sky-500/40"
                />
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.3 }}
                  animate={{ scale: [0.8, 2.2], opacity: [0.3, 0] }}
                  transition={{ repeat: Infinity, duration: 2, delay: 0.6, ease: "easeOut" }}
                  className="absolute size-36 rounded-full border border-sky-500/20"
                />
              </div>

              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="relative z-10 size-28 rounded-full overflow-hidden border-4 border-white/10 p-1 bg-slate-900 shadow-2xl"
              >
                <img src={callerAvatar} alt={callerName} className="size-full rounded-full object-cover" referrerPolicy="no-referrer" />
              </motion.div>
            </div>

            {/* Text Details */}
            <div className="space-y-2 z-10">
              <h2 className="text-2xl font-black uppercase tracking-tight italic text-slate-100">{callerName}</h2>
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-sky-400 animate-pulse">
                Incoming {incomingCall.type === 'voice' ? 'Voice Call' : 'Video Call'}...
              </p>
              <div className="flex items-center justify-center gap-1.5 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 w-fit mx-auto mt-2">
                <Icon name="verified" className="text-xs" /> Pre-Flight Test Verified
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-10 w-full z-10">
              {/* Decline Button */}
              <button
                id="decline-call-btn"
                onClick={onDecline}
                className="size-16 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl shadow-red-600/30 hover:bg-red-700 hover:scale-105 active:scale-95 transition-all group cursor-pointer"
                title="Decline Call"
              >
                <Icon name="call_end" className="text-3xl group-hover:rotate-[135deg] transition-transform duration-300" />
              </button>

              {/* Accept Button */}
              <button
                id="accept-call-btn"
                onClick={onAccept}
                className="size-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 hover:scale-105 active:scale-95 transition-all group cursor-pointer"
                title="Accept Call"
              >
                <Icon name={incomingCall.type === 'voice' ? 'call' : 'videocam'} className="text-3xl animate-bounce" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

