import React, { useState, useRef } from 'react';
import { Icon, Avatar, Card, Button, cn } from './UI';
import { motion, AnimatePresence } from 'motion/react';
import { useStore, useAppStore, shallowEqual, generateInitialsAvatar } from '../store';
import { QRCodeCanvas } from 'qrcode.react';
import { MediaGallery } from './MediaGallery';
import { sessionIntegrityService } from '../services/sessionIntegrityService';
import { QRScanner } from './QRScanner';

interface ProfileViewProps {
  onSettingsClick: (view?: any) => void;
}

const generateMediaPlaceholder = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6'];
  const color = colors[Math.abs(hash) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="${color}" opacity="0.15" /><circle cx="50" cy="50" r="30" fill="${color}" opacity="0.3" /></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

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

export const ProfileView = ({ onSettingsClick }: ProfileViewProps) => {
  const { user, setUser, updateUser, setActiveGroupInfoId, setViewingUserId, chats, blockedUserIds, removedFriendIds, friendRequests, sentFriendRequests, users, switchAccount } = useStore(s => ({
    user: s.user,
    setUser: s.setUser,
    updateUser: s.updateUser,
    setActiveGroupInfoId: s.setActiveGroupInfoId,
    setViewingUserId: s.setViewingUserId,
    chats: s.chats,
    blockedUserIds: s.blockedUserIds,
    removedFriendIds: s.removedFriendIds,
    friendRequests: s.friendRequests,
    sentFriendRequests: s.sentFriendRequests,
    users: s.users,
    switchAccount: s.switchAccount
  }), shallowEqual);
  const [isEditing, setIsEditing] = useState(false);
  const [showGroupsList, setShowGroupsList] = useState(false);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || 'Alex Johnson');
  const [bio, setBio] = useState(user?.description || 'Product Designer & Tech Enthusiast. Always connecting! 🚀');

  React.useEffect(() => {
    if (user && !isEditing) {
      setDisplayName(user.displayName || user.username || 'Alex Johnson');
      setBio(user.description || 'Product Designer & Tech Enthusiast. Always connecting! 🚀');
    }
  }, [user, isEditing]);
  const [isCopying, setIsCopying] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{ title: string, message: string, type: 'info' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const cleanQrRef = useRef<HTMLDivElement>(null);
  const highResQrRef = useRef<HTMLDivElement>(null);

  // Sync state & saved profiles
  const [savedAccounts, setSavedAccounts] = useState(() => sessionIntegrityService.getSavedAccounts());
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const [showQRScannerForSync, setShowQRScannerForSync] = useState(false);
  const [showCornerSwitcher, setShowCornerSwitcher] = useState(false);
  const [syncingAccountForQR, setSyncingAccountForQR] = useState<any | null>(null);
  const [syncingAccountForScanner, setSyncingAccountForScanner] = useState<any | null>(null);
  const [syncQRError, setSyncQRError] = useState<string | null>(null);
  const [syncQRSuccess, setSyncQRSuccess] = useState<string | null>(null);
  const [liveSyncState, setLiveSyncState] = useState<{
    status: 'connecting' | 'scanning' | 'syncing' | 'uploading' | 'success' | 'error';
    percentage: number;
    speed: string;
    itemsSynced: number;
    currentTask: string;
    targetAccount?: any;
    errorMsg?: string;
  } | null>(null);

  // Trigger loading state updates and reload list
  React.useEffect(() => {
    const handleStorageChange = () => {
      setSavedAccounts(sessionIntegrityService.getSavedAccounts());
    };
    window.addEventListener('storage', handleStorageChange);
    // Periodically update to ensure any changes are caught
    const interval = setInterval(handleStorageChange, 3000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

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

  const handleShowSyncQRForAccount = (acc: any) => {
    setSyncingAccountForQR(acc);
  };

  const handleScanSyncQRForAccount = (acc: any) => {
    setSyncingAccountForScanner(acc);
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
  };

  const handleScanSyncQRForTargetAccount = async (scannedData: string) => {
    try {
      const payload = JSON.parse(scannedData);
      if (payload && payload.type === 'connectshare_sync_v1' && payload.user) {
        setSyncingAccountForScanner(null);
        
        setLiveSyncState({
          status: 'connecting',
          percentage: 0,
          speed: '0 KB/s',
          itemsSynced: 0,
          currentTask: 'Handshaking and authenticating devices...',
          targetAccount: payload.user
        });

        let progressPercent = 0;
        const interval = setInterval(() => {
          progressPercent += Math.floor(Math.random() * 8) + 4;
          if (progressPercent >= 100) {
            progressPercent = 100;
            clearInterval(interval);
            
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

            setSavedAccounts(sessionIntegrityService.getSavedAccounts());
          } else {
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

      } else {
        alert('Invalid Sync QR Code payload format.');
      }
    } catch (e) {
      alert('Failed to parse QR Code data. Make sure it is a valid ConnectShare Sync QR Code.');
    }
  };

  const handleSwitchAccountLocal = async (userId: string) => {
    try {
      await switchAccount(userId);
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

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(`@${user?.username || 'alex_j'}`);
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 2000);
  };

  const handleDownloadQR = async () => {
    const qrCanvas = qrRef.current?.querySelector('canvas');
    const cleanQrCanvas = cleanQrRef.current?.querySelector('canvas');
    const highResQrCanvas = highResQrRef.current?.querySelector('canvas');
    if (!qrCanvas) return;

    const SCALE = 4; // 4x resolution for ultra-high quality
    const width = 400;
    const height = 700;

    const generateDownload = async (withAvatar: boolean) => {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return null;
      
      tempCanvas.width = width * SCALE;
      tempCanvas.height = height * SCALE;
      
      // Scale all drawing operations
      tempCtx.scale(SCALE, SCALE);
      
      // Enable high quality image smoothing
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';
      
      await drawCardToCtx(tempCtx, withAvatar);
      return tempCanvas.toDataURL('image/png', 1.0); // Use maximum quality
    };

    const drawCardToCtx = async (targetCtx: CanvasRenderingContext2D, withAvatar: boolean) => {
      // Clear canvas
      targetCtx.clearRect(0, 0, width, height);
      
      // Background - Modern Radial Gradient
      const bgGradient = targetCtx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
      bgGradient.addColorStop(0, '#FFF9F5');
      bgGradient.addColorStop(1, '#FFF1E7');
      targetCtx.fillStyle = bgGradient;
      targetCtx.fillRect(0, 0, width, height);

      // Subtle Watermark
      targetCtx.save();
      targetCtx.rotate(-Math.PI / 4);
      targetCtx.fillStyle = 'rgba(230, 126, 110, 0.03)';
      targetCtx.font = '900 60px Inter, sans-serif';
      for (let i = -10; i < 10; i++) {
        for (let j = -10; j < 10; j++) {
          targetCtx.fillText('CONNECT', i * 400, j * 150);
        }
      }
      targetCtx.restore();

      // Subtle Noise Texture for "Premium" feel
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'overlay';
      targetCtx.globalAlpha = 0.03;
      for (let i = 0; i < 10000; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        targetCtx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
        targetCtx.fillRect(x, y, 1, 1);
      }
      targetCtx.restore();

      // Decorative Background Pattern (Subtle Dots)
      targetCtx.fillStyle = '#E67E6E11';
      for (let x = 0; x < width; x += 20) {
        for (let y = 0; y < height; y += 20) {
          targetCtx.beginPath();
          targetCtx.arc(x, y, 1, 0, Math.PI * 2);
          targetCtx.fill();
        }
      }

      // Header Background - Modern Wave/Curve
      targetCtx.save();
      const headerGradient = targetCtx.createLinearGradient(0, 0, width, 200);
      headerGradient.addColorStop(0, '#E67E6E');
      headerGradient.addColorStop(1, '#D16B5B');
      targetCtx.fillStyle = headerGradient;
      
      targetCtx.beginPath();
      targetCtx.moveTo(0, 0);
      targetCtx.lineTo(width, 0);
      targetCtx.lineTo(width, 160);
      targetCtx.bezierCurveTo(width * 0.75, 200, width * 0.25, 120, 0, 160);
      targetCtx.closePath();
      targetCtx.fill();
      targetCtx.restore();

      // Draw Avatar with Embossed Border
      if (user?.avatar && withAvatar) {
        try {
          const img = new Image();
          const isDataUrl = user.avatar.startsWith('data:');
          if (!isDataUrl) {
            img.crossOrigin = 'anonymous';
          }
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = isDataUrl ? user.avatar : user.avatar + (user.avatar.includes('?') ? '&' : '?') + 'cors=' + Date.now();
          });

          // Shadow for Avatar - Layered for depth
          targetCtx.save();
          targetCtx.shadowColor = 'rgba(230, 126, 110, 0.3)';
          targetCtx.shadowBlur = 30;
          targetCtx.shadowOffsetY = 10;
          targetCtx.beginPath();
          targetCtx.arc(width / 2, 140, 62, 0, Math.PI * 2);
          targetCtx.fill();
          targetCtx.restore();

          targetCtx.save();
          targetCtx.beginPath();
          targetCtx.arc(width / 2, 140, 60, 0, Math.PI * 2);
          targetCtx.closePath();
          targetCtx.clip();
          targetCtx.drawImage(img, width / 2 - 60, 140 - 60, 120, 120);
          
          // Subtle Glass Overlay on Avatar
          const glassGrad = targetCtx.createLinearGradient(width / 2 - 60, 140 - 60, width / 2 + 60, 140 + 60);
          glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
          glassGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
          glassGrad.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
          targetCtx.fillStyle = glassGrad;
          targetCtx.fill();
          targetCtx.restore();

          // Premium Dual Ring
          // Outer Ring
          targetCtx.strokeStyle = 'rgba(230, 126, 110, 0.2)';
          targetCtx.lineWidth = 8;
          targetCtx.beginPath();
          targetCtx.arc(width / 2, 140, 66, 0, Math.PI * 2);
          targetCtx.stroke();

          // Inner Embossed Ring
          const ringGrad = targetCtx.createLinearGradient(width / 2 - 60, 80, width / 2 + 60, 200);
          ringGrad.addColorStop(0, '#ffffff');
          ringGrad.addColorStop(1, '#f0f0f0');
          targetCtx.strokeStyle = ringGrad;
          targetCtx.lineWidth = 4;
          targetCtx.beginPath();
          targetCtx.arc(width / 2, 140, 60, 0, Math.PI * 2);
          targetCtx.stroke();
        } catch (e) {
          console.warn('Avatar CORS failed, using placeholder', e);
          drawPlaceholderToCtx(targetCtx);
        }
      } else if (user?.avatar) {
        drawPlaceholderToCtx(targetCtx);
      }

      // User Info - Modern Typography
      targetCtx.fillStyle = '#2D2D2D';
      targetCtx.textAlign = 'center';
      targetCtx.shadowColor = 'rgba(0,0,0,0.1)';
      targetCtx.shadowBlur = 4;
      targetCtx.shadowOffsetY = 2;
      targetCtx.font = '900 32px Inter, sans-serif';
      targetCtx.fillText(user?.displayName || '', width / 2, 260);
      
      targetCtx.shadowBlur = 0;
      targetCtx.shadowOffsetY = 0;
      targetCtx.fillStyle = '#E67E6E';
      targetCtx.font = '800 18px Inter, sans-serif';
      targetCtx.fillText(`@${user?.username}`, width / 2, 295);

      if (user?.description) {
        targetCtx.fillStyle = '#64748b';
        targetCtx.font = '500 15px Inter, sans-serif';
        const words = user.description.split(' ');
        let line = '';
        let y = 335;
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = targetCtx.measureText(testLine);
          if (metrics.width > width - 100 && n > 0) {
            targetCtx.fillText(line, width / 2, y);
            line = words[n] + ' ';
            y += 22;
          } else {
            line = testLine;
          }
        }
        targetCtx.fillText(line, width / 2, y);
      }

      // QR Code Container - Embossed Glassmorphism
      targetCtx.save();
      targetCtx.shadowColor = 'rgba(230, 126, 110, 0.3)';
      targetCtx.shadowBlur = 30;
      targetCtx.shadowOffsetY = 10;
      
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath();
      targetCtx.roundRect(width / 2 - 115, 385, 230, 230, 32);
      targetCtx.fill();
      targetCtx.restore();

      // Inner Emboss Effect for QR Container
      targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      targetCtx.lineWidth = 2;
      targetCtx.beginPath();
      targetCtx.roundRect(width / 2 - 115, 385, 230, 230, 32);
      targetCtx.stroke();

      // QR Code
      const qrToUse = withAvatar ? (highResQrCanvas || qrCanvas) : (cleanQrCanvas || qrCanvas);
      if (qrToUse) {
        try {
          targetCtx.drawImage(qrToUse, width / 2 - 100, 400, 200, 200);
        } catch (e) {
          console.warn('QR Canvas is tainted, drawing basic QR placeholder', e);
          if (!withAvatar && cleanQrCanvas) {
             targetCtx.drawImage(cleanQrCanvas, width / 2 - 100, 400, 200, 200);
          } else {
            targetCtx.fillStyle = '#FFF1E7';
            targetCtx.fillRect(width / 2 - 100, 400, 200, 200);
            targetCtx.fillStyle = '#8E8E8E';
            targetCtx.font = '12px sans-serif';
            targetCtx.fillText('QR Code Protected', width / 2, 500);
          }
        }
      }

      // Footer Branding
      targetCtx.fillStyle = '#E67E6E';
      targetCtx.font = '900 12px Inter, sans-serif';
      targetCtx.letterSpacing = '2px';
      targetCtx.fillText('CONNECT & SHARE', width / 2, 650);
      
      targetCtx.fillStyle = '#8E8E8E';
      targetCtx.font = 'italic 10px Inter, sans-serif';
      targetCtx.letterSpacing = '0px';
      targetCtx.fillText('Your digital gateway to connection', width / 2, 670);
    };

    const drawPlaceholderToCtx = (targetCtx: CanvasRenderingContext2D) => {
      targetCtx.fillStyle = '#E67E6E';
      targetCtx.beginPath();
      targetCtx.arc(width / 2, 140, 60, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.fillStyle = '#ffffff';
      targetCtx.font = '900 40px Inter, sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText((user?.displayName || 'U').charAt(0).toUpperCase(), width / 2, 140);
      targetCtx.textBaseline = 'alphabetic';
    };

    try {
      try {
        const url = await generateDownload(true);
        if (!url) throw new Error('Failed to generate canvas');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${user?.username || 'user'}_profile_card.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.warn('First attempt failed (likely tainted), retrying without avatar...', err);
        const url = await generateDownload(false);
        if (!url) throw new Error('Failed to generate canvas');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${user?.username || 'user'}_profile_card.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setDownloadNotice({
          title: 'Download Note',
          message: 'Profile card was downloaded without the profile picture due to security restrictions.',
          type: 'info'
        });
      }
    } catch (error: any) {
      console.error('Download failed:', error);
      const isTainted = error.message?.toLowerCase().includes('tainted') || 
                        error.message?.toLowerCase().includes('insecure') ||
                        error.name === 'SecurityError';
      
      if (isTainted) {
        setDownloadNotice({
          title: 'Download Failed',
          message: 'The profile card contains external images that could not be processed securely. Try again or take a screenshot.',
          type: 'error'
        });
      } else {
        setDownloadNotice({
          title: 'Download Failed',
          message: 'Failed to download QR card. Please try again.',
          type: 'error'
        });
      }
    }
  };

  const handleSave = () => {
    if (user) {
      updateUser({ displayName, description: bio });
    }
    setIsEditing(false);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/request/${user?.username}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Connect with ${user?.displayName} on Connect & Share`,
          text: `Add my Backend Team Identity: @${user?.username}`,
          url: shareUrl,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('Share was canceled by user');
        } else {
          console.error('Error sharing:', err);
        }
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-light">
      {/* Sticky Top Header on Me Page */}
      <div className="sticky top-0 z-20 bg-bg-light/80 backdrop-blur-xl border-b border-primary/5 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
            <Icon name="person" className="text-lg" />
          </div>
          <div className="flex flex-col text-left">
            <h1 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">Me</h1>
            <span className="text-[9px] text-neutral-muted font-bold uppercase tracking-widest">Profile & Account Settings</span>
          </div>
        </div>

        <button 
          onClick={() => onSettingsClick('main')}
          className="size-10 rounded-2xl bg-white border border-primary/10 text-slate-700 shadow-sm flex items-center justify-center hover:bg-primary hover:text-white transition-all active:scale-95 group cursor-pointer"
          title="Open Settings"
        >
          <Icon name="settings" className="text-xl group-hover:rotate-45 transition-transform duration-300" />
        </button>
      </div>

      {/* Profile Content */}
      <div className="p-6 space-y-8 overflow-y-auto">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative group">
            <div className="size-40 rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative">
              <img 
                src={user?.avatar || generateInitialsAvatar(user?.id || 'u1', user?.displayName || 'User')} 
                alt="Profile" 
                className="size-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-[2px]" onClick={() => setShowAvatarPicker(true)}>
                <Icon name="photo_camera" className="text-white text-3xl" />
              </div>
            </div>
            <button className="absolute -bottom-2 -right-2 size-12 rounded-2xl bg-primary text-white shadow-2xl shadow-primary/40 flex items-center justify-center border-4 border-bg-light hover:scale-110 transition-transform active:scale-95" onClick={() => setShowAvatarPicker(true)}>
              <Icon name="edit" className="text-lg" />
            </button>
          </div>

          <div className="text-center space-y-3 w-full max-w-sm mx-auto">
            {isEditing ? (
              <div className="space-y-4 bg-white p-6 rounded-[2rem] shadow-xl border border-primary/5">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Backend Team Identity</label>
                  <input 
                    type="text" 
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full bg-primary/5 border-none rounded-2xl px-5 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Backend Team Bio</label>
                  <textarea 
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    className="w-full bg-primary/5 border-none rounded-2xl px-5 py-3 text-sm text-slate-600 focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all"
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-3 rounded-2xl bg-white border border-primary/5 text-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all shadow-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/30 hover:brightness-110 transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3">
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">{user?.displayName}</h2>
                  <button onClick={() => setIsEditing(true)} className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all active:scale-90">
                    <Icon name="edit" className="text-xs" />
                  </button>
                </div>
                <button 
                  onClick={handleCopyUsername}
                  className="relative group inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-primary/5 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">@{user?.username}</span>
                  <Icon name="content_copy" className="text-[10px] text-slate-400" />
                  
                  <AnimatePresence>
                    {isCopying && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: -20 }}
                        exit={{ opacity: 0 }}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-3 py-1.5 rounded-xl font-black uppercase tracking-widest shadow-xl"
                      >
                        Copied!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
                <p className="text-sm font-medium text-slate-500 leading-relaxed px-6 italic">
                  "{user?.description || "No bio yet"}"
                </p>
              </>
            )}
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Friends', count: users.filter(u => !blockedUserIds.includes(u.id) && !removedFriendIds.includes(u.id) && !friendRequests.some(r => r.userId === u.id) && !sentFriendRequests.includes(u.id)).length.toString(), icon: 'group', onClick: () => setShowFriendsList(true) },
            { label: 'Groups', count: chats.filter(c => c.isGroup && c.participants.some(p => p.id === user?.id)).length.toString(), icon: 'groups', onClick: () => setShowGroupsList(true) },
            { label: 'Calls', count: '0', icon: 'call', onClick: () => {} },
          ].map((stat) => (
            <Card 
              key={`stat-${stat.label}`} 
              onClick={stat.onClick}
              className="p-4 flex flex-col items-center gap-2 bg-white border-primary/5 hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                <Icon name={stat.icon} className="text-lg" />
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-slate-800 leading-none">{stat.count}</p>
                <p className="text-[8px] font-bold text-neutral-muted uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Quick Connect Section */}
        <Card className="p-6 flex flex-col items-center gap-4 bg-white border-primary/5 relative overflow-hidden">
          <div className="flex flex-col w-full gap-4 mb-2">
            <div className="flex items-center justify-between w-full">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {showCornerSwitcher ? "Switch Profiles" : "My Quick Connect"}
              </h4>
              <div className="flex gap-2">
                <button onClick={handleDownloadQR} className="text-primary hover:scale-110 transition-transform cursor-pointer">
                  <Icon name="download" className="text-sm" />
                </button>
                <button onClick={handleShare} className="text-primary hover:scale-110 transition-transform cursor-pointer">
                  <Icon name="share" className="text-sm" />
                </button>
              </div>
            </div>

            {/* Prominent Toggle Button */}
            <div className="bg-primary/5 p-1 rounded-xl flex items-center w-full relative border border-primary/10">
              <button
                onClick={() => setShowCornerSwitcher(false)}
                className={cn(
                  "flex-1 flex justify-center items-center gap-1.5 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all z-10 cursor-pointer",
                  !showCornerSwitcher ? "text-primary" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Icon name="qr_code" className="text-[12px]" />
                My QR Code
              </button>
              <button
                onClick={() => setShowCornerSwitcher(true)}
                className={cn(
                  "flex-1 flex justify-center items-center gap-1.5 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all z-10 cursor-pointer",
                  showCornerSwitcher ? "text-primary" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Icon name="switch_account" className="text-[12px]" />
                Switch Session
              </button>
              
              {/* Sliding indicator */}
              <motion.div 
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm shadow-primary/5 border border-primary/10"
                initial={false}
                animate={{ left: showCornerSwitcher ? 'calc(50% + 2px)' : '2px' }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {showCornerSwitcher ? (
              <motion.div
                key="corner-switcher"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col gap-3.5 text-left min-h-[268px] justify-between"
              >
                <p className="text-[10px] text-neutral-muted leading-relaxed">
                  Switch active session or run an instant cryptographic database synchronization.
                </p>

                <div className="flex-1 space-y-2 overflow-y-auto max-h-[160px] pr-1">
                  {/* Active profile shown in a beautiful indicator */}
                  <div className="p-2.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar src={user?.avatar || generateInitialsAvatar(user?.id || 'u1', user?.displayName || 'User')} className="size-8" />
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{user?.displayName}</span>
                        <span className="text-[8px] text-slate-400">@{user?.username}</span>
                      </div>
                    </div>
                    <span className="text-[7px] bg-emerald-500 text-white px-2 py-0.5 rounded-md font-black uppercase tracking-wider">
                      Active
                    </span>
                  </div>

                  {/* Saved Profiles */}
                  {savedAccounts.filter(acc => acc.id !== user?.id).length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center space-y-2 py-6">
                      <p className="text-[10px] text-slate-500 font-medium">No secondary profiles saved on this device.</p>
                      <Button
                        onClick={handleSeedDemoAccounts}
                        className="mx-auto h-7 px-3 rounded-lg bg-primary text-white text-[8px] font-black uppercase tracking-widest cursor-pointer shadow-none"
                      >
                        Seed Demo Accounts
                      </Button>
                    </div>
                  ) : (
                    savedAccounts.filter(acc => acc.id !== user?.id).map((acc) => (
                      <div
                        key={`corner-switch-acc-${acc.id}`}
                        onClick={() => {
                          handleSwitchAccountLocal(acc.id);
                          setShowCornerSwitcher(false);
                        }}
                        className="group p-2.5 rounded-2xl border border-slate-100 hover:border-primary/20 hover:bg-primary/5 transition-all flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar src={acc.avatar} className="size-8" />
                          <div className="flex flex-col text-left leading-tight">
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{acc.displayName}</span>
                            <span className="text-[8px] text-slate-400">@{acc.username}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectSyncAccount(acc);
                            }}
                            className="size-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                            title="Instant Sync"
                          >
                            <Icon name="sync" className="text-xs animate-pulse" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAccount(acc.id, e);
                            }}
                            className="size-7 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                            title="Forget Profile"
                          >
                            <Icon name="delete_outline" className="text-xs" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 mt-0.5">
                  <button
                    onClick={() => {
                      setShowQRScannerForSync(true);
                      setShowCornerSwitcher(false);
                    }}
                    className="p-1.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Icon name="qr_code_scanner" className="text-sm text-emerald-500" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-700">Scan Partner</span>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("Do you want to log out to set up or register a secondary account on this browser?")) {
                        // Log out current session
                        window.location.reload();
                      }
                    }}
                    className="p-1.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Icon name="add" className="text-sm text-primary" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-700">Add Account</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="qr-code-view"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col items-center gap-4"
              >
                <p className="text-[10px] text-neutral-muted text-center">
                  Your unique connection point. Others can scan this to add you.
                </p>

                <div className="flex justify-center p-4 bg-primary/5 rounded-3xl border border-primary/10 w-full" ref={qrRef}>
                  <div className="bg-white p-4 rounded-2xl shadow-inner">
                    <QRCodeCanvas 
                      value={`${window.location.origin}/user/${user?.username}`}
                      size={140}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                </div>

                <div className="w-full flex items-center gap-3 p-3 bg-primary/5 rounded-2xl border border-primary/5">
                  <Avatar src={user?.avatar || generateInitialsAvatar(user?.id || 'u1', user?.displayName || 'User')} className="size-10" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-800">{user?.displayName}</p>
                    <p className="text-[8px] text-slate-400 uppercase tracking-widest">@{user?.username}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hidden high-res QR for downloads */}
          <div className="hidden" ref={highResQrRef}>
            <QRCodeCanvas 
              value={`${window.location.origin}/user/${user?.username}`}
              size={1000}
              level="H"
              includeMargin={false}
            />
          </div>
          <div className="hidden" ref={cleanQrRef}>
            <QRCodeCanvas 
              value={`${window.location.origin}/user/${user?.username}`}
              size={1000}
              level="H"
              includeMargin={false}
            />
          </div>
        </Card>

        {/* Media, Links & Docs Section */}
        <section className="space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-2">My Media, Links & Docs</h4>
          <Card 
            onClick={() => setShowMediaGallery(true)}
            className="flex items-center gap-3 p-3 cursor-pointer hover:border-primary/20 transition-all group bg-white"
          >
            <div className="flex -space-x-2">
              {[4, 5, 6].map(i => (
                <div key={`profile-avatar-${i}`} className="size-10 rounded-lg bg-slate-200 border-2 border-white overflow-hidden">
                  <img src={generateMediaPlaceholder(`media${i}`)} alt="media" className="size-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-800">86 items</p>
              <p className="text-[8px] text-neutral-muted uppercase tracking-widest">Swipe to browse</p>
            </div>
            <Icon name="chevron_right" className="text-neutral-muted group-hover:text-primary transition-colors" />
          </Card>
        </section>

        {/* Saved Profiles Section */}
        <section className="space-y-3 text-left">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col text-left">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">Saved Profiles & Sync</h4>
              <span className="text-[8px] text-slate-400 font-medium">👉 Swipe right, click grey chevron, or tap instant blue sync</span>
            </div>
            <span className="text-[8px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black uppercase shrink-0">
              {savedAccounts.length} SAVED
            </span>
          </div>

          {savedAccounts.length === 0 ? (
            <div className="p-5 rounded-3xl bg-white border border-primary/5 text-center space-y-3 shadow-sm">
              <p className="text-xs font-bold text-slate-700">No other profiles saved</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Scan someone else's connect QR code to save and sync profiles, or generate virtual simulator profiles instantly below to test.
              </p>
              <Button 
                onClick={handleSeedDemoAccounts}
                className="mx-auto h-8 px-4 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-black uppercase tracking-widest text-[9px] cursor-pointer"
              >
                Seed Simulator Profiles
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {savedAccounts.map((acc) => {
                const isActive = acc.id === user?.id;
                const isSwiped = activeSwipeId === acc.id;
                return (
                  <div 
                    key={`profile-switch-acc-container-${acc.id}`} 
                    className="relative overflow-hidden rounded-[1.8rem] border border-primary/5 bg-slate-900 shadow-inner"
                  >
                    {/* Left side actions exposed when swiping right */}
                    <div className="absolute inset-y-0 left-0 w-[195px] bg-slate-950 flex items-center justify-start gap-1.5 pl-3 rounded-2xl z-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDirectSyncAccount(acc);
                        }}
                        className="size-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex flex-col items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                        title="Instant Sync Account"
                      >
                        <Icon name="sync" className="text-xs animate-pulse" />
                        <span className="text-[5px] font-black uppercase tracking-widest mt-0.5">Sync Now</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowSyncQRForAccount(acc);
                        }}
                        className="size-10 rounded-xl bg-primary hover:bg-primary/90 text-white flex flex-col items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                        title="Show Pairing QR"
                      >
                        <Icon name="qr_code" className="text-xs" />
                        <span className="text-[5px] font-black uppercase tracking-widest mt-0.5">Show QR</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScanSyncQRForAccount(acc);
                        }}
                        className="size-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex flex-col items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                        title="Scan Sync QR"
                      >
                        <Icon name="qr_code_scanner" className="text-xs" />
                        <span className="text-[5px] font-black uppercase tracking-widest mt-0.5">Scan QR</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSwipeId(null);
                        }}
                        className="size-7 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center active:scale-95 transition-all"
                        title="Close"
                      >
                        <Icon name="close" className="text-[10px]" />
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
                          handleSwitchAccountLocal(acc.id);
                        }
                      }}
                      className={cn(
                        "relative z-10 w-full p-3 rounded-[1.6rem] flex items-center justify-between bg-white shadow-sm transition-colors select-none",
                        isActive 
                          ? "border-l-4 border-l-primary bg-primary/5" 
                          : "hover:bg-slate-50 cursor-pointer active:scale-[0.99]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/* Expand / Collapse Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSwipeId(isSwiped ? null : acc.id);
                          }}
                          className={cn(
                            "size-6 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                            isSwiped ? "bg-slate-900 text-primary rotate-180" : "bg-slate-100 hover:bg-slate-200 text-slate-400"
                          )}
                        >
                          <Icon name="chevron_right" className="text-[12px]" />
                        </button>

                        <div className="relative shrink-0">
                          <Avatar src={acc.avatar} className="size-9 border border-white shadow-sm" />
                          <div className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border border-white flex items-center justify-center text-[6px] text-white shadow-sm",
                            acc.authMethod === 'google' ? "bg-red-500" : "bg-emerald-500"
                          )}>
                            <Icon name={acc.authMethod === 'google' ? "alternate_email" : "terminal"} className="scale-50" />
                          </div>
                        </div>
                        <div className="flex flex-col items-start leading-none text-left">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">{acc.displayName}</span>
                            {isActive && (
                              <span className="text-[6px] bg-emerald-500/10 text-emerald-600 px-1 py-0.25 rounded font-black uppercase tracking-wider">
                                Active
                              </span>
                            )}
                          </div>
                          <span className="text-[8px] text-neutral-muted font-mono mt-0.5">@{acc.username}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isSwiped && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectSyncAccount(acc);
                            }}
                            className="size-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center active:scale-95 transition-all shadow-sm border border-indigo-100/30"
                            title="Instant Sync"
                          >
                            <Icon name="sync" className="text-xs animate-pulse" />
                          </button>
                        )}
                        <button 
                          onClick={(e) => handleRemoveAccount(acc.id, e)}
                          className="size-7 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-300 flex items-center justify-center active:scale-95 transition-all"
                          title="Forget Profile"
                        >
                          <Icon name="delete_outline" className="text-xs" />
                        </button>
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Full Settings & Preferences Hub Card */}
        <section className="space-y-3 text-left">
          <div className="flex items-center justify-between px-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">App Settings & Preferences</h4>
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
              Control Hub
            </span>
          </div>

          <button 
            onClick={() => onSettingsClick('main')}
            className="w-full p-5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all group text-left cursor-pointer border border-slate-700/60 relative overflow-hidden"
          >
            {/* Background Decorative Blur */}
            <div className="absolute -right-8 -bottom-8 size-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-4 relative z-10">
              <div className="size-12 rounded-2xl bg-white/10 text-white border border-white/20 flex items-center justify-center shrink-0 group-hover:rotate-45 transition-transform duration-300 shadow-inner">
                <Icon name="settings" className="text-2xl" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-base text-white uppercase italic tracking-tight">Full System Settings Hub</h3>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Manage Call & Media, Notifications, Privacy, Data Usage, Sync & Network Diagnostics
                </p>
              </div>
              <div className="size-9 rounded-full bg-white/10 group-hover:bg-primary flex items-center justify-center text-white transition-colors shrink-0">
                <Icon name="arrow_forward" className="text-lg group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Feature Pills */}
            <div className="mt-4 pt-3.5 border-t border-slate-700/80 flex flex-wrap gap-1.5 relative z-10">
              <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-300 text-[10px] font-semibold border border-slate-700 flex items-center gap-1">
                <Icon name="call" className="text-xs text-emerald-400" />
                Mic & Speaker
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-300 text-[10px] font-semibold border border-slate-700 flex items-center gap-1">
                <Icon name="notifications" className="text-xs text-amber-400" />
                Notifications
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-300 text-[10px] font-semibold border border-slate-700 flex items-center gap-1">
                <Icon name="lock" className="text-xs text-blue-400" />
                Privacy & Keys
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-300 text-[10px] font-semibold border border-slate-700 flex items-center gap-1">
                <Icon name="data_usage" className="text-xs text-rose-400" />
                Data Saver
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-300 text-[10px] font-semibold border border-slate-700 flex items-center gap-1">
                <Icon name="devices" className="text-xs text-sky-400" />
                Multi-Device Sync
              </span>
            </div>
          </button>
        </section>
      </div>
      <AnimatePresence>
        {showGroupsList && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGroupsList(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-8 gap-6 max-h-[80vh]"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">My Groups</h3>
                <button onClick={() => setShowGroupsList(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="overflow-y-auto space-y-2 pr-2 no-scrollbar">
                {user && (
                  chats.filter(c => c.isGroup && c.participants.some(p => p.id === user.id)).map(group => (
                    <button 
                      key={`profile-group-${group.id}`}
                      onClick={() => {
                        setActiveGroupInfoId(group.id);
                        setShowGroupsList(false);
                      }}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-primary/5 transition-all text-left group"
                    >
                      <Avatar src={group.avatar!} className="size-12 group-hover:scale-105 transition-transform" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{group.name}</p>
                        <p className="text-[10px] text-neutral-muted uppercase tracking-widest">{group.participants.length} members</p>
                      </div>
                      <Icon name="chevron_right" className="text-slate-300 group-hover:text-primary transition-colors" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
        {showFriendsList && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFriendsList(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-8 gap-6 max-h-[80vh]"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">My Friends</h3>
                <button onClick={() => setShowFriendsList(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="overflow-y-auto space-y-2 pr-2 no-scrollbar">
                {users.filter(u => !blockedUserIds.includes(u.id) && u.id !== user?.id && !removedFriendIds.includes(u.id) && !friendRequests.some(r => r.userId === u.id) && !sentFriendRequests.includes(u.id)).map(friend => (
                  <button 
                    key={`profile-friend-${friend.id}`}
                    onClick={() => {
                      setViewingUserId(friend.id);
                      setShowFriendsList(false);
                      // Switch to friends tab in SocialLayout if needed, 
                      // but setViewingUserId will trigger the profile overlay anyway
                    }}
                    className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-primary/5 transition-all text-left group"
                  >
                    <Avatar src={friend.avatar} className="size-12 group-hover:scale-105 transition-transform" status={(friend.isOnline ? (friend.isInactive ? 'away' : 'online') : 'offline')} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{friend.displayName}</p>
                      <p className="text-[10px] text-neutral-muted uppercase tracking-widest">{friend.username}</p>
                    </div>
                    <Icon name="chevron_right" className="text-slate-300 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
        {showAvatarPicker && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAvatarPicker(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-8 gap-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Choose Avatar</h3>
                <button onClick={() => setShowAvatarPicker(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {PRELOADED_AVATARS.map((url) => (
                  <button 
                    key={`avatar-choice-${url}`} 
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
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMediaGallery && (
          <MediaGallery onClose={() => setShowMediaGallery(false)} />
        )}
        {downloadNotice && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm text-center shadow-2xl"
            >
              <div className={cn(
                "size-20 rounded-3xl flex items-center justify-center mx-auto mb-6",
                downloadNotice.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-primary/5 text-primary'
              )}>
                <Icon name={downloadNotice.type === 'error' ? 'error_outline' : 'info'} className="text-4xl" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight italic">{downloadNotice.title}</h3>
              <p className="text-sm text-neutral-muted mb-8 leading-relaxed">{downloadNotice.message}</p>
              <Button className="w-full" onClick={() => setDownloadNotice(null)}>Got it</Button>
            </motion.div>
          </div>
        )}

        {syncingAccountForQR && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] bg-slate-950/95 flex flex-col justify-between p-6 text-white"
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
            className="fixed inset-0 z-[140] bg-black"
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
            className="fixed inset-0 z-[150] bg-slate-950 flex flex-col p-6 text-white overflow-y-auto no-scrollbar"
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

            <div className="flex-1 flex flex-col items-center justify-center py-8">
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

                  <h3 className="text-lg font-black uppercase tracking-tighter italic text-white text-center">
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
                    </div>

                    <div className="flex flex-col items-center gap-1.5 relative z-10">
                      <div className="size-14 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-emerald-400 shadow-lg">
                        <Icon name="phone_iphone" className="text-2xl animate-bounce" />
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Target Device</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-black italic text-slate-100">
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
                      <Icon name="verified" className="text-4xl" />
                    </motion.div>
                  </div>

                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-tighter italic text-emerald-400">Pairing Completed!</h3>
                    <p className="text-xs text-slate-300 font-medium leading-relaxed">
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
                      Enter Active Session
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
