const fs = require('fs');
let code = fs.readFileSync('src/components/ChatDetail.tsx', 'utf-8');

const target = `                    </button>
                    <button 
                      onClick={() => {
                        if (!canStartCalls) return;
                        if (chat?.isGroup) {
                          setActiveGroupCall({ type: 'video', groupId: chat.id, callId: generateCallId('call_group') });
                        } else {
                          const userId = otherParticipantId;
                          if (userId) setActiveGroupCall({ type: 'video', userId, callId: generateCallId('call_p2p') });
                        }
                      }}
                      disabled={!canStartCalls}
                      className={\`size-9 sm:size-11 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center transition-all active:scale-95 border border-white shadow-sm \${!canStartCalls ? 'opacity-50 grayscale cursor-not-allowed' : 'text-primary hover:bg-primary hover:text-white'}\`}
                    >
                      <Icon name="videocam" />
                    </button>`;

const replace = target + `
                    <button 
                      onClick={() => {
                        if (!canStartCalls) return;
                        if (chat?.isGroup) {
                          setActiveGroupCall({ type: 'walkie-talkie', groupId: chat.id, callId: generateCallId('call_group') });
                        } else {
                          const userId = otherParticipantId;
                          if (userId) setActiveGroupCall({ type: 'walkie-talkie', userId, callId: generateCallId('call_p2p') });
                        }
                      }}
                      disabled={!canStartCalls}
                      className={\`size-9 sm:size-11 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center transition-all active:scale-95 border border-white shadow-sm \${!canStartCalls ? 'opacity-50 grayscale cursor-not-allowed' : 'text-amber-500 hover:bg-amber-500 hover:text-white'}\`}
                      title="Walkie Talkie"
                    >
                      <Icon name="graphic_eq" />
                    </button>`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/ChatDetail.tsx', code);
