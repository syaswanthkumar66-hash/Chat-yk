import { useState } from 'react';
import { useAppStore } from '../store';
import { Icon, Card } from './UI';
import { DeviceDetail } from './DeviceDetail';
import { StorageAnalytics } from './StorageAnalytics';
import { GlobalSearch } from './GlobalSearch';
import { FilePreviewModal } from './FilePreviewModal';
import { motion, AnimatePresence } from 'framer-motion';
import { Transfer } from '../types';

export const FileShareLayout = () => {
  const [activeTab, setActiveTab] = useState<'devices' | 'transfers' | 'files' | 'settings'>('devices');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [selectedPreviewTransfer, setSelectedPreviewTransfer] = useState<Transfer | null>(null);
  const [syncFilter, setSyncFilter] = useState<'all' | 'pending' | 'active' | 'completed'>('all');
  
  const { 
    setMode, 
    activeDeviceId, 
    setActiveDeviceId, 
    devices, 
    transfers, 
    acceptTransfer, 
    declineTransfer,
    wssStatus,
    isWssConnected,
    wssMessage,
    connectSpot,
    disconnectSpot
  } = useAppStore();

  if (activeDeviceId) {
    return <DeviceDetail />;
  }

  const pendingTransfers = transfers.filter(t => t.status === 'pending');
  const activeTransfers = transfers.filter(t => t.status !== 'pending');

  const getFileIconAndColor = (type?: string) => {
    switch (type) {
      case 'image':
        return { name: 'image', bg: 'bg-emerald-500/10', text: 'text-emerald-500', fill: true };
      case 'video':
        return { name: 'movie', bg: 'bg-rose-500/10', text: 'text-rose-500', fill: true };
      case 'pdf':
        return { name: 'picture_as_pdf', bg: 'bg-red-500/10', text: 'text-red-500', fill: false };
      case 'presentation':
        return { name: 'presentation', bg: 'bg-amber-500/10', text: 'text-amber-500', fill: false };
      case 'zip':
        return { name: 'folder_zip', bg: 'bg-yellow-500/10', text: 'text-yellow-500', fill: true };
      case 'audio':
        return { name: 'audio_file', bg: 'bg-sky-500/10', text: 'text-sky-500', fill: true };
      default:
        return { name: 'description', bg: 'bg-primary/10', text: 'text-primary', fill: false };
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-light overflow-hidden">
      <AnimatePresence>
        {showGlobalSearch && (
          <GlobalSearch onClose={() => setShowGlobalSearch(false)} />
        )}
        {selectedPreviewTransfer && (
          <FilePreviewModal
            transfer={selectedPreviewTransfer}
            onClose={() => setSelectedPreviewTransfer(null)}
            onAccept={() => acceptTransfer(selectedPreviewTransfer.id)}
            onDecline={() => declineTransfer(selectedPreviewTransfer.id)}
          />
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between bg-bg-light/80 backdrop-blur-xl border-b border-primary/5 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => setMode('hub')} className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm">
            <Icon name="grid_view" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">{activeTab}</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <button 
                onClick={() => {
                  if (wssStatus === 'connected') {
                    disconnectSpot();
                  } else if (wssStatus === 'disconnected') {
                    connectSpot();
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all active:scale-95 text-[9px] font-black tracking-wider uppercase"
                title={wssStatus === 'connected' ? "Click to disconnect Spot Connection" : "Click to go live"}
              >
                <div className={`size-2 rounded-full ${
                  wssStatus === 'connected' 
                    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse' 
                    : wssStatus === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-slate-300'
                }`} />
                <span className={
                  wssStatus === 'connected' 
                    ? 'text-emerald-600 font-bold' 
                    : wssStatus === 'connecting'
                    ? 'text-amber-600 font-black normal-case text-[10px]'
                    : 'text-slate-400 font-medium'
                }>
                  {wssStatus === 'connecting' && wssMessage ? wssMessage : `Spot: ${wssStatus}`}
                </span>
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowGlobalSearch(true)}
            className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm"
          >
            <Icon name="search" />
          </button>
          <button className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
        {activeTab === 'devices' && (
          <>
            {/* Incoming Shared Files Awaiting Acceptance */}
            {pendingTransfers.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary animate-ping" />
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Awaiting Acceptance</h2>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{pendingTransfers.length} Pending</span>
                </div>
                
                <div className="grid gap-3">
                  {pendingTransfers.map(transfer => {
                    const iconConfig = getFileIconAndColor(transfer.fileType);
                    return (
                      <Card key={`pending-${transfer.id}`} className="p-4 bg-gradient-to-r from-primary/5 via-white to-white border border-primary/20 shadow-xl shadow-primary/5 hover:border-primary/40 transition-all">
                        <div className="flex items-center gap-4">
                          {/* File Preview Thumbnail / Icon */}
                          <div 
                            onClick={() => setSelectedPreviewTransfer(transfer)}
                            className="size-16 rounded-2xl overflow-hidden cursor-pointer relative group flex items-center justify-center border border-slate-100 shadow-sm shrink-0"
                          >
                            {transfer.previewUrl ? (
                              <img 
                                src={transfer.previewUrl} 
                                alt={transfer.fileName} 
                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className={`w-full h-full ${iconConfig.bg} flex items-center justify-center`}>
                                <Icon name={iconConfig.name} className={`${iconConfig.text} text-3xl`} fill={iconConfig.fill} />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white">
                              <Icon name="visibility" className="text-lg" />
                            </div>
                            <span className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-mono text-white tracking-widest">
                              {transfer.fileType?.toUpperCase()}
                            </span>
                          </div>

                          {/* File Metadata */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">
                                INCOMING SHARE
                              </span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">
                                FROM {transfer.senderName}
                              </span>
                            </div>
                            <h3 
                              onClick={() => setSelectedPreviewTransfer(transfer)}
                              className="text-sm font-black text-slate-900 truncate uppercase tracking-tight italic mt-1 cursor-pointer hover:text-primary transition-colors"
                            >
                              {transfer.fileName}
                            </h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                              Size: {transfer.fileSize} • Wi-Fi Direct
                            </p>
                          </div>

                          {/* File Share Action Buttons */}
                          <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                            <button 
                              onClick={() => setSelectedPreviewTransfer(transfer)}
                              className="size-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all active:scale-95 border border-slate-200/40"
                              title="Preview Content"
                            >
                              <Icon name="visibility" className="text-lg" />
                            </button>
                            <button 
                              onClick={() => declineTransfer(transfer.id)}
                              className="size-9 rounded-xl bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-500 flex items-center justify-center transition-all active:scale-95 border border-rose-100"
                              title="Decline File"
                            >
                              <Icon name="close" className="text-lg" />
                            </button>
                            <button 
                              onClick={() => acceptTransfer(transfer.id)}
                              className="size-9 rounded-xl bg-primary text-white hover:brightness-110 flex items-center justify-center transition-all active:scale-95 shadow-md shadow-primary/10"
                              title="Accept File"
                            >
                              <Icon name="check" className="text-lg" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ongoing Transfers</h2>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                  {activeTransfers.filter(t => t.status === 'ongoing').length} Active
                </span>
              </div>
              {activeTransfers.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                  <Icon name="sync_disabled" className="text-slate-300 text-3xl mb-2" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No active transfers</p>
                </div>
              ) : (
                activeTransfers.map(transfer => {
                  const iconConfig = getFileIconAndColor(transfer.fileType);
                  return (
                    <Card key={`transfer-${transfer.id}`} className="p-5 space-y-4 bg-white border-primary/5 shadow-xl shadow-primary/5">
                      <div className="flex items-center gap-4">
                        <div className={`size-12 rounded-2xl ${iconConfig.bg} flex items-center justify-center ${iconConfig.text}`}>
                          <Icon name={iconConfig.name} className="text-xl" fill={iconConfig.fill} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight italic">{transfer.fileName}</h3>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                            {transfer.status === 'completed' ? 'SUCCESSFULLY RECEIVED' : `TO MACBOOK PRO • ${transfer.speed || 'Connecting...'}`}
                          </p>
                        </div>
                        <span className="text-lg font-black text-primary italic">
                          {transfer.status === 'completed' ? '100' : transfer.progress}%
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="w-full h-1.5 bg-primary/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${transfer.status === 'completed' ? 100 : transfer.progress}%` }}
                            className={`h-full ${transfer.status === 'completed' ? 'bg-emerald-500' : 'bg-primary'} shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]`}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          <span>{transfer.status === 'completed' ? transfer.fileSize : `Transferring (${transfer.fileSize})`}</span>
                          {transfer.status === 'completed' ? (
                            <span className="text-emerald-500 flex items-center gap-1">
                              <Icon name="check_circle" className="text-xs" />
                              COMPLETED
                            </span>
                          ) : (
                            <span className="text-primary">{transfer.eta ? `Remaining: ${transfer.eta}` : 'Syncing...'}</span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Paired Devices</h2>
              <div className="grid gap-3">
                {devices.map(device => (
                  <Card 
                    key={`device-${device.id}`} 
                    onClick={() => setActiveDeviceId(device.id)}
                    className="flex items-center gap-4 p-5 cursor-pointer bg-white border-primary/5 hover:border-primary/20 hover:bg-primary/5 transition-all group shadow-sm hover:shadow-xl"
                  >
                    <div className="size-16 rounded-[1.5rem] bg-primary/5 flex items-center justify-center text-primary/40 relative group-hover:bg-primary group-hover:text-white transition-all">
                      <Icon name={device.type === 'desktop' ? 'laptop_mac' : 'smartphone'} className="text-3xl" />
                      <div className={`absolute -bottom-1 -right-1 size-4 rounded-full border-4 border-white ${device.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic leading-none">{device.name}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                        {device.status === 'online' ? 'Live Now' : 'Offline'} • {device.connectionType}
                      </p>
                    </div>
                    <button className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all active:scale-95">
                      <Icon name="send" className="text-lg" />
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'transfers' && (
          <div className="space-y-6">
            {/* Filter chips */}
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {[
                { id: 'all', label: 'All Transfers', count: transfers.length },
                { id: 'pending', label: 'Awaiting', count: pendingTransfers.length },
                { id: 'active', label: 'Active', count: transfers.filter(t => t.status === 'ongoing').length },
                { id: 'completed', label: 'History', count: transfers.filter(t => t.status === 'completed').length }
              ].map(chip => (
                <button
                  key={`sync-tab-${chip.id}`}
                  onClick={() => setSyncFilter(chip.id as any)}
                  className={`shrink-0 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    syncFilter === chip.id
                      ? 'bg-primary text-white shadow-xl shadow-primary/25'
                      : 'bg-white text-slate-400 border border-primary/5 hover:bg-primary/5 hover:text-primary'
                  }`}
                >
                  {chip.label}
                  <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-mono font-black ${syncFilter === chip.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {chip.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Transfers list */}
            <div className="space-y-3">
              {transfers
                .filter(t => {
                  if (syncFilter === 'pending') return t.status === 'pending';
                  if (syncFilter === 'active') return t.status === 'ongoing';
                  if (syncFilter === 'completed') return t.status === 'completed';
                  return true;
                })
                .map(transfer => {
                  const iconConfig = getFileIconAndColor(transfer.fileType);
                  const isPending = transfer.status === 'pending';
                  const isCompleted = transfer.status === 'completed';
                  
                  return (
                    <Card 
                      key={`sync-item-${transfer.id}`} 
                      className={`p-5 space-y-4 bg-white border transition-all ${
                        isPending 
                          ? 'border-primary/20 hover:border-primary/40 bg-gradient-to-r from-primary/5 via-white to-white' 
                          : 'border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Thumbnail / Icon */}
                        <div 
                          onClick={() => isPending && setSelectedPreviewTransfer(transfer)}
                          className={`size-14 rounded-2xl overflow-hidden relative flex items-center justify-center border border-slate-100 shrink-0 ${
                            isPending ? 'cursor-pointer group shadow-sm' : ''
                          }`}
                        >
                          {transfer.previewUrl ? (
                            <img 
                              src={transfer.previewUrl} 
                              alt={transfer.fileName} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className={`w-full h-full ${iconConfig.bg} flex items-center justify-center`}>
                              <Icon name={iconConfig.name} className={`${iconConfig.text} text-2xl`} fill={iconConfig.fill} />
                            </div>
                          )}
                          {isPending && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white">
                              <Icon name="visibility" className="text-sm" />
                            </div>
                          )}
                        </div>

                        {/* Text Metadata */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${
                              isPending ? 'bg-primary/10 text-primary' :
                              isCompleted ? 'bg-emerald-500/10 text-emerald-500' :
                              'bg-amber-500/10 text-amber-500 animate-pulse'
                            }`}>
                              {transfer.status.toUpperCase()}
                            </span>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                              {isPending ? `FROM ${transfer.senderName}` : `DEVICE: ${transfer.senderName}`}
                            </span>
                          </div>
                          
                          <h3 
                            onClick={() => isPending && setSelectedPreviewTransfer(transfer)}
                            className={`text-sm font-black text-slate-900 truncate uppercase tracking-tight italic mt-1 ${
                              isPending ? 'cursor-pointer hover:text-primary transition-colors' : ''
                            }`}
                          >
                            {transfer.fileName}
                          </h3>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                            {transfer.fileSize} • Wi-Fi Direct
                          </p>
                        </div>

                        {/* Actions for Pending */}
                        {isPending ? (
                          <div className="flex gap-1.5 shrink-0">
                            <button 
                              onClick={() => setSelectedPreviewTransfer(transfer)}
                              className="size-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-150 transition-all"
                              title="Preview Content"
                            >
                              <Icon name="visibility" className="text-md" />
                            </button>
                            <button 
                              onClick={() => declineTransfer(transfer.id)}
                              className="size-9 rounded-xl bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-500 flex items-center justify-center border border-rose-100/50 transition-all"
                              title="Decline"
                            >
                              <Icon name="close" className="text-md" />
                            </button>
                            <button 
                              onClick={() => acceptTransfer(transfer.id)}
                              className="size-9 rounded-xl bg-primary text-white hover:brightness-110 flex items-center justify-center transition-all shadow-md shadow-primary/10"
                              title="Accept"
                            >
                              <Icon name="check" className="text-md" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-lg font-black text-primary italic shrink-0">
                            {isCompleted ? '100' : transfer.progress}%
                          </span>
                        )}
                      </div>

                      {/* Progress Bar (not shown for pending) */}
                      {!isPending && (
                        <div className="space-y-2">
                          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${isCompleted ? 100 : transfer.progress}%` }}
                              className={`h-full ${isCompleted ? 'bg-emerald-500' : 'bg-primary'}`}
                            />
                          </div>
                          <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest">
                            <span>{isCompleted ? 'SYNCED' : `SPEED: ${transfer.speed || '...'}`}</span>
                            <span>{isCompleted ? 'SECURED' : transfer.eta ? `ETA: ${transfer.eta}` : 'ESTIMATING'}</span>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}

              {transfers.filter(t => {
                if (syncFilter === 'pending') return t.status === 'pending';
                if (syncFilter === 'active') return t.status === 'ongoing';
                if (syncFilter === 'completed') return t.status === 'completed';
                return true;
              }).length === 0 && (
                <div className="text-center p-12 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                  <Icon name="sync_disabled" className="text-slate-300 text-4xl mb-2" />
                  <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest">No Transfers Found</h4>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Change filters or share a new file to start syncing</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-6">
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {['Home', 'Downloads', 'Shared', 'Favorites'].map(tab => (
                <button 
                  key={`file-tab-${tab}`} 
                  className={`shrink-0 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    tab === 'Downloads' 
                      ? 'bg-primary text-white shadow-xl shadow-primary/20' 
                      : 'bg-white text-slate-400 border border-primary/5 hover:bg-primary/5 hover:text-primary'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            
            <div className="space-y-3">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Folders</h2>
              <div className="grid grid-cols-2 gap-3">
                {['Work Projects', 'Presentations'].map(folder => (
                  <Card key={`folder-${folder}`} className="p-5 flex flex-col gap-4 bg-white border-primary/5 hover:border-primary/20 transition-all cursor-pointer group shadow-sm">
                    <div className="size-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all">
                      <Icon name="folder" fill className="text-2xl" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight italic truncate">{folder}</h3>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">14 items • 128 MB</p>
                    </div>
                  </Card>
                ))}
              </div>

              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 mt-6">Recent Files</h2>
              <div className="space-y-2">
                <Card className="flex items-center gap-4 p-4 bg-primary/5 border-primary/20 shadow-xl shadow-primary/5">
                  <div className="size-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm">
                    <Icon name="description" className="text-xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight italic truncate">annual_report_draft.pdf</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">8.4 MB • Modified 2h ago</p>
                  </div>
                  <div className="size-6 rounded-lg bg-primary flex items-center justify-center">
                    <Icon name="check" className="text-white text-xs" />
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="py-2">
            <StorageAnalytics />
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="bg-bg-light/80 backdrop-blur-xl border-t border-primary/5 flex justify-around py-4 sticky bottom-0 z-30">
        {[
          { id: 'devices', icon: 'devices', label: 'Devices' },
          { id: 'transfers', icon: 'sync_alt', label: 'Sync' },
          { id: 'files', icon: 'folder', label: 'Files' },
          { id: 'settings', icon: 'settings', label: 'Storage' }
        ].map(item => (
          <button
            key={`nav-item-${item.id}`}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex flex-col items-center gap-1.5 transition-all relative group ${
              activeTab === item.id ? 'text-primary' : 'text-slate-400 hover:text-primary/60'
            }`}
          >
            {activeTab === item.id && (
              <motion.div 
                layoutId="activeTab"
                className="absolute -bottom-4 w-8 h-1 bg-primary rounded-full"
              />
            )}
            <Icon name={item.icon} fill={activeTab === item.id} className="text-xl" />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Floating Action Button */}
      <motion.button 
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        className="absolute bottom-28 right-6 size-16 rounded-[2rem] bg-primary text-white shadow-2xl shadow-primary/40 flex items-center justify-center z-40 border-4 border-white"
      >
        <Icon name="add" className="text-3xl" />
      </motion.button>
    </div>
  );
};
