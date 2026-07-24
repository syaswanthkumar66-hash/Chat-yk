const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/\{isLoggedIn       \{isLoggedIn && <NotificationPrompt \/>\}\n      \{isLoggedIn && <NotificationPrompt \/>\} <NotificationPrompt \/>\}/, '{isLoggedIn && <NotificationPrompt />}');
fs.writeFileSync('src/App.tsx', code);
