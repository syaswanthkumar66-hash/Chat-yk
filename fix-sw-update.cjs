const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');

code = code.replace(
`      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[Main] Service Worker registered successfully with scope:', reg.scope);
        })
        .catch(err => {
          console.error('[Main] Service Worker registration failed:', err);
        });`,
`      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[Main] Service Worker registered successfully with scope:', reg.scope);
          // Force check for update on load
          reg.update();
        })
        .catch(err => {
          console.error('[Main] Service Worker registration failed:', err);
        });
        
      // Handle the new service worker taking control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });`
);
fs.writeFileSync('src/main.tsx', code);
