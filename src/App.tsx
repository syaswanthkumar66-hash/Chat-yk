import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { Hub } from './components/Hub';
import { Onboarding } from './components/Onboarding';
import { SocialLayout } from './components/SocialLayout';
import { FileShareLayout } from './components/FileShareLayout';
import { JoinGroupView } from './components/JoinGroupView';
import { AdminPanel } from './components/AdminPanel';
import { Icon, cn } from './components/UI';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromServer, collection, query, where, onSnapshot } from 'firebase/firestore';

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

export default function App() {
  const { mode, isLoggedIn, joinGroupId, setJoinGroupId, setMode, login, logout, broadcasts, systemSettings, user } = useAppStore();

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
              joinDate: userData.joinDate
            });
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
    </div>
  );
}
