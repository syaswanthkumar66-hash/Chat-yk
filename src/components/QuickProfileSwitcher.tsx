import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, useAppStore } from '../store';
import { Icon, Button, Avatar, Card } from './UI';
import { sessionIntegrityService } from '../services/sessionIntegrityService';
import { QRCodeCanvas } from 'qrcode.react';
import { QRScanner } from './QRScanner';

export const QuickProfileSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const user = useAppStore(state => state.user);
  const isLoggedIn = useAppStore(state => state.isLoggedIn);
  const switchAccount = useAppStore(state => state.switchAccount);

  const [savedAccounts, setSavedAccounts] = useState(() => sessionIntegrityService.getSavedAccounts());
  const [showMyQR, setShowMyQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerSuccess, setScannerSuccess] = useState<string | null>(null);

  // Live Sync state
  const [liveSyncState, setLiveSyncState] = useState<{
    status: 'connecting' | 'scanning' | 'syncing' | 'uploading' | 'success' | 'error';
    percentage: number;
    speed: string;
    itemsSynced: number;
    currentTask: string;
    targetAccount: any;
  } | null>(null);

  // Re-fetch saved accounts when panel opens or user state changes
  useEffect(() => {
    if (isOpen) {
      setSavedAccounts(sessionIntegrityService.getSavedAccounts());
    }
  }, [isOpen, user?.id]);

  if (!isLoggedIn || !user) return null;

  const handleSeedDemoAccounts = () => {
    const demoProfiles = [
      {
        id: 'u-demo-alice',
        username: 'alice_sec',
        displayName: 'Alice Protocol',
        avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="%23ec4899" /><text x="50%" y="54%" font-family="&apos;Inter&apos;, system-ui, sans-serif" font-size="38" font-weight="600" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle">AP</text></svg>',
        authMethod: 'local' as const,
        email: 'alice@protocol.net'
      },
      {
        id: 'u-demo-bob',
        username: 'bob_crypto',
        displayName: 'Bob Cryptographic',
        avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="%2310b981" /><text x="50%" y="54%" font-family="&apos;Inter&apos;, system-ui, sans-serif" font-size="38" font-weight="600" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle">BC</text></svg>',
        authMethod: 'local' as const,
        email: 'bob@protocol.net'
      }
    ];

    demoProfiles.forEach(p => {
      sessionIntegrityService.registerAccount(p);
    });
    setSavedAccounts(sessionIntegrityService.getSavedAccounts());
  };

  const handleSwitch = async (userId: string) => {
    try {
      await switchAccount(userId);
      setSavedAccounts(sessionIntegrityService.getSavedAccounts());
    } catch (err) {
      console.error('Error switching account:', err);
    }
  };

  const handleRemoveAccount = (accId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Forget this account from the local switcher?")) {
      sessionIntegrityService.removeAccount(accId);
      setSavedAccounts(sessionIntegrityService.getSavedAccounts());
    }
  };

  const handleDirectSyncAccount = (acc: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setLiveSyncState({
      status: 'connecting',
      percentage: 0,
      speed: '0 KB/s',
      itemsSynced: 0,
      currentTask: 'Establishing direct high-speed synchronization tunnel...',
      targetAccount: acc
    });

    let progressPercent = 0;
    const interval = setInterval(() => {
      progressPercent += Math.floor(Math.random() * 12) + 6;
      if (progressPercent >= 100) {
        progressPercent = 100;
        clearInterval(interval);
        
        setLiveSyncState(prev => prev ? {
          ...prev,
          status: 'success',
          percentage: 100,
          currentTask: 'Synchronization completed! Account database has been successfully synchronized and merged.'
        } : null);

        // Auto-close sync panel after a brief pause
        setTimeout(() => {
          setLiveSyncState(null);
        }, 3000);
      } else {
        let task = 'Syncing...';
        let speed = '0 KB/s';
        let items = 0;
        let status: 'connecting' | 'scanning' | 'syncing' | 'uploading' | 'success' | 'error' = 'syncing';
        
        if (progressPercent < 25) {
          status = 'connecting';
          task = 'Connecting to high-speed secure cluster...';
          speed = '45 KB/s';
          items = 4;
        } else if (progressPercent < 55) {
          status = 'scanning';
          task = 'Comparing local cryptographic key frames and chat records...';
          speed = '4.2 MB/s';
          items = 64;
        } else if (progressPercent < 85) {
          status = 'syncing';
          task = 'Syncing messages, files, and offline attachments...';
          speed = '12.8 MB/s';
          items = 286;
        } else {
          status = 'uploading';
          task = 'Finalizing index merges and syncing metadata...';
          speed = '15.4 MB/s';
          items = 512;
        }

        setLiveSyncState(prev => prev ? {
          ...prev,
          status,
          percentage: progressPercent,
          speed,
          itemsSynced: items,
          currentTask: task
        } : null);
      }
    }, 200);
  };

  const handleScanSyncQR = async (scannedData: string) => {
    try {
      const payload = JSON.parse(scannedData);
      if (payload && payload.type === 'connectshare_sync_v1' && payload.user) {
        setShowScanner(false);
        setScannerSuccess(`Successfully paired with ${payload.user.displayName}!`);
        
        // Register the new profile
        sessionIntegrityService.registerAccount({
          id: payload.user.id,
          username: payload.user.username,
          displayName: payload.user.displayName,
          avatar: payload.user.avatar,
          authMethod: 'local',
          email: `${payload.user.username}@protocol.net`
        });

        setSavedAccounts(sessionIntegrityService.getSavedAccounts());
        
        setTimeout(() => {
          setScannerSuccess(null);
        }, 4000);
      } else {
        setScannerError("Invalid sync payload. Please scan a ConnectShare pairing QR code.");
      }
    } catch (e) {
      setScannerError("Could not decode scanned QR code. Please try again.");
    }
  };

  const mySyncPayloadValue = JSON.stringify({
    type: 'connectshare_sync_v1',
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      description: user.description || '',
      joinDate: user.joinDate
    }
  });

  const filteredAccounts = savedAccounts.filter(acc => acc.id !== user.id);

  return (
    <>
      {/* Floating Toggle Button */}
      <div className="fixed bottom-24 md:bottom-6 right-6 z-[260] flex flex-col items-end gap-3">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-80 md:w-96 rounded-[2rem] bg-white border border-slate-100 shadow-2xl shadow-primary/20 overflow-hidden flex flex-col max-h-[500px]"
            >
              {/* Header */}
              <div className="bg-primary text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Icon name="switch_account" className="text-xl animate-pulse" />
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-black uppercase tracking-widest leading-none">Instant Switch & Sync</span>
                    <span className="text-[9px] text-white/70 mt-0.5">Multi-device local session manager</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="size-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <Icon name="close" className="text-sm" />
                </button>
              </div>

              {/* Scrollable Container */}
              <div className="p-4 overflow-y-auto space-y-4 flex-1">
                {/* Active Account Banner */}
                <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={user.avatar} className="size-10 border border-white shadow-sm" />
                    <div className="flex flex-col text-left leading-tight">
                      <span className="text-xs font-bold text-slate-700">{user.displayName}</span>
                      <span className="text-[9px] text-slate-400">@{user.username}</span>
                    </div>
                  </div>
                  <span className="text-[8px] bg-emerald-500 text-white px-2 py-0.5 rounded-md font-black uppercase tracking-wider">
                    Active Session
                  </span>
                </div>

                {/* Main Content Area / Live Sync State */}
                {liveSyncState ? (
                  <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 space-y-3 font-mono text-left">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-primary font-black">HIGH-SPEED SYNC</span>
                      <span className="text-emerald-400">{liveSyncState.speed}</span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-primary"
                          animate={{ width: `${liveSyncState.percentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400">
                        <span>{liveSyncState.itemsSynced} objects synchronized</span>
                        <span>{liveSyncState.percentage}%</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-300 leading-relaxed min-h-[36px]">
                      {liveSyncState.currentTask}
                    </p>
                  </div>
                ) : showMyQR ? (
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center space-y-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">My Device Pairing QR Code</span>
                    <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <QRCodeCanvas value={mySyncPayloadValue} size={150} />
                    </div>
                    <p className="text-[9px] text-slate-400 text-center max-w-[240px] leading-relaxed">
                      Scan this code from another device to register, clone, and sync this session instantly.
                    </p>
                    <Button
                      onClick={() => setShowMyQR(false)}
                      className="h-8 px-4 rounded-xl bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest"
                    >
                      Back to switcher
                    </Button>
                  </div>
                ) : showScanner ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Scan Pairing QR</span>
                      <button onClick={() => setShowScanner(false)} className="text-xs font-bold text-primary hover:underline">Cancel</button>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 aspect-square relative bg-slate-900">
                      <QRScanner 
                        onScan={handleScanSyncQR} 
                        onClose={() => setShowScanner(false)} 
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Other saved profiles */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saved Profiles ({filteredAccounts.length})</span>
                        {filteredAccounts.length === 0 && (
                          <button
                            onClick={handleSeedDemoAccounts}
                            className="text-[9px] text-primary hover:underline font-bold"
                          >
                            Seed Simulator Profiles
                          </button>
                        )}
                      </div>

                      {filteredAccounts.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center space-y-2">
                          <p className="text-[10px] text-slate-500 font-medium">No secondary sessions logged on this browser.</p>
                          <Button
                            onClick={handleSeedDemoAccounts}
                            className="mx-auto h-7 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[8px] font-black uppercase tracking-widest shadow-none"
                          >
                            Seed Simulator Profiles
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filteredAccounts.map(acc => (
                            <div
                              key={acc.id}
                              onClick={() => handleSwitch(acc.id)}
                              className="group p-2.5 rounded-xl border border-slate-100 hover:border-primary/20 hover:bg-primary/5 transition-all flex items-center justify-between cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Avatar src={acc.avatar} className="size-8" />
                                <div className="flex flex-col text-left leading-tight">
                                  <span className="text-xs font-bold text-slate-700">{acc.displayName}</span>
                                  <span className="text-[9px] text-slate-400">@{acc.username}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => handleDirectSyncAccount(acc, e)}
                                  className="size-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-all cursor-pointer"
                                  title="Sync now"
                                >
                                  <Icon name="sync" className="text-xs" />
                                </button>
                                <button
                                  onClick={(e) => handleRemoveAccount(acc.id, e)}
                                  className="size-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all cursor-pointer"
                                  title="Forget account"
                                >
                                  <Icon name="delete" className="text-xs" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* QR pairing actions */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => setShowMyQR(true)}
                        className="p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-slate-600 flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Icon name="qr_code" className="text-lg text-primary" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700 leading-none">Show My QR</span>
                      </button>
                      <button
                        onClick={() => setShowScanner(true)}
                        className="p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-slate-600 flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Icon name="qr_code_scanner" className="text-lg text-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700 leading-none">Scan QR code</span>
                      </button>
                    </div>
                  </>
                )}

                {/* Notifications & Success/Error messages */}
                {scannerSuccess && (
                  <div className="p-2 text-center text-[10px] text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100 font-semibold">
                    {scannerSuccess}
                  </div>
                )}
                {scannerError && (
                  <div className="p-2 text-center text-[10px] text-red-600 bg-red-50 rounded-xl border border-red-100 font-semibold">
                    {scannerError}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Trigger FAB Button */}
        <motion.button
          onClick={() => {
            setIsOpen(!isOpen);
            // Clear inner states on toggle
            setShowMyQR(false);
            setShowScanner(false);
            setScannerError(null);
            setScannerSuccess(null);
          }}
          className="size-14 rounded-[35%] bg-primary text-white shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer relative border-2 border-white"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Quick Switch & Sync Session"
        >
          {isOpen ? (
            <Icon name="close" className="text-xl" />
          ) : (
            <div className="relative size-full flex items-center justify-center">
              <Avatar src={user.avatar} className="size-10 border border-white/20" />
              <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center shadow-sm">
                <div className="animate-spin duration-1000 size-full flex items-center justify-center">
                  <Icon name="sync" className="text-[10px]" />
                </div>
              </div>
            </div>
          )}
        </motion.button>
      </div>
    </>
  );
};
