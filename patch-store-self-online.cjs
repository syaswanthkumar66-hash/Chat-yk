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
            newState.users = state.users.map(u => u.id === uid ? { ...u, isOnline: true } : u);
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
            newState.users = state.users.map(u => {
              if (u.id === uid) {
                 return { ...u, isOnline: true };
              }
              return u;
            });
          }
          return newState;
        });`
);

fs.writeFileSync('src/store.ts', storeFile);
