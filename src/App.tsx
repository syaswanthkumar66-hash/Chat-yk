import React, { useEffect, useState } from 'react';
import { useAppStore, useStore, shallowEqual, generateInitialsAvatar, getOrCreateDeviceId, safeLocalStorageSetItem } from './store';
import { Message, Notification as AppNotification } from './types';
import { Hub } from './components/Hub';
import { Onboarding } from './components/Onboarding';
import { SocialLayout } from './components/SocialLayout';
import { FileShareLayout } from './components/FileShareLayout';
import { JoinGroupView } from './components/JoinGroupView';
import { AdminPanel } from './components/AdminPanel';
import { GroupCall } from './components/GroupCall';
import { Icon, cn } from './components/UI';
import { NotificationPrompt } from './components/NotificationPrompt';
import { QuickProfileSwitcher } from './components/QuickProfileSwitcher';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocFromServer, collection, query, where, onSnapshot, runBypassSelfTests, setScopedUserInstance } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { sessionIntegrityService } from './services/sessionIntegrityService';
import { showLocalNotification, cleanupOtherServiceWorkers } from './services/notificationService';

async function testConnection() {
  try {
    await runBypassSelfTests();
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Custom hook to request and manage system notifications
function useNotifications(processedNotificationsRef: React.RefObject<Set<string>>) {
  const socket = useAppStore((state) => state.socket);
  const user = useAppStore((state) => state.user);
  const activeChatId = useAppStore((state) => state.activeChatId);
  const activeRecipientId = useAppStore((state) => state.activeRecipientId);
  const chats = useAppStore((state) => state.chats);
  const users = useAppStore((state) => state.users);
  const mode = useAppStore((state) => state.mode);
  const addInAppToast = useAppStore((state) => state.addInAppToast);

  // Synchronize active view and tab focus visibility state with the backend server
  useEffect(() => {
    if (!socket || !user) return;

    const emitActiveState = () => {
      const isVisible = typeof document !== 'undefined' ? (document.visibilityState === 'visible' && document.hasFocus()) : true;
      let activeViewId: string | null = null;
      
      if (activeChatId) {
        const chat = chats.find(c => c.id === activeChatId);
        if (chat) {
          if (chat.isGroup) {
            activeViewId = chat.id;
          } else {
            const otherParticipant = chat.participants.find(p => p.id !== user.id);
            if (otherParticipant) {
              activeViewId = otherParticipant.id;
            }
          }
        }
      } else if (activeRecipientId) {
        activeViewId = activeRecipientId;
      }

      socket.emit('update_active_view', {
        activeViewId,
        isVisible
      });
      console.log('Synchronized active view state with server:', { activeViewId, isVisible });
    };

    emitActiveState();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', emitActiveState);
      window.addEventListener('focus', emitActiveState);
      window.addEventListener('blur', emitActiveState);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', emitActiveState);
        window.removeEventListener('focus', emitActiveState);
        window.removeEventListener('blur', emitActiveState);
      }
    };
  }, [socket, user, activeChatId, activeRecipientId, chats]);

  // Permission is requested by <NotificationPrompt /> which shows a proper
  // contextual UI prompt. A silent requestPermission() call here would conflict
  // and cause browsers to suppress the NotificationPrompt dialog.

  // Listen to socket 'receive_message' to trigger local notifications & sounds reactively
  useEffect(() => {
    if (!socket || !user) return;

    const handleReceiveMessage = async (data: any) => {
      // 1. Guard: If sender is current user, don't notify
      if (data.senderId === user.id) return;

      const state = useAppStore.getState();

      // 2. Guard: If sender/user is blocked, don't notify
      if (state.blockedUserIds.includes(data.senderId)) return;

      // 3. Prevent duplicates if already processed via Firestore notifications
      const notifId = `notif-msg-${data.id || data.messageId}`;
      const groupNotifId = `notif-msg-${data.id || data.messageId}-${user.id}`;
      
      if (processedNotificationsRef.current.has(notifId) || processedNotificationsRef.current.has(groupNotifId)) {
        console.log(`Socket receive_message ${data.id || data.messageId} skipped (already processed by Firestore notifications)`);
        return;
      }
      
      // Add both to processed set to prevent Firestore onSnapshot from double triggering
      processedNotificationsRef.current.add(notifId);
      processedNotificationsRef.current.add(groupNotifId);

      // 4. Determine if the chat is active and focused
      const chatId = data.groupId || data.senderId;
      const isChatActive = state.activeChatId === chatId;
      const isSocialView = state.mode === 'social';
      const isFocused = typeof document !== 'undefined' ? document.hasFocus() : true;

      if (isSocialView && isChatActive && isFocused) {
        // Chat is open, active, and focused, so no need for alerts/sounds
        return;
      }

      // 5. Process/decrypt text if encrypted
      let displayBody = data.text;
      if (data.iv && data.text) {
        try {
          const { cryptoService } = await import('./services/cryptoService');
          const remotePubKeyBase64 = await new Promise<string>((resolve) => {
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
            const sharedSecret = await cryptoService.deriveSharedSecret(data.senderId, remotePubKeyBase64, user.id);
            const encryptedObj = JSON.parse(data.text);
            displayBody = await cryptoService.decryptText(encryptedObj.iv, encryptedObj.ciphertext, sharedSecret);
          }
        } catch (e) {
          console.warn("Decryption failed in notification handler:", e);
          displayBody = "🔒 [Encrypted Message]";
        }
      } else if (data.text && typeof data.text === 'string' && data.text.startsWith('{') && data.text.includes('"ciphertext"')) {
        displayBody = "🔒 [Encrypted Message]";
      }

      if (data.type && data.type !== 'text') {
        displayBody = `📎 Shared a ${data.type}`;
      }

      // If user settings suppress previews, hide it
      const currentUser = useAppStore.getState().user;
      const userSettings = currentUser?.notificationSettings;
      const previewEnabled = userSettings?.previewEnabled !== false;
      const bodyText = previewEnabled ? displayBody : "New message received";

      // Find sender name and avatar
      const senderUser = state.users.find(u => u.id === data.senderId);
      const senderName = data.senderName || senderUser?.displayName || senderUser?.username || "New Message";
      const senderAvatar = senderUser?.avatar || generateInitialsAvatar(data.senderId, senderName);

      // 6. Trigger sound if enabled
      if (userSettings?.soundEnabled !== false) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {
          console.warn('Notification audio failed:', e);
        }
      }

      // 7. Trigger vibration if enabled
      if (userSettings?.vibrateEnabled !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch (e) {
          console.warn('Notification vibration failed:', e);
        }
      }

      // 8. Trigger in-app toast
      addInAppToast({
        title: data.groupName || senderName,
        body: bodyText,
        avatar: senderAvatar,
        chatId: chatId
      });

      // 9. Trigger system OS notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        showLocalNotification(data.groupName || senderName, {
          body: bodyText,
          icon: senderAvatar,
          tag: chatId,
          renotify: true
        });
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    return () => {
      socket.off('receive_message', handleReceiveMessage);
    };
  }, [socket, user, addInAppToast, processedNotificationsRef]);

  // Listen to socket 'user_status' to trigger alerts when a friend comes online
  useEffect(() => {
    if (!socket || !user) return;

    const handleUserStatus = (data: { userId: string, isOnline: boolean }) => {
      if (data.userId === user.id) return;
      if (!data.isOnline) return;

      // Find the user in our list for notifications
      const targetUser = users.find(u => u.id === data.userId);
      if (!targetUser || !targetUser.isFriend) return;

      const friendName = targetUser.displayName || targetUser.username || 'Your friend';

      // Play system alert sound if enabled
      if (user.notificationSettings?.soundEnabled) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
          audio.volume = 0.4;
          audio.play().catch(() => {});
        } catch (e) {
          console.warn('Audio playback failed:', e);
        }
      }

      // Play device vibration if enabled (Additional Improvement B)
      if (user.notificationSettings?.vibrateEnabled !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100]);
        } catch (e) {
          console.warn('Vibration failed:', e);
        }
      }

      // Trigger standard web notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        showLocalNotification(`${friendName} is back online!`, {
          body: `${friendName} is now active on Chat.`,
          icon: targetUser.avatar || generateInitialsAvatar(data.userId, friendName),
          tag: `online-${data.userId}`,
          renotify: true
        });
      }
    };

    socket.on('user_status', handleUserStatus);
    return () => {
      socket.off('user_status', handleUserStatus);
    };
  }, [socket, user, users]);
}

