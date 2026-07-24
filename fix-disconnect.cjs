const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
`    const handlePageHide = () => {`,
`    const handleBeforeUnload = () => {
      import('./store').then(({ useAppStore }) => {
        const socket = useAppStore.getState().socket;
        if (socket && socket.connected) {
          socket.emit('explicit_disconnect');
          socket.disconnect();
        }
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handlePageHide = () => {`
);

code = code.replace(
`      window.removeEventListener('pagehide', handlePageHide);
    };`,
`      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };`
);
fs.writeFileSync('src/App.tsx', code);
