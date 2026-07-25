const fs = require('fs');
let file = fs.readFileSync('src/components/SocialLayout.tsx', 'utf8');
file = file.replace(
  /status=\{user\.isOnline \? \(user\.isInactive \? 'away' : 'online'\) : 'offline'\}/g,
  "status={isUserOnline(user.id) ? (user.isInactive ? 'away' : 'online') : 'offline'}"
);
fs.writeFileSync('src/components/SocialLayout.tsx', file);