interface InAppToastItemProps {
  toast: {
    id: string;
    title: string;
    body: string;
    avatar: string;
    chatId: string;
  };
  removeInAppToast: (id: string) => void;
  setMode: (mode: any) => void;
  setActiveChatId: (id: string | null) => void;
  setActiveRecipientId: (id: string | null) => void;
}

function InAppToastItem({
  toast,
  removeInAppToast,
  setMode,
  setActiveChatId,
  setActiveRecipientId
}: InAppToastItemProps) {
  useEffect(() => {
    // Runs exactly once on mount — single clean timer
    const timer = setTimeout(() => removeInAppToast(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, removeInAppToast]);

  return (
    <div
      className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-primary/10 flex gap-3 pointer-events-auto cursor-pointer hover:bg-slate-50 transition-all active:scale-98"
      onClick={() => {
        removeInAppToast(toast.id);
        setMode('social');
        setActiveChatId(toast.chatId);
        setActiveRecipientId(null);
      }}
    >
      <div className="size-11 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0">
        <img src={toast.avatar} alt={toast.title} className="size-full object-cover" referrerPolicy="no-referrer" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-slate-800 text-xs uppercase tracking-tight truncate">{toast.title}</h4>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeInAppToast(toast.id);
            }}
            className="size-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <Icon name="close" className="text-xs" />
          </button>
        </div>
        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{toast.body}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const processedNotificationsRef = React.useRef<Set<string>>(new Set());
  const pendingSyncRef = React.useRef<{ uid: string; data: any } | null>(null);

  // Fallback safety timeout to prevent getting stuck in splash loading screen under any circumstances
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAuthLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const { 
    mode, 
    isLoggedIn, 
    joinGroupId, 
    setJoinGroupId, 
    setMode, 
    login, 
    logout, 
    broadcasts, 
    systemSettings, 
    user,
    inAppToasts,
    removeInAppToast,
    setActiveChatId,
    setActiveRecipientId,
    activeChatId,
    activeRecipientId,
    authMethod,
    autoSyncEnabled,
    chats,
    blockedUserIds,
    removedFriendIds
  } = useStore(s => ({
    mode: s.mode,
    isLoggedIn: s.isLoggedIn,
    joinGroupId: s.joinGroupId,
    setJoinGroupId: s.setJoinGroupId,
    setMode: s.setMode,
    login: s.login,
    logout: s.logout,
    broadcasts: s.broadcasts,
    systemSettings: s.systemSettings,
    user: s.user,
    inAppToasts: s.inAppToasts,
    removeInAppToast: s.removeInAppToast,
    setActiveChatId: s.setActiveChatId,
    setActiveRecipientId: s.setActiveRecipientId,
    activeChatId: s.activeChatId,
    activeRecipientId: s.activeRecipientId,
    authMethod: s.authMethod,
    autoSyncEnabled: s.autoSyncEnabled,
    chats: s.chats,
    blockedUserIds: s.blockedUserIds,
    removedFriendIds: s.removedFriendIds
  }), shallowEqual);

  // Activate the real-time notification integration hook
  useNotifications(processedNotificationsRef);

  // Listen for Service Worker postMessage notifications and handle deep-linking/navigation
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const handleServiceWorkerMessage = (event: MessageEvent) => {
        if (!event.data) return;
        
        if (event.data.type === 'NOTIFICATION_CLICK') {
          console.log('[ServiceWorker Message] NOTIFICATION_CLICK received:', event.data);
          const { url, data } = event.data;
          
          // Decode URL or data parameters to navigate correctly
          const chatId = data?.chatId || (typeof url === 'string' && url.includes('chatId=') ? url.split('chatId=')[1]?.split('&')[0] : null);
          
          if (chatId) {
            setActiveChatId(chatId);
            setMode('social');
          } else if (url && url !== '/') {
            if (url.includes('fileshare') || url.includes('file')) {
              setMode('fileshare');
            } else if (url.includes('social')) {
              setMode('social');
            } else if (url.includes('admin')) {
              setMode('admin');
            } else if (url.includes('hub')) {
              setMode('hub');
            }
          }
        } else if (event.data.type === 'PUSH_SUBSCRIPTION_CHANGE') {
          console.log('[ServiceWorker Message] PUSH_SUBSCRIPTION_CHANGE received. Re-registering push subscription...');
          if (user?.id) {
            import('./services/notificationService').then(({ registerPushNotifications }) => {
              registerPushNotifications(user.id, true).catch(console.error);
            });
          }
        }
      };

      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, [user?.id, setActiveChatId, setMode]);

  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [testCallInfo, setTestCallInfo] = useState<{ id: string, type: 'voice' | 'video' } | null>(null);
  const [hideTestCallPrompt, setHideTestCallPrompt] = useState(false);
  const cloudSyncStatus = useAppStore((state) => state.cloudSyncStatus);
  const onlineDevices = useAppStore((state) => state.onlineDevices);
  const isWssConnected = useAppStore((state) => state.isWssConnected);
  const backendSyncStatus = useAppStore((state) => state.backendSyncStatus);
  const backendSyncProgress = useAppStore((state) => state.backendSyncProgress);

  useEffect(() => {
    // Run startup session integrity and cryptographic verification
    sessionIntegrityService.verifyAndCleanupSession().catch(console.error);

    // Clean up conflicting Service Workers (like precache-sw.js from old cache) on startup
    cleanupOtherServiceWorkers().catch(console.error);

    // If a user is already cached and logged in from a previous session, restore their scoped Firebase/Firestore instance
    if (isLoggedIn && user?.id) {
      setScopedUserInstance(user.id);
    }
  }, []);

  // Initialize socket globally to support multi-device real-time sync across all routes and views on load
  useEffect(() => {
    if (isLoggedIn && user?.id) {
      console.log("[Global Socket] Initializing socket on startup for logged-in user:", user.id);
      useAppStore.getState().initSocket(user.id);

      // Also sync any cached push messages on login/startup
      import('./store').then(({ syncPushedMessagesFromCache }) => {
        syncPushedMessagesFromCache().catch(console.error);
      });
    }
  }, [isLoggedIn, user?.id]);

  // Automatically sync and reconnect on tab refocus or visibility change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRefocusSync = () => {
      const state = useAppStore.getState();
      if (state.isLoggedIn && state.user?.id) {
        console.log('[Auto-Sync] Tab focused or became visible. Triggering catch-up sync...');
        
        // 1. Re-connect or wake up socket if needed
        if (state.socket && !state.socket.connected) {
          state.addConnectionLog('Auto-Sync: Tab focused. Re-connecting socket...');
          state.socket.connect();
        } else {
          // If already connected, run catch-up sync manually
          state.performCatchUpSync().catch(console.error);
        }
      }
    };

    window.addEventListener('focus', handleRefocusSync);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefocusSync();
        import('./store').then(({ syncPushedMessagesFromCache }) => {
          syncPushedMessagesFromCache().catch(console.error);
        });
      } else if (document.visibilityState === 'hidden') {
        import('./store').then(({ flushCloudAutoSync }) => {
          flushCloudAutoSync().catch(console.error);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleBeforeUnload = () => {
      import('./store').then(({ useAppStore }) => {
        const socket = useAppStore.getState().socket;
        if (socket && socket.connected) {
          socket.emit('explicit_disconnect');
          socket.disconnect();
        }
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handlePageHide = () => {
      if (user?.id) {
        import('./store').then(({ useAppStore }) => {
          if (useAppStore.getState().authMethod !== 'local') {
            import('./firebase').then(({ db, doc, setDoc }) => {
              setDoc(doc(db, 'users', user.id), { isOnline: false, lastSeen: new Date().toISOString() }, { merge: true }).catch(console.error);
            });
          }
        });
      }
      import('./store').then(({ flushCloudAutoSync }) => {
        flushCloudAutoSync().catch(console.error);
      });
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('focus', handleRefocusSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isLoggedIn, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleOnline = async () => {
      setIsOffline(false);
      console.log("Device is online. Triggering pending Firestore user sync...");
      let pending = pendingSyncRef.current;
      const currentUid = auth.currentUser?.uid;
      if (!pending && currentUid) {
        const stored = localStorage.getItem(`pending_profile_sync_${currentUid}`);
        if (stored) {
          try {
            pending = JSON.parse(stored);
          } catch (e) {
            console.error("Error parsing stored sync:", e);
          }
        }
      }
      
      if (pending && currentUid && currentUid === pending.uid) {
        try {
          await setDoc(doc(db, 'users', pending.uid), pending.data);
          console.log("Retry Sync: Profile successfully synchronized to Firestore on online transition.");
          pendingSyncRef.current = null;
          localStorage.removeItem(`pending_profile_sync_${currentUid}`);
        } catch (setDocErr) {
          console.warn("Retry Sync: Firestore setDoc failed on online transition, will retry next time:", setDocErr);
        }
      }
    };
    
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Synchronize current page/mode and active chat/recipient state to Firestore
  useEffect(() => {
    if (!user || authMethod === 'local') return;

    // Store in localStorage for offline / quick recovery
    safeLocalStorageSetItem(`proto_current_mode_${user.id}`, mode);
    safeLocalStorageSetItem(`proto_active_chat_${user.id}`, activeChatId || '');
    safeLocalStorageSetItem(`proto_active_recipient_${user.id}`, activeRecipientId || '');

    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'users', user.id);
        updateDoc(docRef, {
          currentMode: mode,
          activeChatId: activeChatId,
          activeRecipientId: activeRecipientId
        }).catch((err) => {
          console.warn("Could not sync active page/mode state to Firestore:", err);
        });
      } catch (err) {
        console.error("Firestore update in page sync effect failed:", err);
      }
    }
  }, [user, mode, activeChatId, activeRecipientId, authMethod]);

  // Handle Firebase auth state changes cleanly
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const currentStoreState = useAppStore.getState();
        const cachedUserObj = currentStoreState.user;
        const wasLoggedIn = currentStoreState.isLoggedIn;

        // Optimistically keep logged in if we have matching cache to prevent splash flash or kicking back to onboarding
        if (wasLoggedIn && cachedUserObj && cachedUserObj.id === firebaseUser.uid) {
          setIsAuthLoading(false);
        }

        try {
          let userDoc = null;
          let getDocError = null;
          
          try {
            userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          } catch (e) {
            getDocError = e;
            console.warn("Firestore getDoc failed (possibly due to permission-denied or offline):", e);
          }

          if (userDoc && userDoc.exists()) {
            const userData = userDoc.data();
            login({
              id: firebaseUser.uid,
              email: userData.email || firebaseUser.email || undefined,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: userData.isAdmin,
              joinDate: userData.joinDate,
              profileVisibility: userData.profileVisibility,
              notificationSettings: userData.notificationSettings
            });

            // Restore saved page/mode from Firestore or localStorage fallback!
            if (userData.currentMode) {
              useAppStore.setState({
                mode: userData.currentMode,
                activeChatId: userData.activeChatId || null,
                activeRecipientId: userData.activeRecipientId || null
              });
            } else {
              const savedMode = localStorage.getItem(`proto_current_mode_${firebaseUser.uid}`);
              if (savedMode) {
                const savedChat = localStorage.getItem(`proto_active_chat_${firebaseUser.uid}`);
                const savedRecipient = localStorage.getItem(`proto_active_recipient_${firebaseUser.uid}`);
                useAppStore.setState({
                  mode: savedMode as any,
                  activeChatId: savedChat || null,
                  activeRecipientId: savedRecipient || null
                });
              }
            }

            // If notification permission is already granted, silently register/sync push subscriptions in the background
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                import('./services/notificationService').then(({ registerPushNotifications }) => {
                  registerPushNotifications(firebaseUser.uid);
                }).catch(console.error);
              }
            }
          } else {
            // Document does not exist in Firestore, or getDoc failed.
            // Determine the best profile data to use (cached or default)
            const resolvedProfile = (cachedUserObj && cachedUserObj.id === firebaseUser.uid) ? cachedUserObj : {
              id: firebaseUser.uid,
              email: firebaseUser.email || undefined,
              username: firebaseUser.email?.split('@')[0] || 'user_' + firebaseUser.uid.substring(0, 5),
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'New User',
              avatar: firebaseUser.photoURL || '',
              description: 'Protocol user profile',
              isAdmin: false,
              joinDate: new Date().toISOString()
            };

            console.log("Creating or restoring user profile local session...");
            login(resolvedProfile);

            // Restore saved page/mode local fallback for new sessions!
            const savedMode = localStorage.getItem(`proto_current_mode_${firebaseUser.uid}`);
            if (savedMode) {
              const savedChat = localStorage.getItem(`proto_active_chat_${firebaseUser.uid}`);
              const savedRecipient = localStorage.getItem(`proto_active_recipient_${firebaseUser.uid}`);
              useAppStore.setState({
                mode: savedMode as any,
                activeChatId: savedChat || null,
                activeRecipientId: savedRecipient || null
              });
            }

            // Explicit check for Firestore availability before initiating 'setDoc' user creation.
            const isFirestoreAvailable = navigator.onLine && !getDocError;

            const userDataToRestore = {
              id: resolvedProfile.id,
              email: firebaseUser.email || 'developer@protocol.net',
              username: resolvedProfile.username,
              displayName: resolvedProfile.displayName,
              avatar: resolvedProfile.avatar || '',
              description: resolvedProfile.description || '',
              isAdmin: resolvedProfile.isAdmin || false,
              joinDate: resolvedProfile.joinDate || new Date().toISOString()
            };

            if (isFirestoreAvailable) {
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), userDataToRestore);
                console.log("Profile successfully synchronized to Firestore.");
              } catch (setDocErr) {
                console.warn("Firestore setDoc failed during initial registration, queuing for offline retry:", setDocErr);
                pendingSyncRef.current = { uid: firebaseUser.uid, data: userDataToRestore };
                safeLocalStorageSetItem(`pending_profile_sync_${firebaseUser.uid}`, JSON.stringify({ uid: firebaseUser.uid, data: userDataToRestore }));
              }
            } else {
              console.log("Firestore currently unreachable. Keeping local session and queuing profile for offline retry.");
              pendingSyncRef.current = { uid: firebaseUser.uid, data: userDataToRestore };
              safeLocalStorageSetItem(`pending_profile_sync_${firebaseUser.uid}`, JSON.stringify({ uid: firebaseUser.uid, data: userDataToRestore }));
            }
          }
        } catch (err) {
          console.error("General error during user auth state handling:", err);
          // General fallback: if we have a cached user, let them continue using the app
          if (cachedUserObj && cachedUserObj.id === firebaseUser.uid) {
            console.log("Continuing with cached user session to maintain offline/local storage compatibility.");
            useAppStore.setState({ isLoggedIn: true });
          } else {
            useAppStore.setState({ isLoggedIn: false, user: null });
          }
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        const currentStoreState = useAppStore.getState();
        if (currentStoreState.authMethod !== 'local') {
          logout();
        }
        setIsAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [login, logout]);

  // Automatically register and keep the user's web push notification subscription up to date in the backend
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return;
    
    // If notification permission is already granted, silently register/sync push subscriptions in the background
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        console.log(`[Auto-Register Push] Notification permission is granted. Registering/syncing subscription in backend for user: ${user.id}...`);
        import('./services/notificationService').then(({ registerPushNotifications }) => {
          registerPushNotifications(user.id).then((result) => {
            if (result.success) {
              console.log("[Auto-Register Push] Successfully synchronized web push subscription with backend.");
            } else {
              console.warn("[Auto-Register Push] Auto-registration synchronization warning:", result.error);
            }
          }).catch(err => {
            console.error("[Auto-Register Push] Error registering push notifications:", err);
          });
        }).catch(err => {
          console.error("[Auto-Register Push] Failed to load notificationService:", err);
        });
      }
    }
  }, [isLoggedIn, user?.id]);

  // Trigger initial catch-up sync on login
  useEffect(() => {
    if (isLoggedIn && user?.id) {
      console.log('[Initial-Sync] App loaded & user logged in. Triggering initial catch-up sync...');
      useAppStore.getState().performCatchUpSync().catch(console.error);
    }
  }, [isLoggedIn, user?.id]);

  // Handle Firestore syncing for both Google and Local logins Reactively
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return;

    const syncStartTime = Date.now();

    // Skip Firestore sync for local/developer mode to prevent unauthenticated/Permission Denied crashes
    const authMethod = useAppStore.getState().authMethod;
    if (authMethod === 'local') return;

    // Skip Firestore sync if the active profile does not match the authenticated Firebase Auth user
    // to prevent permission-denied crashes while allowing seamless profile switching in offline mode.
    if (auth.currentUser?.uid !== user.id) {
      console.warn(`[FirestoreSync] Skipping live Firestore sync because active profile (${user.id}) does not match authenticated Firebase user (${auth.currentUser?.uid || 'none'}). Operating in secure partitioned offline mode.`);
      return;
    }

    let unsubscribeReceived = () => {};
    let unsubscribeSent = () => {};
    let unsubscribeNotifications = () => {};
    let unsubscribeCloudSync = () => {};

    const syncCloudData = async () => {
      try {
        const syncDocRef = doc(db, 'cloud_syncs', user.id);
        unsubscribeCloudSync = onSnapshot(syncDocRef, (snapshot) => {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          if (!data || !data.lastUpdated) return;

          // Prevent loop if the update was generated by this client
          const lastUploaded = (window as any).__lastUploadedSyncTime;
          if (lastUploaded && lastUploaded === data.lastUpdated) {
            console.log("[Auto-Sync] Received cloud update matching our own upload. Skipping.");
            return;
          }

          console.log("[Auto-Sync] Received remote database update from Firestore. Merging...");
          import('./store').then(({ mergeCloudSyncPayload }) => {
            mergeCloudSyncPayload(data, user.id);
            (window as any).__lastUploadedSyncTime = data.lastUpdated;
          });
        }, (err) => {
          console.warn("[Auto-Sync] Subscription notice (cloud sync document might not exist yet):", err);
        });
      } catch (err) {
        console.error("Error setting up Cloud Sync subscription:", err);
      }
    };

    const syncFirestoreData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Sync blocked and removed friends lists from Firestore
          const blocked = userData.blockedUserIds || [];
          const removed = userData.removedFriendIds || [];
          useAppStore.setState({ blockedUserIds: blocked, removedFriendIds: removed });
          if (typeof window !== 'undefined') {
            safeLocalStorageSetItem('proto_blockedUserIds', JSON.stringify(blocked));
            safeLocalStorageSetItem('proto_removedFriendIds', JSON.stringify(removed));
          }
        }

        // Refresh friends presence and profiles
        const currentUsers = useAppStore.getState().users;
        const friendIds = currentUsers.filter(u => u.isFriend).map(u => u.id);
        if (friendIds.length > 0) {
          await Promise.all(friendIds.map(async (fId) => {
            try {
              const fDoc = await getDoc(doc(db, 'users', fId));
              if (fDoc.exists()) {
                const fData = fDoc.data();
                useAppStore.setState(state => ({
                  users: state.users.map(u => u.id === fId ? {
                    ...u,
                    isOnline: fData.isOnline || false,
                    lastSeen: fData.lastSeen || u.lastSeen,
                    displayName: fData.displayName || u.displayName,
                    avatar: fData.avatar || u.avatar,
                    description: fData.description || u.description
                  } : u)
                }));
              }
            } catch (e) {
              console.warn(`Failed to refresh friend data for ${fId}`, e);
            }
          }));
        }

        const requestsRef = collection(db, 'friendRequests');
        const qReceived = query(requestsRef, where('toUserId', '==', user.id));
        unsubscribeReceived = onSnapshot(qReceived, async (snapshot) => {
          const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          const fullRequests: any[] = [];
          
          await Promise.all(requests.map(async (r) => {
            try {
              let senderDoc = await getDoc(doc(db, 'users', r.fromUserId));
              if (senderDoc.exists()) {
                const senderData = senderDoc.data();
                if (r.status === 'accepted') {
                   useAppStore.getState().addUser({
                      id: r.fromUserId,
                      username: senderData.username || r.fromUserId,
                      displayName: senderData.displayName || senderData.username || 'Unknown',
                      avatar: senderData.avatar || generateInitialsAvatar(r.fromUserId, senderData.displayName || senderData.username || 'Unknown'),
                      description: senderData.description || '',
                      isOnline: senderData.isOnline || false,
                      lastSeen: senderData.lastSeen || null,
                      isFriend: true,
                      profileVisibility: 'everyone',
                      hasPrivateProfile: false,
                      isAdmin: senderData.isAdmin || false,
                      joinDate: senderData.joinDate || new Date().toISOString()
                   } as any);
                   useAppStore.getState().restoreFriend(r.fromUserId);
                } else {
                  fullRequests.push({
                    id: r.id,
                    userId: r.fromUserId,
                    name: senderData.displayName || senderData.username || 'Unknown',
                    avatar: senderData.avatar || generateInitialsAvatar(r.fromUserId, senderData.displayName || senderData.username || 'Unknown'),
                    timestamp: r.createdAt 
                      ? (typeof r.createdAt.toMillis === 'function' 
                          ? new Date(r.createdAt.toMillis()).toISOString() 
                          : new Date(r.createdAt).toISOString())
                      : new Date().toISOString()
                  });
                }
              }
            } catch (e) {
              console.error("Error fetching sender for request:", e);
            }
          }));
          
          useAppStore.getState().setFriendRequests(fullRequests);
        }, (err) => {
          console.error("Error in friendRequests onSnapshot:", err);
          try {
            handleFirestoreError(err, OperationType.LIST, 'friendRequests');
          } catch (e) {
            console.error("Gracefully caught friendRequests snapshot error to prevent app crash:", e);
          }
        });

        const qSent = query(requestsRef, where('fromUserId', '==', user.id));
        unsubscribeSent = onSnapshot(qSent, async (snapshot) => {
           const sentIds: string[] = [];
           
           await Promise.all(snapshot.docs.map(async (rDoc) => {
             const data = rDoc.data() as any;
             if (data.status === 'accepted') {
               try {
                 let recipientDoc = await getDoc(doc(db, 'users', data.toUserId));
                 if (recipientDoc.exists()) {
                   const recipientData = recipientDoc.data();
                   useAppStore.getState().addUser({
                      id: data.toUserId,
                      username: recipientData.username || data.toUserId,
                      displayName: recipientData.displayName || recipientData.username || 'Unknown',
                      avatar: recipientData.avatar || generateInitialsAvatar(data.toUserId, recipientData.displayName || recipientData.username || 'Unknown'),
                      description: recipientData.description || '',
                      isOnline: recipientData.isOnline || false,
                      lastSeen: recipientData.lastSeen || null,
                      isFriend: true,
                      profileVisibility: 'everyone',
                      hasPrivateProfile: false,
                      isAdmin: recipientData.isAdmin || false,
                      joinDate: recipientData.joinDate || new Date().toISOString()
                   } as any);
                   useAppStore.getState().restoreFriend(data.toUserId);
                 }
               } catch (e) {
                 console.error("Error fetching accepted friend:", e);
               }
             } else {
               sentIds.push(data.toUserId);
             }
           }));
           
           useAppStore.setState({ sentFriendRequests: sentIds });
        }, (err) => {
           console.error("Error in sent friendRequests onSnapshot:", err);
           handleFirestoreError(err, OperationType.LIST, 'friendRequests');
        });

      } catch (err) {
        console.error("Error syncing Firestore user and friend data:", err);
      }
    };

    const notificationsRef = collection(db, 'notifications');
    const qNotifications = query(notificationsRef, where('recipientId', '==', user.id));
    let isInitial = true;
    unsubscribeNotifications = onSnapshot(qNotifications, async (snapshot) => {
      const notificationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AppNotification);
      notificationsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      useAppStore.setState({ notifications: notificationsList });

      const newlyCreated = notificationsList.filter(n => n.status === 'created');
      if (newlyCreated.length > 0) {
        const currentStore = useAppStore.getState();
        
        for (const notif of newlyCreated) {
          // 1. Prevent duplicate processing in the same session
          if (processedNotificationsRef.current.has(notif.id)) {
            continue;
          }
          processedNotificationsRef.current.add(notif.id);

          if (currentStore.blockedUserIds.includes(notif.senderId || '')) {
            try {
              await updateDoc(doc(db, 'notifications', notif.id), { status: 'read', readAt: new Date().toISOString() });
            } catch (e) {
              console.error("Failed to mark blocked notification as read:", e);
            }
            continue;
          }

          const isChatActive = currentStore.activeChatId === notif.chatId;
          const isSocialView = currentStore.mode === 'social';
          
          if (isSocialView && isChatActive && document.hasFocus()) {
            try {
              await updateDoc(doc(db, 'notifications', notif.id), { status: 'read', readAt: new Date().toISOString() });
            } catch (e) {
              console.error("Failed to mark active chat notification as read:", e);
            }
            continue;
          }

          try {
            await updateDoc(doc(db, 'notifications', notif.id), { status: 'delivered', deliveredAt: new Date().toISOString() });
          } catch (e) {
            console.error("Failed to update notification delivery status:", e);
          }

          // If this is the initial snapshot, do not show popups, toast, or play sound for existing notifications
          if (isInitial) {
            console.log(`Processing initial notification ${notif.id} silently on startup.`);
            continue;
          }

          // 2. Prevent UI & audio flood of historical/past notifications on subsequent loads
          const notifTime = new Date(notif.createdAt).getTime();
          if (isNaN(notifTime) || notifTime < Date.now() - 15000) {
            console.log(`Processing historical notification ${notif.id} silently.`);
            continue;
          }

          const currentUser = useAppStore.getState().user;
          const userSettings = currentUser?.notificationSettings;
          const pushEnabled = userSettings?.pushEnabled !== false;
          if (!pushEnabled) continue;

          if (userSettings?.soundEnabled !== false) {
            try {
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch (e) {
              console.warn('Notification audio failed:', e);
            }
          }

          if (userSettings?.vibrateEnabled !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([200, 100, 200]);
            } catch (e) {
              console.warn('Notification vibration failed:', e);
            }
          }

          const bodyText = userSettings?.previewEnabled !== false ? notif.body : "New Notification received";

          currentStore.addInAppToast({
            title: notif.title,
            body: bodyText,
            avatar: notif.senderAvatar || generateInitialsAvatar(notif.senderId || 'sys', notif.title || 'Notification'),
            chatId: notif.chatId || ''
          });

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            showLocalNotification(notif.title, {
              body: bodyText,
              icon: notif.senderAvatar || '/pwa-192x192.png',
              tag: notif.chatId || notif.id,
              renotify: true
            });
          }
        }
      }
      isInitial = false;
    }, (err) => {
      console.error("Error in notifications onSnapshot:", err);
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    });

    syncFirestoreData();
    syncCloudData();

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
      unsubscribeNotifications();
      unsubscribeCloudSync();
    };
  }, [isLoggedIn, user?.id, auth.currentUser?.uid]);

  // Trigger Auto-Sync to Cloud when local database changes
  useEffect(() => {
    if (!isLoggedIn || !user?.id || !autoSyncEnabled) return;
    
    const authMethod = useAppStore.getState().authMethod;
    if (authMethod === 'local') return;

    if (auth.currentUser?.uid !== user.id) return;

    import('./store').then(({ triggerCloudAutoSync }) => {
      triggerCloudAutoSync(user.id);
    });
  }, [chats, blockedUserIds, removedFriendIds, isLoggedIn, user?.id, autoSyncEnabled]);

  // Periodically check and report fingerprint for backend-verified sync checking
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return;
    const store = useAppStore.getState();
    if (!store.socket || !store.isWssConnected) return;

    // Report fingerprint immediately on load/reconnect
    store.reportFingerprint();

    // Set up periodic sync checks every 15 seconds if other devices are online
    const interval = setInterval(() => {
      const activeState = useAppStore.getState();
      if (activeState.onlineDevices.length > 1 && activeState.socket && activeState.isWssConnected) {
        console.log("[Sync-Check] Periodic sync check triggered (multiple devices online)");
        activeState.reportFingerprint();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [isLoggedIn, user?.id, onlineDevices.length, isWssConnected]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Handle logout via URL
    if (urlParams.get('logout') === 'true' || urlParams.get('end') === 'true') {
      logout();
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      return;
    }

    // Handle admin login via URL
    if (urlParams.get('login') === 'admin' || urlParams.get('admin') === 'true') {
      login(); // Default login is admin
      setMode('admin');
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      return;
    }

    const joinId = urlParams.get('join');
    if (joinId) {
      setJoinGroupId(joinId);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    const joinCallId = urlParams.get('join_call');
    const joinCallType = urlParams.get('type') as 'voice' | 'video' || 'video';
    if (joinCallId) {
      setTestCallInfo({ id: joinCallId, type: joinCallType });
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Auth Loading Splash Screen
  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FFF1E7] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="size-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-2xl shadow-primary/30 rotate-3 animate-pulse mx-auto">
            <Icon name="share" className="text-3xl" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Connecting Protocol</h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">Initializing Secure Digital Ecosystem...</p>
          </div>
          <div className="pt-6 border-t border-slate-200 max-w-[180px] mx-auto">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">Protocol v2.5 • Loading</p>
          </div>
        </div>
      </div>
    );
  }

  // Maintenance Mode Screen
  if (systemSettings.maintenanceMode && mode !== 'admin') {
    return (
      <div className="min-h-[100dvh] bg-[#FFF1E7] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="size-20 rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto animate-pulse">
            <Icon name="engineering" className="text-4xl" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">System Offline</h1>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              We're currently performing scheduled maintenance to improve the Connect Protocol. We'll be back online shortly.
            </p>
          </div>
          <div className="pt-6 border-t border-slate-200 max-w-[180px] mx-auto">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">Protocol v2.5 • Maintenance Mode</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-light overflow-hidden relative">
      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white px-6 py-2.5 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest relative z-[250] shadow-md"
          >
            <Icon name="cloud_off" className="text-sm animate-pulse" />
            <span>Working Offline • Changes will sync automatically upon reconnection</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backend-Verified Sync Status Popup */}
      <AnimatePresence>
        {backendSyncStatus !== 'idle' && !isOffline && onlineDevices.length > 1 && (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            className="fixed bottom-24 left-6 md:bottom-10 md:left-10 z-[300]"
          >
            <div className="bg-slate-950/95 backdrop-blur-md text-white px-5 py-4 rounded-3xl flex flex-col gap-3 shadow-2xl border border-white/10 min-w-[280px] max-w-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {backendSyncStatus === 'syncing' && (
                    <div className="size-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <Icon name="sync" className="text-base animate-spin" />
                    </div>
                  )}
                  {backendSyncStatus === 'mismatch' && (
                    <div className="size-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                      <Icon name="sync_problem" className="text-base animate-pulse" />
                    </div>
                  )}
                  {backendSyncStatus === 'done' && (
                    <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 animate-bounce">
                      <Icon name="cloud_done" className="text-base" />
                    </div>
                  )}
                  {backendSyncStatus === 'error' && (
                    <div className="size-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400">
                      <Icon name="error_outline" className="text-base" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                      {backendSyncStatus === 'syncing' && "Synchronizing"}
                      {backendSyncStatus === 'mismatch' && "Mismatch Detected"}
                      {backendSyncStatus === 'done' && "Sync Complete"}
                      {backendSyncStatus === 'error' && "Sync Failed"}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {backendSyncStatus === 'syncing' && "Merging device content..."}
                      {backendSyncStatus === 'mismatch' && "Auto-resolving..."}
                      {backendSyncStatus === 'done' && "All devices are up-to-date"}
                      {backendSyncStatus === 'error' && "Please try again"}
                    </span>
                  </div>
                </div>

                {backendSyncStatus === 'syncing' && (
                  <button
                    onClick={() => useAppStore.setState({ backendSyncStatus: 'idle', backendSyncProgress: 0 })}
                    className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                )}
                {backendSyncStatus === 'error' && (
                  <button
                    onClick={() => useAppStore.getState().resolveSyncMismatch()}
                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors uppercase tracking-wider"
                  >
                    Retry
                  </button>
                )}
              </div>

              {backendSyncStatus === 'syncing' && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[9px] font-black tracking-widest text-slate-500 uppercase">
                    <span>Progress</span>
                    <span className="text-indigo-400 font-mono font-bold">{backendSyncProgress}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${backendSyncProgress}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Broadcast Banner */}
      <AnimatePresence>
        {broadcasts.length > 0 && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className={cn(
              "fixed top-0 left-0 right-0 z-[300] px-6 py-3 flex items-center justify-between gap-4 shadow-2xl",
              broadcasts[0].type === 'info' ? "bg-blue-600 text-white" :
              broadcasts[0].type === 'warning' ? "bg-amber-500 text-white" :
              "bg-red-600 text-white"
            )}
          >
            <div className="flex items-center gap-3">
              <Icon name={broadcasts[0].type === 'info' ? 'campaign' : broadcasts[0].type === 'warning' ? 'warning' : 'error'} className="text-xl" />
              <p className="text-xs font-black uppercase tracking-widest leading-tight">
                <span className="opacity-60 mr-2">BROADCAST:</span>
                {broadcasts[0].message}
              </p>
            </div>
            <button 
              onClick={() => useAppStore.setState({ broadcasts: broadcasts.slice(1) })}
              className="size-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-full xl:max-w-[1600px] 2xl:max-w-[2100px] 3xl:max-w-[2560px] mx-auto flex-1 flex flex-col bg-white shadow-2xl relative overflow-hidden transition-all duration-300">
        <AnimatePresence mode="wait">
        {joinGroupId && (
          <motion.div key="join" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <JoinGroupView />
          </motion.div>
        )}
        
        {mode === 'hub' && !joinGroupId && (
          <motion.div key="hub" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Hub />
          </motion.div>
        )}
        
        {mode === 'social' && !isLoggedIn && !joinGroupId && (
          <motion.div key="onboarding" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Onboarding />
          </motion.div>
        )}

        {mode === 'social' && isLoggedIn && !joinGroupId && (
          <motion.div key="social" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SocialLayout />
          </motion.div>
        )}

        {mode === 'fileshare' && !joinGroupId && (
          <motion.div key="fileshare" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FileShareLayout />
          </motion.div>
        )}

        {mode === 'admin' && !joinGroupId && (
          <motion.div key="admin" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AdminPanel onClose={() => setMode('hub')} />
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {testCallInfo && isLoggedIn && (
        <div className="fixed inset-0 z-[500] bg-slate-950 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h2 className="text-white font-black uppercase text-lg">Test Call: {testCallInfo.id}</h2>
              <p className="text-white/50 text-xs font-bold uppercase">Diagnostic Mode ({testCallInfo.type})</p>
            </div>
            <button 
              onClick={() => setTestCallInfo(null)}
              className="size-10 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-xl flex items-center justify-center transition-colors"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="flex-1 relative">
            <GroupCall 
              roomId={testCallInfo.id}
              type={testCallInfo.type}
              onClose={() => setTestCallInfo(null)}
              inline={true}
            />
          </div>
        </div>
      )}
      
      {testCallInfo && !isLoggedIn && !hideTestCallPrompt && (
        <div className="fixed inset-0 z-[500] bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 rounded-[2rem] p-8 border border-white/10 shadow-2xl space-y-6">
            <div className="size-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
              <Icon name="account_circle" className="text-3xl" />
            </div>
            <div>
              <h2 className="text-white font-black uppercase text-2xl tracking-tighter">Identity Required</h2>
              <p className="text-slate-400 text-xs font-bold uppercase mt-2">Please create a profile first to join the test call.</p>
            </div>
            <div className="pt-4 flex flex-col gap-3">
              <button onClick={() => { setMode('social'); setHideTestCallPrompt(true); }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl">Create Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating In-App Notifications Container */}
      <div className="fixed top-4 right-4 z-[400] max-w-sm w-full pointer-events-none flex flex-col gap-3">
        <AnimatePresence>
          {inAppToasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              className="pointer-events-auto"
            >
              <InAppToastItem
                toast={toast}
                removeInAppToast={removeInAppToast}
                setMode={setMode}
                setActiveChatId={setActiveChatId}
                setActiveRecipientId={setActiveRecipientId}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {isLoggedIn && <NotificationPrompt />}
      <PWAInstallPrompt />
      {isLoggedIn && onlineDevices.length > 1 && (backendSyncStatus === 'mismatch' || backendSyncStatus === 'syncing' || backendSyncStatus === 'checking') && <QuickProfileSwitcher />}
    </div>
  );
}
