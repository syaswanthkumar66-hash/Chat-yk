import React, { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { Message, Notification as AppNotification } from './types';
import { Hub } from './components/Hub';
import { Onboarding } from './components/Onboarding';
import { SocialLayout } from './components/SocialLayout';
import { FileShareLayout } from './components/FileShareLayout';
import { JoinGroupView } from './components/JoinGroupView';
import { AdminPanel } from './components/AdminPanel';
import { Icon, cn } from './components/UI';
import { NotificationPrompt } from './components/NotificationPrompt';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, handleFirestoreError, OperationType, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocFromServer, collection, query, where, onSnapshot, runBypassSelfTests } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
function useNotifications() {
  const socket = useAppStore((state) => state.socket);
  const user = useAppStore((state) => state.user);
  const activeChatId = useAppStore((state) => state.activeChatId);
  const chats = useAppStore((state) => state.chats);
  const users = useAppStore((state) => state.users);
  const mode = useAppStore((state) => state.mode);
  const addInAppToast = useAppStore((state) => state.addInAppToast);

  // Permission is requested by <NotificationPrompt /> which shows a proper
  // contextual UI prompt. A silent requestPermission() call here would conflict
  // and cause browsers to suppress the NotificationPrompt dialog.

  // Listen to socket 'user_status' to trigger alerts when a friend comes online
  useEffect(() => {
    if (!socket || !user) return;

    const handleUserStatus = (data: { userId: string, isOnline: boolean }) => {
      if (data.userId === user.id) return;
      if (!data.isOnline) return;

      // Find the user in our list
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
        try {
          new Notification(`${friendName} is back online!`, {
            body: `${friendName} is now active on Chat.`,
            icon: targetUser.avatar || 'https://picsum.photos/seed/default/200',
            tag: `online-${data.userId}`,
            renotify: true
          } as any);
        } catch (e) {
          console.warn('Friend online notification failed:', e);
        }
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
    setActiveRecipientId
  } = useAppStore();

  // Activate the real-time notification integration hook
  useNotifications();

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
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            login({
              id: firebaseUser.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: userData.isAdmin,
              joinDate: userData.joinDate,
              profileVisibility: userData.profileVisibility,
              notificationSettings: userData.notificationSettings
            });

            // If notification permission is already granted, silently register/sync push subscriptions in the background
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                import('./services/notificationService').then(({ registerPushNotifications }) => {
                  registerPushNotifications(firebaseUser.uid);
                }).catch(console.error);
              }
            }
          } else {
            // Document does not exist in Firestore, but Firebase User exists.
            // This means they are mid-onboarding or a new user. We must not treat them as logged in yet.
            if (!cachedUserObj || cachedUserObj.id !== firebaseUser.uid) {
              useAppStore.setState({ isLoggedIn: false, user: null });
            }
          }
        } catch (err) {
          console.error("Error fetching user data:", err);
          // Firestore connection failed (offline / unavailable). Fallback to cached user if matching!
          if (cachedUserObj && cachedUserObj.id === firebaseUser.uid) {
            console.log("Firestore error occurred. Continuing with cached user session to maintain offline/local storage compatibility.");
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

  // Handle Firestore syncing for both Google and Local logins Reactively
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return;

    let unsubscribeReceived = () => {};
    let unsubscribeSent = () => {};
    let unsubscribeNotifications = () => {};

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
            localStorage.setItem('proto_blockedUserIds', JSON.stringify(blocked));
            localStorage.setItem('proto_removedFriendIds', JSON.stringify(removed));
          }
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
                      avatar: senderData.avatar || `https://picsum.photos/seed/${r.fromUserId}/200`,
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
                    avatar: senderData.avatar || `https://picsum.photos/seed/${r.fromUserId}/200`,
                    timestamp: r.createdAt ? new Date(r.createdAt.toMillis()).toISOString() : new Date().toISOString()
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
          handleFirestoreError(err, OperationType.LIST, 'friendRequests');
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
                      avatar: recipientData.avatar || `https://picsum.photos/seed/${data.toUserId}/200`,
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
    unsubscribeNotifications = onSnapshot(qNotifications, async (snapshot) => {
      const notificationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AppNotification);
      notificationsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      useAppStore.setState({ notifications: notificationsList });

      const newlyCreated = notificationsList.filter(n => n.status === 'created');
      if (newlyCreated.length > 0) {
        const currentStore = useAppStore.getState();
        
        for (const notif of newlyCreated) {
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

          const userSettings = user.notificationSettings;
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
            avatar: notif.senderAvatar || `https://picsum.photos/seed/${notif.senderId || 'sys'}/200`,
            chatId: notif.chatId || ''
          });

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(notif.title, {
                body: bodyText,
                icon: notif.senderAvatar || '/pwa-192x192.png',
                tag: notif.chatId || notif.id,
                renotify: true
              } as any);
            } catch (e) {
              console.warn('Browser OS Notification failed:', e);
            }
          }
        }
      }
    }, (err) => {
      console.error("Error in notifications onSnapshot:", err);
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    });

    syncFirestoreData();

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
      unsubscribeNotifications();
    };
  }, [isLoggedIn, user?.id]);

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
  }, []);

  // Auth Loading Splash Screen
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="size-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-2xl shadow-primary/30 rotate-3 animate-pulse mx-auto">
            <Icon name="share" className="text-3xl" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Connecting Protocol</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Initializing Secure Digital Ecosystem...</p>
          </div>
          <div className="pt-6 border-t border-white/5 max-w-[180px] mx-auto">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Protocol v2.5 • Loading</p>
          </div>
        </div>
      </div>
    );
  }

  // Maintenance Mode Screen
  if (systemSettings.maintenanceMode && mode !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="size-20 rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto animate-pulse">
            <Icon name="engineering" className="text-4xl" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">System Offline</h1>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              We're currently performing scheduled maintenance to improve the Connect Protocol. We'll be back online shortly.
            </p>
          </div>
          <div className="pt-6 border-t border-white/5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Protocol v2.5 • Maintenance Mode</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light overflow-hidden relative">
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

      <div className="max-w-7xl mx-auto min-h-screen bg-white shadow-2xl relative">
        <AnimatePresence mode="wait">
        {joinGroupId && (
          <motion.div key="join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <JoinGroupView />
          </motion.div>
        )}
        
        {mode === 'hub' && !joinGroupId && (
          <motion.div key="hub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Hub />
          </motion.div>
        )}
        
        {mode === 'social' && !isLoggedIn && !joinGroupId && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Onboarding />
          </motion.div>
        )}

        {mode === 'social' && isLoggedIn && !joinGroupId && (
          <motion.div key="social" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SocialLayout />
          </motion.div>
        )}

        {mode === 'fileshare' && !joinGroupId && (
          <motion.div key="fileshare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FileShareLayout />
          </motion.div>
        )}

        {mode === 'admin' && !joinGroupId && (
          <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AdminPanel onClose={() => setMode('hub')} />
          </motion.div>
        )}
        </AnimatePresence>
      </div>

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
    </div>
  );
}
