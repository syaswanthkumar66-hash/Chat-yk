import { createPrioritizedPeerConnection } from '../hooks/useWebRTCConnection';
import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';
import { CallError, CallErrorDetails } from '../types';
import { diagnosticLogger } from './diagnosticLogService';

export interface RemoteTrackInfo {
  sessionId: string;
  trackName: string;
  kind: 'audio' | 'video';
}

class WebRTCService {
  public async getIceServers(): Promise<any[]> {
    if (!this.isIceServersFetched) {
      await this.fetchIceConfig(2, 500);
    }
    return this.iceServers;
  }

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

    diagnosticLogger.log('media', 'local_media_ready', `Local MediaStream captured and published. Total audio tracks: ${stream.getAudioTracks().length}, video tracks: ${stream.getVideoTracks().length}`, undefined, roomId);

    // Attach local tracks to all existing peer connections for this room to ensure media flow
    for (const [mapKey, pc] of this.pcs.entries()) {
      if (mapKey.startsWith(`${roomId}_`)) {
        const peerId = mapKey.substring(roomId.length + 1);
        console.log(`[Diagnostic] Attaching newly published local stream tracks to existing peer connection for peer ${peerId}`);
        this.attachLocalTracks(pc);
        
        // If the peer connection is active and not closed, trigger renegotiation so the remote peer receives our audio/video tracks
        if (pc.signalingState !== 'closed') {
          try {
            console.log(`[Diagnostic] Renegotiating: creating and sending new SDP Offer to peer ${peerId} (room ${roomId})`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            const socket = useAppStore.getState().socket;
            if (socket) {
              socket.emit('sfu_signal', {
                roomId,
                from: useAppStore.getState().user?.id,
                signal: {
                  type: 'offer',
                  sdp: offer.sdp,
                  to: peerId
                }
              });
            }
          } catch (err: any) {
            console.warn(`[Diagnostic] Failed to renegotiate on new local stream publish for peer ${peerId}:`, err);
          }
        }
      }
    }

    // Fetch TURN server credentials quickly if we haven't already
    if (!this.isIceServersFetched) {
      await this.fetchIceConfig(2, 500);
    }

    diagnosticLogger.log('media', 'signaling_ready', `Marking WebRTC signaling ready for room ${roomId}`, undefined, roomId);

    // Process any queued signals that arrived prior to stream publishing
    const signalsToProcess = [...this.pendingSignals];
    this.pendingSignals = [];
    for (const item of signalsToProcess) {
      diagnosticLogger.log('signaling', 'process_queued_signal', `Processing queued signal of type '${item.signal.type}' from peer ${item.from}`, item.from, item.roomId);
      await this.handleSignal(item.from, item.signal, item.roomId);
    }

    diagnosticLogger.log('socket', 'emit_presence', `Broadcasting 'peer_joined' presence to room ${roomId}`, undefined, roomId);

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
    diagnosticLogger.log('error', `call_error_${code}`, `WebRTC Error: ${errorDetail.message} (${errorDetail.technicalDescription})`, peerId, this.currentRoomId || undefined, { code, errorDetail });
    
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

    diagnosticLogger.log('webrtc', 'create_peer_connection', `Initiating RTCPeerConnection creation for peer ${peerId}. ICE servers configured count: ${this.iceServers.length}`, peerId, roomId, { iceServers: this.iceServers });
    const pc = createPrioritizedPeerConnection(this.iceServers, peerId, roomId, (msg) => useAppStore.getState().addConnectionLog(msg));

    this.pcs.set(mapKey, pc);
    this.candidatesGathered.set(mapKey, 0);
    this.trackReceived.set(mapKey, false);

    // Setup 15-second signaling timeout
    const signalingTimeoutId = setTimeout(() => {
      const currentPc = this.pcs.get(mapKey);
      if (currentPc && currentPc.iceConnectionState !== 'connected') {
        diagnosticLogger.log('error', 'signaling_timeout', `Signaling timeout reached (15s) without successful connection`, peerId, roomId);
        this.dispatchCallError(CallError.SIGNALING_TIMEOUT, peerId);
        this.removePeer(peerId, roomId);
      }
    }, 15000);
    this.signalingTimeouts.set(mapKey, signalingTimeoutId);

    // Track all WebRTC state changes meticulously (Step 0 logs with precise timestamping)
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[Diagnostic][Step 3][${new Date().toISOString()}] ICE Connection State changed to: ${state} (peer: ${peerId}, room: ${roomId})`);
      diagnosticLogger.log('webrtc', 'ice_connection_state_changed', `ICE Connection State changed to: ${state}`, peerId, roomId, { state });
      
      if (state === 'connected') {
        diagnosticLogger.log('webrtc', 'ice_connected', `ICE Connection successfully established. Starting stats monitor & track audits.`, peerId, roomId);
        
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
              let audioBytesSent: number | undefined = undefined;
              let audioBytesReceived: number | undefined = undefined;
              let activeCandidatePair: any = null;

              stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                  audioBytesReceived = report.bytesReceived;
                }
                if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                  audioBytesSent = report.bytesSent;
                }
                if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                  activeCandidatePair = report;
                }
              });

              let localCandidateType = 'unknown';
              let remoteCandidateType = 'unknown';
              if (activeCandidatePair) {
                const localCandidate = stats.get(activeCandidatePair.localCandidateId);
                const remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
                localCandidateType = localCandidate?.candidateType || 'unknown';
                remoteCandidateType = remoteCandidate?.candidateType || 'unknown';
              }

              // Step 5: Exact diagnostic logging of bytes and active candidate types after 5s
              console.log(`[Diagnostic][Step 5][${new Date().toISOString()}] 5-second stats check after connected for peer ${peerId}:
                - bytesSent (outbound-rtp audio): ${audioBytesSent !== undefined ? audioBytesSent : 'NOT_FOUND'}
                - bytesReceived (inbound-rtp audio): ${audioBytesReceived !== undefined ? audioBytesReceived : 'NOT_FOUND'}
                - Active Candidate Pair details:
                  - Local candidate type: ${localCandidateType} (host/srflx/relay)
                  - Remote candidate type: ${remoteCandidateType} (host/srflx/relay)`);

              diagnosticLogger.log('media', 'media_flow_check', `5-second media flow check: Sent=${audioBytesSent || 0} bytes, Received=${audioBytesReceived || 0} bytes`, peerId, roomId, { audioBytesSent, audioBytesReceived });
              if ((audioBytesSent || 0) === 0 && (audioBytesReceived || 0) === 0) {
                diagnosticLogger.log('error', 'media_flow_stalled', `ICE is connected but media bytes flow is at 0 (stalled/silent)`, peerId, roomId);
                this.dispatchCallError(CallError.CONNECTED_NO_MEDIA, peerId);
              }
            } catch (e: any) {
              console.error(`[Diagnostic][Step 5] Failed to execute 5-second media stats check:`, e);
              diagnosticLogger.log('error', 'media_flow_check_failed', `Failed to execute 5-second media stats check: ${e.message}`, peerId, roomId);
            }
          }
        }, 5000);

        // TRACK_NOT_RECEIVED check: Confirm track received within 8 seconds of connection
        setTimeout(() => {
          const currentPc = this.pcs.get(mapKey);
          if (currentPc && currentPc.iceConnectionState === 'connected' && !this.trackReceived.get(mapKey)) {
            diagnosticLogger.log('error', 'track_not_received_timeout', `Connected but no remote track received within 8 seconds of ICE establishment`, peerId, roomId);
            this.dispatchCallError(CallError.TRACK_NOT_RECEIVED, peerId);
          }
        }, 8000);
      }

      if (state === 'failed') {
        const timeoutId = this.signalingTimeouts.get(mapKey);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.signalingTimeouts.delete(mapKey);
        }

        diagnosticLogger.log('error', 'ice_failed', `ICE Connection failed. Initiating ICE restart recovery.`, peerId, roomId);
        this.dispatchCallError(CallError.CONNECTION_FAILED, peerId);
        window.dispatchEvent(new CustomEvent('webrtc_connection_failed', {
          detail: { peerId }
        }));
        
        // Step 4: ICE Restart recovery
        this.handleIceFailure(peerId, roomId);
      }

      if (state === 'disconnected') {
        diagnosticLogger.log('error', 'ice_disconnected', `ICE Connection disconnected. Waiting 5 seconds for WebRTC auto-recovery/re-gathering...`, peerId, roomId);
        this.dispatchCallError(CallError.CONNECTION_DISCONNECTED, peerId);
        setTimeout(() => {
          const currentPc = this.pcs.get(mapKey);
          if (currentPc && (currentPc.iceConnectionState === 'disconnected' || currentPc.iceConnectionState === 'failed')) {
            diagnosticLogger.log('error', 'ice_recovery_timeout', `WebRTC auto-recovery timed out for peer. Connection lost permanently.`, peerId, roomId);
            this.dispatchCallError(CallError.CONNECTION_FAILED, peerId);
            this.removePeer(peerId, roomId);
          }
        }, 5000);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[Diagnostic][Step 3][${new Date().toISOString()}] PeerConnection Connection State changed to: ${state} (peer: ${peerId}, room: ${roomId})`);
      diagnosticLogger.log('webrtc', 'connection_state_changed', `PeerConnection State changed to: ${state}`, peerId, roomId, { state });
      if (state === 'failed') {
        diagnosticLogger.log('error', 'connection_failed', `PeerConnection reached Failed state`, peerId, roomId);
        this.dispatchCallError(CallError.CONNECTION_FAILED, peerId);
      }
    };

    pc.onsignalingstatechange = () => {
      const state = pc.signalingState;
      console.log(`[Diagnostic][Step 3][${new Date().toISOString()}] Signaling State changed to: ${state} (peer: ${peerId}, room: ${roomId})`);
      diagnosticLogger.log('webrtc', 'signaling_state_changed', `Signaling State changed to: ${state}`, peerId, roomId, { state });
    };

    pc.onicegatheringstatechange = () => {
      const state = pc.iceGatheringState;
      diagnosticLogger.log('webrtc', 'ice_gathering_state_changed', `ICE Gathering State changed to: ${state}`, peerId, roomId, { state });
      if (state === 'complete' && (this.candidatesGathered.get(mapKey) || 0) === 0) {
        diagnosticLogger.log('error', 'ice_gathering_completed_empty', `ICE gathering completed but 0 candidates were gathered! Connection unlikely to succeed.`, peerId, roomId);
        this.dispatchCallError(CallError.ICE_GATHERING_FAILED, peerId);
      }
    };

    // Setup DataChannel (if we are the deterministic initiator)
    const myId = useAppStore.getState().user?.id;
    const isInitiator = myId && peerId && myId < peerId;
    if (isInitiator) {
      diagnosticLogger.log('webrtc', 'create_datachannel', `Creating local RTCDataChannel 'audio_transfer' as initiator.`, peerId, roomId);
      const dc = pc.createDataChannel("audio_transfer", { ordered: true });
      this.setupDataChannel(peerId, roomId, dc);
    }

    pc.ondatachannel = (event) => {
      diagnosticLogger.log('webrtc', 'datachannel_received', `Received remote RTCDataChannel of label '${event.channel.label}'`, peerId, roomId, { label: event.channel.label });
      this.setupDataChannel(peerId, roomId, event.channel);
    };

    // Handle ICE candidates and transmit them via Socket.io
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const count = (this.candidatesGathered.get(mapKey) || 0) + 1;
        this.candidatesGathered.set(mapKey, count);
        
        diagnosticLogger.log('webrtc', 'ice_candidate_gathered', `#${count} Local ICE Candidate gathered: ${(event.candidate as any).type || (event.candidate as any).candidateType || 'unknown'} (${event.candidate.protocol || 'udp'})`, peerId, roomId, { candidate: event.candidate });

        // Step 1 point 5: Confirm candidates are sent ONLY after setLocalDescription has been called
        if (pc.localDescription) {
          const socket = useAppStore.getState().socket;
          if (socket) {
            diagnosticLogger.log('socket', 'send_ice_candidate', `Transmitting gathered ICE Candidate via socket to peer`, peerId, roomId);
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
        } else {
          diagnosticLogger.log('webrtc', 'ice_candidate_held', `ICE candidate held back - setLocalDescription not called yet`, peerId, roomId);
        }
      }
    };

    // Handle remote stream tracks being added
    pc.ontrack = (event) => {
      const track = event.track;
      const stream = event.streams[0];

      // Step 4: Diagnostic logging on pc.ontrack firing
      console.log(`[Diagnostic][Step 4][${new Date().toISOString()}] pc.ontrack FIRED! Kind: "${track?.kind}", ID: "${track?.id}", readyState: "${track?.readyState}", enabled: ${track?.enabled}`);
      if (stream) {
        console.log(`[Diagnostic][Step 4] pc.ontrack received MediaStream: total tracks = ${stream.getTracks().length}, audio tracks = ${stream.getAudioTracks().length}`);
      } else {
        console.log(`[Diagnostic][Step 4] WARNING: pc.ontrack stream array or first stream is null.`);
      }

      this.trackReceived.set(mapKey, true);
      diagnosticLogger.log('media', 'track_received', `Remote media track received! Kind: '${track?.kind}', ID: '${track?.id}', State: '${track?.readyState}'`, peerId, roomId, { kind: track?.kind, id: track?.id });
      if (stream) {
        diagnosticLogger.log('media', 'stream_assigned', `Successfully assigned remote MediaStream to peer. Total track count: ${stream.getTracks().length}`, peerId, roomId);
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

                // Record chat download usage for received voice note
                try {
                  useAppStore.getState().recordDataUsage('chat_download', audioBlob.size);
                } catch (e) {}

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

  async sendAudioChunks(peerId: string, blob: Blob, mimeType: string, messageId?: string, customRoomId?: string): Promise<boolean> {
    const myId = useAppStore.getState().user?.id;
    const roomId = customRoomId || (() => {
      const sortedIds = [myId, peerId].sort();
      return `chat-webrtc-${sortedIds[0]}-${sortedIds[1]}`;
    })();
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
          useAppStore.getState().recordDataUsage('chat_upload', totalBytes);
        } catch (e) {}

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

  async broadcastAudioChunks(roomId: string, blob: Blob, mimeType: string, messageId?: string): Promise<boolean[]> {
    const results: boolean[] = [];
    diagnosticLogger.log('webrtc', 'ptt_broadcast_start', `Broadcasting P2P voice data chunks to room ${roomId}`, undefined, roomId);
    for (const [mapKey, channel] of this.dataChannels.entries()) {
      if (mapKey.startsWith(`${roomId}_`) && channel.readyState === 'open') {
        const peerId = mapKey.replace(`${roomId}_`, '');
        try {
          diagnosticLogger.log('webrtc', 'ptt_broadcast_peer', `Sending P2P voice chunks to peer ${peerId}`, peerId, roomId);
          const success = await this.sendAudioChunks(peerId, blob, mimeType, messageId, roomId);
          results.push(success);
        } catch (e) {
          console.error(`Failed to broadcast audio chunks to peer ${peerId} in room ${roomId}:`, e);
          results.push(false);
        }
      }
    }
    return results;
  }

  private attachLocalTracks(pc: RTCPeerConnection) {
    const isLocalStreamNull = this.localStream === null;
    const tracksToAttempt = this.localStream ? this.localStream.getTracks() : [];
    const currentSenders = pc.getSenders();
    const tracksToBeAdded = tracksToAttempt.filter(track => !currentSenders.some(sender => sender.track === track));

    console.log(`[Diagnostic][Step 2] attachLocalTracks execution:
      - Whether localStream is null or a real MediaStream: ${isLocalStreamNull ? 'NULL' : 'REAL MediaStream'}
      - How many tracks are about to be added via addTrack: ${tracksToBeAdded.length} (out of ${tracksToAttempt.length} total local tracks)`);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        // Step 0 & 1: Confirm state of local track before adding
        console.log(`[Diagnostic] Checking local track state: kind=${track.kind}, ID=${track.id}, readyState=${track.readyState}, enabled=${track.enabled}`);
        const exists = currentSenders.some(sender => sender.track === track);
        let sender: RTCRtpSender | undefined = currentSenders.find(s => s.track === track);
        
        if (!exists) {
          console.log(`[Diagnostic] Attaching local track "${track.kind}" to peer connection`);
          sender = pc.addTrack(track, this.localStream!);
        } else {
          console.log(`[Diagnostic] Local track "${track.kind}" is already attached to this peer connection`);
        }

        // Apply transport and audio codec hardening for the audio transceiver (Step 3 & Step 4)
        if (track.kind === 'audio' && sender) {
          const transceiver = pc.getTransceivers().find(t => t.sender === sender);
          if (transceiver) {
            // STEP 3: Explicitly set direction to 'sendrecv' to prevent unexpected states (inactive, sendonly, etc.)
            // across renegotiation events when peers join or leave group calls.
            console.log(`[Diagnostic] Explicitly setting audio transceiver direction to 'sendrecv'`);
            transceiver.direction = 'sendrecv';

            // STEP 4: Prioritize Opus codec
            // Code comment on why Opus is preferred:
            // -----------------------------------------------------------------------------------------
            // Opus is the standard of choice for high-quality, network-resilient, real-time calling.
            // 1. Low Bitrate & High Quality: Excels at lower bandwidth ranges, scaling beautifully.
            // 2. Built-in Forward Error Correction (FEC): Enables the decoder to recover lost packets
            //    using slightly delayed redundant data embedded in subsequent packets, maintaining voice
            //    intelligibility even during severe 20-30% packet loss.
            // 3. Discontinuous Transmission (DTX): Pauses transmission of packets during silence,
            //    significantly conserving network bandwidth and reducing device battery drainage.
            // This is how raw analog microphone input is successfully transformed into robust, internet-suitable RTP packets.
            // -----------------------------------------------------------------------------------------
            const getCaps = (typeof RTCRtpReceiver !== 'undefined' && RTCRtpReceiver.getCapabilities) 
              ? RTCRtpReceiver.getCapabilities.bind(RTCRtpReceiver)
              : (typeof RTCRtpSender !== 'undefined' && RTCRtpSender.getCapabilities)
                ? RTCRtpSender.getCapabilities.bind(RTCRtpSender)
                : null;

            if ('setCodecPreferences' in transceiver && getCaps) {
              try {
                const capabilities = getCaps('audio');
                if (capabilities && capabilities.codecs) {
                  const opusCodecs = capabilities.codecs.filter(
                    codec => codec.mimeType.toLowerCase() === 'audio/opus'
                  );
                  const otherCodecs = capabilities.codecs.filter(
                    codec => codec.mimeType.toLowerCase() !== 'audio/opus'
                  );

                  if (opusCodecs.length > 0) {
                    const reorderedCodecs = [...opusCodecs, ...otherCodecs];
                    (transceiver as any).setCodecPreferences(reorderedCodecs);
                    console.log(`[Diagnostic] Successfully prioritized Opus codec on audio transceiver (Total codecs: ${reorderedCodecs.length})`);
                  }
                }
              } catch (codecErr) {
                console.warn(`[Diagnostic] setCodecPreferences on audio transceiver failed:`, codecErr);
              }
            } else {
              console.log(`[Diagnostic] setCodecPreferences API is not supported in this browser.`);
            }
          }
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
    let consecutiveSilentInbound = 0;
    let consecutiveSilentOutbound = 0;
    let lastOutboundStalled = false;
    let lastInboundStalled = false;

    diagnosticLogger.log('media', 'stats_monitoring_started', `Started active audio flow statistics monitoring for peer ${peerId}`, peerId, roomId);

    const intervalId = setInterval(async () => {
      const pc = this.pcs.get(mapKey);
      if (!pc || pc.iceConnectionState !== 'connected') {
        diagnosticLogger.log('media', 'stats_monitoring_stopped', `ICE is no longer connected, stopping active stats query for peer ${peerId}`, peerId, roomId);
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
          if (report.type === 'inbound-rtp') {
            audioBytesReceived += (report.bytesReceived || 0);
          }
          if (report.type === 'outbound-rtp') {
            audioBytesSent += (report.bytesSent || 0);
          }
        });

        let candidatePairStr = 'unknown';
        let localCandidateType = 'unknown';
        let remoteCandidateType = 'unknown';
        let protocolType = 'udp';

        if (activeCandidatePair) {
          const localCandidate = stats.get(activeCandidatePair.localCandidateId);
          const remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
          localCandidateType = localCandidate?.candidateType || 'unknown';
          remoteCandidateType = remoteCandidate?.candidateType || 'unknown';
          protocolType = localCandidate?.protocol || 'udp';
          candidatePairStr = `Local: ${localCandidateType} (${protocolType}), Remote: ${remoteCandidateType}`;
        }

        const sentDelta = audioBytesSent - lastBytesSent;
        const receivedDelta = audioBytesReceived - lastBytesReceived;

        // Record call upload and download usage
        if (lastBytesSent > 0 && sentDelta > 0) {
          try {
            useAppStore.getState().recordDataUsage('call_upload', sentDelta);
          } catch (e) {}
        }
        if (lastBytesReceived > 0 && receivedDelta > 0) {
          try {
            useAppStore.getState().recordDataUsage('call_download', receivedDelta);
          } catch (e) {}
        }
        lastBytesSent = audioBytesSent;
        lastBytesReceived = audioBytesReceived;

        // Detect if media stopped flowing after connection was established
        if (lastBytesSent > 0) {
          if (sentDelta === 0) {
            consecutiveSilentOutbound++;
          } else {
            consecutiveSilentOutbound = 0;
          }
        }
        if (lastBytesReceived > 0) {
          if (receivedDelta === 0) {
            consecutiveSilentInbound++;
          } else {
            consecutiveSilentInbound = 0;
          }
        }

        const outboundStalled = consecutiveSilentOutbound >= 2; // ~10 seconds of no outbound audio
        const inboundStalled = consecutiveSilentInbound >= 2;   // ~10 seconds of no inbound audio

        // Log transition statuses to diagnostic logger
        if (outboundStalled !== lastOutboundStalled) {
          diagnosticLogger.log(
            outboundStalled ? 'error' : 'media', 
            outboundStalled ? 'outbound_stalled' : 'outbound_recovered', 
            outboundStalled ? `Outbound voice stream has stalled! No voice data transmitting.` : `Outbound voice stream has recovered! Sending voice data again.`, 
            peerId, 
            roomId
          );
          lastOutboundStalled = outboundStalled;
        }
        if (inboundStalled !== lastInboundStalled) {
          diagnosticLogger.log(
            inboundStalled ? 'error' : 'media', 
            inboundStalled ? 'inbound_stalled' : 'inbound_recovered', 
            inboundStalled ? `Inbound voice stream has stalled! No voice data received from remote peer.` : `Inbound voice stream has recovered! Receiving voice data again.`, 
            peerId, 
            roomId
          );
          lastInboundStalled = inboundStalled;
        }

        console.log(`[Diagnostic][StatsMonitor][${new Date().toISOString()}] Peer ${peerId} (room ${roomId}):
          - Candidate Pair: ${candidatePairStr}
          - Local Candidate Type: ${localCandidateType} (TURN/Relay Active: ${localCandidateType === 'relay'})
          - Total Audio Bytes Sent: ${audioBytesSent} (Delta: +${sentDelta} bytes, Stalled: ${outboundStalled})
          - Total Audio Bytes Received: ${audioBytesReceived} (Delta: +${receivedDelta} bytes, Stalled: ${inboundStalled})
          - Audio Flow Status: ${sentDelta > 0 || receivedDelta > 0 ? "LIVE AUDIO TRANSMITTING ✅" : "STALLED / SILENT ⚠️"}
        `);

        // Emit continuous WebRTC connection audit event via Socket.io
        const socket = useAppStore.getState().socket;
        const myId = useAppStore.getState().user?.id;
        if (socket && myId) {
          socket.emit('webrtc_audit', {
            roomId,
            peerId: myId,
            targetPeerId: peerId,
            iceConnectionState: pc.iceConnectionState,
            connectionState: pc.connectionState,
            audioBytesSent,
            audioBytesReceived,
            sentDelta,
            receivedDelta,
            localCandidateType,
            remoteCandidateType,
            candidatePairStr,
            outboundStalled,
            inboundStalled,
            isFlowing: sentDelta > 0 || receivedDelta > 0,
            timestamp: new Date().toISOString()
          });
        }

        // Dispatch local event for the call UI to display metrics instantly
        window.dispatchEvent(new CustomEvent('webrtc_call_stats', {
          detail: {
            peerId,
            audioBytesSent,
            audioBytesReceived,
            sentDelta,
            receivedDelta,
            candidatePairStr,
            localCandidateType,
            remoteCandidateType,
            outboundStalled,
            inboundStalled,
            isFlowing: sentDelta > 0 || receivedDelta > 0
          }
        }));

        lastBytesSent = audioBytesSent;
        lastBytesReceived = audioBytesReceived;
      } catch (err: any) {
        diagnosticLogger.log('error', 'stats_query_failed', `Failed to query connection stats: ${err.message}`, peerId, roomId);
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
      diagnosticLogger.log('webrtc', 'apply_queued_candidates', `Applying ${candidates.length} queued ICE candidates that arrived before remote SDP was ready.`, peerId, roomId);
      this.pendingCandidates.delete(mapKey);
      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          diagnosticLogger.log('webrtc', 'ice_candidate_applied', `Successfully applied queued ICE candidate of type ${candidate.candidate ? (candidate.candidate.split(' ')[7] || 'unknown') : 'unknown'}`, peerId, roomId);
        } catch (err: any) {
          diagnosticLogger.log('error', 'ice_candidate_apply_failed', `Failed to apply queued ICE candidate: ${err.message}`, peerId, roomId, { candidate, error: err });
        }
      }
    }
  }

  async handleSignal(from: string, signal: any, roomId: string) {
    const myId = useAppStore.getState().user?.id;
    if (from === myId) return; // Skip our own signals

    diagnosticLogger.log('socket', 'incoming_signal', `Received incoming socket signal of type '${signal.type}' from peer ${from}`, from, roomId, { signalType: signal.type });

    // Queue incoming signals that trigger createPeerConnection until our local media is ready.
    // (Applies only to A/V calls, not data-channel chat rooms where localStream is intentionally null)
    if (!this.localStream && !roomId.startsWith('chat-webrtc-')) {
      diagnosticLogger.log('signaling', 'queue_signal', `Local media stream is not ready yet. Queueing incoming signal of type '${signal.type}' from peer ${from}`, from, roomId);
      this.pendingSignals.push({ from, signal, roomId });
      return;
    }

    if (signal.type === 'peer_joined') {
      const peerId = signal.peerId;
      if (peerId && peerId !== myId) {
        diagnosticLogger.log('signaling', 'peer_joined_received', `Handling 'peer_joined' signal from ${peerId}. Initializing call negotiation...`, peerId, roomId);
        const pc = this.createPeerConnection(peerId, roomId);

        // Step 1 point 3: Add all local tracks BEFORE calling createOffer
        this.attachLocalTracks(pc);

        // ALWAYS ensure that we create the DataChannel on the SDP offer creator side
        if (!this.dataChannels.has(this.getMapKey(peerId, roomId))) {
          diagnosticLogger.log('webrtc', 'create_datachannel_initiator', `Creating RTCDataChannel "audio_transfer" for SDP Offer Initiator`, peerId, roomId);
          const dc = pc.createDataChannel("audio_transfer", { ordered: true });
          this.setupDataChannel(peerId, roomId, dc);
        }

        try {
          diagnosticLogger.log('webrtc', 'create_offer', `Creating local SDP Offer for peer ${peerId}`, peerId, roomId);
          const offer = await pc.createOffer();
          
          diagnosticLogger.log('webrtc', 'set_local_description', `Setting local description with newly created SDP Offer`, peerId, roomId);
          await pc.setLocalDescription(offer);
          
          const socket = useAppStore.getState().socket;
          if (socket) {
            diagnosticLogger.log('socket', 'send_offer', `Transmitting local SDP Offer to peer ${peerId} via Socket.io`, peerId, roomId);
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
        } catch (err: any) {
          diagnosticLogger.log('error', 'offer_failed', `Failed to create/send offer to peer ${peerId}: ${err.message}`, peerId, roomId, { error: err });
          this.dispatchCallError(CallError.RENEGOTIATION_FAILED, peerId);
        }
      }
    } else if (signal.type === 'offer') {
      if (signal.to === myId) {
        diagnosticLogger.log('signaling', 'offer_received', `Received remote SDP Offer from peer ${from}. Beginning answer generation.`, from, roomId);
        const pc = this.createPeerConnection(from, roomId);

        try {
          // Set remote description FIRST
          diagnosticLogger.log('webrtc', 'set_remote_description_offer', `Setting remote description with received SDP Offer from peer ${from}`, from, roomId);
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          
          // Apply any pending ICE candidates that arrived before SDP remote description was set (Step 1 point 7)
          await this.applyPendingIceCandidates(from, roomId, pc);

          // THEN attach local tracks to the connection
          diagnosticLogger.log('webrtc', 'attach_tracks_answerer', `Attaching local media tracks to connection answering to peer ${from}`, from, roomId);
          this.attachLocalTracks(pc);

          // THEN create and set the answer
          diagnosticLogger.log('webrtc', 'create_answer', `Creating local SDP Answer for peer ${from}`, from, roomId);
          const answer = await pc.createAnswer();
          
          diagnosticLogger.log('webrtc', 'set_local_description_answer', `Setting local description with newly created SDP Answer`, from, roomId);
          await pc.setLocalDescription(answer);

          const socket = useAppStore.getState().socket;
          if (socket) {
            diagnosticLogger.log('socket', 'send_answer', `Transmitting local SDP Answer to peer ${from} via Socket.io`, from, roomId);
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
        } catch (err: any) {
          diagnosticLogger.log('error', 'answer_failed', `Failed to handle offer / generate answer for peer ${from}: ${err.message}`, from, roomId, { error: err });
          this.dispatchCallError(CallError.RENEGOTIATION_FAILED, from);
        }
      }
    } else if (signal.type === 'answer') {
      if (signal.to === myId) {
        diagnosticLogger.log('signaling', 'answer_received', `Received remote SDP Answer from peer ${from}. Completing handshake.`, from, roomId);
        const mapKey = this.getMapKey(from, roomId);
        const pc = this.pcs.get(mapKey);
        if (pc) {
          try {
            diagnosticLogger.log('webrtc', 'set_remote_description_answer', `Setting remote description with received SDP Answer from peer ${from}`, from, roomId);
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            await this.applyPendingIceCandidates(from, roomId, pc);
          } catch (err: any) {
            diagnosticLogger.log('error', 'answer_apply_failed', `Failed to set remote description from peer ${from}: ${err.message}`, from, roomId, { error: err });
            this.dispatchCallError(CallError.RENEGOTIATION_FAILED, from);
          }
        }
      }
    } else if (signal.type === 'ice_candidate') {
      if (signal.to === myId) {
        const mapKey = this.getMapKey(from, roomId);
        const pc = this.pcs.get(mapKey);
        const candidateInfo = signal.candidate ? `${signal.candidate.candidateType || 'unknown'} (${signal.candidate.protocol || 'udp'})` : 'null';
        
        diagnosticLogger.log('signaling', 'ice_candidate_received', `Received remote ICE Candidate candidateType: ${candidateInfo} from peer ${from}`, from, roomId);
        
        // Step 1 point 7: Queue candidate if remote description is not set yet
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            diagnosticLogger.log('webrtc', 'ice_candidate_added_direct', `Directly applied remote ICE candidate from peer ${from}`, from, roomId);
          } catch (err: any) {
            diagnosticLogger.log('error', 'ice_candidate_add_failed', `Failed to add remote ICE candidate from peer ${from}: ${err.message}`, from, roomId, { candidate: signal.candidate, error: err });
          }
        } else {
          diagnosticLogger.log('webrtc', 'ice_candidate_queued', `Remote description is not set yet. Queueing ICE candidate from peer ${from}`, from, roomId);
          if (!this.pendingCandidates.has(mapKey)) {
            this.pendingCandidates.set(mapKey, []);
          }
          this.pendingCandidates.get(mapKey)!.push(signal.candidate);
        }
      }
    } else if (signal.type === 'request_tracks') {
      if (this.localStream) {
        diagnosticLogger.log('signaling', 'request_tracks_received', `Received remote track request. Re-broadcasting local peer presence...`, from, roomId);
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

