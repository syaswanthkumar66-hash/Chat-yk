import { create } from 'zustand';
import { useSyncExternalStore, useRef } from 'react';
import { Chat, Message, Device, Transfer, Notification, DataUsage, parseFileSizeToBytes, formatBytes } from './types';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from './config';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let deviceId = localStorage.getItem('proto_device_id');
  if (!deviceId) {
    deviceId = `dev-${Math.random().toString(36).substring(2, 11)}`;
    safeLocalStorageSetItem('proto_device_id', deviceId);
  }
  return deviceId;
}

export type AppMode = 'social' | 'fileshare' | 'hub' | 'admin';

interface UserProfile {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  avatar: string;
  description: string;
  isFriend?: boolean;
  isAdmin?: boolean;
  isBanned?: boolean;
  isReported?: boolean;
  reportCount?: number;
  isInactive?: boolean;
  isOnline?: boolean;
  isInApp?: boolean;
  lastSeen?: string;
  joinDate: string;
  isAdminFlagged?: boolean;
  adminFlagCount?: number;
  adminFlagReasons?: string[];
  allowedTabs?: string[];
  teamRole?: string;
  accessibleTeamMembers?: string[];
  profileVisibility?: 'everyone' | 'friends' | 'none';
  notificationSettings?: {
    pushEnabled: boolean;
    previewEnabled: boolean;
    soundEnabled: boolean;
    vibrateEnabled: boolean;
  };
}

export interface FriendRequest {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  timestamp: string;
}

export interface GroupJoinRequest {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  timestamp: string;
}

export interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isAdmin: boolean;
}

export interface SupportTicket {
  id: string;
  userId: string;
  category: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved';
  timestamp: string;
  messages?: TicketMessage[];
}

export interface UserFeedback {
  id: string;
  userId: string;
  emoji: string;
  text: string;
  timestamp: string;
}

interface AppState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isLoggedIn: boolean;
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  updateUser: (data: Partial<UserProfile>) => void;
  login: (userData?: UserProfile, authMethod?: 'google' | 'local') => void;
  logout: () => void;
  deleteAccountPermanently: () => Promise<void>;
  deleteBrowserCacheOnly: () => Promise<void>;
  authMethod: 'google' | 'local' | null;
  wssStatus: 'disconnected' | 'connecting' | 'connected';
  isWssConnected: boolean;
  wssMessage: string;
  connectionLogs: string[];
  addConnectionLog: (log: string) => void;
  connectSpot: () => void;
  disconnectSpot: () => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  activeRecipientId: string | null;
  setActiveRecipientId: (id: string | null) => void;
  activeDeviceId: string | null;
  setActiveDeviceId: (id: string | null) => void;
  viewingUserId: string | null;
  setViewingUserId: (id: string | null) => void;
  activeGroupInfoId: string | null;
  setActiveGroupInfoId: (id: string | null) => void;
  joinGroupId: string | null;
  setJoinGroupId: (id: string | null) => void;
  selectedMessageIds: string[];
  setSelectedMessageIds: (ids: string[]) => void;
  toggleMessageSelection: (id: string) => void;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  friendRequests: FriendRequest[];
  setFriendRequests: (requests: FriendRequest[]) => void;
  acceptFriendRequest: (requestId: string) => void;
  rejectFriendRequest: (requestId: string) => void;
  sentFriendRequests: string[];
  sendFriendRequest: (userId: string) => void;
  cancelFriendRequest: (userId: string) => void;
  notifications: Notification[];
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  clearNotifications: () => Promise<void>;
  groupJoinRequests: GroupJoinRequest[];
  setGroupJoinRequests: (requests: GroupJoinRequest[]) => void;
  chats: Chat[];
  setChats: (chats: Chat[]) => void;
  typingUsers: Record<string, boolean>;
  setTypingUser: (userId: string, isTyping: boolean) => void;
  incomingMediaUploads: Record<string, {
    percent: number;
    mediaType: string;
    fileName?: string;
    messageId: string;
  }>;
  setIncomingMediaUpload: (senderId: string, data: { percent: number; mediaType: string; fileName?: string; messageId: string } | null) => void;
  activeGroupCall: { type: 'voice' | 'video', groupId?: string, userId?: string, roomId?: string } | null;
  setActiveGroupCall: (call: { type: 'voice' | 'video', groupId?: string, userId?: string, roomId?: string } | null) => void;
  incomingCall: { type: 'voice' | 'video', roomId: string, from: string } | null;
  setIncomingCall: (call: { type: 'voice' | 'video', roomId: string, from: string } | null) => void;
  blockedUserIds: string[];
  removedFriendIds: string[];
  removeFriend: (userId: string) => void;
  restoreFriend: (userId: string) => void;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  reportUser: (userId: string, reason?: string) => void;
  updateChatAvatar: (chatId: string, avatar: string) => void;
  updateChatSettings: (chatId: string, settings: { canAddMembers?: 'everyone' | 'admins', canEditProfile?: 'everyone' | 'admins', canSendMessage?: 'everyone' | 'admins', canStartCall?: 'everyone' | 'admins' }) => void;
  updateChatInfo: (chatId: string, info: { name?: string, description?: string }) => void;
  addChatMember: (chatId: string, userId: string) => void;
  removeChatMember: (chatId: string, userId: string) => void;
  toggleChatAdmin: (chatId: string, userId: string) => void;
  deleteChat: (chatId: string) => void;
  clearChatMessages: (chatId: string) => void;
  leaveChat: (chatId: string, userId: string) => void;
  createGroup: (data: { name: string, members: string[], avatar?: string, creatorId: string }) => string;
  tickets: SupportTicket[];
  addTicket: (ticket: Omit<SupportTicket, 'id' | 'status' | 'timestamp'>) => void;
  updateTicketStatus: (ticketId: string, status: SupportTicket['status']) => void;
  deleteTicket: (ticketId: string) => void;
  sendTicketMessage: (ticketId: string, text: string, isAdmin: boolean) => void;
  feedback: UserFeedback[];
  addFeedback: (feedback: Omit<UserFeedback, 'id' | 'userId' | 'timestamp'>) => void;
  deleteFeedback: (feedbackId: string) => void;
  broadcasts: { 
    id: string; 
    message: string; 
    type: 'info' | 'warning' | 'error' | 'success' | 'update' | 'critical' | 'announcement' | 'maintenance' | 'security'; 
    timestamp: string; 
    sender: string;
    audience?: 'all' | 'admins' | 'members' | 'users';
    persistence?: 'temporary' | 'persistent';
    actionLink?: string;
    scheduleDate?: string;
    selectiveAccess?: string[];
    reach?: number;
    clickRate?: number;
  }[];
  sendBroadcast: (message: string, type: 'info' | 'warning' | 'error' | 'success' | 'update' | 'critical' | 'announcement' | 'maintenance' | 'security', options?: {
    audience?: 'all' | 'admins' | 'members' | 'users';
    persistence?: 'temporary' | 'persistent';
    actionLink?: string;
    scheduleDate?: string;
    selectiveAccess?: string[];
  }) => void;
  deleteBroadcast: (id: string) => void;
  // Admin features
  systemSettings: {
    maintenanceMode: boolean;
    allowRegistration: boolean;
    maxFileSize: number;
    activeFeatures: string[];
  };
  updateSystemSettings: (settings: Partial<AppState['systemSettings']>) => void;
  onlineUserIds: string[];
  users: UserProfile[];
  banUser: (userId: string) => void;
  flagUser: (userId: string, reason: string) => void;
  promoteUser: (userId: string) => void;
  updateUserByAdmin: (userId: string, data: Partial<UserProfile>) => void;
  addUser: (user: Partial<UserProfile> & Omit<UserProfile, 'id'>) => void;
  sendMessage: (chatId: string | null, recipientId: string | null, text: string, type?: Message['type'], fileUrl?: string, fileSize?: string, e2eData?: { encryptedText: string, iv: number[], encryptedFileKey?: number[] }, isForwarded?: boolean, customId?: string) => void;
  updateMessageFileUrl: (messageId: string, fileUrl: string, fileSize?: string) => void;
  addPendingMessage: (chatId: string | null, recipientId: string | null, message: Message) => void;
  updateMessageProgress: (messageId: string, progress: number, status?: Message['status'], errorCode?: string) => void;
  deletedMsgIds: string[];
  globallyDeletedIds: string[];
  deleteMessageLocally: (messageId: string) => void;
  deleteMessageGlobally: (messageId: string) => void;
  socket: Socket | null;
  initSocket: (userId: string) => void;
  tempMessages: Message[];
  addTempMessage: (msg: Message) => void;
  clearTempMessages: () => void;
  inAppToasts: { id: string; title: string; body: string; avatar: string; chatId: string }[];
  addInAppToast: (toast: { title: string; body: string; avatar: string; chatId: string }) => void;
  removeInAppToast: (id: string) => void;
  cloudSyncStatus: 'syncing' | 'synced' | 'error' | null;
  setCloudSyncStatus: (status: 'syncing' | 'synced' | 'error' | null) => void;
  backendSyncStatus: 'idle' | 'checking' | 'mismatch' | 'syncing' | 'done' | 'error';
  backendSyncProgress: number;
  setBackendSyncStatus: (status: 'idle' | 'checking' | 'mismatch' | 'syncing' | 'done' | 'error') => void;
  setBackendSyncProgress: (progress: number) => void;
  reportFingerprint: () => void;
  resolveSyncMismatch: () => Promise<void>;
  devices: Device[];
  transfers: Transfer[];
  acceptTransfer: (transferId: string) => void;
  declineTransfer: (transferId: string) => void;
  offlineMessageQueue: { id: string, chatId: string | null, recipientId: string | null, text: string, type: string, fileUrl?: string, fileSize?: string, e2eData?: any }[];
  switchAccount: (userId: string) => Promise<void>;
  generateInitialsAvatar: (id: string, name: string) => string;
  selfTypingChats: Record<string, boolean>;
  setSelfTypingChat: (key: string, isTyping: boolean) => void;
  isSyncing: boolean;
  performCatchUpSync: () => Promise<void>;
  onlineDevices: string[];
  dataUsage: DataUsage;
  recordDataUsage: (type: 'chat_upload' | 'chat_download' | 'call_upload' | 'call_download', bytes: number) => void;
  resetDataUsage: () => void;
  loadDataUsage: (userId: string) => Promise<void>;
  currentDeviceId: string | null;
}

export const generateInitialsAvatar = (id: string, name: string): string => {
  const cleanName = (name || '').trim();
  let initials = '?';
  if (cleanName) {
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts[0]) {
      initials = parts[0].slice(0, 2).toUpperCase();
    }
  }

  let hash = 0;
  const str = id || name || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1',
    '#8b5cf6', '#ec4899', '#14b8a6', '#06b6d4', '#84cc16',
    '#f97316', '#64748b'
  ];
  const color = colors[Math.abs(hash) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="${color}" /><text x="50%" y="54%" font-family="&apos;Inter&apos;, system-ui, sans-serif" font-size="38" font-weight="600" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initials}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Throttled presence updates & debounced typing updates variables
let pendingStatusUpdates: Record<string, boolean> = {};
let statusThrottleTimeout: any = null;
let typingDebounceTimeouts: Record<string, any> = {};
let mediaUploadStaleTimeouts: Record<string, any> = {};

export const DEFAULT_PRESETS: UserProfile[] = [];

let heartbeatIntervalId: any = null;
let isWakingUp = false;
let lastSuccessfulWakeUpTime = 0;

export function safeLocalStorageSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    console.error(`[StorageError] Failed to write key "${key}" to localStorage:`, error);
    if (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    ) {
      console.warn(`[StorageError] LocalStorage quota exceeded for key "${key}"! Attempting cache pruning/compaction to recover...`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('storage_quota_exceeded', {
          detail: { key, error: error.message }
        }));
      }
      if (key.includes('chats')) {
        try {
          const chats = JSON.parse(value);
          if (Array.isArray(chats)) {
            const prunedChats = chats.map(c => {
              if (c.messages && c.messages.length > 20) {
                console.log(`[StorageError] Pruning chat "${c.id || c.name}" messages from ${c.messages.length} to 20`);
                return {
                  ...c,
                  messages: c.messages.slice(-20)
                };
              }
              return c;
            });
            const prunedValue = JSON.stringify(prunedChats);
            safeLocalStorageSetItem(key, prunedValue);
            console.log(`[StorageError] Successfully recovered from QuotaExceededError by pruning message history for key "${key}"`);
            return true;
          }
        } catch (pruneErr) {
          console.error(`[StorageError] Failed to prune chats for recovery:`, pruneErr);
        }
      }
    }
    return false;
  }
}

const getLocalStorageItem = (key: string, defaultValue: string = ''): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) || defaultValue;
  }
  return defaultValue;
};

const getLocalStorageJSON = <T>(key: string, defaultValue: T): T => {
  if (typeof window !== 'undefined') {
    const item = localStorage.getItem(key);
    if (item) {
      try {
        const parsed = JSON.parse(item);
        
        // --- Structural Validation Self-Check ---
        if (key.includes('chats')) {
          if (!Array.isArray(parsed)) {
            throw new Error(`Cached chats for "${key}" is not a valid array`);
          }
          for (const chat of parsed) {
            if (!chat || typeof chat !== 'object' || (!chat.id && !chat.name)) {
              throw new Error(`Corrupted chat object in cache key "${key}"`);
            }
          }
        } else if (key.includes('users') || key.includes('friendRequests') || key.includes('blockedUserIds') || key.includes('removedFriendIds')) {
          if (!Array.isArray(parsed)) {
            throw new Error(`Cached array for "${key}" is not a valid array`);
          }
        }
        
        return parsed as T;
      } catch (e: any) {
        console.error(`[StorageSelfCheck] Cache corruption/integrity failure detected for key "${key}":`, e.message || e);
        try {
          localStorage.removeItem(key);
          console.warn(`[StorageSelfCheck] Purged corrupted cache key "${key}" to avoid app crashes.`);
        } catch (rmErr) {
          console.error(`[StorageSelfCheck] Failed to remove corrupted key "${key}":`, rmErr);
        }
      }
    }
  }
  return defaultValue;
};

const cachedUser = getLocalStorageJSON<any>('proto_user', null);
const cachedIsLoggedIn = getLocalStorageItem('proto_isLoggedIn', 'false') === 'true';
const cachedAuthMethod = getLocalStorageItem('proto_authMethod', '') || null;

// Perform one-time migration of legacy keys to user-specific keys if cachedUser is available
if (typeof window !== 'undefined' && cachedUser?.id) {
  const legacyChats = localStorage.getItem('proto_chats');
  if (legacyChats && !localStorage.getItem(`proto_chats_${cachedUser.id}`)) {
    safeLocalStorageSetItem(`proto_chats_${cachedUser.id}`, legacyChats);
  }
  const legacyUsers = localStorage.getItem('proto_users');
  if (legacyUsers && !localStorage.getItem(`proto_users_${cachedUser.id}`)) {
    safeLocalStorageSetItem(`proto_users_${cachedUser.id}`, legacyUsers);
  }
  const legacyBlocked = localStorage.getItem('proto_blockedUserIds');
  if (legacyBlocked && !localStorage.getItem(`proto_blockedUserIds_${cachedUser.id}`)) {
    safeLocalStorageSetItem(`proto_blockedUserIds_${cachedUser.id}`, legacyBlocked);
  }
  const legacyRemoved = localStorage.getItem('proto_removedFriendIds');
  if (legacyRemoved && !localStorage.getItem(`proto_removedFriendIds_${cachedUser.id}`)) {
    safeLocalStorageSetItem(`proto_removedFriendIds_${cachedUser.id}`, legacyRemoved);
  }
  const legacyFR = localStorage.getItem('proto_friendRequests');
  if (legacyFR && !localStorage.getItem(`proto_friendRequests_${cachedUser.id}`)) {
    safeLocalStorageSetItem(`proto_friendRequests_${cachedUser.id}`, legacyFR);
  }
  const legacySFR = localStorage.getItem('proto_sentFriendRequests');
  if (legacySFR && !localStorage.getItem(`proto_sentFriendRequests_${cachedUser.id}`)) {
    safeLocalStorageSetItem(`proto_sentFriendRequests_${cachedUser.id}`, legacySFR);
  }

  // After copying to user-specific keys, clean up legacy global keys to prevent crossover for future logins
  localStorage.removeItem('proto_chats');
  localStorage.removeItem('proto_users');
  localStorage.removeItem('proto_blockedUserIds');
  localStorage.removeItem('proto_removedFriendIds');
  localStorage.removeItem('proto_friendRequests');
  localStorage.removeItem('proto_sentFriendRequests');
}

