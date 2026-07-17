const fs = require('fs');
const path = 'src/components/AdminPanel.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  '      const iceServers = await webrtcService.getIceServers();\n      logMsg(`Configured ICE Servers: ${iceServers.length}`);\n      setTestProgress(30);\n      const pc = new RTCPeerConnection({ iceServers });',
  `      const iceServers = await webrtcService.getIceServers();
      logMsg(\`Configured ICE Servers: \${iceServers.length}\`);
      
      // Log credential details to diagnose 401 Unauthorized errors
      iceServers.forEach((server: any, index: number) => {
        if (server.urls && (typeof server.urls === 'string' ? server.urls.includes('turn') : server.urls.some((u: string) => u.includes('turn')))) {
          logMsg(\`[TURN Config] Server \${index + 1}: \${server.urls}\`);
          logMsg(\`[TURN Config] Username present: \${!!server.username} ('\${server.username || ''}')\`);
          logMsg(\`[TURN Config] Credential present: \${!!server.credential}\`);
        }
      });
      
      setTestProgress(30);
      const pc = new RTCPeerConnection({ iceServers });`
);
fs.writeFileSync(path, content);
console.log('Patched AdminPanel.tsx');
