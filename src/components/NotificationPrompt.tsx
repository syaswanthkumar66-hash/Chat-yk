import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Card } from './UI';
import { useAppStore } from '../store';

export function NotificationPrompt() {
  const [status, setStatus] = useState<'hidden' | 'request' | 'success'>('hidden');
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    
    // Only show if logged in and permission is 'default' (not yet allowed or denied)
    if (user && Notification.permission === 'default') {
      const dismissed = localStorage.getItem('notification_prompt_dismissed');
      if (!dismissed) {
        // Show after a short delay for a more natural entry
        const timer = setTimeout(() => {
          setStatus('request');
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const handleAllow = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setStatus('success');
        
        // Play the chime sound to verify
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {
          console.warn('Audio play failed:', e);
        }

        // Show a standard system notification
        new Notification("Notifications Enabled!", {
          body: "Thank you for allowing notifications! You will now receive alerts for new messages.",
          icon: "https://picsum.photos/seed/chat/200"
        });

        // Trigger push notifications registration in the service worker/backend
        import('../services/notificationService').then(({ registerPushNotifications }) => {
          if (user) {
            registerPushNotifications(user.id);
          }
        }).catch(console.error);

        // Auto-dismiss the thank you banner after 5 seconds
        setTimeout(() => {
          setStatus('hidden');
        }, 5000);
      } else {
        setStatus('hidden');
      }
    } catch (err) {
      console.error("Error requesting permission:", err);
      setStatus('hidden');
    }
  };

  const handleDismiss = () => {
    setStatus('hidden');
    localStorage.setItem('notification_prompt_dismissed', 'true');
  };

  const triggerTestNotification = async () => {
    if (typeof window === 'undefined') return;
    
    // Play sound
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn('Audio play failed:', e);
    }

    const title = "🔔 System Test Alert";
    const body = "This is a real-time notification test! Notification delivery is operational.";
    const avatar = "https://picsum.photos/seed/test/200";

    // Standard desktop alert
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: avatar,
          tag: 'test-notification',
          renotify: true
        } as any);
      } catch (e) {
        console.warn('System Notification failed:', e);
      }
    }

    // Trigger a real backend VAPID push notification
    if (user) {
      try {
        console.log("Triggering real server-side VAPID web push notification for user:", user.id);
        const res = await fetch('/api/send-test-push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: user.id,
            title: "🔔 Real VAPID Push Alert",
            body: "Amazing! This notification is dispatched securely using VAPID keys directly from our backend server!"
          })
        });
        if (!res.ok) {
          console.warn("Backend failed to deliver VAPID test push:", await res.text());
        } else {
          console.log("Real VAPID test push request successfully queued!");
        }
      } catch (err) {
        console.error("Failed to request server VAPID push:", err);
      }
    }

    // In-app toast backup
    const addInAppToast = useAppStore.getState().addInAppToast;
    addInAppToast({
      title,
      body,
      avatar,
      chatId: 'system-test'
    });
  };

  // Expose test function globally so it can be called from Settings or elsewhere
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).triggerTestNotification = triggerTestNotification;
      (window as any).showNotificationPrompt = () => setStatus('request');
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).triggerTestNotification;
        delete (window as any).showNotificationPrompt;
      }
    };
  }, []);

  return (
    <AnimatePresence>
      {status !== 'hidden' && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="fixed bottom-6 right-6 left-6 md:left-auto md:w-[380px] z-[500] pointer-events-auto"
        >
          <Card className="border border-primary/20 shadow-2xl p-6 bg-white/95 backdrop-blur-md relative overflow-hidden">
            {/* Header Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-[#FF6B6B] to-primary" />
            
            {status === 'request' && (
              <div className="space-y-4 pt-1">
                <div className="flex items-start gap-3">
                  <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 animate-bounce">
                    <Icon name="notifications_active" className="text-2xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-wider italic">
                      Enable Alerts?
                    </h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                      Never miss important group updates, friend messages, or direct mentions. Stay instantly connected!
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    Not Now
                  </button>
                  <button
                    onClick={handleAllow}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white shadow-lg shadow-primary/25 hover:brightness-105 text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    Allow
                  </button>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-3 py-2 text-center flex flex-col items-center">
                <div className="size-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-1 animate-pulse">
                  <Icon name="check_circle" className="text-3xl" />
                </div>
                <h4 className="font-black text-emerald-600 text-sm uppercase tracking-wider italic">
                  Notification Allowed
                </h4>
                <p className="text-xs text-slate-600 font-bold max-w-[280px] leading-relaxed">
                  Thank you for enabling notifications! 🎉
                </p>
                <button
                  onClick={triggerTestNotification}
                  className="mt-2 text-[10px] text-primary hover:underline font-extrabold uppercase tracking-widest flex items-center gap-1"
                >
                  <Icon name="send" className="text-xs" /> Try a Test Alert
                </button>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
