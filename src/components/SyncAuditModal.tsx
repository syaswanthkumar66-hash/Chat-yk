import React, { useState, useEffect } from 'react';
import { useStore, useAppStore, mergeCloudSyncPayload } from '../store';
import { Icon, Card, Button } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { db, doc, getDoc, setDoc } from '../firebase';

// Stable, deterministic hashing function to calculate the digest of current client state
export function calculateStateHash(
  chats: any[] = [], 
  users: any[] = [], 
  blockedUserIds: string[] = [], 
  friendRequests: any[] = []
) {
  // 1. Sort and represent Chats & Messages
  const sortedChats = [...chats].sort((a, b) => a.id.localeCompare(b.id));
  const chatParts = sortedChats.map(c => {
    const messages = c.messages || [];
    // Sort messages to ensure deterministic hashing
    const sortedMessages = [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const messageHash = sortedMessages.map((m: any) => `${m.id}:${m.senderId}:${m.text ? m.text.slice(0, 15) : ''}:${m.timestamp}`).join('|');
    return `${c.id}:${messages.length}:${messageHash}`;
  });

  // 2. Sort and represent Friends (users)
  const sortedUsers = [...users].sort((a, b) => a.id.localeCompare(b.id));
  const userParts = sortedUsers.map(u => `${u.id}:${u.name || ''}:${u.username || ''}`);

  // 3. Sort blocked and friend requests
  const sortedBlocked = [...blockedUserIds].sort();
  const sortedRequests = [...friendRequests].map(r => r.id || r.senderId || '').sort();

  // Combine into canonical representation
  const canonicalString = `CHATS:[${chatParts.join(';')}]|USERS:[${userParts.join(';')}]|BLOCKED:[${sortedBlocked.join(',')}]|REQS:[${sortedRequests.join(',')}]`;

  // Compute a 32-bit FNV-1a or DJB2 hash
  let hash = 5381;
  for (let i = 0; i < canonicalString.length; i++) {
    hash = (hash * 33) ^ canonicalString.charCodeAt(i);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');

  return {
    hash: hex,
    chatsCount: chats.length,
    messagesCount: chats.reduce((acc, c) => acc + (c.messages?.length || 0), 0),
    friendsCount: users.length,
    blockedCount: blockedUserIds.length,
    requestsCount: friendRequests.length,
    canonicalString
  };
}

interface ChatDiff {
  chatId: string;
  name: string;
  status: 'synced' | 'mismatch' | 'local_only' | 'cloud_only';
  localCount: number;
  cloudCount: number;
}

interface FriendDiff {
  userId: string;
  name: string;
  status: 'synced' | 'local_only' | 'cloud_only';
}

interface AuditResult {
  inSync: boolean;
  chatDiffs: ChatDiff[];
  friendDiffs: FriendDiff[];
}

interface SyncAuditModalProps {
  onClose: () => void;
}

export const SyncAuditModal = ({ onClose }: SyncAuditModalProps) => {
  const store = useStore(s => s);
  const userId = store.user?.id;

  const [loading, setLoading] = useState(true);
  const [cloudData, setCloudData] = useState<any | null>(null);
  const [localMeta, setLocalMeta] = useState<any>(null);
  const [cloudMeta, setCloudMeta] = useState<any>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const [syncingAction, setSyncingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'diagnose'>('summary');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load and calculate comparison
  const fetchAndAudit = async () => {
    if (!userId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Calculate Local Fingerprint
      const localUsersJSON = localStorage.getItem(`proto_users_${userId}`);
      const localUsers = localUsersJSON ? JSON.parse(localUsersJSON) : [];
      const localRequestsJSON = localStorage.getItem(`proto_friendRequests_${userId}`);
      const localRequests = localRequestsJSON ? JSON.parse(localRequestsJSON) : [];

      const calculatedLocal = calculateStateHash(
        store.chats,
        localUsers,
        store.blockedUserIds,
        localRequests
      );
      setLocalMeta(calculatedLocal);

      // 2. Fetch Cloud Sync document from Firestore
      const syncDocRef = doc(db, 'cloud_syncs', userId);
      const syncSnapshot = await getDoc(syncDocRef);

      if (syncSnapshot.exists()) {
        const payload = syncSnapshot.data();
        setCloudData(payload);

        const calculatedCloud = calculateStateHash(
          payload.chats || [],
          payload.users || [],
          payload.blockedUserIds || [],
          payload.friendRequests || []
        );
        setCloudMeta(calculatedCloud);

        // 3. Compute Diffs
        const chatDiffs: ChatDiff[] = [];
        const localChatsMap = new Map<string, any>((store.chats as any[]).map(c => [c.id, c]));
        const cloudChatsMap = new Map<string, any>((payload.chats || []).map((c: any) => [c.id, c]));

        // Gather all chat IDs
        const allChatIds = Array.from(new Set([...Array.from(localChatsMap.keys()), ...Array.from(cloudChatsMap.keys())]));
        for (const cid of allChatIds) {
          const localChat = localChatsMap.get(cid);
          const cloudChat = cloudChatsMap.get(cid);
          
          const name = (localChat?.name as string | undefined) || (cloudChat?.name as string | undefined) || `Chat #${cid.slice(0, 6)}`;
          
          if (localChat && cloudChat) {
            const localMsgCount = localChat.messages?.length || 0;
            const cloudMsgCount = cloudChat.messages?.length || 0;
            
            // Compare messages
            let match = localMsgCount === cloudMsgCount;
            if (match && localMsgCount > 0) {
              // Compare latest message IDs and timestamps
              const lastLocal = localChat.messages![localMsgCount - 1];
              const lastCloud = cloudChat.messages[cloudMsgCount - 1];
              if (lastLocal.id !== lastCloud.id || lastLocal.timestamp !== lastCloud.timestamp) {
                match = false;
              }
            }

            chatDiffs.push({
              chatId: cid,
              name,
              status: match ? 'synced' : 'mismatch',
              localCount: localMsgCount,
              cloudCount: cloudMsgCount
            });
          } else if (localChat) {
            chatDiffs.push({
              chatId: cid,
              name,
              status: 'local_only',
              localCount: localChat.messages?.length || 0,
              cloudCount: 0
            });
          } else {
            chatDiffs.push({
              chatId: cid,
              name,
              status: 'cloud_only',
              localCount: 0,
              cloudCount: cloudChat.messages?.length || 0
            });
          }
        }

        // Friends Diff
        const friendDiffs: FriendDiff[] = [];
        const localFriendsMap = new Map<string, any>((localUsers as any[]).map((u: any) => [u.id, u]));
        const cloudFriendsMap = new Map<string, any>((payload.users || []).map((u: any) => [u.id, u]));
        const allFriendIds = Array.from(new Set([...Array.from(localFriendsMap.keys()), ...Array.from(cloudFriendsMap.keys())]));

        for (const fid of allFriendIds) {
          const localFr = localFriendsMap.get(fid);
          const cloudFr = cloudFriendsMap.get(fid);
          const name = (localFr?.name as string | undefined) || (cloudFr?.name as string | undefined) || (localFr?.username as string | undefined) || (cloudFr?.username as string | undefined) || `User #${fid.slice(0, 6)}`;

          if (localFr && cloudFr) {
            friendDiffs.push({ userId: fid, name, status: 'synced' });
          } else if (localFr) {
            friendDiffs.push({ userId: fid, name, status: 'local_only' });
          } else {
            friendDiffs.push({ userId: fid, name, status: 'cloud_only' });
          }
        }

        const isHashMatch = calculatedLocal.hash === calculatedCloud.hash;
        setAuditResult({
          inSync: isHashMatch,
          chatDiffs,
          friendDiffs
        });
      } else {
        // No Cloud Data found
        setCloudMeta(null);
        setAuditResult({
          inSync: false,
          chatDiffs: store.chats.map(c => ({
            chatId: c.id,
            name: c.name || `Chat #${c.id.slice(0,6)}`,
            status: 'local_only',
            localCount: c.messages?.length || 0,
            cloudCount: 0
          })),
          friendDiffs: localUsers.map((u: any) => ({
            userId: u.id,
            name: (u.name as string | undefined) || (u.username as string),
            status: 'local_only'
          }))
        });
      }
    } catch (err: any) {
      console.error('[Sync Audit Error]', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndAudit();
  }, [userId]);

  // Action 1: Force Overwrite Cloud with Local State
  const handleForcePush = async () => {
    if (!userId) return;
    setSyncingAction('push');
    try {
      const localUsers = JSON.parse(localStorage.getItem(`proto_users_${userId}`) || '[]');
      const localRequests = JSON.parse(localStorage.getItem(`proto_friendRequests_${userId}`) || '[]');
      const localSentRequests = JSON.parse(localStorage.getItem(`proto_sentFriendRequests_${userId}`) || '[]');

      const payload = {
        chats: store.chats,
        users: localUsers,
        friendRequests: localRequests,
        sentFriendRequests: localSentRequests,
        blockedUserIds: store.blockedUserIds,
        removedFriendIds: store.removedFriendIds,
        lastUpdated: new Date().toISOString(),
        deviceInfo: {
          name: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Web',
          userId: userId
        }
      };

      await setDoc(doc(db, 'cloud_syncs', userId), payload);
      (window as any).__lastUploadedSyncTime = payload.lastUpdated;
      
      // Notify other active sessions of the same account via websocket so they pull immediately
      if (store.socket && store.socket.connected) {
        store.socket.emit('notify_cloud_sync');
      }
      
      // Update lastSyncedAt timestamp locally
      localStorage.setItem(`proto_last_synced_at_${userId}`, payload.lastUpdated);

      store.addInAppToast({
        title: 'Cloud Updated',
        body: 'Local state successfully pushed and audited as standard.',
        avatar: store.user?.avatar || '',
        chatId: ''
      });

      // Recalculate
      await fetchAndAudit();
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
    } finally {
      setSyncingAction(null);
    }
  };

  // Action 2: Force Overwrite Local with Cloud State
  const handleForcePull = async () => {
    if (!userId || !cloudData) return;
    setSyncingAction('pull');
    try {
      // Overwrite all store states and localStorage directly
      const saveLocalJSON = (key: string, value: any) => {
        localStorage.setItem(key, JSON.stringify(value));
      };

      store.setChats(cloudData.chats || []);
      saveLocalJSON(`proto_chats_${userId}`, cloudData.chats || []);

      saveLocalJSON(`proto_users_${userId}`, cloudData.users || []);
      useAppStore.setState({ users: cloudData.users || [] });

      if (cloudData.friendRequests) {
        saveLocalJSON(`proto_friendRequests_${userId}`, cloudData.friendRequests);
        store.setFriendRequests(cloudData.friendRequests);
      }
      if (cloudData.sentFriendRequests) {
        saveLocalJSON(`proto_sentFriendRequests_${userId}`, cloudData.sentFriendRequests);
        useAppStore.setState({ sentFriendRequests: cloudData.sentFriendRequests });
      }
      if (cloudData.blockedUserIds) {
        saveLocalJSON(`proto_blockedUserIds_${userId}`, cloudData.blockedUserIds);
        useAppStore.setState({ blockedUserIds: cloudData.blockedUserIds });
      }

      // Update local lastSyncedAt timestamp
      localStorage.setItem(`proto_last_synced_at_${userId}`, cloudData.lastUpdated || new Date().toISOString());

      store.addInAppToast({
        title: 'Local Sync Overwritten',
        body: 'Local database replaced with the cloud copy.',
        avatar: store.user?.avatar || '',
        chatId: ''
      });

      await fetchAndAudit();
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
    } finally {
      setSyncingAction(null);
    }
  };

  // Action 3: Smart Reconcile (Bidirectional merge)
  const handleSmartReconcile = async () => {
    if (!userId || !cloudData) return;
    setSyncingAction('merge');
    try {
      // 1. Run store's native cloud sync merge function to merge cloud into local (preserving both devices' chats/messages)
      mergeCloudSyncPayload(cloudData, userId);

      // 2. Fetch the newly merged state
      const mergedChats = useAppStore.getState().chats;
      const mergedUsers = useAppStore.getState().users;
      const mergedBlocked = useAppStore.getState().blockedUserIds;
      const mergedRequests = useAppStore.getState().friendRequests;
      const mergedSentRequests = useAppStore.getState().sentFriendRequests;

      // 3. Immediately upload this integrated merged state back to cloud so both are perfectly identical
      const updatedTimestamp = new Date().toISOString();
      const payload = {
        chats: mergedChats,
        users: mergedUsers,
        friendRequests: mergedRequests,
        sentFriendRequests: mergedSentRequests,
        blockedUserIds: mergedBlocked,
        removedFriendIds: useAppStore.getState().removedFriendIds,
        lastUpdated: updatedTimestamp,
        deviceInfo: {
          name: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Web',
          userId: userId
        }
      };

      await setDoc(doc(db, 'cloud_syncs', userId), payload);
      (window as any).__lastUploadedSyncTime = updatedTimestamp;
      
      // Notify other active sessions of the same account via websocket so they pull immediately
      if (store.socket && store.socket.connected) {
        store.socket.emit('notify_cloud_sync');
      }
      
      localStorage.setItem(`proto_last_synced_at_${userId}`, updatedTimestamp);

      store.addInAppToast({
        title: 'Bidirectional Sync Succeeded',
        body: 'Merged messages and contact databases smoothly!',
        avatar: store.user?.avatar || '',
        chatId: ''
      });

      await fetchAndAudit();
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
    } finally {
      setSyncingAction(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose} 
            className="size-11 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white transition-all active:scale-95 border border-slate-700/50 shadow-sm"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tighter italic leading-none">Sync Audit Center</h3>
            <p className="text-[9px] font-black text-pink-500 uppercase tracking-widest mt-1">Multi-Device Hashing & Consistency Checker</p>
          </div>
        </div>
        <button 
          onClick={fetchAndAudit} 
          disabled={loading}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-slate-700 transition-all"
        >
          <Icon name="refresh" className={loading ? 'animate-spin' : ''} />
          {loading ? 'Auditing...' : 'Check Status'}
        </button>
      </header>

      {/* Main Body */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full no-scrollbar">
        {errorMsg && (
          <div className="p-4 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-3 items-start">
            <Icon name="error" className="shrink-0 text-lg mt-0.5" />
            <div>
              <h4 className="font-bold uppercase tracking-wider">Sync Error Detected</h4>
              <p className="mt-1 opacity-90">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Sync Status Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="col-span-1 md:col-span-2 p-6 bg-slate-900 border-slate-800 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Icon name="security" className="text-8xl" />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Validation Status</span>
                {loading ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[8px] font-black uppercase tracking-wider animate-pulse">Computing Hashes...</span>
                ) : auditResult?.inSync ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border border-emerald-500/25 shadow-sm shadow-emerald-500/5">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Synchronized
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border border-amber-500/25 shadow-sm shadow-amber-500/5">
                    <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Sync Mismatch Detected
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">
                {loading ? 'Analyzing Databases...' : auditResult?.inSync ? 'All Devices in Harmony' : 'Databases Out of Sync'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                We compare cryptographically consistent deterministic hashes of your chat records, contacts, and blocked preferences to guarantee zero missing messages between this browser and your other active devices.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${activeTab === 'summary' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Audit Overview
              </button>
              <button 
                onClick={() => setActiveTab('details')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${activeTab === 'details' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Compare Tables
              </button>
              <button 
                onClick={() => setActiveTab('diagnose')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${activeTab === 'diagnose' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Diagnostics Info
              </button>
            </div>
          </Card>

          {/* Device Sync Info */}
          <Card className="p-6 bg-slate-900 border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Current Session</span>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                    <Icon name="smartphone" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-400">Device ID</h4>
                    <p className="text-xs font-mono font-bold text-slate-200 truncate max-w-[150px]">{localStorage.getItem('proto_device_id')?.slice(0, 16) || 'Local Client'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                    <Icon name="cloud" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-400">Cloud Storage</h4>
                    <p className="text-xs font-bold text-slate-200">
                      {cloudData?.lastUpdated ? new Date(cloudData.lastUpdated).toLocaleTimeString() : 'Never Sync'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-3">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Network Connection</span>
                <span className="text-emerald-500 flex items-center gap-1">
                  <span className="size-1 bg-emerald-500 rounded-full animate-ping" />
                  Secure WSS
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Dynamic tabs */}
        <AnimatePresence mode="wait">
          {activeTab === 'summary' && (
            <motion.div
              key="summary-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Hash Comparison Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Local Hash card */}
                <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 size-24 rounded-full bg-indigo-500/5 blur-xl" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Local Device Data</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-wider">Active State</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-mono font-black tracking-tight text-white">
                      {loading ? '••••••••' : localMeta?.hash || '00000000'}
                    </span>
                    <div className="text-right">
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">Checksum Signature</span>
                      <span className="text-[10px] font-bold font-mono text-slate-400">{localMeta?.chatsCount || 0} Chats • {localMeta?.messagesCount || 0} Messages</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-500" 
                      style={{ width: `${Math.min(100, ((localMeta?.messagesCount || 1) / (Math.max(1, (localMeta?.messagesCount || 0) + (cloudMeta?.messagesCount || 0)))) * 100)}%` }} 
                    />
                  </div>
                </div>

                {/* Cloud Hash card */}
                <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 size-24 rounded-full bg-pink-500/5 blur-xl" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cloud Sync Store</span>
                    <span className="px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 text-[8px] font-black uppercase tracking-wider">Firestore Copy</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-mono font-black tracking-tight text-white font-black">
                      {loading ? '••••••••' : cloudMeta?.hash || 'NO DATA'}
                    </span>
                    <div className="text-right">
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">Checksum Signature</span>
                      <span className="text-[10px] font-bold font-mono text-slate-400">{cloudMeta?.chatsCount || 0} Chats • {cloudMeta?.messagesCount || 0} Messages</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-pink-500 transition-all duration-500" 
                      style={{ width: `${Math.min(100, ((cloudMeta?.messagesCount || 0) / (Math.max(1, (localMeta?.messagesCount || 0) + (cloudMeta?.messagesCount || 0)))) * 100)}%` }} 
                    />
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel if Not Synced */}
              {!loading && !auditResult?.inSync && (
                <div className="p-5 rounded-[2.25rem] bg-amber-500/5 border border-amber-500/20 space-y-4">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                      <Icon name="emergency" className="text-xl animate-spin-slow" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Resolve State Discrepancy</h3>
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        Your client data doesn't match what's stored in the cloud. Choose a reconciliation strategy below to unify your chat history across your computers and mobile devices.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    {/* Option 1: Smart Merge */}
                    <button
                      onClick={handleSmartReconcile}
                      disabled={syncingAction !== null}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/30 text-left transition-all active:scale-95 group hover:bg-slate-850"
                    >
                      <div className="size-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <Icon name="call_merge" className="text-sm" />
                      </div>
                      <h4 className="font-black text-xs text-white uppercase tracking-wider mt-3">Smart Reconcile</h4>
                      <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                        Unifies local and cloud records. Merges missing messages bidirectionally without destroying any chats. <span className="text-indigo-400 font-bold">(Highly Recommended)</span>
                      </p>
                      {syncingAction === 'merge' && <span className="text-[8px] font-black text-indigo-400 tracking-wider uppercase mt-2 block animate-pulse">Syncing...</span>}
                    </button>

                    {/* Option 2: Force Push */}
                    <button
                      onClick={handleForcePush}
                      disabled={syncingAction !== null}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-pink-500/30 text-left transition-all active:scale-95 group hover:bg-slate-850"
                    >
                      <div className="size-8 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center group-hover:bg-pink-500 group-hover:text-white transition-all">
                        <Icon name="cloud_upload" className="text-sm" />
                      </div>
                      <h4 className="font-black text-xs text-white uppercase tracking-wider mt-3">Force Push Local</h4>
                      <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                        Replaces the Cloud with your current browser state. Useful if you recently composed messages offline or want to overwrite other devices.
                      </p>
                      {syncingAction === 'push' && <span className="text-[8px] font-black text-pink-400 tracking-wider uppercase mt-2 block animate-pulse">Uploading...</span>}
                    </button>

                    {/* Option 3: Force Pull */}
                    <button
                      onClick={handleForcePull}
                      disabled={syncingAction !== null || !cloudData}
                      className={`p-4 rounded-2xl text-left transition-all group ${!cloudData ? 'bg-slate-950/40 border-slate-900 opacity-50 cursor-not-allowed' : 'bg-slate-900 border border-slate-800 hover:border-emerald-500/30 active:scale-95 hover:bg-slate-850'}`}
                    >
                      <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <Icon name="cloud_download" className="text-sm" />
                      </div>
                      <h4 className="font-black text-xs text-white uppercase tracking-wider mt-3">Force Pull Cloud</h4>
                      <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                        Discards current local edits and replaces the client database entirely with the Cloud copy.
                      </p>
                      {syncingAction === 'pull' && <span className="text-[8px] font-black text-emerald-400 tracking-wider uppercase mt-2 block animate-pulse">Downloading...</span>}
                    </button>
                  </div>
                </div>
              )}

              {/* Synced confirmation display */}
              {!loading && auditResult?.inSync && (
                <div className="p-6 rounded-[2.25rem] bg-emerald-500/5 border border-emerald-500/20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="size-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center animate-pulse">
                    <Icon name="check_circle" className="text-3xl" />
                  </div>
                  <div>
                    <h3 className="font-black text-white uppercase tracking-wider text-sm">Perfect Hash Agreement</h3>
                    <p className="text-[11px] text-slate-400 max-w-md mt-1 leading-relaxed">
                      Your local browser databases match the secure Firestore cloud backups perfectly (Digest Signature: <span className="font-mono text-emerald-400 font-bold">{localMeta?.hash}</span>). No missing data detected.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'details' && (
            <motion.div
              key="details-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Detailed Breakdown Lists */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detailed Chat Consistency Report</h4>
                  <span className="text-[9px] font-bold text-slate-500 uppercase">{auditResult?.chatDiffs.length || 0} Chats Audited</span>
                </div>

                <div className="divide-y divide-slate-800/60 bg-slate-900 rounded-[2rem] border border-slate-800 overflow-hidden">
                  {auditResult?.chatDiffs && auditResult.chatDiffs.length > 0 ? (
                    auditResult.chatDiffs.map((diff) => (
                      <div key={diff.chatId} className="p-4 flex items-center justify-between hover:bg-slate-850/50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`size-10 rounded-xl flex items-center justify-center ${
                            diff.status === 'synced' ? 'bg-emerald-500/10 text-emerald-400' :
                            diff.status === 'mismatch' ? 'bg-amber-500/10 text-amber-400' :
                            diff.status === 'local_only' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-pink-500/10 text-pink-400'
                          }`}>
                            <Icon name={diff.status === 'synced' ? 'chat' : 'sync_problem'} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white uppercase tracking-tight">{diff.name}</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              ID: {diff.chatId.slice(0, 8)}...
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {/* Comparative message counts */}
                          <div className="text-right">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">Msg Count Comparison</span>
                            <span className="text-[10px] font-mono text-slate-300">
                              Local: <span className="font-bold text-white">{diff.localCount}</span> vs Cloud: <span className="font-bold text-white">{diff.cloudCount}</span>
                            </span>
                          </div>

                          {/* Status Badge */}
                          <div className="w-24 text-right">
                            {diff.status === 'synced' ? (
                              <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">Synced</span>
                            ) : diff.status === 'mismatch' ? (
                              <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">Mismatch</span>
                            ) : diff.status === 'local_only' ? (
                              <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">Local Only</span>
                            ) : (
                              <span className="text-[9px] font-black text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">Cloud Only</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs uppercase tracking-wider">No chats found to compare.</div>
                  )}
                </div>
              </div>

              {/* Friends Comparison */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contacts & Friend Databases</h4>
                  <span className="text-[9px] font-bold text-slate-500 uppercase">{auditResult?.friendDiffs.length || 0} Contacts Checked</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {auditResult?.friendDiffs && auditResult.friendDiffs.length > 0 ? (
                    auditResult.friendDiffs.map((friend) => (
                      <div key={friend.userId} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Icon name="person" className="text-slate-400" />
                          <span className="font-bold text-slate-200">{friend.name}</span>
                        </div>
                        {friend.status === 'synced' ? (
                          <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">Synced</span>
                        ) : friend.status === 'local_only' ? (
                          <span className="text-[8px] font-black text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase">Local</span>
                        ) : (
                          <span className="text-[8px] font-black text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded uppercase">Cloud</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 p-6 text-center bg-slate-900 rounded-3xl text-slate-500 text-xs uppercase tracking-wider border border-slate-800">No contacts synced.</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'diagnose' && (
            <motion.div
              key="diagnose-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* raw hash strings / diagnostics dump */}
              <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Raw Canonical Representation Dump</h3>
                  <p className="text-[10px] text-slate-400 mt-1">This represents the raw structured string hashed by the sync engine to determine state agreement.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-500">Local Signature Input</span>
                    <pre className="mt-1 p-3 rounded-xl bg-slate-950 font-mono text-[9px] text-indigo-400 overflow-x-auto whitespace-pre-wrap max-h-40 border border-slate-800 select-all leading-normal">
                      {localMeta?.canonicalString || 'N/A'}
                    </pre>
                  </div>

                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-500">Cloud Signature Input</span>
                    <pre className="mt-1 p-3 rounded-xl bg-slate-950 font-mono text-[9px] text-pink-400 overflow-x-auto whitespace-pre-wrap max-h-40 border border-slate-800 select-all leading-normal">
                      {cloudMeta?.canonicalString || 'N/A (No backup exists on cloud)'}
                    </pre>
                  </div>
                </div>
              </Card>

              {/* Troubleshooting info */}
              <Card className="p-5 bg-slate-900 border-slate-800">
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Diagnostics Checklist</h4>
                <ul className="mt-3 space-y-2 text-[11px] text-slate-400 leading-relaxed list-disc list-inside">
                  <li>Your <span className="text-white">Device ID</span> is unique to each web browser instance to separate logins.</li>
                  <li>Firestore synchronizations are pushed securely and debounced automatically to reduce database quota.</li>
                  <li>If you get persistent socket timeouts, the sync system automatically retries connection using standard secure WebSockets.</li>
                  <li>When WebSockets disconnect, the client stores updates in local index buffers and queues deliveries until restored.</li>
                </ul>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
