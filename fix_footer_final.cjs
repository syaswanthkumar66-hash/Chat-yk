const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

const target = `      {/* Footer Controls */}
      <footer className="p-3 sm:p-6 md:p-8 z-30 shrink-0 flex justify-center w-full max-w-full overflow-hidden">
        <div className="bg-slate-900/80 backdrop-blur-3xl px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-full border border-white/10 shadow-2xl flex items-center gap-2 sm:gap-4 md:gap-8 overflow-x-auto max-w-full no-scrollbar shrink-0">
          {type !== 'walkie-talkie' && (
            <>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "size-9 sm:size-11 md:size-14 rounded-full flex items-center justify-center transition-all shrink-0",
              isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'
            )}
            title="Mute/Unmute Mic"
          >
            <Icon name={isMuted ? 'mic_off' : 'mic'} className="text-base sm:text-lg md:text-2xl" />
          </button>
          <button 
            onClick={togglePTT}
            className={cn(
              "size-9 sm:size-11 md:size-14 rounded-full flex items-center justify-center transition-all relative select-none shrink-0",
              isRecordingPTT 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-500/20 animate-pulse' 
                : 'bg-white/5 text-white hover:bg-white/10'
            )}
            title="Send Live Voice over P2P Data Channel (Walkie-Talkie)"
          >
            <Icon name="graphic_eq" className={cn("text-base sm:text-lg md:text-2xl", isRecordingPTT && "animate-bounce")} />
            {isRecordingPTT && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            )}
          </button>
          {type === 'video' && (
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
          )}`;

const replace = `      {/* Footer Controls */}
      <footer className="p-3 sm:p-6 md:p-8 z-30 shrink-0 flex justify-center w-full max-w-full overflow-hidden">
        <div className="bg-slate-900/80 backdrop-blur-3xl px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-full border border-white/10 shadow-2xl flex items-center gap-2 sm:gap-4 md:gap-8 overflow-x-auto max-w-full no-scrollbar shrink-0">
          {type !== 'walkie-talkie' && (
            <>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "size-9 sm:size-11 md:size-14 rounded-full flex items-center justify-center transition-all shrink-0",
                  isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'
                )}
                title="Mute/Unmute Mic"
              >
                <Icon name={isMuted ? 'mic_off' : 'mic'} className="text-base sm:text-lg md:text-2xl" />
              </button>
              <button 
                onClick={togglePTT}
                className={cn(
                  "size-9 sm:size-11 md:size-14 rounded-full flex items-center justify-center transition-all relative select-none shrink-0",
                  isRecordingPTT 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-500/20 animate-pulse' 
                    : 'bg-white/5 text-white hover:bg-white/10'
                )}
                title="Send Live Voice over P2P Data Channel (Walkie-Talkie)"
              >
                <Icon name="graphic_eq" className={cn("text-base sm:text-lg md:text-2xl", isRecordingPTT && "animate-bounce")} />
                {isRecordingPTT && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                )}
              </button>
              {type === 'video' && (
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
            </>
          )}`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/GroupCall.tsx', code);
