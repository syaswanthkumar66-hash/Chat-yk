const fs = require('fs');
let code = fs.readFileSync('src/components/Hub.tsx', 'utf-8');

const hookTarget = `  const { user, setMode } = useStore(s => ({
    user: s.user,
    setMode: s.setMode
  }), shallowEqual);`;

const hookReplacement = `  const { user, setMode, systemSettings } = useStore(s => ({
    user: s.user,
    setMode: s.setMode,
    systemSettings: s.systemSettings
  }), shallowEqual);`;

code = code.replace(hookTarget, hookReplacement);

if (!code.includes('systemSettings: s.systemSettings')) {
  const hookTarget2 = `  const { setMode } = useStore(s => ({
    setMode: s.setMode
  }));`;

  const hookReplacement2 = `  const { setMode, systemSettings } = useStore(s => ({
    setMode: s.setMode,
    systemSettings: s.systemSettings
  }));`;
  code = code.replace(hookTarget2, hookReplacement2);
}

const fileShareBtnTarget = `          {/* File Share Card */}
          <motion.button`;

const fileShareBtnReplacement = `          {/* File Share Card */}
          {(systemSettings?.enableFileTransfer !== false || user?.isAdmin) && (
          <motion.button`;

code = code.replace(fileShareBtnTarget, fileShareBtnReplacement);

const fileShareBtnEndTarget = `              <p className="text-[10px] sm:text-xs md:text-sm text-neutral-muted font-semibold leading-relaxed line-clamp-2">
                Transfer files & folders locally or globally via P2P
              </p>
            </div>
            <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all flex-shrink-0 shadow-sm">
              <Icon name="arrow_forward" className="text-lg" />
            </div>
          </motion.button>`;

const fileShareBtnEndReplacement = `              <p className="text-[10px] sm:text-xs md:text-sm text-neutral-muted font-semibold leading-relaxed line-clamp-2">
                Transfer files & folders locally or globally via P2P
              </p>
            </div>
            <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all flex-shrink-0 shadow-sm">
              <Icon name="arrow_forward" className="text-lg" />
            </div>
          </motion.button>
          )}`;

code = code.replace(fileShareBtnEndTarget, fileShareBtnEndReplacement);

fs.writeFileSync('src/components/Hub.tsx', code);
