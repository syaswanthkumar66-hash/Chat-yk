import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Icon, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { db, doc, updateDoc, deleteDoc, getDoc } from '../firebase';
import { Notification as AppNotification } from '../types';
import { registerPushNotifications } from '../services/notificationService';

interface NotificationPanelProps {
  onClose: () => void;
}

export const NotificationPanel = ({ onClose }: NotificationPanelProps) => {
  const { user, notifications, markNotificationAsRead, markAllNotificationsAsRead, clearNotifications, setActiveChatId, setMode } = useAppStore();

  const [permission, setPermission] = useState<string>('default');
  const [hasSubscription, setHasSubscription] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<string>('');
  const [dbDevicesCount, setDbDevicesCount] = useState<number>(0);
  const [localEndpoint, setLocalEndpoint] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check Notification permission
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    async function checkSub() {
      setChecking(true);
      try {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          if (registration) {
            const sub = await registration.pushManager.getSubscription();
            setHasSubscription(!!sub);
            if (sub && sub.endpoint) {
              setLocalEndpoint(sub.endpoint);
            }
          }
        }
      } catch (err) {
        console.error("Error checking push subscription inside NotificationPanel:", err);
      } finally {
        setChecking(false);
      }
    }

    checkSub();

    // Also fetch devices count from Firestore
    if (db && user?.id) {
      const docRef = doc(db, 'pushSubscriptions', user.id);
      getDoc(docRef).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && Array.isArray(data.subscriptions)) {
            setDbDevicesCount(data.subscriptions.length);
          } else if (data && data.endpoint) {
            setDbDevicesCount(1);
          } else {
            setDbDevicesCount(0);
          }
        } else {
          setDbDevicesCount(0);
        }
      }).catch((err) => {
        console.error("Failed to fetch devices count from DB in NotificationPanel:", err);
      });
    }
  }, [user?.id]);

  const handleSubscribe = async () => {
    if (!user?.id) return;
    setSubscribing(true);
    setTestStatus('');
    try {
      const result = await registerPushNotifications(user.id, true);
      if (result.success) {
        setHasSubscription(true);
        if (result.subscription && result.subscription.endpoint) {
          setLocalEndpoint(result.subscription.endpoint);
        }
        if ('Notification' in window) {
          setPermission(Notification.permission);
        }
        // Increment or refresh device count
        if (db) {
          const snap = await getDoc(doc(db, 'pushSubscriptions', user.id));
          if (snap.exists()) {
            const data = snap.data();
            if (data && Array.isArray(data.subscriptions)) {
              setDbDevicesCount(data.subscriptions.length);
            }
          }
        }
        setTestStatus('Successfully subscribed and synced this browser!');
      } else {
        setTestStatus(`Subscription failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setTestStatus(`Error subscribing: ${err.message || err}`);
    } finally {
      setSubscribing(false);
    }
  };

  const handleTestPush = async () => {
    if (!user?.id) return;
    setTestStatus('Sending test push to your registered devices...');
    try {
      const res = await fetch('/api/send-test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          title: '🔧 VAPID Push Verified',
          body: 'Success! Your browser push subscription is fully operational and authenticated!'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestStatus(`Test push dispatched successfully across ${data.details?.sentCount || 0} active device(s)!`);
      } else {
        setTestStatus(`Verification failed: ${data.error || res.statusText}. ${data.warning || ''}`);
      }
    } catch (err: any) {
      setTestStatus(`Network error: ${err.message || err}`);
    }
  };

  const unreadNotifications = notifications.filter(n => n.status !== 'read');
  const hasUnread = unreadNotifications.length > 0;

  const handleNotificationClick = async (notif: AppNotification) => {
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

  const getIconAndColor = (type: AppNotification['type']) => {
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
        {/* VAPID Web Push Subscription Control Centre */}
        <div className="mb-4 p-4 rounded-2xl bg-primary/[0.03] border border-primary/10 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="rss_feed" className="text-primary text-base" />
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-800">Browser Web Push Status</h3>
            </div>
            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">VAPID Secure</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-[10px]">
            <div className="bg-white p-2 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">Permission</span>
              <span className={cn("font-black uppercase tracking-wider",
                permission === 'granted' ? "text-emerald-600" : permission === 'denied' ? "text-red-600" : "text-amber-500"
              )}>
                {permission}
              </span>
            </div>

            <div className="bg-white p-2 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">Active Devices</span>
              <span className="font-black text-slate-800 font-mono">
                {checking ? '...' : dbDevicesCount}
              </span>
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1 text-[9px]">
            <div className="flex items-center justify-between font-bold">
              <span className="text-slate-400 uppercase tracking-widest text-[8px]">This Browser Registration</span>
              {checking ? (
                <span className="text-slate-400 font-mono">Checking...</span>
              ) : hasSubscription ? (
                <span className="text-emerald-600 font-black flex items-center gap-1 uppercase">
                  <Icon name="check_circle" className="text-[10px]" /> Subscribed
                </span>
              ) : (
                <span className="text-amber-500 font-black flex items-center gap-1 uppercase">
                  <Icon name="warning" className="text-[10px]" /> Unregistered
                </span>
              )}
            </div>
            {localEndpoint && (
              <span className="text-[8px] font-mono text-slate-400 truncate w-full mt-0.5" title={localEndpoint}>
                Endpoint: ...{localEndpoint.slice(-25)}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="flex-1 py-2 rounded-xl bg-primary text-white hover:bg-primary-dark transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <Icon name="sync" className={cn("text-xs", subscribing && "animate-spin")} />
              {subscribing ? 'Syncing...' : hasSubscription ? 'Re-Sync Subscription' : 'Register / Subscribe'}
            </button>
            
            {hasSubscription && (
              <button
                onClick={handleTestPush}
                className="py-2 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                title="Send a test Push to this browser"
              >
                <Icon name="send" className="text-xs text-primary" />
                Verify Route
              </button>
            )}
          </div>

          {testStatus && (
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-600 bg-slate-100 p-2 rounded-lg border border-slate-200 break-words leading-relaxed animate-fade-in">
              {testStatus}
            </p>
          )}
        </div>

        <AnimatePresence initial={false}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center p-8 space-y-4">
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
