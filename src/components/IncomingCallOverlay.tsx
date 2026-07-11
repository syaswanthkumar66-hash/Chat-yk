import React from 'react';
import { motion } from 'motion/react';
import { Icon } from './UI';
import { useAppStore } from '../store';

// Helper to generate initials for avatar placeholder
const generateInitialsAvatar = (id: string, name: string) => {
  const cleanName = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const parts = cleanName.split(' ');
  const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials || 'U')}&background=0D8ABC&color=fff`;
};

interface IncomingCallOverlayProps {
  incomingCall: { type: 'voice' | 'video'; roomId: string; from: string };
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallOverlay = ({ incomingCall, onAccept, onDecline }: IncomingCallOverlayProps) => {
  const users = useAppStore(s => s.users);
  const caller = users.find(u => u.id === incomingCall.from);
  const callerName = caller ? (caller as any).name || (caller as any).displayName : 'Unknown Caller';
  const callerAvatar = caller?.avatar || generateInitialsAvatar(incomingCall.from, callerName);

  return (
    <div id="incoming-call-overlay" className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-white">
      {/* Ambient Pulsing Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-sky-500/20 blur-[100px] rounded-full animate-pulse" />
      </div>

      <div className="relative flex flex-col items-center max-w-sm w-full px-6 text-center space-y-10">
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
      </div>
    </div>
  );
};
