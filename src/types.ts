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
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorDetail {
  code: FileTransferError;
  message: string;
  technicalDescription: string;
}

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
