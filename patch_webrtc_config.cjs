const fs = require('fs');
let code = fs.readFileSync('server/index.ts', 'utf8');

const search = `        { 
          urls: turnUrl || 'turn:openrelay.metered.ca:80?transport=udp', 
          username: process.env.TURN_SERVER_USERNAME || 'openrelayproject', 
          credential: process.env.TURN_SERVER_PASSWORD || 'openrelayproject' 
        },
        // Additional fallbacks for the public relay using TCP in case UDP is blocked
        ...(turnUrl ? [] : [`;

const replace = `        ...(turnUrl ? [
          {
            urls: turnUrl.startsWith('turn:') || turnUrl.startsWith('turns:') || turnUrl.startsWith('stun:') ? turnUrl : \`turn:\${turnUrl}\`,
            ...(process.env.TURN_SERVER_USERNAME ? { username: process.env.TURN_SERVER_USERNAME } : {}),
            ...(process.env.TURN_SERVER_PASSWORD ? { credential: process.env.TURN_SERVER_PASSWORD } : {})
          }
        ] : [
        { 
          urls: 'turn:openrelay.metered.ca:80?transport=udp', 
          username: 'openrelayproject', 
          credential: 'openrelayproject' 
        },
        // Additional fallbacks for the public relay using TCP in case UDP is blocked
        ...([`;

code = code.replace(search, replace);
fs.writeFileSync('server/index.ts', code);
