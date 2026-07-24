const fs = require('fs');
let serverFile = fs.readFileSync('server/index.ts', 'utf8');

serverFile = serverFile.replace(
  `    socket.on("get_online_users", () => {
      socket.emit("online_users", getOnlineUsersPayload());
    });`,
  `    socket.on("get_online_users", async () => {
      socket.emit("online_users", getOnlineUsersPayload());
      
      // Send all users data
      if (db) {
        try {
          const snapshot = await db.collection('users').get();
          const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          socket.emit("all_users_data", allUsers);
        } catch (e) {
          console.error("Failed to fetch all users:", e);
        }
      }
    });`
);

fs.writeFileSync('server/index.ts', serverFile);
