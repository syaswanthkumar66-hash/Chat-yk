const fs = require('fs');
let code = fs.readFileSync('src/services/webrtcService.ts', 'utf8');

code = `import { createPrioritizedPeerConnection } from '../hooks/useWebRTCConnection';\n` + code;

const search = `    const { createPrioritizedPeerConnection } = await import("../hooks/useWebRTCConnection");
    const pc = createPrioritizedPeerConnection(this.iceServers, peerId, roomId, (msg) => useAppStore.getState().addConnectionLog(msg));
    /* 
      iceServers: this.iceServers,
      rtcpMuxPolicy: 'require',
      bundlePolicy: 'max-bundle',
      iceTransportPolicy: 'all' // Ensure all connections (both STUN direct and TURN relayed) are fully allowed and utilized
    });`;

const replace = `    const pc = createPrioritizedPeerConnection(this.iceServers, peerId, roomId, (msg) => useAppStore.getState().addConnectionLog(msg));`;

code = code.replace(search, replace);
fs.writeFileSync('src/services/webrtcService.ts', code);
