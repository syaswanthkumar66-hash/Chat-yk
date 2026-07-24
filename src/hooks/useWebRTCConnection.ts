import { useAppStore } from '../store';

export const createPrioritizedPeerConnection = (
  iceServers: any[],
  peerId: string,
  roomId: string,
  onLog: (msg: string) => void
): RTCPeerConnection => {
  onLog(`[WebRTC] Initializing connection for ${peerId}`);
  
  const pc = new RTCPeerConnection({
    iceServers: iceServers,
    rtcpMuxPolicy: 'require',
    bundlePolicy: 'max-bundle'
  });

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
