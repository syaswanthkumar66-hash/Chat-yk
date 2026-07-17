import { useAppStore } from '../store';

export const createPrioritizedPeerConnection = (
  iceServers: any[],
  peerId: string,
  roomId: string,
  onLog: (msg: string) => void
): RTCPeerConnection => {
  onLog(`[WebRTC] Initializing connection for ${peerId} (prioritizing local network)`);
  
  // Phase 1: Local Network Only (No STUN/TURN)
  const pc = new RTCPeerConnection({
    iceServers: [],
    rtcpMuxPolicy: 'require',
    bundlePolicy: 'max-bundle'
  });

  // Phase 2: STUN/TURN Fallback after 1 second if not connected
  setTimeout(() => {
    if (pc.signalingState !== 'closed' && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
      onLog(`[WebRTC] Local connection taking too long, falling back to STUN/TURN relays...`);
      try {
        pc.setConfiguration({
          iceServers: iceServers,
          rtcpMuxPolicy: 'require',
          bundlePolicy: 'max-bundle',
          iceTransportPolicy: 'all'
        });
      } catch (e) {
        onLog(`[WebRTC] Error configuring STUN/TURN: ${e}`);
      }
    }
  }, 1000);

  // Log ICE Gathering
  pc.addEventListener('icegatheringstatechange', () => {
    onLog(`[WebRTC] ICE Gathering Phase: ${pc.iceGatheringState}`);
  });
  
  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      onLog(`[WebRTC] Candidate Gathered: ${event.candidate.type} (${event.candidate.protocol})`);
    } else {
      onLog(`[WebRTC] ICE Gathering Complete`);
    }
  });

  return pc;
};

export const useWebRTCConnection = () => {
  const addConnectionLog = useAppStore(state => state.addConnectionLog);

  const initConnection = (iceServers: any[], peerId: string = 'test', roomId: string = 'test-room') => {
    return createPrioritizedPeerConnection(iceServers, peerId, roomId, addConnectionLog);
  };

  return { initConnection };
};
