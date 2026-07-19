const fs = require('fs');
const path = 'server/index.ts';
let code = fs.readFileSync(path, 'utf8');

const search = `  app.get("/api/webrtc/config", (req, res) => {
    let turnUrl = process.env.TURN_SERVER_URL;
    if (turnUrl && !turnUrl.startsWith('turn:') && !turnUrl.startsWith('stun:') && !turnUrl.startsWith('turns:')) {
      turnUrl = \`turn:\${turnUrl}\`;
    }

    res.json({
      iceServers: [
        // STUN servers allow direct peer-to-peer connections for most NAT types
        // with zero relay cost. Always prioritize STUN to avoid unnecessary latency.
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // TURN relays are used ONLY when direct connection fails (symmetric NAT, strict firewalls).
        // Try dedicated production credentials first if provided via environment variables.
        // Otherwise, fall back to a free public TURN relay for demo purposes.
        // WARNING: Free public TURN relays (like metered.ca openrelay) are shared, 
        // rate-limited, best-effort services and are NOT reliable for production load.
        // Configure your own dedicated TURN provider (e.g. Twilio, Metered paid tier) for reliability.
        ...(turnUrl ? [
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
        ...([
          { 
            urls: 'turn:openrelay.metered.ca:80?transport=tcp', 
            username: 'openrelayproject', 
            credential: 'openrelayproject' 
          },
          { 
            urls: 'turn:openrelay.metered.ca:443?transport=tcp', 
            username: 'openrelayproject', 
            credential: 'openrelayproject' 
          }
        ])
      ])
    ]
  });`;

const replace = `  app.get("/api/webrtc/config", (req, res) => {
    let turnUrl = process.env.TURN_SERVER_URL || 'turn:free.expressturn.com:3478';
    let turnUser = process.env.TURN_SERVER_USERNAME || '000000002099639457';
    let turnPass = process.env.TURN_SERVER_PASSWORD || 'tSLm3kXJjgjn59xHqOmR8TvGo+4=';

    if (turnUrl && !turnUrl.startsWith('turn:') && !turnUrl.startsWith('stun:') && !turnUrl.startsWith('turns:')) {
      turnUrl = \`turn:\${turnUrl}\`;
    }

    res.json({
      iceServers: [
        // STUN servers allow direct peer-to-peer connections for most NAT types
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        {
          urls: turnUrl.startsWith('turn:') || turnUrl.startsWith('turns:') || turnUrl.startsWith('stun:') ? turnUrl : \`turn:\${turnUrl}\`,
          username: turnUser,
          credential: turnPass
        },
        {
          urls: (turnUrl.startsWith('turn:') || turnUrl.startsWith('turns:') || turnUrl.startsWith('stun:') ? turnUrl : \`turn:\${turnUrl}\`) + '?transport=tcp',
          username: turnUser,
          credential: turnPass
        }
      ]
    });`;

if(code.includes(search)) {
  code = code.replace(search, replace);
  fs.writeFileSync(path, code);
  console.log('Successfully patched server/index.ts');
} else {
  console.log('Could not find search string in server/index.ts');
}
