const fs = require('fs');

let useWebRTCConnection = fs.readFileSync('src/hooks/useWebRTCConnection.ts', 'utf8');
useWebRTCConnection = useWebRTCConnection.replace(
  `  return pc;`,
  `  // Ensure audio transceiver is present for incoming and outgoing voice
  try {
    pc.addTransceiver('audio', { direction: 'sendrecv' });
  } catch (e) {
    onLog(\`[WebRTC] Failed to add audio transceiver: \$\{e\}\`);
  }

  return pc;`
);
fs.writeFileSync('src/hooks/useWebRTCConnection.ts', useWebRTCConnection);

let webrtcService = fs.readFileSync('src/services/webrtcService.ts', 'utf8');
webrtcService = webrtcService.replace(
  `          sender = pc.addTrack(track, this.localStream!);
        } else {`,
  `          // Check if there is an empty transceiver of this kind we can reuse
          const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === track.kind && !t.sender.track);
          if (transceiver) {
            console.log(\`[Diagnostic] Reusing empty transceiver for local track "\$\{track.kind\}"\`);
            transceiver.sender.replaceTrack(track);
            transceiver.direction = 'sendrecv';
            sender = transceiver.sender;
          } else {
            console.log(\`[Diagnostic] Attaching local track "\$\{track.kind\}" to peer connection\`);
            sender = pc.addTrack(track, this.localStream!);
          }
        } else {`
);
fs.writeFileSync('src/services/webrtcService.ts', webrtcService);
