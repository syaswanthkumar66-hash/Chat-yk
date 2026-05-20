import React, { useState, useRef } from 'react';
import { Icon, Avatar, Card, Button, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { QRCodeCanvas } from 'qrcode.react';
import { MediaGallery } from './MediaGallery';

interface ProfileViewProps {
  onSettingsClick: () => void;
}

const PRELOADED_AVATARS = [
  'https://picsum.photos/seed/avatar1/200',
  'https://picsum.photos/seed/avatar2/200',
  'https://picsum.photos/seed/avatar3/200',
  'https://picsum.photos/seed/avatar4/200',
  'https://picsum.photos/seed/avatar5/200',
  'https://picsum.photos/seed/avatar6/200',
];

export const ProfileView = ({ onSettingsClick }: ProfileViewProps) => {
  const { user, setUser, updateUser, setActiveGroupInfoId, setViewingUserId, chats, blockedUserIds, removedFriendIds, friendRequests, sentFriendRequests, users } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [showGroupsList, setShowGroupsList] = useState(false);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || 'Alex Johnson');
  const [bio, setBio] = useState(user?.description || 'Product Designer & Tech Enthusiast. Always connecting! 🚀');
  const [isCopying, setIsCopying] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{ title: string, message: string, type: 'info' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const cleanQrRef = useRef<HTMLDivElement>(null);
  const highResQrRef = useRef<HTMLDivElement>(null);

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
      setUser({ ...user, displayName, description: bio });
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
      {/* Profile Content */}
      <div className="p-6 space-y-8">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative group">
            <div className="size-40 rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative">
              <img 
                src={user?.avatar || "https://picsum.photos/seed/user/200"} 
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
        <Card className="p-6 flex flex-col items-center gap-4 bg-white border-primary/5">
          <div className="flex items-center justify-between w-full mb-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary">My Quick Connect</h4>
            <div className="flex gap-2">
              <button onClick={handleDownloadQR} className="text-primary hover:scale-110 transition-transform">
                <Icon name="download" className="text-sm" />
              </button>
              <button onClick={handleShare} className="text-primary hover:scale-110 transition-transform">
                <Icon name="share" className="text-sm" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-neutral-muted text-center">Your unique connection point. Others can scan this to add you.</p>
          
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

          <div className="w-full flex items-center gap-3 p-3 bg-primary/5 rounded-2xl border border-primary/5">
            <Avatar src={user?.avatar || "https://picsum.photos/seed/user/200"} className="size-10" />
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-800">{user?.displayName}</p>
              <p className="text-[8px] text-slate-400 uppercase tracking-widest">@{user?.username}</p>
            </div>
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
                  <img src={`https://picsum.photos/seed/media${i}/100`} alt="media" className="size-full object-cover" referrerPolicy="no-referrer" />
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

        {/* Action List */}
        <div className="space-y-3">
          <button 
            onClick={onSettingsClick}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-3xl border border-primary/5 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
              <Icon name="settings" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-slate-800">Settings</p>
              <p className="text-[10px] text-neutral-muted">Privacy, security, and more</p>
            </div>
            <Icon name="chevron_right" className="text-neutral-muted" />
          </button>
        </div>
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
                    <Avatar src={friend.avatar} className="size-12 group-hover:scale-105 transition-transform" status={friend.isOnline ? 'online' : 'offline'} />
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
      </AnimatePresence>
    </div>
  );
};
