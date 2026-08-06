const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

const target1 = `    const handleUserJoined = (data: { userId: string }) => {
      console.log('User joined call:', data.userId);
      setParticipants(prev => prev.map(p => p.id === data.userId ? { ...p, status: 'online' } : p));
    };`;

const replace1 = `    const handleUserJoined = (data: { userId: string }) => {
      console.log('User joined call:', data.userId);
      setParticipants(prev => {
        const exists = prev.find(p => p.id === data.userId);
        if (exists) {
          return prev.map(p => p.id === data.userId ? { ...p, status: 'online' } : p);
        }
        const state = useStore.getState();
        const u = state.users.find(u => u.id === data.userId) || {
          id: data.userId,
          username: data.userId,
          displayName: data.userId.startsWith('u') ? 'User ' + data.userId : data.userId,
          avatar: \`https://ui-avatars.com/api/?name=\${data.userId}&background=random\`,
          description: '',
          joinDate: new Date().toISOString(),
          isAdmin: false,
          profileVisibility: 'everyone',
          notificationSettings: {
            pushEnabled: true,
            previewEnabled: true,
            soundEnabled: true,
            vibrateEnabled: true
          }
        };
        return [...prev, { ...u, status: 'online', isMuted: false, isVideoOff: false }];
      });
    };`;

code = code.replace(target1, replace1);

const target2 = `    const handleRemoteStream = (e: any) => {
      const { from, stream: newStream } = e.detail;
      setRemoteStreams(prev => {`;

const replace2 = `    const handleRemoteStream = (e: any) => {
      const { from, stream: newStream } = e.detail;
      
      // Ensure the participant exists when their stream arrives
      setParticipants(prev => {
        if (!prev.find(p => p.id === from)) {
           const state = useStore.getState();
           const u = state.users.find(u => u.id === from) || {
              id: from,
              username: from,
              displayName: from.startsWith('u') ? 'User ' + from : from,
              avatar: \`https://ui-avatars.com/api/?name=\${from}&background=random\`,
              description: '',
              joinDate: new Date().toISOString(),
              isAdmin: false,
              profileVisibility: 'everyone',
              notificationSettings: { pushEnabled: true, previewEnabled: true, soundEnabled: true, vibrateEnabled: true }
           };
           return [...prev, { ...u, status: 'online', isMuted: false, isVideoOff: false }];
        }
        return prev;
      });

      setRemoteStreams(prev => {`;

code = code.replace(target2, replace2);

fs.writeFileSync('src/components/GroupCall.tsx', code);
