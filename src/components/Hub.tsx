import { useAppStore, generateInitialsAvatar } from '../store';
import { Icon } from './UI';
import { motion } from 'motion/react';

export const Hub = () => {
  const setMode = useAppStore(state => state.setMode);
  const user = useAppStore(state => state.user);
  const logout = useAppStore(state => state.logout);

  return (
    <div className="h-full bg-bg-light text-slate-900 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
      {/* Left Pane - Branding & Protocol V2 Intro */}
      <div className="flex-1 p-5 sm:p-8 pt-[max(1.25rem,env(safe-area-inset-top))] md:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-primary/10 min-h-[50vh] md:min-h-0 bg-gradient-to-b from-white/30 via-transparent to-primary/5">
        <div className="relative z-10">
          {/* Header Navigation / App Branding */}
          <div className="flex items-center justify-between mb-8 md:mb-14">
            <div className="flex items-center gap-3">
              <div className="size-11 sm:size-13 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/25 ring-4 ring-white/60 flex-shrink-0">
                <Icon name="share" className="text-white text-xl sm:text-2xl" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black tracking-tighter text-xl sm:text-2xl uppercase italic leading-none block text-slate-900">Connect</span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase tracking-widest">
                    V2 LIVE
                  </span>
                </div>
                <span className="text-[8px] sm:text-[10px] font-black text-primary/60 uppercase tracking-[0.35em] mt-1 block">Protocol Engine v2.5</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {user?.isAdmin && (
                <button 
                  onClick={() => setMode('admin')}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-sm border border-amber-500/20 active:scale-95"
                >
                  <Icon name="security" className="text-sm" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}
              {!user?.isAdmin && (
                <button 
                  onClick={() => useAppStore.getState().updateUser({ isAdmin: true })}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-sm border border-blue-500/20 active:scale-95"
                >
                  <Icon name="verified_user" className="text-sm" />
                  <span className="hidden sm:inline">Make me Admin</span>
                </button>
              )}
              {user && (
                <button 
                  onClick={logout}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-sm border border-rose-500/20 active:scale-95"
                >
                  <Icon name="logout" className="text-sm" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              )}
            </div>
          </div>
          
          {/* Main Hero Banner */}
          <div className="space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md border border-primary/15 shadow-sm text-slate-700 text-[10px] font-black uppercase tracking-widest">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Direct Peer-to-Peer Architecture</span>
            </div>

            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl 2xl:text-[8.5rem] font-black tracking-tighter leading-[0.88] uppercase italic text-slate-900">
              Direct<br />
              <span className="text-primary">Access.</span><br />
              <span className="text-slate-300">Pure P2P.</span>
            </h1>

            <p className="text-slate-600 max-w-md text-base sm:text-lg md:text-xl font-medium leading-relaxed">
              A high-performance ecosystem for private encrypted messaging and zero-cloud direct data transfers.
            </p>
          </div>
        </div>

        {/* Live Network Metrics Bar */}
        <div className="mt-8 md:mt-0 relative z-10 space-y-4">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-white/60 shadow-lg shadow-slate-200/40">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map(i => (
                <div key={`hub-user-avatar-${i}`} className="size-9 sm:size-11 rounded-xl border-2 border-white overflow-hidden shadow-md">
                  <img 
                    src={generateInitialsAvatar(`user${i}`, `U${i}`)} 
                    className="size-full object-cover"
                    alt="User"
                  />
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                <p className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-wider">Mesh Mesh Nodes</p>
              </div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">12.4k Nodes Online • 12ms Latency</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase tracking-widest">
              <Icon name="verified_user" className="text-sm" />
              <span>256-bit AES</span>
            </div>
          </div>
        </div>

        {/* Background Subtle Gradient Blobs */}
        <div className="absolute top-1/3 left-0 -translate-y-1/2 size-[350px] md:size-[600px] bg-primary/10 blur-[100px] md:blur-[140px] rounded-full pointer-events-none" />
      </div>

      {/* Right Pane - Navigation Protocol Cards */}
      <div className="flex-1 p-5 sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-12 lg:p-16 flex flex-col justify-center gap-5 md:gap-8 bg-white/40 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-primary/10 pb-4">
          <div>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary">Protocol v2 Navigation</span>
            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-slate-900 mt-0.5">Select Workspace</h2>
          </div>
          <span className="px-3 py-1 rounded-full bg-white shadow-sm border border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            3 Ready
          </span>
        </div>
        
        <div className="grid gap-4 sm:gap-5 md:gap-6">
          {/* Social Mode Card */}
          <motion.button
            whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.95)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMode('social')}
            className="group flex items-center gap-4 sm:gap-6 p-5 sm:p-7 md:p-8 rounded-2xl sm:rounded-[2rem] border border-white shadow-xl shadow-slate-200/50 transition-all text-left relative overflow-hidden bg-white/80"
          >
            <div className="absolute top-0 right-0 p-4 md:p-6 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
              <Icon name="chat_bubble" className="text-7xl sm:text-8xl md:text-9xl" />
            </div>
            <div className="size-12 sm:size-16 md:size-20 rounded-2xl md:rounded-3xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform flex-shrink-0 ring-4 ring-primary/10">
              <Icon name="chat_bubble" className="text-xl sm:text-3xl md:text-4xl" />
            </div>
            <div className="flex-1 relative z-10 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[8px] sm:text-[9px] font-black uppercase tracking-widest">
                  Real-time Chat
                </span>
                <span className="size-1.5 rounded-full bg-emerald-500" />
              </div>
              <h3 className="text-lg sm:text-2xl md:text-3xl font-black tracking-tighter uppercase italic text-slate-900 truncate">Social Workspace</h3>
              <p className="text-slate-500 text-xs sm:text-sm font-medium leading-snug mt-1">End-to-end encrypted messaging, group channels & friend discovery.</p>
            </div>
            <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all flex-shrink-0 shadow-sm">
              <Icon name="arrow_forward" className="text-lg" />
            </div>
          </motion.button>

          {/* File Share Card */}
          <motion.button
            whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.95)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMode('fileshare')}
            className="group flex items-center gap-4 sm:gap-6 p-5 sm:p-7 md:p-8 rounded-2xl sm:rounded-[2rem] border border-white shadow-xl shadow-slate-200/50 transition-all text-left relative overflow-hidden bg-white/80"
          >
            <div className="absolute top-0 right-0 p-4 md:p-6 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
              <Icon name="folder_shared" className="text-7xl sm:text-8xl md:text-9xl text-emerald-600" />
            </div>
            <div className="size-12 sm:size-16 md:size-20 rounded-2xl md:rounded-3xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform flex-shrink-0 ring-4 ring-emerald-500/10">
              <Icon name="folder_shared" className="text-xl sm:text-3xl md:text-4xl" />
            </div>
            <div className="flex-1 relative z-10 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">
                  Zero Cloud Footprint
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl md:text-3xl font-black tracking-tighter uppercase italic text-slate-900 truncate">File Transfer Engine</h3>
              <p className="text-slate-500 text-xs sm:text-sm font-medium leading-snug mt-1">High-speed P2P file transfers and device synchronization.</p>
            </div>
            <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all flex-shrink-0 shadow-sm">
              <Icon name="arrow_forward" className="text-lg" />
            </div>
          </motion.button>

          {/* Admin Panel Card if allowed */}
          {(user?.isAdmin || (user?.allowedTabs && user.allowedTabs.length > 0)) && (
            <motion.button
              whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.95)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('admin')}
              className="group flex items-center gap-4 sm:gap-6 p-5 sm:p-7 md:p-8 rounded-2xl sm:rounded-[2rem] border border-amber-500/20 shadow-xl shadow-amber-500/5 transition-all text-left relative overflow-hidden bg-amber-500/5"
            >
              <div className="absolute top-0 right-0 p-4 md:p-6 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
                <Icon name="admin_panel_settings" className="text-7xl sm:text-8xl md:text-9xl text-amber-600" />
              </div>
              <div className="size-12 sm:size-16 md:size-20 rounded-2xl md:rounded-3xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform flex-shrink-0 ring-4 ring-amber-500/10">
                <Icon name="admin_panel_settings" className="text-xl sm:text-3xl md:text-4xl" />
              </div>
              <div className="flex-1 relative z-10 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">
                    System Control
                  </span>
                </div>
                <h3 className="text-lg sm:text-2xl md:text-3xl font-black tracking-tighter uppercase italic text-slate-900 truncate">Admin Dashboard</h3>
                <p className="text-slate-500 text-xs sm:text-sm font-medium leading-snug mt-1">Node health monitoring, system controls, and tech support tools.</p>
              </div>
              <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all flex-shrink-0 shadow-sm">
                <Icon name="arrow_forward" className="text-lg" />
              </div>
            </motion.button>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-primary/10 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">Connect Protocol V2 • Secure & Encrypted</p>
          </div>
          <div className="flex gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <span className="hover:text-primary cursor-pointer transition-colors">Documentation</span>
            <span>•</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Privacy Shield</span>
          </div>
        </div>
      </div>
    </div>
  );
};

