import { useState } from 'react';
import { Icon, Avatar, cn } from './UI';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';

interface NewChatFlowProps {
  onClose: () => void;
  onSelect: (userId: string) => void;
  onAddFriend: () => void;
}

export const NewChatFlow = ({ onClose, onSelect, onAddFriend }: NewChatFlowProps) => {
  const { blockedUserIds, removedFriendIds, setViewingUserId, users, user: currentUser } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFriends = users
    .filter(user => 
      user.id !== currentUser?.id &&
      !blockedUserIds.includes(user.id) && 
      !removedFriendIds.includes(user.id) &&
      (user.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       user.username?.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      // Online first
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      // Then alphabetical
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-bg-light flex flex-col"
    >
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all">
            <Icon name="chevron_left" />
          </button>
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">New Chat</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Select a friend</p>
          </div>
        </div>
        <button onClick={onClose} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-primary transition-colors">
          Cancel
        </button>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
        <div className="relative">
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted text-sm" />
          <input 
            type="text" 
            placeholder="Search friends by name or username" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-primary/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
          />
        </div>

        {filteredFriends.length > 0 ? (
          <div className="space-y-1">
            {filteredFriends.map(user => (
              <div 
                key={user.id} 
                onClick={() => onSelect(user.id)}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-primary/5 cursor-pointer transition-colors"
              >
                <div className="relative" onClick={(e) => {
                  e.stopPropagation();
                  setViewingUserId(user.id);
                  onClose();
                }}>
                  <Avatar src={user.avatar} className="size-12" status={user.isOnline ? 'online' : 'offline'} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800">{user.displayName}</h4>
                  <p className="text-xs text-neutral-muted">{user.username}</p>
                </div>
                <Icon name="chevron_right" className="text-neutral-muted text-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4">
            <div className="size-24 rounded-full bg-primary/5 flex items-center justify-center text-primary/40">
              <Icon name="person_search" className="text-4xl" />
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800">No friends found</h4>
              <p className="text-sm text-neutral-muted">
                {searchQuery 
                  ? `We couldn't find anyone matching "${searchQuery}"`
                  : "You haven't added any friends yet. Want to connect with someone?"}
              </p>
            </div>
            {!searchQuery && (
              <button 
                onClick={onAddFriend}
                className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                Add Friend
              </button>
            )}
          </div>
        )}
      </main>
    </motion.div>
  );
};