const cachedBlockedUserIds = cachedUser 
  ? getLocalStorageJSON<string[]>(`proto_blockedUserIds_${cachedUser.id}`, [])
  : [];
const cachedRemovedFriendIds = cachedUser 
  ? getLocalStorageJSON<string[]>(`proto_removedFriendIds_${cachedUser.id}`, [])
  : [];
const cachedUsers = cachedUser 
  ? getLocalStorageJSON<any[]>(`proto_users_${cachedUser.id}`, []).map(u => ({ ...u, isOnline: false }))
  : [];
const cachedChats = cachedUser 
  ? getLocalStorageJSON<any[]>(`proto_chats_${cachedUser.id}`, [])
  : [];
const cachedFriendRequests = cachedUser
  ? getLocalStorageJSON<any[]>(`proto_friendRequests_${cachedUser.id}`, [])
  : [];
const cachedSentFriendRequests = cachedUser
  ? getLocalStorageJSON<string[]>(`proto_sentFriendRequests_${cachedUser.id}`, [])
  : [];

let usageDebounceTimer: any = null;

function syncUsageToFirestore(userId: string, usage: DataUsage) {
  if (!userId || userId === 'u1') return;
  if (usageDebounceTimer) clearTimeout(usageDebounceTimer);
  usageDebounceTimer = setTimeout(() => {
    import('./firebase').then(({ db, doc, setDoc, OperationType, handleFirestoreError }) => {
      setDoc(doc(db, 'data_usage', userId), {
        userId,
        ...usage,
        lastUpdated: new Date().toISOString()
      }, { merge: true }).catch((err) => {
        try {
          handleFirestoreError(err, OperationType.WRITE, `data_usage/${userId}`);
        } catch (e) {
          console.warn("Firestore data_usage save error caught:", e);
        }
      });
    });
  }, 1500);
}

