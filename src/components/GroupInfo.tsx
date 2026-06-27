import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Icon, Avatar, Card, Button, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';

import { MediaGallery } from './MediaGallery';
import { QRCodeCanvas } from 'qrcode.react';

export const GroupInfo = ({ onClose }: { onClose: () => void }) => {
  const { 
    user: currentUser, 
    activeChatId, 
    activeGroupInfoId,
    setViewingUserId, 
    groupJoinRequests, 
    setGroupJoinRequests, 
    setActiveGroupCall, 
    updateChatAvatar, 
    updateChatSettings, 
    updateChatInfo,
    addChatMember,
    removeChatMember,
    toggleChatAdmin,
    deleteChat,
    leaveChat,
    chats,
    users
  } = useAppStore();
  const [memberSearch, setMemberSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [showEditName, setShowEditName] = useState(false);
  const [showEditDescription, setShowEditDescription] = useState(false);
  const [showFullAvatar, setShowFullAvatar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showDownloadNotice, setShowDownloadNotice] = useState<{ title: string, message: string, type: 'info' | 'error' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const groupQrRef = React.useRef<HTMLDivElement>(null);
  const cleanQrRef = React.useRef<HTMLDivElement>(null);
  const highResQrRef = React.useRef<HTMLDivElement>(null);
  
  const chat = chats.find(c => c.id === (activeGroupInfoId || activeChatId));
  const isAdmin = chat?.admins?.includes(currentUser?.id || '') || currentUser?.isAdmin; 
  const isCreator = chat?.admins?.[0] === currentUser?.id || (currentUser?.isAdmin && chat?.admins?.length === 0); 
  
  const canAdd = chat?.canAddMembers === 'everyone' || isCreator;
  const canEdit = chat?.canEditProfile === 'everyone' || isAdmin;
  const canCall = chat?.canStartCall === 'everyone' || isAdmin;

  const joinRequests = groupJoinRequests.filter(r => r.groupId === (activeGroupInfoId || activeChatId));

  const handleAvatarSelect = (url: string) => {
    const targetId = activeGroupInfoId || activeChatId;
    if (targetId) {
      updateChatAvatar(targetId, url);
      setShowAvatarPicker(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = activeGroupInfoId || activeChatId;
    if (file && targetId) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateChatAvatar(targetId, reader.result as string);
        setShowAvatarPicker(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadGroupQR = async () => {
    const qrCanvas = groupQrRef.current?.querySelector('canvas');
    const cleanQrCanvas = cleanQrRef.current?.querySelector('canvas');
    const highResQrCanvas = highResQrRef.current?.querySelector('canvas');
    if (!qrCanvas || !chat) return;

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
      if (chat.avatar && withAvatar) {
        try {
          const img = new Image();
          const isDataUrl = chat.avatar.startsWith('data:');
          if (!isDataUrl) {
            img.crossOrigin = 'anonymous';
          }
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = isDataUrl ? chat.avatar : chat.avatar + (chat.avatar.includes('?') ? '&' : '?') + 'cors=' + Date.now();
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
          console.warn('Group Avatar CORS failed, using placeholder', e);
          drawPlaceholderToCtx(targetCtx);
        }
      } else if (chat.avatar) {
        drawPlaceholderToCtx(targetCtx);
      }

      // Group Info - Modern Typography
      targetCtx.fillStyle = '#2D2D2D';
      targetCtx.textAlign = 'center';
      targetCtx.shadowColor = 'rgba(0,0,0,0.1)';
      targetCtx.shadowBlur = 4;
      targetCtx.shadowOffsetY = 2;
      targetCtx.font = '900 28px Inter, sans-serif';
      targetCtx.fillText(chat.name || '', width / 2, 260);
      
      targetCtx.shadowBlur = 0;
      targetCtx.shadowOffsetY = 0;
      targetCtx.fillStyle = '#E67E6E';
      targetCtx.font = '800 18px Inter, sans-serif';
      targetCtx.fillText(`${chat.participants.length} Members`, width / 2, 295);

      if (chat.description) {
        targetCtx.fillStyle = '#64748b';
        targetCtx.font = '500 15px Inter, sans-serif';
        const words = chat.description.split(' ');
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
      targetCtx.fillText('SCAN TO JOIN GROUP', width / 2, 650);
      
      targetCtx.fillStyle = '#8E8E8E';
      targetCtx.font = 'italic 10px Inter, sans-serif';
      targetCtx.letterSpacing = '0px';
      targetCtx.fillText('Connect & Share • Group Invite', width / 2, 670);
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
      targetCtx.fillText((chat.name || 'G').charAt(0).toUpperCase(), width / 2, 140);
      targetCtx.textBaseline = 'alphabetic';
    };

    try {
      try {
        const url = await generateDownload(true);
        if (!url) throw new Error('Failed to generate canvas');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${chat.name}_group_card.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.warn('First attempt failed (likely tainted), retrying without avatar...', err);
        const url = await generateDownload(false);
        if (!url) throw new Error('Failed to generate canvas');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${chat.name}_group_card.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowDownloadNotice({
          title: 'Download Note',
          message: 'Group card was downloaded without the group picture due to security restrictions.',
          type: 'info'
        });
      }
    } catch (error: any) {
      console.error('Download failed:', error);
      const isTainted = error.message?.toLowerCase().includes('tainted') || 
                        error.message?.toLowerCase().includes('insecure') ||
                        error.name === 'SecurityError';
      
      if (isTainted) {
        setShowDownloadNotice({
          title: 'Download Failed',
          message: 'The group card contains external images that could not be processed securely. Try again or take a screenshot.',
          type: 'error'
        });
      } else {
        setShowDownloadNotice({
          title: 'Download Error',
          message: 'Failed to download group card. Please try again.',
          type: 'error'
        });
      }
    }
  };

  if (!chat || !chat.isGroup) return null;

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 md:relative md:inset-auto md:w-80 lg:w-96 h-full z-[100] md:z-0 bg-bg-light flex flex-col border-l border-primary/10"
    >
      <header className="px-6 py-4 flex items-center justify-between border-b border-primary/5 bg-bg-light sticky top-0 z-30 min-h-[73px]">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-primary hover:bg-white size-10 rounded-full flex items-center justify-center transition-all active:scale-95 border border-transparent hover:border-white shadow-sm">
            <Icon name="chevron_left" />
          </button>
          <h3 className="font-bold text-slate-900">Group Info</h3>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="text-primary hover:bg-white size-10 rounded-full flex items-center justify-center transition-all active:scale-95 border border-transparent hover:border-white shadow-sm"
          >
            <Icon name="settings" />
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar">
        <div className="bg-bg-light p-8 flex flex-col items-center gap-4 border-b border-primary/5 relative">
          <div className="relative group/avatar">
            <Avatar 
              src={chat.avatar!} 
              className="size-32 border-4 border-primary/10 cursor-pointer group-hover/avatar:scale-105 transition-transform overflow-hidden" 
              onClick={() => setShowFullAvatar(true)}
            />
            {canEdit && (
              <div className="absolute inset-0 rounded-[35%] bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <Icon name="edit" className="text-white text-2xl" />
              </div>
            )}
            {canEdit && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAvatarPicker(true);
                }}
                className="absolute bottom-0 right-0 size-10 rounded-full bg-primary text-white border-4 border-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform active:scale-95 z-10"
              >
                <Icon name="edit" className="text-sm" />
              </button>
            )}
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">{chat.name}</h2>
              {canEdit && (
                <button 
                  onClick={() => {
                    setEditValue(chat.name);
                    setShowEditName(true);
                  }}
                  className="size-8 rounded-xl bg-primary/5 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all active:scale-90 shadow-sm"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
              )}
            </div>
            <p className="text-sm text-neutral-muted">{chat.participants.length} members</p>
            {!isAdmin && (
              <button 
                onClick={() => toggleChatAdmin(chat.id, currentUser!.id)}
                className="mt-2 text-[10px] font-bold text-primary uppercase tracking-widest hover:underline"
              >
                Claim Admin Role
              </button>
            )}
          </div>
          <div className="flex gap-6">
            <button 
              onClick={() => canCall && setActiveGroupCall({ type: 'voice' })}
              disabled={!canCall}
              className={cn(
                "flex flex-col items-center gap-1.5 group",
                !canCall && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="size-12 rounded-2xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all active:scale-90 shadow-sm border border-white">
                <Icon name="call" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-muted">Audio</span>
            </button>
            <button 
              onClick={() => canCall && setActiveGroupCall({ type: 'video' })}
              disabled={!canCall}
              className={cn(
                "flex flex-col items-center gap-1.5 group",
                !canCall && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="size-12 rounded-2xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all active:scale-90 shadow-sm border border-white">
                <Icon name="videocam" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-muted">Video</span>
            </button>
            <button 
              onClick={() => canAdd && setShowAddFriendModal(true)}
              disabled={!canAdd}
              className={cn(
                "flex flex-col items-center gap-1.5 group",
                !canAdd && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="size-12 rounded-2xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all active:scale-95 shadow-sm border border-white">
                <Icon name="person_add" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-muted">Add</span>
            </button>
            <button 
              onClick={() => setShowInviteModal(true)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className="size-12 rounded-2xl bg-white flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all active:scale-95 shadow-sm border border-white">
                <Icon name="share" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-muted">Invite</span>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {isCreator && joinRequests.length > 0 && (
            <section className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary px-2">Join Requests ({joinRequests.length})</h4>
              <div className="space-y-2">
                {joinRequests.map(req => (
                  <Card key={req.id} className="p-3 flex items-center gap-3 bg-primary/5 border-primary/10">
                    <Avatar src={req.userAvatar} className="size-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{req.userName}</p>
                      <p className="text-[8px] text-neutral-muted uppercase tracking-widest">{req.timestamp}</p>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setGroupJoinRequests(groupJoinRequests.filter(r => r.id !== req.id))}
                        className="size-8 rounded-lg bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/20 active:scale-90 transition-all"
                      >
                        <Icon name="close" className="text-sm" />
                      </button>
                      <button 
                        onClick={() => setGroupJoinRequests(groupJoinRequests.filter(r => r.id !== req.id))}
                        className="size-8 rounded-lg bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 active:scale-90 transition-all"
                      >
                        <Icon name="check" className="text-sm" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex justify-between items-center px-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">Description</h4>
            </div>
            <Card 
              className={cn(
                "p-4 text-sm text-slate-600 relative group/desc",
                canEdit && "cursor-pointer hover:bg-primary/5 transition-colors"
              )}
              onClick={() => {
                if (canEdit) {
                  setEditValue(chat.description || 'Planning for the upcoming weekend trip! 🏔️ Don\'t forget to bring your hiking gear.');
                  setShowEditDescription(true);
                }
              }}
            >
              <div className="pr-8">
                {chat.description || 'Planning for the upcoming weekend trip! 🏔️ Don\'t forget to bring your hiking gear.'}
              </div>
              {canEdit && (
                <div className="absolute top-4 right-4 size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover/desc:bg-primary group-hover:text-white transition-all shadow-sm">
                  <Icon name="edit" className="text-sm" />
                </div>
              )}
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex justify-between items-center px-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">Members</h4>
            </div>

            <div className="px-2">
              <div className="bg-primary/5 rounded-xl px-4 py-2 flex items-center gap-2 border border-primary/5 group focus-within:border-primary/20 transition-all">
                <Icon name="search" className="text-xs text-slate-400 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search members..." 
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-xs text-slate-700"
                />
              </div>
            </div>
            
            {isCreator && joinRequests.length > 0 && (
              <div className="px-2 space-y-2">
                <h5 className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">Join Requests</h5>
                {joinRequests.map(request => (
                  <div key={request.id} className="flex items-center justify-between p-3 bg-primary/5 rounded-2xl border border-primary/10">
                    <div className="flex items-center gap-3">
                      <Avatar src={request.userAvatar} className="size-8" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">{request.userName}</p>
                        <p className="text-[8px] text-neutral-muted uppercase tracking-widest">Requested to join</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setGroupJoinRequests(groupJoinRequests.filter(r => r.id !== request.id))}
                        className="size-8 rounded-xl bg-white text-slate-400 flex items-center justify-center shadow-sm border border-primary/5"
                      >
                        <Icon name="close" className="text-sm" />
                      </button>
                      <button 
                        onClick={() => setGroupJoinRequests(groupJoinRequests.filter(r => r.id !== request.id))}
                        className="size-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm"
                      >
                        <Icon name="check" className="text-sm" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="space-y-1">
              {chat.participants
                .filter(u => u.name.toLowerCase().includes(memberSearch.toLowerCase()))
                .map(member => (
                  <div key={member.id} className="flex items-center gap-4 p-3 hover:bg-primary/5 rounded-xl transition-colors relative group">
                    <Avatar 
                      src={member.avatar} 
                      className="size-10 cursor-pointer hover:scale-110 transition-transform" 
                      status={member.status} 
                      onClick={() => setViewingUserId(member.id)}
                    />
                    <div className="flex-1 cursor-pointer" onClick={() => setViewingUserId(member.id)}>
                      <h5 className="font-bold text-slate-800 text-sm">{member.name}</h5>
                      <p className="text-[10px] text-neutral-muted">{member.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {chat.admins?.includes(member.id) && (
                        <span className="text-[8px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-full">Admin</span>
                      )}
                      {isAdmin && member.id !== currentUser?.id && (
                        <button 
                          onClick={() => setShowAdminMenu(showAdminMenu === member.id ? null : member.id)}
                          className="size-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
                        >
                          <Icon name="more_vert" className="text-sm" />
                        </button>
                      )}
                    </div>

                    <AnimatePresence>
                      {showAdminMenu === member.id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, x: 10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: 10 }}
                          className="absolute right-12 top-1/2 -translate-y-1/2 bg-white shadow-xl border border-primary/10 rounded-xl p-1 z-20 flex flex-col min-w-[140px]"
                        >
                          <button 
                            onClick={() => {
                              setViewingUserId(member.id);
                              setShowAdminMenu(null);
                            }}
                            className="flex items-center gap-2 p-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 rounded-lg"
                          >
                            <Icon name="person" className="text-xs" /> View Profile
                          </button>
                          {!chat.admins?.includes(member.id) ? (
                            <button 
                              onClick={() => {
                                toggleChatAdmin(chat.id, member.id);
                                setShowAdminMenu(null);
                              }}
                              className="flex items-center gap-2 p-2 text-[10px] font-bold text-primary hover:bg-primary/5 rounded-lg"
                            >
                              <Icon name="admin_panel_settings" className="text-xs" /> Make Admin
                            </button>
                          ) : member.id !== chat.admins?.[0] && (
                            <button 
                              onClick={() => {
                                toggleChatAdmin(chat.id, member.id);
                                setShowAdminMenu(null);
                              }}
                              className="flex items-center gap-2 p-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 rounded-lg"
                            >
                              <Icon name="remove_moderator" className="text-xs" /> Remove Admin
                            </button>
                          )}
                          {member.id !== chat.admins?.[0] && (
                            <button 
                              onClick={() => {
                                removeChatMember(chat.id, member.id);
                                setShowAdminMenu(null);
                              }}
                              className="flex items-center gap-2 p-2 text-[10px] font-bold text-red-500 hover:bg-red-50 rounded-lg"
                            >
                              <Icon name="person_remove" className="text-xs" /> Remove Member
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-2">Media, Links & Docs</h4>
            <Card 
              onClick={() => setShowMediaGallery(true)}
              className="flex items-center gap-3 p-3 cursor-pointer hover:border-primary/20 transition-all group"
            >
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="size-10 rounded-lg bg-slate-200 border-2 border-white overflow-hidden">
                    <img src={`https://picsum.photos/seed/media${i}/100`} alt="media" className="size-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-800">124 items</p>
                <p className="text-[8px] text-neutral-muted uppercase tracking-widest">Swipe to browse</p>
              </div>
              <Icon name="chevron_right" className="text-neutral-muted group-hover:text-primary transition-colors" />
            </Card>
          </section>

          <div className="space-y-2 pt-4">
            {isAdmin && (
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full p-4 flex items-center gap-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-colors"
              >
                <Icon name="delete_forever" />
                Delete Group Entirely
              </button>
            )}
            <button 
              onClick={() => setShowLeaveConfirm(true)}
              className="w-full p-4 flex items-center gap-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-colors"
            >
              <Icon name="logout" />
              Leave Group
            </button>
            <button 
              onClick={() => setShowReportModal(true)}
              className="w-full p-4 flex items-center gap-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-colors"
            >
              <Icon name="report" />
              Report Group
            </button>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm text-center shadow-2xl border border-red-100"
            >
              <div className="size-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-6">
                <Icon name="delete_forever" className="text-4xl" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight italic">Delete Group?</h3>
              <p className="text-sm text-neutral-muted mb-8 leading-relaxed">
                This will permanently delete <span className="font-bold text-slate-800">"{chat.name}"</span> and all its messages for everyone. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button variant="primary" className="flex-1 bg-red-500 hover:bg-red-600 border-red-500" onClick={() => {
                  deleteChat(chat.id);
                  onClose();
                }}>Delete</Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showLeaveConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm text-center shadow-2xl border border-primary/5"
            >
              <div className="size-20 rounded-3xl bg-primary/5 text-primary flex items-center justify-center mx-auto mb-6">
                <Icon name="logout" className="text-4xl" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight italic">Leave Group?</h3>
              <p className="text-sm text-neutral-muted mb-8 leading-relaxed">
                Are you sure you want to leave <span className="font-bold text-slate-800">"{chat.name}"</span>? You won't receive any more messages from this group.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowLeaveConfirm(false)}>Stay</Button>
                <Button variant="primary" className="flex-1" onClick={() => {
                  if (currentUser) leaveChat(chat.id, currentUser.id);
                  onClose();
                }}>Leave</Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showReportModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl border border-primary/5"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="size-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                  <Icon name="report" className="text-3xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight italic">Report Group</h3>
                  <p className="text-[10px] font-bold text-neutral-muted uppercase tracking-widest">Help us keep the community safe</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-8">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted px-1">Reason for reporting</label>
                  <textarea 
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Describe the issue with this group..."
                    className="w-full bg-primary/5 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowReportModal(false)}>Cancel</Button>
                <Button 
                  variant="primary" 
                  className="flex-1 bg-amber-500 hover:bg-amber-600 border-amber-500"
                  onClick={() => {
                    setShowReportModal(false);
                    setReportReason('');
                    setShowDownloadNotice({
                      title: 'Report Submitted',
                      message: 'Thank you for reporting this group. Our moderation team will review it shortly.',
                      type: 'info'
                    });
                  }}
                >Submit Report</Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDownloadNotice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-xs text-center shadow-2xl border border-primary/5"
            >
              <div className={cn(
                "size-16 rounded-2xl flex items-center justify-center mx-auto mb-4",
                showDownloadNotice.type === 'error' ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"
              )}>
                <Icon name={showDownloadNotice.type === 'error' ? "error_outline" : "info_outline"} className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{showDownloadNotice.title}</h3>
              <p className="text-sm text-neutral-muted mb-6 leading-relaxed">{showDownloadNotice.message}</p>
              <Button className="w-full" onClick={() => setShowDownloadNotice(null)}>Understood</Button>
            </motion.div>
          </motion.div>
        )}

        {showMediaGallery && (
          <MediaGallery onClose={() => setShowMediaGallery(false)} groupId={(activeGroupInfoId || activeChatId)!} />
        )}
        {showAddFriendModal && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[110] bg-bg-light flex flex-col"
          >
            <header className="px-6 py-4 flex items-center gap-4 border-b border-primary/5 bg-bg-light sticky top-0 z-30 min-h-[73px]">
              <button onClick={() => setShowAddFriendModal(false)} className="text-primary hover:bg-white size-10 rounded-full flex items-center justify-center transition-all active:scale-95 border border-transparent hover:border-white shadow-sm">
                <Icon name="chevron_left" />
              </button>
              <h3 className="font-bold text-slate-900">Add Members</h3>
            </header>
            
            <div className="p-4">
              <div className="relative group">
                <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search friends..." 
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl bg-primary/5 border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
              {users
                .filter(u => !chat.participants.find(p => p.id === u.id))
                .filter(u => u.displayName?.toLowerCase().includes(addMemberSearch.toLowerCase()) || u.username?.toLowerCase().includes(addMemberSearch.toLowerCase()))
                .map(u => (
                  <div 
                    key={`add-member-${u.id}`}
                    onClick={() => {
                      addChatMember(chat.id, u.id);
                      setShowAddFriendModal(false);
                    }}
                    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-primary/5 transition-colors cursor-pointer group"
                  >
                    <Avatar src={u.avatar} className="size-12" status={u.isOnline ? 'online' : 'offline'} />
                    <div className="flex-1">
                      <p className="font-bold text-slate-800">{u.displayName}</p>
                      <p className="text-[10px] text-neutral-muted uppercase tracking-widest">{u.username}</p>
                    </div>
                    <button className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                      <Icon name="add" />
                    </button>
                  </div>
                ))}
              {users.filter(u => !chat.participants.find(p => p.id === u.id)).filter(u => u.displayName?.toLowerCase().includes(addMemberSearch.toLowerCase())).length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                  <Icon name="search_off" className="text-4xl mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest">No friends found</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {showInviteModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInviteModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Icon name="qr_code_2" className="text-3xl" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Group Invite</h3>
                <p className="text-xs text-neutral-muted">Scan to join or share the link below.</p>
              </div>

              <div className="flex justify-center p-4 bg-primary/5 rounded-3xl border border-primary/10" ref={groupQrRef}>
                <div className="bg-white p-4 rounded-2xl shadow-inner">
                  <QRCodeCanvas 
                    value={`${window.location.origin}?join=${chat.id}`}
                    size={160}
                    level="H"
                    includeMargin={false}
                    imageSettings={{
                      src: chat.avatar || "https://picsum.photos/seed/group/200",
                      x: undefined,
                      y: undefined,
                      height: 32,
                      width: 32,
                      excavate: true,
                    }}
                  />
                </div>
              </div>

              {/* Hidden high-res QR for downloads */}
              <div className="hidden" ref={highResQrRef}>
                <QRCodeCanvas 
                  value={`${window.location.origin}?join=${chat.id}`}
                  size={1000}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div className="hidden" ref={cleanQrRef}>
                <QRCodeCanvas 
                  value={`${window.location.origin}?join=${chat.id}`}
                  size={1000}
                  level="H"
                  includeMargin={false}
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-primary/5 break-all relative group">
                <p className="text-[10px] font-mono text-primary select-all pr-8">
                  {window.location.origin}?join={chat.id}
                </p>
                <Icon name="link" className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 text-xs" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button variant="secondary" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                <Button variant="secondary" onClick={handleDownloadGroupQR}>
                  <Icon name="download" className="text-sm" />
                </Button>
                <Button onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}?join=${chat.id}`);
                  setShowInviteModal(false);
                }}>Copy</Button>
              </div>
            </motion.div>
          </div>
        )}
        {showSettingsModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800">Permissions</h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-400"><Icon name="close" /></button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Send Messages</span>
                    <span className="text-[10px] text-neutral-muted uppercase tracking-widest">Chat access</span>
                  </div>
                  <select 
                    defaultValue={chat.canSendMessage === 'admins' ? 'Admins Only' : 'Everyone'}
                    onChange={(e) => updateChatSettings(chat.id, { canSendMessage: e.target.value === 'Admins Only' ? 'admins' : 'everyone' })}
                    className="bg-white border-none rounded-lg text-[10px] font-black uppercase tracking-widest text-primary outline-none px-3 py-1.5 shadow-sm"
                  >
                    <option>Everyone</option>
                    <option>Admins Only</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Add Members</span>
                    <span className="text-[10px] text-neutral-muted uppercase tracking-widest">Invite friends</span>
                  </div>
                  <select 
                    disabled={!isCreator}
                    defaultValue={chat.canAddMembers === 'admins' ? 'Admins Only' : 'Everyone'}
                    onChange={(e) => updateChatSettings(chat.id, { canAddMembers: e.target.value === 'Admins Only' ? 'admins' : 'everyone' })}
                    className={cn(
                      "bg-white border-none rounded-lg text-[10px] font-black uppercase tracking-widest text-primary outline-none px-3 py-1.5 shadow-sm",
                      !isCreator && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <option>Everyone</option>
                    <option>Admins Only</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Edit Group Info</span>
                    <span className="text-[10px] text-neutral-muted uppercase tracking-widest">Profile & Details</span>
                  </div>
                  <select 
                    defaultValue={chat.canEditProfile === 'admins' ? 'Admins Only' : 'Everyone'}
                    onChange={(e) => updateChatSettings(chat.id, { canEditProfile: e.target.value === 'Admins Only' ? 'admins' : 'everyone' })}
                    className="bg-white border-none rounded-lg text-[10px] font-black uppercase tracking-widest text-primary outline-none px-3 py-1.5 shadow-sm"
                  >
                    <option>Everyone</option>
                    <option>Admins Only</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Start Calls</span>
                    <span className="text-[10px] text-neutral-muted uppercase tracking-widest">Voice & Video</span>
                  </div>
                  <select 
                    defaultValue={chat.canStartCall === 'admins' ? 'Admins Only' : 'Everyone'}
                    onChange={(e) => updateChatSettings(chat.id, { canStartCall: e.target.value === 'Admins Only' ? 'admins' : 'everyone' })}
                    className="bg-white border-none rounded-lg text-[10px] font-black uppercase tracking-widest text-primary outline-none px-3 py-1.5 shadow-sm"
                  >
                    <option>Everyone</option>
                    <option>Admins Only</option>
                  </select>
                </div>
              </div>

              <Button className="w-full" onClick={() => setShowSettingsModal(false)}>Done</Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFullAvatar && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowFullAvatar(false)} 
              className="absolute inset-0 bg-black/90 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }} 
              className="relative max-w-lg w-full aspect-square rounded-[3rem] overflow-hidden shadow-2xl"
            >
              <img src={chat.avatar} className="size-full object-cover" referrerPolicy="no-referrer" />
              <button 
                onClick={() => setShowFullAvatar(false)}
                className="absolute top-6 right-6 size-12 rounded-2xl bg-black/20 backdrop-blur-md text-white flex items-center justify-center border border-white/10 hover:bg-white/20 transition-all"
              >
                <Icon name="close" />
              </button>
            </motion.div>
          </div>
        )}
        {showEditName && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditName(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-slate-800">Edit Group Name</h3>
              <input 
                type="text" 
                value={editValue} 
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full p-4 rounded-2xl bg-primary/5 border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm font-bold"
              />
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setShowEditName(false)}>Cancel</Button>
                <Button onClick={() => {
                  updateChatInfo(chat.id, { name: editValue });
                  setShowEditName(false);
                }}>Save</Button>
              </div>
            </motion.div>
          </div>
        )}
        {showEditDescription && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditDescription(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-slate-800">Edit Description</h3>
              <textarea 
                value={editValue} 
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full p-4 rounded-2xl bg-primary/5 border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm min-h-[120px] resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setShowEditDescription(false)}>Cancel</Button>
                <Button onClick={() => {
                  updateChatInfo(chat.id, { description: editValue });
                  setShowEditDescription(false);
                }}>Save</Button>
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
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Group Avatar</h3>
                <button onClick={() => setShowAvatarPicker(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {[
                  'https://picsum.photos/seed/group1/200',
                  'https://picsum.photos/seed/group2/200',
                  'https://picsum.photos/seed/group3/200',
                  'https://picsum.photos/seed/group4/200',
                  'https://picsum.photos/seed/group5/200',
                  'https://picsum.photos/seed/group6/200',
                ].map((url, i) => (
                  <button 
                    key={i} 
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
    </motion.div>
  );
};
