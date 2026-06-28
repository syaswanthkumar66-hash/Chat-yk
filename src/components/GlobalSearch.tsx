import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Avatar, Card, Button } from './UI';
import { useAppStore } from '../store';
import { db } from '../firebase';
import { collection, query as firestoreQuery, where, getDocs } from 'firebase/firestore';

interface SearchResult {
  type: 'friend' | 'message' | 'file' | 'group' | 'device';
  id: string;
  title: string;
  subtitle: string;
  avatar?: string;
  icon?: string;
  timestamp?: string;
  metadata?: any;
}

export const GlobalSearch = ({ onClose }: { onClose: () => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'friends' | 'messages' | 'files' | 'groups'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const { setActiveChatId, setActiveDeviceId, setViewingUserId, chats, users, devices, blockedUserIds } = useAppStore();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    
    // Start with local results
    const localResults: SearchResult[] = [];

    // Search Local Users
    users.forEach(user => {
      if (blockedUserIds.includes(user.id)) return;
      if (user.displayName?.toLowerCase().includes(q) || user.username?.toLowerCase().includes(q)) {
        localResults.push({
          type: 'friend',
          id: user.id,
          title: user.displayName,
          subtitle: user.username,
          avatar: user.avatar,
        });
      }
    });

    // Search Groups & Messages
    chats.forEach(chat => {
      if (chat.isGroup && chat.name?.toLowerCase().includes(q)) {
        localResults.push({
          type: 'group',
          id: chat.id,
          title: chat.name,
          subtitle: `${chat.participants.length} members`,
          avatar: chat.avatar,
        });
      }

      if (chat.lastMessage?.text.toLowerCase().includes(q)) {
        localResults.push({
          type: 'message',
          id: chat.id,
          title: chat.isGroup ? chat.name! : chat.participants[0].name,
          subtitle: chat.lastMessage.text,
          avatar: chat.isGroup ? chat.avatar : chat.participants[0].avatar,
          timestamp: chat.lastMessage.timestamp,
        });
      }
    });

    // Mock Files (since they are in chat history/local)
    const mockFiles: Array<{name: string, size: string, chat: string}> = [];

    mockFiles.forEach((file, i) => {
      if (file.name.toLowerCase().includes(q)) {
        localResults.push({
          type: 'file',
          id: `file-${i}`,
          title: file.name,
          subtitle: `${file.size} • from ${file.chat}`,
          icon: 'description',
        });
      }
    });

    setResults(localResults);

    // Now async search in Firestore
    const searchFirestore = async () => {
      try {
        const usersRef = collection(db, 'users');
        // Simple client-side filtering since full text search needs extra setup, OR we can filter client side if small
        const querySnapshot = await getDocs(usersRef);
        if (!isActive) return;

        const remoteResults: SearchResult[] = [];
        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          if (doc.id === useAppStore.getState().user?.id) return; // Skip self
          
          // Check if already in local results
          if (localResults.some(r => r.id === doc.id)) return;
          
          if (userData.displayName?.toLowerCase().includes(q) || userData.username?.toLowerCase().includes(q)) {
             remoteResults.push({
               type: 'friend',
               id: doc.id,
               title: userData.displayName || userData.username,
               subtitle: userData.username,
               avatar: userData.avatar || `https://picsum.photos/seed/${doc.id}/200`,
             });
             
             // Add to local store so they exist if clicked!
             useAppStore.getState().addUser({
               id: doc.id,
               username: userData.username,
               displayName: userData.displayName || userData.username,
               avatar: userData.avatar || `https://picsum.photos/seed/${doc.id}/200`,
               description: userData.description || '',
               isAdmin: userData.isAdmin || false,
               joinDate: userData.joinDate || new Date().toISOString(),
               isOnline: userData.isOnline || false,
               lastSeen: userData.lastSeen || null,
             });
             
             if (!useAppStore.getState().removedFriendIds.includes(doc.id)) {
               useAppStore.getState().removeFriend(doc.id);
             }
          }
        });

        if (remoteResults.length > 0) {
          setResults(prev => [...prev, ...remoteResults]);
        }
      } catch (err) {
        console.error('Error searching Firestore:', err);
      }
    };
    
    searchFirestore();
    
    return () => {
      isActive = false;
    };
  }, [query]);

  const filteredResults = activeTab === 'all' 
    ? results 
    : results.filter(r => {
        if (activeTab === 'friends') return r.type === 'friend';
        if (activeTab === 'messages') return r.type === 'message';
        if (activeTab === 'files') return r.type === 'file';
        if (activeTab === 'groups') return r.type === 'group';
        return true;
      });

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'friend') {
      setViewingUserId(result.id);
    } else if (result.type === 'message' || result.type === 'group') {
      setActiveChatId(result.id);
    } else if (result.type === 'device') {
      setActiveDeviceId(result.id);
    }
    onClose();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed inset-0 z-[100] bg-bg-light flex flex-col overflow-hidden"
    >
      <header className="px-6 pt-10 pb-6 bg-bg-light/80 backdrop-blur-xl border-b border-primary/5 flex items-center gap-4">
        <button onClick={onClose} className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm">
          <Icon name="chevron_left" />
        </button>
        <div className="flex-1 bg-white rounded-[1.25rem] px-5 py-3 flex items-center gap-3 border border-white focus-within:border-primary/30 transition-all shadow-sm">
          <Icon name="search" className="text-primary text-lg" />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Search friends, messages, files..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:outline-none text-sm font-black uppercase tracking-tight italic placeholder:text-slate-300"
          />
          {query && (
            <button onClick={() => setQuery('')} className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
              <Icon name="close" className="text-[10px]" />
            </button>
          )}
        </div>
      </header>

      <div className="bg-bg-light/50 backdrop-blur-md border-b border-primary/5 flex gap-3 px-6 py-3 overflow-x-auto no-scrollbar">
        {['all', 'friends', 'messages', 'files', 'groups'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`shrink-0 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab 
                ? 'bg-primary text-white shadow-xl shadow-primary/20' 
                : 'text-slate-400 hover:bg-white hover:text-primary shadow-sm border border-transparent hover:border-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto p-6 no-scrollbar space-y-4">
        <div className="space-y-3">
          {filteredResults.length > 0 ? (
            filteredResults.map(result => (
              <Card 
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                className="flex items-center gap-4 p-4 cursor-pointer bg-white border-primary/5 hover:border-primary/20 hover:bg-primary/5 transition-all group shadow-sm hover:shadow-xl"
              >
                {result.avatar ? (
                  <Avatar src={result.avatar} className="size-14 rounded-[1.25rem]" />
                ) : (
                  <div className="size-14 rounded-[1.25rem] bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Icon name={result.icon || 'help'} className="text-2xl" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight italic truncate">{result.title}</h4>
                    {result.timestamp && <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{result.timestamp}</span>}
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate mt-1">{result.subtitle}</p>
                </div>
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1.5 rounded-xl">
                  {result.type}
                </div>
              </Card>
            ))
          ) : query ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="size-24 rounded-[2.5rem] bg-primary/5 flex items-center justify-center text-primary/30 mb-6 border border-primary/5">
                <Icon name="search_off" className="text-5xl" />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">No results found</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">We couldn't find anything matching "{query}"</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center opacity-30">
              <Icon name="search" className="text-8xl text-slate-200 mb-6" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Type to start searching</p>
            </div>
          )}
        </div>
      </main>
    </motion.div>
  );
};
