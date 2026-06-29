import React, { useState, useRef } from 'react';
import { useAppStore } from '../store';
import { Icon, Avatar, Button, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { registerPushNotifications } from '../services/notificationService';

const PRELOADED_AVATARS = [
  'https://picsum.photos/seed/avatar1/200',
  'https://picsum.photos/seed/avatar2/200',
  'https://picsum.photos/seed/avatar3/200',
  'https://picsum.photos/seed/avatar4/200',
  'https://picsum.photos/seed/avatar5/200',
  'https://picsum.photos/seed/avatar6/200',
];

export const Settings = ({ onClose }: { onClose: () => void }) => {
  const { 
    user, 
    updateUser, 
    blockedUserIds, 
    unblockUser, 
    removedFriendIds, 
    restoreFriend,
    tickets,
    addTicket,
    feedback,
    addFeedback,
    logout,
    users,
    wssStatus,
    wssMessage,
    connectionLogs,
    connectSpot,
    disconnectSpot
  } = useAppStore();
  const [activeView, setActiveView] = useState<'main' | 'notifications' | 'privacy' | 'visibility' | 'ticket' | 'help' | 'feedback' | 'blocked' | 'removed' | 'ticket-history' | 'feedback-history' | 'connection'>('main');
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [description, setDescription] = useState(user?.description || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Diagnostic state for Web Push Notifications (VAPID)
  const [subCopied, setSubCopied] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission;
    hasServiceWorker: boolean;
    hasSubscription: boolean;
    subscriptionEndpoint: string;
    rawSubscriptionString: string;
    loading: boolean;
    registrationError: string;
  }>({
    supported: false,
    permission: 'default',
    hasServiceWorker: false,
    hasSubscription: false,
    subscriptionEndpoint: '',
    rawSubscriptionString: '',
    loading: true,
    registrationError: ''
  });

  const checkSubscriptionStatus = async () => {
    if (typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    const permission = 'Notification' in window ? Notification.permission : 'default';
    
    let hasServiceWorker = false;
    let hasSubscription = false;
    let subscriptionEndpoint = '';
    let rawSubscriptionString = '';

    if (supported) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const swReg = registrations.find(reg => reg.active && reg.active.scriptURL.includes('sw.js')) || registrations[0];
        
        if (swReg) {
          hasServiceWorker = true;
          const subscription = await swReg.pushManager.getSubscription();
          if (subscription) {
            hasSubscription = true;
            subscriptionEndpoint = subscription.endpoint;
            rawSubscriptionString = JSON.stringify(subscription, null, 2);
          }
        }
      } catch (e: any) {
        console.warn("Notice checking push subscription status:", e);
      }
    }

    setPushStatus(prev => ({
      ...prev,
      supported,
      permission,
      hasServiceWorker,
      hasSubscription,
      subscriptionEndpoint,
      rawSubscriptionString,
      loading: false
    }));

    // Auto-subscribe if we are in a top-level tab (outside iframe), permission is granted, but we don't have a subscription yet
    if (supported && permission === 'granted' && !hasSubscription && window.self === window.top && user) {
      console.log("Detecting top-level window with granted permissions but no subscription. Registering push silently...");
      try {
        const result = await registerPushNotifications(user.id);
        if (result && result.success && result.subscription) {
          setPushStatus(prev => ({
            ...prev,
            hasSubscription: true,
            subscriptionEndpoint: result.subscription!.endpoint,
            rawSubscriptionString: JSON.stringify(result.subscription, null, 2),
            registrationError: ''
          }));
        } else if (result && !result.success) {
          setPushStatus(prev => ({
            ...prev,
            registrationError: result.error || 'Failed auto-registration'
          }));
        }
      } catch (error: any) {
        console.warn("Auto-registration alert:", error);
      }
    }
  };

  React.useEffect(() => {
    if (activeView === 'notifications') {
      checkSubscriptionStatus();
    }
  }, [activeView]);

  const [ticketCategory, setTicketCategory] = useState('Technical Issue');
  const [ticketDesc, setTicketDesc] = useState('');
  const [feedbackEmoji, setFeedbackEmoji] = useState('😊');
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState('');

  const [showSuccessModal, setShowSuccessModal] = useState<{ title: string, message: string } | null>(null);

  const handleSave = () => {
    updateUser({ displayName, description });
    setIsEditing(false);
  };

  const handleAvatarSelect = (url: string) => {
    updateUser({ avatar: url });
    setShowAvatarPicker(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      updateUser({ avatar: url });
      setShowAvatarPicker(false);
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'notifications':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Notifications</h3>
            </header>
            <div className="space-y-4">
              {[
                { key: 'pushEnabled', label: 'Push Notifications', desc: 'Receive alerts on your device' },
                { key: 'previewEnabled', label: 'Message Preview', desc: 'Show message text in notifications' },
                { key: 'soundEnabled', label: 'Sound', desc: 'Play sound for new messages' },
                { key: 'vibrateEnabled', label: 'Vibrate', desc: 'Vibrate on new messages' },
              ].map((item) => {
                const settings = user?.notificationSettings || {
                  pushEnabled: true,
                  previewEnabled: true,
                  soundEnabled: false,
                  vibrateEnabled: true
                };
                const isEnabled = settings[item.key as keyof typeof settings];
                
                return (
                  <div key={item.key} className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{item.label}</span>
                      <span className="text-[10px] text-neutral-muted">{item.desc}</span>
                    </div>
                    <div 
                      onClick={() => {
                        updateUser({
                          notificationSettings: {
                            ...settings,
                            [item.key]: !isEnabled
                          }
                        });
                      }}
                      className={cn(
                        "w-12 h-6 rounded-full p-1 transition-all cursor-pointer",
                        isEnabled ? 'bg-primary' : 'bg-slate-300'
                      )}
                    >
                      <motion.div 
                        animate={{ x: isEnabled ? 24 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className="size-4 bg-white rounded-full shadow-sm" 
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Notification Testing & Diagnostics */}
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">
                Diagnostics & Live VAPID Status
              </h4>

              {/* IFrame Warning Banner */}
              {typeof window !== 'undefined' && window.self !== window.top && (
                <div className="p-4 bg-amber-50 border border-amber-200/60 rounded-2xl flex items-start gap-3">
                  <div className="size-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
                    <Icon name="open_in_new" className="text-lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-black text-amber-800 uppercase tracking-wider">Iframe Restriction Detected</h5>
                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed mt-1">
                      Browsers block Service Workers and Web Push registrations inside interactive iframe previews. 
                      Please open this application in a <b>New Tab</b> using the button in the top right to enable and test real-time native browser alerts!
                    </p>
                  </div>
                </div>
              )}

              {/* Status Table */}
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Browser Push Support:</span>
                  <span className={cn("font-black uppercase tracking-wider", pushStatus.supported ? "text-emerald-600" : "text-rose-500")}>
                    {pushStatus.supported ? "Supported ✓" : "Unsupported ✗"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>OS/Browser Permission:</span>
                  <span className={cn("font-black uppercase tracking-wider", 
                    pushStatus.permission === 'granted' ? "text-emerald-600" : 
                    pushStatus.permission === 'denied' ? "text-rose-500" : "text-amber-500"
                  )}>
                    {pushStatus.permission}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Service Worker Status:</span>
                  <span className={cn("font-black uppercase tracking-wider", pushStatus.hasServiceWorker ? "text-emerald-600" : "text-amber-500")}>
                    {pushStatus.hasServiceWorker ? "Registered (/sw.js)" : "Not Detected"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Push Subscription:</span>
                  <span className={cn("font-black uppercase tracking-wider", pushStatus.hasSubscription ? "text-emerald-600" : "text-rose-500 animate-pulse")}>
                    {pushStatus.hasSubscription ? "Active & Synced" : "Not Subscribed"}
                  </span>
                </div>

                {pushStatus.hasSubscription && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Raw Subscription JSON:
                      </span>
                      <button
                        onClick={async () => {
                          const str = pushStatus.rawSubscriptionString || JSON.stringify({ endpoint: pushStatus.subscriptionEndpoint }, null, 2);
                          await navigator.clipboard.writeText(str);
                          setSubCopied(true);
                          setTimeout(() => setSubCopied(false), 2000);
                        }}
                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 uppercase tracking-wider"
                      >
                        <Icon name={subCopied ? "check" : "content_copy"} className="text-xs" />
                        {subCopied ? "Copied!" : "Copy JSON"}
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-900 rounded-xl overflow-x-auto text-[10px] font-mono text-slate-300 max-h-48 overflow-y-auto leading-relaxed max-w-full select-all">
                      {pushStatus.rawSubscriptionString || JSON.stringify({ endpoint: pushStatus.subscriptionEndpoint }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Registration Error Display */}
              {pushStatus.registrationError && (
                <div className="p-4 bg-rose-50 border border-rose-200/60 rounded-2xl flex items-start gap-3">
                  <div className="size-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 flex-shrink-0">
                    <Icon name="error" className="text-lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-black text-rose-800 uppercase tracking-wider">Subscription Error</h5>
                    <p className="text-[10px] text-rose-600 font-bold leading-relaxed mt-1">
                      {pushStatus.registrationError}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    if (user) {
                      try {
                        setPushStatus(prev => ({ ...prev, loading: true, registrationError: '' }));
                        const result = await registerPushNotifications(user.id, true);
                        if (result && !result.success) {
                          setPushStatus(prev => ({ 
                            ...prev, 
                            registrationError: result.error || 'Failed to register subscription'
                          }));
                        }
                      } catch (err: any) {
                        setPushStatus(prev => ({ 
                          ...prev, 
                          registrationError: err.message || 'An unexpected error occurred during subscription'
                        }));
                      } finally {
                        await checkSubscriptionStatus();
                      }
                    }
                  }}
                  className="w-full p-4 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest italic rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/10 hover:bg-emerald-700 active:scale-98 transition-all"
                >
                  <Icon name="sync" /> Force Generate VAPID Subscription
                </button>

                <button
                  onClick={() => {
                    if (typeof window !== 'undefined' && (window as any).triggerTestNotification) {
                      (window as any).triggerTestNotification();
                    }
                  }}
                  className="w-full p-4 bg-primary text-white font-black text-xs uppercase tracking-widest italic rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-primary/10 hover:brightness-105 active:scale-98 transition-all"
                >
                  <Icon name="notifications_active" /> Send Live Test Push (Server + UI)
                </button>
                
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined' && (window as any).showNotificationPrompt) {
                      (window as any).showNotificationPrompt();
                    }
                  }}
                  className="w-full p-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-widest italic rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition-all"
                >
                  <Icon name="restart_alt" /> Reset & Show Request Banner
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-center leading-normal mt-2 px-4">
                Note: Web Push Notifications depend on secure browser subscriptions. Click <b>Force Generate VAPID Subscription</b> above to manually establish a fresh web push endpoint.
              </p>
            </div>
          </div>
        );
      case 'privacy':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Privacy & Security</h3>
            </header>
            <div className="space-y-4">
              <button 
                onClick={() => setActiveView('visibility')}
                className="w-full p-4 bg-primary/5 rounded-2xl flex items-center justify-between group border border-primary/5"
              >
                <div className="flex items-center gap-3">
                  <Icon name="visibility" className="text-slate-400 group-hover:text-primary" />
                  <span className="text-sm font-bold text-slate-700">Who can see my profile</span>
                </div>
                <span className="text-xs text-primary font-bold capitalize">{user?.profileVisibility || 'everyone'}</span>
              </button>
              <button 
                onClick={() => setActiveView('blocked')}
                className="w-full p-4 bg-primary/5 rounded-2xl flex items-center justify-between group border border-primary/5"
              >
                <div className="flex items-center gap-3">
                  <Icon name="block" className="text-slate-400 group-hover:text-red-500" />
                  <span className="text-sm font-bold text-slate-700">Blocked Users</span>
                </div>
                <span className="text-xs text-neutral-muted font-bold">{blockedUserIds.length} users</span>
              </button>
              <button 
                onClick={() => setActiveView('removed')}
                className="w-full p-4 bg-primary/5 rounded-2xl flex items-center justify-between group border border-primary/5"
              >
                <div className="flex items-center gap-3">
                  <Icon name="person_remove" className="text-slate-400 group-hover:text-amber-500" />
                  <span className="text-sm font-bold text-slate-700">Removed Friends</span>
                </div>
                <span className="text-xs text-neutral-muted font-bold">{removedFriendIds.length} users</span>
              </button>
            </div>
          </div>
        );
      case 'visibility':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('privacy')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Profile Visibility</h3>
            </header>
            <div className="space-y-3">
              {[
                { id: 'everyone', label: 'Everyone', desc: 'Anyone can see your profile and posts' },
                { id: 'friends', label: 'Friends Only', desc: 'Only your confirmed friends can see your profile' },
                { id: 'none', label: 'No One', desc: 'Your profile is hidden from everyone' }
              ].map((option) => (
                <button 
                  key={option.id}
                  onClick={() => {
                    updateUser({ profileVisibility: option.id as any });
                    setActiveView('privacy');
                  }}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between border transition-all",
                    user?.profileVisibility === option.id 
                      ? "bg-primary/10 border-primary shadow-sm" 
                      : "bg-primary/5 border-transparent hover:bg-primary/10"
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className={cn("text-sm font-bold", user?.profileVisibility === option.id ? "text-primary" : "text-slate-700")}>
                      {option.label}
                    </span>
                    <span className="text-[10px] text-neutral-muted">{option.desc}</span>
                  </div>
                  {user?.profileVisibility === option.id && (
                    <Icon name="check_circle" className="text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      case 'ticket':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Raise a Ticket</h3>
            </header>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Issue Category</label>
                <select 
                  className="w-full bg-primary/5 border-none rounded-xl px-4 py-3 text-sm outline-none"
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                >
                  <option>Technical Issue</option>
                  <option>Account Access</option>
                  <option>Privacy Concern</option>
                  <option>Billing/Payment</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Description</label>
                <textarea 
                  placeholder="Tell us more about the issue..."
                  className="w-full bg-primary/5 border-none rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  rows={4}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                disabled={!ticketDesc.trim()}
                onClick={() => {
                  if (user) {
                    addTicket({ 
                      userId: user.id,
                      category: ticketCategory, 
                      description: ticketDesc 
                    });
                    setShowSuccessModal({
                      title: 'Ticket Submitted',
                      message: 'Your ticket has been submitted successfully! Our support team will get back to you soon.'
                    });
                    setTicketDesc('');
                    setActiveView('main');
                  }
                }}
              >Submit Ticket</Button>
              <Button variant="outline" className="w-full" onClick={() => setActiveView('ticket-history')}>View My Tickets ({tickets.filter(t => t.userId === user?.id).length})</Button>
            </div>
          </div>
        );
      case 'ticket-history':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button 
                onClick={() => {
                  if (selectedTicketId) setSelectedTicketId(null);
                  else setActiveView('ticket');
                }} 
                className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all"
              >
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">
                {selectedTicketId ? 'Ticket Details' : 'My Tickets'}
              </h3>
            </header>
            
            {selectedTicketId ? (
              (() => {
                const ticket = tickets.find(t => t.id === selectedTicketId);
                if (!ticket) return null;
                return (
                  <div className="space-y-6">
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{ticket.category}</span>
                        <span className={cn(
                          "text-[8px] font-black uppercase px-2 py-0.5 rounded-full",
                          ticket.status === 'open' ? "bg-amber-100 text-amber-600" : 
                          ticket.status === 'in-progress' ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
                        )}>{ticket.status}</span>
                      </div>
                      <p className="text-sm text-slate-700">{ticket.description}</p>
                      <p className="text-[8px] text-neutral-muted uppercase tracking-widest">{ticket.timestamp}</p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Conversation</h4>
                      <div className="space-y-3 max-h-60 overflow-y-auto no-scrollbar p-1">
                        {ticket.messages && ticket.messages.length > 0 ? (
                          ticket.messages.map((msg) => (
                            <div key={msg.id} className={cn(
                              "p-3 rounded-2xl text-xs max-w-[85%]",
                              msg.isAdmin ? "bg-white border border-slate-100 mr-auto" : "bg-primary text-white ml-auto"
                            )}>
                              <div className="flex justify-between items-center mb-1 gap-4">
                                <span className={cn("font-bold text-[8px] uppercase tracking-widest", msg.isAdmin ? "text-primary" : "text-white/80")}>
                                  {msg.isAdmin ? 'Support Team' : 'You'}
                                </span>
                                <span className={cn("text-[8px]", msg.isAdmin ? "text-neutral-muted" : "text-white/60")}>{msg.timestamp}</span>
                              </div>
                              <p>{msg.text}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-center py-4 text-[10px] text-neutral-muted uppercase tracking-widest">No messages yet</p>
                        )}
                      </div>

                      <div className="pt-4 space-y-3">
                        <textarea 
                          placeholder="Reply to support..."
                          className="w-full bg-primary/5 border-none rounded-xl px-4 py-3 text-sm outline-none resize-none"
                          rows={3}
                          value={ticketReply}
                          onChange={(e) => setTicketReply(e.target.value)}
                        />
                        <Button 
                          className="w-full" 
                          disabled={!ticketReply.trim()}
                          onClick={() => {
                            useAppStore.getState().sendTicketMessage(ticket.id, ticketReply, false);
                            setTicketReply('');
                          }}
                        >Send Reply</Button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="space-y-4">
                {tickets.filter(t => t.userId === user?.id).length === 0 ? (
                  <div className="text-center py-12 text-neutral-muted">No tickets submitted yet.</div>
                ) : (
                  tickets.filter(t => t.userId === user?.id).map(t => (
                    <button 
                      key={t.id} 
                      onClick={() => setSelectedTicketId(t.id)}
                      className="w-full text-left p-4 bg-primary/5 rounded-2xl border border-primary/5 space-y-2 hover:bg-primary/10 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{t.category}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[8px] font-black uppercase px-2 py-0.5 rounded-full",
                            t.status === 'open' ? "bg-amber-100 text-amber-600" : 
                            t.status === 'in-progress' ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
                          )}>{t.status}</span>
                          <Icon name="chevron_right" className="text-slate-400 group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 truncate">{t.description}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-[8px] text-neutral-muted uppercase tracking-widest">{t.timestamp}</p>
                        {t.messages && t.messages.length > 0 && (
                          <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
                            <Icon name="chat" className="text-[10px]" /> {t.messages.length} messages
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      case 'help':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Help Center</h3>
            </header>
            <div className="space-y-4">
              {[
                { q: 'How do I add a friend?', a: 'Go to the friends tab and scan their QR code or search for their username.' },
                { q: 'Can I delete a message?', a: 'Yes, long press on any message you sent to see the delete option.' },
                { q: 'Is my data secure?', a: 'We use end-to-end encryption for all your private conversations.' },
              ].map((faq) => (
                <div key={`faq-${faq.q}`} className="p-4 bg-primary/5 rounded-2xl space-y-2 border border-primary/5">
                  <p className="text-sm font-bold text-slate-800">{faq.q}</p>
                  <p className="text-xs text-neutral-muted">{faq.a}</p>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => setActiveView('ticket')}>Still need help? Contact Support</Button>
            </div>
          </div>
        );
      case 'feedback':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Feedback</h3>
            </header>
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Icon name="rate_review" className="text-4xl" />
              </div>
              <div className="text-center space-y-2">
                <h4 className="font-bold text-slate-800">How are we doing?</h4>
                <p className="text-xs text-neutral-muted">Your feedback helps us make Connect & Share better for everyone.</p>
              </div>
              <div className="flex gap-2">
                {['😞', '😐', '😊', '😍'].map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => setFeedbackEmoji(emoji)}
                    className={cn(
                      "size-12 rounded-2xl flex items-center justify-center text-2xl transition-all",
                      feedbackEmoji === emoji ? "bg-primary text-white scale-110 shadow-lg shadow-primary/20" : "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <textarea 
                placeholder="Any specific suggestions?"
                className="w-full bg-primary/5 border-none rounded-xl px-4 py-3 text-sm outline-none resize-none"
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />
              <Button 
                className="w-full" 
                disabled={!feedbackText.trim()}
                onClick={() => {
                  addFeedback({ emoji: feedbackEmoji, text: feedbackText });
                  setShowSuccessModal({
                    title: 'Feedback Received',
                    message: 'Thank you for your feedback! We appreciate your input to help us improve.'
                  });
                  setFeedbackText('');
                  setActiveView('main');
                }}
              >Send Feedback</Button>
              <Button variant="outline" className="w-full" onClick={() => setActiveView('feedback-history')}>View Past Feedback ({feedback.filter(f => f.userId === user?.id).length})</Button>
            </div>
          </div>
        );
      case 'feedback-history':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('feedback')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Feedback History</h3>
            </header>
            <div className="space-y-4">
              {feedback.filter(f => f.userId === user?.id).length === 0 ? (
                <div className="text-center py-12 text-neutral-muted">No feedback sent yet.</div>
              ) : (
                feedback.filter(f => f.userId === user?.id).map(f => (
                  <div key={f.id} className="p-4 bg-primary/5 rounded-2xl border border-primary/5 flex items-start gap-4">
                    <span className="text-2xl">{f.emoji}</span>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm text-slate-700">{f.text}</p>
                      <p className="text-[8px] text-neutral-muted uppercase tracking-widest">{f.timestamp}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'blocked':
        const blockedUsers = users.filter(u => blockedUserIds.includes(u.id));
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('privacy')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Blocked Users</h3>
            </header>
            <div className="space-y-4">
              {blockedUsers.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                   <div className="size-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mx-auto">
                     <Icon name="block" className="text-4xl" />
                   </div>
                   <p className="text-sm text-neutral-muted">No blocked users</p>
                </div>
              ) : (
                blockedUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatar} className="size-10" />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{u.displayName}</span>
                        <span className="text-[10px] text-neutral-muted">{u.username}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => unblockUser(u.id)}
                      className="px-4 py-2 bg-white text-primary text-[10px] font-black uppercase tracking-widest rounded-xl border border-primary/10 hover:bg-primary hover:text-white transition-all shadow-sm"
                    >
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'removed':
        const removedFriends = users.filter(u => removedFriendIds.includes(u.id));
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveView('privacy')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <h3 className="text-xl font-bold text-slate-800 italic uppercase tracking-tight">Removed Friends</h3>
            </header>
            <div className="space-y-4">
              {removedFriends.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                   <div className="size-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mx-auto">
                     <Icon name="person_remove" className="text-4xl" />
                   </div>
                   <p className="text-sm text-neutral-muted">No removed friends</p>
                </div>
              ) : (
                removedFriends.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatar} className="size-10" />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{u.displayName}</span>
                        <span className="text-[10px] text-neutral-muted">{u.username}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => restoreFriend(u.id)}
                      className="px-4 py-2 bg-white text-primary text-[10px] font-black uppercase tracking-widest rounded-xl border border-primary/10 hover:bg-primary hover:text-white transition-all shadow-sm"
                    >
                      Add Back
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'connection':
        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-4">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <div className="flex flex-col">
                <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">Backend Connection</h3>
                <span className="text-[10px] text-neutral-muted uppercase font-bold tracking-widest">Heartbeat & Status Logs</span>
              </div>
            </header>

            {/* Connection Status Card */}
            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-muted font-bold uppercase tracking-wider">Protocol Status</span>
                  <span className="text-lg font-black uppercase tracking-tight text-slate-800 mt-0.5">
                    {wssStatus === 'connected' ? '⚡ Connected & Live' : wssStatus === 'connecting' ? '⏳ Connecting...' : '💤 Disconnected'}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  wssStatus === 'connected' 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : wssStatus === 'connecting'
                    ? 'bg-amber-100 text-amber-800 animate-pulse'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {wssStatus}
                </div>
              </div>

              {wssMessage && (
                <div className="text-xs bg-white/60 p-2.5 rounded-xl border border-primary/5 flex items-center gap-2">
                  <span className="animate-ping size-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-slate-600 font-medium">{wssMessage}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {wssStatus !== 'connected' ? (
                  <Button 
                    variant="primary" 
                    className="flex-1" 
                    onClick={() => connectSpot()}
                  >
                    <Icon name="bolt" className="text-sm mr-1.5" />
                    Go Live / Wake Up
                  </Button>
                ) : (
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 border-none" 
                    onClick={() => disconnectSpot()}
                  >
                    <Icon name="power_settings_new" className="text-sm mr-1.5" />
                    Disconnect Spot
                  </Button>
                )}
              </div>
            </div>

            {/* Heartbeat Status */}
            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-700 font-bold">Automatic Heartbeat Keep-Alive</span>
                  <span className="text-[10px] text-neutral-muted">Pings backend every 30s to bypass free-tier sleep cycles</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`size-2.5 rounded-full ${wssStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className="text-[10px] font-black uppercase text-slate-500">Active</span>
                </div>
              </div>
            </div>

            {/* Connection Logs console */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">Diagnostics Log Console</span>
                <button 
                  onClick={() => {
                    useAppStore.setState({ connectionLogs: [] });
                  }}
                  className="text-[9px] font-black uppercase text-primary hover:underline"
                >
                  Clear Console
                </button>
              </div>
              <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl font-mono text-[10px] space-y-1.5 max-h-48 overflow-y-auto shadow-inner border border-slate-800">
                {connectionLogs.length === 0 ? (
                  <div className="text-slate-500 italic text-center py-4">No diagnostic events logged yet. Try connecting or waking up.</div>
                ) : (
                  connectionLogs.map((log, index) => {
                    let color = 'text-slate-300';
                    if (log.includes('FAILED') || log.includes('error') || log.includes('failed') || log.includes('disconnected') || log.includes('Error')) {
                      color = 'text-rose-400 font-medium';
                    } else if (log.includes('Successfully') || log.includes('awake') || log.includes('OK') || log.includes('healthy') || log.includes('Live')) {
                      color = 'text-emerald-400 font-medium';
                    } else if (log.includes('Waking up') || log.includes('Attempt')) {
                      color = 'text-amber-400';
                    }
                    return (
                      <div key={index} className={`whitespace-pre-wrap leading-relaxed ${color}`}>
                        {log}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      default:
        return (
          <>
            {/* Profile Section */}
            <section className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  <Avatar src={user?.avatar || ''} className="size-32 border-4 border-primary/10" />
                  <button 
                    onClick={() => setShowAvatarPicker(true)}
                    className="absolute bottom-0 right-0 size-10 rounded-full bg-primary text-white flex items-center justify-center border-4 border-white shadow-lg hover:scale-110 transition-transform"
                  >
                    <Icon name="edit" className="text-sm" />
                  </button>
                </div>
                
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Backend Team Identity</label>
                      <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-primary/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Backend Team Bio</label>
                      <textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full bg-primary/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="flex-1 border-primary/5" onClick={() => setIsEditing(false)}>Cancel</Button>
                      <Button variant="primary" className="flex-1" onClick={handleSave}>Save Changes</Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <h3 className="text-xl font-bold text-slate-800">{user?.displayName}</h3>
                      <button onClick={() => setIsEditing(true)} className="text-primary hover:scale-110 transition-transform">
                        <Icon name="edit" className="text-sm" />
                      </button>
                    </div>
                    <p className="text-sm text-neutral-muted">@{user?.username}</p>
                    <p className="text-xs text-slate-600 max-w-xs mx-auto mt-2 italic">"{user?.description}"</p>
                  </div>
                )}
              </div>
            </section>

            {/* Account Settings */}
            <section className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Account</h4>
              <div className="space-y-2">
                <button 
                  onClick={() => setActiveView('notifications')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                      <Icon name="notifications" />
                    </div>
                    <span className="text-sm font-bold text-slate-700">Notifications</span>
                  </div>
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
                <button 
                  onClick={() => setActiveView('privacy')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                      <Icon name="lock" />
                    </div>
                    <span className="text-sm font-bold text-slate-700">Privacy & Security</span>
                  </div>
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
                <button 
                  onClick={() => setActiveView('connection')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                      <Icon name="wifi" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-bold text-slate-700">Connection Diagnostics</span>
                      <span className="text-[10px] text-neutral-muted">Heartbeat, retry metrics & status logs</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
              </div>
            </section>

            {/* Support & Feedback */}
            <section className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Support & Feedback</h4>
              <div className="space-y-2">
                <button 
                  onClick={() => setActiveView('ticket')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors shadow-sm">
                      <Icon name="confirmation_number" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-bold text-slate-700">Raise Ticket</span>
                      <span className="text-[10px] text-neutral-muted">Get help from our support team</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
                <button 
                  onClick={() => setActiveView('help')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-sm">
                      <Icon name="help" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-bold text-slate-700">Help Center</span>
                      <span className="text-[10px] text-neutral-muted">FAQs and guides</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
                <button 
                  onClick={() => setActiveView('feedback')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-green-500 group-hover:bg-green-500 group-hover:text-white transition-colors shadow-sm">
                      <Icon name="feedback" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-bold text-slate-700">Feedback</span>
                      <span className="text-[10px] text-neutral-muted">Help us improve the app</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
              </div>
            </section>

            {/* Danger Zone */}
            <section className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-500 px-1">Danger Zone</h4>
              <button 
                onClick={() => {
                  if (window.confirm('Are you sure you want to log out?')) {
                    logout();
                    onClose();
                  }
                }}
                className="w-full p-4 rounded-2xl bg-red-50 flex items-center justify-between hover:bg-red-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-white flex items-center justify-center text-red-500">
                    <Icon name="logout" />
                  </div>
                  <span className="text-sm font-bold text-red-600">Log Out</span>
                </div>
                <Icon name="chevron_right" className="text-red-400" />
              </button>
            </section>
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100"
      >
        <header className="p-6 border-b border-primary/5 flex items-center justify-between bg-bg-light/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-2xl bg-white border border-white shadow-sm flex items-center justify-center text-primary">
              <Icon name="settings" className="text-2xl" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">Settings</h2>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Preferences & Account</p>
            </div>
          </div>
          <button onClick={onClose} className="size-11 rounded-2xl bg-white border border-white shadow-sm hover:bg-primary hover:text-white flex items-center justify-center text-primary transition-all active:scale-95">
            <Icon name="close" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          {renderView()}
        </main>

        <AnimatePresence>
          {showSuccessModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 w-full max-w-xs text-center shadow-2xl border border-primary/5"
              >
                <div className="size-16 rounded-2xl bg-green-500/10 text-green-500 flex items-center justify-center mx-auto mb-4">
                  <Icon name="check_circle" className="text-3xl" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{showSuccessModal.title}</h3>
                <p className="text-sm text-neutral-muted mb-6 leading-relaxed">{showSuccessModal.message}</p>
                <Button className="w-full" onClick={() => setShowSuccessModal(null)}>Great!</Button>
              </motion.div>
            </motion.div>
          )}
          {showAvatarPicker && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 z-20 bg-white p-6 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Choose Avatar</h3>
                <button onClick={() => setShowAvatarPicker(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {PRELOADED_AVATARS.map((url) => (
                  <button 
                    key={`avatar-option-${url}`} 
                    onClick={() => handleAvatarSelect(url)}
                    className="aspect-square rounded-2xl overflow-hidden border-2 border-transparent hover:border-primary transition-all active:scale-95"
                  >
                    <img src={url} className="size-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-2 text-primary hover:bg-primary/5 transition-all"
                >
                  <Icon name="upload" />
                  <span className="text-[10px] font-bold uppercase">Upload</span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload}
                  />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
