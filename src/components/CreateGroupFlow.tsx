import { useState } from 'react';
import { Icon, Avatar, Button, Card, cn } from './UI';
import { useAppStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';

interface CreateGroupFlowProps {
  onClose: () => void;
  onCreate: (groupData: { name: string, members: string[], avatar?: string }) => void;
}

export const CreateGroupFlow = ({ onClose, onCreate }: CreateGroupFlowProps) => {
  const [step, setStep] = useState<'selection' | 'details'>('selection');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('https://picsum.photos/seed/group/200');

  const { users, user } = useAppStore();

  const filteredFriends = users.filter(usr => 
    usr.id !== user?.id &&
    (usr.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    usr.username?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (selectedMembers.length >= 1) { // Minimum 2 including self, but here we select others
      setStep('details');
    }
  };

  const handleCreate = () => {
    if (groupName.trim()) {
      onCreate({
        name: groupName,
        members: selectedMembers,
        avatar: groupAvatar
      });
    }
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-bg-light flex flex-col"
    >
      <header className="px-6 py-4 flex items-center justify-between border-b border-primary/10 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={step === 'details' ? () => setStep('selection') : onClose} className="text-primary">
            <Icon name="chevron_left" />
          </button>
          <div>
            <h3 className="font-bold text-slate-800">
              {step === 'selection' ? 'New Group' : 'Group Details'}
            </h3>
            <p className="text-[10px] text-neutral-muted uppercase tracking-widest font-bold">
              {step === 'selection' ? `${selectedMembers.length} selected` : 'Finalize Group'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-neutral-muted text-sm font-bold">
          Cancel
        </button>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          {step === 'selection' ? (
            <motion.div 
              key="selection"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-4 space-y-4"
            >
              <div className="relative">
                <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted text-sm" />
                <input 
                  type="text" 
                  placeholder="Search friends..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-primary/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                {filteredFriends.map(user => (
                  <div 
                    key={`select-user-${user.id}`} 
                    onClick={() => toggleMember(user.id)}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-primary/5 cursor-pointer transition-colors"
                  >
                    <div onClick={(e) => {
                      e.stopPropagation();
                      useAppStore.getState().setViewingUserId(user.id);
                    }}>
                      <Avatar src={user.avatar} className="size-12" status={user.isOnline ? 'online' : 'offline'} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800">{user.displayName}</h4>
                      <p className="text-xs text-neutral-muted">{user.username}</p>
                    </div>
                    <div className={cn(
                      "size-6 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedMembers.includes(user.id) 
                        ? "bg-primary border-primary text-white" 
                        : "border-primary/20 bg-white"
                    )}>
                      {selectedMembers.includes(user.id) && <Icon name="check" className="text-xs font-bold" />}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 space-y-8"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  <Avatar src={groupAvatar} className="size-32" />
                  <button className="absolute bottom-0 right-0 size-10 rounded-full bg-primary text-white border-4 border-white flex items-center justify-center shadow-lg">
                    <Icon name="camera_alt" className="text-sm" />
                  </button>
                </div>
                <div className="w-full space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Group Name</label>
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="Enter group name..." 
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-white border border-primary/10 rounded-xl px-4 py-4 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">Members ({selectedMembers.length})</h4>
                <div className="flex flex-wrap gap-3">
                  {selectedMembers.map(id => {
                    const usr = users.find(u => u.id === id);
                    return usr ? (
                      <div key={`selected-user-${id}`} className="flex flex-col items-center gap-1">
                        <Avatar src={usr.avatar} className="size-12" />
                        <span className="text-[10px] font-bold text-slate-600 truncate w-12 text-center">{usr.displayName?.split(' ')[0]}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="p-6 bg-white border-t border-primary/10">
        {step === 'selection' ? (
          <Button 
            disabled={selectedMembers.length < 1}
            onClick={handleNext}
            className="w-full h-14 text-lg"
          >
            Next
          </Button>
        ) : (
          <Button 
            disabled={!groupName.trim()}
            onClick={handleCreate}
            className="w-full h-14 text-lg"
          >
            Create Group
          </Button>
        )}
      </footer>
    </motion.div>
  );
};
