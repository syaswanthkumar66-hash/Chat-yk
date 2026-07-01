import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';

export interface RemoteTrackInfo {
  sessionId: string;
  trackName: string;
  kind: 'audio' | 'video';
}

class WebRTCService {
  private pcs: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private iceServers: any[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private currentRoomId: string | null = null;

  constructor() {
    this.fetchIceConfig();
  }

  private async fetchIceConfig(retries = 5, delay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/webrtc/config`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.iceServers) {
            this.iceServers = data.iceServers;
            console.log("Successfully fetched WebRTC ICE config with STUN/TURN servers");
            return;
          }
        }
      } catch (error) {
        console.warn(`Attempt ${attempt} to fetch ICE config failed:`, error);
      }
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }
    console.error('Failed to fetch ICE config after retries, using default STUN server');
  }

  async publishLocalStream(stream: MediaStream, roomId: string) {
    this.localStream = stream;
    this.currentRoomId = roomId;

    // Fetch TURN server credentials quickly if we haven't already
    if (this.iceServers.length <= 1) {
      await this.fetchIceConfig(2, 500);
    }

    console.log(`Publishing local stream in room ${roomId}. Broadcasting presence...`);

    const socket = useAppStore.getState().socket;
    if (socket) {
      // Announce our presence to everyone in the room
      socket.emit('sfu_signal', {
        roomId,
        from: useAppStore.getState().user?.id,
        signal: {
          type: 'peer_joined',
          peerId: useAppStore.getState().user?.id
        }
      });
    }
  }

  private createPeerConnection(peerId: string, roomId: string): RTCPeerConnection {
    if (this.pcs.has(peerId)) {
      return this.pcs.get(peerId)!;
    }

    console.log(`Creating RTCPeerConnection for peer ${peerId} using ICE servers:`, this.iceServers);
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle'
    });

    this.pcs.set(peerId, pc);

    // Add all local tracks to this connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates and transmit them via Socket.io
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = useAppStore.getState().socket;
        if (socket) {
          socket.emit('sfu_signal', {
            roomId,
            from: useAppStore.getState().user?.id,
            signal: {
              type: 'ice_candidate',
              candidate: event.candidate,
              to: peerId
            }
          });
        }
      }
    };

    // Handle remote stream tracks being added
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        console.log(`Successfully received remote track/stream from peer ${peerId}`);
        // Dispatch custom event to notify GroupCall component
        window.dispatchEvent(new CustomEvent('webrtc_stream', {
          detail: { from: peerId, stream }
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State for peer ${peerId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    return pc;
  }

  private removePeer(peerId: string) {
    const pc = this.pcs.get(peerId);
    if (pc) {
      console.log(`Cleaning up connection for peer ${peerId}`);
      pc.close();
      this.pcs.delete(peerId);
    }
  }

  async handleSignal(from: string, signal: any, roomId: string) {
    const myId = useAppStore.getState().user?.id;
    if (from === myId) return; // Skip our own signals

    if (signal.type === 'peer_joined') {
      const peerId = signal.peerId;
      if (peerId && peerId !== myId) {
        console.log(`Peer ${peerId} joined. Initiating WebRTC connection offer...`);
        const pc = this.createPeerConnection(peerId, roomId);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          const socket = useAppStore.getState().socket;
          if (socket) {
            socket.emit('sfu_signal', {
              roomId,
              from: myId,
              signal: {
                type: 'offer',
                sdp: offer.sdp,
                to: peerId
              }
            });
          }
        } catch (err) {
          console.error(`Failed to create/send offer to peer ${peerId}:`, err);
        }
      }
    } else if (signal.type === 'offer') {
      if (signal.to === myId) {
        console.log(`Received WebRTC connection offer from peer ${from}`);
        const pc = this.createPeerConnection(from, roomId);

        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const socket = useAppStore.getState().socket;
          if (socket) {
            socket.emit('sfu_signal', {
              roomId,
              from: myId,
              signal: {
                type: 'answer',
                sdp: answer.sdp,
                to: from
              }
            });
          }
        } catch (err) {
          console.error(`Failed to handle offer from peer ${from}:`, err);
        }
      }
    } else if (signal.type === 'answer') {
      if (signal.to === myId) {
        console.log(`Received WebRTC connection answer from peer ${from}`);
        const pc = this.pcs.get(from);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          } catch (err) {
            console.error(`Failed to set remote description from peer ${from}:`, err);
          }
        }
      }
    } else if (signal.type === 'ice_candidate') {
      if (signal.to === myId) {
        const pc = this.pcs.get(from);
        if (pc && signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.error(`Failed to add ICE candidate from peer ${from}:`, err);
          }
        }
      }
    } else if (signal.type === 'request_tracks') {
      if (this.localStream) {
        console.log(`Received track request. Re-broadcasting peer presence...`);
        const socket = useAppStore.getState().socket;
        if (socket) {
          socket.emit('sfu_signal', {
            roomId,
            from: myId,
            signal: {
              type: 'peer_joined',
              peerId: myId
            }
          });
        }
      }
    }
  }

  closeSession() {
    console.log("Closing WebRTC session, cleaning up all peer connections.");
    this.pcs.forEach((pc, peerId) => {
      pc.close();
    });
    this.pcs.clear();
    this.localStream = null;
    this.currentRoomId = null;
  }
}

export const webrtcService = new WebRTCService();

