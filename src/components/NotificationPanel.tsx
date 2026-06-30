import { useAppStore } from '../store';
import { Icon } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { db, doc, updateDoc, deleteDoc } from '../firebase';
import { Notification } from '../types';

interface NotificationPanelProps {
  onClose: () => void;
}

export const NotificationPanel = ({ onClose }: NotificationPanelProps) => {
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead, clearNotifications, setActiveChatId, setMode } = useAppStore();

  const unreadNotifications = notifications.filter(n => n.status !== 'read');
  const hasUnread = unreadNotifications.length > 0;

  const handleNotificationClick = async (notif: Notification) => {
    // 1. Mark as read
    if (notif.status !== 'read') {
      await markNotificationAsRead(notif.id);
    }

    // 2. Route/navigate based on type
    if (notif.type === 'message' || notif.type === 'mention') {
      if (notif.chatId) {
        setActiveChatId(notif.chatId);
      }
    } else if (notif.type === 'friend_request') {
      // Switch tab/mode to friends
      setMode('social');
      // Set active tab to friends if we can find a way, otherwise just having mode 'social' is great
    }

    onClose();
  };

  const getIconAndColor = (type: Notification['type']) => {
    switch (type) {
      case 'message':
        return { icon: 'chat_bubble', bg: 'bg-primary/10 text-primary' };
      case 'mention':
        return { icon: 'alternate_email', bg: 'bg-amber-100 text-amber-600' };
      case 'friend_request':
        return { icon: 'person_add', bg: 'bg-emerald-100 text-emerald-600' };
      case 'system_alert':
      default:
        return { icon: 'info', bg: 'bg-slate-100 text-slate-600' };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute inset-0 bg-white z-[35] flex flex-col h-full border-r border-primary/10"
    >
      {/* Panel Header */}
      <div className="p-6 border-b border-primary/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="size-9 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-500 transition-all active:scale-95"
            aria-label="Back"
          >
            <Icon name="arrow_back" className="text-xl" />
          </button>
          <h2 className="text-lg font-black tracking-tight uppercase italic text-slate-900 flex items-center gap-2">
            Notifications
            {hasUnread && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold normal-case not-italic">
                {unreadNotifications.length}
              </span>
            )}
          </h2>
        </div>

        <div className="flex gap-2">
          {hasUnread && (
            <button
              onClick={() => markAllNotificationsAsRead()}
              className="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-100 transition-all"
              title="Mark all as read"
            >
              Read All
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => clearNotifications()}
              className="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-red-50 hover:bg-red-500 hover:text-white text-red-500 border border-red-100 transition-all"
              title="Clear all history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence initial={false}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
              <div className="size-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-300 border border-dashed border-slate-200">
                <Icon name="notifications_none" className="text-3xl" />
              </div>
              <div>
                <p className="text-slate-900 font-bold text-sm">All caught up!</p>
                <p className="text-xs text-slate-400 mt-1">No new system or chat alerts at this time.</p>
              </div>
            </div>
          ) : (
            notifications.map((notif) => {
              const { icon, bg } = getIconAndColor(notif.type);
              const isUnread = notif.status !== 'read';

              return (
                <motion.div
                  key={notif.id}
                  layoutId={`notif-card-${notif.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`group relative p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    isUnread
                      ? 'bg-primary/[0.02] border-primary/10 hover:border-primary/20 shadow-sm'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  {/* Left Icon or Avatar */}
                  <div className="relative flex-shrink-0">
                    {notif.senderAvatar ? (
                      <div className="size-10 rounded-xl overflow-hidden border border-slate-100">
                        <img
                          src={notif.senderAvatar}
                          className="size-full object-cover"
                          alt="Sender"
                        />
                      </div>
                    ) : (
                      <div className={`size-10 rounded-xl flex items-center justify-center ${bg}`}>
                        <Icon name={icon} className="text-lg" />
                      </div>
                    )}
                    {isUnread && (
                      <span className="absolute -top-1 -right-1 size-3 rounded-full bg-primary border-2 border-white" />
                    )}
                  </div>

                  {/* Body Column */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-xs truncate ${isUnread ? 'font-black text-slate-900' : 'font-medium text-slate-700'}`}>
                        {notif.title}
                      </p>
                      <span className="text-[9px] text-slate-400 flex-shrink-0 font-mono">
                        {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 leading-normal ${isUnread ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                      {notif.body}
                    </p>
                  </div>

                  {/* Individual Action Buttons (Hidden by default, shown on hover) */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isUnread && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await markNotificationAsRead(notif.id);
                        }}
                        className="size-7 rounded-lg bg-slate-100 hover:bg-primary hover:text-white flex items-center justify-center text-slate-500 transition-all"
                        title="Mark as read"
                      >
                        <Icon name="check" className="text-sm" />
                      </button>
                    )}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        // Call native firestore delete
                        try {
                          await deleteDoc(doc(db, 'notifications', notif.id));
                        } catch (err) {
                          console.error("Failed to delete notification doc:", err);
                        }
                      }}
                      className="size-7 rounded-lg bg-slate-100 hover:bg-red-500 hover:text-white flex items-center justify-center text-slate-500 transition-all"
                      title="Delete"
                    >
                      <Icon name="delete" className="text-sm" />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
