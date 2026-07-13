import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';
import { CallError, CallErrorDetails } from '../types';

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
  
  private pendingSignals: { from: string; signal: any; roomId: string }[] = [];
  private statsIntervals: Map<string, any> = new Map();
  
  // Call diagnostics fields
  private signalingTimeouts: Map<string, any> = new Map();
  private trackReceived: Map<string, boolean> = new Map();
  private candidatesGathered: Map<string, number> = new Map();

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

    console.log(`[Diagnostic] Local stream published. Marking WebRTC signaling ready for room ${roomId}`);
    

    // Process any queued signals that arrived prior to stream publishing
    const signalsToProcess = [...this.pendingSignals];
    this.pendingSignals = [];
    for (const item of signalsToProcess) {
      console.log(`[Diagnostic] Processing queued signal from ${item.from}: ${item.signal.type}`);
      await this.handleSignal(item.from, item.signal, item.roomId);
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

  public dispatchCallError(code: CallError, peerId?: string) {
    const errorDetail = CallErrorDetails[code];
    console.error(`[WebRTCError][${code}] Peer: ${peerId || 'unknown'}. Message: ${errorDetail.message} (${errorDetail.technicalDescription})`);
    window.dispatchEvent(new CustomEvent('webrtc_call_error', {
      detail: {
        ...errorDetail,
        peerId
      }
    }));
  }

  private getMapKey(peerId: string, roomId: string): string {
    return `${roomId}_${peerId}`;
  }

  private createPeerConnection(peerId: string, roomId: string): RTCPeerConnection {
    const mapKey = this.getMapKey(peerId, roomId);
    if (this.pcs.has(mapKey)) {
      return this.pcs.get(mapKey)!;
    }

    console.log(`[Diagnostic] Creating RTCPeerConnection for peer ${peerId} (room ${roomId}) using ICE servers:`, this.iceServers);
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle'
    });

    this.pcs.set(mapKey, pc);
    this.candidatesGathered.set(mapKey, 0);
    this.trackReceived.set(mapKey, false);

    // Setup 15-second signaling timeout
    const signalingTimeoutId = setTimeout(() => {
      const currentPc = this.pcs.get(mapKey);
      if (currentPc && currentPc.iceConnectionState !== 'connected') {
        console.warn(`[Diagnostic] Signaling timeout reached for peer ${peerId} (room ${roomId})`);
        this.dispatchCallError(CallError.SIGNALING_TIMEOUT, peerId);
        this.removePeer(peerId, roomId);
      }
    }, 15000);
    this.signalingTimeouts.set(mapKey, signalingTimeoutId);

    // Track all WebRTC state changes meticulously (Step 0 logs with precise timestamping)
    pc.oniceconnectionstatechange = () => {
      const ts = new Date().toISOString();
      console.log(`[Diagnostic][${ts}] Peer ${peerId} (room ${roomId}) iceConnectionState: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'connected') {
        console.log(`[Diagnostic][${ts}] Peer ${peerId} (room ${roomId}) ICE Connected! Initiating active track stats monitoring (Step 0/Step 2).`);
        
        // Clear signaling timeout upon success
        const timeoutId = this.signalingTimeouts.get(mapKey);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.signalingTimeouts.delete(mapKey);
        }

        this.startStatsMonitoring(peerId, roomId);

        // CONNECTED_NO_MEDIA check: 5-second grace period then confirm non-zero audio bytes flowing
        setTimeout(async () => {
          const currentPc = this.pcs.get(mapKey);
          if (currentPc && currentPc.iceConnectionState === 'connected') {
            try {
              const stats = await currentPc.getStats();
              let audioBytesSent = 0;
              let audioBytesReceived = 0;
              stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                  audioBytesReceived = report.bytesReceived || 0;
                }
                if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                  audioBytesSent = report.bytesSent || 0;
                }
              });
              console.log(`[Diagnostic] 5-second media flow check for peer ${peerId} (room ${roomId}): Sent=${audioBytesSent}, Received=${audioBytesReceived}`);
              if (audioBytesSent === 0 && audioBytesReceived === 0) {
                console.warn(`[Diagnostic] Connected but silent! 0 media bytes flow detected.`);
                this.dispatchCallError(CallError.CONNECTED_NO_MEDIA, peerId);
              }
            } catch (e) {
              console.error('[Diagnostic] Error during 5-second stats check:', e);
            }
          }
        }, 5000);

        // TRACK_NOT_RECEIVED check: Confirm track received within 8 seconds of connection
        setTimeout(() => {
          const currentPc = this.pcs.get(mapKey);
          if (currentPc && currentPc.iceConnectionState === 'connected' && !this.trackReceived.get(mapKey)) {
            console.warn(`[Diagnostic] Connected but no track received for peer ${peerId} (room ${roomId}) within 8s`);
            this.dispatchCallError(CallError.TRACK_NOT_RECEIVED, peerId);
          }
        }, 8000);
      }

      if (pc.iceConnectionState === 'failed') {
        const timeoutId = this.signalingTimeouts.get(mapKey);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.signalingTimeouts.delete(mapKey);
        }

        this.dispatchCallError(CallError.CONNECTION_FAILED, peerId);
        window.dispatchEvent(new CustomEvent('webrtc_connection_failed', {
          detail: { peerId }
        }));
        
        // Step 4: ICE Restart recovery
        this.handleIceFailure(peerId, roomId);
      }

      if (pc.iceConnectionState === 'disconnected') {
        console.warn(`[Diagnostic][${ts}] Peer ${peerId} (room ${roomId}) iceConnectionState is disconnected. Waiting 5 seconds for WebRTC auto-recovery...`);
        this.dispatchCallError(CallError.CONNECTION_DISCONNECTED, peerId);
        setTimeout(() => {
          const currentPc = this.pcs.get(mapKey);
          if (currentPc && (currentPc.iceConnectionState === 'disconnected' || currentPc.iceConnectionState === 'failed')) {
            console.warn(`[Diagnostic] WebRTC auto-recovery timed out for peer ${peerId} (room ${roomId}). Cleaning up connection.`);
            this.dispatchCallError(CallError.CONNECTION_FAILED, peerId);
            this.removePeer(peerId, roomId);
          }
        }, 5000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Diagnostic][${new Date().toISOString()}] Peer ${peerId} (room ${roomId}) connectionState: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        this.dispatchCallError(CallError.CONNECTION_FAILED, peerId);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log(`[Diagnostic][${new Date().toISOString()}] Peer ${peerId} (room ${roomId}) signalingState: ${pc.signalingState}`);
    };

    pc.onicegatheringstatechange = () => {
      const state = pc.iceGatheringState;
      console.log(`[Diagnostic][${new Date().toISOString()}] Peer ${peerId} (room ${roomId}) iceGatheringState: ${state}`);
      if (state === 'complete' && (this.candidatesGathered.get(mapKey) || 0) === 0) {
        console.warn(`[Diagnostic] ICE gathering completed with 0 candidates for peer ${peerId} (room ${roomId})`);
        this.dispatchCallError(CallError.ICE_GATHERING_FAILED, peerId);
      }
    };

    // Setup DataChannel for Chat (if we are the deterministic initiator)
    const myId = useAppStore.getState().user?.id;
    const isInitiator = myId && peerId && myId < peerId;
    if (roomId.startsWith('chat-webrtc-') && isInitiator) {
      console.log(`Creating RTCDataChannel "audio_transfer" for peer ${peerId} (initiator: true, room ${roomId})`);
      const dc = pc.createDataChannel("audio_transfer", { ordered: true });
      this.setupDataChannel(peerId, roomId, dc);
    }

    pc.ondatachannel = (event) => {
      console.log(`Received remote data channel from peer ${peerId} in room ${roomId}:`, event.channel.label);
      this.setupDataChannel(peerId, roomId, event.channel);
    };

    // Handle ICE candidates and transmit them via Socket.io
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.candidatesGathered.set(mapKey, (this.candidatesGathered.get(mapKey) || 0) + 1);
        // Step 1 point 5: Confirm candidates are sent ONLY after setLocalDescription has been called
        if (pc.localDescription) {
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
      }
    };

    // Handle remote stream tracks being added
    pc.ontrack = (event) => {
      this.trackReceived.set(mapKey, true);
      const stream = event.streams[0];
      const track = event.track;
      const ts = new Date().toISOString();
      console.log(`[Diagnostic][${ts}] ontrack event fired! Track kind: "${track?.kind}", ID: "${track?.id}", readyState: "${track?.readyState}" (room ${roomId})`);
      if (stream) {
        console.log(`[Diagnostic][${ts}] Successfully received remote stream from peer ${peerId} (room ${roomId}), track count: ${stream.getTracks().length}`);
        // Dispatch custom event to notify GroupCall component
        window.dispatchEvent(new CustomEvent('webrtc_stream', {
          detail: { from: peerId, stream }
        }));
      }
    };

    return pc;
  }

  private setupDataChannel(peerId: string, roomId: string, channel: RTCDataChannel) {
    const mapKey = this.getMapKey(peerId, roomId);
    this.dataChannels.set(mapKey, channel);

    channel.onopen = () => {
      console.log(`Data channel with peer ${peerId} (room ${roomId}) is OPEN`);
    };

    channel.onclose = () => {
      console.log(`Data channel with peer ${peerId} (room ${roomId}) is CLOSED`);
      this.dataChannels.delete(mapKey);
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
    this.removePeer(peerId, roomId);
    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
    }
  }

  async sendAudioChunks(peerId: string, blob: Blob, mimeType: string, messageId?: string): Promise<boolean> {
    const myId = useAppStore.getState().user?.id;
    const sortedIds = [myId, peerId].sort();
    const roomId = `chat-webrtc-${sortedIds[0]}-${sortedIds[1]}`;
    const mapKey = this.getMapKey(peerId, roomId);
    const channel = this.dataChannels.get(mapKey);
    if (!channel || channel.readyState !== 'open') {
      console.warn(`Data channel with peer ${peerId} (mapKey ${mapKey}) is not open or available.`);
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

        console.log(`Sending audio over data channel to ${peerId} (room ${roomId}). Size: ${totalBytes} bytes. Transfer ID: ${transferId}`);

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
            const peerStats = await this.getPeerStats(peerId, roomId);
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

  private attachLocalTracks(pc: RTCPeerConnection) {
    if (this.localStream) {
      const currentSenders = pc.getSenders();
      this.localStream.getTracks().forEach(track => {
        // Step 0 & 1: Confirm state of local track before adding
        console.log(`[Diagnostic] Checking local track state: kind=${track.kind}, ID=${track.id}, readyState=${track.readyState}, enabled=${track.enabled}`);
        const exists = currentSenders.some(sender => sender.track === track);
        if (!exists) {
          console.log(`[Diagnostic] Attaching local track "${track.kind}" to peer connection`);
          pc.addTrack(track, this.localStream!);
        } else {
          console.log(`[Diagnostic] Local track "${track.kind}" is already attached to this peer connection`);
        }
      });
    } else {
      console.warn(`[Diagnostic] Failed to attach local tracks — localStream is null!`);
    }
  }

  private async handleIceFailure(peerId: string, roomId: string) {
    const mapKey = this.getMapKey(peerId, roomId);
    const pc = this.pcs.get(mapKey);
    if (!pc) return;

    console.warn(`[Diagnostic] ICE Connection Failed with peer ${peerId} (room ${roomId}). Initiating WhatsApp-grade ICE restart sequence (Step 4).`);
    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      } else {
        console.log(`[Diagnostic] restartIce() is not supported, proceeding with renegotiation...`);
      }

      this.attachLocalTracks(pc);

      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      const socket = useAppStore.getState().socket;
      if (socket) {
        socket.emit('sfu_signal', {
          roomId,
          from: useAppStore.getState().user?.id,
          signal: {
            type: 'offer',
            sdp: offer.sdp,
            to: peerId,
            isIceRestart: true
          }
        });
      }
      console.log(`[Diagnostic] Sent ICE Restart offer to peer ${peerId} (room ${roomId})`);
    } catch (err) {
      console.error(`[Diagnostic] ICE Restart request failed for peer ${peerId} (room ${roomId}):`, err);
      this.removePeer(peerId, roomId);
    }
  }

  private startStatsMonitoring(peerId: string, roomId: string) {
    const mapKey = this.getMapKey(peerId, roomId);
    if (this.statsIntervals.has(mapKey)) {
      clearInterval(this.statsIntervals.get(mapKey));
    }

    let lastBytesSent = 0;
    let lastBytesReceived = 0;

    const intervalId = setInterval(async () => {
      const pc = this.pcs.get(mapKey);
      if (!pc || pc.iceConnectionState !== 'connected') {
        console.log(`[StatsMonitor] Connection not active, stopping stats query for peer ${peerId} (room ${roomId})`);
        clearInterval(intervalId);
        this.statsIntervals.delete(mapKey);
        return;
      }

      try {
        const stats = await pc.getStats();
        let activeCandidatePair: any = null;
        let audioBytesSent = 0;
        let audioBytesReceived = 0;

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
            activeCandidatePair = report;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            audioBytesReceived = report.bytesReceived || 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            audioBytesSent = report.bytesSent || 0;
          }
        });

        let candidatePairStr = 'unknown';
        if (activeCandidatePair) {
          const localCandidate = stats.get(activeCandidatePair.localCandidateId);
          const remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
          candidatePairStr = `Local: ${localCandidate?.candidateType || 'unknown'} (${localCandidate?.protocol || 'udp'}), Remote: ${remoteCandidate?.candidateType || 'unknown'} (${remoteCandidate?.protocol || 'udp'})`;
        }

        const sentDelta = audioBytesSent - lastBytesSent;
        const receivedDelta = audioBytesReceived - lastBytesReceived;

        console.log(`[Diagnostic][StatsMonitor][${new Date().toISOString()}] Peer ${peerId} (room ${roomId}):
          - Candidate Pair Type: ${candidatePairStr}
          - Total Audio Bytes Sent: ${audioBytesSent} (Delta: +${sentDelta} bytes)
          - Total Audio Bytes Received: ${audioBytesReceived} (Delta: +${receivedDelta} bytes)
          - Audio Flow Status: ${sentDelta > 0 || receivedDelta > 0 ? "LIVE AUDIO TRANSMITTING ✅" : "STALLED / SILENT ⚠️"}
        `);

        // Dispatch an event so the UI can display real-time metrics
        window.dispatchEvent(new CustomEvent('webrtc_call_stats', {
          detail: {
            peerId,
            audioBytesSent,
            audioBytesReceived,
            sentDelta,
            receivedDelta,
            candidatePairStr,
            isFlowing: sentDelta > 0 || receivedDelta > 0
          }
        }));

        lastBytesSent = audioBytesSent;
        lastBytesReceived = audioBytesReceived;
      } catch (err) {
        console.warn(`[StatsMonitor] Failed to query stats:`, err);
      }
    }, 5000);

    this.statsIntervals.set(mapKey, intervalId);
  }

  private removePeer(peerId: string, roomId: string) {
    const mapKey = this.getMapKey(peerId, roomId);
    const pc = this.pcs.get(mapKey);
    if (pc) {
      console.log(`Cleaning up connection for peer ${peerId} (room ${roomId})`);
      pc.close();
      this.pcs.delete(mapKey);
    }
    const dc = this.dataChannels.get(mapKey);
    if (dc) {
      dc.close();
      this.dataChannels.delete(mapKey);
    }
    this.pendingCandidates.delete(mapKey);

    if (this.statsIntervals.has(mapKey)) {
      clearInterval(this.statsIntervals.get(mapKey));
      this.statsIntervals.delete(mapKey);
    }
  }

  private async getPeerStats(peerId: string, roomId: string): Promise<{ rtt?: number, packetLoss?: number, jitter?: number }> {
    const mapKey = this.getMapKey(peerId, roomId);
    const pc = this.pcs.get(mapKey);
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

  private async applyPendingIceCandidates(peerId: string, roomId: string, pc: RTCPeerConnection) {
    const mapKey = this.getMapKey(peerId, roomId);
    const candidates = this.pendingCandidates.get(mapKey);
    if (candidates && candidates.length > 0) {
      console.log(`Applying ${candidates.length} queued ICE candidates for peer ${peerId} (room ${roomId})`);
      this.pendingCandidates.delete(mapKey);
      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn(`Failed to add queued ICE candidate for peer ${peerId} (room ${roomId}):`, err);
        }
      }
    }
  }

  async handleSignal(from: string, signal: any, roomId: string) {
    const myId = useAppStore.getState().user?.id;
    if (from === myId) return; // Skip our own signals

    // Queue incoming signals that trigger createPeerConnection until our local media is ready.
    // (Applies only to A/V calls, not data-channel chat rooms where localStream is intentionally null)
    if (!this.localStream && !roomId.startsWith('chat-webrtc-')) {
      console.log(`[Diagnostic] Local media not ready yet. Queueing signal from ${from}: ${signal.type}`);
      this.pendingSignals.push({ from, signal, roomId });
      return;
    }

    if (signal.type === 'peer_joined') {
      const peerId = signal.peerId;
      if (peerId && peerId !== myId) {
        console.log(`[Diagnostic] Peer ${peerId} joined. Creating Peer Connection for room ${roomId}.`);
        const pc = this.createPeerConnection(peerId, roomId);

        // Step 1 point 3: Add all local tracks BEFORE calling createOffer
        this.attachLocalTracks(pc);

        // ALWAYS ensure that we create the DataChannel on the SDP offer creator side
        if (roomId.startsWith('chat-webrtc-') && !this.dataChannels.has(this.getMapKey(peerId, roomId))) {
          console.log(`Creating RTCDataChannel "audio_transfer" for peer ${peerId} (SDP Offer Initiator, room ${roomId})`);
          const dc = pc.createDataChannel("audio_transfer", { ordered: true });
          this.setupDataChannel(peerId, roomId, dc);
        }

        try {
          console.log(`[Diagnostic] Creating Offer for peer ${peerId} (room ${roomId})`);
          const offer = await pc.createOffer();
          console.log(`[Diagnostic] Setting Local Description (Offer) for peer ${peerId} (room ${roomId})`);
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
          console.error(`Failed to create/send offer to peer ${peerId} (room ${roomId}):`, err);
          this.dispatchCallError(CallError.RENEGOTIATION_FAILED, peerId);
        }
      }
    } else if (signal.type === 'offer') {
      if (signal.to === myId) {
        console.log(`[Diagnostic] Received offer from peer ${from} for room ${roomId}. Setting Remote Description FIRST (Step 1 point 6).`);
        const pc = this.createPeerConnection(from, roomId);

        try {
          // Set remote description FIRST
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          
          // Apply any pending ICE candidates that arrived before SDP remote description was set (Step 1 point 7)
          await this.applyPendingIceCandidates(from, roomId, pc);

          // THEN attach local tracks to the connection
          console.log(`[Diagnostic] Attaching local tracks for answering connection to ${from} (room ${roomId})`);
          this.attachLocalTracks(pc);

          // THEN create and set the answer
          console.log(`[Diagnostic] Creating Answer for peer ${from} (room ${roomId})`);
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
          console.error(`Failed to handle offer from peer ${from} (room ${roomId}):`, err);
          this.dispatchCallError(CallError.RENEGOTIATION_FAILED, from);
        }
      }
    } else if (signal.type === 'answer') {
      if (signal.to === myId) {
        console.log(`[Diagnostic] Received answer from peer ${from} for room ${roomId}`);
        const mapKey = this.getMapKey(from, roomId);
        const pc = this.pcs.get(mapKey);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            await this.applyPendingIceCandidates(from, roomId, pc);
          } catch (err) {
            console.error(`Failed to set remote description from peer ${from} (room ${roomId}):`, err);
            this.dispatchCallError(CallError.RENEGOTIATION_FAILED, from);
          }
        }
      }
    } else if (signal.type === 'ice_candidate') {
      if (signal.to === myId) {
        const mapKey = this.getMapKey(from, roomId);
        const pc = this.pcs.get(mapKey);
        // Step 1 point 7: Queue candidate if remote description is not set yet
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.error(`Failed to add ICE candidate from peer ${from} (room ${roomId}):`, err);
          }
        } else {
          console.log(`[Diagnostic] Queueing ICE candidate from peer ${from} (room ${roomId}) (no remote description set yet)`);
          if (!this.pendingCandidates.has(mapKey)) {
            this.pendingCandidates.set(mapKey, []);
          }
          this.pendingCandidates.get(mapKey)!.push(signal.candidate);
        }
      }
    } else if (signal.type === 'request_tracks') {
      if (this.localStream) {
        console.log(`Received track request for room ${roomId}. Re-broadcasting peer presence...`);
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

  closeSession(roomId?: string) {
    if (roomId) {
      console.log(`Closing WebRTC session for room: ${roomId}`);
      this.pcs.forEach((pc, key) => {
        if (key.startsWith(`${roomId}_`)) {
          pc.close();
          this.pcs.delete(key);
        }
      });
      this.dataChannels.forEach((dc, key) => {
        if (key.startsWith(`${roomId}_`)) {
          dc.close();
          this.dataChannels.delete(key);
        }
      });
      this.signalingTimeouts.forEach((timeoutId, key) => {
        if (key.startsWith(`${roomId}_`)) {
          clearTimeout(timeoutId);
          this.signalingTimeouts.delete(key);
        }
      });
      this.statsIntervals.forEach((intervalId, key) => {
        if (key.startsWith(`${roomId}_`)) {
          clearInterval(intervalId);
          this.statsIntervals.delete(key);
        }
      });
      // Clear pending candidates, trackReceived, candidatesGathered
      this.pendingCandidates.forEach((_, key) => {
        if (key.startsWith(`${roomId}_`)) {
          this.pendingCandidates.delete(key);
        }
      });
      this.trackReceived.forEach((_, key) => {
        if (key.startsWith(`${roomId}_`)) {
          this.trackReceived.delete(key);
        }
      });
      this.candidatesGathered.forEach((_, key) => {
        if (key.startsWith(`${roomId}_`)) {
          this.candidatesGathered.delete(key);
        }
      });

      if (this.currentRoomId === roomId) {
        this.currentRoomId = null;
      }
    } else {
      console.log("Closing WebRTC session, cleaning up all peer connections.");
      this.pcs.forEach((pc, key) => {
        pc.close();
      });
      this.pcs.clear();
      
      this.dataChannels.forEach((dc, key) => {
        dc.close();
      });
      this.dataChannels.clear();

      this.signalingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      this.signalingTimeouts.clear();
      this.trackReceived.clear();
      this.candidatesGathered.clear();

      this.localStream = null;
      this.currentRoomId = null;
      this.pendingCandidates.clear();
      
      this.pendingSignals = [];

      this.statsIntervals.forEach(interval => clearInterval(interval));
      this.statsIntervals.clear();
    }
  }
}

export const webrtcService = new WebRTCService();

