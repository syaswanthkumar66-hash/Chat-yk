const fs = require('fs');

let webrtcService = fs.readFileSync('src/services/webrtcService.ts', 'utf8');

webrtcService = webrtcService.replace(
  `    pc.onicegatheringstatechange = () => {
      const state = pc.iceGatheringState;
      diagnosticLogger.log('webrtc', 'ice_gathering_state_changed', \`ICE Gathering State changed to: \$\{state\}\`, peerId, roomId, { state });
      if (state === 'complete' && (this.candidatesGathered.get(mapKey) || 0) === 0) {
        diagnosticLogger.log('error', 'ice_gathering_completed_empty', \`ICE gathering completed but 0 candidates were gathered! Connection unlikely to succeed.\`, peerId, roomId);
        this.dispatchCallError(CallError.ICE_GATHERING_FAILED, peerId);
      }
    };`,
  `    let iceGatheringAttempts = 0;
    const MAX_GATHERING_ATTEMPTS = 3;

    pc.onicegatheringstatechange = () => {
      const state = pc.iceGatheringState;
      diagnosticLogger.log('webrtc', 'ice_gathering_state_changed', \`ICE Gathering State changed to: \$\{state\}\`, peerId, roomId, { state });
      if (state === 'complete' && (this.candidatesGathered.get(mapKey) || 0) === 0) {
        diagnosticLogger.log('error', 'ice_gathering_completed_empty', \`ICE gathering completed but 0 candidates were gathered! Connection unlikely to succeed.\`, peerId, roomId);
        iceGatheringAttempts++;
        if (iceGatheringAttempts <= MAX_GATHERING_ATTEMPTS) {
          const backoffDelay = Math.min(1000 * Math.pow(2, iceGatheringAttempts - 1), 5000);
          diagnosticLogger.log('webrtc', 'ice_gathering_retry', \`Scheduling ICE restart (attempt \$\{iceGatheringAttempts\}/\$\{MAX_GATHERING_ATTEMPTS\}) in \$\{backoffDelay\}ms\`, peerId, roomId);
          setTimeout(() => {
            const currentPc = this.pcs.get(mapKey);
            if (currentPc === pc && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'closed') {
              this.handleIceFailure(peerId, roomId);
            }
          }, backoffDelay);
        } else {
          diagnosticLogger.log('error', 'ice_gathering_exhausted', \`Max ICE gathering retries exhausted.\`, peerId, roomId);
          this.dispatchCallError(CallError.ICE_GATHERING_FAILED, peerId);
        }
      }
    };`
);
fs.writeFileSync('src/services/webrtcService.ts', webrtcService);
