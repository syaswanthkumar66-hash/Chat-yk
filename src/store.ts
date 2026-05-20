import { create } from 'zustand';
import { Chat, Message, Device, Transfer } from './types';
import { io, Socket } from 'socket.io-client';

export type AppMode = 'social' | 'fileshare' | 'hub' | 'admin';

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  description: string;
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
  login: (userData?: UserProfile) => void;
  logout: () => void;
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
  users: UserProfile[];
  banUser: (userId: string) => void;
  flagUser: (userId: string, reason: string) => void;
  promoteUser: (userId: string) => void;
  updateUserByAdmin: (userId: string, data: Partial<UserProfile>) => void;
  addUser: (user: Partial<UserProfile> & Omit<UserProfile, 'id'>) => void;
  sendMessage: (chatId: string | null, recipientId: string | null, text: string, type?: Message['type'], fileUrl?: string, fileSize?: string, e2eData?: { encryptedText: string, iv: number[], encryptedFileKey?: number[] }) => void;
  socket: Socket | null;
  initSocket: (userId: string) => void;
  tempMessages: Message[];
  addTempMessage: (msg: Message) => void;
  clearTempMessages: () => void;
  devices: Device[];
  transfers: Transfer[];
}

export const useAppStore = create<AppState>((set) => ({
  devices: [],
  transfers: [],
  mode: 'hub',
  setMode: (mode) => set({ mode, activeChatId: null, activeRecipientId: null, activeDeviceId: null, viewingUserId: null, joinGroupId: null, selectedMessageIds: [] }),
  isLoggedIn: false,
  user: null,
  setUser: (user) => set({ user }),
  updateUser: (data) => set((state) => ({
    user: state.user ? { ...state.user, ...data } : null
  })),
  login: (userData) => {
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
    set({ 
      isLoggedIn: true, 
      user,
      friendRequests: [],
      groupJoinRequests: []
    });
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

    set({ isLoggedIn: false, mode: 'hub', user: null, selectedMessageIds: [], friendRequests: [], sentFriendRequests: [], groupJoinRequests: [], socket: null });
  },
  socket: null,
  tempMessages: [],
  addTempMessage: (msg) => set((state) => ({ tempMessages: [...state.tempMessages, msg] })),
  clearTempMessages: () => set({ tempMessages: [] }),
  initSocket: (userId) => {
    const socket = io(window.location.origin);
    
    socket.on('connect', async () => {
      console.log('Connected to server');
      const { cryptoService } = await import('./services/cryptoService');
      const publicKey = await cryptoService.getMyPublicKeyBase64();
      socket.emit('register', { userId, publicKey });
    });

    socket.on('receive_message', async (data: { senderId: string, text: string, type: Message['type'], fileUrl?: string, fileSize?: string, encryptedFileKey?: number[], iv?: number[] }) => {
      const state = useAppStore.getState();
      const { cryptoService } = await import('./services/cryptoService');
      
      let decryptedText = data.text;
      
      if (data.iv && data.text) {
        try {
          const remotePubKeyBase64 = await new Promise<string>((resolve) => {
            state.socket?.emit("get_public_key", { userId: data.senderId }, resolve);
          });
          if (remotePubKeyBase64) {
            const sharedSecret = await cryptoService.deriveSharedSecret(data.senderId, remotePubKeyBase64);
            const encryptedObj = JSON.parse(data.text);
            decryptedText = await cryptoService.decryptText(encryptedObj.iv, encryptedObj.ciphertext, sharedSecret);
          }
        } catch(e) {
          console.error("Decryption failed", e);
          decryptedText = "🔒 [Encrypted Message]";
        }
      }

      const newMessage: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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

      // Find chat or create one
      set((state) => {
        let updatedChats = [...state.chats];
        let chat = updatedChats.find(c => !c.isGroup && c.participants.some(p => p.id === data.senderId));
        
        if (chat) {
          updatedChats = updatedChats.map(c => c.id === chat!.id ? {
            ...c,
            messages: [...(c.messages || []), newMessage],
            lastMessage: newMessage,
            unreadCount: state.activeChatId === c.id ? c.unreadCount : (c.unreadCount || 0) + 1
          } : c);
        } else {
          const sender = state.users.find(u => u.id === data.senderId);
          if (sender) {
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

    set({ socket });
  },
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id, activeRecipientId: null, selectedMessageIds: [] }),
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
  friendRequests: [],
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
      const { db } = await import('./firebase');
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (err) {
      console.error("Error accepting request in db:", err);
    }
  },
  rejectFriendRequest: async (requestId) => {
    set((state) => ({
      friendRequests: state.friendRequests.filter(r => r.id !== requestId)
    }));
    
    try {
      const { db } = await import('./firebase');
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (err) {
      console.error("Error rejecting request in db:", err);
    }
  },
  sentFriendRequests: [],
  sendFriendRequest: async (userId) => {
    const state = useAppStore.getState();
    if (state.sentFriendRequests.includes(userId)) return;
    
    set({ sentFriendRequests: [...state.sentFriendRequests, userId] });
    
    if (state.user) {
      try {
        const { db } = await import('./firebase');
        const { addDoc, collection, serverTimestamp, query, where, getDocs } = await import('firebase/firestore');
        const requestsRef = collection(db, 'friendRequests');
        
        // Prevent dupes
        const q = query(requestsRef, where('fromUserId', '==', state.user.id), where('toUserId', '==', userId));
        const existing = await getDocs(q);
        if (existing.empty) {
          await addDoc(requestsRef, {
            fromUserId: state.user.id,
            toUserId: userId,
            createdAt: serverTimestamp(),
            status: 'pending'
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
        const { db } = await import('./firebase');
        const { deleteDoc, doc, collection, query, where, getDocs } = await import('firebase/firestore');
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
  groupJoinRequests: [],
  setGroupJoinRequests: (requests) => set({ groupJoinRequests: requests }),
  chats: [],
  setChats: (chats) => set({ chats }),
  typingUsers: {},
  setTypingUser: (userId, isTyping) => set(state => ({ typingUsers: { ...state.typingUsers, [userId]: isTyping } })),
  activeGroupCall: null,
  setActiveGroupCall: (call) => set({ activeGroupCall: call }),
  blockedUserIds: [],
  removedFriendIds: [],
  removeFriend: (userId) => {
    set((state) => ({
      removedFriendIds: [...state.removedFriendIds, userId],
      chats: state.chats.filter(c => {
        if (!c.isGroup && c.participants.some(p => p.id === userId)) {
          return false;
        }
        return true;
      })
    }));
  },
  restoreFriend: (userId) => {
    set((state) => ({
      removedFriendIds: state.removedFriendIds.filter(id => id !== userId)
    }));
  },
  blockUser: (userId) => {
    set((state) => ({
      blockedUserIds: [...state.blockedUserIds, userId],
      activeChatId: state.chats.find(c => !c.isGroup && c.participants.some(p => p.id === userId))?.id === state.activeChatId ? null : state.activeChatId,
      activeRecipientId: state.activeRecipientId === userId ? null : state.activeRecipientId,
      chats: state.chats.filter(c => {
        if (!c.isGroup && c.participants.some(p => p.id === userId)) {
          return false;
        }
        return true;
      })
    }));
  },
  unblockUser: (userId) => {
    set((state) => ({
      blockedUserIds: state.blockedUserIds.filter(id => id !== userId)
    }));
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
  users: [],
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
  addUser: (userData) => set((state) => ({
    users: [
      ...state.users,
      {
        ...userData,
        id: (userData as any).id || `u${Math.random().toString(36).substr(2, 9)}`,
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
  })),
  sendMessage: (chatId, recipientId, text, type = 'text', fileUrl, fileSize, e2eData?: { encryptedText: string, iv: number[], encryptedFileKey?: number[] }) => set((state) => {
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
      status: 'sent',
      isE2E: !!e2eData,
      iv: e2eData?.iv,
      encryptedFileKey: e2eData?.encryptedFileKey
    };

    // Simulate read receipt since we don't have full socket ack logic here
    setTimeout(() => {
      useAppStore.setState((s) => ({
        chats: s.chats.map(c => 
          (c.id === chatId || (recipientId && c.participants.some(p => p.id === recipientId)))
            ? { ...c, messages: c.messages.map(m => m.id === newMessage.id ? { ...m, status: 'read' as const } : m) }
            : c
        )
      }));
    }, 2000);

    // Emit via socket
    if (state.socket) {
      const targetId = recipientId || state.chats.find(c => c.id === chatId)?.participants.find(p => p.id !== state.user?.id)?.id;
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
      }
    }

    let updatedChats = [...state.chats];
    let targetChatId = chatId;

    if (!chatId && recipientId) {
      const existingChat = state.chats.find(c => !c.isGroup && c.participants.some(p => p.id === recipientId));
      if (existingChat) {
        targetChatId = existingChat.id;
      } else {
        const recipient = state.users.find(u => u.id === recipientId);
        if (recipient) {
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
          return { chats: updatedChats, activeChatId: newChat.id, activeRecipientId: null };
        }
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

    return { chats: updatedChats };
  }),
}));
