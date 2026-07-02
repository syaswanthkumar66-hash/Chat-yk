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
  private dataChannels: Map<string, RTCDataChannel> = new Map();

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

    // Setup DataChannel for Chat (if we are the deterministic initiator)
    const myId = useAppStore.getState().user?.id;
    const isInitiator = myId && peerId && myId < peerId;
    if (roomId.startsWith('chat-webrtc-') && isInitiator) {
      console.log(`Creating RTCDataChannel "audio_transfer" for peer ${peerId} (initiator: true)`);
      const dc = pc.createDataChannel("audio_transfer", { ordered: true });
      this.setupDataChannel(peerId, dc);
    }

    pc.ondatachannel = (event) => {
      console.log(`Received remote data channel from peer ${peerId}:`, event.channel.label);
      this.setupDataChannel(peerId, event.channel);
    };

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

  private setupDataChannel(peerId: string, channel: RTCDataChannel) {
    this.dataChannels.set(peerId, channel);

    channel.onopen = () => {
      console.log(`Data channel with peer ${peerId} is OPEN`);
    };

    channel.onclose = () => {
      console.log(`Data channel with peer ${peerId} is CLOSED`);
      this.dataChannels.delete(peerId);
    };

    // Buffer of received chunks for active transfers
    // Map of transferId -> { mimeType, totalChunks, messageId, chunks: Map<number, string> }
    const activeIncomingTransfers = new Map<string, {
      mimeType: string;
      totalChunks: number;
      messageId?: string;
      chunks: Map<number, string>;
    }>();

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'transfer_start') {
          console.log(`Starting incoming audio transfer:`, message);
          activeIncomingTransfers.set(message.transferId, {
            mimeType: message.mimeType || 'audio/webm',
            totalChunks: message.totalChunks,
            messageId: message.messageId,
            chunks: new Map()
          });
        } else if (message.type === 'transfer_chunk') {
          const transfer = activeIncomingTransfers.get(message.transferId);
          if (transfer) {
            transfer.chunks.set(message.chunkIndex, message.data);
            console.log(`Received chunk ${message.chunkIndex + 1}/${transfer.totalChunks} for transfer ${message.transferId}`);
          }
        } else if (message.type === 'transfer_complete') {
          const transfer = activeIncomingTransfers.get(message.transferId);
          if (transfer) {
            console.log(`Transfer complete for ${message.transferId}. Reassembling audio file...`);
            // Reassemble
            const chunkArray: string[] = [];
            for (let i = 0; i < transfer.totalChunks; i++) {
              const chunk = transfer.chunks.get(i);
              if (chunk) {
                chunkArray.push(chunk);
              }
            }

            // Convert Base64 chunks to blobs
            const byteCharactersArray = chunkArray.map(base64 => atob(base64));
            const byteArrays = byteCharactersArray.map(byteCharacters => {
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              return new Uint8Array(byteNumbers);
            });

            const audioBlob = new Blob(byteArrays, { type: transfer.mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);

            console.log(`Audio successfully reassembled! Playback URL:`, audioUrl);

            // Dispatch a custom event to notify the ChatDetail component to show/play the received audio
            window.dispatchEvent(new CustomEvent('webrtc_audio_received', {
              detail: {
                transferId: message.transferId,
                messageId: transfer.messageId || message.messageId,
                from: peerId,
                url: audioUrl,
                blob: audioBlob,
                fileSize: `${(audioBlob.size / 1024).toFixed(1)} KB`
              }
            }));

            activeIncomingTransfers.delete(message.transferId);
          }
        }
      } catch (err) {
        console.error("Error handling data channel message:", err);
      }
    };
  }

  async joinChatRoom(roomId: string, peerId: string) {
    this.currentRoomId = roomId;
    console.log(`Joining WebRTC chat room: ${roomId} with peer ${peerId}`);
    
    // Fetch ICE config if needed
    if (this.iceServers.length <= 1) {
      await this.fetchIceConfig(2, 500);
    }

    const socket = useAppStore.getState().socket;
    if (socket) {
      // Join room
      socket.emit('join_call', { roomId, userId: useAppStore.getState().user?.id });

      // Announce presence
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

  leaveChatRoom(roomId: string, peerId: string) {
    console.log(`Leaving WebRTC chat room: ${roomId} with peer ${peerId}`);
    const socket = useAppStore.getState().socket;
    if (socket) {
      socket.emit('end_call', { roomId });
    }
    this.removePeer(peerId);
    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
    }
  }

  async sendAudioChunks(peerId: string, blob: Blob, mimeType: string, messageId?: string): Promise<boolean> {
    const channel = this.dataChannels.get(peerId);
    if (!channel || channel.readyState !== 'open') {
      console.warn(`Data channel with peer ${peerId} is not open or available.`);
      return false;
    }

    const transferId = `tf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Chunk size: 16KB to stay safe with RTCDataChannel limits
    const CHUNK_SIZE = 16384; 
    const reader = new FileReader();

    return new Promise<boolean>((resolve) => {
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          resolve(false);
          return;
        }

        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
        console.log(`Sending audio over data channel to ${peerId}. Size: ${arrayBuffer.byteLength} bytes, total chunks: ${totalChunks}`);

        try {
          // 1. Send transfer_start
          channel.send(JSON.stringify({
            type: 'transfer_start',
            transferId,
            mimeType,
            messageId,
            totalChunks
          }));

          // 2. Send chunks sequentially
          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
            const chunkBuffer = arrayBuffer.slice(start, end);
            
            // Convert array buffer to base64
            const base64 = btoa(
              new Uint8Array(chunkBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            channel.send(JSON.stringify({
              type: 'transfer_chunk',
              transferId,
              chunkIndex: i,
              data: base64
            }));

            // Avoid congestion by yielding/waiting slightly between chunks
            await new Promise(r => setTimeout(r, 25));
          }

          // 3. Send transfer_complete
          channel.send(JSON.stringify({
            type: 'transfer_complete',
            transferId,
            messageId
          }));

          console.log(`Audio transfer completed for ${transferId}`);
          resolve(true);
        } catch (sendErr) {
          console.error("Failed to transmit data chunks over RTCDataChannel:", sendErr);
          resolve(false);
        }
      };

      reader.readAsArrayBuffer(blob);
    });
  }

  private removePeer(peerId: string) {
    const pc = this.pcs.get(peerId);
    if (pc) {
      console.log(`Cleaning up connection for peer ${peerId}`);
      pc.close();
      this.pcs.delete(peerId);
    }
    const dc = this.dataChannels.get(peerId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(peerId);
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

