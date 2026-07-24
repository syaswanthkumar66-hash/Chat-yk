const fs = require('fs');
let appFile = fs.readFileSync('src/App.tsx', 'utf8');

appFile = appFile.replace(
  `          const notifTime = new Date(notif.createdAt).getTime();
          if (isNaN(notifTime) || notifTime < syncStartTime - 5000) {
            console.log(\`Processing historical notification \$\{notif.id\} silently.\`);
            continue;
          }`,
  `          const notifTime = new Date(notif.createdAt).getTime();
          if (isNaN(notifTime) || notifTime < Date.now() - 15000) {
            console.log(\`Processing historical notification \$\{notif.id\} silently.\`);
            continue;
          }`
);

fs.writeFileSync('src/App.tsx', appFile);
