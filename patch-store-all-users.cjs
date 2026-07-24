const fs = require('fs');
let storeFile = fs.readFileSync('src/store.ts', 'utf8');

storeFile = storeFile.replace(
  `      // 5. online_users`,
  `      // 5a. all_users_data
      sock.off('all_users_data').on('all_users_data', (allUsers: any[]) => {
        set((state) => {
          const onlineUserIds = state.onlineUserIds || [];
          const mergedUsers = allUsers.map((u: any) => {
            const isOnline = onlineUserIds.includes(u.id);
            return {
              ...u,
              isOnline
            };
          });
          
          if (state.user?.id) {
            safeLocalStorageSetItem(\`proto_users_\$\{state.user.id\}\`, JSON.stringify(mergedUsers));
          }
          
          return { users: mergedUsers };
        });
      });

      // 5. online_users`
);

fs.writeFileSync('src/store.ts', storeFile);
