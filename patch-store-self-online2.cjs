const fs = require('fs');
let storeFile = fs.readFileSync('src/store.ts', 'utf8');

storeFile = storeFile.replace(
  `        useAppStore.getState().addConnectionLog('Successfully connected to backend server!');
        set((state) => {
          const newState = { wssStatus: 'connected', isWssConnected: true, wssMessage: 'Connected & Secure' } as any;
          if (uid) {
            const nextOnline = [...(state.onlineUserIds || [])];
            if (!nextOnline.includes(uid)) nextOnline.push(uid);
            newState.onlineUserIds = nextOnline;
            newState.users = state.users.map((u: any) => {
              if (u.id === uid) {
                 return { ...u, isOnline: true, lastSeen: undefined };
              }
              return u;
            });
            newState.chats = state.chats.map((c: any) => ({
              ...c,
              participants: c.participants.map((p: any) => {
                if (p.id === uid) return { ...p, isOnline: true, lastSeen: undefined };
                return p;
              })
            }));
          }
          return newState;
        });`,
  `        useAppStore.getState().addConnectionLog('Successfully connected to backend server!');
        set((state) => {
          const newState = { wssStatus: 'connected', isWssConnected: true, wssMessage: 'Connected & Secure' } as any;
          if (uid) {
            const nextOnline = [...(state.onlineUserIds || [])];
            if (!nextOnline.includes(uid)) nextOnline.push(uid);
            newState.onlineUserIds = nextOnline;
            newState.users = state.users.map((u: any) => {
              if (u.id === uid) {
                 return { ...u, isOnline: true, lastSeen: undefined };
              }
              return u;
            });
            newState.chats = state.chats.map((c: any) => ({
              ...c,
              participants: c.participants.map((p: any) => {
                if (p.id === uid) return { ...p, isOnline: true, lastSeen: undefined };
                return p;
              })
            }));
          }
          return newState;
        });`
);

fs.writeFileSync('src/store.ts', storeFile);
