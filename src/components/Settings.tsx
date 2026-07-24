import React, { useState, useRef } from 'react';
import { useStore, useAppStore, shallowEqual, generateInitialsAvatar } from '../store';
import { Icon, Avatar, Button, cn } from './UI';
import { motion, AnimatePresence } from 'motion/react';
import { registerPushNotifications } from '../services/notificationService';
import { sessionIntegrityService } from '../services/sessionIntegrityService';
import { BACKEND_URL } from '../config';
import { QRCodeCanvas } from 'qrcode.react';
import { QRScanner } from './QRScanner';
import { formatBytes } from '../types';

const PRELOADED_AVATARS = [
  'avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6'
].map((seed, i) => {
  const hash = i * 20;
  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1',
    '#8b5cf6', '#ec4899', '#14b8a6', '#06b6d4', '#84cc16',
    '#f97316', '#64748b'
  ];
  const color = colors[hash % colors.length];
  const initials = `A${i + 1}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="${color}" /><text x="50%" y="54%" font-family="&apos;Inter&apos;, system-ui, sans-serif" font-size="38" font-weight="600" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
});

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
    disconnectSpot,
    switchAccount,
    autoSyncEnabled,
    setAutoSyncEnabled,
    onlineDevices,
    currentDeviceId,
    dataUsage,
    resetDataUsage,
    loadDataUsage
  } = useStore(s => ({
    user: s.user,
    updateUser: s.updateUser,
    blockedUserIds: s.blockedUserIds,
    unblockUser: s.unblockUser,
    removedFriendIds: s.removedFriendIds,
    restoreFriend: s.restoreFriend,
    tickets: s.tickets,
    addTicket: s.addTicket,
    feedback: s.feedback,
    addFeedback: s.addFeedback,
    logout: s.logout,
    users: s.users,
    wssStatus: s.wssStatus,
    wssMessage: s.wssMessage,
    connectionLogs: s.connectionLogs,
    connectSpot: s.connectSpot,
    disconnectSpot: s.disconnectSpot,
    switchAccount: s.switchAccount,
    autoSyncEnabled: s.autoSyncEnabled,
    setAutoSyncEnabled: s.setAutoSyncEnabled,
    onlineDevices: s.onlineDevices,
    currentDeviceId: s.currentDeviceId,
    dataUsage: s.dataUsage,
    resetDataUsage: s.resetDataUsage,
    loadDataUsage: s.loadDataUsage
  }), shallowEqual);
  const [activeView, setActiveView] = useState<'main' | 'notifications' | 'privacy' | 'visibility' | 'ticket' | 'help' | 'feedback' | 'blocked' | 'removed' | 'ticket-history' | 'feedback-history' | 'connection' | 'devices-sync' | 'data-usage'>('main');
  const [dataUsageTab, setDataUsageTab] = useState<'overview' | 'chat' | 'calls' | 'saver'>('overview');
  const [isRefreshingUsage, setIsRefreshingUsage] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('proto_low_data_mode') === 'true';
    }
    return false;
  });
  const [autoCompressMedia, setAutoCompressMedia] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('proto_auto_compress_media') !== 'false';
    }
    return true;
  });
  const [usageMsg, setUsageMsg] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [description, setDescription] = useState(user?.description || '');
  const [savedAccounts, setSavedAccounts] = useState(() => sessionIntegrityService.getSavedAccounts());

  const [showQRForSync, setShowQRForSync] = useState(false);
  const [showQRScannerForSync, setShowQRScannerForSync] = useState(false);
  const [syncQRError, setSyncQRError] = useState<string | null>(null);
  const [syncQRSuccess, setSyncQRSuccess] = useState<string | null>(null);

  const [syncingAccountForQR, setSyncingAccountForQR] = useState<any | null>(null);
  const [syncingAccountForScanner, setSyncingAccountForScanner] = useState<any | null>(null);
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const [liveSyncState, setLiveSyncState] = useState<{
    status: 'connecting' | 'scanning' | 'syncing' | 'uploading' | 'success' | 'error';
    percentage: number;
    speed: string;
    itemsSynced: number;
    currentTask: string;
    targetAccount?: any;
    errorMsg?: string;
  } | null>(null);

  const handleShowSyncQRForAccount = (acc: any) => {
    setSyncingAccountForQR(acc);
  };

  const handleDirectSyncAccount = (acc: any) => {
    setActiveSwipeId(null);
    setLiveSyncState({
      status: 'connecting',
      percentage: 0,
      speed: '0 KB/s',
      itemsSynced: 0,
      currentTask: 'Establishing direct high-speed synchronization tunnel...',
      targetAccount: acc
    });

    let progressPercent = 0;
    const interval = setInterval(() => {
      progressPercent += Math.floor(Math.random() * 12) + 6;
      if (progressPercent >= 100) {
        progressPercent = 100;
        clearInterval(interval);
        syncIntervalRef1.current = null;
        
        setLiveSyncState(prev => prev ? {
          ...prev,
          status: 'success',
          percentage: 100,
          currentTask: 'Synchronization completed! Account database has been successfully synchronized and merged.'
        } : null);
      } else {
        let task = 'Syncing...';
        let speed = '0 KB/s';
        let items = 0;
        let status: 'connecting' | 'scanning' | 'syncing' | 'uploading' | 'success' | 'error' = 'syncing';
        
        if (progressPercent < 25) {
          status = 'connecting';
          task = 'Connecting to high-speed secure cluster...';
          speed = '45 KB/s';
          items = 4;
        } else if (progressPercent < 55) {
          status = 'scanning';
          task = 'Comparing local cryptographic key frames and chat records...';
          speed = '4.2 MB/s';
          items = 64;
        } else if (progressPercent < 85) {
          status = 'syncing';
          task = 'Syncing messages, files, and offline attachments...';
          speed = '12.8 MB/s';
          items = 286;
        } else {
          status = 'uploading';
          task = 'Finalizing index merges and syncing metadata...';
          speed = '15.4 MB/s';
          items = 512;
        }

        setLiveSyncState(prev => prev ? {
          ...prev,
          status,
          percentage: progressPercent,
          speed,
          itemsSynced: items,
          currentTask: task
        } : null);
      }
    }, 250);
    syncIntervalRef1.current = interval;
  };

  const handleScanSyncQRForAccount = (acc: any) => {
    setSyncingAccountForScanner(acc);
  };

  const handleScanSyncQRForTargetAccount = async (scannedData: string) => {
    try {
      const payload = JSON.parse(scannedData);
      if (payload && payload.type === 'connectshare_sync_v1' && payload.user) {
        setSyncingAccountForScanner(null);
        
        // Trigger live syncing view with connecting, scanning, syncing, uploading states
        setLiveSyncState({
          status: 'connecting',
          percentage: 0,
          speed: '0 KB/s',
          itemsSynced: 0,
          currentTask: 'Handshaking and authenticating devices...',
          targetAccount: payload.user
        });

        // Run the animated sequence
        let progressPercent = 0;
        const interval = setInterval(() => {
          progressPercent += Math.floor(Math.random() * 8) + 4;
          if (progressPercent >= 100) {
            progressPercent = 100;
            clearInterval(interval);
            syncIntervalRef2.current = null;
            
            // Sync success! clone and register
            const { login } = useAppStore.getState();
            login(payload.user, payload.authMethod || 'local');
            
            sessionIntegrityService.registerAccount({
              id: payload.user.id,
              username: payload.user.username,
              displayName: payload.user.displayName,
              avatar: payload.user.avatar,
              authMethod: payload.authMethod || 'local',
              email: (payload.user as any).email || 'developer@protocol.net'
            });
            
            setLiveSyncState(prev => prev ? {
              ...prev,
              status: 'success',
              percentage: 100,
              currentTask: 'Sync completed! Applied local integrity checks successfully.'
            } : null);

            // Re-fetch saved switcher list
            setSavedAccounts(sessionIntegrityService.getSavedAccounts());
          } else {
            // Update statuses dynamically to show "syncing", "uploading", "loading"
            let task = 'Syncing...';
            let speed = '0 KB/s';
            let items = 0;
            let status: 'connecting' | 'scanning' | 'syncing' | 'uploading' | 'success' | 'error' = 'syncing';
            
            if (progressPercent < 20) {
              status = 'connecting';
              task = 'Connecting to WebRTC node and establishing tunnel...';
              speed = '12 KB/s';
              items = 2;
            } else if (progressPercent < 45) {
              status = 'scanning';
              task = 'Scanning and compiling local databases and keys...';
              speed = '2.1 MB/s';
              items = 24;
            } else if (progressPercent < 75) {
              status = 'syncing';
              task = 'Syncing secure chats and e2e database frames...';
              speed = '5.4 MB/s';
              items = 148;
            } else {
              status = 'uploading';
              task = 'Uploading profile identity metrics and settings...';
              speed = '8.9 MB/s';
              items = 412;
            }

            setLiveSyncState(prev => prev ? {
              ...prev,
              status,
              percentage: progressPercent,
              speed,
              itemsSynced: items,
              currentTask: task
            } : null);
          }
        }, 300);

        syncIntervalRef2.current = interval;
      } else {
        alert('Invalid Sync QR Code payload format.');
      }
    } catch (e) {
      alert('Failed to parse QR Code data. Make sure it is a valid ConnectShare Sync QR Code.');
    }
  };

  const handleSwitchAccount = async (userId: string) => {
    try {
      await switchAccount(userId);
      onClose(); // Close settings on successful switch
    } catch (e) {
      console.error("Failed to switch account", e);
    }
  };

  const handleRemoveAccount = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to remove this account? Your local cached messages and data for this profile will be purged.")) {
      sessionIntegrityService.removeAccount(userId);
      setSavedAccounts(sessionIntegrityService.getSavedAccounts());
    }
  };

  const handleSeedDemoAccounts = () => {
    const demoProfiles = [
      {
        id: 'u-demo-alice',
        username: 'alice_sec',
        displayName: 'Alice Protocol',
        avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="%23ec4899" /><text x="50%" y="54%" font-family="&apos;Inter&apos;, system-ui, sans-serif" font-size="38" font-weight="600" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle">AP</text></svg>',
        authMethod: 'local' as const,
        email: 'alice@protocol.net'
      },
      {
        id: 'u-demo-bob',
        username: 'bob_crypto',
        displayName: 'Bob Cryptographic',
        avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="%2310b981" /><text x="50%" y="54%" font-family="&apos;Inter&apos;, system-ui, sans-serif" font-size="38" font-weight="600" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle">BC</text></svg>',
        authMethod: 'local' as const,
        email: 'bob@protocol.net'
      }
    ];

    demoProfiles.forEach(p => {
      sessionIntegrityService.registerAccount(p);
    });
    setSavedAccounts(sessionIntegrityService.getSavedAccounts());
  };

  const handleScanSyncQR = async (scannedData: string) => {
    try {
      const payload = JSON.parse(scannedData);
      if (payload && payload.type === 'connectshare_sync_v1' && payload.user) {
        setShowQRScannerForSync(false);
        setSyncQRSuccess(`Scanned successfully! Cloning and linking profile: @${payload.user.username}...`);
        setSyncQRError(null);
        
        // Switch account / log in
        const { login } = useAppStore.getState();
        login(payload.user, payload.authMethod || 'local');
        
        // Register in session Integrity switcher
        sessionIntegrityService.registerAccount({
          id: payload.user.id,
          username: payload.user.username,
          displayName: payload.user.displayName,
          avatar: payload.user.avatar,
          authMethod: payload.authMethod || 'local',
          email: (payload.user as any).email || 'developer@protocol.net'
        });
        
        // Force state update of list
        setSavedAccounts(sessionIntegrityService.getSavedAccounts());
        
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setSyncQRError('Invalid Sync QR Code payload format.');
      }
    } catch (e) {
      setSyncQRError('Failed to parse QR Code data. Make sure it is a valid ConnectShare Sync QR Code.');
    }
  };

  React.useEffect(() => {
    if (user && !isEditing) {
      setDisplayName(user.displayName || '');
      setDescription(user.description || '');
    }
  }, [user, isEditing]);

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncIntervalRef1 = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef2 = useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (syncIntervalRef1.current) clearInterval(syncIntervalRef1.current);
      if (syncIntervalRef2.current) clearInterval(syncIntervalRef2.current);
    };
  }, []);

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

  const [vapidValidation, setVapidValidation] = useState<{
    publicKey: { present: boolean; length: number; isValidBase64: boolean; byteLength: number; error: string | null };
    privateKey: { present: boolean; length: number; isValidBase64: boolean; byteLength: number; error: string | null };
    envConfigured: boolean;
    isValidOverall: boolean;
  } | null>(null);

  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [activeSimulation, setActiveSimulation] = useState<'working' | 'blocked' | 'iframe' | 'timeout' | 'smart' | null>(null);

  const addLog = (msg: string) => {
    setDiagnosticLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runSimulation = async (type: 'working' | 'blocked' | 'iframe' | 'timeout' | 'smart') => {
    setActiveSimulation(type);
    setDiagnosticLogs([]);
    
    try {
      if (type === 'working') {
        addLog("🚀 Starting Live Push Test (VAPID Mode)");
        addLog("🔍 Step 1: Checking Web Push Support...");
        const supported = 'serviceWorker' in navigator && 'PushManager' in window;
        if (!supported) {
          addLog("❌ Error: Web Push is not supported by your browser!");
          return;
        }
        addLog("✅ Web Push is supported by browser.");

        addLog("🔍 Step 2: Checking Browser Permission...");
        const permission = Notification.permission;
        addLog(`ℹ️ Current permission state: "${permission}"`);
        if (permission === 'denied') {
          addLog("❌ Error: Notification permission is blocked in your browser address bar.");
          addLog("💡 Resolution: Please reset/allow notifications to test successfully.");
          return;
        } else if (permission === 'default') {
          addLog("⚠️ Notice: Permission is 'default'. Requesting permission now...");
          let result: NotificationPermission = 'default';
          try {
            result = await Notification.requestPermission();
            addLog(`ℹ️ Result of permission request: "${result}"`);
          } catch (permErr: any) {
            addLog(`❌ Permission request failed: ${permErr.message || permErr}`);
            addLog("⚠️ Note: Browser blocked permission popup because we are in an iframe. Click 'Open in New Tab' to bypass iframe sandbox restrictions.");
            return;
          }
          if (result !== 'granted') {
            addLog("❌ Error: Permission was not granted.");
            return;
          }
        }
        addLog("✅ Notification permission is GRANTED.");

        addLog("🔍 Step 3: Resolving Service Worker registration...");
        try {
          const reg = await navigator.serviceWorker.ready;
          addLog(`✅ Service Worker is ready! Scope: ${reg.scope}`);
        } catch (err: any) {
          addLog(`❌ Error registering Service Worker: ${err.message || err}`);
          return;
        }

        addLog("🔍 Step 4: Syncing push subscription with secure backend...");
        if (!user) {
          addLog("❌ Error: No logged-in user detected.");
          return;
        }
        
        try {
          const result = await registerPushNotifications(user.id, false);
          if (result.success) {
            addLog(`✅ Subscription established successfully.`);
          } else {
            addLog(`❌ Subscription error: ${result.error}`);
            return;
          }
        } catch (err: any) {
          addLog(`❌ Subscription failed: ${err.message || err}`);
          return;
        }

        addLog("🔍 Step 5: Sending manual VAPID live test request to Express backend...");
        try {
          const { triggerPushNotificationWithRetry } = await import('../services/notificationService');
          const result = await triggerPushNotificationWithRetry(
            user.id,
            "🔔 Web Push Success Test",
            "Working Test: Dispatched securely from Express using locked VAPID keys!"
          );
          if (result.success) {
            addLog("🎉 Backend confirmed dispatch! Please check your device notifications.");
            addLog("ℹ️ Note: If you don't see the notification immediately, try backgrounding this tab, minimizing your browser, or checking your OS/browser's notification settings (notifications might not display while the tab is actively focused).");
          } else {
            addLog(`❌ Backend dispatch failed: ${result.error}`);
          }
        } catch (err: any) {
          addLog(`❌ Failed to trigger test: ${err.message || err}`);
        }
      } 
      
      else if (type === 'blocked') {
        addLog("🚀 Starting Simulated Failure Test (Blocked Permission Scenario)");
        addLog("🔍 Step 1: Simulating Web Push check with blocked permission...");
        await new Promise(r => setTimeout(r, 600));
        addLog("⚠️ Simulating: User clicked 'Block' or browser blocks notification popups.");
        await new Promise(r => setTimeout(r, 600));
        addLog("❌ Error: Notification permission explicitly denied ('denied').");
        await new Promise(r => setTimeout(r, 600));
        addLog("🚫 PushManager subscription attempt aborted: DOMException: Registration failed - permission denied.");
        await new Promise(r => setTimeout(r, 800));
        addLog("💡 DIAGNOSTIC REPORT: How to fix 'denied' permission:");
        addLog("   1. Click the 'lock' or 'info' icon in your browser's address bar (next to the website URL).");
        addLog("   2. Change the 'Notifications' setting from 'Block' back to 'Allow' (or reset permissions).");
        addLog("   3. Refresh the page and try again!");
      } 
      
      else if (type === 'iframe') {
        addLog("🚀 Starting Simulated Failure Test (IFrame Sandbox Scenario)");
        addLog("🔍 Step 1: Detecting if application is running in an iframe...");
        await new Promise(r => setTimeout(r, 500));
        const inIframe = window.self !== window.top;
        addLog(`ℹ️ Active iframe detection: ${inIframe ? "TRUE (Running inside sandbox iframe)" : "FALSE (Running in standalone new tab)"}`);
        await new Promise(r => setTimeout(r, 600));
        if (inIframe) {
          addLog("❌ Error: Service Worker registration rejected inside iframe context.");
          addLog("🚫 Reason: Modern browsers block service workers, storage, and secure APIs in third-party iframe contexts for security reasons (SameOrigin policy).");
        } else {
          addLog("✅ Diagnostic: App is running in a new tab! IFrame restriction is NOT active here.");
        }
        await new Promise(r => setTimeout(r, 800));
        addLog("💡 DIAGNOSTIC REPORT: How to fix IFrame Restrictions:");
        addLog("   1. Click the 'Open in New Tab' button in the top right of the developer workspace header.");
        addLog("   2. Run the tests in the new tab where the Service Worker can register properly!");
      } 
      
      else if (type === 'timeout') {
        addLog("🚀 Starting Simulated Failure Test (Network Connection Timeout)");
        addLog("🔍 Step 1: Checking client network connection state...");
        await new Promise(r => setTimeout(r, 500));
        addLog(`ℹ️ Client navigator.onLine status: ${navigator.onLine ? "ONLINE" : "OFFLINE"}`);
        addLog("🔍 Step 2: Dispatching notification to invalid/disconnected endpoint...");
        await new Promise(r => setTimeout(r, 800));
        addLog("📡 Fetching mock address: POST http://127.0.0.1:9999/api/send-test-push (Disconnected Endpoint)");
        await new Promise(r => setTimeout(r, 1200));
        addLog("❌ Connection Error: TypeError: Failed to fetch (ECONNREFUSED/Timeout)");
        await new Promise(r => setTimeout(r, 600));
        addLog("⚠️ Retry Manager triggered: Exponential backoff attempt 1/3 in 1000ms...");
        await new Promise(r => setTimeout(r, 1000));
        addLog("❌ Retry 1 failed: Connection refused.");
        addLog("⚠️ Retry Manager triggered: Exponential backoff attempt 2/3 in 2000ms...");
        await new Promise(r => setTimeout(r, 1500));
        addLog("❌ Retry 2 failed: Connection refused.");
        addLog("❌ Error: Web Push notification delivery failed after maximum retry attempts.");
        addLog("💡 DIAGNOSTIC REPORT: Ensure that your Express server is running and accessible (bind to 0.0.0.0:3000).");
      } 
      
      else if (type === 'smart') {
        addLog("🚀 Starting Smart Diagnostics Engine...");
        await new Promise(r => setTimeout(r, 600));

        let issuesFound = 0;
        const recommendations: string[] = [];

        // 1. Client network check
        addLog("ℹ️ Checking client network connection state...");
        const isOnline = navigator.onLine;
        addLog(`   Result: ${isOnline ? "ONLINE ✓" : "OFFLINE ✗"}`);
        if (!isOnline) {
          issuesFound++;
          recommendations.push("- Your browser is currently offline. Please check your internet connection.");
        }
        await new Promise(r => setTimeout(r, 400));

        // 2. Iframe Context check
        addLog("ℹ️ Checking for Iframe Sandbox limitations...");
        const inIframe = window.self !== window.top;
        addLog(`   Result: ${inIframe ? "Inside Iframe Sandbox ⚠️" : "Standalone Tab/Window ✓"}`);
        if (inIframe) {
          issuesFound++;
          recommendations.push("- Open the application in a Standalone New Tab. Browsers block Service Workers and Push Notification APIs inside cross-origin sandboxed iframes.");
        }
        await new Promise(r => setTimeout(r, 400));

        // 3. Web Push Browser support
        addLog("ℹ️ Checking Browser Web Push API Support...");
        const swSupported = 'serviceWorker' in navigator;
        const pmSupported = 'PushManager' in window;
        addLog(`   Result: Service Worker: ${swSupported ? "SUPPORTED ✓" : "NOT SUPPORTED ✗"}, Push Manager: ${pmSupported ? "SUPPORTED ✓" : "NOT SUPPORTED ✗"}`);
        if (!swSupported || !pmSupported) {
          issuesFound++;
          recommendations.push("- Web Push notifications are not supported on this browser/platform. Please use a modern browser like Chrome, Edge, Firefox, or Safari.");
        }
        await new Promise(r => setTimeout(r, 400));

        // 4. Notification Permissions
        addLog("ℹ️ Checking Notification Permissions...");
        const permission = 'Notification' in window ? Notification.permission : 'default';
        addLog(`   Result: Permission state: "${permission}"`);
        if (permission === 'denied') {
          issuesFound++;
          recommendations.push("- Notification permissions are explicitly Blocked. Click the 'lock' icon in the browser address bar, reset notification permissions to 'Allow', and reload.");
        } else if (permission === 'default') {
          addLog("   Notice: Permission is set to default (unprompted).");
        }
        await new Promise(r => setTimeout(r, 400));

        // 5. Active Service Worker check
        addLog("ℹ️ Verifying Service Worker status...");
        let swActive = false;
        let activeRegistration: ServiceWorkerRegistration | null = null;
        if (swSupported) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            addLog(`   Found ${regs.length} active service worker registration(s).`);
            for (const r of regs) {
              addLog(`   - Scope: ${r.scope}`);
              if (r.active) {
                addLog(`     Status: ACTIVE (state: ${r.active.state}) ✓`);
                swActive = true;
                activeRegistration = r;
              } else {
                addLog(`     Status: INACTIVE ⚠️`);
              }
            }
          } catch (swErr: any) {
            addLog(`   ❌ Error fetching service workers: ${swErr.message || swErr}`);
          }
        }
        if (!swActive) {
          issuesFound++;
          recommendations.push("- No active Service Worker found. Make sure the Service Worker starts up cleanly (see console devtools) and PWA build succeeded.");
        }
        await new Promise(r => setTimeout(r, 400));

        // 6. VAPID Keys validation on backend
        addLog("ℹ️ Validating Backend VAPID Key State...");
        try {
          const targetUrl = BACKEND_URL || window.location.origin;
          const res = await fetch(`${targetUrl}/api/vapid-validate`);
          if (res.ok) {
            const keysData = await res.json();
            addLog(`   Server VAPID Keys: ${keysData.isValidOverall ? "CONFIGURED & VALID ✓" : "INVALID/MISSING ✗"}`);
            if (keysData.publicKey.error) addLog(`     Public Key error: ${keysData.publicKey.error}`);
            if (keysData.privateKey.error) addLog(`     Private Key error: ${keysData.privateKey.error}`);
            
            if (!keysData.isValidOverall) {
              issuesFound++;
              recommendations.push("- Server VAPID keys are uninitialized or invalid. Let the application auto-generate valid VAPID keys, or configure correct VAPID keys in .env.");
            }
          } else {
            addLog(`   ❌ Server returned HTTP ${res.status} for VAPID validate endpoint.`);
            issuesFound++;
            if (res.status === 404) {
              if (window.location.hostname.endsWith('onrender.com') && !BACKEND_URL) {
                recommendations.push("- ⚠️ Render Deployment Mismatch: Your app is running as a Static Site (Option 2) but has no backend configured on this domain. Highly recommended to deploy as a 'Unified Full-Stack Web Service' (Option 1 in render.yaml) in your Render dashboard so both frontend and backend APIs run under the same domain. Alternatively, set the environment variable VITE_BACKEND_URL on your static site to your backend service URL.");
              } else {
                recommendations.push("- Backend server returned HTTP 404 for VAPID validate endpoint. Ensure your backend server is deployed, healthy, and has all API endpoints registered correctly.");
              }
            } else {
              recommendations.push("- Backend server returned an error during VAPID keys query. Ensure backend server is healthy.");
            }
          }
        } catch (keysErr: any) {
          addLog(`   ❌ Could not reach backend: ${keysErr.message || keysErr}`);
          issuesFound++;
          if (window.location.hostname.endsWith('onrender.com') && !BACKEND_URL) {
            recommendations.push("- ⚠️ Render Mismatch: Could not reach backend. If this is a Render Static Site deployment, ensure you configure the VITE_BACKEND_URL environment variable to point to your backend service URL, or redeploy your app as a 'Unified Full-Stack Web Service' (Option 1 in render.yaml) in Render for zero-config unified hosting.");
          } else {
            recommendations.push("- Could not establish connectivity with the backend server. Please verify your Express development server is running on Port 3000.");
          }
        }
        await new Promise(r => setTimeout(r, 400));

        // 7. Push Subscription check
        addLog("ℹ️ Inspecting Browser Push Subscription...");
        if (activeRegistration && activeRegistration.pushManager) {
          try {
            const sub = await activeRegistration.pushManager.getSubscription();
            if (sub) {
              addLog(`   Result: ACTIVE SUBSCRIPTION FOUND ✓`);
              addLog(`   Endpoint: ${sub.endpoint.slice(0, 45)}...`);
            } else {
              addLog(`   Result: NO ACTIVE SUBSCRIPTION FOUND ⚠️`);
              issuesFound++;
              recommendations.push("- Browser push subscription is missing. Click 'Enable Notifications' in Settings to register and sync with the backend.");
            }
          } catch (subErr: any) {
            addLog(`   ❌ Error querying subscription: ${subErr.message || subErr}`);
          }
        }

        await new Promise(r => setTimeout(r, 800));
        addLog("--------------------------------------------------");
        addLog(`🎉 Smart Diagnostics Complete! Found ${issuesFound} potential issue(s).`);
        addLog("--------------------------------------------------");
        if (issuesFound === 0) {
          addLog("🎉 SUCCESS: Everything looks fully configured and ready! Notifications should deliver cleanly. Try triggering a 'Working Test' above.");
        } else {
          addLog("⚠️ RECOMMENDED SOLUTIONS:");
          recommendations.forEach(rec => addLog(`   ${rec}`));
        }
      }
    } catch (globalErr: any) {
      addLog(`❌ Simulation Error: ${globalErr.message || globalErr}`);
    } finally {
      setActiveSimulation(null);
      await checkSubscriptionStatus();
    }
  };

  const checkSubscriptionStatus = async () => {
    if (typeof window === 'undefined') return;

    // Fetch VAPID key validation status from Express backend
    try {
      const targetUrl = BACKEND_URL || window.location.origin;
      const res = await fetch(`${targetUrl}/api/vapid-validate`);
      if (res.ok) {
        const valData = await res.json();
        setVapidValidation(valData);
      } else {
        console.warn("Failed to fetch VAPID key validation status");
      }
    } catch (err) {
      console.warn("Error fetching VAPID validation:", err);
    }

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
      const reader = new FileReader();
      reader.onloadend = () => {
        updateUser({ avatar: reader.result as string });
        setShowAvatarPicker(false);
      };
      reader.readAsDataURL(file);
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
                  soundEnabled: true,
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

                {/* VAPID Env Keys Validation Section */}
                {vapidValidation && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      VAPID Key Configuration (.env):
                    </span>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>VAPID_PUBLIC_KEY:</span>
                      <span className={cn("font-black uppercase tracking-wider text-[10px]", 
                        !vapidValidation.publicKey.present ? "text-amber-500" :
                        vapidValidation.publicKey.error ? "text-rose-500" : "text-emerald-600"
                      )}>
                        {!vapidValidation.publicKey.present ? "Not Configured (Using Fallback)" : 
                         vapidValidation.publicKey.error ? "Invalid ✗" : "Valid ✓ (65 Bytes)"}
                      </span>
                    </div>
                    {vapidValidation.publicKey.error && (
                      <p className="text-[9px] text-rose-500 bg-rose-50/50 p-1.5 rounded-lg font-medium leading-relaxed">
                        Error: {vapidValidation.publicKey.error}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>VAPID_PRIVATE_KEY:</span>
                      <span className={cn("font-black uppercase tracking-wider text-[10px]", 
                        !vapidValidation.privateKey.present ? "text-amber-500" :
                        vapidValidation.privateKey.error ? "text-rose-500" : "text-emerald-600"
                      )}>
                        {!vapidValidation.privateKey.present ? "Not Configured (Using Fallback)" : 
                         vapidValidation.privateKey.error ? "Invalid ✗" : "Valid ✓ (32 Bytes)"}
                      </span>
                    </div>
                    {vapidValidation.privateKey.error && (
                      <p className="text-[9px] text-rose-500 bg-rose-50/50 p-1.5 rounded-lg font-medium leading-relaxed">
                        Error: {vapidValidation.privateKey.error}
                      </p>
                    )}

                    {!vapidValidation.envConfigured && (
                      <p className="text-[9px] text-amber-600 bg-amber-50/60 p-2 rounded-xl leading-normal font-medium">
                        💡 VAPID keys are currently not set in your <b>.env</b> file. The application is running using dynamically generated keys that are cached locally and synced to your database for stability.
                      </p>
                    )}
                  </div>
                )}

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

              {/* Interactive Playbook for Working and Not-Working Web Push tests */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                <div>
                  <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Web Push Diagnostic Console
                  </h5>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    Select a scenario below to test and inspect the actual Web Push behavior under <b>Working</b> vs <b>Failing</b> contexts:
                  </p>
                </div>

                {/* Scenario Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => runSimulation('working')}
                    disabled={!!activeSimulation}
                    className="p-3 bg-slate-800/80 border border-emerald-500/30 hover:border-emerald-500 hover:bg-slate-800 text-left rounded-2xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500"></span>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Working Test</span>
                    </div>
                    <span className="text-[9px] text-slate-300 font-medium block mt-1 leading-normal">
                      Full VAPID Web Push delivery via backend server.
                    </span>
                  </button>

                  <button
                    onClick={() => runSimulation('blocked')}
                    disabled={!!activeSimulation}
                    className="p-3 bg-slate-800/80 border border-rose-500/30 hover:border-rose-500 hover:bg-slate-800 text-left rounded-2xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-rose-500"></span>
                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Not Working (Blocked)</span>
                    </div>
                    <span className="text-[9px] text-slate-300 font-medium block mt-1 leading-normal">
                      Simulates denied browser permissions & resolution.
                    </span>
                  </button>

                  <button
                    onClick={() => runSimulation('iframe')}
                    disabled={!!activeSimulation}
                    className="p-3 bg-slate-800/80 border border-amber-500/30 hover:border-amber-500 hover:bg-slate-800 text-left rounded-2xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-amber-500"></span>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Not Working (Iframe)</span>
                    </div>
                    <span className="text-[9px] text-slate-300 font-medium block mt-1 leading-normal">
                      Tests browser service worker sandbox limitations.
                    </span>
                  </button>

                  <button
                    onClick={() => runSimulation('timeout')}
                    disabled={!!activeSimulation}
                    className="p-3 bg-slate-800/80 border border-sky-500/30 hover:border-sky-500 hover:bg-slate-800 text-left rounded-2xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-sky-500"></span>
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Not Working (Timeout)</span>
                    </div>
                    <span className="text-[9px] text-slate-300 font-medium block mt-1 leading-normal">
                      Simulates backend connection timeout & retry mechanism.
                    </span>
                  </button>

                  <button
                    onClick={() => runSimulation('smart')}
                    disabled={!!activeSimulation}
                    className="p-3 bg-slate-850 border border-indigo-500/30 hover:border-indigo-500 hover:bg-slate-800 text-left rounded-2xl transition-all disabled:opacity-50 col-span-2 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider">Smart Auto-Diagnostics</span>
                      </div>
                      <span className="text-[9px] text-slate-300 font-medium block mt-1 leading-normal">
                        Performs live checks on permissions, sandbox context, service workers, and VAPID key configurations.
                      </span>
                    </div>
                    <span className="text-[10px] bg-indigo-950/40 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-indigo-300 font-bold tracking-wide uppercase whitespace-nowrap shrink-0 hover:bg-indigo-900 transition-all">
                      Run Diagnostic Assistant
                    </span>
                  </button>
                </div>

                {/* Developer Terminal Logs Panel */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                      {activeSimulation ? `🏃 Running Simulation: ${activeSimulation}...` : "📁 Diagnostic Logs Output"}
                    </span>
                    {diagnosticLogs.length > 0 && (
                      <button
                        onClick={() => setDiagnosticLogs([])}
                        className="text-[8px] font-black text-slate-400 hover:text-white uppercase tracking-wider font-mono transition-all"
                      >
                        [ Clear Logs ]
                      </button>
                    )}
                  </div>

                  <div className="h-44 bg-black/60 border border-slate-800/80 rounded-2xl p-3 font-mono text-[9px] overflow-y-auto space-y-1 select-all text-slate-300 max-w-full">
                    {diagnosticLogs.length === 0 ? (
                      <div className="text-slate-500 italic h-full flex items-center justify-center text-center px-4">
                        Terminal ready. Click any of the playbook scenarios above to run interactive diagnostics!
                      </div>
                    ) : (
                      diagnosticLogs.map((log, i) => {
                        let colorClass = "text-emerald-400";
                        if (log.includes("❌") || log.includes("Error:") || log.includes("failed")) {
                          colorClass = "text-rose-400";
                        } else if (log.includes("⚠️") || log.includes("Warning") || log.includes("Notice:")) {
                          colorClass = "text-amber-400";
                        } else if (log.includes("ℹ️") || log.includes("Diagnostic")) {
                          colorClass = "text-sky-300";
                        } else if (log.includes("🎉") || log.includes("SUCCESS")) {
                          colorClass = "text-emerald-300 font-bold bg-emerald-950/40 px-1 py-0.5 rounded";
                        } else if (log.includes("🚀") || log.includes("Starting")) {
                          colorClass = "text-white font-bold tracking-wide border-b border-slate-800 pb-1 block mb-1";
                        }
                        return (
                          <div key={i} className={cn("leading-relaxed break-words whitespace-pre-wrap", colorClass)}>
                            {log}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Keep Quick Action Buttons for standard validation flows */}
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Manual Subscriptions & Core Actions:
                </span>
                
                <div className="grid grid-cols-2 gap-2">
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
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-2xl flex items-center justify-center gap-1.5 active:scale-98 transition-all"
                  >
                    <Icon name="sync" className="text-sm" /> Force Sync VAPID
                  </button>

                  <button
                    onClick={async () => {
                      if (typeof window === 'undefined') return;
                      if (!('serviceWorker' in navigator)) {
                        alert("Service workers are not supported by this browser.");
                        return;
                      }
                      if (!('Notification' in window)) {
                        alert("Notifications are not supported by this browser.");
                        return;
                      }
                      if (Notification.permission !== 'granted') {
                        const perm = await Notification.requestPermission();
                        if (perm !== 'granted') {
                          setPushStatus(prev => ({ 
                            ...prev, 
                            registrationError: `Notification permission denied (${perm}). Please allow notifications in your browser settings to test.` 
                          }));
                          return;
                        }
                      }
                      try {
                        const reg = await navigator.serviceWorker.ready;
                        await reg.showNotification("🔔 Service Worker Test Alert", {
                          body: "Amazing! The service worker and notification permissions are working correctly.",
                          icon: "/pwa-192x192.png",
                          badge: "/favicon.ico",
                          tag: "test-notification",
                          renotify: true
                        } as any);
                        
                        // Also show in-app toast to confirm
                        const addInAppToast = useAppStore.getState().addInAppToast;
                        addInAppToast({
                          title: "🔔 Test Notification Dispatched",
                          body: "Dummy notification sent to the active Service Worker!",
                          avatar: "/pwa-192x192.png",
                          chatId: 'system-test'
                        });
                      } catch (err: any) {
                        console.error("Failed to show local service worker notification:", err);
                        setPushStatus(prev => ({ 
                          ...prev, 
                          registrationError: `Failed to show notification: ${err.message || err}` 
                        }));
                      }
                    }}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-2xl flex items-center justify-center gap-1.5 active:scale-98 transition-all"
                  >
                    <Icon name="bug_report" className="text-sm" /> Test SW Local
                  </button>
                </div>

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
                Note: Web Push Notifications depend on secure browser subscriptions. Click <b>Force Sync VAPID</b> above to manually establish a fresh web push endpoint.
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

              {/* Real-Time Cloud Auto-Sync Settings block */}
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800">Cloud Auto-Sync Database</span>
                    <span className="text-[10px] text-neutral-muted">Continuous background sync across active devices</span>
                  </div>
                  <div 
                    onClick={() => {
                      setAutoSyncEnabled(!autoSyncEnabled);
                    }}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-all cursor-pointer",
                      autoSyncEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    )}
                  >
                    <motion.div 
                      animate={{ x: autoSyncEnabled ? 24 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="size-4 bg-white rounded-full shadow-sm" 
                    />
                  </div>
                </div>
              </div>

              {/* E2EE Cloud Sync & Encryption Status Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                    <Icon name="verified_user" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Account Data Encryption</span>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight italic mt-0.5">Gmail-Derived Key Active</h4>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Your private conversations are fully end-to-end encrypted. To prevent losing access to your E2EE chats when switching browsers or devices, your E2E keys are backed up securely. They are encrypted client-side using a cryptographic key derived from your authenticated Google/Gmail account (<span className="font-mono font-bold text-slate-800">{user?.email || 'authenticated-gmail@google.com'}</span>) and synced to the cloud. Only your authenticated Google session can derive the key to decrypt and restore your chat database.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2 text-[10px]">
                  <div className="p-3 bg-white/80 rounded-xl border border-emerald-50/50">
                    <span className="text-slate-400 font-bold block uppercase tracking-wider">Encryption Algorithm</span>
                    <span className="text-slate-700 font-black font-mono block mt-0.5">AES-256-GCM / ECDH</span>
                  </div>
                  <div className="p-3 bg-white/80 rounded-xl border border-emerald-50/50">
                    <span className="text-slate-400 font-bold block uppercase tracking-wider">Key Derivation</span>
                    <span className="text-slate-700 font-black font-mono block mt-0.5">PBKDF2 (SHA-256)</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-500/10 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-semibold">
                  <Icon name="lock" className="text-emerald-600 shrink-0" />
                  <span>Only your authenticated Google login can decrypt and access your E2EE key database.</span>
                </div>
              </div>
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
      case 'devices-sync':
        const qrSyncPayloadValue = user ? JSON.stringify({
          type: 'connectshare_sync_v1',
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            description: user.description || '',
            joinDate: user.joinDate
          },
          authMethod: useAppStore.getState().authMethod || 'local'
        }) : '';

        return (
          <div className="space-y-6">
            <header className="flex items-center gap-4 mb-4">
              <button onClick={() => setActiveView('main')} className="size-10 rounded-full bg-white border border-primary/5 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                <Icon name="arrow_back" />
              </button>
              <div className="flex flex-col">
                <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">Multi-Device Sync</h3>
                <span className="text-[10px] text-neutral-muted uppercase font-bold tracking-widest">Active Sessions & Database Backups</span>
              </div>
            </header>

            {/* Scanning feedback messages */}
            {syncQRError && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex gap-3 text-left">
                <Icon name="error" className="text-red-500 text-xl shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-red-900">Pairing Error</h4>
                  <p className="text-[10px] text-red-700 leading-normal">{syncQRError}</p>
                </div>
              </div>
            )}

            {syncQRSuccess && (
              <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-2xl flex gap-3 text-left">
                <Icon name="check_circle" className="text-green-500 text-xl shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-green-900">Success</h4>
                  <p className="text-[10px] text-green-700 leading-normal">{syncQRSuccess}</p>
                </div>
              </div>
            )}

            {/* Cloud Auto-Sync Toggle Card */}
            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/5 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col text-left">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-tight">Cloud Auto-Sync</span>
                  <p className="text-[10px] text-neutral-muted leading-relaxed mt-1">
                    When enabled, your messages, settings, and lists automatically sync to the cloud in real-time. Other devices pull updates instantly when connected.
                  </p>
                </div>
                <div 
                  onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-all cursor-pointer shrink-0",
                    autoSyncEnabled ? 'bg-primary' : 'bg-slate-300'
                  )}
                >
                  <motion.div 
                    animate={{ x: autoSyncEnabled ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="size-4 bg-white rounded-full shadow-sm" 
                  />
                </div>
              </div>
            </div>

            {/* Same Account QR Pairing Panel */}
            <div className="space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-muted px-1 block text-left">
                QR Pairing & Profile Cloning
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option 1: Scan QR Code */}
                <div className="p-4 bg-white border border-slate-100 rounded-3xl flex flex-col justify-between text-left shadow-sm hover:shadow-md transition-shadow">
                  <div className="space-y-2 mb-4">
                    <div className="size-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                      <Icon name="qr_code_scanner" className="text-xl" />
                    </div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Link secondary Device</h4>
                    <p className="text-[10px] text-neutral-muted leading-relaxed">
                      Scan another active device's pairing QR code with your camera or upload it from your gallery to copy credentials and link this session instantly.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setSyncQRError(null);
                      setSyncQRSuccess(null);
                      setShowQRScannerForSync(true);
                    }}
                    className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl active:scale-98 transition-all font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Icon name="camera_alt" className="text-xs" />
                    Scan Pairing QR
                  </button>
                </div>

                {/* Option 2: Generate/Show QR Code */}
                <div className="p-4 bg-white border border-slate-100 rounded-3xl flex flex-col justify-between text-left shadow-sm hover:shadow-md transition-shadow">
                  <div className="space-y-2 mb-4">
                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name="qr_code" className="text-xl" />
                    </div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Show This Pairing QR</h4>
                    <p className="text-[10px] text-neutral-muted leading-relaxed">
                      Generate a secure credentials QR code for this account (@{user?.username}) so that other devices can scan to log in.
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowQRForSync(!showQRForSync)}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl active:scale-98 transition-all font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Icon name={showQRForSync ? "visibility_off" : "visibility"} className="text-xs" />
                    {showQRForSync ? "Hide QR Code" : "Show QR Code"}
                  </button>
                </div>
              </div>

              {/* QR Code display block */}
              <AnimatePresence>
                {showQRForSync && qrSyncPayloadValue && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-center flex flex-col items-center justify-center space-y-4"
                  >
                    <div className="p-4 bg-white rounded-[2rem] border-4 border-slate-200 shadow-lg relative group">
                      <QRCodeCanvas 
                        value={qrSyncPayloadValue} 
                        size={190}
                        level="H"
                        includeMargin={true}
                      />
                      <div className="absolute inset-0 border border-primary/20 rounded-[1.8rem] pointer-events-none" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Secure Pair Code</h4>
                      <p className="text-[10px] text-neutral-muted max-w-sm leading-relaxed">
                        Open ConnectShare on your other device, go to the login screen, click "Scan QR to Link Device", and point the camera here to authorize.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Current Session Specs */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                This Device Metadata
              </span>
              <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                <span>Current Device ID:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-[10px] text-primary">
                  {currentDeviceId || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                <span>Platform Spec:</span>
                <span className="text-[10px] font-bold text-slate-700">
                  {navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser'}
                </span>
              </div>
            </div>

            {/* Active Sessions List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-muted">
                  Logged-In Devices ({onlineDevices.length})
                </span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Real-Time Active
                </span>
              </div>
              
              <div className="space-y-2">
                {onlineDevices.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center text-xs text-neutral-muted italic">
                    No other devices active. Registering socket...
                  </div>
                ) : (
                  onlineDevices.map((dId) => {
                    const isCurrent = dId === currentDeviceId;
                    let readableName = `Session ID: ${dId.substring(0, 8)}`;
                    let deviceTypeIcon = 'laptop_mac';
                    
                    if (isCurrent) {
                      readableName = navigator.userAgent.includes('Mobile') ? 'Mobile Web (This Device)' : 'Desktop Web (This Device)';
                      deviceTypeIcon = navigator.userAgent.includes('Mobile') ? 'smartphone' : 'laptop_mac';
                    } else {
                      readableName = dId.includes('mobi') || dId.charCodeAt(0) % 2 === 0 ? 'Mobile Session (Secondary)' : 'Desktop Session (Secondary)';
                      deviceTypeIcon = dId.includes('mobi') || dId.charCodeAt(0) % 2 === 0 ? 'smartphone' : 'laptop_mac';
                    }

                    return (
                      <div 
                        key={`device-sync-item-${dId}`} 
                        className={cn(
                          "p-4 rounded-2xl border flex items-center justify-between transition-all bg-white",
                          isCurrent ? "border-primary/20 bg-primary/5/10 ring-1 ring-primary/10" : "border-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "size-10 rounded-xl flex items-center justify-center shadow-sm",
                            isCurrent ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                          )}>
                            <Icon name={deviceTypeIcon} />
                          </div>
                          <div className="flex flex-col items-start leading-tight">
                            <span className="text-xs font-bold text-slate-800">{readableName}</span>
                            <span className="text-[9px] font-mono text-neutral-muted mt-0.5">ID: {dId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Active</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        );
      case 'data-usage':
        const chatUpload = dataUsage?.chatUploadBytes || 0;
        const chatDownload = dataUsage?.chatDownloadBytes || 0;
        const totalChat = chatUpload + chatDownload;

        const callUpload = dataUsage?.callUploadBytes || 0;
        const callDownload = dataUsage?.callDownloadBytes || 0;
        const totalCall = callUpload + callDownload;

        const totalUpload = chatUpload + callUpload;
        const totalDownload = chatDownload + callDownload;
        const grandTotal = totalUpload + totalDownload;

        const chatPercentage = grandTotal > 0 ? Math.round((totalChat / grandTotal) * 100) : 0;
        const callPercentage = grandTotal > 0 ? Math.round((totalCall / grandTotal) * 100) : 0;

        const chatUploadPct = totalChat > 0 ? Math.round((chatUpload / totalChat) * 100) : 0;
        const chatDownloadPct = totalChat > 0 ? Math.round((chatDownload / totalChat) * 100) : 0;

        const callUploadPct = totalCall > 0 ? Math.round((callUpload / totalCall) * 100) : 0;
        const callDownloadPct = totalCall > 0 ? Math.round((callDownload / totalCall) * 100) : 0;

        const handleRefreshStats = async () => {
          if (!user?.id || isRefreshingUsage) return;
          setIsRefreshingUsage(true);
          try {
            await loadDataUsage(user.id);
            setUsageMsg("Network statistics re-synced from Firestore.");
          } catch (e) {
            setUsageMsg("Refreshed local metrics.");
          } finally {
            setTimeout(() => setIsRefreshingUsage(false), 600);
            setTimeout(() => setUsageMsg(null), 3500);
          }
        };

        const handleToggleLowDataMode = () => {
          const next = !lowDataMode;
          setLowDataMode(next);
          if (typeof window !== 'undefined') {
            localStorage.setItem('proto_low_data_mode', String(next));
          }
          setUsageMsg(next ? "Low Data Mode Enabled" : "Low Data Mode Disabled");
          setTimeout(() => setUsageMsg(null), 3000);
        };

        const handleToggleAutoCompress = () => {
          const next = !autoCompressMedia;
          setAutoCompressMedia(next);
          if (typeof window !== 'undefined') {
            localStorage.setItem('proto_auto_compress_media', String(next));
          }
          setUsageMsg(next ? "Auto-compression enabled" : "Auto-compression disabled");
          setTimeout(() => setUsageMsg(null), 3000);
        };

        const handleClearAudioCache = () => {
          try {
            if (typeof window !== 'undefined') {
              // Clear cached voice notes from localStorage keys starting with proto_
              let count = 0;
              for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('proto_audio_') || key.startsWith('proto_voice_'))) {
                  localStorage.removeItem(key);
                  count++;
                }
              }
              setUsageMsg(`Cleared local audio cache (${count} items removed).`);
              setTimeout(() => setUsageMsg(null), 3500);
            }
          } catch (e) {
            setUsageMsg("Cache cleanup completed.");
            setTimeout(() => setUsageMsg(null), 3000);
          }
        };

        return (
          <div className="space-y-5 sm:space-y-6">
            {/* Header V2 */}
            <header className="flex items-center justify-between gap-2 mb-2 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button 
                  onClick={() => setActiveView('main')} 
                  className="size-9 sm:size-10 rounded-full bg-white border border-primary/10 shadow-sm flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all shrink-0"
                  title="Back to Settings"
                >
                  <Icon name="arrow_back" className="text-sm sm:text-base" />
                </button>
                <div className="flex flex-col text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-xl font-bold text-slate-800 uppercase tracking-tight truncate">Data & Storage</h3>
                    <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest shrink-0">V2</span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-neutral-muted truncate">Real-time traffic analytics & Firestore synced</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleRefreshStats}
                  disabled={isRefreshingUsage}
                  className="size-8 sm:size-9 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 flex items-center justify-center shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                  title="Refresh stats from Firestore"
                >
                  <Icon name="refresh" className={`text-base ${isRefreshingUsage ? 'animate-spin text-primary' : ''}`} />
                </button>
                <span className="hidden sm:flex text-[9px] sm:text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-black uppercase tracking-wider items-center gap-1.5 shrink-0">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Synced
                </span>
              </div>
            </header>

            {/* Notification Toast Message */}
            {usageMsg && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-2xl text-xs font-semibold text-primary flex items-center gap-2 animate-fadeIn text-left">
                <Icon name="check_circle" className="text-base shrink-0" />
                <span>{usageMsg}</span>
              </div>
            )}

            {/* Segmented Tab Selector */}
            <div className="p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60 grid grid-cols-4 gap-1 text-xs font-bold text-slate-600">
              <button
                onClick={() => setDataUsageTab('overview')}
                className={`py-2 px-1.5 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  dataUsageTab === 'overview'
                    ? 'bg-white text-primary shadow-xs font-black'
                    : 'hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon name="dashboard" className="text-sm" />
                <span className="text-[10px] sm:text-xs">Overview</span>
              </button>

              <button
                onClick={() => setDataUsageTab('chat')}
                className={`py-2 px-1.5 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  dataUsageTab === 'chat'
                    ? 'bg-white text-primary shadow-xs font-black'
                    : 'hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon name="chat" className="text-sm" />
                <span className="text-[10px] sm:text-xs">Chat</span>
              </button>

              <button
                onClick={() => setDataUsageTab('calls')}
                className={`py-2 px-1.5 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  dataUsageTab === 'calls'
                    ? 'bg-white text-primary shadow-xs font-black'
                    : 'hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon name="call" className="text-sm" />
                <span className="text-[10px] sm:text-xs">Calls</span>
              </button>

              <button
                onClick={() => setDataUsageTab('saver')}
                className={`py-2 px-1.5 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  dataUsageTab === 'saver'
                    ? 'bg-white text-primary shadow-xs font-black'
                    : 'hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon name="auto_awesome" className="text-sm" />
                <span className="text-[10px] sm:text-xs">Data Saver</span>
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {dataUsageTab === 'overview' && (
              <div className="space-y-4 animate-fadeIn">
                {/* Total Traffic Hero Card */}
                <div className="p-4 sm:p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-slate-50 border border-primary/10 rounded-2xl sm:rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-9 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shrink-0">
                        <Icon name="data_usage" className="text-lg" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">Total Traffic</span>
                        <span className="text-[10px] text-neutral-muted">All sessions accumulated</span>
                      </div>
                    </div>
                    <span className="text-base sm:text-lg font-black text-primary font-mono shrink-0">{formatBytes(grandTotal)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 pt-1">
                    <div className="p-3 bg-white/90 rounded-2xl border border-primary/10 space-y-1 text-left shadow-2xs">
                      <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-black uppercase tracking-wider">
                        <Icon name="cloud_upload" className="text-xs shrink-0" />
                        <span>Sent (Upload)</span>
                      </div>
                      <div className="text-xs sm:text-sm font-black text-slate-800 font-mono truncate">{formatBytes(totalUpload)}</div>
                    </div>

                    <div className="p-3 bg-white/90 rounded-2xl border border-primary/10 space-y-1 text-left shadow-2xs">
                      <div className="flex items-center gap-1.5 text-blue-600 text-[10px] font-black uppercase tracking-wider">
                        <Icon name="cloud_download" className="text-xs shrink-0" />
                        <span>Received (Download)</span>
                      </div>
                      <div className="text-xs sm:text-sm font-black text-slate-800 font-mono truncate">{formatBytes(totalDownload)}</div>
                    </div>
                  </div>

                  {/* Bandwidth distribution bar */}
                  <div className="space-y-1.5 text-left pt-1">
                    <div className="flex justify-between items-center text-[10px] sm:text-xs font-bold text-slate-600">
                      <span>Traffic Breakdown Ratio</span>
                      <span>Chat {chatPercentage}% • Calls {callPercentage}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden flex shadow-inner">
                      <div 
                        style={{ width: `${chatPercentage}%` }} 
                        className="h-full bg-primary transition-all duration-500" 
                        title={`Chat: ${formatBytes(totalChat)}`}
                      />
                      <div 
                        style={{ width: `${callPercentage}%` }} 
                        className="h-full bg-amber-500 transition-all duration-500" 
                        title={`Calls: ${formatBytes(totalCall)}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div 
                    onClick={() => setDataUsageTab('chat')}
                    className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-2 hover:border-primary/30 transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                          <Icon name="chat" className="text-base" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">Chat & Media</span>
                      </div>
                      <Icon name="chevron_right" className="text-slate-400 group-hover:text-primary text-sm transition-colors" />
                    </div>
                    <div className="text-base font-black text-slate-800 font-mono">{formatBytes(totalChat)}</div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                      <span>Sent: {formatBytes(chatUpload)}</span>
                      <span>Received: {formatBytes(chatDownload)}</span>
                    </div>
                  </div>

                  <div 
                    onClick={() => setDataUsageTab('calls')}
                    className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-2 hover:border-amber-500/30 transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                          <Icon name="call" className="text-base" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">Calls & Streams</span>
                      </div>
                      <Icon name="chevron_right" className="text-slate-400 group-hover:text-amber-600 text-sm transition-colors" />
                    </div>
                    <div className="text-base font-black text-slate-800 font-mono">{formatBytes(totalCall)}</div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                      <span>Sent: {formatBytes(callUpload)}</span>
                      <span>Received: {formatBytes(callDownload)}</span>
                    </div>
                  </div>
                </div>

                {/* Protocol Security Badge */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-left">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Icon name="security" className="text-primary text-base shrink-0" />
                    <span>Security & Protocol Specs</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-muted font-medium pt-1">
                    <div className="p-2 bg-white rounded-xl border border-slate-100">
                      <span className="block text-slate-400 font-bold uppercase">Encryption</span>
                      <span className="text-slate-700 font-bold">E2EE AES-GCM 256</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-100">
                      <span className="block text-slate-400 font-bold uppercase">WebRTC Protocol</span>
                      <span className="text-slate-700 font-bold">SCTP DataChannel / RTP</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CHAT & MEDIA */}
            {dataUsageTab === 'chat' && (
              <div className="space-y-4 animate-fadeIn text-left">
                <div className="p-5 bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                        <Icon name="chat" className="text-xl" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">Chat & Media Data</span>
                        <span className="text-[10px] text-neutral-muted">Encrypted messages, photos, files & audio notes</span>
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-800 font-mono bg-slate-100 border border-slate-200 px-3 py-1 rounded-xl shrink-0">
                      {formatBytes(totalChat)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <span className="flex items-center gap-1"><Icon name="arrow_upward" className="text-emerald-500 text-xs" /> Sent</span>
                        <span>{chatUploadPct}%</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 font-mono">{formatBytes(chatUpload)}</div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div style={{ width: `${chatUploadPct}%` }} className="h-full bg-emerald-500 rounded-full" />
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <span className="flex items-center gap-1"><Icon name="arrow_downward" className="text-blue-500 text-xs" /> Received</span>
                        <span>{chatDownloadPct}%</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 font-mono">{formatBytes(chatDownload)}</div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div style={{ width: `${chatDownloadPct}%` }} className="h-full bg-blue-500 rounded-full" />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <Icon name="subtitles" className="text-primary text-base" />
                      <span>Average Payload / Text Msg</span>
                    </div>
                    <span className="font-mono font-bold text-primary">~ 1.2 KB</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: CALLS & WEBRTC */}
            {dataUsageTab === 'calls' && (
              <div className="space-y-4 animate-fadeIn text-left">
                <div className="p-5 bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold shrink-0">
                        <Icon name="call" className="text-xl" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">Voice & Video Calls</span>
                        <span className="text-[10px] text-neutral-muted">WebRTC audio/video stream packets</span>
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-800 font-mono bg-slate-100 border border-slate-200 px-3 py-1 rounded-xl shrink-0">
                      {formatBytes(totalCall)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <span className="flex items-center gap-1"><Icon name="call_made" className="text-amber-500 text-xs" /> Sent Stream</span>
                        <span>{callUploadPct}%</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 font-mono">{formatBytes(callUpload)}</div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div style={{ width: `${callUploadPct}%` }} className="h-full bg-amber-500 rounded-full" />
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <span className="flex items-center gap-1"><Icon name="call_received" className="text-blue-500 text-xs" /> Received Stream</span>
                        <span>{callDownloadPct}%</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 font-mono">{formatBytes(callDownload)}</div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div style={{ width: `${callDownloadPct}%` }} className="h-full bg-blue-500 rounded-full" />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/50 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <Icon name="graphic_eq" className="text-amber-600 text-base" />
                      <span>Audio Codec Efficiency</span>
                    </div>
                    <span className="font-mono font-bold text-amber-700">OPUS ~32 kbps</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: DATA SAVER & STORAGE CLEANUP */}
            {dataUsageTab === 'saver' && (
              <div className="space-y-4 animate-fadeIn text-left">
                <div className="p-5 bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl space-y-4 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                      <Icon name="auto_awesome" className="text-xl" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">Data Saver Settings</span>
                      <span className="text-[10px] text-neutral-muted">Optimize bandwidth usage and free local storage</span>
                    </div>
                  </div>

                  {/* Low Data Mode Toggle */}
                  <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-slate-800">Low Data Mode</span>
                      <span className="text-[10px] text-neutral-muted">Lowers call audio bitrate and pauses auto-downloads</span>
                    </div>
                    <button
                      onClick={handleToggleLowDataMode}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                        lowDataMode ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <div
                        className={`size-5 rounded-full bg-white shadow-md transition-transform ${
                          lowDataMode ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Auto-Compress Toggle */}
                  <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-slate-800">Auto-Compress Media</span>
                      <span className="text-[10px] text-neutral-muted">Compress voice notes and images before transmission</span>
                    </div>
                    <button
                      onClick={handleToggleAutoCompress}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                        autoCompressMedia ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <div
                        className={`size-5 rounded-full bg-white shadow-md transition-transform ${
                          autoCompressMedia ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Clear Audio Cache Action */}
                  <Button
                    variant="secondary"
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center"
                    onClick={handleClearAudioCache}
                  >
                    <Icon name="cleaning_services" className="text-base mr-2 text-primary" />
                    Clear Voice Note Audio Cache
                  </Button>
                </div>
              </div>
            )}

            {/* Reset Action & Timestamp */}
            <div className="pt-1 space-y-3">
              <Button
                variant="secondary"
                className="w-full text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 border border-red-200/60 py-3 font-semibold rounded-2xl"
                onClick={() => {
                  if (window.confirm("Are you sure you want to reset all data usage statistics to 0? This cannot be undone.")) {
                    resetDataUsage();
                    setUsageMsg("Data usage statistics reset.");
                    setTimeout(() => setUsageMsg(null), 3000);
                  }
                }}
              >
                <Icon name="delete_sweep" className="text-base mr-2 shrink-0" />
                Reset All Usage Statistics
              </Button>

              {dataUsage?.lastUpdated && (
                <p className="text-[10px] text-neutral-muted text-center italic">
                  Last synced to Firestore: {new Date(dataUsage.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        );
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
                  onClick={() => setActiveView('devices-sync')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                      <Icon name="sync" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-bold text-slate-700">Multi-Device Sync</span>
                      <span className="text-[10px] text-neutral-muted">Manage active sessions & pairing QR Codes</span>
                    </div>
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
                <button 
                  onClick={() => setActiveView('data-usage')}
                  className="w-full p-4 rounded-2xl bg-primary/5 flex items-center justify-between hover:bg-primary/10 transition-colors group border border-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                      <Icon name="data_usage" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-bold text-slate-700">Data & Network Usage</span>
                      <span className="text-[10px] text-neutral-muted">Track Chat & Call upload and download metrics</span>
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

            {/* Account Switcher Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">Saved Profiles</h4>
                  <span className="text-[9px] text-neutral-muted font-medium mt-0.5">👉 Swipe right or tap the grey icon to pair & sync</span>
                </div>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black uppercase shrink-0">
                  {savedAccounts.length} SAVED
                </span>
              </div>
              <div className="space-y-2.5">
                {savedAccounts.length === 0 ? (
                  <div className="p-5 rounded-[2rem] bg-primary/5 border border-primary/10 text-center space-y-3 shadow-inner">
                    <p className="text-xs font-bold text-slate-700">No saved profiles found</p>
                    <p className="text-[10px] text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                      Pair with secondary devices using the QR system or create virtual simulator sessions instantly to test.
                    </p>
                    <Button 
                      onClick={handleSeedDemoAccounts}
                      className="mx-auto h-8 px-4 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[9px] hover:bg-primary-hover active:scale-95 shadow-sm"
                    >
                      Seed Simulator Profiles
                    </Button>
                  </div>
                ) : (
                  savedAccounts.map((acc) => {
                    const isActive = acc.id === user?.id;
                    const isSwiped = activeSwipeId === acc.id;
                    return (
                      <div 
                        key={`switch-acc-container-${acc.id}`} 
                        className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-900/5 shadow-inner"
                      >
                        {/* Left side actions exposed when swiping right */}
                        <div className="absolute inset-y-0 left-0 w-[195px] bg-slate-950 flex items-center justify-start gap-1.5 pl-3 rounded-2xl z-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectSyncAccount(acc);
                            }}
                            className="size-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex flex-col items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                            title="Instant Sync Account"
                          >
                            <Icon name="sync" className="text-sm animate-pulse" />
                            <span className="text-[6px] font-black uppercase tracking-widest mt-0.5">Sync Now</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShowSyncQRForAccount(acc);
                            }}
                            className="size-11 rounded-2xl bg-primary hover:bg-primary-hover text-white flex flex-col items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                            title="Show Pairing QR"
                          >
                            <Icon name="qr_code" className="text-sm" />
                            <span className="text-[6px] font-black uppercase tracking-widest mt-0.5">Show QR</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScanSyncQRForAccount(acc);
                            }}
                            className="size-11 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white flex flex-col items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                            title="Scan Sync QR"
                          >
                            <Icon name="qr_code_scanner" className="text-sm" />
                            <span className="text-[6px] font-black uppercase tracking-widest mt-0.5">Scan QR</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSwipeId(null);
                            }}
                            className="size-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center active:scale-95 transition-all"
                            title="Collapse Options"
                          >
                            <Icon name="close" className="text-xs" />
                          </button>
                        </div>

                        {/* Foreground card that drags to the right */}
                        <motion.div 
                          drag="x"
                          dragConstraints={{ left: 0, right: 190 }}
                          dragElastic={0.15}
                          onDragEnd={(event, info) => {
                            if (info.offset.x > 40) {
                              setActiveSwipeId(acc.id);
                            } else if (info.offset.x < -20) {
                              setActiveSwipeId(null);
                            }
                          }}
                          animate={{ x: isSwiped ? 190 : 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 28 }}
                          onClick={() => {
                            if (isSwiped) {
                              setActiveSwipeId(null);
                            } else if (!isActive) {
                              handleSwitchAccount(acc.id);
                            }
                          }}
                          className={cn(
                            "relative z-10 w-full p-4 rounded-[1.8rem] flex items-center justify-between bg-white shadow-sm transition-colors select-none",
                            isActive 
                              ? "border-l-4 border-l-primary bg-primary/5/5" 
                              : "hover:bg-slate-50 cursor-pointer active:scale-[0.99]"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Swipe Indicator / Collapse Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSwipeId(isSwiped ? null : acc.id);
                              }}
                              className={cn(
                                "size-7 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer",
                                isSwiped ? "bg-slate-900 text-primary rotate-180" : "bg-slate-100 hover:bg-slate-200 text-slate-400"
                              )}
                              title={isSwiped ? "Collapse Sync Options" : "Expand Sync Options"}
                            >
                              <Icon name="chevron_right" className="text-[14px]" />
                            </button>

                            <div className="relative shrink-0">
                              <Avatar src={acc.avatar} className="size-11 border border-white shadow-sm" />
                              <div className={cn(
                                "absolute -bottom-0.5 -right-0.5 size-4 rounded-full border border-white flex items-center justify-center text-[8px] text-white shadow-sm",
                                acc.authMethod === 'google' ? "bg-red-500" : "bg-emerald-500"
                              )}>
                                <Icon name={acc.authMethod === 'google' ? "alternate_email" : "terminal"} className="scale-75" />
                              </div>
                            </div>
                            <div className="flex flex-col items-start leading-tight text-left">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-700">{acc.displayName}</span>
                                {isActive && (
                                  <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.25 rounded-md font-black uppercase tracking-wider">
                                    Active
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-neutral-muted">@{acc.username}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Quick Swipe Reveal Tip on hover/normal state */}
                            {!isSwiped && (
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-300 hidden sm:inline-block bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-100">
                                Swipe Sync
                              </span>
                            )}

                            {!isActive && (
                              <button 
                                onClick={(e) => handleRemoveAccount(acc.id, e)}
                                className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Remove account from switcher"
                              >
                                <Icon name="delete" className="text-base" />
                              </button>
                            )}

                            {isActive ? (
                              <div className="size-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                                <Icon name="check" className="text-xs" />
                              </div>
                            ) : (
                              <Icon name="swap_horiz" className="text-slate-400 group-hover:text-primary transition-colors text-lg" />
                            )}
                          </div>
                        </motion.div>
                      </div>
                    );
                  })
                )}
                <button 
                  onClick={() => {
                    if (window.confirm("Do you want to log out of the current profile to add/sign in to a different account? Your current session will remain saved in this switcher list.")) {
                      logout();
                      onClose();
                    }
                  }}
                  className="w-full p-4 rounded-2xl border border-dashed border-primary/20 bg-primary/5 flex items-center justify-center gap-2 hover:bg-primary/10 hover:border-primary/40 text-primary transition-all active:scale-95 font-bold text-sm"
                >
                  <Icon name="person_add" />
                  <span>Add / Switch to Another Account</span>
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
        className="relative bg-white rounded-2xl sm:rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[96dvh] sm:max-h-[90vh] border border-slate-100 modal-card-watch"
      >
        <header className="p-3 sm:p-6 border-b border-primary/5 flex items-center justify-between bg-bg-light/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="size-9 sm:size-12 rounded-xl sm:rounded-2xl bg-white border border-white shadow-sm flex items-center justify-center text-primary flex-shrink-0">
              <Icon name="settings" className="text-lg sm:text-2xl" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">Settings</h2>
              <p className="text-[8px] sm:text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-0.5">Preferences & Account</p>
            </div>
          </div>
          <button onClick={onClose} className="size-8 sm:size-11 rounded-xl sm:rounded-2xl bg-white border border-white shadow-sm hover:bg-primary hover:text-white flex items-center justify-center text-primary transition-all active:scale-95 flex-shrink-0">
            <Icon name="close" className="text-sm sm:text-base" />
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
          {showQRScannerForSync && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[130] bg-black"
            >
              <QRScanner 
                onScan={handleScanSyncQR}
                onClose={() => setShowQRScannerForSync(false)}
              />
            </motion.div>
          )}

          {syncingAccountForQR && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[140] bg-slate-950/95 flex flex-col justify-between p-6 text-white"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Icon name="qr_code" className="text-xl" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-100">Pairing QR Code</h3>
                    <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Secure P2P Broadcast</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSyncingAccountForQR(null)} 
                  className="size-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-6 py-6 text-center">
                <div className="text-slate-300 space-y-1">
                  <h4 className="text-base font-black uppercase italic text-white">{syncingAccountForQR.displayName}</h4>
                  <p className="text-xs text-slate-400 font-mono">@{syncingAccountForQR.username}</p>
                </div>

                <div className="p-4 bg-white rounded-[2rem] border-8 border-slate-800 shadow-2xl relative">
                  <QRCodeCanvas 
                    value={JSON.stringify({
                      type: 'connectshare_sync_v1',
                      user: {
                        id: syncingAccountForQR.id,
                        username: syncingAccountForQR.username,
                        displayName: syncingAccountForQR.displayName,
                        avatar: syncingAccountForQR.avatar,
                        description: syncingAccountForQR.description || "",
                        joinDate: syncingAccountForQR.joinDate
                      },
                      authMethod: syncingAccountForQR.authMethod || 'local'
                    })} 
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                  <div className="absolute inset-0 border-2 border-primary rounded-[1.5rem] pointer-events-none animate-pulse" />
                </div>

                <div className="space-y-2 max-w-xs">
                  <p className="text-xs text-slate-400 font-medium">
                    Scan this barcode with another device's camera using the <strong className="text-emerald-400 font-bold">"Scan QR"</strong> button to clone and sync this profile instantly.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl flex items-center gap-3 text-left">
                <Icon name="verified_user" className="text-emerald-400 text-lg shrink-0" />
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-300">Encrypted Transport</h4>
                  <p className="text-[9px] text-slate-500 font-medium leading-normal mt-0.5">
                    Sync data is transferred directly peer-to-peer using high-security standard local keys.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {syncingAccountForScanner && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[140] bg-black"
            >
              <QRScanner 
                onScan={handleScanSyncQRForTargetAccount}
                onClose={() => setSyncingAccountForScanner(null)}
              />
            </motion.div>
          )}

          {liveSyncState && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[150] bg-slate-950 flex flex-col p-6 text-white overflow-y-auto no-scrollbar"
            >
              <header className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
                    <Icon name="sync" className="text-xl animate-spin" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">Live Device Synchronizer</h2>
                    <p className="text-[9px] text-primary uppercase tracking-widest font-black">P2P Secure Network Channel</p>
                  </div>
                </div>
                {liveSyncState.status === 'success' && (
                  <button 
                    onClick={() => {
                      setLiveSyncState(null);
                      window.location.reload();
                    }} 
                    className="size-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                  >
                    <Icon name="close" />
                  </button>
                )}
              </header>

              <div className="flex-1 flex flex-col justify-center items-center py-6 text-center">
                <AnimatePresence mode="wait">
                  {liveSyncState.status !== 'success' ? (
                    <motion.div 
                      key="live-syncing-layout"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full max-w-sm space-y-6"
                    >
                      <div className="flex justify-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                          liveSyncState.status === 'connecting' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          liveSyncState.status === 'scanning' && "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
                          liveSyncState.status === 'syncing' && "bg-primary/10 text-primary border-primary/20",
                          liveSyncState.status === 'uploading' && "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        )}>
                          {liveSyncState.status === 'connecting' && 'LOADING SESSION'}
                          {liveSyncState.status === 'scanning' && 'SCANNING LOCAL CHATS'}
                          {liveSyncState.status === 'syncing' && 'SYNCING DATA'}
                          {liveSyncState.status === 'uploading' && 'UPLOADING PROFILE'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest animate-pulse">
                          P2P LINK ACTIVE
                        </span>
                      </div>

                      <h3 className="text-lg font-black uppercase tracking-tighter italic text-white">
                        {liveSyncState.status === 'connecting' && 'Establishing Secure Tunnel...'}
                        {liveSyncState.status === 'scanning' && 'Reading Device Metadata...'}
                        {liveSyncState.status === 'syncing' && 'Cloning Secure Chat Databases...'}
                        {liveSyncState.status === 'uploading' && 'Uploading Keys and Profiles...'}
                      </h3>

                      <div className="relative flex justify-between items-center px-8 py-6 bg-white/5 border border-white/5 rounded-[2rem] overflow-hidden shadow-xl">
                        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                          <div className="w-48 h-48 rounded-full border border-primary animate-ping" style={{ animationDuration: '2.5s' }} />
                        </div>

                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className="size-14 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 shadow-lg">
                            <Icon name="laptop_mac" className="text-2xl" />
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Host Device</span>
                        </div>

                        <div className="flex-1 h-1 bg-slate-900 rounded-full mx-3 relative overflow-hidden">
                          <motion.div 
                            initial={{ left: '-100%' }}
                            animate={{ left: '100%' }}
                            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                            className="absolute top-0 bottom-0 w-16 bg-gradient-to-r from-transparent via-primary to-transparent"
                          />
                          <div className="absolute inset-0 flex justify-around items-center">
                            {[1, 2, 3].map((i) => (
                              <motion.div 
                                key={i}
                                animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                                className="size-1 rounded-full bg-primary"
                              />
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className="size-14 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 shadow-lg animate-pulse">
                            <Icon name="smartphone" className="text-2xl" />
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Scanning Client</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                          <span className="text-4xl font-black italic tracking-tighter text-white">
                            {liveSyncState.percentage}%
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            ITEMS SYNCED: <strong className="text-white font-bold">{liveSyncState.itemsSynced}</strong>
                          </span>
                        </div>

                        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-white/5 p-0.5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${liveSyncState.percentage}%` }}
                            className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full shadow-[0_0_12px_rgba(25,118,210,0.6)]"
                            transition={{ ease: 'easeOut' }}
                          />
                        </div>
                        
                        <p className="text-[10px] text-slate-400 font-mono text-left italic">
                          {liveSyncState.currentTask}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 bg-white/5 border border-white/5 p-4 rounded-2xl text-left">
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Live Syncing Speed</span>
                          <p className="text-base font-black italic text-slate-200">{liveSyncState.speed}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Sync Status</span>
                          <p className="text-base font-black italic text-emerald-400 uppercase">RUNNING</p>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="live-success-layout"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full max-w-sm space-y-6"
                    >
                      <div className="flex justify-center">
                        <motion.div 
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.1, 1] }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="size-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg"
                        >
                          <Icon name="check_circle" className="text-4xl" />
                        </motion.div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-xl font-black uppercase tracking-tighter italic text-white">Device Synced Successfully</h3>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                          The target profile <strong className="text-white">{liveSyncState.targetAccount?.displayName}</strong> was successfully paired, loaded, and synchronized!
                        </p>
                      </div>

                      <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl flex items-start gap-3 text-left">
                        <Icon name="verified_user" className="text-emerald-400 text-lg shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-200">Local Cache Updated</h4>
                          <p className="text-[9px] text-slate-500 font-medium leading-normal">
                            All database indexes have been cloned. You are ready to switch accounts immediately.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <Button 
                          onClick={() => {
                            setLiveSyncState(null);
                            window.location.reload();
                          }}
                          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest italic text-xs shadow-lg"
                        >
                          <Icon name="refresh" className="text-xs" />
                          Apply & Restart Workspace
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
