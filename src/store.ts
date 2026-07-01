import { create } from 'zustand';
import { Chat, Message, Device, Transfer, Notification } from './types';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from './config';

export type AppMode = 'social' | 'fileshare' | 'hub' | 'admin';

interface UserProfile {
  id: string;
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
  activeGroupCall: { type: 'voice' | 'video', groupId?: string, userId?: string } | null;
  setActiveGroupCall: (call: { type: 'voice' | 'video', groupId?: string, userId?: string } | null) => void;
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
  sendMessage: (chatId: string | null, recipientId: string | null, text: string, type?: Message['type'], fileUrl?: string, fileSize?: string, e2eData?: { encryptedText: string, iv: number[], encryptedFileKey?: number[] }, isForwarded?: boolean) => void;
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
  devices: Device[];
  transfers: Transfer[];
  acceptTransfer: (transferId: string) => void;
  declineTransfer: (transferId: string) => void;
  offlineMessageQueue: { id: string, chatId: string | null, recipientId: string | null, text: string, type: string, fileUrl?: string, fileSize?: string, e2eData?: any }[];
}

export const DEFAULT_PRESETS: UserProfile[] = [];

let heartbeatIntervalId: any = null;
let isWakingUp = false;
let lastSuccessfulWakeUpTime = 0;

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
        return JSON.parse(item) as T;
      } catch (e) {
        console.error("Error parsing localStorage key", key, e);
      }
    }
  }
  return defaultValue;
};

const cachedUser = getLocalStorageJSON<any>('proto_user', null);
const cachedIsLoggedIn = getLocalStorageItem('proto_isLoggedIn', 'false') === 'true';
const cachedAuthMethod = getLocalStorageItem('proto_authMethod', '') || null;
const cachedBlockedUserIds = getLocalStorageJSON<string[]>('proto_blockedUserIds', []);
const cachedRemovedFriendIds = getLocalStorageJSON<string[]>('proto_removedFriendIds', []);
const cachedUsers = cachedUser 
  ? getLocalStorageJSON<any[]>(`proto_users_${cachedUser.id}`, getLocalStorageJSON<any[]>('proto_users', []))
  : getLocalStorageJSON<any[]>('proto_users', []);
const cachedChats = cachedUser 
  ? getLocalStorageJSON<any[]>(`proto_chats_${cachedUser.id}`, getLocalStorageJSON<any[]>('proto_chats', []))
  : getLocalStorageJSON<any[]>('proto_chats', []);
const cachedFriendRequests = getLocalStorageJSON<any[]>('proto_friendRequests', []);
const cachedSentFriendRequests = getLocalStorageJSON<string[]>('proto_sentFriendRequests', []);

