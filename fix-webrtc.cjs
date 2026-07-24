const fs = require('fs');

let useWebRTCConnection = fs.readFileSync('src/hooks/useWebRTCConnection.ts', 'utf8');
useWebRTCConnection = useWebRTCConnection.replace(/  \/\/ Ensure audio transceiver is present for incoming and outgoing voice\n  try {\n    pc\.addTransceiver\('audio', \{ direction: 'sendrecv' \}\);\n  \} catch \(e\) {\n    onLog\(`\[WebRTC\] Failed to add audio transceiver: \$\{e\}`\);\n  }\n/g, '');
fs.writeFileSync('src/hooks/useWebRTCConnection.ts', useWebRTCConnection);

let webrtcService = fs.readFileSync('src/services/webrtcService.ts', 'utf8');
webrtcService = webrtcService.replace(/          \/\/ Check if there is an empty transceiver of this kind we can reuse[\s\S]*?\} else \{/g, '');
webrtcService = webrtcService.replace(/            sender = pc\.addTrack\(track, this\.localStream!\);\n          \}\n        \} else \{/g, '          sender = pc.addTrack(track, this.localStream!);\n        } else {');
fs.writeFileSync('src/services/webrtcService.ts', webrtcService);

