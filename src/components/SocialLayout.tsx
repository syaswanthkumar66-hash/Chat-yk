import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Icon, Avatar, Card, GlassCard, Button } from './UI';
import { ChatDetail } from './ChatDetail';
import { QRScanner } from './QRScanner';
import { CreateGroupFlow } from './CreateGroupFlow';
import { NewChatFlow } from './NewChatFlow';
import { ProfileView } from './ProfileView';
import { UserProfileView } from './UserProfileView';
import { GlobalSearch } from './GlobalSearch';
import { Settings } from './Settings';
import { GroupCall } from './GroupCall';
import { GroupInfo } from './GroupInfo';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';

function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';
  try {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return 'Offline';
  }
}

export const SocialLayout = () => {
  const [activeTab, setActiveTab] = useState<'chats' | 'friends' | 'calls' | 'profile'>('chats');
  const [chatFilter, setChatFilter] = useState<'all' | 'individuals' | 'groups'>('all');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { 
    setMode, 
    activeChatId, 
    setActiveChatId, 
    activeRecipientId, 
    setActiveRecipientId, 
    viewingUserId, 
    setViewingUserId, 
    friendRequests, 
    sentFriendRequests,
    setFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    sendFriendRequest,
    cancelFriendRequest,
    activeGroupCall,
    setActiveGroupCall,
    activeGroupInfoId,
    setActiveGroupInfoId,
    chats,
    blockedUserIds,
    removedFriendIds,
    createGroup,
    user,
    users,
    wssStatus,
    isWssConnected,
    wssMessage,
    connectSpot,
    disconnectSpot,
    initSocket
  } = useAppStore();

  useEffect(() => {
    if (user?.id) {
      initSocket(user.id);
    }
  }, [user?.id, initSocket]);

  const filteredChats = chats.filter(chat => {
    // Filter out blocked users
    if (!chat.isGroup && chat.participants.some(p => blockedUserIds.includes(p.id))) {
      return false;
    }
    
    if (chatFilter === 'groups') return chat.isGroup;
    if (chatFilter === 'individuals') return !chat.isGroup;
    return true;
  });

  return (
    <div className="flex h-screen bg-bg-light relative overflow-hidden font-sans">
      {/* Left Sidebar - Chat List */}
      <div className={`flex flex-col h-full bg-bg-light border-r border-primary/10 transition-all duration-500 ease-in-out relative z-20 ${
        (activeChatId || activeRecipientId || viewingUserId) ? 'hidden md:flex md:w-80 lg:w-[400px]' : 'w-full md:w-80 lg:w-[400px]'
      }`}>
        <AnimatePresence>
          {showGlobalSearch && (
            <GlobalSearch onClose={() => setShowGlobalSearch(false)} />
          )}
          {showScanner && (
            <QRScanner 
              onScan={async (data) => {
                console.log('Scanned:', data);
                setShowScanner(false);
                
                let processedData = data;
                
                // If it's a URL from our app, extract the username/ID
                if (data.includes('/user/')) {
                  processedData = data.split('/user/').pop() || data;
                } else if (data.includes('/request/')) {
                  processedData = data.split('/request/').pop() || data;
                }

                const cleanUsername = processedData.replace('@', '');

                // Check local users first
                let foundUser = users.find(u => 
                  u.id === cleanUsername ||
                  u.username === cleanUsername
                );

                if (foundUser) {
                  setViewingUserId(foundUser.id);
                  return;
                }

                // Query Firestore if available
                try {
                  const usersRef = collection(db, 'users');
                  const q = query(usersRef, where('username', '==', cleanUsername));
                  const querySnapshot = await getDocs(q);
                  
                  if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    const userData = doc.data();
                    
                    const newUser = {
                      id: doc.id,
                      username: userData.username,
                      displayName: userData.displayName || userData.username,
                      avatar: userData.avatar || `https://picsum.photos/seed/${doc.id}/200`,
                      description: userData.description || '',
                      isAdmin: userData.isAdmin || false,
                      joinDate: userData.joinDate || new Date().toISOString()
                    };
                    
                    // Add to local store so UserProfileView can see it
                    useAppStore.getState().addUser(newUser);
                    if (!useAppStore.getState().removedFriendIds.includes(doc.id)) {
                      useAppStore.getState().removeFriend(doc.id);
                    }
                    setViewingUserId(doc.id);
                    return;
                  }
                  
                  // Also try querying by doc ID just in case
                  const userDoc = await getDoc(doc(db, 'users', cleanUsername));
                  if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const newUser = {
                      id: userDoc.id,
                      username: userData.username,
                      displayName: userData.displayName || userData.username,
                      avatar: userData.avatar || `https://picsum.photos/seed/${userDoc.id}/200`,
                      description: userData.description || '',
                      isAdmin: userData.isAdmin || false,
                      joinDate: userData.joinDate || new Date().toISOString()
                    };
                    
                    useAppStore.getState().addUser(newUser);
                    if (!useAppStore.getState().removedFriendIds.includes(userDoc.id)) {
                      useAppStore.getState().removeFriend(userDoc.id);
                    }
                    setViewingUserId(userDoc.id);
                  }
                } catch (e) {
                  console.error('Error fetching scanned user from Firestore', e);
                }
              }} 
              onClose={() => setShowScanner(false)} 
            />
          )}
          {showCreateGroup && (
            <CreateGroupFlow 
              onClose={() => setShowCreateGroup(false)}
              onCreate={(data) => {
                const newId = createGroup({ ...data, creatorId: user!.id });
                setShowCreateGroup(false);
                setActiveChatId(newId); 
              }}
            />
          )}
          {showNewChat && (
            <NewChatFlow 
              onClose={() => setShowNewChat(false)}
              onAddFriend={() => {
                setShowNewChat(false);
                setShowScanner(true);
              }}
              onSelect={(userId) => {
                setShowNewChat(false);
                const existingChat = chats.find(c => 
                  !c.isGroup && c.participants.some(p => p.id === userId)
                );
                if (existingChat) {
                  setActiveChatId(existingChat.id);
                } else {
                  setActiveRecipientId(userId);
                }
              }}
            />
          )}
          {showSettings && (
            <Settings onClose={() => setShowSettings(false)} />
          )}
          {activeGroupCall && (
            <GroupCall 
              groupId={activeGroupCall.groupId}
              userId={activeGroupCall.userId}
              type={activeGroupCall.type} 
              onClose={() => setActiveGroupCall(null)} 
            />
          )}
          {activeGroupInfoId && (
            <GroupInfo onClose={() => setActiveGroupInfoId(null)} />
          )}
          {showFabMenu && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFabMenu(false)}
              className="fixed inset-0 z-[40] bg-black/40 backdrop-blur-sm"
            />
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="px-6 py-6 flex flex-col gap-6 bg-bg-light/80 backdrop-blur-xl sticky top-0 z-30 border-b border-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMode('hub')} 
                className="size-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-xl shadow-primary/10 transition-all border border-white"
              >
                <Icon name="grid_view" className="text-xl" />
              </motion.button>
              <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">{activeTab}</h1>
                <div className="flex items-center gap-3 mt-1.5">
                  <button 
                    onClick={() => {
                      if (wssStatus === 'connected') {
                        disconnectSpot();
                      } else {
                        connectSpot();
                      }
                    }}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all active:scale-95 text-[9px] font-black tracking-wider uppercase"
                    title={wssStatus === 'connected' ? "Click to disconnect Spot Connection" : "Click to go live"}
                  >
                    <div className={`size-2 rounded-full ${
                      wssStatus === 'connected' 
                        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse' 
                        : wssStatus === 'connecting'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                    }`} />
                    <span className={
                      wssStatus === 'connected' 
                        ? 'text-emerald-600 font-bold' 
                        : wssStatus === 'connecting'
                        ? 'text-amber-600 font-bold normal-case text-[10px]'
                        : 'text-rose-500 font-bold'
                    }>
                      {wssStatus === 'connected' ? 'Online' : wssStatus === 'connecting' ? 'Reconnecting...' : 'Offline'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              {user?.isAdmin && (
                <button 
                  onClick={() => setMode('admin')}
                  className="size-11 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 hover:bg-amber-500 hover:text-white transition-all active:scale-95 border border-white shadow-sm"
                  title="Admin Panel"
                >
                  <Icon name="security" />
                </button>
              )}
              <button 
                onClick={() => useAppStore.getState().logout()}
                className="size-11 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95 border border-white shadow-sm"
                title="Logout"
              >
                <Icon name="logout" />
              </button>
              {activeTab !== 'profile' && (
                <>
                  <button 
                    onClick={() => setShowGlobalSearch(true)}
                    className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm"
                  >
                    <Icon name="search" />
                  </button>
                  <button 
                    onClick={() => setShowScanner(true)}
                    className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm"
                  >
                    <Icon name="qr_code_scanner" />
                  </button>
                </>
              )}
            </div>
          </div>

          {activeTab === 'chats' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 p-1 bg-primary/5 rounded-2xl">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'individuals', label: 'Friends' },
                  { id: 'groups', label: 'Groups' }
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setChatFilter(filter.id as any)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      chatFilter === filter.id 
                        ? 'bg-white text-primary shadow-sm' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              
              <div className="relative flex items-center bg-primary/5 rounded-2xl border border-primary/5 hover:border-primary/10 transition-colors px-1 py-0.5">
                <Icon name="search" className="absolute left-4 text-slate-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={messageSearchQuery}
                  onChange={(e) => setMessageSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 bg-transparent border-none outline-none focus:ring-0 focus:outline-none text-xs text-slate-700 font-medium"
                />
                {messageSearchQuery && (
                  <button
                    onClick={() => setMessageSearchQuery('')}
                    className="absolute right-3 p-1 rounded-full text-slate-400 hover:bg-slate-200 transition-colors"
                  >
                    <Icon name="close" className="text-xs" />
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar bg-bg-light">
          {activeTab === 'chats' && (
            <div className="p-4 space-y-2">
              {messageSearchQuery ? (
                (() => {
                  const queryLower = messageSearchQuery.toLowerCase();
                  const results: { chat: any; msg: any; senderName: string; chatName: string; avatar: string }[] = [];
                  
                  chats.forEach(chat => {
                    if (chatFilter === 'groups' && !chat.isGroup) return;
                    if (chatFilter === 'individuals' && chat.isGroup) return;

                    const messages = chat.messages || [];
                    messages.forEach(msg => {
                      if (msg.text && msg.text.toLowerCase().includes(queryLower)) {
                        let senderName = msg.senderName || 'Unknown';
                        let avatar = msg.avatar || '';
                        
                        if (msg.senderId === user?.id) {
                          senderName = 'You';
                          avatar = user?.avatar || '';
                        } else if (!chat.isGroup) {
                          const partner = chat.participants.find(p => p.id === msg.senderId);
                          if (partner) {
                            senderName = partner.name;
                            avatar = partner.avatar;
                          }
                        } else {
                          const member = chat.participants.find(p => p.id === msg.senderId);
                          if (member) {
                            senderName = member.name;
                            avatar = member.avatar;
                          }
                        }

                        const chatName = chat.isGroup 
                          ? chat.name 
                          : chat.participants.find(p => p.id !== user?.id)?.name || 'Direct Chat';

                        results.push({
                          chat,
                          msg,
                          senderName,
                          chatName,
                          avatar: avatar || chat.avatar || 'https://picsum.photos/seed/default/200'
                        });
                      }
                    });
                  });

                  if (results.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <div className="size-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3 border border-slate-100">
                          <Icon name="search_off" className="text-2xl" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-700">No messages found</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-[220px]">We couldn't find any messages containing "{messageSearchQuery}"</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      <div className="px-2 pb-2 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Search Results</span>
                        <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">{results.length} found</span>
                      </div>
                      {results.map(({ chat, msg, senderName, chatName, avatar }) => (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={`search-msg-${msg.id}`}
                          onClick={() => {
                            setActiveChatId(chat.id);
                            setTimeout(() => {
                              const el = document.getElementById(`msg-${msg.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('ring-4', 'ring-primary/40', 'transition-all');
                                setTimeout(() => {
                                  el.classList.remove('ring-4', 'ring-primary/40');
                                }, 2000);
                              }
                            }, 300);
                          }}
                          className="flex items-start gap-3 p-3 bg-white rounded-2xl hover:bg-primary/5 cursor-pointer transition-all border border-slate-50 hover:border-primary/10 hover:shadow-md"
                        >
                          <Avatar src={avatar} className="size-9 rounded-xl shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-800 truncate">{senderName}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">{msg.timestamp}</span>
                            </div>
                            <p className="text-[9px] font-black text-primary/60 uppercase tracking-wider truncate mt-0.5">{chatName}</p>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed whitespace-pre-wrap font-medium">
                              {(() => {
                                const index = msg.text.toLowerCase().indexOf(queryLower);
                                if (index === -1) return msg.text;
                                const before = msg.text.substring(0, index);
                                const match = msg.text.substring(index, index + queryLower.length);
                                const after = msg.text.substring(index + queryLower.length);
                                return (
                                  <>
                                    {before}
                                    <mark className="bg-yellow-100 text-slate-900 rounded px-0.5 font-medium">{match}</mark>
                                    {after}
                                  </>
                                );
                              })()}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                filteredChats.map(chat => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={`chat-${chat.id}`}
                  onClick={() => setActiveChatId(chat.id)}
                  className={`flex items-center gap-4 p-4 cursor-pointer transition-all rounded-[2rem] relative group ${
                    activeChatId === chat.id ? 'bg-white ring-2 ring-primary/20 shadow-xl shadow-primary/5' : 'hover:bg-white/50'
                  }`}
                >
                  <div className="relative" onClick={(e) => {
                    e.stopPropagation();
                    if (chat.isGroup) {
                      setActiveGroupInfoId(chat.id);
                    } else {
                      setViewingUserId(chat.participants[0].id);
                    }
                  }}>
                    <Avatar 
                      src={chat.isGroup ? chat.avatar! : chat.participants[0].avatar} 
                      className="size-14" 
                      status={!chat.isGroup ? (users.find(u => u.id === chat.participants[0].id)?.isOnline ? 'online' : 'offline') : undefined} 
                    />
                    {chat.isGroup && (
                      <div className="absolute -bottom-1 -right-1 size-6 rounded-xl bg-primary text-white flex items-center justify-center border-2 border-white shadow-sm">
                        <Icon name="group" className="text-[10px]" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <h3 className="font-black text-slate-900 truncate tracking-tight">
                        {chat.isGroup ? chat.name : chat.participants[0].name}
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{chat.lastMessage?.timestamp}</span>
                    </div>
                    <p className="text-sm text-slate-500 truncate leading-tight">
                      {chat.isGroup && chat.lastMessage?.senderName && (
                        <span className="font-bold text-primary/80">{chat.lastMessage.senderName}: </span>
                      )}
                      {chat.lastMessage?.text}
                    </p>
                  </div>
                  {chat.unreadCount > 0 && (
                    <div className="size-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-primary/30">
                      {chat.unreadCount}
                    </div>
                  )}
                </motion.div>
              )))}
            </div>
          )}

          {activeTab === 'friends' && (() => {
            const myFriends = users.filter(u => 
              u.id !== user?.id && 
              u.isFriend && 
              !blockedUserIds.includes(u.id) && 
              !removedFriendIds.includes(u.id)
            );
            
            const sentRequestsUsers = users.filter(u => 
              u.id !== user?.id && 
              sentFriendRequests.includes(u.id) &&
              !blockedUserIds.includes(u.id) && 
              !removedFriendIds.includes(u.id)
            );
            
            const discoverPeople = users.filter(u => 
              u.id !== user?.id &&
              !u.isFriend &&
              !blockedUserIds.includes(u.id) && 
              !removedFriendIds.includes(u.id) &&
              !friendRequests.some(r => r.userId === u.id) &&
              !sentFriendRequests.includes(u.id)
            );

            return (
              <div className="p-4 space-y-6 overflow-y-auto no-scrollbar max-h-full">
                {/* 1. Incoming Friend Requests */}
                {friendRequests.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary px-1">Friend Requests Received ({friendRequests.length})</h4>
                    <div className="space-y-2">
                      {friendRequests.map(req => (
                        <Card key={`request-${req.id}`} className="p-3 flex items-center gap-3 bg-primary/5 border-primary/10">
                          <Avatar 
                            src={req.avatar} 
                            className="size-10 cursor-pointer hover:scale-105 transition-transform" 
                            onClick={() => setViewingUserId(req.userId)} 
                          />
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewingUserId(req.userId)}>
                            <p className="text-xs font-bold text-slate-800 truncate">{req.name}</p>
                            <p className="text-[8px] text-neutral-muted uppercase tracking-widest">{req.timestamp}</p>
                          </div>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => rejectFriendRequest(req.id)}
                              className="size-8 rounded-lg bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/20 active:scale-90 transition-all"
                            >
                              <Icon name="close" className="text-sm" />
                            </button>
                            <button 
                              onClick={() => acceptFriendRequest(req.id)}
                              className="size-8 rounded-lg bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 active:scale-90 transition-all"
                            >
                              <Icon name="check" className="text-sm" />
                            </button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Sent Requests (Pending "Added") */}
                {sentRequestsUsers.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Sent Requests / Added ({sentRequestsUsers.length})</h4>
                    <div className="space-y-2">
                      {sentRequestsUsers.map(loopUser => (
                        <Card key={`sent-${loopUser.id}`} className="p-3 flex items-center gap-3 bg-slate-50 border-slate-100">
                          <Avatar 
                            src={loopUser.avatar} 
                            className="size-10 cursor-pointer hover:scale-105 transition-transform" 
                            onClick={() => setViewingUserId(loopUser.id)} 
                          />
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewingUserId(loopUser.id)}>
                            <p className="text-xs font-bold text-slate-800 truncate">{loopUser.displayName}</p>
                            <p className="text-[8px] text-neutral-muted uppercase tracking-widest">Pending Acceptance</p>
                          </div>
                          <button 
                            onClick={() => cancelFriendRequest(loopUser.id)}
                            className="px-3 py-1.5 text-[10px] rounded-lg bg-slate-200 text-slate-600 font-bold hover:bg-red-50 hover:text-red-500 transition-colors active:scale-95"
                          >
                            Cancel
                          </button>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. My Friends */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary px-1">My Friends ({myFriends.length})</h4>
                  {myFriends.length > 0 ? (
                    <div className="space-y-1">
                      {myFriends.map(loopUser => (
                        <div key={`friend-${loopUser.id}`} className="flex items-center gap-4 p-2 cursor-pointer hover:bg-primary/5 rounded-xl transition-colors group" onClick={() => setViewingUserId(loopUser.id)}>
                          <Avatar src={loopUser.avatar} className="size-12" status={loopUser.isOnline ? 'online' : 'offline'} />
                          <div className="flex-1 border-b border-primary/5 pb-2 flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-slate-800">{loopUser.displayName}</h3>
                              <p className="text-xs text-neutral-muted flex items-center gap-1.5 flex-wrap">
                                <span>@{loopUser.username}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  • {loopUser.isOnline ? 'Online' : (loopUser.lastSeen ? `last seen ${formatLastSeen(loopUser.lastSeen)}` : 'Offline')}
                                </span>
                              </p>
                            </div>
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveChatId(null);
                                  setActiveRecipientId(loopUser.id);
                                  setActiveTab('chats');
                                }}
                                className="size-9 rounded-xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90 shadow-sm border border-slate-100"
                                title="Chat"
                              >
                                <Icon name="chat" className="text-sm" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveGroupCall({ type: 'voice', userId: loopUser.id });
                                }}
                                className="size-9 rounded-xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90 shadow-sm border border-slate-100"
                                title="Voice Call"
                              >
                                <Icon name="call" className="text-sm" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveGroupCall({ type: 'video', userId: loopUser.id });
                                }}
                                className="size-9 rounded-xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90 shadow-sm border border-slate-100"
                                title="Video Call"
                              >
                                <Icon name="videocam" className="text-sm" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-xs text-slate-400">No active friends yet. Add some people from the list below!</p>
                    </div>
                  )}
                </div>

                {/* 4. Discover People */}
                {discoverPeople.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Discover People ({discoverPeople.length})</h4>
                    <div className="space-y-1">
                      {discoverPeople.map(loopUser => (
                        <div key={`discover-${loopUser.id}`} className="flex items-center gap-4 p-2 cursor-pointer hover:bg-primary/5 rounded-xl transition-colors group" onClick={() => setViewingUserId(loopUser.id)}>
                          <Avatar src={loopUser.avatar} className="size-12" status={loopUser.isOnline ? 'online' : 'offline'} />
                          <div className="flex-1 border-b border-primary/5 pb-2 flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-slate-800">{loopUser.displayName}</h3>
                              <p className="text-xs text-neutral-muted flex items-center gap-1.5 flex-wrap">
                                <span>@{loopUser.username}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  • {loopUser.isOnline ? 'Online' : (loopUser.lastSeen ? `last seen ${formatLastSeen(loopUser.lastSeen)}` : 'Offline')}
                                </span>
                              </p>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                sendFriendRequest(loopUser.id);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-primary text-white text-[10px] font-bold hover:bg-primary-dark transition-all active:scale-95 shadow-md shadow-primary/10"
                            >
                              Add Friend
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'calls' && (
            <div className="p-4 space-y-4">
              {/* Group Calls in History */}
              {chats.filter(c => c.isGroup).map(group => (
                <Card key={`call-group-${group.id}`} className="flex items-center gap-4 p-4">
                  <Avatar 
                    src={group.avatar!} 
                    className="size-14 cursor-pointer hover:scale-105 transition-transform" 
                    onClick={() => {
                      setActiveChatId(group.id);
                      // This might need to open group info instead of user profile
                    }}
                  />
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{group.name}</h3>
                    <div className="flex items-center gap-1 text-[10px] text-neutral-muted">
                      <Icon name="groups" className="text-primary text-xs" />
                      Group Call • Yesterday, 8:20 PM
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setActiveGroupCall({ type: 'voice', groupId: group.id })}
                      className="size-10 rounded-xl bg-card-light flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
                    >
                      <Icon name="call" />
                    </button>
                    <button 
                      onClick={() => setActiveGroupCall({ type: 'video', groupId: group.id })}
                      className="size-10 rounded-xl bg-card-light flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
                    >
                      <Icon name="videocam" />
                    </button>
                  </div>
                </Card>
              ))}

              {/* Individual Calls in History */}
              {users.filter(u => !blockedUserIds.includes(u.id) && !removedFriendIds.includes(u.id)).map(user => (
                <Card key={`call-user-${user.id}`} className="flex items-center gap-4 p-4">
                  <Avatar 
                    src={user.avatar} 
                    className="size-14 cursor-pointer hover:scale-105 transition-transform" 
                    status={user.isOnline ? 'online' : 'offline'}
                    onClick={() => setViewingUserId(user.id)}
                  />
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{user.displayName}</h3>
                    <div className="flex items-center gap-1 text-[10px] text-neutral-muted">
                      <Icon name="call_received" className="text-green-500 text-xs" />
                      Today, 2:45 PM • 12 min
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setActiveGroupCall({ type: 'voice', userId: user.id })}
                      className="size-10 rounded-xl bg-card-light flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
                    >
                      <Icon name="call" />
                    </button>
                    <button 
                      onClick={() => setActiveGroupCall({ type: 'video', userId: user.id })}
                      className="size-10 rounded-xl bg-card-light flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
                    >
                      <Icon name="videocam" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {activeTab === 'profile' && (
            <ProfileView onSettingsClick={() => setShowSettings(true)} />
          )}
        </main>

        {/* Bottom Nav */}
        <nav className="bg-bg-light/80 backdrop-blur-xl border-t border-primary/5 flex justify-around py-4 sticky bottom-0 z-30">
          {[
            { id: 'chats', icon: 'chat_bubble', label: 'Chats' },
            { id: 'friends', icon: 'group', label: 'Friends' },
            { id: 'calls', icon: 'call', label: 'Calls' },
            { id: 'profile', icon: 'person', label: 'Me' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center gap-1.5 transition-all relative ${
                activeTab === item.id ? 'text-primary scale-110' : 'text-slate-400 hover:text-primary/60'
              }`}
            >
              <Icon name={item.icon} fill={activeTab === item.id} className="text-2xl" />
              <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
              {activeTab === item.id && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -bottom-4 w-8 h-1 bg-primary rounded-full"
                />
              )}
            </button>
          ))}
        </nav>

        {/* Floating Action Button */}
        {activeTab === 'chats' && (
          <div className="absolute bottom-24 right-6 flex flex-col items-end gap-3 z-[45]">
            <AnimatePresence>
              {showFabMenu && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  className="flex flex-col gap-3 mb-2"
                >
                  <button 
                    onClick={() => {
                      setShowCreateGroup(true);
                      setShowFabMenu(false);
                    }}
                    className="flex items-center gap-4 bg-white shadow-2xl border border-primary/5 px-6 py-4 rounded-2xl text-slate-900 font-bold hover:bg-primary/5 transition-all group"
                  >
                    <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <Icon name="group_add" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm">New Group</span>
                      <span className="text-[10px] text-neutral-muted font-normal">Chat with multiple friends</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      setShowNewChat(true);
                      setShowFabMenu(false);
                    }}
                    className="flex items-center gap-4 bg-white shadow-2xl border border-primary/5 px-6 py-4 rounded-2xl text-slate-900 font-bold hover:bg-primary/5 transition-all group"
                  >
                    <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <Icon name="chat" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm">New Chat</span>
                      <span className="text-[10px] text-neutral-muted font-normal">Message a friend</span>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <button 
              onClick={() => setShowFabMenu(!showFabMenu)}
              aria-label="Create new chat or group"
              className={`size-14 rounded-2xl bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center transition-all active:scale-90 ${showFabMenu ? 'rotate-45' : ''}`}
            >
              <Icon name="add" className="text-3xl" />
            </button>
          </div>
        )}
      </div>

      {/* Right Content - Chat Detail or Profile */}
      <div className={`flex-1 h-full bg-bg-light relative transition-all duration-500 ease-in-out ${
        !(activeChatId || activeRecipientId || viewingUserId) ? 'hidden md:flex items-center justify-center' : 'flex'
      }`}>
        <AnimatePresence mode="wait">
          {viewingUserId ? (
            <motion.div 
              key="user-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="size-full"
            >
              <UserProfileView userId={viewingUserId} onBack={() => setViewingUserId(null)} />
            </motion.div>
          ) : (activeChatId || activeRecipientId) ? (
            <motion.div 
              key="chat-detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="size-full"
            >
              <ChatDetail />
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 text-center p-12 max-w-sm"
            >
              <div className="size-32 rounded-[2.5rem] bg-white shadow-2xl shadow-primary/10 flex items-center justify-center text-primary/20 rotate-12">
                <Icon name="chat_bubble" className="text-7xl -rotate-12" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Ready to Connect?</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">Select a conversation from the list or start a new encrypted chat with your friends.</p>
              </div>
              <Button onClick={() => setShowNewChat(true)} className="px-8 h-12 rounded-2xl">
                Start New Chat
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Call Overlay */}
      <AnimatePresence>
        {activeGroupCall && (
          <GroupCall 
            groupId={activeGroupCall.groupId} 
            userId={activeGroupCall.userId}
            type={activeGroupCall.type} 
            onClose={() => setActiveGroupCall(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};
