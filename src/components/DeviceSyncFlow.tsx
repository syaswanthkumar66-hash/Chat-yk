import { useState, useEffect } from 'react';
import { Icon, Card, Button } from './UI';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRScanner } from './QRScanner';
import { deviceSyncService, SyncProgress } from '../services/deviceSyncService';

interface DeviceSyncFlowProps {
  onClose: () => void;
}

export const DeviceSyncFlow = ({ onClose }: DeviceSyncFlowProps) => {
  const [step, setStep] = useState<'choice' | 'host_qr' | 'scan_camera' | 'progress' | 'success' | 'error'>('choice');
  const [roomId, setRoomId] = useState<string>('');
  const [progress, setProgress] = useState<SyncProgress>({
    status: 'idle',
    percentage: 0,
    currentChunk: 0,
    totalChunks: 0,
    transferSpeed: '0 KB/s',
    bytesTransferred: 0,
    totalBytes: 0
  });

  // Handle host initialization
  const handleStartHost = () => {
    const id = deviceSyncService.generateSyncRoomId();
    setRoomId(id);
    setStep('host_qr');
    
    deviceSyncService.startHostSession(id, (p) => {
      setProgress(p);
      if (p.status === 'transferring') {
        setStep('progress');
      } else if (p.status === 'completed') {
        setStep('success');
      } else if (p.status === 'error') {
        setStep('error');
      }
    });
  };

  // Handle scanner callback
  const handleScanQR = (scannedRoomId: string) => {
    if (!scannedRoomId || !scannedRoomId.startsWith('sync-')) {
      setProgress(prev => ({
        ...prev,
        status: 'error',
        error: 'Invalid synchronization QR Code.'
      }));
      setStep('error');
      return;
    }

    setRoomId(scannedRoomId);
    setStep('progress');

    deviceSyncService.startReceiverSession(scannedRoomId, (p) => {
      setProgress(p);
      if (p.status === 'completed') {
        setStep('success');
      } else if (p.status === 'error') {
        setStep('error');
      }
    });
  };

  // Auto clean up WebRTC connections on modal close/unmount
  useEffect(() => {
    return () => {
      deviceSyncService.cleanup();
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white p-6 relative select-none">
      {/* Header */}
      <header className="flex items-center justify-between pb-6 border-b border-white/5 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
            <Icon name="sync_lock" className="text-xl" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tighter italic leading-none text-white">Secure Sync</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">P2P Device Pairing</p>
          </div>
        </div>
        <button 
          onClick={() => {
            deviceSyncService.cleanup();
            onClose();
          }} 
          className="size-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all active:scale-95"
        >
          <Icon name="close" className="text-xl" />
        </button>
      </header>

      {/* Main Flow Body */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-6 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          
          {/* CHOICE VIEW */}
          {step === 'choice' && (
            <motion.div 
              key="choice-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2 mb-4">
                <h3 className="text-xl font-black uppercase tracking-tighter italic text-slate-100">Synchronize a New Device</h3>
                <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
                  Connect and copy all chats, friends, and local encryption states to a new device in seconds using real-time WebRTC channels.
                </p>
              </div>

              <div className="grid gap-4 max-w-md mx-auto">
                <Card 
                  onClick={handleStartHost}
                  className="p-5 flex gap-4 bg-white/5 hover:bg-white/10 border-white/5 hover:border-primary/20 transition-all cursor-pointer group text-left rounded-3xl"
                >
                  <div className="size-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                    <Icon name="qr_code_2" className="text-2xl" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-200 uppercase tracking-wider text-sm">Existing Active Device</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Show a secure sync QR code. Scan this on your new device to export chats and configuration immediately.
                    </p>
                  </div>
                </Card>

                <Card 
                  onClick={() => setStep('scan_camera')}
                  className="p-5 flex gap-4 bg-white/5 hover:bg-white/10 border-white/5 hover:border-emerald-500/20 transition-all cursor-pointer group text-left rounded-3xl"
                >
                  <div className="size-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <Icon name="qr_code_scanner" className="text-2xl" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-200 uppercase tracking-wider text-sm">Newly Logged-in Device</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Use your camera to scan a pairing code and import secure chat database instantly.
                    </p>
                  </div>
                </Card>
              </div>

              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5">
                  <Icon name="verified_user" className="text-xs text-emerald-400" />
                  No files or chat records are sent to the server.
                </span>
              </div>
            </motion.div>
          )}

          {/* HOST QR VIEW (Existing device showing QR) */}
          {step === 'host_qr' && (
            <motion.div 
              key="host-qr-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center space-y-6"
            >
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tighter italic text-slate-100">Ready for Pairing</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Scan this QR code using the scanner on your new device to establish a direct secure WebRTC channel.
                </p>
              </div>

              {/* QR Code Canvas */}
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-[2rem] border-8 border-slate-800 shadow-2xl relative group">
                  <QRCodeCanvas 
                    value={roomId} 
                    size={220}
                    level="H"
                    includeMargin={true}
                  />
                  <div className="absolute inset-0 border-2 border-primary rounded-[1.5rem] pointer-events-none animate-pulse" />
                </div>
              </div>

              {/* Waiting Status */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-white/5 rounded-2xl text-xs font-black tracking-wider uppercase text-slate-300">
                  <div className="size-2 rounded-full bg-primary animate-ping" />
                  Waiting for connection...
                </div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  Room ID: {roomId}
                </p>
              </div>

              <div className="pt-2">
                <Button 
                  variant="secondary" 
                  onClick={() => setStep('choice')}
                  className="h-12 px-6 rounded-2xl text-slate-400 font-bold uppercase tracking-wider text-xs bg-white/5 hover:bg-white/10"
                >
                  <Icon name="arrow_back" />
                  Back
                </Button>
              </div>
            </motion.div>
          )}

          {/* SCANNER CAMERA VIEW */}
          {step === 'scan_camera' && (
            <motion.div 
              key="scan-camera-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex flex-col"
            >
              <QRScanner 
                onScan={handleScanQR}
                onClose={() => setStep('choice')}
              />
            </motion.div>
          )}

          {/* LIVE TRANSFER PROGRESS VIEW */}
          {step === 'progress' && (
            <motion.div 
              key="progress-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-8 max-w-md mx-auto w-full"
            >
              <div className="space-y-1.5">
                <span className="px-2.5 py-0.5 rounded bg-primary/20 text-primary text-[8px] font-black uppercase tracking-widest border border-primary/20">
                  {progress.role === 'sender' ? 'UPLOADING DATA' : 'DOWNLOADING DATA'}
                </span>
                <h3 className="text-xl font-black uppercase tracking-tighter italic text-slate-100">
                  {progress.status === 'connecting' ? 'Establishing P2P Secure Link' : 'Syncing Database Chunks'}
                </h3>
                <p className="text-[10px] text-slate-400 font-black tracking-widest uppercase">
                  Connected via WebRTC Data Channel
                </p>
              </div>

              {/* Dynamic Connection Animation */}
              <div className="relative flex justify-between items-center px-10 py-8 bg-white/5 border border-white/5 rounded-[2.5rem] shadow-xl overflow-hidden">
                {/* Background radar waves */}
                {progress.status === 'transferring' && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                    <div className="w-56 h-56 rounded-full border border-primary animate-ping" style={{ animationDuration: '3s' }} />
                  </div>
                )}

                {/* Device Left */}
                <div className="flex flex-col items-center gap-2 relative z-10">
                  <div className="size-16 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-300">
                    <Icon name="laptop_mac" className="text-3xl" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {progress.role === 'sender' ? 'This Host' : 'Partner Device'}
                  </span>
                </div>

                {/* Live animated data stream line */}
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full mx-4 relative overflow-hidden">
                  <motion.div 
                    initial={{ left: '-100%' }}
                    animate={{ left: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-primary to-transparent"
                  />
                  {progress.status === 'transferring' && (
                    <div className="absolute inset-0 flex justify-around items-center">
                      {[1, 2, 3].map((_, idx) => (
                        <motion.div 
                          key={idx}
                          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 0.8, delay: idx * 0.2 }}
                          className="size-1.5 rounded-full bg-primary"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Device Right */}
                <div className="flex flex-col items-center gap-2 relative z-10">
                  <div className="size-16 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-300">
                    <Icon name="smartphone" className="text-3xl" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {progress.role === 'receiver' ? 'This Client' : 'Partner Device'}
                  </span>
                </div>
              </div>

              {/* Progress percentages and indicators */}
              <div className="space-y-3">
                <div className="flex justify-between items-baseline px-1">
                  <span className="text-4xl font-black italic tracking-tighter text-slate-100">
                    {progress.percentage}%
                  </span>
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Chunk {progress.currentChunk} / {progress.totalChunks || '?'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage}%` }}
                    className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(25,118,210,0.8)]"
                    transition={{ ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Live telemetry metrics table */}
              <div className="grid grid-cols-2 gap-4 bg-white/5 border border-white/5 p-5 rounded-[2rem]">
                <div className="text-left space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Real-time Speed</p>
                  <p className="text-lg font-black text-slate-200 italic">{progress.transferSpeed}</p>
                </div>
                <div className="text-left space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">P2P Channel</p>
                  <p className="text-lg font-black text-emerald-400 uppercase tracking-tight italic">ACTIVE</p>
                </div>
                <div className="text-left space-y-1 col-span-2 pt-2 border-t border-white/5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Bytes Transferred</p>
                  <p className="text-xs font-mono font-bold text-slate-300">
                    {formatBytes(progress.bytesTransferred)} / {progress.totalBytes ? formatBytes(progress.totalBytes) : 'estimating...'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* SYNC SUCCESS VIEW */}
          {step === 'success' && (
            <motion.div 
              key="success-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-6 max-w-sm mx-auto"
            >
              {/* Success animation circle */}
              <div className="flex justify-center">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.1, 1] }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="size-24 rounded-full bg-emerald-500/10 border-4 border-emerald-500/30 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20"
                >
                  <Icon name="check_circle" className="text-5xl" />
                </motion.div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tighter italic text-slate-100">Sync Complete</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  All databases, chat histories, keys, and paired records have been synchronized successfully over direct peer-to-peer data channels.
                </p>
              </div>

              <div className="bg-slate-800/40 p-4 rounded-3xl border border-white/5 flex gap-3 text-left">
                <Icon name="verified_user" className="text-emerald-400 text-xl shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-200">Local Integrity Verified</h4>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    All frames verified and merged correctly.
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <Button 
                  onClick={() => {
                    // Reload window to trigger complete store refresh so that the newly sync'd data shows up instantly.
                    window.location.reload();
                  }}
                  className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest italic text-sm shadow-xl shadow-emerald-500/10"
                >
                  <Icon name="check" />
                  Restart & Apply Sync
                </Button>
              </div>
            </motion.div>
          )}

          {/* ERROR VIEW */}
          {step === 'error' && (
            <motion.div 
              key="error-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-6 max-w-sm mx-auto"
            >
              <div className="flex justify-center">
                <div className="size-20 rounded-full bg-rose-500/10 border-2 border-rose-500/20 text-rose-500 flex items-center justify-center">
                  <Icon name="error" className="text-4xl" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tighter italic text-slate-100 font-bold">Synchronization Failed</h3>
                <p className="text-xs text-rose-400 leading-relaxed bg-rose-500/5 p-4 rounded-3xl border border-rose-500/10">
                  {progress.error || 'The connection timed out or was closed prematurely.'}
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button 
                  variant="secondary"
                  onClick={() => setStep('choice')}
                  className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-white/5 hover:bg-white/10"
                >
                  <Icon name="refresh" />
                  Try Again
                </Button>
                <Button 
                  onClick={() => {
                    deviceSyncService.cleanup();
                    onClose();
                  }}
                  className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};
