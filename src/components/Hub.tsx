import { useAppStore } from '../store';
import { Icon } from './UI';
import { motion } from 'framer-motion';

export const Hub = () => {
  const setMode = useAppStore(state => state.setMode);
  const user = useAppStore(state => state.user);
  const logout = useAppStore(state => state.logout);

  return (
    <div className="min-h-screen bg-bg-light text-slate-900 overflow-hidden flex flex-col md:flex-row">
      {/* Left Pane - Branding & Intro */}
      <div className="flex-1 p-8 md:p-20 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-primary/10">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-10 md:mb-16">
            <div className="flex items-center gap-3">
              <div className="size-10 md:size-12 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/20">
                <Icon name="share" className="text-white text-xl md:text-2xl" />
              </div>
              <div>
                <span className="font-black tracking-tighter text-xl md:text-2xl uppercase italic leading-none block text-slate-900">Connect</span>
                <span className="text-[8px] md:text-[10px] font-black text-primary/40 uppercase tracking-[0.4em] mt-1 block">Protocol v2.5</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {user?.isAdmin && (
                <button 
                  onClick={() => setMode('admin')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest shadow-sm border border-white"
                >
                  <Icon name="security" className="text-sm" />
                  Admin
                </button>
              )}
              {user && (
                <button 
                  onClick={logout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest shadow-sm border border-white"
                >
                  <Icon name="logout" className="text-sm" />
                  Logout
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-6 md:space-y-8">
            <h1 className="text-5xl md:text-[9rem] font-black tracking-tighter leading-[0.9] md:leading-[0.8] uppercase italic text-slate-900">
              Direct<br />
              <span className="text-primary">Access.</span><br />
              <span className="text-slate-200">Pure P2P.</span>
            </h1>
            <p className="text-slate-500 max-w-md text-lg md:text-xl font-medium leading-relaxed">
              A high-performance ecosystem for private communication and secure data exchange. No middleman. No limits.
            </p>
          </div>
        </div>

        <div className="mt-10 md:mt-0 relative z-10">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex -space-x-3 md:-space-x-4">
              {[1, 2, 3, 4].map(i => (
                <div key={`hub-user-avatar-${i}`} className="size-10 md:size-12 rounded-xl md:rounded-2xl border-2 md:border-4 border-white overflow-hidden shadow-2xl">
                  <img 
                    src={`https://picsum.photos/seed/user${i}/100`} 
                    className="size-full object-cover"
                    alt="User"
                  />
                </div>
              ))}
            </div>
            <div>
              <p className="text-[8px] md:text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Active Network</p>
              <p className="text-[8px] md:text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] mt-1">12.4k Nodes Online</p>
            </div>
          </div>
        </div>

        {/* Background Decorative Elements */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 size-[400px] md:size-[800px] bg-primary/5 blur-[100px] md:blur-[150px] rounded-full pointer-events-none" />
      </div>

      {/* Right Pane - Navigation Options */}
      <div className="flex-1 p-8 md:p-20 flex flex-col justify-center gap-6 md:gap-8 bg-white/40 backdrop-blur-sm">
        <div className="mb-4 md:mb-8">
          <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.5em] text-slate-300">Select Protocol</h2>
          <div className="h-px w-10 md:w-12 bg-primary mt-3 md:mt-4" />
        </div>
        
        <div className="grid gap-4 md:gap-6">
          <motion.button
            whileHover={{ x: 15, backgroundColor: 'rgba(255,255,255,0.8)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMode('social')}
            className="group flex items-center gap-4 md:gap-8 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white shadow-xl shadow-slate-200/50 transition-all text-left relative overflow-hidden bg-white/50"
          >
            <div className="absolute top-0 right-0 p-4 md:p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
              <Icon name="chat_bubble" className="text-7xl md:text-9xl" />
            </div>
            <div className="size-14 md:size-20 rounded-2xl md:rounded-3xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-xl">
              <Icon name="chat_bubble" className="text-2xl md:text-4xl" />
            </div>
            <div className="flex-1 relative z-10">
              <h3 className="text-xl md:text-3xl font-black tracking-tighter uppercase italic mb-1 md:mb-2 text-slate-900">Social Mode</h3>
              <p className="text-slate-400 text-[10px] md:text-sm font-medium leading-snug max-w-[150px] md:max-w-[200px]">Encrypted messaging and real-time voice discovery.</p>
            </div>
            <Icon name="arrow_forward" className="text-slate-200 group-hover:text-primary transition-colors text-xl md:text-2xl" />
          </motion.button>

          <motion.button
            whileHover={{ x: 15, backgroundColor: 'rgba(255,255,255,0.8)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMode('fileshare')}
            className="group flex items-center gap-4 md:gap-8 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white shadow-xl shadow-slate-200/50 transition-all text-left relative overflow-hidden bg-white/50"
          >
            <div className="absolute top-0 right-0 p-4 md:p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
              <Icon name="folder_shared" className="text-7xl md:text-9xl" />
            </div>
            <div className="size-14 md:size-20 rounded-2xl md:rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-xl">
              <Icon name="folder_shared" className="text-2xl md:text-4xl" />
            </div>
            <div className="flex-1 relative z-10">
              <h3 className="text-xl md:text-3xl font-black tracking-tighter uppercase italic mb-1 md:mb-2 text-slate-900">File Share</h3>
              <p className="text-slate-400 text-[10px] md:text-sm font-medium leading-snug max-w-[150px] md:max-w-[200px]">High-speed P2P transfers with zero cloud footprint.</p>
            </div>
            <Icon name="arrow_forward" className="text-slate-200 group-hover:text-emerald-500 transition-colors text-xl md:text-2xl" />
          </motion.button>

          {(user?.isAdmin || (user?.allowedTabs && user.allowedTabs.length > 0)) && (
            <motion.button
              whileHover={{ x: 15, backgroundColor: 'rgba(255,255,255,0.8)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('admin')}
              className="group flex items-center gap-4 md:gap-8 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-primary/20 shadow-xl shadow-primary/5 transition-all text-left relative overflow-hidden bg-primary/5"
            >
              <div className="absolute top-0 right-0 p-4 md:p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                <Icon name="admin_panel_settings" className="text-7xl md:text-9xl text-primary" />
              </div>
              <div className="size-14 md:size-20 rounded-2xl md:rounded-3xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-xl">
                <Icon name="admin_panel_settings" className="text-2xl md:text-4xl" />
              </div>
              <div className="flex-1 relative z-10">
                <h3 className="text-xl md:text-3xl font-black tracking-tighter uppercase italic mb-1 md:mb-2 text-slate-900">Admin Panel</h3>
                <p className="text-slate-400 text-[10px] md:text-sm font-medium leading-snug max-w-[150px] md:max-w-[200px]">System management, tech support & usage monitoring.</p>
              </div>
              <Icon name="arrow_forward" className="text-slate-200 group-hover:text-primary transition-colors text-xl md:text-2xl" />
            </motion.button>
          )}
        </div>

        <div className="mt-10 md:mt-16 pt-8 md:pt-12 border-t border-primary/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">© 2025 Connect Protocol</p>
          <div className="flex gap-6 md:gap-8">
            <button className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] hover:text-primary transition-colors">Privacy</button>
            <button className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] hover:text-primary transition-colors">Terms</button>
          </div>
        </div>
      </div>
    </div>
  );
};
