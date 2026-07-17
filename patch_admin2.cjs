const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const search = `import { WebRTCConnectivityTester } from './WebRTCConnectivityTester';
import { WebRTCConnectivityTester } from './WebRTCConnectivityTester';`;

const replace = `import { WebRTCConnectivityTester } from './WebRTCConnectivityTester';`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/AdminPanel.tsx', code);
