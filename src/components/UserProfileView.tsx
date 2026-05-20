import { useState, useEffect } from 'react';
import { Icon, Avatar, Card, Button, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { MediaGallery } from './MediaGallery';

interface UserProfileViewProps {
  userId: string;
  onBack: () => void;
}

type Relationship = 'friend' | 'pending_sent' | 'pending_received' | 'not_friend' | 'blocked';

interface UserData {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  status: 'online' | 'offline' | 'away';
  relationship: Relationship;
  joinedDate: string;
  lastSeen?: string;
}

const MOCK_PROFILES: Record<string, UserData> = {};

export const UserProfileView = ({ userId, onBack }: UserProfileViewProps) => {
  const { 
    setActiveChatId, 
    setActiveRecipientId, 
    removeFriend, 
    blockUser, 
    unblockUser,
    restoreFriend,
    reportUser, 
    blockedUserIds, 
    removedFriendIds,
    friendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    sentFriendRequests,
    sendFriendRequest,
    cancelFriendRequest,
    setActiveGroupCall,
    users
  } = useAppStore();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [activeModal, setActiveModal] = useState<'block' | 'report' | 'remove' | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [showReportSuccess, setShowReportSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      const storeUser = users.find(u => u.id === userId);
      if (storeUser) {
        let relationship: Relationship = 'not_friend';
        if (blockedUserIds.includes(userId)) {
          relationship = 'blocked';
        } else if (friendRequests.some(r => r.userId === userId)) {
          relationship = 'pending_received';
        } else if (sentFriendRequests.includes(userId)) {
          relationship = 'pending_sent';
        } else if (removedFriendIds.includes(userId)) {
          relationship = 'not_friend';
        } else {
          relationship = 'friend';
        }
        setUser({ 
          id: storeUser.id,
          name: storeUser.displayName,
          username: storeUser.username,
          avatar: storeUser.avatar,
          bio: storeUser.description || '',
          status: storeUser.isOnline ? 'online' : (storeUser.isInactive ? 'away' : 'offline'),
          relationship,
          joinedDate: new Date(storeUser.joinDate).toLocaleDateString(),
          lastSeen: storeUser.lastSeen
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    }, 600);
  }, [userId, blockedUserIds, removedFriendIds, friendRequests, sentFriendRequests, users]);

  const handleCopyUsername = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.username);
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 2000);
  };

  const handleAction = (action: string) => {
    if (!user) return;
    console.log(`Action: ${action} for user ${user.id}`);
    
    if (action === 'message') {
      setActiveChatId(null);
      setActiveRecipientId(user.id);
      onBack();
    } else if (action === 'voice_call') {
      setActiveGroupCall({ type: 'voice', userId: user.id });
    } else if (action === 'video_call') {
      setActiveGroupCall({ type: 'video', userId: user.id });
    } else if (action === 'remove_friend') {
      setActiveModal('remove');
    } else if (action === 'block_user') {
      setActiveModal('block');
    } else if (action === 'unblock_user') {
      unblockUser(user.id);
    } else if (action === 'report_user') {
      setActiveModal('report');
    } else if (action === 'accept_request') {
      const request = friendRequests.find(r => r.userId === user.id);
      if (request) {
        acceptFriendRequest(request.id);
        setUser({ ...user, relationship: 'friend' });
      }
    } else if (action === 'decline_request') {
      const request = friendRequests.find(r => r.userId === user.id);
      if (request) {
        rejectFriendRequest(request.id);
        setUser({ ...user, relationship: 'not_friend' });
      }
    } else if (action === 'add_friend') {
      if (removedFriendIds.includes(user.id)) {
        restoreFriend(user.id);
      }
      sendFriendRequest(user.id);
      setUser({ ...user, relationship: 'pending_sent' });
    } else if (action === 'cancel_request') {
      cancelFriendRequest(user.id);
      setUser({ ...user, relationship: 'not_friend' });
    }
    setShowMenu(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-bg-light animate-pulse">
        <div className="h-20 bg-white border-b border-primary/5" />
        <div className="p-8 flex flex-col items-center gap-6">
          <div className="size-32 rounded-[2.5rem] bg-slate-200" />
          <div className="space-y-3 w-full max-w-xs flex flex-col items-center">
            <div className="h-8 w-3/4 bg-slate-200 rounded-lg" />
            <div className="h-4 w-1/2 bg-slate-200 rounded-lg" />
            <div className="h-16 w-full bg-slate-200 rounded-xl" />
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            <div className="h-12 bg-slate-200 rounded-2xl" />
            <div className="h-12 bg-slate-200 rounded-2xl" />
            <div className="h-12 bg-slate-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full bg-bg-light p-8 text-center gap-4">
        <div className="size-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center">
          <Icon name="person_off" className="text-4xl" />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">User Not Found</h3>
          <p className="text-sm text-neutral-muted">The user you're looking for doesn't exist or is unavailable.</p>
        </div>
        <button 
          onClick={onBack}
          className="px-8 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-light">
      {/* Header */}
      <header className="px-6 pt-6 pb-4 flex items-center justify-between bg-bg-light border-b border-primary/10 sticky top-0 z-30 min-h-[85px]">
        <button 
          onClick={onBack}
          className="size-10 rounded-full bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 shadow-sm border border-white"
        >
          <Icon name="arrow_back" />
        </button>
        <h1 className="text-lg font-black tracking-tighter text-slate-800 uppercase italic">Profile</h1>
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="size-10 rounded-full bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 shadow-sm border border-white"
          >
            <Icon name="more_vert" />
          </button>
          
          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-primary/10 p-2 z-50"
                >
                  <button 
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: user.name,
                            text: `Connect with ${user.name}'s Backend Team Identity on Connect & Share`,
                            url: window.location.href
                          });
                        } catch (err) {
                          if (err instanceof Error && err.name === 'AbortError') {
                            console.log('Share was canceled by user');
                          } else {
                            console.error('Error sharing profile:', err);
                          }
                        }
                      }
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold text-sm transition-colors"
                  >
                    <Icon name="share" className="text-lg" /> Share Profile
                  </button>
                  {user.relationship === 'blocked' ? (
                    <button 
                      onClick={() => handleAction('unblock_user')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/5 text-primary font-bold text-sm transition-colors"
                    >
                      <Icon name="block" className="text-lg" /> Unblock User
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleAction('block_user')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-500 font-bold text-sm transition-colors"
                    >
                      <Icon name="block" className="text-lg" /> Block User
                    </button>
                  )}
                  <button 
                    onClick={() => handleAction('report_user')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-500 font-bold text-sm transition-colors"
                  >
                    <Icon name="report" className="text-lg" /> Report
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="p-8 space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="size-32 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl">
                <img src={user.avatar} alt={user.name} className="size-full object-cover" />
              </div>
              <div className={cn(
                "absolute -bottom-1 -right-1 size-8 rounded-2xl border-4 border-bg-light shadow-sm",
                user.status === 'online' ? 'bg-green-500' : 
                user.status === 'away' ? 'bg-amber-500' : 'bg-slate-400'
              )} />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">{user.name}</h2>
              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={handleCopyUsername}
                  className="relative group inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  <span className="text-sm font-bold text-primary">{user.username}</span>
                  <Icon name="content_copy" className="text-[10px] text-primary/60" />
                  
                  <AnimatePresence>
                    {isCopying && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: -20 }}
                        exit={{ opacity: 0 }}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold"
                      >
                        Copied!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>

                {user.relationship === 'friend' && (
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-600 text-[10px] font-black uppercase tracking-widest">
                    Friend
                  </span>
                )}
                {(user.relationship === 'pending_sent' || user.relationship === 'pending_received') && (
                  <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-600 text-[10px] font-black uppercase tracking-widest">
                    {user.relationship === 'pending_sent' ? 'Request Sent' : 'Respond to Request'}
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-muted leading-relaxed max-w-xs mx-auto mt-4">
                {user.bio || "This user hasn't added a bio yet"}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {user.relationship === 'friend' && (
              <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => handleAction('message')}
                  className="flex flex-col items-center gap-2 p-4 bg-white rounded-3xl border border-primary/5 shadow-sm hover:shadow-md transition-all group active:scale-95"
                >
                  <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Icon name="chat_bubble" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tighter">Message</span>
                </button>
                <button 
                  onClick={() => handleAction('voice_call')}
                  className="flex flex-col items-center gap-2 p-4 bg-white rounded-3xl border border-primary/5 shadow-sm hover:shadow-md transition-all group active:scale-95"
                >
                  <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Icon name="call" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tighter">Voice</span>
                </button>
                <button 
                  onClick={() => handleAction('video_call')}
                  className="flex flex-col items-center gap-2 p-4 bg-white rounded-3xl border border-primary/5 shadow-sm hover:shadow-md transition-all group active:scale-95"
                >
                  <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Icon name="videocam" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tighter">Video</span>
                </button>
              </div>
            )}

            {user.relationship === 'blocked' && (
              <button 
                onClick={() => handleAction('unblock_user')}
                className="w-full py-4 bg-primary text-white rounded-3xl font-bold shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Icon name="block" />
                Unblock User
              </button>
            )}

            {user.relationship === 'not_friend' && (
              <button 
                onClick={() => handleAction('add_friend')}
                className="w-full py-4 bg-primary text-white rounded-3xl font-bold shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Icon name="person_add" />
                Add Friend
              </button>
            )}

            {user.relationship === 'pending_sent' && (
              <button 
                onClick={() => handleAction('cancel_request')}
                className="w-full py-4 bg-white border border-primary/5 text-slate-600 rounded-3xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"
              >
                <Icon name="close" />
                Cancel Request
              </button>
            )}

            {user.relationship === 'pending_received' && (
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleAction('accept_request')}
                  className="py-4 bg-primary text-white rounded-3xl font-bold shadow-xl shadow-primary/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Icon name="check" />
                  Accept
                </button>
                <button 
                  onClick={() => handleAction('decline_request')}
                  className="py-4 bg-white border border-primary/5 text-slate-600 rounded-3xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"
                >
                  <Icon name="close" />
                  Decline
                </button>
              </div>
            )}
          </div>

          {/* Additional Info */}
          <Card className="p-6 space-y-4 bg-white border-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                  <Icon name="calendar_today" className="text-sm" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-muted uppercase tracking-widest">Joined</p>
                  <p className="text-sm font-bold text-slate-700">{user.joinedDate}</p>
                </div>
              </div>
              {user.lastSeen && (
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-[10px] font-bold text-neutral-muted uppercase tracking-widest">Last Seen</p>
                    <p className="text-sm font-bold text-slate-700">{user.lastSeen}</p>
                  </div>
                  <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                    <Icon name="schedule" className="text-sm" />
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t border-primary/5">
              <h4 className="text-[10px] font-bold text-neutral-muted uppercase tracking-widest mb-3">Mutual Connections</h4>
              <div className="flex items-center gap-2">
                <div className="flex -space-x-3">
                  {[1, 2, 3].map(i => (
                    <div key={i}>
                      <Avatar 
                        src={`https://picsum.photos/seed/mutual${i}/100`} 
                        className="size-8 border-2 border-white" 
                      />
                    </div>
                  ))}
                </div>
                <span className="text-xs font-bold text-slate-600">3 mutual friends</span>
              </div>
            </div>
          </Card>

          {/* Media, Links & Docs Section */}
          <section className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-2">Media, Links & Docs</h4>
            <Card 
              onClick={() => setShowMediaGallery(true)}
              className="flex items-center gap-3 p-3 cursor-pointer hover:border-primary/20 transition-all group bg-white"
            >
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="size-10 rounded-lg bg-slate-200 border-2 border-white overflow-hidden">
                    <img src={`https://picsum.photos/seed/media${i}/100`} alt="media" className="size-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-800">42 items</p>
                <p className="text-[8px] text-neutral-muted uppercase tracking-widest">Swipe to browse</p>
              </div>
              <Icon name="chevron_right" className="text-neutral-muted group-hover:text-primary transition-colors" />
            </Card>
          </section>

          {user.relationship === 'friend' && (
            <button 
              onClick={() => setActiveModal('remove')}
              className="w-full py-4 text-red-500 font-bold text-sm hover:bg-red-50 rounded-3xl transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="person_remove" />
              Remove Friend
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-8 gap-6"
            >
              {activeModal === 'block' && (
                <>
                  <div className="size-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto">
                    <Icon name="block" className="text-4xl" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Block {user.name}?</h3>
                    <p className="text-sm text-neutral-muted">They won't be able to message you or see your profile. This action can be undone in settings.</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setActiveModal(null)}>Cancel</Button>
                    <Button 
                      variant="primary" 
                      className="flex-1 bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                      onClick={() => {
                        blockUser(user.id);
                        onBack();
                      }}
                    >
                      Block
                    </Button>
                  </div>
                </>
              )}

              {activeModal === 'remove' && (
                <>
                  <div className="size-20 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mx-auto">
                    <Icon name="person_remove" className="text-4xl" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Remove Friend?</h3>
                    <p className="text-sm text-neutral-muted">Are you sure you want to remove {user.name} from your friends list?</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setActiveModal(null)}>Cancel</Button>
                    <Button 
                      variant="primary" 
                      className="flex-1" 
                      onClick={() => {
                        removeFriend(user.id);
                        setUser({ ...user, relationship: 'not_friend' });
                        setActiveModal(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              )}

              {activeModal === 'report' && (
                <>
                  <div className="size-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 mx-auto">
                    <Icon name="report" className="text-4xl" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Report {user.name}</h3>
                    <p className="text-sm text-neutral-muted">Please describe the issue you're experiencing with this user.</p>
                  </div>
                  <textarea 
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Enter reason for reporting..."
                    className="w-full h-32 p-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm font-bold resize-none"
                  />
                  <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setActiveModal(null)}>Cancel</Button>
                    <Button 
                      variant="primary" 
                      className="flex-1" 
                      disabled={!reportReason.trim()}
                      onClick={() => {
                        reportUser(user.id, reportReason);
                        setReportReason('');
                        setActiveModal(null);
                        setShowReportSuccess(true);
                        setTimeout(() => setShowReportSuccess(false), 3000);
                      }}
                    >
                      Submit
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}

        {showReportSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[120] bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold shadow-2xl flex items-center gap-3"
          >
            <Icon name="check_circle" className="text-green-400" />
            Report submitted successfully
          </motion.div>
        )}

        {showMediaGallery && (
          <MediaGallery onClose={() => setShowMediaGallery(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};
