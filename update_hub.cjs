const fs = require('fs');
let code = fs.readFileSync('src/components/Hub.tsx', 'utf-8');

const target = `              {user?.isAdmin && (
                <button 
                  onClick={() => setMode('admin')}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-sm border border-amber-500/20 active:scale-95"
                >
                  <Icon name="security" className="text-sm" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}`;

const replace = `              {user?.isAdmin && (
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
              )}`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/Hub.tsx', code);
