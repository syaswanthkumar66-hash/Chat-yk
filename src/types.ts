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
  status?: 'sent' | 'delivered' | 'read';
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
  status: 'ongoing' | 'completed' | 'paused' | 'failed';
  speed?: string;
  eta?: string;
  deviceId: string;
}
