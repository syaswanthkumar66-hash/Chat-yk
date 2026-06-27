import { useAppStore } from '../store';

export interface RemoteTrackInfo {
  sessionId: string;
  trackName: string;
  kind: 'audio' | 'video';
}

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private subscribedSessions: Set<string> = new Set();
  private iceServers: any[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  constructor() {
    this.fetchIceConfig();
  }

  private async fetchIceConfig() {
    try {
      const response = await fetch('/api/webrtc/config');
      if (response.ok) {
        const data = await response.json();
        this.iceServers = data.iceServers;
      }
    } catch (error) {
      console.error('Failed to fetch ICE config:', error);
    }
  }

  private async apiRequest(path: string, method: string = 'POST', body?: any) {
    const res = await fetch(`/api/realtime/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      throw new Error(`Realtime API error: ${res.statusText}`);
    }
    return res.json();
  }

  async initSession() {
    if (this.sessionId) return this.sessionId;
    const data = await this.apiRequest('sessions/new');
    this.sessionId = data.sessionId;
    
    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle'
    });

    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        // We use the stream ID as the remote user identifier for now
        this.remoteStreams.set(stream.id, stream);
        window.dispatchEvent(new CustomEvent('webrtc_stream', { 
          detail: { from: stream.id, stream } 
        }));
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.pc?.iceConnectionState);
    };

    return this.sessionId;
  }

  private async waitForIceGathering() {
    if (this.pc!.iceGatheringState === 'complete') return;
    return new Promise<void>((resolve) => {
      const checkState = () => {
        if (this.pc!.iceGatheringState === 'complete') {
          this.pc!.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      this.pc!.addEventListener('icegatheringstatechange', checkState);
      
      // Fallback timeout just in case
      setTimeout(() => {
        this.pc!.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 3000);
    });
  }

  async publishLocalStream(stream: MediaStream, roomId: string) {
    if (!this.pc || !this.sessionId) await this.initSession();
    this.localStream = stream;

    const tracksToPublish: any[] = [];
    const transceivers = [];

    for (const track of stream.getTracks()) {
      const transceiver = this.pc!.addTransceiver(track, {
        direction: 'sendonly',
        streams: [stream]
      });
      transceivers.push(transceiver);
      tracksToPublish.push({
        location: 'local',
        mid: transceiver.mid,
        trackName: `${useAppStore.getState().user?.id}-${track.kind}`
      });
    }

    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    
    await this.waitForIceGathering();

    const data = await this.apiRequest(`sessions/${this.sessionId}/tracks/new`, 'POST', {
      sessionDescription: {
        type: 'offer',
        sdp: this.pc!.localDescription!.sdp
      },
      tracks: tracksToPublish
    });

    if (data.sessionDescription) {
      await this.pc!.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
    }

    // Notify others in the room about our published tracks
    const socket = useAppStore.getState().socket;
    if (socket) {
      socket.emit('sfu_signal', {
        roomId,
        from: useAppStore.getState().user?.id,
        signal: {
          type: 'tracks_published',
          sessionId: this.sessionId,
          tracks: tracksToPublish.map(t => ({
            trackName: t.trackName,
            kind: t.trackName.endsWith('video') ? 'video' : 'audio'
          }))
        }
      });
    }
  }

  async subscribeToRemoteTracks(remoteSessionId: string, tracks: { trackName: string, kind: string }[]) {
    if (this.subscribedSessions.has(remoteSessionId)) return;
    this.subscribedSessions.add(remoteSessionId);

    if (!this.pc || !this.sessionId) await this.initSession();

    const tracksToSubscribe = tracks.map(t => ({
      location: 'remote',
      sessionId: remoteSessionId,
      trackName: t.trackName
    }));

    const data = await this.apiRequest(`sessions/${this.sessionId}/tracks/new`, 'POST', {
      tracks: tracksToSubscribe
    });

    if (data.requiresImmediateRenegotiation && data.sessionDescription) {
      await this.pc!.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);

      await this.waitForIceGathering();

      await this.apiRequest(`sessions/${this.sessionId}/renegotiate`, 'PUT', {
        sessionDescription: {
          type: 'answer',
          sdp: this.pc!.localDescription!.sdp
        }
      });
    }
  }

  handleSignal(from: string, signal: any, roomId: string) {
    if (signal.type === 'tracks_published') {
      // Subscribe to the newly published tracks
      this.subscribeToRemoteTracks(signal.sessionId, signal.tracks).catch(console.error);
    } else if (signal.type === 'request_tracks') {
      if (this.localStream && this.sessionId) {
        const socket = useAppStore.getState().socket;
        if (socket) {
          socket.emit('sfu_signal', {
            roomId,
            from: useAppStore.getState().user?.id,
            signal: {
              type: 'tracks_published',
              sessionId: this.sessionId,
              tracks: this.localStream.getTracks().map(t => ({
                trackName: `${useAppStore.getState().user?.id}-${t.kind}`,
                kind: t.kind
              }))
            }
          });
        }
      }
    }
  }

  closeSession() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.sessionId = null;
    this.localStream = null;
    this.remoteStreams.clear();
    this.subscribedSessions.clear();
  }
}

export const webrtcService = new WebRTCService();

