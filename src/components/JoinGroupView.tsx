import React from 'react';
import { motion } from 'framer-motion';
import { Icon, Avatar, Button, Card } from './UI';
import { useAppStore } from '../store';

export const JoinGroupView = () => {
  const { joinGroupId, setJoinGroupId, setActiveChatId, login, isLoggedIn, chats } = useAppStore();
  const chat = chats.find(c => c.id === joinGroupId);

  if (!chat) {
    return (
      <div className="fixed inset-0 z-[200] bg-bg-light flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="size-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center">
          <Icon name="error_outline" className="text-4xl" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Invalid Invite</h2>
        <p className="text-sm text-neutral-muted">This invite link is invalid or has expired.</p>
        <Button onClick={() => setJoinGroupId(null)}>Go Back</Button>
      </div>
    );
  }

  const handleJoin = () => {
    if (!isLoggedIn) {
      // For demo, just login and then join
      login();
    }
    setActiveChatId(chat.id);
    setJoinGroupId(null);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-0 z-[200] bg-bg-light flex flex-col"
    >
      <header className="px-6 py-4 flex items-center gap-4 border-b border-primary/5 bg-bg-light sticky top-0 z-30 min-h-[73px]">
        <button onClick={() => setJoinGroupId(null)} className="size-10 rounded-full bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm">
          <Icon name="close" />
        </button>
        <h3 className="font-bold text-slate-900">Group Invitation</h3>
      </header>

      <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center space-y-8">
        <div className="relative">
          <Avatar src={chat.avatar!} className="size-32 shadow-2xl" />
          <div className="absolute -bottom-2 -right-2 size-10 rounded-full bg-primary text-white flex items-center justify-center border-4 border-white">
            <Icon name="group" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase italic">{chat.name}</h2>
          <p className="text-sm text-neutral-muted">{chat.participants.length} members already joined</p>
        </div>

        <Card className="w-full p-6 space-y-4 bg-white border-primary/5 shadow-xl shadow-primary/5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
              <Icon name="info" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-muted">About this group</h4>
              <p className="text-sm text-slate-600">You've been invited to join this group chat. Connect with others and share files instantly.</p>
            </div>
          </div>
          
          <div className="flex -space-x-3 justify-center pt-4">
            {chat.participants.slice(0, 5).map((p) => (
              <div key={p.id}>
                <Avatar src={p.avatar} className="size-10 border-2 border-white" />
              </div>
            ))}
            {chat.participants.length > 5 && (
              <div className="size-10 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                +{chat.participants.length - 5}
              </div>
            )}
          </div>
        </Card>

        <div className="w-full space-y-3">
          <Button className="w-full py-4 text-lg" onClick={handleJoin}>
            {isLoggedIn ? 'Join Group' : 'Login to Join'}
          </Button>
          <button 
            onClick={() => setJoinGroupId(null)}
            className="w-full py-2 text-sm font-bold text-neutral-muted hover:text-slate-800 transition-colors"
          >
            Not now
          </button>
        </div>
      </main>
    </motion.div>
  );
};
