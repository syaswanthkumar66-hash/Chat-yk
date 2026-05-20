import { useState } from 'react';
import { useAppStore } from '../store';
import { Icon, Card, Avatar } from './UI';
import { DeviceDetail } from './DeviceDetail';
import { StorageAnalytics } from './StorageAnalytics';
import { GlobalSearch } from './GlobalSearch';
import { motion, AnimatePresence } from 'framer-motion';

export const FileShareLayout = () => {
  const [activeTab, setActiveTab] = useState<'devices' | 'transfers' | 'files' | 'settings'>('devices');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const { setMode, activeDeviceId, setActiveDeviceId, devices, transfers } = useAppStore();

  if (activeDeviceId) {
    return <DeviceDetail />;
  }

  return (
    <div className="flex flex-col h-screen bg-bg-light overflow-hidden">
      <AnimatePresence>
        {showGlobalSearch && (
          <GlobalSearch onClose={() => setShowGlobalSearch(false)} />
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
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">P2P File Transfer</p>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ongoing Transfers</h2>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">2 Active</span>
              </div>
              {transfers.map(transfer => (
                <Card key={`transfer-${transfer.id}`} className="p-5 space-y-4 bg-white border-primary/5 shadow-xl shadow-primary/5">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Icon name="description" className="text-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight italic">{transfer.fileName}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">TO MACBOOK PRO • {transfer.speed}</p>
                    </div>
                    <span className="text-lg font-black text-primary italic">{transfer.progress}%</span>
                  </div>
                  <div className="space-y-2">
                    <div className="w-full h-1.5 bg-primary/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${transfer.progress}%` }}
                        className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <span>1.2 GB / 1.8 GB</span>
                      <span className="text-primary">Remaining: 45s</span>
                    </div>
                  </div>
                </Card>
              ))}
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
