const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

const targetMainStart = `      {/* Main Video Area */}
      <main className="flex-1 relative overflow-y-auto no-scrollbar py-4 md:py-8 px-4 md:px-8">`;
const replaceMainStart = `      {/* Main Video Area */}
      <main className="flex-1 relative overflow-y-auto no-scrollbar py-4 md:py-8 px-4 md:px-8">
        {type === 'walkie-talkie' ? (
          <div className="min-h-full flex flex-col items-center justify-center gap-12 relative w-full">
            <div className="text-center mb-8">
              <Icon name="graphic_eq" className="text-6xl text-amber-500 mb-4 animate-pulse" />
              <h2 className="text-3xl font-black uppercase tracking-widest text-white">Walkie Talkie Mode</h2>
              <p className="text-white/50 text-sm tracking-widest mt-2 uppercase font-mono">Hold button below to transmit</p>
            </div>
            
            <button 
              onMouseDown={() => startPTT()}
              onMouseUp={() => stopPTT()}
              onMouseLeave={() => isRecordingPTT && stopPTT()}
              onTouchStart={(e) => { e.preventDefault(); startPTT(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopPTT(); }}
              className={\`size-48 sm:size-64 rounded-full flex flex-col items-center justify-center transition-all relative select-none shrink-0 shadow-2xl active:scale-95 \${
                isRecordingPTT 
                  ? 'bg-amber-500 text-white shadow-amber-500/50 ring-8 ring-amber-500/30' 
                  : 'bg-slate-800 text-white/50 border-4 border-slate-700 hover:bg-slate-700'
              }\`}
            >
              <Icon name="mic" className={\`text-6xl sm:text-8xl \${isRecordingPTT ? 'animate-bounce' : ''}\`} />
              <span className="mt-4 font-black tracking-widest uppercase text-xs sm:text-sm">PUSH TO TALK</span>
            </button>
            
            {incomingPTT && (
              <div className="absolute top-10 bg-amber-500/20 text-amber-500 px-6 py-3 rounded-full border border-amber-500/30 animate-pulse flex items-center gap-3">
                <Icon name="volume_up" />
                <span className="font-bold tracking-widest uppercase text-xs">Receiving from {incomingPTT.fromName}...</span>
              </div>
            )}
          </div>
        ) : (`;

code = code.replace(targetMainStart, replaceMainStart);

const targetMainEnd = `            )}
          </div>
        )}
      </main>`;
const replaceMainEnd = `            )}
          </div>
        )}
        )}
      </main>`;

code = code.replace(targetMainEnd, replaceMainEnd);

fs.writeFileSync('src/components/GroupCall.tsx', code);
