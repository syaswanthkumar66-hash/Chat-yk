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
  private iceServers: any[] = [
    // STUN servers allow direct peer-to-peer connections for most NAT types
    // with zero relay cost. Always prioritize STUN to avoid unnecessary latency.
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // TURN relays are used ONLY when direct connection fails (symmetric NAT, strict firewalls).
    // The server will provide the real credentials via /api/webrtc/config.
    // WARNING: Free public TURN relays (like metered.ca openrelay) are shared, 
    // rate-limited, best-effort services and are NOT reliable for production load.
    { 
      urls: 'turn:openrelay.metered.ca:80?transport=udp', 
      username: 'openrelayproject', 
      credential: 'openrelayproject' 
    },
    { 
      urls: 'turn:openrelay.metered.ca:80?transport=tcp', 
      username: 'openrelayproject', 
      credential: 'openrelayproject' 
    },
    { 
      urls: 'turn:openrelay.metered.ca:443?transport=tcp', 
      username: 'openrelayproject', 
      credential: 'openrelayproject' 
    }
  ];
  private currentRoomId: string | null = null;
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private isIceServersFetched = false;
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  private activeOutgoingTransfers = new Map<string, {
    arrayBuffer: ArrayBuffer;
    mimeType: string;
    messageId?: string;
    sentChunks: Map<number, { offset: number; size: number }>;
    sentTimes: Map<number, number>;
    currentChunkSize: number;
    rtts: number[];
    estimatedBandwidth?: number; // Real-time estimated throughput in bytes/sec
  }>();

  private activeIncomingTransfers = new Map<string, {
    mimeType: string;
    totalBytes: number;
    messageId?: string;
    chunks: Map<number, { offset: number; data: string }>;
    receivedIndices: Set<number>;
    expectedChunksCount?: number;
    lastChunkReceivedAt: number;
  }>();

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
            this.isIceServersFetched = true;
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
    if (!this.isIceServersFetched) {
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

    channel.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // 1. Handle Sender feedback (ACK, NACK, ACK of transfer)
        if (message.type === 'transfer_chunk_ack') {
          const activeTx = this.activeOutgoingTransfers.get(message.transferId);
          if (activeTx) {
            const sentTime = activeTx.sentTimes.get(message.chunkIndex);
            if (sentTime) {
              const rtt = performance.now() - sentTime;
              activeTx.rtts.push(rtt);
              if (activeTx.rtts.length > 8) activeTx.rtts.shift();

              const averageRtt = activeTx.rtts.reduce((a, b) => a + b, 0) / activeTx.rtts.length;

              // Monitor real-time bandwidth performance
              const chunkInfo = activeTx.sentChunks.get(message.chunkIndex);
              const chunkSize = chunkInfo ? chunkInfo.size : 16384;
              const durationSeconds = Math.max(0.001, rtt / 1000); // Avoid division by zero
              const instantaneousBps = chunkSize / durationSeconds;

              // Exponential Moving Average (EMA) of bandwidth
              activeTx.estimatedBandwidth = activeTx.estimatedBandwidth
                ? (0.7 * activeTx.estimatedBandwidth + 0.3 * instantaneousBps)
                : instantaneousBps;

              // Dynamically adjust audio data block (chunk) sizes based on estimated bandwidth and RTT
              if (averageRtt < 90 && activeTx.estimatedBandwidth > 150000) {
                // High-performance network: safely expand block size up to 64KB
                activeTx.currentChunkSize = Math.min(65536, activeTx.currentChunkSize + 4096);
              } else if (averageRtt > 180 || activeTx.estimatedBandwidth < 50000) {
                // High latency or low bandwidth: immediately throttle chunk size down to maintain sync and prevent packet loss
                activeTx.currentChunkSize = Math.max(4096, activeTx.currentChunkSize - 4096);
              }
            }
          }
        } else if (message.type === 'transfer_request_missing') {
          const activeTx = this.activeOutgoingTransfers.get(message.transferId);
          if (activeTx) {
            console.warn(`Peer requested retransmission of ${message.missingIndices.length} missing chunks for transfer ${message.transferId}`);
            
            // Network performance indicator: Packet loss detected!
            // Adjust audio block sizes downwards to stabilize transport
            activeTx.currentChunkSize = Math.max(4096, Math.floor(activeTx.currentChunkSize * 0.75));

            for (const idx of message.missingIndices) {
              const chunkInfo = activeTx.sentChunks.get(idx);
              if (chunkInfo) {
                const chunkBuffer = activeTx.arrayBuffer.slice(chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
                const base64 = btoa(
                  new Uint8Array(chunkBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );

                channel.send(JSON.stringify({
                  type: 'transfer_chunk',
                  transferId: message.transferId,
                  chunkIndex: idx,
                  offset: chunkInfo.offset,
                  data: base64,
                  isRetransmit: true
                }));
              }
            }
            // Notify receiver that missing pack retransmission loop is complete
            channel.send(JSON.stringify({
              type: 'transfer_complete',
              transferId: message.transferId,
              messageId: activeTx.messageId,
              totalChunksCount: activeTx.sentChunks.size
            }));
          }
        } else if (message.type === 'transfer_acknowledged') {
          console.log(`Transfer ${message.transferId} fully received and acknowledged by peer! Cleaning up memory.`);
          this.activeOutgoingTransfers.delete(message.transferId);
        }

        // 2. Handle Receiver side messages
        else if (message.type === 'transfer_start') {
          console.log(`Starting incoming audio transfer:`, message);
          this.activeIncomingTransfers.set(message.transferId, {
            mimeType: message.mimeType || 'audio/webm',
            totalBytes: message.totalBytes,
            messageId: message.messageId,
            chunks: new Map(),
            receivedIndices: new Set(),
            lastChunkReceivedAt: Date.now()
          });

          // Pre-clear any stale chunks in IndexedDB for this transfer ID
          try {
            const { voiceNoteCache } = await import('./voiceNoteCache');
            const { audioStorageService } = await import('./audioStorageService');
            await voiceNoteCache.clearChunks(message.transferId);
            await audioStorageService.clearChunks(message.transferId);
          } catch (err) {
            console.warn("Failed to pre-clear IndexedDB chunks:", err);
          }
        } else if (message.type === 'transfer_chunk') {
          const transfer = this.activeIncomingTransfers.get(message.transferId);
          if (transfer) {
            transfer.chunks.set(message.chunkIndex, { offset: message.offset, data: message.data });
            transfer.receivedIndices.add(message.chunkIndex);
            transfer.lastChunkReceivedAt = Date.now();

            // Robust reassembly: Store chunk inside IndexedDB to ensure we survive intermittent disconnects
            try {
              const { voiceNoteCache } = await import('./voiceNoteCache');
              const { audioStorageService } = await import('./audioStorageService');
              await voiceNoteCache.saveChunk(message.transferId, message.chunkIndex, message.offset, message.data);
              await audioStorageService.saveChunk(message.transferId, message.chunkIndex, message.offset, message.data);
            } catch (err) {
              console.warn("IndexedDB chunk storage failed, using memory buffer fallback:", err);
            }

            // ACK the received chunk immediately
            channel.send(JSON.stringify({
              type: 'transfer_chunk_ack',
              transferId: message.transferId,
              chunkIndex: message.chunkIndex,
              receivedAt: Date.now()
            }));

            // Compute approximate progress
            let bytesReceived = 0;
            transfer.chunks.forEach(c => {
              const decodedLength = Math.floor(c.data.length * 0.75);
              bytesReceived += decodedLength;
            });
            const progress = Math.min(100, Math.round((bytesReceived / transfer.totalBytes) * 100));

            // Notify UI with dynamic chunk progress and speed indicators
            window.dispatchEvent(new CustomEvent('webrtc_transfer_progress', {
              detail: {
                transferId: message.transferId,
                messageId: transfer.messageId,
                progress,
                chunkIndex: message.chunkIndex,
                isRetransmit: !!message.isRetransmit
              }
            }));
          }
        } else if (message.type === 'transfer_complete') {
          const transfer = this.activeIncomingTransfers.get(message.transferId);
          if (transfer) {
            transfer.expectedChunksCount = message.totalChunksCount;

            // Integrity check: look for missing packets
            const missingIndices: number[] = [];
            for (let i = 0; i < message.totalChunksCount; i++) {
              if (!transfer.receivedIndices.has(i)) {
                missingIndices.push(i);
              }
            }

            if (missingIndices.length > 0) {
              console.warn(`Incoming transfer ${message.transferId} is missing ${missingIndices.length} chunks! Requesting retransmission...`, missingIndices);
              channel.send(JSON.stringify({
                type: 'transfer_request_missing',
                transferId: message.transferId,
                missingIndices
              }));
            } else {
              console.log(`All ${message.totalChunksCount} chunks received successfully for ${message.transferId}! Reassembling from IndexedDB...`);

              try {
                const { voiceNoteCache } = await import('./voiceNoteCache');
                const { audioStorageService } = await import('./audioStorageService');
                
                // Fetch and sort chunks from IndexedDB Browser Storage manager
                let dbChunks = await audioStorageService.getChunks(message.transferId);

                if (!dbChunks || dbChunks.length < message.totalChunksCount) {
                  console.warn("audioStorageService missing chunks, falling back to voiceNoteCache");
                  dbChunks = await voiceNoteCache.getChunks(message.transferId);
                }

                if (!dbChunks || dbChunks.length < message.totalChunksCount) {
                  console.warn("IndexedDB missing chunks, falling back to memory chunks list");
                  dbChunks = [];
                  for (let i = 0; i < message.totalChunksCount; i++) {
                    const c = transfer.chunks.get(i);
                    if (c) {
                      dbChunks.push({
                        chunkIndex: i,
                        offset: c.offset,
                        data: c.data
                      });
                    }
                  }
                }

                // Explicit sorting to ensure proper order during reassembly
                dbChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

                const chunkArray = dbChunks.map(c => c.data);

                // Decode Base64 to Blobs
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

                // Cache immediately in browser storage (IndexedDB)
                const cacheKey = transfer.messageId || message.transferId;
                await voiceNoteCache.set(cacheKey, audioBlob);
                console.log(`Saved voice note to IndexedDB cache successfully: ${cacheKey}`);

                // Clean up transient chunks from DB
                await voiceNoteCache.clearChunks(message.transferId);
                await audioStorageService.clearChunks(message.transferId);

                // Send fully acknowledged status to sender
                channel.send(JSON.stringify({
                  type: 'transfer_acknowledged',
                  transferId: message.transferId
                }));

                // Dispatch success event to let ChatDetail display the new audio message
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

                this.activeIncomingTransfers.delete(message.transferId);
              } catch (reassembleErr) {
                console.error("Failed to reassemble received voice note chunks:", reassembleErr);
              }
            }
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
    if (!this.isIceServersFetched) {
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
    const reader = new FileReader();

    return new Promise<boolean>((resolve) => {
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          resolve(false);
          return;
        }

        const totalBytes = arrayBuffer.byteLength;
        let sentBytes = 0;
        let chunkIndex = 0;

        const sentChunks = new Map<number, { offset: number, size: number }>();
        const sentTimes = new Map<number, number>();

        // Register outgoing transfer so that ACK and retransmit requests can be handled
        this.activeOutgoingTransfers.set(transferId, {
          arrayBuffer,
          mimeType,
          messageId,
          sentChunks,
          sentTimes,
          currentChunkSize: 16384, // start with 16KB default
          rtts: []
        });

        console.log(`Sending audio over data channel to ${peerId}. Size: ${totalBytes} bytes. Transfer ID: ${transferId}`);

        try {
          // 1. Send transfer_start
          channel.send(JSON.stringify({
            type: 'transfer_start',
            transferId,
            mimeType,
            messageId,
            totalBytes
          }));

          // 2. Adaptive chunk-by-chunk sender loop
          while (sentBytes < totalBytes) {
            if (channel.readyState !== 'open') {
              throw new Error("Data channel closed mid-transfer");
            }

            // RTCDataChannel Congestion Avoidance: pause if buffer exceeds 512KB
            if (channel.bufferedAmount > 512 * 1024) {
              await new Promise(r => {
                const interval = setInterval(() => {
                  if (channel.bufferedAmount < 64 * 1024 || channel.readyState !== 'open') {
                    clearInterval(interval);
                    r(null);
                  }
                }, 10);
              });
            }

            const activeTx = this.activeOutgoingTransfers.get(transferId);
            if (!activeTx) break; // Transfer canceled

            // Monitor RTCDataChannel performance using getStats and bufferedAmount to dynamically adjust chunk sizes
            const peerStats = await this.getPeerStats(peerId);
            if (peerStats.rtt !== undefined) {
              activeTx.rtts.push(peerStats.rtt);
              if (activeTx.rtts.length > 20) activeTx.rtts.shift();
            }

            const currentRtt = peerStats.rtt || (activeTx.rtts.length > 0 ? activeTx.rtts.reduce((a, b) => a + b, 0) / activeTx.rtts.length : 50);
            const buffered = channel.bufferedAmount;
            const isHighLatency = currentRtt > 150;
            const isCongested = buffered > 128 * 1024; // 128KB buffer backlog

            if (isHighLatency || isCongested) {
              // Dynamically shrink audio packet size during high latency or congestion periods
              activeTx.currentChunkSize = Math.max(4096, activeTx.currentChunkSize - 4096);
              console.log(`[QoS Adaptive Sizing] Network degraded. Shrinking packet size to ${activeTx.currentChunkSize} bytes. RTT: ${currentRtt.toFixed(1)}ms, Buffered: ${buffered} bytes`);
            } else if (currentRtt < 80 && buffered < 32 * 1024) {
              // Enlarge packets during stable, low-latency, uncongested network conditions to maximize throughput
              activeTx.currentChunkSize = Math.min(65536, activeTx.currentChunkSize + 4096);
            }

            const size = activeTx.currentChunkSize;
            const start = sentBytes;
            const end = Math.min(start + size, totalBytes);
            const actualSize = end - start;

            const chunkBuffer = arrayBuffer.slice(start, end);
            const base64 = btoa(
              new Uint8Array(chunkBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            sentChunks.set(chunkIndex, { offset: start, size: actualSize });
            sentTimes.set(chunkIndex, performance.now());

            channel.send(JSON.stringify({
              type: 'transfer_chunk',
              transferId,
              chunkIndex,
              offset: start,
              data: base64
            }));

            // Dispatch sender progress event to UI
            const progress = Math.min(100, Math.round((end / totalBytes) * 100));
            window.dispatchEvent(new CustomEvent('webrtc_transfer_progress', {
              detail: {
                transferId,
                messageId,
                progress,
                chunkIndex,
                isSender: true,
                chunkSize: actualSize
              }
            }));

            sentBytes = end;

            // Adaptive network delay pacing based on round-trip time (RTT)
            const averageRtt = activeTx.rtts.length > 0
              ? activeTx.rtts.reduce((a, b) => a + b, 0) / activeTx.rtts.length
              : 50;
            const waitTime = Math.max(5, Math.min(100, averageRtt * 0.15));
            await new Promise(r => setTimeout(r, waitTime));

            chunkIndex++;
          }

          // 3. Send transfer_complete
          const totalChunksCount = chunkIndex;
          channel.send(JSON.stringify({
            type: 'transfer_complete',
            transferId,
            messageId,
            totalChunksCount
          }));

          console.log(`All audio chunks transmitted for ${transferId}. Awaiting receiver verification.`);

          // Retain outgoing buffer for 30s so the receiver can request missed packets
          setTimeout(() => {
            this.activeOutgoingTransfers.delete(transferId);
          }, 30000);

          resolve(true);
        } catch (err) {
          console.error("Data channel sendAudioChunks error:", err);
          this.activeOutgoingTransfers.delete(transferId);
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
    this.pendingCandidates.delete(peerId);
  }

  private async getPeerStats(peerId: string): Promise<{ rtt?: number, packetLoss?: number, jitter?: number }> {
    const pc = this.pcs.get(peerId);
    if (!pc) return {};
    try {
      const stats = await pc.getStats();
      let rtt: number | undefined;
      let packetLoss: number | undefined;
      let jitter: number | undefined;
      
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.currentRoundTripTime === 'number') {
            rtt = report.currentRoundTripTime * 1000; // convert to ms
          }
        }
        if (report.type === 'inbound-rtp' || report.type === 'remote-inbound-rtp') {
          if (typeof report.packetsLost === 'number') {
            packetLoss = report.packetsLost;
          }
          if (typeof report.jitter === 'number') {
            jitter = report.jitter * 1000; // convert to ms
          }
        }
      });
      return { rtt, packetLoss, jitter };
    } catch (e) {
      console.warn("Failed to get RTC stats for peer:", peerId, e);
      return {};
    }
  }

  private async applyPendingIceCandidates(peerId: string, pc: RTCPeerConnection) {
    const candidates = this.pendingCandidates.get(peerId);
    if (candidates && candidates.length > 0) {
      console.log(`Applying ${candidates.length} queued ICE candidates for peer ${peerId}`);
      this.pendingCandidates.delete(peerId);
      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn(`Failed to add queued ICE candidate for peer ${peerId}:`, err);
        }
      }
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

        // ALWAYS ensure that we create the DataChannel on the SDP offer creator side
        if (roomId.startsWith('chat-webrtc-') && !this.dataChannels.has(peerId)) {
          console.log(`Creating RTCDataChannel "audio_transfer" for peer ${peerId} (SDP Offer Initiator)`);
          const dc = pc.createDataChannel("audio_transfer", { ordered: true });
          this.setupDataChannel(peerId, dc);
        }

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
          await this.applyPendingIceCandidates(from, pc);
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
            await this.applyPendingIceCandidates(from, pc);
          } catch (err) {
            console.error(`Failed to set remote description from peer ${from}:`, err);
          }
        }
      }
    } else if (signal.type === 'ice_candidate') {
      if (signal.to === myId) {
        const pc = this.pcs.get(from);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.error(`Failed to add ICE candidate from peer ${from}:`, err);
          }
        } else {
          // Queue the candidate until setRemoteDescription completes
          console.log(`Queueing ICE candidate from peer ${from} (no remoteDescription yet)`);
          if (!this.pendingCandidates.has(from)) {
            this.pendingCandidates.set(from, []);
          }
          this.pendingCandidates.get(from)!.push(signal.candidate);
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
    this.pendingCandidates.clear();
  }
}

export const webrtcService = new WebRTCService();

