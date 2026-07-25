const fs = require('fs');
let file = fs.readFileSync('src/components/ProfileView.tsx', 'utf8');
file = file.replace(
  /status=\{\(\(friend\.isOnline \|\| \(typeof onlineUserIds !== 'undefined' && onlineUserIds\.includes\(friend\.id\)\)\) \? \(friend\.isInactive \? 'away' : 'online'\) : 'offline'\)\}/g,
  "status={(friend.isOnline ? (friend.isInactive ? 'away' : 'online') : 'offline')}"
);
fs.writeFileSync('src/components/ProfileView.tsx', file);
