const fs = require('fs');
let code = fs.readFileSync('server/index.ts', 'utf8');

const search = `        // Additional fallbacks for the public relay using TCP in case UDP is blocked
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
    });`;

const replace = `        // Additional fallbacks for the public relay using TCP in case UDP is blocked
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

code = code.replace(search, replace);
fs.writeFileSync('server/index.ts', code);
