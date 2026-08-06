const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

const target1 = `<footer className="p-3 sm:p-6 md:p-8 z-30 shrink-0 flex justify-center w-full max-w-full overflow-hidden">
        <div className="bg-slate-900/80 backdrop-blur-3xl px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-full border border-white/10 shadow-2xl flex items-center gap-2 sm:gap-4 md:gap-8 overflow-x-auto max-w-full no-scrollbar shrink-0">`;

const replace1 = `<footer className="p-3 sm:p-6 md:p-8 z-30 shrink-0 flex justify-center w-full max-w-full overflow-hidden">
        <div className="bg-slate-900/80 backdrop-blur-3xl px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-full border border-white/10 shadow-2xl flex items-center gap-2 sm:gap-4 md:gap-8 overflow-x-auto max-w-full no-scrollbar shrink-0">
          {type !== 'walkie-talkie' && (`;

code = code.replace(target1, replace1);

const target2 = `          {type === 'video' && (
            <button 
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={cn(
                "size-9 sm:size-11 md:size-14 rounded-full flex items-center justify-center transition-all shrink-0",
                isVideoOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'
              )}
            >
              <Icon name={isVideoOff ? 'videocam_off' : 'videocam'} className="text-base sm:text-lg md:text-2xl" />
            </button>
          )}`;

const replace2 = `          {type === 'video' && (
            <button 
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={cn(
                "size-9 sm:size-11 md:size-14 rounded-full flex items-center justify-center transition-all shrink-0",
                isVideoOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'
              )}
            >
              <Icon name={isVideoOff ? 'videocam_off' : 'videocam'} className="text-base sm:text-lg md:text-2xl" />
            </button>
          )}
          )}
`;
code = code.replace(target2, replace2);

fs.writeFileSync('src/components/GroupCall.tsx', code);
