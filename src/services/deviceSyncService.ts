import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';

export interface SyncProgress {
  status: 'idle' | 'generating' | 'waiting' | 'connecting' | 'transferring' | 'completed' | 'error';
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  transferSpeed: string; // e.g. "1.2 MB/s"
  bytesTransferred: number;
  totalBytes: number;
  error?: string;
  role?: 'sender' | 'receiver';
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

class DeviceSyncService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private roomId: string | null = null;
  private socket: any = null;
  private onProgressCallback: SyncProgressCallback | null = null;
  private role: 'sender' | 'receiver' | null = null;

  // Track state for progress calculations
  private startTime: number = 0;
  private totalBytes: number = 0;
  private totalChunks: number = 0;
  private chunksBuffer: string[] = [];
  private receivedBytes: number = 0;

  // Ice servers (fallback, then we fetch)
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' }
  ];

  constructor() {
    this.fetchIceConfig();
  }

  private async fetchIceConfig() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/webrtc/config`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.iceServers) {
          this.iceServers = data.iceServers;
        }
      }
    } catch (error) {
      console.warn("Failed to fetch ICE config in deviceSyncService, using default STUN", error);
    }
  }

  // Generate a random one-time use sync Room ID
  public generateSyncRoomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'sync-';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * HOST SIDE (Sender)
   */
  public async startHostSession(roomId: string, onProgress: SyncProgressCallback) {
    this.cleanup();
    this.role = 'sender';
    this.roomId = roomId;
    this.onProgressCallback = onProgress;
    
    // Get the socket from our global store
    const store = useAppStore.getState();
    this.socket = store.socket;

    if (!this.socket) {
      this.updateProgress({
        status: 'error',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        error: 'Websocket is not connected.'
      });
      return;
    }

    this.updateProgress({
      status: 'waiting',
      percentage: 0,
      currentChunk: 0,
      totalChunks: 0,
      transferSpeed: '0 KB/s',
      bytesTransferred: 0,
      totalBytes: 0,
      role: 'sender'
    });

    // Set up socket listeners
    this.socket.on("sync_peer_joined", async () => {
      console.log("[SyncHost] Receiver joined sync room");
      this.updateProgress({
        status: 'connecting',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        role: 'sender'
      });
      await this.initiateWebRTCSender();
    });

    this.socket.on("sync_signal", async (data: { signal: any }) => {
      const { signal } = data;
      if (!this.pc) return;

      try {
        if (signal.type === 'answer') {
          console.log("[SyncHost] Received answer SDP");
          await this.pc.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
          console.log("[SyncHost] Received remote ICE candidate");
          await this.pc.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (err: any) {
        console.error("[SyncHost] Error handling remote signal:", err);
      }
    });

    // Join room
    this.socket.emit("sync_join_room", { roomId });
    console.log(`[SyncHost] Joined sync room ${roomId}`);
  }

  private async initiateWebRTCSender() {
    try {
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

      // Create data channel
      this.dataChannel = this.pc.createDataChannel("sync_data_channel", {
        ordered: true
      });

      this.setupDataChannelSender(this.dataChannel);

      // Handle ICE candidates
      this.pc.onicecandidate = (event) => {
        if (event.candidate && this.roomId && this.socket) {
          this.socket.emit("sync_signal", {
            roomId: this.roomId,
            signal: event.candidate
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        console.log(`[SyncHost] Connection State: ${this.pc?.connectionState}`);
        if (this.pc?.connectionState === 'failed') {
          this.updateProgress({
            status: 'error',
            percentage: 0,
            currentChunk: 0,
            totalChunks: 0,
            transferSpeed: '0 KB/s',
            bytesTransferred: 0,
            totalBytes: 0,
            error: 'WebRTC connection failed.'
          });
        }
      };

      // Create Offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      if (this.roomId && this.socket) {
        this.socket.emit("sync_signal", {
          roomId: this.roomId,
          signal: offer
        });
      }
    } catch (err: any) {
      console.error("[SyncHost] Error setting up peer connection:", err);
      this.updateProgress({
        status: 'error',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        error: err.message || 'Failed to initialize peer connection.'
      });
    }
  }

  private setupDataChannelSender(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log("[SyncHost] Data channel is open. Preparing sync payload.");
      this.updateProgress({
        status: 'transferring',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        role: 'sender'
      });
      this.sendSyncPayload();
    };

    channel.onclose = () => {
      console.log("[SyncHost] Data channel closed");
    };

    channel.onerror = (err) => {
      console.error("[SyncHost] Data channel error:", err);
    };
  }

  // Gather actual state to transfer
  private getSyncPayload(): string {
    const store = useAppStore.getState();
    const userId = store.user?.id || 'anonymous';

    // Retrieve from localStorage to guarantee precise database snapshot
    const grabLocalJSON = (key: string, fallback: any) => {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
      } catch (e) {
        return fallback;
      }
    };

    const chats = store.chats;
    const users = grabLocalJSON(`proto_users_${userId}`, []);
    const friendRequests = grabLocalJSON(`proto_friendRequests_${userId}`, []);
    const sentFriendRequests = grabLocalJSON(`proto_sentFriendRequests_${userId}`, []);
    const blockedUserIds = grabLocalJSON(`proto_blockedUserIds_${userId}`, []);
    const removedFriendIds = grabLocalJSON(`proto_removedFriendIds_${userId}`, []);

    const payload = {
      chats,
      users,
      friendRequests,
      sentFriendRequests,
      blockedUserIds,
      removedFriendIds,
      deviceInfo: {
        name: navigator.userAgent.includes('Mobile') ? 'Mobile Web Client' : 'Desktop Web Client',
        userId: userId
      }
    };

    return JSON.stringify(payload);
  }

  private async sendSyncPayload() {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

    try {
      const payloadStr = this.getSyncPayload();
      const encoder = new TextEncoder();
      const payloadBuffer = encoder.encode(payloadStr);

      this.totalBytes = payloadBuffer.byteLength;
      this.startTime = Date.now();

      // We slice the buffer into chunks of 16KB (WebRTC friendly chunk size)
      const chunkSize = 16384; 
      this.totalChunks = Math.ceil(this.totalBytes / chunkSize);

      console.log(`[SyncHost] Payload Size: ${this.totalBytes} bytes, Total Chunks: ${this.totalChunks}`);

      let currentChunkIndex = 0;

      // Handle acknowledgments (Sender backpressure)
      const handleAck = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ack' && msg.index === currentChunkIndex) {
            // Received acknowledgment for current chunk, proceed to next one
            currentChunkIndex++;
            if (currentChunkIndex < this.totalChunks) {
              sendNextChunk();
            } else {
              // Completed!
              this.dataChannel?.send(JSON.stringify({ type: 'complete' }));
              this.dataChannel?.close();
              this.socket?.emit("sync_leave_room", { roomId: this.roomId });
              
              this.updateProgress({
                status: 'completed',
                percentage: 100,
                currentChunk: this.totalChunks,
                totalChunks: this.totalChunks,
                transferSpeed: this.formatSpeed(this.totalBytes, Date.now() - this.startTime),
                bytesTransferred: this.totalBytes,
                totalBytes: this.totalBytes,
                role: 'sender'
              });
              
              this.cleanup();
            }
          }
        } catch (e) {
          console.warn("[SyncHost] Failed to parse data channel message:", e);
        }
      };

      this.dataChannel.onmessage = handleAck;

      const sendNextChunk = () => {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

        const offset = currentChunkIndex * chunkSize;
        const end = Math.min(offset + chunkSize, this.totalBytes);
        const slice = payloadBuffer.slice(offset, end);

        // Convert slice to string representation (hex/base64 is very safe for WebRTC messages)
        // Base64 is compact and reliable
        let binary = '';
        const bytes = new Uint8Array(slice);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.dataChannel.send(JSON.stringify({
          type: 'chunk',
          index: currentChunkIndex,
          total: this.totalChunks,
          data: base64Data,
          chunkSize: slice.byteLength
        }));

        // Calculate progress and live metrics
        const bytesTransferred = end;
        const elapsed = Date.now() - this.startTime;
        const speedStr = this.formatSpeed(bytesTransferred, elapsed);
        const percentage = Math.round((bytesTransferred / this.totalBytes) * 100);

        this.updateProgress({
          status: 'transferring',
          percentage,
          currentChunk: currentChunkIndex + 1,
          totalChunks: this.totalChunks,
          transferSpeed: speedStr,
          bytesTransferred,
          totalBytes: this.totalBytes,
          role: 'sender'
        });
      };

      // Start the backpressure chain
      sendNextChunk();

    } catch (err: any) {
      console.error("[SyncHost] Error during transmission:", err);
      this.updateProgress({
        status: 'error',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        error: err.message || 'Failed to package or transmit data.'
      });
    }
  }


  /**
   * RECEIVER SIDE (New Device)
   */
  public async startReceiverSession(roomId: string, onProgress: SyncProgressCallback) {
    this.cleanup();
    this.role = 'receiver';
    this.roomId = roomId;
    this.onProgressCallback = onProgress;

    const store = useAppStore.getState();
    this.socket = store.socket;

    if (!this.socket) {
      this.updateProgress({
        status: 'error',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        error: 'Websocket is not connected.'
      });
      return;
    }

    this.updateProgress({
      status: 'connecting',
      percentage: 0,
      currentChunk: 0,
      totalChunks: 0,
      transferSpeed: '0 KB/s',
      bytesTransferred: 0,
      totalBytes: 0,
      role: 'receiver'
    });

    this.chunksBuffer = [];
    this.receivedBytes = 0;
    this.startTime = Date.now();

    // Setup socket signal handling
    this.socket.on("sync_signal", async (data: { signal: any }) => {
      const { signal } = data;
      
      try {
        if (signal.type === 'offer') {
          console.log("[SyncReceiver] Received offer SDP");
          await this.initiateWebRTCReceiver(signal);
        } else if (signal.candidate) {
          console.log("[SyncReceiver] Received remote ICE candidate");
          if (this.pc) {
            await this.pc.addIceCandidate(new RTCIceCandidate(signal));
          }
        }
      } catch (err: any) {
        console.error("[SyncReceiver] Error handling signaling:", err);
      }
    });

    // Join room
    this.socket.emit("sync_join_room", { roomId });
    console.log(`[SyncReceiver] Joined sync room ${roomId}`);
  }

  private async initiateWebRTCReceiver(offer: any) {
    try {
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannelReceiver(this.dataChannel);
      };

      this.pc.onicecandidate = (event) => {
        if (event.candidate && this.roomId && this.socket) {
          this.socket.emit("sync_signal", {
            roomId: this.roomId,
            signal: event.candidate
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        console.log(`[SyncReceiver] Connection State: ${this.pc?.connectionState}`);
        if (this.pc?.connectionState === 'failed') {
          this.updateProgress({
            status: 'error',
            percentage: 0,
            currentChunk: 0,
            totalChunks: 0,
            transferSpeed: '0 KB/s',
            bytesTransferred: 0,
            totalBytes: 0,
            error: 'WebRTC connection failed.'
          });
        }
      };

      // Set Remote Offer
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create Answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Send Answer
      if (this.roomId && this.socket) {
        this.socket.emit("sync_signal", {
          roomId: this.roomId,
          signal: answer
        });
      }
    } catch (err: any) {
      console.error("[SyncReceiver] Error initializing peer connection:", err);
      this.updateProgress({
        status: 'error',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        error: err.message || 'Failed to initialize peer connection.'
      });
    }
  }

  private setupDataChannelReceiver(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log("[SyncReceiver] Data channel is open. Ready to receive.");
      this.updateProgress({
        status: 'transferring',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        transferSpeed: '0 KB/s',
        bytesTransferred: 0,
        totalBytes: 0,
        role: 'receiver'
      });
      this.startTime = Date.now();
    };

    channel.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'chunk') {
          const { index, total, data, chunkSize } = msg;

          this.totalChunks = total;
          this.chunksBuffer[index] = data;
          this.receivedBytes += chunkSize;

          // Send backpressure ack
          this.dataChannel?.send(JSON.stringify({ type: 'ack', index }));

          // Update metrics
          const elapsed = Date.now() - this.startTime;
          const speedStr = this.formatSpeed(this.receivedBytes, elapsed);
          const percentage = Math.round(((index + 1) / total) * 100);

          this.updateProgress({
            status: 'transferring',
            percentage,
            currentChunk: index + 1,
            totalChunks: total,
            transferSpeed: speedStr,
            bytesTransferred: this.receivedBytes,
            totalBytes: Math.round((this.receivedBytes / (index + 1)) * total), // estimate total
            role: 'receiver'
          });

        } else if (msg.type === 'complete') {
          console.log("[SyncReceiver] Transfer complete. Reassembling JSON.");
          this.updateProgress({
            status: 'completed',
            percentage: 100,
            currentChunk: this.totalChunks,
            totalChunks: this.totalChunks,
            transferSpeed: this.formatSpeed(this.receivedBytes, Date.now() - this.startTime),
            bytesTransferred: this.receivedBytes,
            totalBytes: this.receivedBytes,
            role: 'receiver'
          });

          await this.processReceivedPayload();
          this.cleanup();
        }
      } catch (err: any) {
        console.error("[SyncReceiver] Error processing incoming chunk:", err);
        this.updateProgress({
          status: 'error',
          percentage: 0,
          currentChunk: 0,
          totalChunks: 0,
          transferSpeed: '0 KB/s',
          bytesTransferred: 0,
          totalBytes: 0,
          error: 'Error processing synced data.'
        });
      }
    };

    channel.onclose = () => {
      console.log("[SyncReceiver] Data channel closed");
    };
  }

  private async processReceivedPayload() {
    try {
      // Reassemble Base64 string
      const fullBase64 = this.chunksBuffer.join('');
      
      // Decode Base64 to Binary string, then to UTF8 text
      const binaryString = atob(fullBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const payloadStr = new TextDecoder().decode(bytes);
      const payload = JSON.parse(payloadStr);

      console.log("[SyncReceiver] Successfully reassembled payload. Merging with local state.");

      // Merge data into store and local storage
      const store = useAppStore.getState();
      const userId = store.user?.id || 'anonymous';

      if (!userId) {
        throw new Error("No active user to merge data into.");
      }

      // Safe update keys
      const saveLocalJSON = (key: string, value: any) => {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
          console.error("Local storage error:", e);
        }
      };

      // 1. Merge Chats & Messages (prevent duplicating, but combine unique items)
      const existingChats = store.chats || [];
      const incomingChats = payload.chats || [];
      const mergedChats = [...existingChats];

      for (const incChat of incomingChats) {
        const existingIdx = mergedChats.findIndex(c => c.id === incChat.id);
        if (existingIdx >= 0) {
          // Merge messages inside existing chat
          const existingMessages = mergedChats[existingIdx].messages || [];
          const incomingMessages = incChat.messages || [];
          
          const msgMap = new Map<string, any>();
          existingMessages.forEach(m => msgMap.set(m.id, m));
          incomingMessages.forEach(m => msgMap.set(m.id, m)); // incoming updates or adds messages
          
          mergedChats[existingIdx] = {
            ...mergedChats[existingIdx],
            ...incChat,
            messages: Array.from(msgMap.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          };
        } else {
          // Add new chat
          mergedChats.push(incChat);
        }
      }

      // Update store and save to Local Storage
      store.setChats(mergedChats);
      saveLocalJSON(`proto_chats_${userId}`, mergedChats);

      // 2. Merge Friends/Users
      const existingUsers = store.users || [];
      const incomingUsers = payload.users || [];
      const userMap = new Map<string, any>();
      existingUsers.forEach((u: any) => userMap.set(u.id, u));
      incomingUsers.forEach((u: any) => userMap.set(u.id, u));
      const mergedUsers = Array.from(userMap.values());
      saveLocalJSON(`proto_users_${userId}`, mergedUsers);
      
      // Update global store state for users if the setter exists
      if ((store as any).setUsers) {
        (store as any).setUsers(mergedUsers);
      }

      // 3. Merge friendRequests, sentFriendRequests, blockedUserIds, removedFriendIds
      if (payload.friendRequests) saveLocalJSON(`proto_friendRequests_${userId}`, payload.friendRequests);
      if (payload.sentFriendRequests) saveLocalJSON(`proto_sentFriendRequests_${userId}`, payload.sentFriendRequests);
      if (payload.blockedUserIds) saveLocalJSON(`proto_blockedUserIds_${userId}`, payload.blockedUserIds);
      if (payload.removedFriendIds) saveLocalJSON(`proto_removedFriendIds_${userId}`, payload.removedFriendIds);

      // 4. Add a dummy device to represent paired status if we like, or trigger success notice
      console.log("[SyncReceiver] State successfully merged. Refreshing store keys.");

    } catch (e: any) {
      console.error("[SyncReceiver] Error processing reassembled payload:", e);
      throw e;
    }
  }


  /**
   * HELPERS
   */
  private formatSpeed(bytes: number, elapsedMs: number): string {
    if (elapsedMs <= 0) return '0 KB/s';
    const seconds = elapsedMs / 1000;
    const speedBps = bytes / seconds;

    if (speedBps > 1048576) {
      return `${(speedBps / 1048576).toFixed(1)} MB/s`;
    } else if (speedBps > 1024) {
      return `${(speedBps / 1024).toFixed(0)} KB/s`;
    } else {
      return `${speedBps.toFixed(0)} B/s`;
    }
  }

  private updateProgress(progress: SyncProgress) {
    if (this.onProgressCallback) {
      this.onProgressCallback(progress);
    }
  }

  public cleanup() {
    console.log("[SyncService] Cleaning up resources");
    
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }

    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }

    if (this.socket && this.roomId) {
      try {
        this.socket.emit("sync_leave_room", { roomId: this.roomId });
        this.socket.off("sync_peer_joined");
        this.socket.off("sync_signal");
      } catch (e) {}
    }

    this.roomId = null;
    this.role = null;
  }
}

export const deviceSyncService = new DeviceSyncService();
