const fs = require('fs');
let storeFile = fs.readFileSync('src/store.ts', 'utf8');

storeFile = storeFile.replace(
  `        const deviceId = getOrCreateDeviceId();
        socket.emit('register', { userId, publicKey, deviceId });

        // 2. Re-join group rooms`,
  `        const deviceId = getOrCreateDeviceId();
        socket.emit('register', { userId, publicKey, deviceId });
        socket.emit('get_online_users');

        // 2. Re-join group rooms`
);

fs.writeFileSync('src/store.ts', storeFile);
