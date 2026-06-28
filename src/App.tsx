import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { Message } from './types';
import { Hub } from './components/Hub';
import { Onboarding } from './components/Onboarding';
import { SocialLayout } from './components/SocialLayout';
import { FileShareLayout } from './components/FileShareLayout';
import { JoinGroupView } from './components/JoinGroupView';
import { AdminPanel } from './components/AdminPanel';
import { Icon, cn } from './components/UI';
import { NotificationPrompt } from './components/NotificationPrompt';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, handleFirestoreError, OperationType, doc, getDoc, setDoc, getDocFromServer, collection, query, where, onSnapshot } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

async function testConnection() {
  try {
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

  // Request system notification permissions on mount/login
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (user && Notification.permission === 'default') {
      Notification.requestPermission()
        .then((permission) => {
          console.log(`Notification permission status: ${permission}`);
        })
        .catch(console.error);
    }
  }, [user]);

  // Listen to socket 'receive_message' to trigger system alerts
  useEffect(() => {
    if (!socket || !user) return;

    const handleReceiveMessage = async (data: {
      id?: string;
      messageId?: string;
      groupId?: string;
      senderId: string;
      text: string;
      type: Message['type'];
      fileUrl?: string;
      fileSize?: string;
      encryptedFileKey?: number[];
      iv?: number[];
    }) => {
      // Don't notify if the message is from ourselves
      if (data.senderId === user.id) return;

      // Check if user has push notifications enabled in settings
      const pushEnabled = user.notificationSettings?.pushEnabled !== false;
      if (!pushEnabled) return;

      // Don't show system alerts for the active chat if the tab/document is focused
      const isChatActive = activeChatId === (data.groupId || data.senderId);
      const isChatPage = mode === 'social';
      const shouldAlert = !isChatPage || !isChatActive || !document.hasFocus();
      if (!shouldAlert) return;

      let decryptedText = data.text;

      // If encrypted, decrypt the message payload
      if (data.iv && data.text) {
        try {
          const { cryptoService } = await import('./services/cryptoService');
          const remotePubKeyBase64 = await new Promise<string>((resolve) => {
            socket.emit("get_public_key", { userId: data.senderId }, resolve);
          });
          if (remotePubKeyBase64) {
            const sharedSecret = await cryptoService.deriveSharedSecret(data.senderId, remotePubKeyBase64);
            const encryptedObj = JSON.parse(data.text);
            decryptedText = await cryptoService.decryptText(encryptedObj.iv, encryptedObj.ciphertext, sharedSecret);
          }
        } catch (e) {
          console.error("Notification decryption failed", e);
          decryptedText = "🔒 [Encrypted Message]";
        }
      }

      // Determine sender / group name
      const chatInfo = data.groupId 
        ? chats.find(c => c.id === data.groupId)
        : users.find(u => u.id === data.senderId);

      const senderName = (chatInfo as any)?.name || (chatInfo as any)?.displayName || 'New Message';
      const avatarUrl = chatInfo?.avatar || `https://picsum.photos/seed/${data.senderId}/200`;

      // Play system alert sound if enabled
      if (user.notificationSettings?.soundEnabled !== false) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {
          console.warn('Audio playback failed:', e);
        }
      }

      // Add custom in-app Toast notification so they ALWAYS get a beautiful floating banner
      addInAppToast({
        title: senderName,
        body: decryptedText,
        avatar: avatarUrl,
        chatId: data.groupId || data.senderId
      });

      // Trigger the OS/Browser Notification alert if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(senderName, {
            body: decryptedText,
            icon: avatarUrl,
            tag: data.groupId || data.senderId,
            renotify: true
          } as any);
        } catch (e) {
          console.warn('Notification display failed:', e);
        }
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    return () => {
      socket.off('receive_message', handleReceiveMessage);
    };
  }, [socket, user, activeChatId, chats, users, mode, addInAppToast]);

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

export default function App() {
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

  useEffect(() => {
    let unsubscribeFirestore = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
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

            // Sync blocked and removed friends lists from Firestore
            const blocked = userData.blockedUserIds || [];
            const removed = userData.removedFriendIds || [];
            useAppStore.setState({ blockedUserIds: blocked, removedFriendIds: removed });
            if (typeof window !== 'undefined') {
              localStorage.setItem('proto_blockedUserIds', JSON.stringify(blocked));
              localStorage.setItem('proto_removedFriendIds', JSON.stringify(removed));
            }
          }

          // Request notification permissions first and then register Web Push notifications subscription (VAPID)
          if (typeof window !== 'undefined') {
            const triggerPushRegistration = () => {
              import('./services/notificationService').then(({ registerPushNotifications }) => {
                registerPushNotifications(firebaseUser.uid);
              }).catch(console.error);
            };

            if ('Notification' in window && Notification.permission === 'default') {
              console.log("Prompting for notification permission immediately after login...");
              Notification.requestPermission()
                .then((perm) => {
                  console.log("Notification permission received after login:", perm);
                  triggerPushRegistration();
                })
                .catch((err) => {
                  console.error("Error requesting notification permission immediately after login:", err);
                  triggerPushRegistration();
                });
            } else {
              triggerPushRegistration();
            }
          }
          // If no doc exists, they might be mid-onboarding.
          // Onboarding will handle doc creation.
          
          // Set up friend request listener
          if (unsubscribeFirestore) unsubscribeFirestore(); // clean old if any
          let unsubscribeReceived = () => {};
          let unsubscribeSent = () => {};

          const requestsRef = collection(db, 'friendRequests');
          const qReceived = query(requestsRef, where('toUserId', '==', firebaseUser.uid));
          unsubscribeReceived = onSnapshot(qReceived, async (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
            
            // Generate full FriendRequest objects
            const fullRequests = [];
            for (const r of requests) {
              try {
                // Get sender info
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
            }
            useAppStore.getState().setFriendRequests(fullRequests);
          }, (err) => {
            console.error("Error in friendRequests onSnapshot:", err);
            handleFirestoreError(err, OperationType.LIST, 'friendRequests');
          });

          // Fetch sent requests too
          const qSent = query(requestsRef, where('fromUserId', '==', firebaseUser.uid));
          unsubscribeSent = onSnapshot(qSent, async (snapshot) => {
             const sentIds: string[] = [];
             
             for (let rDoc of snapshot.docs) {
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
             }
             useAppStore.setState({ sentFriendRequests: sentIds });
          }, (err) => {
            console.error("Error in sent friendRequests onSnapshot:", err);
            handleFirestoreError(err, OperationType.LIST, 'friendRequests');
          });

          unsubscribeFirestore = () => {
             unsubscribeReceived();
             unsubscribeSent();
          };
        } catch (err) {
          console.error("Error fetching user data:", err);
        }
      } else {
        if (unsubscribeFirestore) unsubscribeFirestore();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [login]);

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
              className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-primary/10 flex gap-3 pointer-events-auto cursor-pointer hover:bg-slate-50 transition-all active:scale-98"
              onClick={() => {
                // Remove the toast
                removeInAppToast(toast.id);
                // Bring them to the social mode and open the chat!
                setMode('social');
                setActiveChatId(toast.chatId);
                setActiveRecipientId(null);
              }}
              onAnimationComplete={() => {
                // Automatically dismiss toast after 5 seconds
                setTimeout(() => {
                  removeInAppToast(toast.id);
                }, 5000);
              }}
            >
              <div className="size-11 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0">
                <img src={toast.avatar} alt={toast.title} className="size-full object-cover" />
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
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <NotificationPrompt />
    </div>
  );
}
