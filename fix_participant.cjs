const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

const str1 = `return [...prev, { ...u, status: 'online', isMuted: false, isVideoOff: false }];`;
const rep1 = `return [...prev, { id: u.id, name: u.displayName || u.id, avatar: u.avatar, isMuted: false, isVideoOff: false, isSpeaking: false, status: 'online' }];`;

code = code.split(str1).join(rep1);

fs.writeFileSync('src/components/GroupCall.tsx', code);