export const useAppStore = create<AppState>((set) => ({
  onlineUserIds: [] as string[],
  offlineMessageQueue: [],
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
        localStorage.setItem('proto_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('proto_user');
      }
    }
  },
  updateUser: (data) => set((state) => {
    const updatedUser = state.user ? { ...state.user, ...data } : null;
    if (typeof window !== 'undefined' && updatedUser) {
      localStorage.setItem('proto_user', JSON.stringify(updatedUser));
    }
    // Also update in Firestore in background if available
    if (state.user && state.authMethod !== 'local') {
      import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, updateDoc }) => {
        updateDoc(doc(db, 'users', state.user!.id), data).catch(err => {
          console.error("Failed to sync user profile update to Firestore:", err);
        });
      });
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
      avatar: 'https://picsum.photos/seed/sarah/200',
      description: 'Senior Product Designer & Tech Enthusiast',
      isAdmin: true,
      joinDate: new Date('2023-01-15').toISOString(),
      profileVisibility: 'everyone',
      notificationSettings: {
        pushEnabled: true,
        previewEnabled: true,
        soundEnabled: false,
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
      } else {
        const legacy = localStorage.getItem('proto_chats');
        if (legacy) {
          try {
            userChats = JSON.parse(legacy);
          } catch (e) {}
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
      } else {
        const legacy = localStorage.getItem('proto_users');
        if (legacy) {
          try {
            userUsers = JSON.parse(legacy);
          } catch (e) {}
        }
      }
    }

    set({ 
      isLoggedIn: true, 
      user,
      authMethod,
      chats: userChats,
      friendRequests: [],
      groupJoinRequests: [],
      onlineUserIds: [],
      users: userUsers
    });
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('proto_user', JSON.stringify(user));
      localStorage.setItem('proto_isLoggedIn', 'true');
      localStorage.setItem('proto_authMethod', authMethod);
    }
    
    // Automatically connect on-the-spot connections for both login methods.
    useAppStore.getState().initSocket(user.id);
  },
  logout: () => {
    const state = useAppStore.getState();
    if (state.socket) {
      state.socket.disconnect();
    }
    // Sign out of Firebase if initialized
    import('./firebase').then(({ auth }) => {
      if (auth.currentUser) {
        auth.signOut();
      }
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
      chats: [],
      authMethod: null,
      wssStatus: 'disconnected',
      isWssConnected: false,
      wssMessage: '',
      selectedMessageIds: [], 
      friendRequests: [], 
      sentFriendRequests: [], 
      groupJoinRequests: [], 
      offlineMessageQueue: [],
      socket: null 
    });
  },
  socket: null,
  tempMessages: [],
  addTempMessage: (msg) => set((state) => ({ tempMessages: [...state.tempMessages, msg] })),
  clearTempMessages: () => set({ tempMessages: [] }),
  inAppToasts: [],
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

    const targetUrl = BACKEND_URL || window.location.origin;
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
      // If we successfully woke up the server very recently (within 60 seconds),
      // we assume it is still awake and we just let socket.io's built-in reconnection do the job.
      if (Date.now() - lastSuccessfulWakeUpTime < 60000) {
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
          try {
            const response = await fetch(`${targetUrl}/api/health`, {
              signal: controller.signal,
              headers: { 'Cache-Control': 'no-cache' }
            });
            if (response.ok) {
              success = true;
            }
          } catch (err) {
            // Fallback to no-cors mode to bypass CORS blocking on external domains
            try {
              const noCorsController = new AbortController();
              const noCorsTimeoutId = setTimeout(() => noCorsController.abort(), 4000);
              await fetch(`${targetUrl}/api/health`, {
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

    const startHeartbeat = () => {
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
      }
      
      heartbeatIntervalId = setInterval(async () => {
        const currentStatus = useAppStore.getState().wssStatus;
        if (currentStatus !== 'connected') {
          return;
        }
        
        useAppStore.getState().addConnectionLog('Heartbeat: Keep-alive ping to prevent server sleep...');
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          let success = false;
          try {
            const response = await fetch(`${targetUrl}/api/health`, {
              signal: controller.signal,
              headers: { 'Cache-Control': 'no-cache' }
            });
            if (response.ok) {
              success = true;
            }
          } catch (err) {
            // Fallback to no-cors
            try {
              const noCorsController = new AbortController();
              const noCorsTimeoutId = setTimeout(() => noCorsController.abort(), 5000);
              await fetch(`${targetUrl}/api/health`, {
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
            useAppStore.getState().addConnectionLog('Heartbeat: Server is alive and warm.');
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
      }, 30000); // every 30 seconds
    };

    // Trigger wakeup process in parallel
    wakeUp().catch(console.error);

    const socket = io(targetUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 20000,
      autoConnect: true,
    });
    set({ socket });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      const appState = useAppStore.getState();
      appState.addConnectionLog(`Socket connection error: ${error.message || error}`);
      
      if (appState.wssStatus === 'connected') {
        set({ wssStatus: 'connecting', wssMessage: 'Reconnecting to backend...' });
      }
      
      // Trigger exponential backoff wake up to ensure Render spins up
      wakeUp().catch(console.error);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      useAppStore.getState().addConnectionLog(`Socket disconnected: ${reason}`);
      set({ wssStatus: 'disconnected', isWssConnected: false, wssMessage: `Disconnected: ${reason}` });
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
      }
    });
    
    socket.on('connect', async () => {
      console.log('Connected to server');
      lastSuccessfulWakeUpTime = Date.now();
      useAppStore.getState().addConnectionLog('Successfully connected to backend server!');
      set({ wssStatus: 'connected', isWssConnected: true, wssMessage: 'Connected & Secure' });
      startHeartbeat();
      const { cryptoService } = await import('./services/cryptoService');
      const publicKey = await cryptoService.getMyPublicKeyBase64(userId);
      socket.emit('register', { userId, publicKey });
      
      // Auto join group rooms on connect
      const activeState = useAppStore.getState();
      activeState.chats.forEach(c => {
        if (c.isGroup) {
          socket.emit('join_group', c.id);
        }
      });

      // Resend offline queued messages automatically on connect
      if (activeState.offlineMessageQueue && activeState.offlineMessageQueue.length > 0) {
        console.log(`Resending ${activeState.offlineMessageQueue.length} offline queued messages...`);
        activeState.offlineMessageQueue.forEach((msg) => {
          const chatObj = activeState.chats.find(c => c.id === msg.chatId);
          const isGrp = chatObj?.isGroup;
          if (isGrp && chatObj?.participants) {
            socket.emit('send_message', {
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
              socket.emit('send_message', {
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
      }
    });

    // === FIREBASE USER DETAILS SYNCHRONIZATION (WRITE ONLY, NO LISTENERS) ===
    if (useAppStore.getState().authMethod !== 'local') {
      import('./firebase').then(({ db, handleFirestoreError, OperationType, doc, setDoc }) => {
          // Broadcast my public key via Firebase:
          import('./services/cryptoService').then(async ({ cryptoService }) => {
              const publicKey = await cryptoService.getMyPublicKeyBase64(userId);
              setDoc(doc(db, 'users', userId), { publicKey }, { merge: true }).catch((err) => {
                try {
                  handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
                } catch (e) {
                  console.error("Gracefully caught public key broadcast error:", e);
                }
              });
          });

          socket.on('disconnect', () => {
             // Mark self as offline in Firebase
             setDoc(doc(db, 'users', userId), { isOnline: false, lastSeen: new Date().toISOString() }, { merge: true }).catch((err) => {
                try {
                  handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
                } catch (e) {
                  console.error("Gracefully caught offline status error:", e);
                }
             });
          });

          socket.on('connect', () => {
             // Mark self as online in Firebase so other users can see status in search
             setDoc(doc(db, 'users', userId), { isOnline: true, lastSeen: new Date().toISOString() }, { merge: true }).catch((err) => {
                try {
                  handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
                } catch (e) {
                  console.error("Gracefully caught online status error:", e);
                }
             });
          });
      });
    }

    socket.on('user_status', (data: { userId: string, isOnline: boolean }) => {
      const nowStr = new Date().toISOString();
      set((state) => {
        const nextOnline = data.isOnline
          ? [...new Set([...state.onlineUserIds, data.userId])]
          : state.onlineUserIds.filter(id => id !== data.userId);
        return { onlineUserIds: nextOnline };
      });
      useAppStore.getState().updateUserByAdmin(data.userId, { 
        isOnline: data.isOnline,
        lastSeen: data.isOnline ? undefined : nowStr
      });
    });

    socket.on('online_users', (onlineUserIds: string[]) => {
      set({ onlineUserIds });
      const state = useAppStore.getState();
      state.users.forEach(u => {
        state.updateUserByAdmin(u.id, { isOnline: onlineUserIds.includes(u.id) });
      });
    });

    socket.on('receive_message', async (data: { id?: string, messageId?: string, groupId?: string, senderId: string, text: string, type: Message['type'], fileUrl?: string, fileSize?: string, encryptedFileKey?: number[], iv?: number[] }) => {
      const state = useAppStore.getState();
      const { cryptoService } = await import('./services/cryptoService');
      
      let decryptedText = data.text;
      
      if (data.iv && data.text) {
        try {
          const remotePubKeyBase64 = await new Promise<string>((resolve) => {
            const socket = state.socket;
            if (socket && socket.connected) {
              const timeout = setTimeout(() => resolve(''), 1000);
              socket.emit("get_public_key", { userId: data.senderId }, (res: string) => {
                clearTimeout(timeout);
                resolve(res || '');
              });
            } else {
              resolve('');
            }
          });
          if (remotePubKeyBase64) {
            const sharedSecret = await cryptoService.deriveSharedSecret(data.senderId, remotePubKeyBase64, userId);
            const encryptedObj = JSON.parse(data.text);
            decryptedText = await cryptoService.decryptText(encryptedObj.iv, encryptedObj.ciphertext, sharedSecret);
          }
        } catch(e) {
          console.error("Decryption failed", e);
          decryptedText = "🔒 [Encrypted Message]";
        }
      }

      const newMessage: Message = {
        id: data.id || data.messageId || `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        senderId: data.senderId,
        text: decryptedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: data.type || 'text',
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        encryptedFileKey: data.encryptedFileKey,
        iv: data.iv,
        isE2E: !!(data.iv || data.encryptedFileKey || (data.text && typeof data.text === 'string' && data.text.includes('"iv"'))),
        isOwn: false
      };

      // Real-time notifications are now handled by the useNotifications hook in App.tsx

      // Find chat or create one
      set((state) => {
        let updatedChats = [...state.chats];
        let chat = data.groupId
          ? updatedChats.find(c => c.id === data.groupId)
          : updatedChats.find(c => !c.isGroup && c.participants.some(p => p.id === data.senderId));
        
        if (chat) {
          // Guard against duplicates
          if (chat.messages?.some(m => m.id === newMessage.id)) {
            return {};
          }
          updatedChats = updatedChats.map(c => c.id === chat!.id ? {
            ...c,
            messages: [...(c.messages || []), newMessage],
            lastMessage: newMessage,
            unreadCount: state.activeChatId === c.id ? c.unreadCount : (c.unreadCount || 0) + 1
          } : c);
        } else if (!data.groupId) {
          // For individual chats only, create if not found
          const sender = state.users.find(u => u.id === data.senderId) || {
            id: data.senderId,
            displayName: 'Unknown User',
            username: data.senderId,
            avatar: `https://picsum.photos/seed/${data.senderId}/200`
          };
          const newChat: Chat = {
            id: `c-${Date.now()}`,
            participants: [
              { id: sender.id, name: sender.displayName, username: sender.username, avatar: sender.avatar, status: 'online' },
              { id: state.user!.id, name: state.user!.displayName, username: state.user!.username, avatar: state.user!.avatar, status: 'online' }
            ],
            unreadCount: 1,
            messages: [newMessage],
            lastMessage: newMessage
          };
          updatedChats.push(newChat);
        }
        return { chats: updatedChats };
      });
    });

    socket.on('sfu_signal', (data: { roomId: string, from: string, signal: any }) => {
      import('./services/webrtcService').then(({ webrtcService }) => {
        webrtcService.handleSignal(data.from, data.signal, data.roomId);
      });
    });

    socket.on('incoming_call', (data: { roomId: string, type: 'voice' | 'video', from: string }) => {
      set((state) => {
        if (!state.activeGroupCall) {
          return { activeGroupCall: { type: data.type, userId: data.from } };
        }
        return state;
      });
    });

    socket.on('call_ended', () => {
      set({ activeGroupCall: null });
    });

    socket.on('typing', (data: { senderId: string, isTyping: boolean }) => {
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [data.senderId]: data.isTyping
        }
      }));
    });

    socket.on('typing_start', (data: { senderId: string }) => {
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [data.senderId]: true
        }
      }));
    });

    socket.on('typing_stop', (data: { senderId: string }) => {
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [data.senderId]: false
        }
      }));
    });

    set({ socket });
  },
  activeChatId: null,
  setActiveChatId: (id) => set((state) => {
    if (id && state.socket && state.socket.connected) {
      const chat = state.chats.find(c => c.id === id);
      if (chat?.isGroup) {
        state.socket.emit('join_group', id);
      }
    }
    return { activeChatId: id, activeRecipientId: null, selectedMessageIds: [] };
  }),
  activeRecipientId: null,
  setActiveRecipientId: (id) => set({ activeRecipientId: id, activeChatId: null, selectedMessageIds: [] }),
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
    set((state) => {
      const request = state.friendRequests.find(r => r.id === requestId);
      if (!request) return state;
      
      const newRequests = state.friendRequests.filter(r => r.id !== requestId);
      const newRemoved = state.removedFriendIds.filter(id => id !== request.userId);
      return { friendRequests: newRequests, removedFriendIds: newRemoved };
    });
    
    try {
      const { db, updateDoc, doc } = await import('./firebase');
      await updateDoc(doc(db, 'friendRequests', requestId), { status: 'accepted' });
    } catch (err) {
      console.error("Error accepting request in db:", err);
    }
  },
  rejectFriendRequest: async (requestId) => {
    set((state) => ({
      friendRequests: state.friendRequests.filter(r => r.id !== requestId)
    }));
    
    try {
      const { db, deleteDoc, doc } = await import('./firebase');
      await deleteDoc(doc(db, 'friendRequests', requestId));
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
        const { db, addDoc, collection, serverTimestamp, query, where, getDocs, doc, setDoc } = await import('./firebase');
        const requestsRef = collection(db, 'friendRequests');
        
        // Prevent dupes
        const q = query(requestsRef, where('fromUserId', '==', state.user.id), where('toUserId', '==', userId));
        const existing = await getDocs(q);
        if (existing.empty) {
          const docRef = await addDoc(requestsRef, {
            fromUserId: state.user.id,
            toUserId: userId,
            createdAt: serverTimestamp(),
            status: 'pending'
          });

          // Create persistent notification record
          const notifId = `notif-friend-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const notifRef = doc(db, 'notifications', notifId);
          await setDoc(notifRef, {
            id: notifId,
            type: 'friend_request',
            senderId: state.user.id,
            senderName: state.user.displayName || state.user.username,
            senderAvatar: state.user.avatar || '',
            recipientId: userId,
            title: 'New Friend Request',
            body: `${state.user.displayName || state.user.username} sent you a friend request.`,
            requestId: docRef.id,
            status: 'created',
            createdAt: new Date().toISOString()
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
        const { db, deleteDoc, doc, collection, query, where, getDocs } = await import('./firebase');
        const requestsRef = collection(db, 'friendRequests');
        const q = query(requestsRef, where('fromUserId', '==', state.user.id), where('toUserId', '==', userId));
        const existing = await getDocs(q);
        existing.forEach(async (d) => {
           await deleteDoc(doc(db, 'friendRequests', d.id));
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
      const { db, updateDoc, doc } = await import('./firebase');
      await updateDoc(doc(db, 'notifications', id), { 
        status: 'read',
        readAt: new Date().toISOString()
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
      const { db, updateDoc, doc } = await import('./firebase');
      await Promise.all(unread.map(async (n) => {
        await updateDoc(doc(db, 'notifications', n.id), { 
          status: 'read',
          readAt: new Date().toISOString()
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
      const { db, deleteDoc, doc } = await import('./firebase');
      await Promise.all(ids.map(async (id) => {
        await deleteDoc(doc(db, 'notifications', id));
      }));
    } catch (err) {
      console.error("Error clearing notifications in db:", err);
    }
  },
  groupJoinRequests: [],
  setGroupJoinRequests: (requests) => set({ groupJoinRequests: requests }),
  chats: cachedChats,
  setChats: (chats) => set({ chats }),
  typingUsers: {},
  setTypingUser: (userId, isTyping) => set(state => ({ typingUsers: { ...state.typingUsers, [userId]: isTyping } })),
  activeGroupCall: null,
  setActiveGroupCall: (call) => set({ activeGroupCall: call }),
  blockedUserIds: cachedBlockedUserIds,
  removedFriendIds: cachedRemovedFriendIds,
  removeFriend: async (userId) => {
    const state = useAppStore.getState();
    const currentUserId = state.user?.id;
    
    set((state) => {
      const nextRemoved = [...state.removedFriendIds, userId];
      if (typeof window !== 'undefined') {
        localStorage.setItem('proto_removedFriendIds', JSON.stringify(nextRemoved));
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
        const { db, collection, query, where, getDocs, deleteDoc, doc, updateDoc } = await import('./firebase');
        
        // Find and delete the accepted friend requests where this user and userId are participants
        const requestsRef = collection(db, 'friendRequests');
        
        const q1 = query(requestsRef, where('fromUserId', '==', currentUserId), where('toUserId', '==', userId));
        const s1 = await getDocs(q1);
        s1.forEach(async (d) => {
          await deleteDoc(doc(db, 'friendRequests', d.id));
        });

        const q2 = query(requestsRef, where('fromUserId', '==', userId), where('toUserId', '==', currentUserId));
        const s2 = await getDocs(q2);
        s2.forEach(async (d) => {
          await deleteDoc(doc(db, 'friendRequests', d.id));
        });

        // Save removedFriendIds to users profile in Firestore
        const nextRemoved = useAppStore.getState().removedFriendIds;
        await updateDoc(doc(db, 'users', currentUserId), { removedFriendIds: nextRemoved });
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
        localStorage.setItem('proto_removedFriendIds', JSON.stringify(nextRemoved));
      }
      return {
        removedFriendIds: nextRemoved
      };
    });

    if (currentUserId) {
      try {
        const { db, doc, updateDoc } = await import('./firebase');
        const nextRemoved = useAppStore.getState().removedFriendIds;
        await updateDoc(doc(db, 'users', currentUserId), { removedFriendIds: nextRemoved });
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
        localStorage.setItem('proto_blockedUserIds', JSON.stringify(nextBlocked));
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
        const { db, doc, updateDoc } = await import('./firebase');
        const nextBlocked = useAppStore.getState().blockedUserIds;
        await updateDoc(doc(db, 'users', currentUserId), { blockedUserIds: nextBlocked });
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
        localStorage.setItem('proto_blockedUserIds', JSON.stringify(nextBlocked));
      }
      return {
        blockedUserIds: nextBlocked
      };
    });

    if (currentUserId) {
      try {
        const { db, doc, updateDoc } = await import('./firebase');
        const nextBlocked = useAppStore.getState().blockedUserIds;
        await updateDoc(doc(db, 'users', currentUserId), { blockedUserIds: nextBlocked });
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
          const newUser = { id: userId, name: 'New Member', username: 'new_member', avatar: `https://picsum.photos/seed/${userId}/200`, status: 'online' as const };
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
        avatar: data.avatar || `https://picsum.photos/seed/${newId}/200`,
        participants: data.members.map(id => ({ id, name: 'Member', username: 'member', avatar: `https://picsum.photos/seed/${id}/200`, status: 'online' as const })),
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
  sendMessage: (chatId, recipientId, text, type = 'text', fileUrl, fileSize, e2eData?: { encryptedText: string, iv: number[], encryptedFileKey?: number[] }, isForwarded?: boolean) => set((state) => {
    const isSocketConnected = state.socket && state.socket.connected;
    let offlineMessageQueue = [...state.offlineMessageQueue];
    const newMessage: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      senderId: state.user?.id || 'u1',
      senderName: state.user?.displayName || 'You',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: type as any,
      fileUrl,
      fileSize,
      isOwn: true,
      status: isSocketConnected ? 'sent' : 'pending',
      isE2E: !!e2eData,
      iv: e2eData?.iv,
      encryptedFileKey: e2eData?.encryptedFileKey
    };

    // Simulate read receipt since we don't have full socket ack logic here
    if (isSocketConnected) {
      setTimeout(() => {
        useAppStore.setState((s) => ({
          chats: s.chats.map(c => 
            (c.id === chatId || (recipientId && c.participants.some(p => p.id === recipientId)))
              ? { ...c, messages: c.messages.map(m => m.id === newMessage.id ? { ...m, status: 'read' as const } : m) }
              : c
          )
        }));
      }, 2000);
    }

    // Emit via socket or fallback to Firebase
    const chat = state.chats.find(c => c.id === chatId);
    const isGroup = chat?.isGroup;

    if (state.socket && state.socket.connected) {
      if (isGroup && chat?.participants) {
        state.socket.emit('send_message', {
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

      // Only store offline messages if they are plain text messages
      if (type === 'text' && !fileUrl && state.authMethod !== 'local') {
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
          avatar: `https://picsum.photos/seed/${recipientId}/200`
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
          return {
            ...c,
            messages: [...(c.messages || []), newMessage],
            lastMessage: newMessage
          };
        }
        return c;
      });
    }

    return { chats: updatedChats, offlineMessageQueue, ...additionalState };
  }),
}));

if (typeof window !== 'undefined') {
  useAppStore.subscribe((state) => {
    try {
      localStorage.setItem('proto_users', JSON.stringify(state.users));
      localStorage.setItem('proto_chats', JSON.stringify(state.chats));
      if (state.user?.id) {
        localStorage.setItem(`proto_chats_${state.user.id}`, JSON.stringify(state.chats));
        localStorage.setItem(`proto_users_${state.user.id}`, JSON.stringify(state.users));
      }
      localStorage.setItem('proto_friendRequests', JSON.stringify(state.friendRequests));
      localStorage.setItem('proto_sentFriendRequests', JSON.stringify(state.sentFriendRequests));
    } catch (e) {
      console.error("Error subscribing to persist state:", e);
    }
  });
}
