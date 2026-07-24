export enum FileTransferError {
  UPLOAD_NETWORK_ERROR = 'UPLOAD_NETWORK_ERROR',
  UPLOAD_SERVER_ERROR = 'UPLOAD_SERVER_ERROR',
  UPLOAD_QUOTA_EXCEEDED = 'UPLOAD_QUOTA_EXCEEDED',
  ENCRYPT_KEY_MISSING = 'ENCRYPT_KEY_MISSING',
  ENCRYPT_FAILED = 'ENCRYPT_FAILED',
  DOWNLOAD_NETWORK_ERROR = 'DOWNLOAD_NETWORK_ERROR',
  DOWNLOAD_SERVER_ERROR = 'DOWNLOAD_SERVER_ERROR',
  DOWNLOAD_NOT_FOUND = 'DOWNLOAD_NOT_FOUND',
  DECRYPT_KEY_MISSING = 'DECRYPT_KEY_MISSING',
  DECRYPT_FAILED = 'DECRYPT_FAILED',
  DECOMPRESS_FAILED = 'DECOMPRESS_FAILED',
  RENDER_FAILED = 'RENDER_FAILED',
  FILE_CAPTURE_EMPTY = 'FILE_CAPTURE_EMPTY',
  FILE_TYPE_UNSUPPORTED = 'FILE_TYPE_UNSUPPORTED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UPLOAD_STALLED = 'UPLOAD_STALLED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum CallError {
  MIC_PERMISSION_DENIED = 'MIC_PERMISSION_DENIED',
  MIC_NOT_FOUND = 'MIC_NOT_FOUND',
  MIC_CAPTURE_FAILED = 'MIC_CAPTURE_FAILED',
  SIGNALING_TIMEOUT = 'SIGNALING_TIMEOUT',
  ICE_GATHERING_FAILED = 'ICE_GATHERING_FAILED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_DISCONNECTED = 'CONNECTION_DISCONNECTED',
  CONNECTED_NO_MEDIA = 'CONNECTED_NO_MEDIA',
  TRACK_NOT_RECEIVED = 'TRACK_NOT_RECEIVED',
  PLAYBACK_BLOCKED = 'PLAYBACK_BLOCKED',
  SINK_SWITCH_FAILED = 'SINK_SWITCH_FAILED',
  RENEGOTIATION_FAILED = 'RENEGOTIATION_FAILED',
  CALL_DECLINED = 'CALL_DECLINED',
  CALL_TIMEOUT = 'CALL_TIMEOUT',
  UNKNOWN_CALL_ERROR = 'UNKNOWN_CALL_ERROR',
}

export interface ErrorDetail {
  code: FileTransferError;
  message: string;
  technicalDescription: string;
}

export interface CallErrorDetail {
  code: CallError;
  message: string;
  technicalDescription: string;
}

export const CallErrorDetails: Record<CallError, CallErrorDetail> = {
  [CallError.MIC_PERMISSION_DENIED]: {
    code: CallError.MIC_PERMISSION_DENIED,
    message: 'Microphone permission denied — please enable mic access in your browser settings.',
    technicalDescription: 'navigator.mediaDevices.getUserMedia threw NotAllowedError/PermissionDeniedError.'
  },
  [CallError.MIC_NOT_FOUND]: {
    code: CallError.MIC_NOT_FOUND,
    message: 'Microphone not found — please connect an audio input device.',
    technicalDescription: 'navigator.mediaDevices.getUserMedia threw NotFoundError/DevicesNotFoundError.'
  },
  [CallError.MIC_CAPTURE_FAILED]: {
    code: CallError.MIC_CAPTURE_FAILED,
    message: 'Microphone capture failed — please check if your mic is in use by another application.',
    technicalDescription: 'navigator.mediaDevices.getUserMedia threw an unexpected hardware error or DOMException.'
  },
  [CallError.SIGNALING_TIMEOUT]: {
    code: CallError.SIGNALING_TIMEOUT,
    message: 'Call setup timed out — could not complete connection handshake with the other party.',
    technicalDescription: 'SDP offer/answer exchange or ICE candidates did not complete within the timeout window.'
  },
  [CallError.ICE_GATHERING_FAILED]: {
    code: CallError.ICE_GATHERING_FAILED,
    message: 'Network error — could not gather connection routing candidates (STUN/TURN offline or blocked).',
    technicalDescription: 'RTCPeerConnection iceGatheringState completed with 0 valid remote candidates gathered.'
  },
  [CallError.CONNECTION_FAILED]: {
    code: CallError.CONNECTION_FAILED,
    message: 'Call connection failed — check your firewall or network connection.',
    technicalDescription: 'RTCPeerConnection iceConnectionState or connectionState reached the failed state.'
  },
  [CallError.CONNECTION_DISCONNECTED]: {
    code: CallError.CONNECTION_DISCONNECTED,
    message: 'Call disconnected — temporarily lost connection, attempting auto-recovery.',
    technicalDescription: 'RTCPeerConnection iceConnectionState transitioned to the disconnected state.'
  },
  [CallError.CONNECTED_NO_MEDIA]: {
    code: CallError.CONNECTED_NO_MEDIA,
    message: 'Audio transmission issue — connection established but voice data is not transmitting.',
    technicalDescription: 'getStats() reports zero inbound/outbound audio bytes after the connected state grace period.'
  },
  [CallError.TRACK_NOT_RECEIVED]: {
    code: CallError.TRACK_NOT_RECEIVED,
    message: 'Media receiving failed — connected but remote audio tracks were not successfully attached.',
    technicalDescription: 'Peer connection successfully established but the ontrack handler never fired for remote audio.'
  },
  [CallError.PLAYBACK_BLOCKED]: {
    code: CallError.PLAYBACK_BLOCKED,
    message: 'Audio playback blocked by browser — tap/click anywhere to unmute/play call audio.',
    technicalDescription: 'HTMLMediaElement.play() threw an autoplay policy error or was rejected.'
  },
  [CallError.SINK_SWITCH_FAILED]: {
    code: CallError.SINK_SWITCH_FAILED,
    message: 'Speaker toggle failed — could not change your audio output device.',
    technicalDescription: 'HTMLMediaElement.setSinkId() call rejected or unsupported on this browser/environment.'
  },
  [CallError.RENEGOTIATION_FAILED]: {
    code: CallError.RENEGOTIATION_FAILED,
    message: 'Failed to renegotiate call — could not update participants or media states.',
    technicalDescription: 'SDP renegotiation or local track addition failed during mute/unmute or dynamic participant updates.'
  },
  [CallError.CALL_DECLINED]: {
    code: CallError.CALL_DECLINED,
    message: 'Call declined — the recipient declined your call request.',
    technicalDescription: 'Received an explicit hangup/decline event from the target user during call ring.'
  },
  [CallError.CALL_TIMEOUT]: {
    code: CallError.CALL_TIMEOUT,
    message: 'No answer — the call request timed out because the recipient did not answer.',
    technicalDescription: 'No answer or join-call received from recipient within the ringing duration.'
  },
  [CallError.UNKNOWN_CALL_ERROR]: {
    code: CallError.UNKNOWN_CALL_ERROR,
    message: 'An untraceable call error occurred.',
    technicalDescription: 'Fallback call error for unclassified or uncaught exceptions.'
  }
};

export const FileTransferErrorDetails: Record<FileTransferError, ErrorDetail> = {
  [FileTransferError.UPLOAD_NETWORK_ERROR]: {
    code: FileTransferError.UPLOAD_NETWORK_ERROR,
    message: 'Check your connection — Upload request failed due to a network connection error or timeout.',
    technicalDescription: 'XMLHttpRequest upload triggered error/timeout event.'
  },
  [FileTransferError.UPLOAD_SERVER_ERROR]: {
    code: FileTransferError.UPLOAD_SERVER_ERROR,
    message: 'Server error — The server encountered an error during upload.',
    technicalDescription: 'Server returned non-2xx status code during POST upload.'
  },
  [FileTransferError.UPLOAD_QUOTA_EXCEEDED]: {
    code: FileTransferError.UPLOAD_QUOTA_EXCEEDED,
    message: 'Quota exceeded — Daily storage/bandwidth quota has been exceeded.',
    technicalDescription: 'Server returned HTTP 429 quota exceeded.'
  },
  [FileTransferError.ENCRYPT_KEY_MISSING]: {
    code: FileTransferError.ENCRYPT_KEY_MISSING,
    message: 'E2EE error — Unable to resolve recipient public key for E2EE.',
    technicalDescription: 'Recipient public key not available from socket or Firestore.'
  },
  [FileTransferError.ENCRYPT_FAILED]: {
    code: FileTransferError.ENCRYPT_FAILED,
    message: 'E2EE error — Failed to encrypt file data.',
    technicalDescription: 'CryptoService.encryptFile threw an exception.'
  },
  [FileTransferError.DOWNLOAD_NETWORK_ERROR]: {
    code: FileTransferError.DOWNLOAD_NETWORK_ERROR,
    message: 'Download failed — Check your connection.',
    technicalDescription: 'Fetch API call failed / network request aborted.'
  },
  [FileTransferError.DOWNLOAD_SERVER_ERROR]: {
    code: FileTransferError.DOWNLOAD_SERVER_ERROR,
    message: 'Download failed — Server returned an error when downloading the file.',
    technicalDescription: 'Server returned non-2xx status code during GET download.'
  },
  [FileTransferError.DOWNLOAD_NOT_FOUND]: {
    code: FileTransferError.DOWNLOAD_NOT_FOUND,
    message: 'Download failed — The requested file could not be found or has expired.',
    technicalDescription: 'Server returned HTTP 404 status code during GET download.'
  },
  [FileTransferError.DECRYPT_KEY_MISSING]: {
    code: FileTransferError.DECRYPT_KEY_MISSING,
    message: 'Decryption failed — Sender public key not found.',
    technicalDescription: 'Sender public key not available from socket or Firestore.'
  },
  [FileTransferError.DECRYPT_FAILED]: {
    code: FileTransferError.DECRYPT_FAILED,
    message: 'Decryption failed — The file may be corrupted or the key is invalid.',
    technicalDescription: 'CryptoService.decryptFile failed to decrypt ciphertext with derived shared secret.'
  },
  [FileTransferError.DECOMPRESS_FAILED]: {
    code: FileTransferError.DECOMPRESS_FAILED,
    message: 'Decompression failed after decryption.',
    technicalDescription: 'CompressionService.decompressFile threw an exception.'
  },
  [FileTransferError.RENDER_FAILED]: {
    code: FileTransferError.RENDER_FAILED,
    message: 'Rendering failed — File loaded successfully but format is unsupported or corrupted.',
    technicalDescription: 'Browser failed to render/decode or play the file format (img onError or audio error event).'
  },
  [FileTransferError.FILE_CAPTURE_EMPTY]: {
    code: FileTransferError.FILE_CAPTURE_EMPTY,
    message: 'Empty file captured — The file has no data or size is zero.',
    technicalDescription: 'Captured file size is 0 bytes or the file reference is empty.'
  },
  [FileTransferError.FILE_TYPE_UNSUPPORTED]: {
    code: FileTransferError.FILE_TYPE_UNSUPPORTED,
    message: 'Unsupported format — The file type is not supported.',
    technicalDescription: 'File MIME type validation check failed.'
  },
  [FileTransferError.FILE_TOO_LARGE]: {
    code: FileTransferError.FILE_TOO_LARGE,
    message: 'File too large — The selected file exceeds the 50MB limit.',
    technicalDescription: 'File size validation exceeded the maximum permitted size limit.'
  },
  [FileTransferError.UPLOAD_STALLED]: {
    code: FileTransferError.UPLOAD_STALLED,
    message: 'Upload stalled — No progress was made for 30 seconds.',
    technicalDescription: 'Upload stalled threshold reached (30 seconds of inactivity).'
  },
  [FileTransferError.UNKNOWN_ERROR]: {
    code: FileTransferError.UNKNOWN_ERROR,
    message: 'An unknown error occurred during the file transfer.',
    technicalDescription: 'Fallback error for uncaught exceptions in the pipeline.'
  }
};

export interface User {
  id: string;
  name: string;
  username: string;
  avatar: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  avatar?: string;
  text: string;
  timestamp: string;
  type: 'text' | 'file' | 'system' | 'video' | 'audio' | 'image';
  isE2E?: boolean;
  fileUrl?: string;
  url?: string;
  fileSize?: string;
  encryptedFileKey?: number[];
  iv?: number[];
  status?: 'sent' | 'delivered' | 'read' | 'pending' | 'uploading' | 'downloading' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  uploadProgress?: number;
  downloadProgress?: number;
  fileInfo?: {
    name: string;
    size: string;
    type: string;
    url?: string;
  };
  reactions?: { emoji: string, count: number }[];
  isOwn?: boolean;
}

export interface Chat {
  id: string;
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  isGroup?: boolean;
  name?: string;
  avatar?: string;
  description?: string;
  admins?: string[];
  messages?: Message[];
  isRestricted?: boolean;
  canAddMembers?: 'everyone' | 'admins';
  canEditProfile?: 'everyone' | 'admins';
  canSendMessage?: 'everyone' | 'admins';
  canStartCall?: 'everyone' | 'admins';
}

export interface Device {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'tv';
  status: 'online' | 'offline';
  connectionType?: string;
  lastSeen?: string;
  transferSpeed?: string;
  totalSent?: string;
  totalReceived?: string;
}

export interface Transfer {
  id: string;
  fileName: string;
  fileSize: string;
  progress: number;
  status: 'pending' | 'ongoing' | 'completed' | 'paused' | 'failed';
  speed?: string;
  eta?: string;
  deviceId: string;
  senderName?: string;
  fileType?: 'image' | 'video' | 'audio' | 'pdf' | 'zip' | 'document' | 'presentation' | 'code';
  previewUrl?: string;
}

export interface DataUsage {
  chatUploadBytes: number;
  chatDownloadBytes: number;
  callUploadBytes: number;
  callDownloadBytes: number;
  lastUpdated?: string;
}

export function parseFileSizeToBytes(sizeStr?: string | number): number {
  if (!sizeStr) return 0;
  if (typeof sizeStr === 'number') return sizeStr;
  const clean = sizeStr.trim().toUpperCase();
  const match = clean.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
  if (!match) {
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  const val = parseFloat(match[1]);
  const unit = match[2] || 'B';
  switch (unit) {
    case 'TB': return Math.round(val * 1024 * 1024 * 1024 * 1024);
    case 'GB': return Math.round(val * 1024 * 1024 * 1024);
    case 'MB': return Math.round(val * 1024 * 1024);
    case 'KB': return Math.round(val * 1024);
    default: return Math.round(val);
  }
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, idx)).toFixed(dm)) + ' ' + sizes[idx];
}

export interface Notification {
  id: string;
  type: 'message' | 'mention' | 'friend_request' | 'system_alert';
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  recipientId: string;
  title: string;
  body: string;
  chatId?: string;
  requestId?: string;
  status: 'created' | 'delivered' | 'read';
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}
