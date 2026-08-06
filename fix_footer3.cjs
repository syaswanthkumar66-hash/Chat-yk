const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

code = code.replace(`          {type === 'video' && (
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
          )}`, `          {type === 'video' && (
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
          )} // close the type !== walkie-talkie block`);

// wait the original code was:
// {type !== 'walkie-talkie' && ( ... {type === 'video' && ( ... )} )}
// So it needs the `)}` at the end!
// Why was there a syntax error then?