export const useAppStore = create<AppState>((set) => ({
  dataUsage: cachedUser
    ? getLocalStorageJSON<DataUsage>(`proto_data_usage_${cachedUser.id}`, {
        chatUploadBytes: 0,
        chatDownloadBytes: 0,
        callUploadBytes: 0,
        callDownloadBytes: 0
      })
    : {
        chatUploadBytes: 0,
        chatDownloadBytes: 0,
        callUploadBytes: 0,
        callDownloadBytes: 0
      },
  recordDataUsage: (type, bytes) => {
    if (!bytes || bytes <= 0 || isNaN(bytes)) return;
    set((state) => {
      const current = state.dataUsage || {
        chatUploadBytes: 0,
        chatDownloadBytes: 0,
        callUploadBytes: 0,
        callDownloadBytes: 0
      };
      const updated: DataUsage = {
        ...current,
        chatUploadBytes: type === 'chat_upload' ? current.chatUploadBytes + Math.round(bytes) : current.chatUploadBytes,
        chatDownloadBytes: type === 'chat_download' ? current.chatDownloadBytes + Math.round(bytes) : current.chatDownloadBytes,
        callUploadBytes: type === 'call_upload' ? current.callUploadBytes + Math.round(bytes) : current.callUploadBytes,
        callDownloadBytes: type === 'call_download' ? current.callDownloadBytes + Math.round(bytes) : current.callDownloadBytes,
        lastUpdated: new Date().toISOString()
      };
      if (typeof window !== 'undefined' && state.user?.id) {
        try {
          safeLocalStorageSetItem(`proto_data_usage_${state.user.id}`, JSON.stringify(updated));
        } catch (e) {}
      }
      if (state.user?.id) {
        syncUsageToFirestore(state.user.id, updated);
      }
      return { dataUsage: updated };
    });
  },
  resetDataUsage: () => {
    set((state) => {
      const resetUsage: DataUsage = {
        chatUploadBytes: 0,
        chatDownloadBytes: 0,
        callUploadBytes: 0,
        callDownloadBytes: 0,
        lastUpdated: new Date().toISOString()
      };
      if (typeof window !== 'undefined' && state.user?.id) {
        try {
          localStorage.removeItem(`proto_data_usage_${state.user.id}`);
        } catch (e) {}
      }
      if (state.user?.id) {
        syncUsageToFirestore(state.user.id, resetUsage);
      }
      return { dataUsage: resetUsage };
    });
  },
  loadDataUsage: async (userId: string) => {
    if (!userId) return;
    let localData: DataUsage | null = null;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`proto_data_usage_${userId}`);
        if (raw) localData = JSON.parse(raw);
      } catch (e) {}
    }
    if (localData) {
      set({ dataUsage: localData });
    }
    try {
      const { db, doc, getDoc } = await import('./firebase');
      const snap = await getDoc(doc(db, 'data_usage', userId));
      if (snap.exists()) {
        const remoteData = snap.data() as DataUsage;
        const merged: DataUsage = {
          chatUploadBytes: Math.max(localData?.chatUploadBytes || 0, remoteData.chatUploadBytes || 0),
          chatDownloadBytes: Math.max(localData?.chatDownloadBytes || 0, remoteData.chatDownloadBytes || 0),
          callUploadBytes: Math.max(localData?.callUploadBytes || 0, remoteData.callUploadBytes || 0),
          callDownloadBytes: Math.max(localData?.callDownloadBytes || 0, remoteData.callDownloadBytes || 0),
          lastUpdated: remoteData.lastUpdated || new Date().toISOString()
        };
        set({ dataUsage: merged });
        if (typeof window !== 'undefined') {
          try {
            safeLocalStorageSetItem(`proto_data_usage_${userId}`, JSON.stringify(merged));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("Could not fetch data usage from firestore:", e);
    }
  },
  onlineUserIds: [] as string[],
  offlineMessageQueue: cachedUser ? getLocalStorageJSON<{ id: string, chatId: string | null, recipientId: string | null, text: string, type: string, fileUrl?: string, fileSize?: string, e2eData?: any }[]>(`proto_offlineMessageQueue_${cachedUser.id}`, []) : [],
  generateInitialsAvatar: generateInitialsAvatar,
  autoSyncEnabled: getLocalStorageJSON<boolean>('auto_sync_enabled', true),
  setAutoSyncEnabled: (enabled: boolean) => {
    if (typeof window !== 'undefined') {
      safeLocalStorageSetItem('auto_sync_enabled', JSON.stringify(enabled));
    }
    set({ autoSyncEnabled: enabled });
  },
  devices: [
    { id: 'd1', name: 'MacBook Pro', type: 'desktop', status: 'online', connectionType: 'Wi-Fi Direct', transferSpeed: '45.2 Mbps', totalSent: '12.4 GB', totalReceived: '8.7 GB' },
    { id: 'd2', name: 'iPhone 15 Pro', type: 'mobile', status: 'online', connectionType: 'Wi-Fi Direct', transferSpeed: '32.1 Mbps', totalSent: '4.1 GB', totalReceived: '2.3 GB' },
    { id: 'd3', name: "Sarah's iPad", type: 'tablet', status: 'offline', connectionType: 'Bluetooth 5.3', transferSpeed: '0 Mbps', totalSent: '1.2 GB', totalReceived: '0.8 GB' }
  ],
  transfers: [
    { id: 't1', fileName: 'vacation_photos.zip', fileSize: '450.2 MB', progress: 68, status: 'ongoing', speed: '12.4 MB/s', eta: '12s', deviceId: 'd2', senderName: 'iPhone 15 Pro', fileType: 'zip' },
    { id: 't2', fileName: 'marketing_deck_draft.key', fileSize: '45.8 MB', progress: 0, status: 'pending', deviceId: 'd2', senderName: 'iPhone 15 Pro', fileType: 'presentation' },
    { id: 't3', fileName: 'design_system_preview.png', fileSize: '4.2 MB', progress: 0, status: 'pending', deviceId: 'd2', senderName: 'iPhone 15 Pro', fileType: 'image', previewUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=300&q=80' },
    { id: 't4', fileName: 'invoice_june_2026.pdf', fileSize: '1.1 MB', progress: 0, status: 'pending', deviceId: 'd1', senderName: 'MacBook Pro', fileType: 'pdf' },
    { id: 't5', fileName: 'intro_teaser.mp4', fileSize: '185.0 MB', progress: 0, status: 'pending', deviceId: 'd1', senderName: 'MacBook Pro', fileType: 'video', previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80' }
  ],
  acceptTransfer: (transferId) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === transferId
          ? { ...t, status: 'ongoing' as const, progress: 0, speed: '15.4 MB/s', eta: 'Calculating...' }
          : t
      ),
    }));

    // Simulate transfer progress increment
    const interval = setInterval(() => {
      let isDone = false;
      set((state) => {
        const updated = state.transfers.map((t) => {
          if (t.id === transferId && t.status === 'ongoing') {
            const nextProgress = Math.min(t.progress + Math.floor(Math.random() * 15) + 10, 100);
            if (nextProgress === 100) {
              isDone = true;
              return { ...t, progress: 100, status: 'completed' as const, speed: undefined, eta: undefined };
            }
            return { ...t, progress: nextProgress, speed: `${(15 + Math.random() * 5).toFixed(1)} MB/s`, eta: `${Math.ceil((100 - nextProgress) / 10)}s` };
          }
          return t;
        });
        return { transfers: updated };
      });

      if (isDone) {
        clearInterval(interval);
      }
    }, 500);
  },
  declineTransfer: (transferId) => {
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== transferId),
    }));
  },
  deletedMsgIds: [],
  globallyDeletedIds: [],
  deleteMessageLocally: (messageId) => {
    set((state) => ({
      deletedMsgIds: [...state.deletedMsgIds, messageId]
    }));
    if (useAppStore.getState().authMethod === 'local') return;
    import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, deleteDoc }) => {
      deleteDoc(doc(db, 'offline_messages', messageId)).catch((err) => {
        try {
          handleFirestoreError(err, OperationType.DELETE, `offline_messages/${messageId}`);
        } catch (e) {
          console.error("Gracefully caught offline message delete error:", e);
        }
      });
    });
  },
  deleteMessageGlobally: (messageId) => {
    set((state) => ({
      globallyDeletedIds: [...state.globallyDeletedIds, messageId]
    }));
    if (useAppStore.getState().authMethod === 'local') return;
    import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, deleteDoc }) => {
      deleteDoc(doc(db, 'offline_messages', messageId)).catch((err) => {
        try {
          handleFirestoreError(err, OperationType.DELETE, `offline_messages/${messageId}`);
        } catch (e) {
          console.error("Gracefully caught offline message delete error:", e);
        }
      });
    });
  },
  mode: 'hub',
  setMode: (mode) => set({ mode, activeChatId: null, activeRecipientId: null, activeDeviceId: null, viewingUserId: null, joinGroupId: null, selectedMessageIds: [] }),
  isLoggedIn: cachedIsLoggedIn,
  user: cachedUser,
  setUser: (user) => {
    set({ user });
    if (typeof window !== 'undefined') {
      if (user) {
        safeLocalStorageSetItem('proto_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('proto_user');
      }
    }
  },
  updateUser: (data) => set((state) => {
    const updatedUser = state.user ? { ...state.user, ...data } : null;
    if (typeof window !== 'undefined' && updatedUser) {
      safeLocalStorageSetItem('proto_user', JSON.stringify(updatedUser));
    }
    // Also update in Firestore in background if available
    if (state.user && state.authMethod !== 'local') {
      import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, updateDoc }) => {
        updateDoc(doc(db, 'users', state.user!.id), data).catch(err => {
          console.error("Failed to sync user profile update to Firestore:", err);
          try {
            handleFirestoreError(err, OperationType.WRITE, `users/${state.user!.id}`);
          } catch (e) {
            console.error("Gracefully caught user profile sync write error:", e);
          }
        });
      });
    }
    if (state.socket && state.socket.connected && updatedUser) {
      state.socket.emit('broadcast_user_profile', { user: updatedUser });
    }
    return { user: updatedUser };
  }),
  authMethod: cachedAuthMethod as any,
  wssStatus: 'disconnected',
  isWssConnected: false,
  wssMessage: '',
  connectionLogs: [] as string[],
  addConnectionLog: (log) => set((state) => {
    const timestamp = new Date().toLocaleTimeString();
    const formattedLog = `[${timestamp}] ${log}`;
    console.log(formattedLog);
    return { connectionLogs: [formattedLog, ...state.connectionLogs].slice(0, 50) };
  }),
  connectSpot: () => {
    const state = useAppStore.getState();
    if (state.user) {
      state.addConnectionLog('Connection requested by user. Connecting...');
      set({ wssStatus: 'connecting', wssMessage: 'Connecting...' });
      state.initSocket(state.user.id);
    }
  },
  disconnectSpot: () => {
    const state = useAppStore.getState();
    state.addConnectionLog('Disconnect requested by user.');
    if (state.socket) {
      state.socket.disconnect();
    }
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    set({ 
      wssStatus: 'disconnected', 
      isWssConnected: false,
      wssMessage: 'Disconnected',
      socket: null 
    });
  },
  login: (userData, authMethod = 'google') => {
    const user = userData || {
      id: 'u1',
      username: 'sarah_c',
      displayName: 'Sarah Chen',
      avatar: generateInitialsAvatar('u1', 'Sarah Chen'),
      description: 'Senior Product Designer & Tech Enthusiast',
      isAdmin: true,
      joinDate: new Date('2023-01-15').toISOString(),
      profileVisibility: 'everyone',
      notificationSettings: {
        pushEnabled: true,
        previewEnabled: true,
        soundEnabled: true,
        vibrateEnabled: true
      }
    };

    // Load per-user chats from localStorage
    let userChats: any[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`proto_chats_${user.id}`);
      if (stored) {
        try {
          userChats = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored chats for user", user.id, e);
        }
      }
    }

    // Load per-user users (friends) list from localStorage
    let userUsers: any[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`proto_users_${user.id}`);
      if (stored) {
        try {
          userUsers = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored users for user", user.id, e);
        }
      }
    }

    // Load per-user friend requests from localStorage
    let userFriendRequests: any[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`proto_friendRequests_${user.id}`);
      if (stored) {
        try {
          userFriendRequests = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored friend requests for user", user.id, e);
        }
      }
    }

    // Load per-user sent friend requests from localStorage
    let userSentFriendRequests: string[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`proto_sentFriendRequests_${user.id}`);
      if (stored) {
        try {
          userSentFriendRequests = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored sent friend requests for user", user.id, e);
        }
      }
    }

    // Load per-user blocked user IDs from localStorage
    let userBlockedUserIds: string[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`proto_blockedUserIds_${user.id}`);
      if (stored) {
        try {
          userBlockedUserIds = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored blocked user IDs for user", user.id, e);
        }
      }
    }

    // Load per-user removed friend IDs from localStorage
    let userRemovedFriendIds: string[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`proto_removedFriendIds_${user.id}`);
      if (stored) {
        try {
          userRemovedFriendIds = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored removed friend IDs for user", user.id, e);
        }
      }
    }

    set({ 
      isLoggedIn: true, 
      user,
      authMethod,
      chats: userChats,
      friendRequests: userFriendRequests,
      sentFriendRequests: userSentFriendRequests,
      blockedUserIds: userBlockedUserIds,
      removedFriendIds: userRemovedFriendIds,
      groupJoinRequests: [],
      onlineUserIds: [],
      users: userUsers
    });
    
    if (typeof window !== 'undefined') {
      safeLocalStorageSetItem('proto_user', JSON.stringify(user));
      safeLocalStorageSetItem('proto_isLoggedIn', 'true');
      safeLocalStorageSetItem('proto_authMethod', authMethod);
    }

    // Load user data usage stats
    useAppStore.getState().loadDataUsage(user.id);

    // Set scoped Firebase instance and register account with sessionIntegrityService asynchronously
    import('./firebase').then(({ setScopedUserInstance }) => {
      setScopedUserInstance(user.id);
    }).catch(console.error);

    import('./services/sessionIntegrityService').then(({ sessionIntegrityService }) => {
      sessionIntegrityService.registerAccount({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        authMethod: authMethod,
        email: (user as any).email || 'developer@protocol.net'
      });
    }).catch(console.error);
    
    // Automatically connect on-the-spot connections for both login methods.
    useAppStore.getState().initSocket(user.id);
  },
  logout: () => {
    const state = useAppStore.getState();
    const userId = state.user?.id;

    if (state.socket) {
      state.socket.disconnect();
    }

    // Clean up push subscription on server
    if (userId && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        try {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await fetch(`${BACKEND_URL}/api/remove-subscription`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, endpoint: sub.endpoint })
            });
            console.log("Successfully removed push subscription on logout");
          }
        } catch (subErr) {
          console.warn("Failed to clean up subscription on logout:", subErr);
        }
      }).catch(err => console.warn("ServiceWorker ready error on logout:", err));
    }

    // Sign out of Firebase if initialized
    import('./firebase').then(({ auth, setScopedUserInstance }) => {
      if (auth.currentUser) {
        auth.signOut();
      }
      setScopedUserInstance(null);
    }).catch(err => console.error("Firebase auth sign out failed", err));

    if (typeof window !== 'undefined') {
      localStorage.removeItem('proto_user');
      localStorage.removeItem('proto_isLoggedIn');
      localStorage.removeItem('proto_authMethod');
      localStorage.removeItem('proto_blockedUserIds');
      localStorage.removeItem('proto_removedFriendIds');
      localStorage.removeItem('proto_users');
      localStorage.removeItem('proto_chats');
      localStorage.removeItem('proto_friendRequests');
      localStorage.removeItem('proto_sentFriendRequests');
    }

    set({ 
      isLoggedIn: false, 
      mode: 'hub', 
      user: null, 
      users: [],
      chats: [],
      authMethod: null,
      wssStatus: 'disconnected',
      isWssConnected: false,
      wssMessage: '',
      selectedMessageIds: [], 
      friendRequests: [], 
      sentFriendRequests: [], 
      blockedUserIds: [],
      removedFriendIds: [],
      groupJoinRequests: [], 
      offlineMessageQueue: [],
      socket: null,
      typingUsers: {},
      onlineUserIds: [],
      incomingMediaUploads: {},
      notifications: [],
      activeChatId: null,
      activeRecipientId: null,
      activeDeviceId: null,
      viewingUserId: null,
      activeGroupInfoId: null,
      joinGroupId: null,
      deletedMsgIds: [],
      globallyDeletedIds: [],
      tempMessages: [],
      inAppToasts: [],
      cloudSyncStatus: null,
      backendSyncStatus: 'idle',
      backendSyncProgress: 0,
      selfTypingChats: {},
      isSyncing: false,
      onlineDevices: []
    });

    // Clear crypto service session keys
    import('./services/cryptoService').then(({ cryptoService }) => {
      cryptoService.clearState();
    });

    // Cleanup device sync state
    import('./services/deviceSyncService').then(({ deviceSyncService }) => {
      deviceSyncService.cleanup();
    });
  },
  deleteAccountPermanently: async () => {
    const state = useAppStore.getState();
    const userId = state.user?.id;
    const email = state.user?.email;

    if (!userId) {
      state.logout();
      return;
    }

    try {
      console.log(`[Store Delete Account] Initiating permanent deletion for user: ${userId}`);

      // 1. Call backend delete account endpoint to wipe server & friend references
      await fetch(`${BACKEND_URL}/api/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email })
      }).catch(err => console.warn("[Store Delete Account] Backend call warning:", err));

      // 2. Client-side Firestore doc cleanup
      try {
        const { db, deleteDoc, doc, collection, query, where, getDocs } = await import('./firebase');
        await deleteDoc(doc(db, 'users', userId)).catch(() => {});

        const notifQuery = query(collection(db, 'notifications'), where('userId', '==', userId));
        const notifDocs = await getDocs(notifQuery).catch(() => null);
        if (notifDocs) {
          for (const d of notifDocs.docs) {
            await deleteDoc(doc(db, 'notifications', d.id)).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[Store Delete Account] Client Firestore deletion fallback warning:", e);
      }

      // 3. Purge IndexedDB databases
      if (typeof window !== 'undefined' && window.indexedDB) {
        try {
          indexedDB.deleteDatabase(`audio-storage-db_${userId}`);
          indexedDB.deleteDatabase(`voice-note-cache-db_${userId}`);
          indexedDB.deleteDatabase(`audio-storage-db`);
          indexedDB.deleteDatabase(`voice-note-cache-db`);
        } catch (idbErr) {
          console.warn("[Store Delete Account] IndexedDB purge warning:", idbErr);
        }
      }

      // 4. Purge Cache Storage API
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (cErr) {
          console.warn("[Store Delete Account] Caches API purge warning:", cErr);
        }
      }

      // 5. Clear localStorage and sessionStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (sErr) {
          console.warn("[Store Delete Account] Web storage clear warning:", sErr);
        }
      }

      // 6. Complete logout and reset
      state.logout();
    } catch (err) {
      console.error("Error during deleteAccountPermanently:", err);
      state.logout();
    }
  },
  deleteBrowserCacheOnly: async () => {
    const state = useAppStore.getState();
    const userId = state.user?.id;

    console.log(`[Store Cache Purge] Purging browser cached data permanently...`);

    // 1. Purge IndexedDB databases
    if (typeof window !== 'undefined' && window.indexedDB) {
      try {
        if (userId) {
          indexedDB.deleteDatabase(`audio-storage-db_${userId}`);
          indexedDB.deleteDatabase(`voice-note-cache-db_${userId}`);
        }
        indexedDB.deleteDatabase(`audio-storage-db`);
        indexedDB.deleteDatabase(`voice-note-cache-db`);
      } catch (idbErr) {
        console.warn("[Store Cache Purge] IndexedDB purge warning:", idbErr);
      }
    }

    // 2. Purge Cache Storage API
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (cErr) {
        console.warn("[Store Cache Purge] Caches API purge warning:", cErr);
      }
    }

    // 3. Clear temporary cached voice notes, blobs, and cached data from localStorage & sessionStorage
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();

        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.startsWith('voice_note_') ||
            key.startsWith('cached_media_') ||
            key.startsWith('audio_') ||
            key.startsWith('proto_chats_') ||
            key.startsWith('proto_users_') ||
            key.startsWith('proto_friendRequests_') ||
            key.startsWith('pending_profile_sync_')
          )) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (sErr) {
        console.warn("[Store Cache Purge] Web storage cache clear warning:", sErr);
      }
    }

    // 4. Re-sync user data from Firestore so active account session stays alive seamlessly
    if (userId) {
      try {
        const { db, doc, getDoc } = await import('./firebase');
        const userSnap = await getDoc(doc(db, 'users', userId)).catch(() => null);
        if (userSnap && userSnap.exists()) {
          const freshData = userSnap.data();
          if (freshData) {
            state.updateUser(freshData);
          }
        }
      } catch (e) {
        console.warn("[Store Cache Purge] Re-sync notice:", e);
      }
    }
  },
  switchAccount: async (userId) => {
    const { sessionIntegrityService } = await import('./services/sessionIntegrityService');
    const accounts = sessionIntegrityService.getSavedAccounts();
    const targetAccount = accounts.find(acc => acc.id === userId);
    if (!targetAccount) {
      console.error(`Account ${userId} not found in saved list.`);
      return;
    }

    // Explicitly logout first to fully purge the in-memory state of the previous account
    const state = useAppStore.getState();
    state.logout();

    // Set scoped Firebase first
    const { setScopedUserInstance } = await import('./firebase');
    setScopedUserInstance(targetAccount.id);

    // Construct profile and call login to re-read per-user localized cache
    const userProfile = {
      id: targetAccount.id,
      username: targetAccount.username,
      displayName: targetAccount.displayName,
      avatar: targetAccount.avatar,
      description: 'Protocol user profile',
      joinDate: new Date().toISOString(),
      profileVisibility: 'everyone' as const,
      notificationSettings: {
        pushEnabled: true,
        previewEnabled: true,
        soundEnabled: false,
        vibrateEnabled: true
      }
    };
    state.login(userProfile, targetAccount.authMethod);
  },
  performCatchUpSync: async () => {
    const state = useAppStore.getState();
    const userId = state.user?.id;
    if (!userId) return;

    const now = Date.now();
    const lastSyncTime = (window as any).__lastCatchUpSyncTime || 0;
    if (now - lastSyncTime < 10000) {
      console.log('[Catch-Up Sync] Throttled: Catch-up sync already executed in the last 10 seconds.');
      return;
    }
    (window as any).__lastCatchUpSyncTime = now;

    if ((window as any).__catchUpSyncInFlight) {
      console.log('[Catch-Up Sync] Sync already in progress, skipping redundant call.');
      return;
    }
    (window as any).__catchUpSyncInFlight = true;
    set({ isSyncing: true });

    try {
      console.log('[Catch-Up Sync] Starting catch-up sync for user:', userId);

      // Sync any pushed messages from service worker cache first
      await syncPushedMessagesFromCache().catch((err) => console.error('[Catch-Up Sync] Error syncing pushed messages:', err));

      // 1. Re-emit register to socket and re-join group rooms
      const socket = state.socket;
      if (socket && socket.connected) {
        state.addConnectionLog('Catch-up Sync: Re-registering socket and re-joining rooms...');
        const { cryptoService } = await import('./services/cryptoService');
        const publicKey = await cryptoService.getMyPublicKeyBase64(userId).catch(() => '');
        const deviceId = getOrCreateDeviceId();
        socket.emit('register', { userId, publicKey, deviceId });
        socket.emit('get_online_users');

        // 2. Re-join group rooms
        state.chats.forEach(chat => {
          if (chat.isGroup) {
            socket.emit('join_group', chat.id);
          }
        });
      }

      // 3. Fetch Cloud Sync (pull latest chats/messages/friends/blocked) from Firestore
      if (state.authMethod !== 'local' && navigator.onLine) {
        const { db, doc, getDoc, collection, query, where, getDocs, updateDoc, auth } = await import('./firebase');
        
        // Prevent permission-denied crashes if the authenticated Firebase user does not match the active user profile
        if (!auth.currentUser || auth.currentUser.uid !== userId) {
          console.warn(`[Catch-Up Sync] Skipping Firestore sync because active profile (${userId}) does not match authenticated Firebase user (${auth.currentUser?.uid || 'none'}).`);
          return;
        }

        // Retrieve the stored lastSyncedAt timestamp
        const storageKey = `proto_last_synced_at_${userId}`;
        const lastSyncedAt = localStorage.getItem(storageKey) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Pull latest cloud sync document
        const syncDocRef = doc(db, 'cloud_syncs', userId);
        const syncSnapshot = await getDoc(syncDocRef);
        if (syncSnapshot.exists()) {
          const syncData = syncSnapshot.data();
          if (syncData && syncData.lastUpdated && syncData.lastUpdated > lastSyncedAt) {
            console.log('[Catch-Up Sync] Merging updated state from cloud_syncs...');
            const { mergeCloudSyncPayload } = await import('./store');
            mergeCloudSyncPayload(syncData, userId);
            (window as any).__lastUploadedSyncTime = syncData.lastUpdated;
          }
        }

        // Pull and deliver any missed notifications (since lastSyncedAt)
        const notificationsRef = collection(db, 'notifications');
        const qNotifs = query(notificationsRef, where('recipientId', '==', userId));
        const notifSnapshot = await getDocs(qNotifs);
        const missedNotifs: any[] = [];
        notifSnapshot.forEach(docSnap => {
          const notif = docSnap.data();
          if (notif.createdAt && notif.createdAt > lastSyncedAt) {
            missedNotifs.push({ id: docSnap.id, ...notif });
          }
        });

        if (missedNotifs.length > 0) {
          console.log(`[Catch-Up Sync] Found ${missedNotifs.length} new notifications since ${lastSyncedAt}`);
          const currentNotifs = useAppStore.getState().notifications;
          const mergedNotifs = [...missedNotifs, ...currentNotifs];
          // deduplicate
          const uniqueNotifs = mergedNotifs.filter((n, idx, self) => self.findIndex(x => x.id === n.id) === idx);
          uniqueNotifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          set({ notifications: uniqueNotifs });

          // Mark as delivered in Firestore
          for (const notif of missedNotifs) {
            if (notif.status === 'created') {
              try {
                await updateDoc(doc(db, 'notifications', notif.id), { status: 'delivered', deliveredAt: new Date().toISOString() });
              } catch (e) {
                console.error("Failed to mark delivered during catch-up:", e);
              }
            }
          }
        }

        // Update lastSyncedAt
        const nextSyncTime = new Date().toISOString();
        safeLocalStorageSetItem(storageKey, nextSyncTime);
        console.log('[Catch-Up Sync] Catch-up sync finished successfully. Updated lastSyncedAt:', nextSyncTime);
      }
    } catch (err) {
      console.error('[Catch-Up Sync] Failed during sync:', err);
      set({ backendSyncStatus: 'error' });
    } finally {
      (window as any).__catchUpSyncInFlight = false;
      set({ isSyncing: false });
      useAppStore.getState().reportFingerprint();
    }
  },
  socket: null,
  tempMessages: [],
  addTempMessage: (msg) => set((state) => ({ tempMessages: [...state.tempMessages, msg] })),
  clearTempMessages: () => set({ tempMessages: [] }),
  inAppToasts: [],
  cloudSyncStatus: null,
  setCloudSyncStatus: (status) => set({ cloudSyncStatus: status }),
  backendSyncStatus: 'idle',
  backendSyncProgress: 0,
  setBackendSyncStatus: (status) => set({ backendSyncStatus: status }),
  setBackendSyncProgress: (progress) => set({ backendSyncProgress: progress }),
  reportFingerprint: () => {
    const state = useAppStore.getState();
    if (state.socket && state.socket.connected && state.user) {
      const fingerprint = calculateLocalChatFingerprint();
      console.log("[Sync-Check] Reporting fingerprint to backend:", fingerprint);
      state.socket.emit("report_fingerprint", { fingerprint });
    }
  },
  resolveSyncMismatch: async () => {
    const state = useAppStore.getState();
    const userId = state.user?.id;
    if (!userId) return;

    set({ backendSyncStatus: 'syncing', backendSyncProgress: 10 });

    try {
      const { db, doc, getDoc } = await import('./firebase');
      const syncDocRef = doc(db, 'cloud_syncs', userId);
      
      set({ backendSyncProgress: 35 });
      const syncSnapshot = await getDoc(syncDocRef);
      
      set({ backendSyncProgress: 60 });
      if (syncSnapshot.exists()) {
        const syncData = syncSnapshot.data();
        if (syncData) {
          set({ backendSyncProgress: 80 });
          const { mergeCloudSyncPayload } = await import('./store');
          mergeCloudSyncPayload(syncData, userId);
          
          set({ backendSyncProgress: 95 });
          const storageKey = `proto_last_synced_at_${userId}`;
          safeLocalStorageSetItem(storageKey, syncData.lastUpdated || new Date().toISOString());
          (window as any).__lastUploadedSyncTime = syncData.lastUpdated;
          
          state.reportFingerprint();
        }
      }
      
      set({ backendSyncProgress: 100, backendSyncStatus: 'done' });
      
      setTimeout(() => {
        if (useAppStore.getState().backendSyncStatus === 'done') {
          set({ backendSyncStatus: 'idle', backendSyncProgress: 0 });
        }
      }, 2000);

    } catch (err) {
      console.error("[Sync-Check] Failed to resolve mismatch:", err);
      set({ backendSyncStatus: 'error', backendSyncProgress: 0 });
    }
  },
  addInAppToast: (toast) => set((state) => {
    const id = `toast-${Math.random().toString(36).substr(2, 9)}`;
    return {
      inAppToasts: [...state.inAppToasts, { ...toast, id }]
    };
  }),
  removeInAppToast: (id) => set((state) => ({
    inAppToasts: state.inAppToasts.filter(t => t.id !== id)
  })),
  initSocket: (userId) => {
    const state = useAppStore.getState();
    if (state.socket) {
      return;
    }

    let targetUrl = BACKEND_URL;
    if (!targetUrl && typeof window !== 'undefined' && window.location) {
      if (window.location.origin && window.location.origin !== 'null') {
        targetUrl = window.location.origin;
      } else {
        try {
          const href = window.location.href;
          if (href && href.startsWith('http')) {
            targetUrl = new URL(href).origin;
          }
        } catch (_) {}
      }
    }
    if (!targetUrl) {
      targetUrl = window.location.origin || '';
    }

    state.addConnectionLog(`Initializing connection to backend server at: ${targetUrl}`);
    set({ wssStatus: 'connecting', wssMessage: 'Initializing connection...' });

    // Function to wake up backend via HTTP ping with exponential backoff
    const wakeUp = async () => {
      // If we are already connected, or already in the middle of waking up, do not start again
      if (useAppStore.getState().wssStatus === 'connected') {
        return;
      }
      if (isWakingUp) {
        return;
      }
      // If we successfully woke up the server very recently (within 30 seconds),
      // we assume it is still awake and we just let socket.io's built-in reconnection do the job.
      if (Date.now() - lastSuccessfulWakeUpTime < 30000) {
        useAppStore.getState().addConnectionLog('Backend was recently verified to be awake. Relying on socket.io automatic reconnection...');
        if (useAppStore.getState().socket && !useAppStore.getState().isWssConnected) {
          useAppStore.getState().socket.connect();
        }
        return;
      }

      isWakingUp = true;
      
      const maxAttempts = 20;
      let attempt = 0;
      let delay = 1000; // Start with 1 second delay
      
      while (attempt < maxAttempts) {
        const currentStatus = useAppStore.getState().wssStatus;
        // If already connected, stop waking up
        if (currentStatus === 'connected') {
          lastSuccessfulWakeUpTime = Date.now();
          isWakingUp = false;
          return;
        }

        attempt++;
        const msg = `Waking up backend server... Attempt ${attempt}/${maxAttempts} (retrying in ${delay / 1000}s)`;
        set({ wssStatus: 'connecting', wssMessage: msg });
        useAppStore.getState().addConnectionLog(msg);
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          
          let success = false;
          const cacheBusterUrl = `${targetUrl}/api/health?_t=${Date.now()}`;
          try {
            const response = await fetch(cacheBusterUrl, {
              signal: controller.signal,
              headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
              }
            });
            if (response.ok) {
              success = true;
            }
          } catch (err) {
            // Fallback to no-cors mode to bypass CORS blocking on external domains
            try {
              const noCorsController = new AbortController();
              const noCorsTimeoutId = setTimeout(() => noCorsController.abort(), 4000);
              await fetch(cacheBusterUrl, {
                mode: 'no-cors',
                signal: noCorsController.signal,
                headers: { 'Cache-Control': 'no-cache' }
              });
              clearTimeout(noCorsTimeoutId);
              success = true;
            } catch (noCorsErr) {
              console.log(`Wakeup no-cors attempt ${attempt} failed:`, noCorsErr);
            }
          }
          
          clearTimeout(timeoutId);
          
          if (success) {
            lastSuccessfulWakeUpTime = Date.now();
            set({ wssMessage: 'Backend is awake! Connecting...' });
            useAppStore.getState().addConnectionLog('Backend server is awake! Establishing socket connection...');
            
            // Connect the socket explicitly
            if (useAppStore.getState().socket) {
              useAppStore.getState().socket.connect();
            }
            break;
          }
        } catch (err) {
          console.log(`Wakeup attempt ${attempt} failed:`, err);
        }
        
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 30000); // Exponential backoff up to 30 seconds
      }
      
      isWakingUp = false;
    };

    const doHeartbeatPing = async () => {
      const currentStatus = useAppStore.getState().wssStatus;
      const sock = useAppStore.getState().socket;
      if (currentStatus !== 'connected' || !sock) {
        return;
      }
      
      console.log('Heartbeat: Keep-alive ping to prevent server sleep...');
      
      // Emit Socket.IO level keep-alive frame
      try {
        sock.emit('ping_server', { timestamp: Date.now() });
      } catch (_) {}

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        let success = false;
        const cacheBusterUrl = `${targetUrl}/api/health?_t=${Date.now()}`;
        try {
          const response = await fetch(cacheBusterUrl, {
            signal: controller.signal,
            headers: { 
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
          });
          if (response.ok) {
            success = true;
          }
        } catch (err) {
          // Fallback to no-cors
          try {
            const noCorsController = new AbortController();
            const noCorsTimeoutId = setTimeout(() => noCorsController.abort(), 5000);
            await fetch(cacheBusterUrl, {
              mode: 'no-cors',
              signal: noCorsController.signal,
              headers: { 'Cache-Control': 'no-cache' }
            });
            clearTimeout(noCorsTimeoutId);
            success = true;
          } catch (noCorsErr) {
            console.log('Heartbeat keep-alive failed:', noCorsErr);
          }
        }
        
        clearTimeout(timeoutId);
        
        if (success) {
          console.log('Heartbeat: Server is alive and warm.');
        } else {
          throw new Error('Server did not respond to keep-alive ping');
        }
      } catch (err: any) {
        const errMsg = `Heartbeat: Warning: Keep-alive ping failed: ${err.message || err}. Server might be sleeping.`;
        useAppStore.getState().addConnectionLog(errMsg);
        
        // Re-trigger wakeup if disconnected or connecting
        const appState = useAppStore.getState();
        if (appState.wssStatus !== 'connected') {
          appState.addConnectionLog('Heartbeat: Server seems unreachable, starting exponential backoff wake-up...');
          wakeUp().catch(console.error);
        }
      }
    };

    const startHeartbeat = () => {
      // In browsers, use a Web Worker to ensure background tabs do not throttle intervals.
      if (typeof window !== 'undefined') {
        if ((window as any)._heartbeatWorker) {
          (window as any)._heartbeatWorker.terminate();
        }
        const workerCode = `
          let timer15;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              timer15 = setInterval(() => self.postMessage('ping_15s'), 15000);
            } else if (e.data === 'stop') {
              clearInterval(timer15);
            }
          };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        (window as any)._heartbeatWorker = worker;
        
        worker.onmessage = (e) => {
          if (e.data === 'ping_15s') {
            doHeartbeatPing();
          }
        };
        worker.postMessage('start');
      } else {
        // Fallback for non-browser environments
        if (heartbeatIntervalId) {
          clearInterval(heartbeatIntervalId);
        }
        heartbeatIntervalId = setInterval(doHeartbeatPing, 15000);
      }
    };

    // Trigger wakeup process in parallel
    wakeUp().catch(console.error);

    const socket = io(targetUrl, {
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 60000,
      autoConnect: true,
    });

    const debounceTypingState = (senderId: string, isTyping: boolean) => {
      if (typingDebounceTimeouts[senderId]) {
        clearTimeout(typingDebounceTimeouts[senderId]);
      }
      typingDebounceTimeouts[senderId] = setTimeout(() => {
        set((currentState) => ({
          typingUsers: {
            ...currentState.typingUsers,
            [senderId]: isTyping
          }
        }));
      }, 300);
    };

    const setupSocketListeners = (sock: Socket, uid: string) => {
      sock.off('pong_server').on('pong_server', (data) => {
        lastSuccessfulWakeUpTime = Date.now();
        console.log('Socket pong received from server:', data);
      });

      // 1. connect_error
      sock.off('connect_error').on('connect_error', (error) => {
        console.warn('Socket connection error:', error, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        const appState = useAppStore.getState();
        appState.addConnectionLog(`Socket connection error: ${error.message || error}`);
        
        if (appState.wssStatus === 'connected') {
          set({ wssStatus: 'connecting', wssMessage: 'Reconnecting to backend...' });
        }
        
        wakeUp().catch(console.error);
      });

      // 2. disconnect
      sock.off('disconnect').on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        useAppStore.getState().addConnectionLog(`Socket disconnected: ${reason}`);
        set({ wssStatus: 'disconnected', isWssConnected: false, wssMessage: `Disconnected: ${reason}` });
        if (heartbeatIntervalId) {
          clearInterval(heartbeatIntervalId);
          heartbeatIntervalId = null;
        }
      });

      // 3. connect
      sock.off('connect').on('connect', async () => {
        console.log('Connected to server');
        lastSuccessfulWakeUpTime = Date.now();
        useAppStore.getState().addConnectionLog('Successfully connected to backend server!');
        set((state) => {
          const newState = { wssStatus: 'connected', isWssConnected: true, wssMessage: 'Connected & Secure' } as any;
          if (uid) {
            const nextOnline = [...(state.onlineUserIds || [])];
            if (!nextOnline.includes(uid)) nextOnline.push(uid);
            newState.onlineUserIds = nextOnline;
            newState.users = state.users.map((u: any) => {
              if (u.id === uid) {
                 return { ...u, isOnline: true, lastSeen: undefined };
              }
              return u;
            });
            newState.chats = state.chats.map((c: any) => ({
              ...c,
              participants: c.participants.map((p: any) => {
                if (p.id === uid) return { ...p, isOnline: true, lastSeen: undefined };
                return p;
              })
            }));
          }
          return newState;
        });
        startHeartbeat();
        sock.emit('get_online_users');
        const activeState = useAppStore.getState();
        const { cryptoService } = await import('./services/cryptoService');
        const publicKey = await cryptoService.getMyPublicKeyBase64(uid);
        const deviceId = getOrCreateDeviceId();
        const appUser = activeState.user;
        sock.emit('register', { 
          userId: uid, 
          publicKey, 
          deviceId,
          displayName: appUser?.displayName,
          username: appUser?.username,
          avatar: appUser?.avatar,
          description: appUser?.description
        });
        if (appUser) {
          sock.emit('broadcast_user_profile', { user: appUser });
        }
        
        // Auto join group rooms on connect
        activeState.chats.forEach(c => {
          if (c.isGroup) {
            sock.emit('join_group', c.id);
          }
        });

        // Trigger automatic catch-up sync on app open/reconnect
        activeState.performCatchUpSync().catch((err) => console.error('[Socket Connect] Catch-up sync failed:', err));

        // Resend offline queued messages automatically on connect
        if (activeState.offlineMessageQueue && activeState.offlineMessageQueue.length > 0) {
          console.log(`Resending ${activeState.offlineMessageQueue.length} offline queued messages...`);
          activeState.offlineMessageQueue.forEach((msg) => {
            const chatObj = activeState.chats.find(c => c.id === msg.chatId);
            const isGrp = chatObj?.isGroup;
            if (isGrp && chatObj?.participants) {
              sock.emit('send_message', {
                id: msg.id,
                messageId: msg.id,
                groupId: msg.chatId,
                text: msg.e2eData ? msg.e2eData.encryptedText : msg.text,
                type: msg.type,
                fileUrl: msg.fileUrl,
                fileSize: msg.fileSize,
                iv: msg.e2eData?.iv,
                encryptedFileKey: msg.e2eData?.encryptedFileKey,
                recipientIds: chatObj.participants.map(p => p.id)
              });
            } else {
              const targetId = msg.recipientId || chatObj?.participants.find(p => p.id !== activeState.user?.id)?.id;
              if (targetId) {
                sock.emit('send_message', {
                  id: msg.id,
                  messageId: msg.id,
                  recipientId: targetId,
                  text: msg.e2eData ? msg.e2eData.encryptedText : msg.text,
                  type: msg.type,
                  fileUrl: msg.fileUrl,
                  fileSize: msg.fileSize,
                  iv: msg.e2eData?.iv,
                  encryptedFileKey: msg.e2eData?.encryptedFileKey
                });
              }
            }
            // Update the message status to 'sent' in our local state
            useAppStore.setState((s) => ({
              chats: s.chats.map(c => 
                c.id === msg.chatId
                  ? { ...c, messages: c.messages.map(m => m.id === msg.id ? { ...m, status: 'sent' as const } : m) }
                  : c
              )
            }));
          });
          useAppStore.setState({ offlineMessageQueue: [] });
          if (uid) {
            safeLocalStorageSetItem(`proto_offlineMessageQueue_${uid}`, JSON.stringify([]));
          }
        }
      });

      // === FIREBASE USER DETAILS SYNCHRONIZATION (WRITE ONLY, NO LISTENERS) ===
      if (useAppStore.getState().authMethod !== 'local') {
        import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, setDoc }) => {
            // Broadcast my public key via Firebase:
            import('./services/cryptoService').then(async ({ cryptoService }) => {
                const publicKey = await cryptoService.getMyPublicKeyBase64(uid);
                setDoc(doc(db, 'users', uid), { publicKey }, { merge: true }).catch((err) => {
                  try {
                    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
                  } catch (e) {
                    console.error("Gracefully caught public key broadcast error:", e);
                  }
                });
            });

            sock.on('disconnect', () => {
               // Mark self as offline in Firebase
               setDoc(doc(db, 'users', uid), { isOnline: false, lastSeen: new Date().toISOString() }, { merge: true }).catch((err) => {
                  try {
                    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
                  } catch (e) {
                    console.error("Gracefully caught offline status error:", e);
                  }
               });
            });

            sock.on('connect', () => {
               sock.emit('get_online_users');
               // Mark self as online in Firebase so other users can see status in search
               setDoc(doc(db, 'users', uid), { isOnline: true, lastSeen: new Date().toISOString() }, { merge: true }).catch((err) => {
                  try {
                    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
                  } catch (e) {
                    console.error("Gracefully caught online status error:", e);
                  }
               });
            });
        });
      }

      // 4. user_status
      sock.off('user_status').on('user_status', (data: { userId: string, isOnline: boolean, isInactive?: boolean }) => {
        const targetUid = data.userId;
        const isOnline = data.isOnline;
        const isInactive = data.isInactive;
        const nowIso = new Date().toISOString();

        let userFound = false;
        set((currentState) => {
          let nextOnline = [...currentState.onlineUserIds];
          if (isOnline) {
            if (!nextOnline.includes(targetUid)) nextOnline.push(targetUid);
          } else {
            nextOnline = nextOnline.filter(id => id !== targetUid);
          }

          const updatedUsers = currentState.users.map(u => {
            if (u.id === targetUid) {
              userFound = true;
              const wasOnline = u.isOnline;
              return {
                ...u,
                isOnline,
                isInactive,
                lastSeen: isOnline ? undefined : (wasOnline ? nowIso : (u.lastSeen || nowIso))
              };
            }
            return u;
          });

          const updatedChats = currentState.chats.map(chat => ({
            ...chat,
            participants: chat.participants.map(p => {
              if (p.id === targetUid) {
                const wasOnline = p.isOnline;
                return {
                  ...p,
                  isOnline,
                  isInactive,
                  lastSeen: isOnline ? undefined : (wasOnline ? nowIso : (p.lastSeen || nowIso))
                };
              }
              return p;
            })
          }));

          return { 
            onlineUserIds: nextOnline,
            users: updatedUsers,
            chats: updatedChats
          };
        });

        if (!userFound && isOnline) {
          sock.emit('get_online_users');
        }

        // Fast background Firestore presence sync for current user only
        const currentUserId = useAppStore.getState().user?.id;
        if (useAppStore.getState().authMethod !== 'local' && currentUserId && targetUid === currentUserId) {
          import('./firebase').then(({ db, doc, setDoc }) => {
            setDoc(doc(db, 'users', currentUserId), { 
              isOnline, 
              lastSeen: nowIso 
            }, { merge: true }).catch(() => {});
          }).catch(() => {});
        }
      });

      // 5a. all_users_data
      sock.off('all_users_data').on('all_users_data', (allUsers: any[]) => {
        set((state) => {
          const currentOnlineIds = state.onlineUserIds || [];
          const mergedUsers = allUsers.map((u: any) => {
            const isOnline = Boolean(u.isOnline || currentOnlineIds.includes(u.id));
            return {
              ...u,
              isOnline
            };
          });
          
          const updatedOnlineIds = Array.from(new Set([
            ...currentOnlineIds,
            ...mergedUsers.filter(u => u.isOnline).map(u => u.id)
          ]));

          const updatedChats = state.chats.map(c => ({
            ...c,
            participants: c.participants.map(p => {
              const isOnline = Boolean(updatedOnlineIds.includes(p.id) || mergedUsers.find(u => u.id === p.id)?.isOnline);
              return {
                ...p,
                isOnline,
                lastSeen: isOnline ? undefined : p.lastSeen
              };
            })
          }));

          if (state.user?.id) {
            safeLocalStorageSetItem(`proto_users_${state.user.id}`, JSON.stringify(mergedUsers));
          }
          
          return { 
            users: mergedUsers,
            onlineUserIds: updatedOnlineIds,
            chats: updatedChats
          };
        });
      });

      // 5. online_users
      sock.off('online_users').on('online_users', (payload: any[]) => {
        const nowIso = new Date().toISOString();
        const onlineUserIds = payload.map(p => typeof p === 'string' ? p : p.userId);
        const inactiveMap = new Map<string, boolean>();
        payload.forEach(p => {
          if (typeof p !== 'string' && p.isInactive !== undefined) {
            inactiveMap.set(p.userId, p.isInactive);
          }
        });

        set((state) => ({
          onlineUserIds,
          users: state.users.map(u => {
            const isOnline = onlineUserIds.includes(u.id);
            const isInactive = inactiveMap.has(u.id) ? inactiveMap.get(u.id) : undefined;
            const wasOnline = u.isOnline;
            return {
              ...u,
              isOnline,
              ...(isInactive !== undefined ? { isInactive } : {}),
              lastSeen: isOnline ? undefined : (wasOnline ? nowIso : (u.lastSeen || nowIso))
            };
          }),
          chats: state.chats.map(c => ({
            ...c,
            participants: c.participants.map(p => {
              const isOnline = onlineUserIds.includes(p.id);
              const isInactive = inactiveMap.has(p.id) ? inactiveMap.get(p.id) : undefined;
              const wasOnline = p.isOnline;
              return {
                ...p,
                isOnline,
                ...(isInactive !== undefined ? { isInactive } : {}),
                lastSeen: isOnline ? undefined : (wasOnline ? nowIso : (p.lastSeen || nowIso))
              };
            })
          }))
        }));
      });

      // 6. receive_message
      sock.off('receive_message').on('receive_message', async (data: { id?: string, messageId?: string, groupId?: string, senderId: string, text: string, type: Message['type'], fileUrl?: string, fileSize?: string, encryptedFileKey?: number[], iv?: number[], recipientId?: string }) => {
        // Clear any incoming media upload progress indicator for this sender immediately
        if (mediaUploadStaleTimeouts[data.senderId]) {
          clearTimeout(mediaUploadStaleTimeouts[data.senderId]);
          delete mediaUploadStaleTimeouts[data.senderId];
        }
        set((currentState) => {
          const nextUploads = { ...currentState.incomingMediaUploads };
          delete nextUploads[data.senderId];
          return { incomingMediaUploads: nextUploads };
        });

        const state = useAppStore.getState();
        const { cryptoService } = await import('./services/cryptoService');
        
        const isOwnMessage = data.senderId === uid;
        let decryptedText = data.text;
        
        if (data.iv && data.text) {
          try {
            const decryptPartnerId = isOwnMessage ? data.recipientId : data.senderId;
            if (decryptPartnerId) {
              const remotePubKeyBase64 = await new Promise<string>((resolve) => {
                const socket = state.socket;
                if (socket && socket.connected) {
                  const timeout = setTimeout(() => resolve(''), 1000);
                  socket.emit("get_public_key", { userId: decryptPartnerId }, (res: string) => {
                    clearTimeout(timeout);
                    resolve(res || '');
                  });
                } else {
                  resolve('');
                }
              });
              if (remotePubKeyBase64) {
                const sharedSecret = await cryptoService.deriveSharedSecret(decryptPartnerId, remotePubKeyBase64, uid);
                const encryptedObj = JSON.parse(data.text);
                decryptedText = await cryptoService.decryptText(encryptedObj.iv, encryptedObj.ciphertext, sharedSecret);
              }
            }
          } catch(e) {
            console.error("Decryption failed", e);
            decryptedText = "🔒 [Encrypted Message]";
          }
        }

        const messageId = data.id || data.messageId || `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        let resolvedFileUrl = data.fileUrl;
        let resolvedFileSize = data.fileSize;
        const cached = (window as any).__webrtcAudioUrlCache?.[messageId];
        if (cached) {
          resolvedFileUrl = cached.fileUrl;
          resolvedFileSize = cached.fileSize;
        }

        const newMessage: Message = {
          id: messageId,
          senderId: data.senderId,
          text: decryptedText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: data.type || 'text',
          fileUrl: resolvedFileUrl,
          fileSize: resolvedFileSize,
          encryptedFileKey: data.encryptedFileKey,
          iv: data.iv,
          isE2E: !!(data.iv || data.encryptedFileKey || (data.text && typeof data.text === 'string' && data.text.includes('"iv"'))),
          isOwn: isOwnMessage
        };

        // Record chat download usage if received from remote peer
        if (!isOwnMessage) {
          try {
            let downloadBytes = new Blob([decryptedText || '']).size;
            if (resolvedFileSize) {
              downloadBytes += parseFileSizeToBytes(resolvedFileSize);
            }
            state.recordDataUsage('chat_download', downloadBytes);
          } catch (e) {}
        }

        // Find chat or create one
        set((state) => {
          let updatedChats = [...state.chats];
          let chat = data.groupId
            ? updatedChats.find(c => c.id === data.groupId)
            : updatedChats.find(c => !c.isGroup && c.participants.some(p => p.id === (isOwnMessage ? data.recipientId : data.senderId)));
          
          if (chat) {
            // Guard against duplicates
            if (chat.messages?.some(m => m.id === newMessage.id)) {
              return {};
            }
            updatedChats = updatedChats.map(c => c.id === chat!.id ? {
              ...c,
              messages: [...(c.messages || []), newMessage],
              lastMessage: newMessage,
              unreadCount: isOwnMessage ? 0 : (state.activeChatId === c.id ? c.unreadCount : (c.unreadCount || 0) + 1)
            } : c);
          } else if (!data.groupId) {
            // For individual chats only, create if not found
            const peerId = isOwnMessage ? data.recipientId : data.senderId;
            if (peerId) {
              const peer = state.users.find(u => u.id === peerId) || {
                id: peerId,
                displayName: 'Unknown User',
                username: peerId,
                avatar: generateInitialsAvatar(peerId, 'Unknown User')
              };
              const newChat: Chat = {
                id: `c-${Date.now()}`,
                participants: [
                  { id: peer.id, name: peer.displayName, username: peer.username, avatar: peer.avatar, status: 'online' },
                  { id: state.user!.id, name: state.user!.displayName, username: state.user!.username, avatar: state.user!.avatar, status: 'online' }
                ],
                unreadCount: isOwnMessage ? 0 : 1,
                messages: [newMessage],
                lastMessage: newMessage
              };
              updatedChats.push(newChat);
            }
          }
          return { chats: updatedChats };
        });

        // Save incoming voice notes and file attachments to local browser IndexedDB cache
        if (newMessage.fileUrl && (newMessage.type === 'audio' || newMessage.type === 'file' || newMessage.type === 'image')) {
          import('./services/voiceNoteCache').then(({ voiceNoteCache }) => {
            if (newMessage.fileUrl?.startsWith('data:')) {
              fetch(newMessage.fileUrl)
                .then(res => res.blob())
                .then(blob => voiceNoteCache.set(newMessage.id, blob))
                .catch(err => console.error("Auto-caching data URL to IndexedDB failed:", err));
            } else if (newMessage.fileUrl?.startsWith('http://') || newMessage.fileUrl?.startsWith('https://')) {
              fetch(newMessage.fileUrl)
                .then(res => res.ok ? res.blob() : null)
                .then(blob => blob && voiceNoteCache.set(newMessage.id, blob))
                .catch(err => console.error("Auto-caching HTTP file URL to IndexedDB failed:", err));
            }
          });
        }

        // Emit real-time message status delivered/read receipts (only if it's NOT our own echoed message)
        if (!isOwnMessage && sock && sock.connected) {
          sock.emit('message_delivered', {
            messageId: newMessage.id,
            senderId: data.senderId,
            chatId: data.groupId || data.senderId
          });

          const currentState = useAppStore.getState();
          if (currentState.activeChatId === data.groupId || currentState.activeChatId === data.senderId || currentState.activeRecipientId === data.senderId) {
            sock.emit('message_read', {
              messageId: newMessage.id,
              senderId: data.senderId,
              chatId: data.groupId || data.senderId
            });
          }
        }
      });

      // 6.5 message_sent
      sock.off('message_sent').on('message_sent', (data: { chatId: string, messageId: string, timestamp: string }) => {
        set((state) => ({
          chats: state.chats.map(c => {
            const isMatch = c.id === data.chatId || c.participants.some(p => p.id === data.chatId);
            if (isMatch) {
              const updatedMessages = (c.messages || []).map(m => m.id === data.messageId ? { ...m, status: 'sent', timestamp: data.timestamp || m.timestamp } : m);
              const updatedLastMessage = c.lastMessage?.id === data.messageId ? { ...c.lastMessage, status: 'sent', timestamp: data.timestamp || c.lastMessage.timestamp } : c.lastMessage;
              return {
                ...c,
                messages: updatedMessages as Message[],
                lastMessage: updatedLastMessage as Message | undefined
              };
            }
            return c;
          })
        }));
      });

      // 7. message_status_update
      sock.off('message_status_update').on('message_status_update', (data: { chatId: string, messageId: string, status: 'delivered' | 'read' }) => {
        set((state) => ({
          chats: state.chats.map(c => {
            const isMatch = c.id === data.chatId || c.participants.some(p => p.id === data.chatId);
            if (isMatch) {
              return {
                ...c,
                unreadCount: data.status === 'read' ? 0 : c.unreadCount,
                messages: (c.messages || []).map(m => m.id === data.messageId ? { ...m, status: data.status } : m)
              };
            }
            return c;
          })
        }));
      });

      // 8. sfu_signal
      sock.off('sfu_signal').on('sfu_signal', (data: { roomId: string, from: string, signal: any }) => {
        import('./services/webrtcService').then(({ webrtcService }) => {
          webrtcService.handleSignal(data.from, data.signal, data.roomId);
        });
      });

      // 9. incoming_call
      sock.off('incoming_call').on('incoming_call', (data: { roomId: string, type: 'voice' | 'video', from: string }) => {
        set((state) => {
          if (!state.activeGroupCall && !state.incomingCall) {
            return { incomingCall: { type: data.type, roomId: data.roomId, from: data.from } };
          }
          return state;
        });
      });

      // 10. call_ended
      sock.off('call_ended').on('call_ended', (data?: { roomId?: string, wasAnsweredElsewhere?: boolean }) => {
        set((state) => {
          if (data?.wasAnsweredElsewhere) {
            // Call answered on another device, dismiss ringing screen without ending call
            return { incomingCall: null };
          }
          return { incomingCall: null, activeGroupCall: null };
        });
      });

      // 11. typing
      sock.off('typing').on('typing', (data: { senderId: string, isTyping: boolean }) => {
        debounceTypingState(data.senderId, data.isTyping);
      });

      // 12. typing_start
      sock.off('typing_start').on('typing_start', (data: { senderId: string }) => {
        debounceTypingState(data.senderId, true);
      });

      // 13. typing_stop
      sock.off('typing_stop').on('typing_stop', (data: { senderId: string }) => {
        debounceTypingState(data.senderId, false);
      });

      // 13b. media_upload_progress
      sock.off('media_upload_progress').on('media_upload_progress', (data: { senderId: string, percent: number, mediaType: string, fileName?: string, messageId: string }) => {
        if (mediaUploadStaleTimeouts[data.senderId]) {
          clearTimeout(mediaUploadStaleTimeouts[data.senderId]);
        }
        
        mediaUploadStaleTimeouts[data.senderId] = setTimeout(() => {
          set((currentState) => {
            const nextUploads = { ...currentState.incomingMediaUploads };
            delete nextUploads[data.senderId];
            return { incomingMediaUploads: nextUploads };
          });
        }, 15000);

        set((currentState) => ({
          incomingMediaUploads: {
            ...currentState.incomingMediaUploads,
            [data.senderId]: {
              percent: data.percent,
              mediaType: data.mediaType,
              fileName: data.fileName,
              messageId: data.messageId
            }
          }
        }));
      });

      // 14. sync_chat_read
      sock.off('sync_chat_read').on('sync_chat_read', (data: { chatId: string }) => {
        set((currentState) => ({
          chats: currentState.chats.map(c => c.id === data.chatId ? {
            ...c,
            unreadCount: 0,
            messages: (c.messages || []).map(m => m.senderId !== currentState.user?.id ? { ...m, status: 'read' as const } : m)
          } : c)
        }));
      });

      // 15. self_typing_sync
      sock.off('self_typing_sync').on('self_typing_sync', (data: { recipientId: string, isTyping: boolean }) => {
        console.log('[self_typing_sync] Received typing update for self from another device:', data);
        useAppStore.getState().setSelfTypingChat(data.recipientId, data.isTyping);
      });

      // 16. devices_update
      sock.off('devices_update').on('devices_update', (data: { devices: string[], currentDeviceId?: string }) => {
        console.log('[devices_update] Received active devices list:', data);
        const stateUpdate: any = { onlineDevices: data.devices };
        if (data.currentDeviceId) {
          stateUpdate.currentDeviceId = data.currentDeviceId;
        }
        useAppStore.setState(stateUpdate);
      });

      // 17. cloud_sync_triggered
      sock.off('cloud_sync_triggered').on('cloud_sync_triggered', async (data: { lastUpdated: string }) => {
        console.log('[cloud_sync_triggered] Received real-time sync request from another device:', data);
        const { user, authMethod, onlineDevices } = useAppStore.getState();
        if (user && authMethod !== 'local' && navigator.onLine) {
          // Only show popup if there's actually another device online
          const hasOtherOnlineDevice = onlineDevices.length > 1;
          
          if (hasOtherOnlineDevice) {
            useAppStore.getState().setCloudSyncStatus('syncing');
          }

          try {
            const { db, doc, getDoc } = await import('./firebase');
            const syncDocRef = doc(db, 'cloud_syncs', user.id);
            const syncSnapshot = await getDoc(syncDocRef);
            if (syncSnapshot.exists()) {
              const syncData = syncSnapshot.data();
              if (syncData) {
                const { mergeCloudSyncPayload } = await import('./store');
                mergeCloudSyncPayload(syncData, user.id);
                // Save last updated timestamp to local storage to prevent duplicate pull
                const storageKey = `proto_last_synced_at_${user.id}`;
                safeLocalStorageSetItem(storageKey, syncData.lastUpdated || new Date().toISOString());
                (window as any).__lastUploadedSyncTime = syncData.lastUpdated;
                
                // Report fingerprint after successful background merge
                useAppStore.getState().reportFingerprint();
                
                if (hasOtherOnlineDevice) {
                  useAppStore.getState().setCloudSyncStatus('synced');
                  setTimeout(() => {
                    if (useAppStore.getState().cloudSyncStatus === 'synced') {
                      useAppStore.getState().setCloudSyncStatus(null);
                    }
                  }, 3000);
                }
              }
            } else if (hasOtherOnlineDevice) {
               useAppStore.getState().setCloudSyncStatus(null);
            }
          } catch (e) {
            console.error("Error doing real-time background sync:", e);
            if (hasOtherOnlineDevice) {
               useAppStore.getState().setCloudSyncStatus(null);
            }
          }
        }
      });

      // 18. sync_check_result
      sock.off('sync_check_result').on('sync_check_result', (data: { status: 'mismatch' | 'synced' | 'no_peer' }) => {
        console.log('[sync_check_result] Received result:', data);
        const state = useAppStore.getState();
        if (data.status === 'mismatch') {
          if (state.backendSyncStatus !== 'syncing' && state.backendSyncStatus !== 'done') {
            useAppStore.setState({ backendSyncStatus: 'mismatch' });
            state.resolveSyncMismatch();
          }
        } else if (data.status === 'synced') {
          if (state.backendSyncStatus !== 'syncing') {
            useAppStore.setState({ backendSyncStatus: 'idle' });
          }
        } else if (data.status === 'no_peer') {
          if (state.backendSyncStatus !== 'syncing') {
            useAppStore.setState({ backendSyncStatus: 'idle' });
          }
        }
      });

      // 19. receive_notification
      sock.off('receive_notification').on('receive_notification', (notification: any) => {
        if (!notification || !notification.id) return;
        const state = useAppStore.getState();
        if (state.blockedUserIds.includes(notification.senderId || '')) return;

        state.addNotification(notification);

        const userSettings = state.user?.notificationSettings;
        if (userSettings?.pushEnabled !== false) {
          if (userSettings?.soundEnabled !== false) {
            try {
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch (e) {}
          }
          if (userSettings?.vibrateEnabled !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([200, 100, 200]); } catch (e) {}
          }
          const bodyText = userSettings?.previewEnabled !== false ? notification.body : "New Notification received";
          state.addInAppToast({
            title: notification.title,
            body: bodyText,
            avatar: notification.senderAvatar || generateInitialsAvatar(notification.senderId || 'sys', notification.title || 'Notification'),
            chatId: notification.chatId || ''
          });
        }
      });

      // 20. user_profile_updated
      sock.off('user_profile_updated').on('user_profile_updated', (updatedUserData: any) => {
        if (!updatedUserData || !updatedUserData.id) return;
        set((state) => {
          const existingIdx = state.users.findIndex(u => u.id === updatedUserData.id);
          let updatedUsers = [...state.users];
          if (existingIdx >= 0) {
            updatedUsers[existingIdx] = { ...updatedUsers[existingIdx], ...updatedUserData };
          } else {
            updatedUsers.push(updatedUserData);
          }

          const updatedChats = state.chats.map(chat => ({
            ...chat,
            participants: chat.participants.map(p => p.id === updatedUserData.id ? { ...p, ...updatedUserData } : p)
          }));

          return { users: updatedUsers, chats: updatedChats };
        });
      });

      // 21. friend_request_update
      sock.off('friend_request_update').on('friend_request_update', (data: { fromUserId: string, type: string, request: any }) => {
        const { fromUserId, type, request } = data || {};
        const state = useAppStore.getState();
        if (type === 'sent' && request) {
          const exists = state.friendRequests.some(r => r.id === request.id);
          if (!exists) {
            state.setFriendRequests([request, ...state.friendRequests]);
          }
        } else if (type === 'accepted') {
          const updatedReqs = state.friendRequests.filter(r => r.userId !== fromUserId && r.id !== request?.id);
          const updatedRemoved = state.removedFriendIds.filter(id => id !== fromUserId);
          useAppStore.setState({ friendRequests: updatedReqs, removedFriendIds: updatedRemoved });
        } else if (type === 'rejected' || type === 'canceled') {
          const updatedReqs = state.friendRequests.filter(r => r.userId !== fromUserId && r.id !== request?.id);
          useAppStore.setState({ friendRequests: updatedReqs });
        }
      });
    };

    setupSocketListeners(socket, userId);

    set({ socket });
  },
  activeChatId: null,
  setActiveChatId: (id) => set((state) => {
    const chat = state.chats.find(c => c.id === id);
    if (id && state.socket && state.socket.connected) {
      if (chat?.isGroup) {
        state.socket.emit('join_group', id);
      }
      
      // Emit read receipts for all unread messages from other users in this chat
      chat?.messages?.forEach(m => {
        if (m.senderId !== state.user?.id && m.status !== 'read') {
          state.socket?.emit('message_read', {
            messageId: m.id,
            senderId: m.senderId,
            chatId: chat.id
          });
        }
      });

      // Emit sync_chat_read to clear unread counts on other devices of same user
      const recId = chat?.isGroup ? undefined : chat?.participants.find(p => p.id !== state.user?.id)?.id;
      state.socket.emit('sync_chat_read', { chatId: id, recipientId: recId });
    }
    const updatedChats = state.chats.map(c => c.id === id ? { ...c, unreadCount: 0 } : c);
    return { chats: updatedChats, activeChatId: id, activeRecipientId: null, selectedMessageIds: [] };
  }),
  activeRecipientId: null,
  setActiveRecipientId: (id) => set((state) => {
    const chat = state.chats.find(c => !c.isGroup && c.participants.some(p => p.id === id));
    if (chat && state.socket && state.socket.connected) {
      // Emit read receipts for all unread messages from this user
      chat.messages?.forEach(m => {
        if (m.senderId !== state.user?.id && m.status !== 'read') {
          state.socket?.emit('message_read', {
            messageId: m.id,
            senderId: m.senderId,
            chatId: chat.id
          });
        }
      });

      // Emit sync_chat_read to clear unread counts on other devices of same user
      state.socket.emit('sync_chat_read', { chatId: chat.id, recipientId: id });
    }
    const updatedChats = state.chats.map(c => 
      (!c.isGroup && c.participants.some(p => p.id === id)) ? { ...c, unreadCount: 0 } : c
    );
    return { chats: updatedChats, activeRecipientId: id, activeChatId: null, selectedMessageIds: [] };
  }),
  activeDeviceId: null,
  setActiveDeviceId: (id) => set({ activeDeviceId: id }),
  viewingUserId: null,
  setViewingUserId: (id) => set({ viewingUserId: id }),
  activeGroupInfoId: null,
  setActiveGroupInfoId: (id) => set({ activeGroupInfoId: id }),
  joinGroupId: null,
  setJoinGroupId: (id) => set({ joinGroupId: id }),
  selectedMessageIds: [],
  setSelectedMessageIds: (ids) => set({ selectedMessageIds: ids }),
  toggleMessageSelection: (id) => set((state) => ({
    selectedMessageIds: state.selectedMessageIds.includes(id)
      ? state.selectedMessageIds.filter(mid => mid !== id)
      : [...state.selectedMessageIds, id]
  })),
  friendRequests: cachedFriendRequests,
  setFriendRequests: (requests) => set({ friendRequests: requests }),
  acceptFriendRequest: async (requestId) => {
    const currentState = useAppStore.getState();
    const request = currentState.friendRequests.find(r => r.id === requestId);
    set((state) => {
      if (!request) return state;
      
      const newRequests = state.friendRequests.filter(r => r.id !== requestId);
      const newRemoved = state.removedFriendIds.filter(id => id !== request.userId);
      return { friendRequests: newRequests, removedFriendIds: newRemoved };
    });
    
    if (request && currentState.socket && currentState.socket.connected && currentState.user) {
      currentState.socket.emit('friend_request_event', {
        toUserId: request.userId,
        type: 'accepted',
        request
      });
      currentState.socket.emit('send_notification', {
        recipientId: request.userId,
        notification: {
          id: `notif-accept-${Date.now()}`,
          type: 'system',
          senderId: currentState.user.id,
          senderName: currentState.user.displayName || currentState.user.username,
          senderAvatar: currentState.user.avatar || '',
          recipientId: request.userId,
          title: 'Friend Request Accepted',
          body: `${currentState.user.displayName || currentState.user.username} accepted your friend request! 🎉`,
          status: 'created',
          createdAt: new Date().toISOString()
        }
      });
    }

    try {
      const { db, updateDoc, doc, handleFirestoreError, OperationType } = await import('./firebase');
      await updateDoc(doc(db, 'friendRequests', requestId), { status: 'accepted' }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `friendRequests/${requestId}`);
      });
    } catch (err) {
      console.error("Error accepting request in db:", err);
    }
  },
  rejectFriendRequest: async (requestId) => {
    set((state) => ({
      friendRequests: state.friendRequests.filter(r => r.id !== requestId)
    }));
    
    try {
      const { db, deleteDoc, doc, handleFirestoreError, OperationType } = await import('./firebase');
      await deleteDoc(doc(db, 'friendRequests', requestId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `friendRequests/${requestId}`);
      });
    } catch (err) {
      console.error("Error rejecting request in db:", err);
    }
  },
  sentFriendRequests: cachedSentFriendRequests,
  sendFriendRequest: async (userId) => {
    const state = useAppStore.getState();
    if (state.sentFriendRequests.includes(userId)) return;
    
    set({ sentFriendRequests: [...state.sentFriendRequests, userId] });
    
    if (state.user) {
      try {
        const { db, addDoc, collection, serverTimestamp, query, where, getDocs, doc, setDoc, handleFirestoreError, OperationType } = await import('./firebase');
        const requestsRef = collection(db, 'friendRequests');
        
        // Prevent dupes
        const q = query(requestsRef, where('fromUserId', '==', state.user.id));
        const existing = await getDocs(q);
        const hasDupe = existing.docs.some(d => d.data().toUserId === userId);
        
        if (!hasDupe) {
          const docRef = await addDoc(requestsRef, {
            fromUserId: state.user.id,
            toUserId: userId,
            createdAt: serverTimestamp(),
            status: 'pending'
          }).catch((err) => {
            handleFirestoreError(err, OperationType.CREATE, 'friendRequests');
            throw err;
          });

          // Create persistent notification record
          const notifId = `notif-friend-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const notifRef = doc(db, 'notifications', notifId);
          const notificationData = {
            id: notifId,
            type: 'friend_request' as const,
            senderId: state.user.id,
            senderName: state.user.displayName || state.user.username,
            senderAvatar: state.user.avatar || '',
            recipientId: userId,
            title: 'New Friend Request',
            body: `${state.user.displayName || state.user.username} sent you a friend request.`,
            requestId: docRef.id,
            status: 'created' as const,
            createdAt: new Date().toISOString()
          };

          if (state.socket && state.socket.connected) {
            state.socket.emit('friend_request_event', {
              toUserId: userId,
              type: 'sent',
              request: {
                id: docRef.id,
                userId: state.user.id,
                createdAt: new Date().toISOString(),
                user: state.user
              }
            });
            state.socket.emit('send_notification', {
              recipientId: userId,
              notification: notificationData
            });
          }

          await setDoc(notifRef, notificationData).catch((err) => {
            handleFirestoreError(err, OperationType.CREATE, `notifications/${notifId}`);
          });
        }
      } catch (err) {
        console.error("Error sending friend request:", err);
      }
    }
  },
  cancelFriendRequest: async (userId) => {
    set((state) => ({
      sentFriendRequests: state.sentFriendRequests.filter(id => id !== userId)
    }));
    
    const state = useAppStore.getState();
    if (state.user) {
      try {
        const { db, deleteDoc, doc, collection, query, where, getDocs, handleFirestoreError, OperationType } = await import('./firebase');
        const requestsRef = collection(db, 'friendRequests');
        const q = query(requestsRef, where('fromUserId', '==', state.user.id));
        const existing = await getDocs(q);
        existing.forEach(async (d) => {
           if (d.data().toUserId === userId) {
             await deleteDoc(doc(db, 'friendRequests', d.id)).catch((err) => {
               handleFirestoreError(err, OperationType.DELETE, `friendRequests/${d.id}`);
             });
           }
        });
      } catch (err) {
        console.error("Error canceling request", err);
      }
    }
  },
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) => set((state) => {
    if (state.notifications.some(n => n.id === notification.id)) {
      return state;
    }
    return { notifications: [notification, ...state.notifications] };
  }),
  markNotificationAsRead: async (id) => {
    set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, status: 'read' as const, readAt: new Date().toISOString() } : n)
    }));
    try {
      const { db, updateDoc, doc, handleFirestoreError, OperationType } = await import('./firebase');
      await updateDoc(doc(db, 'notifications', id), { 
        status: 'read',
        readAt: new Date().toISOString()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
      });
    } catch (err) {
      console.error("Error marking notification as read in db:", err);
    }
  },
  markAllNotificationsAsRead: async () => {
    const state = useAppStore.getState();
    const unread = state.notifications.filter(n => n.status !== 'read');
    if (unread.length === 0) return;

    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, status: 'read' as const, readAt: new Date().toISOString() }))
    }));

    try {
      const { db, updateDoc, doc, handleFirestoreError, OperationType } = await import('./firebase');
      await Promise.all(unread.map(async (n) => {
        await updateDoc(doc(db, 'notifications', n.id), { 
          status: 'read',
          readAt: new Date().toISOString()
        }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `notifications/${n.id}`);
        });
      }));
    } catch (err) {
      console.error("Error marking all notifications as read in db:", err);
    }
  },
  clearNotifications: async () => {
    const state = useAppStore.getState();
    const ids = state.notifications.map(n => n.id);
    
    set({ notifications: [] });

    try {
      const { db, deleteDoc, doc, handleFirestoreError, OperationType } = await import('./firebase');
      await Promise.all(ids.map(async (id) => {
        await deleteDoc(doc(db, 'notifications', id)).catch((err) => {
          handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
        });
      }));
    } catch (err) {
      console.error("Error clearing notifications in db:", err);
    }
  },
  groupJoinRequests: [],
  setGroupJoinRequests: (requests) => set({ groupJoinRequests: requests }),
  chats: cachedChats,
  setChats: (chats) => set((state) => {
    const onlineIds = state.onlineUserIds || [];
    const syncedChats = chats.map(c => ({
      ...c,
      participants: c.participants.map(p => {
        const isOnline = onlineIds.includes(p.id) || p.isOnline;
        return { ...p, isOnline };
      })
    }));
    return { chats: syncedChats };
  }),
  typingUsers: {},
  setTypingUser: (userId, isTyping) => set(state => ({ typingUsers: { ...state.typingUsers, [userId]: isTyping } })),
  incomingMediaUploads: {},
  setIncomingMediaUpload: (senderId, data) => set(state => {
    const nextUploads = { ...state.incomingMediaUploads };
    if (data === null) {
      delete nextUploads[senderId];
    } else {
      nextUploads[senderId] = data;
    }
    return { incomingMediaUploads: nextUploads };
  }),
  selfTypingChats: {},
  setSelfTypingChat: (key, isTyping) => set(state => ({ selfTypingChats: { ...state.selfTypingChats, [key]: isTyping } })),
  isSyncing: false,
  onlineDevices: [],
  currentDeviceId: null,
  activeGroupCall: null,
  setActiveGroupCall: (call) => set({ activeGroupCall: call }),
  incomingCall: null,
  setIncomingCall: (call) => set({ incomingCall: call }),
  blockedUserIds: cachedBlockedUserIds,
  removedFriendIds: cachedRemovedFriendIds,
  removeFriend: async (userId) => {
    const state = useAppStore.getState();
    const currentUserId = state.user?.id;
    
    set((state) => {
      const nextRemoved = [...state.removedFriendIds, userId];
      if (typeof window !== 'undefined') {
        const key = state.user?.id ? `proto_removedFriendIds_${state.user.id}` : 'proto_removedFriendIds';
        safeLocalStorageSetItem(key, JSON.stringify(nextRemoved));
      }
      return {
        removedFriendIds: nextRemoved,
        chats: state.chats.filter(c => {
          if (!c.isGroup && c.participants.some(p => p.id === userId)) {
            return false;
          }
          return true;
        })
      };
    });

    if (currentUserId) {
      try {
        const { db, collection, query, where, getDocs, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType } = await import('./firebase');
        
        // Find and delete the accepted friend requests where this user and userId are participants
        const requestsRef = collection(db, 'friendRequests');
        
        const q1 = query(requestsRef, where('fromUserId', '==', currentUserId));
        const s1 = await getDocs(q1);
        s1.forEach(async (d) => {
          if (d.data().toUserId === userId) {
            await deleteDoc(doc(db, 'friendRequests', d.id)).catch((err) => {
              handleFirestoreError(err, OperationType.DELETE, `friendRequests/${d.id}`);
            });
          }
        });

        const q2 = query(requestsRef, where('toUserId', '==', currentUserId));
        const s2 = await getDocs(q2);
        s2.forEach(async (d) => {
          if (d.data().fromUserId === userId) {
            await deleteDoc(doc(db, 'friendRequests', d.id)).catch((err) => {
              handleFirestoreError(err, OperationType.DELETE, `friendRequests/${d.id}`);
            });
          }
        });

        // Save removedFriendIds to users profile in Firestore
        const nextRemoved = useAppStore.getState().removedFriendIds;
        await updateDoc(doc(db, 'users', currentUserId), { removedFriendIds: nextRemoved }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUserId}`);
        });
      } catch (err) {
        console.error("Error removing friend in Firestore:", err);
      }
    }
  },
  restoreFriend: async (userId) => {
    const state = useAppStore.getState();
    const currentUserId = state.user?.id;

    set((state) => {
      const nextRemoved = state.removedFriendIds.filter(id => id !== userId);
      if (typeof window !== 'undefined') {
        const key = state.user?.id ? `proto_removedFriendIds_${state.user.id}` : 'proto_removedFriendIds';
        safeLocalStorageSetItem(key, JSON.stringify(nextRemoved));
      }
      return {
        removedFriendIds: nextRemoved
      };
    });

    if (currentUserId) {
      try {
        const { db, doc, updateDoc, handleFirestoreError, OperationType } = await import('./firebase');
        const nextRemoved = useAppStore.getState().removedFriendIds;
        await updateDoc(doc(db, 'users', currentUserId), { removedFriendIds: nextRemoved }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUserId}`);
        });
      } catch (err) {
        console.error("Error restoring friend in Firestore:", err);
      }
    }
  },
  blockUser: async (userId) => {
    const state = useAppStore.getState();
    const currentUserId = state.user?.id;

    set((state) => {
      const nextBlocked = [...state.blockedUserIds, userId];
      if (typeof window !== 'undefined') {
        const key = state.user?.id ? `proto_blockedUserIds_${state.user.id}` : 'proto_blockedUserIds';
        safeLocalStorageSetItem(key, JSON.stringify(nextBlocked));
      }
      return {
        blockedUserIds: nextBlocked,
        activeChatId: state.chats.find(c => !c.isGroup && c.participants.some(p => p.id === userId))?.id === state.activeChatId ? null : state.activeChatId,
        activeRecipientId: state.activeRecipientId === userId ? null : state.activeRecipientId,
        chats: state.chats.filter(c => {
          if (!c.isGroup && c.participants.some(p => p.id === userId)) {
            return false;
          }
          return true;
        })
      };
    });

    if (currentUserId) {
      try {
        const { db, doc, updateDoc, handleFirestoreError, OperationType } = await import('./firebase');
        const nextBlocked = useAppStore.getState().blockedUserIds;
        await updateDoc(doc(db, 'users', currentUserId), { blockedUserIds: nextBlocked }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUserId}`);
        });
      } catch (err) {
        console.error("Error blocking user in Firestore:", err);
      }
    }
  },
  unblockUser: async (userId) => {
    const state = useAppStore.getState();
    const currentUserId = state.user?.id;

    set((state) => {
      const nextBlocked = state.blockedUserIds.filter(id => id !== userId);
      if (typeof window !== 'undefined') {
        const key = state.user?.id ? `proto_blockedUserIds_${state.user.id}` : 'proto_blockedUserIds';
        safeLocalStorageSetItem(key, JSON.stringify(nextBlocked));
      }
      return {
        blockedUserIds: nextBlocked
      };
    });

    if (currentUserId) {
      try {
        const { db, doc, updateDoc, handleFirestoreError, OperationType } = await import('./firebase');
        const nextBlocked = useAppStore.getState().blockedUserIds;
        await updateDoc(doc(db, 'users', currentUserId), { blockedUserIds: nextBlocked }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUserId}`);
        });
      } catch (err) {
        console.error("Error unblocking user in Firestore:", err);
      }
    }
  },
  updateChatAvatar: (chatId, avatar) => {
    set((state) => ({
      chats: state.chats.map(c => c.id === chatId ? { ...c, avatar } : c)
    }));
  },
  updateChatSettings: (chatId, settings) => {
    set((state) => ({
      chats: state.chats.map(c => c.id === chatId ? { ...c, ...settings } : c)
    }));
  },
  updateChatInfo: (chatId, info) => {
    set((state) => ({
      chats: state.chats.map(c => c.id === chatId ? { ...c, ...info } : c)
    }));
  },
  addChatMember: (chatId, userId) => {
    set((state) => ({
      chats: state.chats.map(c => {
        if (c.id === chatId) {
          const newUser = { id: userId, name: 'New Member', username: 'new_member', avatar: generateInitialsAvatar(userId, 'New Member'), status: 'online' as const };
          if (!c.participants.find(p => p.id === userId)) {
            return { ...c, participants: [...c.participants, newUser] };
          }
        }
        return c;
      })
    }));
  },
  removeChatMember: (chatId, userId) => {
    set((state) => ({
      chats: state.chats.map(c => {
        if (c.id === chatId) {
          return {
            ...c,
            participants: c.participants.filter(p => p.id !== userId),
            admins: c.admins?.filter(id => id !== userId)
          };
        }
        return c;
      })
    }));
  },
  toggleChatAdmin: (chatId, userId) => {
    set((state) => ({
      chats: state.chats.map(c => {
        if (c.id === chatId && c.admins) {
          const newAdmins = c.admins.includes(userId)
            ? c.admins.filter(id => id !== userId)
            : [...c.admins, userId];
          return { ...c, admins: newAdmins };
        }
        return c;
      })
    }));
  },
  deleteChat: (chatId) => {
    set((state) => ({
      chats: state.chats.filter(c => c.id !== chatId),
      activeChatId: state.activeChatId === chatId ? null : state.activeChatId
    }));
  },
  clearChatMessages: (chatId) => {
    set((state) => {
      const updatedChats = state.chats.map(c => {
        if (c.id === chatId || (c.participants && c.participants.some(p => p.id === chatId))) {
          return {
            ...c,
            messages: [],
            lastMessage: undefined
          };
        }
        return c;
      });

      // Purge local/firestore cached offline messages asynchronously
      try {
        import('./firebase').then(({ db, collection, query, where, getDocs, deleteDoc, doc }) => {
          const q = query(collection(db, 'offline_messages'), where('chatId', '==', chatId));
          getDocs(q).then(snapshot => {
            snapshot.forEach(d => {
              deleteDoc(doc(db, 'offline_messages', d.id)).catch(() => {});
            });
          }).catch(() => {});
        }).catch(() => {});
      } catch (e) {
        console.warn('Firestore offline messages purge notice:', e);
      }

      return { chats: updatedChats };
    });
  },
  leaveChat: (chatId, userId) => {
    const state = useAppStore.getState();
    if (state.socket && state.socket.connected) {
      state.socket.emit('leave_group', chatId);
    }
    set((state) => ({
      chats: state.chats.map(c => {
        if (c.id === chatId) {
          return {
            ...c,
            participants: c.participants.filter(p => p.id !== userId),
            admins: c.admins?.filter(id => id !== userId)
          };
        }
        return c;
      }).filter(c => c.participants.length > 0),
      activeChatId: state.activeChatId === chatId ? null : state.activeChatId
    }));
  },
  createGroup: (data) => {
    const newId = Math.random().toString(36).substr(2, 9);
    set((state) => {
      const newGroup = {
        id: newId,
        isGroup: true,
        name: data.name,
        avatar: data.avatar || generateInitialsAvatar(newId, data.name),
        participants: data.members.map(id => ({ id, name: 'Member', username: 'member', avatar: generateInitialsAvatar(id, 'Member'), status: 'online' as const })),
        admins: [data.creatorId],
        canAddMembers: 'everyone' as const,
        canEditProfile: 'everyone' as const,
        canSendMessage: 'everyone' as const,
        canStartCall: 'everyone' as const,
        unreadCount: 0,
        lastMessage: {
          id: `m-${newId}-init`,
          senderId: 'system',
          type: 'system' as const,
          text: 'Group created',
          timestamp: 'Just now',
          senderName: 'System'
        }
      };
      
      if (state.socket && state.socket.connected) {
        state.socket.emit('join_group', newId);
      }
      
      return { chats: [newGroup, ...state.chats] };
    });
    return newId;
  },
  tickets: [],
  addTicket: (ticket) => set((state) => ({
    tickets: [
      { 
        ...ticket, 
        id: `t-${Math.random().toString(36).substr(2, 9)}`, 
        status: 'open', 
        timestamp: new Date().toLocaleString() 
      }, 
      ...state.tickets
    ]
  })),
  updateTicketStatus: (ticketId, status) => set((state) => ({
    tickets: state.tickets.map(t => t.id === ticketId ? { ...t, status } : t)
  })),
  deleteTicket: (ticketId) => set((state) => ({
    tickets: state.tickets.filter(t => t.id !== ticketId)
  })),
  sendTicketMessage: (ticketId, text, isAdmin) => set((state) => ({
    tickets: state.tickets.map(t => {
      if (t.id === ticketId) {
        const newMessage: TicketMessage = {
          id: `tm-${Date.now()}`,
          senderId: state.user?.id || 'u1',
          senderName: state.user?.displayName || (isAdmin ? 'Admin' : 'User'),
          text,
          timestamp: new Date().toLocaleString(),
          isAdmin
        };
        return {
          ...t,
          messages: [...(t.messages || []), newMessage]
        };
      }
      return t;
    })
  })),
  feedback: [],
  addFeedback: (fb) => set((state) => ({
    feedback: [
      { 
        ...fb, 
        userId: state.user?.id || 'unknown',
        id: `f-${Math.random().toString(36).substr(2, 9)}`, 
        timestamp: new Date().toLocaleString() 
      }, 
      ...state.feedback
    ]
  })),
  deleteFeedback: (feedbackId) => set((state) => ({
    feedback: state.feedback.filter(f => f.id !== feedbackId)
  })),
  broadcasts: [],
  sendBroadcast: (message, type, options) => set((state) => ({
    broadcasts: [
      {
        id: `b-${Math.random().toString(36).substr(2, 9)}`,
        message,
        type,
        timestamp: new Date().toLocaleString(),
        sender: state.user?.displayName || 'System',
        reach: options?.audience === 'users' || options?.audience === 'members' ? (options.selectiveAccess?.length || 0) : Math.floor(Math.random() * 5000) + 500,
        clickRate: parseFloat((Math.random() * 15 + 2).toFixed(1)),
        ...options
      },
      ...state.broadcasts
    ]
  })),
  deleteBroadcast: (id) => set((state) => ({
    broadcasts: state.broadcasts.filter(b => b.id !== id)
  })),
  systemSettings: {
    maintenanceMode: false,
    allowRegistration: true,
    maxFileSize: 100, // MB
    activeFeatures: ['social', 'fileshare', 'calls']
  },
  updateSystemSettings: (settings) => set((state) => ({
    systemSettings: { ...state.systemSettings, ...settings }
  })),
  users: cachedUsers,
  banUser: (userId) => set((state) => ({
    users: state.users.map(u => u.id === userId ? { ...u, isBanned: !u.isBanned } : u)
  })),
  flagUser: (userId, reason) => set((state) => ({
    users: state.users.map(u => u.id === userId ? { 
      ...u, 
      isAdminFlagged: true, 
      adminFlagCount: (u.adminFlagCount || 0) + 1,
      adminFlagReasons: [...(u.adminFlagReasons || []), reason]
    } : u)
  })),
  reportUser: (userId, reason) => set((state) => ({
    users: state.users.map(u => u.id === userId ? { ...u, isReported: true, reportCount: (u.reportCount || 0) + 1 } : u)
  })),
  promoteUser: (userId) => set((state) => ({
    users: state.users.map(u => u.id === userId ? { ...u, isAdmin: true } : u)
  })),
  updateUserByAdmin: (userId, data) => set((state) => ({
    users: state.users.map(u => u.id === userId ? { ...u, ...data } : u)
  })),
  addUser: (userData) => set((state) => {
    const existingId = (userData as any).id;
    const isOnline = state.onlineUserIds.includes(existingId) || userData.isOnline || false;
    const updatedUserData = { ...userData, isOnline };
    if (existingId && state.users.some(u => u.id === existingId)) {
        return {
            users: state.users.map(u => u.id === existingId ? { ...u, ...updatedUserData } : u)
        };
    }
    return {
      users: [
        ...state.users,
        {
          ...updatedUserData,
          id: existingId || `u${Math.random().toString(36).substr(2, 9)}`,
          joinDate: (userData as any).joinDate || new Date().toISOString(),
          profileVisibility: 'everyone',
          notificationSettings: {
            pushEnabled: true,
            previewEnabled: true,
            soundEnabled: false,
            vibrateEnabled: true
          }
        }
      ]
    };
  }),
  sendMessage: (chatId, recipientId, text, type = 'text', fileUrl, fileSize, e2eData?: { encryptedText: string, iv: number[], encryptedFileKey?: number[] }, isForwarded?: boolean, customId?: string) => set((state) => {
    // Record chat upload data usage
    try {
      let uploadBytes = new Blob([text || '']).size;
      if (fileSize) {
        uploadBytes += parseFileSizeToBytes(fileSize);
      }
      state.recordDataUsage('chat_upload', uploadBytes);
    } catch (e) {}

    const isSocketConnected = state.socket && state.socket.connected;
    let offlineMessageQueue = [...state.offlineMessageQueue];
    const newMessage: Message = {
      id: customId || `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      senderId: state.user?.id || 'u1',
      senderName: state.user?.displayName || 'You',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: type as any,
      fileUrl,
      fileSize,
      isOwn: true,
      status: 'pending', // wait for message_sent ack for 'sent'
      isE2E: !!e2eData,
      iv: e2eData?.iv,
      encryptedFileKey: e2eData?.encryptedFileKey
    };

    // Emit via socket or fallback to Firebase
    const chat = state.chats.find(c => c.id === chatId);
    const isGroup = chat?.isGroup;

    if (state.socket && state.socket.connected) {
      if (isGroup && chat?.participants) {
        state.socket.emit('send_message', {
          id: newMessage.id,
          messageId: newMessage.id,
          groupId: chatId,
          text: e2eData ? e2eData.encryptedText : text,
          type,
          fileUrl,
          fileSize,
          iv: e2eData?.iv,
          encryptedFileKey: e2eData?.encryptedFileKey,
          recipientIds: chat.participants.map(p => p.id)
        });
      } else {
        const targetId = recipientId || chat?.participants.find(p => p.id !== state.user?.id)?.id;
        if (targetId) {
          state.socket.emit('send_message', {
            id: newMessage.id,
            messageId: newMessage.id,
            recipientId: targetId,
            text: e2eData ? e2eData.encryptedText : text,
            type,
            fileUrl,
            fileSize,
            iv: e2eData?.iv,
            encryptedFileKey: e2eData?.encryptedFileKey
          });

          // Also store as temporary file if forwarded and contains a file URL
          if (isForwarded && fileUrl && state.authMethod !== 'local') {
            import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, setDoc }) => {
                setDoc(doc(db, 'offline_messages', newMessage.id), {
                  id: newMessage.id,
                  senderId: state.user?.id,
                  recipientId: targetId,
                  text: e2eData ? e2eData.encryptedText : text,
                  type: type || 'text',
                  fileUrl,
                  fileSize,
                  iv: e2eData?.iv,
                  encryptedFileKey: e2eData?.encryptedFileKey,
                  timestamp: newMessage.timestamp,
                  to: targetId,
                  isTemporaryFile: true,
                  isForwarded: true
                }).catch((err) => {
                  try {
                    handleFirestoreError(err, OperationType.WRITE, `offline_messages/${newMessage.id}`);
                  } catch (e) {
                    console.error("Gracefully caught offline message write error:", e);
                  }
                });
            });
          }
        }
      }
    } else {
      offlineMessageQueue.push({
        id: newMessage.id,
        chatId,
        recipientId,
        text,
        type,
        fileUrl,
        fileSize,
        e2eData
      });

        // Store offline messages in Firestore for offline recipients or disconnected state
        if (state.authMethod !== 'local') {
        if (isGroup && chat?.participants) {
          import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, setDoc }) => {
              chat.participants.forEach(p => {
                if (p.id !== state.user?.id) {
                  const uniqueMsgId = `${newMessage.id}-${p.id}`;
                  setDoc(doc(db, 'offline_messages', uniqueMsgId), {
                    id: uniqueMsgId,
                    senderId: state.user?.id,
                    recipientId: p.id,
                    groupId: chatId,
                    text: e2eData ? e2eData.encryptedText : text,
                    type: type || 'text',
                    fileUrl,
                    fileSize,
                    iv: e2eData?.iv,
                    encryptedFileKey: e2eData?.encryptedFileKey,
                    timestamp: newMessage.timestamp,
                    to: p.id
                  }).catch((err) => {
                    try {
                      handleFirestoreError(err, OperationType.WRITE, `offline_messages/${uniqueMsgId}`);
                    } catch (e) {
                      console.error("Gracefully caught offline message write error:", e);
                    }
                  });
                }
              });
            });
        } else {
          const targetId = recipientId || chat?.participants.find(p => p.id !== state.user?.id)?.id;
          if (targetId && !isGroup) {
           import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, setDoc }) => {
                  setDoc(doc(db, 'offline_messages', newMessage.id), {
                      id: newMessage.id,
                      senderId: state.user?.id,
                      recipientId: targetId,
                      text: e2eData ? e2eData.encryptedText : text,
                      type: type || 'text',
                      fileUrl,
                      fileSize,
                      iv: e2eData?.iv,
                      encryptedFileKey: e2eData?.encryptedFileKey,
                      timestamp: newMessage.timestamp,
                      to: targetId
                  }).catch((err) => {
                    try {
                      handleFirestoreError(err, OperationType.WRITE, `offline_messages/${newMessage.id}`);
                    } catch (e) {
                      console.error("Gracefully caught offline message write error:", e);
                    }
                  });
              });
          }
        }
      }
    }

    if (state.user?.id) {
      safeLocalStorageSetItem(`proto_offlineMessageQueue_${state.user.id}`, JSON.stringify(offlineMessageQueue));
    }

    let updatedChats = [...state.chats];
    let targetChatId = chatId;

    let additionalState = {};
    if (!chatId && recipientId) {
      const existingChat = state.chats.find(c => !c.isGroup && c.participants.some(p => p.id === recipientId));
      if (existingChat) {
        targetChatId = existingChat.id;
        additionalState = { activeChatId: existingChat.id, activeRecipientId: null };
      } else {
        const recipient = state.users.find(u => u.id === recipientId) || {
          id: recipientId,
          name: 'Unknown User',
          username: recipientId,
          avatar: generateInitialsAvatar(recipientId, 'Unknown User')
        };
        
        const newChat: Chat = {
          id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          participants: [
            { id: recipient.id, name: (recipient as any).name || (recipient as any).displayName, username: recipient.username, avatar: recipient.avatar, status: 'offline' },
            { id: state.user!.id, name: state.user!.displayName, username: state.user!.username, avatar: state.user!.avatar, status: 'online' }
          ],
          unreadCount: 0,
          messages: [newMessage],
          lastMessage: newMessage
        };
        updatedChats.push(newChat);
        return { chats: updatedChats, offlineMessageQueue, activeChatId: newChat.id, activeRecipientId: null };
      }
    }

    if (targetChatId) {
      updatedChats = updatedChats.map(c => {
        if (c.id === targetChatId) {
          const messages = c.messages || [];
          const exists = messages.some(m => m.id === newMessage.id);
          const updatedMessages = exists
            ? messages.map(m => m.id === newMessage.id ? { ...m, ...newMessage } : m)
            : [...messages, newMessage];
          return {
            ...c,
            messages: updatedMessages,
            lastMessage: newMessage
          };
        }
        return c;
      });
    }

    return { chats: updatedChats, offlineMessageQueue, ...additionalState };
  }),
  updateMessageFileUrl: (messageId, fileUrl, fileSize) => set((state) => {
    return {
      chats: state.chats.map(c => ({
        ...c,
        messages: c.messages?.map(m => m.id === messageId ? { ...m, fileUrl, fileSize: fileSize || m.fileSize } : m) || []
      }))
    };
  }),
  addPendingMessage: (chatId, recipientId, message) => set((state) => {
    let updatedChats = [...state.chats];
    const targetChatId = chatId || (recipientId ? state.chats.find(c => !c.isGroup && c.participants.some(p => p.id === recipientId))?.id : null);

    if (targetChatId) {
      updatedChats = updatedChats.map(c => c.id === targetChatId ? {
        ...c,
        messages: [...(c.messages || []), message],
        lastMessage: message
      } : c);
    } else if (recipientId) {
      // Create a temporary chat if it doesn't exist yet
      const recipient = state.users.find(u => u.id === recipientId) || {
        id: recipientId,
        name: 'Unknown User',
        username: recipientId,
        avatar: generateInitialsAvatar(recipientId, 'Unknown User')
      };
      const newChat: Chat = {
        id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        participants: [
          { id: recipient.id, name: (recipient as any).name || (recipient as any).displayName, username: recipient.username, avatar: recipient.avatar, status: 'offline' },
          { id: state.user!.id, name: state.user!.displayName, username: state.user!.username, avatar: state.user!.avatar, status: 'online' }
        ],
        unreadCount: 0,
        messages: [message],
        lastMessage: message
      };
      updatedChats.push(newChat);
    }
    return { chats: updatedChats };
  }),
  updateMessageProgress: (messageId, progress, status, errorCode) => set((state) => {
    return {
      chats: state.chats.map(c => ({
        ...c,
        messages: c.messages?.map(m => m.id === messageId ? {
          ...m,
          uploadProgress: progress,
          status: status || m.status,
          errorCode: errorCode || m.errorCode
        } : m) || []
      }))
    };
  }),
}));

if (typeof window !== 'undefined') {
  useAppStore.subscribe((state) => {
    try {
      if (state.user?.id) {
        safeLocalStorageSetItem(`proto_chats_${state.user.id}`, JSON.stringify(state.chats));
        safeLocalStorageSetItem(`proto_users_${state.user.id}`, JSON.stringify(state.users));
        safeLocalStorageSetItem(`proto_friendRequests_${state.user.id}`, JSON.stringify(state.friendRequests));
        safeLocalStorageSetItem(`proto_sentFriendRequests_${state.user.id}`, JSON.stringify(state.sentFriendRequests));
        safeLocalStorageSetItem(`proto_blockedUserIds_${state.user.id}`, JSON.stringify(state.blockedUserIds));
        safeLocalStorageSetItem(`proto_removedFriendIds_${state.user.id}`, JSON.stringify(state.removedFriendIds));
      } else {
        // Fallback for non-logged-in session state if any, though normally empty on logout
        safeLocalStorageSetItem('proto_users', JSON.stringify(state.users));
        safeLocalStorageSetItem('proto_chats', JSON.stringify(state.chats));
        safeLocalStorageSetItem('proto_friendRequests', JSON.stringify(state.friendRequests));
        safeLocalStorageSetItem('proto_sentFriendRequests', JSON.stringify(state.sentFriendRequests));
      }
    } catch (e) {
      console.error("Error subscribing to persist state:", e);
    }
  });
}

export function shallowEqual(objA: any, objB: any): boolean {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    const valA = objA[key];
    const valB = objB[key];
    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) return false;
      for (let j = 0; j < valA.length; j++) {
        if (!Object.is(valA[j], valB[j])) return false;
      }
    } else if (!Object.is(valA, valB)) {
      return false;
    }
  }
  return true;
}

export function useStore<T>(selector: (state: AppState) => T, equalityFn?: (a: T, b: T) => boolean): T {
  const lastSelectedState = useRef<T | undefined>(undefined);
  
  const getSnapshot = () => {
    const nextState = selector(useAppStore.getState());
    if (lastSelectedState.current !== undefined && equalityFn) {
      if (equalityFn(lastSelectedState.current, nextState)) {
        return lastSelectedState.current;
      }
    }
    lastSelectedState.current = nextState;
    return nextState;
  };

  return useSyncExternalStore(useAppStore.subscribe, getSnapshot, getSnapshot);
}

let syncDebounceTimeout: any = null;

export const flushCloudAutoSync = async () => {
  if (!syncDebounceTimeout) return;
  clearTimeout(syncDebounceTimeout);
  syncDebounceTimeout = null;
  
  const store = useAppStore.getState();
  const userId = store.user?.id;
  if (!userId || store.authMethod === 'local' || !store.autoSyncEnabled) return;
  if ((window as any).__isMergingCloudSync) {
    console.log("[Auto-Sync-Flush] Skipping sync flush because we are currently merging remote state.");
    return;
  }

  try {
    const { db, doc, setDoc, auth, handleFirestoreError, OperationType } = await import('./firebase');
    if (auth.currentUser?.uid !== userId) return;

    const rawPayload = {
      chats: store.chats,
      users: getLocalStorageJSON(`proto_users_${userId}`, []),
      friendRequests: getLocalStorageJSON(`proto_friendRequests_${userId}`, []),
      sentFriendRequests: getLocalStorageJSON(`proto_sentFriendRequests_${userId}`, []),
      blockedUserIds: store.blockedUserIds,
      removedFriendIds: store.removedFriendIds,
      lastUpdated: new Date().toISOString(),
      deviceInfo: {
        name: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Web',
        userId: userId
      }
    };

    const payload = JSON.parse(JSON.stringify(rawPayload));

    await setDoc(doc(db, 'cloud_syncs', userId), payload);
    console.log("[Auto-Sync-Flush] Successfully flushed database to Firestore.");
    (window as any).__lastUploadedSyncTime = payload.lastUpdated;
    
    if (store.socket && store.socket.connected) {
      store.socket.emit('notify_cloud_sync');
      store.reportFingerprint();
    }
  } catch (err) {
    console.error("[Auto-Sync-Flush] Failed to flush update to Firestore:", err);
    store.setCloudSyncStatus('error');
    try {
      const { handleFirestoreError, OperationType } = await import('./firebase');
      handleFirestoreError(err, OperationType.WRITE, `cloud_syncs/${userId}`);
    } catch (e) {
      console.error("Gracefully caught cloud sync flush write error:", e);
    }
  }
};

export const triggerCloudAutoSync = (userId: string) => {
  if (!userId) return;
  const store = useAppStore.getState();
  if (!store.autoSyncEnabled) return;
  if (store.authMethod === 'local') return; // Skip Firestore for local guest profiles

  if ((window as any).__isMergingCloudSync) {
    console.log("[Auto-Sync] Skipping auto-sync trigger because we are currently merging remote state.");
    return;
  }

  if (syncDebounceTimeout) {
    clearTimeout(syncDebounceTimeout);
  }

  syncDebounceTimeout = setTimeout(async () => {
    syncDebounceTimeout = null;
    try {
      const { db, doc, setDoc, auth, handleFirestoreError, OperationType } = await import('./firebase');
      if (auth.currentUser?.uid !== userId) return;

      const rawPayload = {
        chats: store.chats,
        users: getLocalStorageJSON(`proto_users_${userId}`, []),
        friendRequests: getLocalStorageJSON(`proto_friendRequests_${userId}`, []),
        sentFriendRequests: getLocalStorageJSON(`proto_sentFriendRequests_${userId}`, []),
        blockedUserIds: store.blockedUserIds,
        removedFriendIds: store.removedFriendIds,
        lastUpdated: new Date().toISOString(),
        deviceInfo: {
          name: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Web',
          userId: userId
        }
      };

      // Firestore does not support undefined values.
      // We can serialize and deserialize via JSON to strip all undefined fields safely.
      const payload = JSON.parse(JSON.stringify(rawPayload));

      await setDoc(doc(db, 'cloud_syncs', userId), payload);
      console.log("[Auto-Sync] Successfully synchronized database to Firestore.");
      
      (window as any).__lastUploadedSyncTime = payload.lastUpdated;
      
      // Notify other active sessions of the same account via websocket so they pull immediately
      if (store.socket && store.socket.connected) {
        store.socket.emit('notify_cloud_sync');
        store.reportFingerprint();
      }
    } catch (err) {
      console.error("[Auto-Sync] Failed to push update to Firestore:", err);
      store.setCloudSyncStatus('error');
      try {
        const { handleFirestoreError, OperationType } = await import('./firebase');
        handleFirestoreError(err, OperationType.WRITE, `cloud_syncs/${userId}`);
      } catch (e) {
        console.error("Gracefully caught cloud sync write error:", e);
      }
    }
  }, 3000); // Debounce by 3 seconds
};

export function calculateLocalChatFingerprint(): string {
  const state = useAppStore.getState();
  const chats = state.chats || [];
  
  const sortedChats = [...chats].sort((a, b) => a.id.localeCompare(b.id));
  const chatParts = sortedChats.map(c => {
    const messages = c.messages || [];
    const sortedMessages = [...messages].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
    const messagePart = sortedMessages.map((m: any) => `${m.id}:${m.senderId}:${m.text ? m.text.slice(0, 15) : ''}`).join('|');
    return `${c.id}:${messages.length}:${messagePart}`;
  });

  const canonicalString = `CHATS:[${chatParts.join(';')}]`;

  let hash = 5381;
  for (let i = 0; i < canonicalString.length; i++) {
    hash = (hash * 33) ^ canonicalString.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function mergeCloudSyncPayload(payload: any, userId: string) {
  if (!userId) return;
  const store = useAppStore.getState();

  // Set merging flag to prevent infinite loops and sync flooding
  (window as any).__isMergingCloudSync = true;
  if ((window as any).__mergeTimeout) {
    clearTimeout((window as any).__mergeTimeout);
  }

  const saveLocalJSON = (key: string, value: any) => {
    try {
      safeLocalStorageSetItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Local storage error in mergeCloudSyncPayload:", e);
    }
  };

  const getMessageTimestamp = (m: any): number => {
    if (m.id && typeof m.id === 'string' && m.id.startsWith('m-')) {
      const parts = m.id.split('-');
      const parsed = parseInt(parts[1], 10);
      if (!isNaN(parsed) && parsed > 100000) {
        return parsed;
      }
    }
    const parsed = Date.parse(m.timestamp);
    if (!isNaN(parsed)) return parsed;
    return 0;
  };

  // 1. Merge Chats & Messages
  const existingChats = store.chats || [];
  const incomingChats = payload.chats || [];
  const mergedChats = [...existingChats];

  for (const incChat of incomingChats) {
    const existingIdx = mergedChats.findIndex(c => c.id === incChat.id);
    if (existingIdx >= 0) {
      const existingMessages = mergedChats[existingIdx].messages || [];
      const incomingMessages = incChat.messages || [];
      
      const msgMap = new Map<string, any>();
      existingMessages.forEach(m => msgMap.set(m.id, m));
      incomingMessages.forEach(m => msgMap.set(m.id, m));
      
      mergedChats[existingIdx] = {
        ...mergedChats[existingIdx],
        ...incChat,
        messages: Array.from(msgMap.values()).sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b))
      };
    } else {
      mergedChats.push(incChat);
    }
  }

  // Update store and local storage
  store.setChats(mergedChats);
  saveLocalJSON(`proto_chats_${userId}`, mergedChats);

  // 2. Merge Friends/Users
  const existingUsers = store.users || [];
  const incomingUsers = payload.users || [];
  const userMap = new Map<string, any>();
  existingUsers.forEach((u: any) => userMap.set(u.id, u));
  incomingUsers.forEach((u: any) => userMap.set(u.id, u));
  const currentOnlineUserIds = useAppStore.getState().onlineUserIds || [];
  const mergedUsers = Array.from(userMap.values()).map(u => ({ ...u, isOnline: currentOnlineUserIds.includes(u.id) }));
  saveLocalJSON(`proto_users_${userId}`, mergedUsers);
  
  useAppStore.setState({ users: mergedUsers });

  // 3. Sync friendRequests, sentFriendRequests, blockedUserIds, removedFriendIds
  if (payload.friendRequests) {
    saveLocalJSON(`proto_friendRequests_${userId}`, payload.friendRequests);
    store.setFriendRequests(payload.friendRequests);
  }
  if (payload.sentFriendRequests) {
    saveLocalJSON(`proto_sentFriendRequests_${userId}`, payload.sentFriendRequests);
    useAppStore.setState({ sentFriendRequests: payload.sentFriendRequests });
  }
  if (payload.blockedUserIds) {
    saveLocalJSON(`proto_blockedUserIds_${userId}`, payload.blockedUserIds);
    useAppStore.setState({ blockedUserIds: payload.blockedUserIds });
  }
  if (payload.removedFriendIds) {
    saveLocalJSON(`proto_removedFriendIds_${userId}`, payload.removedFriendIds);
    useAppStore.setState({ removedFriendIds: payload.removedFriendIds });
  }

  // Clear merging flag after state updates flush
  (window as any).__mergeTimeout = setTimeout(() => {
    (window as any).__isMergingCloudSync = false;
  }, 500);
}

export async function syncPushedMessagesFromCache() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await caches.open('chat-pushed-messages');
    const requests = await cache.keys();
    if (requests.length === 0) return;

    console.log(`[Pushed Messages Sync] Found ${requests.length} cached push messages to merge.`);
    const store = useAppStore.getState();
    const userId = store.user?.id;
    if (!userId) return;

    let chatsUpdated = false;
    const chats = [...store.chats];

    for (const req of requests) {
      try {
        const res = await cache.match(req);
        if (res) {
          const msgData = await res.json();
          const messageId = msgData.messageId || msgData.id;
          if (!messageId) continue;

          const isGrp = !!msgData.groupId;
          const chat = isGrp 
            ? chats.find(c => c.id === msgData.groupId)
            : chats.find(c => !c.isGroup && c.participants.some(p => p.id === (msgData.senderId === userId ? msgData.recipientId : msgData.senderId)));

          if (chat && chat.messages?.some(m => m.id === messageId)) {
            await cache.delete(req);
            continue;
          }

          const newMessage: Message = {
            id: messageId,
            senderId: msgData.senderId,
            text: msgData.text,
            timestamp: msgData.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: (msgData.type as any) || 'text',
            fileUrl: msgData.fileUrl,
            fileSize: msgData.fileSize,
            encryptedFileKey: msgData.encryptedFileKey,
            iv: msgData.iv,
            isE2E: !!(msgData.iv || msgData.encryptedFileKey),
            isOwn: msgData.senderId === userId
          };

          if (chat) {
            const updatedMessages = [...(chat.messages || []), newMessage];
            const chatIdx = chats.findIndex(c => c.id === chat.id);
            chats[chatIdx] = {
              ...chat,
              messages: updatedMessages,
              lastMessage: newMessage,
              unreadCount: newMessage.isOwn ? 0 : (chat.unreadCount || 0) + 1
            };
            chatsUpdated = true;
          } else if (!isGrp) {
            const peerId = msgData.senderId === userId ? msgData.recipientId : msgData.senderId;
            if (peerId) {
              const peer = store.users.find(u => u.id === peerId) || {
                id: peerId,
                displayName: 'Unknown User',
                username: peerId,
                avatar: generateInitialsAvatar(peerId, 'Unknown User')
              };
              const newChat: Chat = {
                id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                participants: [
                  { id: peer.id, name: (peer as any).displayName || (peer as any).name || 'Unknown User', username: peer.username, avatar: peer.avatar, status: 'offline' },
                  { id: userId, name: store.user!.displayName, username: store.user!.username, avatar: store.user!.avatar, status: 'online' }
                ],
                unreadCount: newMessage.isOwn ? 0 : 1,
                messages: [newMessage],
                lastMessage: newMessage
              };
              chats.push(newChat);
              chatsUpdated = true;
            }
          }
          await cache.delete(req);
        }
      } catch (err) {
        console.error('[Pushed Messages Sync] Error parsing/merging cached push message:', err);
      }
    }

    if (chatsUpdated) {
      useAppStore.setState({ chats });
      console.log('[Pushed Messages Sync] Successfully merged cached push messages into local chats.');
    }
  } catch (e) {
    console.error('[Pushed Messages Sync] Failed to check/sync pushed messages from cache:', e);
  }
}

