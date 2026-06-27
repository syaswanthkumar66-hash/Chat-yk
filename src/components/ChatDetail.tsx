import React, { useState, useRef, useEffect } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';
import { Icon, Avatar, Button, Card, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { GroupInfo } from './GroupInfo';
import { MediaGallery } from './MediaGallery';

const DecryptedMedia = ({ msg, isOwn }: { msg: any; isOwn: boolean }) => {
  const [url, setUrl] = useState(msg.fileUrl || msg.url);
  
  useEffect(() => {
    let active = true;
    const fetchDecrypted = async () => {
      if (!msg.encryptedFileKey) return; // not encrypted
      try {
        const { cryptoService } = await import('../services/cryptoService');
        const { compressionService } = await import('../services/compressionService');
        const res = await fetch(msg.fileUrl || msg.url);
        const encryptedBlob = await res.blob();
        
        let sharedSecret: CryptoKey;
        // Mock get proper shared secret
        // For standard app we store the shared secret, but for brevity we'll use a mocked decrypt if we don't have it directly in state.
        // Actually, we can fetch the remote pub key again.
        const remoteId = isOwn ? msg.recipientId : msg.senderId;
        const state = useAppStore.getState();
        const pubKeyBase64 = await new Promise<string>((resolve) => {
           state.socket?.emit("get_public_key", { userId: remoteId }, resolve);
        });
        sharedSecret = await cryptoService.deriveSharedSecret(remoteId, pubKeyBase64);

        const decryptedBlob = await cryptoService.decryptFile(encryptedBlob, msg.iv, sharedSecret, msg.type === 'audio' ? 'audio/webm' : (msg.type === 'file' ? 'application/octet-stream' : 'image/jpeg'));
        const decompressed = await compressionService.decompressFile(decryptedBlob).catch(() => decryptedBlob);
        if (active) setUrl(URL.createObjectURL(decompressed));
      } catch (e) {
        console.error("Decryption/Decompression failed", e);
      }
    };
    fetchDecrypted();
    return () => { active = false; };
  }, [msg, isOwn]);

  if (msg.type === 'image') {
    return (
      <div className="space-y-2">
        <img src={url} className="max-w-full rounded-xl" referrerPolicy="no-referrer" />
        {msg.text && <p className="text-sm">{msg.text}</p>}
      </div>
    );
  }
  
  if (msg.type === 'file') {
    return (
      <div className="flex items-center gap-3 min-w-[200px]">
        <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", isOwn ? "bg-white/20" : "bg-primary/10 text-primary")}>
          <Icon name="description" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className={cn("text-sm font-bold truncate", isOwn ? "text-white" : "text-slate-800")}>{msg.text || (msg.fileUrl ? (msg.fileUrl.startsWith('data:') ? 'Offline File' : msg.fileUrl.split('/').pop()) : 'File')}</p>
          <div className={cn("text-[10px] font-bold uppercase tracking-widest mt-1 opacity-70", isOwn ? "text-white" : "text-slate-400")}>
            {msg.fileSize || 'FILE'}
          </div>
        </div>
        <a href={url} download={msg.text || 'file'} className={cn("size-10 rounded-full flex items-center justify-center shrink-0 hover:bg-black/10 transition-colors", isOwn ? "text-white" : "text-primary")}>
          <Icon name="download" />
        </a>
      </div>
    );
  }

  if (msg.type === 'audio') {
    return (
      <div className="flex items-center gap-3 min-w-[200px]">
        <button className={cn("size-10 rounded-full flex items-center justify-center", isOwn ? "bg-white/20" : "bg-primary/10 text-primary")}>
          <Icon name="play_arrow" />
        </button>
        <div className="flex-1">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
             <div className="h-full bg-current w-0" />
          </div>
          <div className={cn("text-[10px] mt-1 flex justify-between", isOwn ? "text-white/60" : "text-slate-400")}>
            <span>0:00</span>
            <span>{msg.fileSize || 'Voice'}</span>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

export const ChatDetail = () => {
  const { 
    user,
    activeChatId, 
    setActiveChatId, 
    activeRecipientId, 
    setActiveRecipientId,
    selectedMessageIds,
    toggleMessageSelection,
    setSelectedMessageIds,
    activeGroupCall,
    setActiveGroupCall,
    activeGroupInfoId,
    setActiveGroupInfoId,
    chats,
    typingUsers,
    sendMessage,
    users,
    deletedMsgIds,
    globallyDeletedIds,
    deleteMessageLocally,
    deleteMessageGlobally
  } = useAppStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [cleared, setCleared] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showDeleteEveryoneConfirm, setShowDeleteEveryoneConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string, text: string, sender: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<{ type: 'image' | 'audio' | 'file', url: string, blob: Blob, name?: string }[]>([]);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [showMicError, setShowMicError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string, text: string, isOwn: boolean } | null>(null);

  const longPressTimer = useRef<any>(null);
  const lastTap = useRef<number>(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<any>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  const handleTyping = (text: string) => {
    setMessageText(text);
    
    // Only emit for 1-to-1 chats for simplicity or both. We can emit via socket.
    const socket = useAppStore.getState().socket;
    const targetId = activeRecipientId || chat?.participants.find(p => p.id !== user?.id)?.id;
    
    if (socket && targetId && chat && !chat.isGroup) {
      socket.emit('typing', { recipientId: targetId, isTyping: true });
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { recipientId: targetId, isTyping: false });
      }, 2000);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, id: string, text: string, isOwn: boolean) => {
    if (isSelectionMode) {
      toggleMessageSelection(id);
      return;
    }

    const now = Date.now();
    if (now - lastTap.current < 300) {
      toggleReaction(id);
      cancelLongPress();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;

    longPressTimer.current = setTimeout(() => {
      setIsSelectionMode(true);
      toggleMessageSelection(id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handleMessageClick = (id: string) => {
    if (isSelectionMode) {
      toggleMessageSelection(id);
      if (selectedMessageIds.length === 1 && selectedMessageIds.includes(id)) {
        setIsSelectionMode(false);
        setSelectedMessageIds([]);
      }
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const handleBack = () => {
    if (isSelectionMode) {
      cancelSelection();
    } else {
      setActiveChatId(null);
      setActiveRecipientId(null);
    }
  };

  const toggleReaction = (messageId: string) => {
    addReaction(messageId, '❤️');
  };

  const [messageText, setMessageText] = useState('');

  const chat = chats.find(c => c.id === activeChatId);
  const recipient = users.find(u => u.id === activeRecipientId);
  const messages = chat?.messages || [];

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText(prev => prev + emojiData.emoji);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setCapturedMedia(prev => [...prev, { type: 'audio', url: audioUrl, blob: audioBlob }]);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setShowMicError("Microphone access denied. Please enable microphone permissions in your browser settings to record voice messages.");
      } else {
        setShowMicError("Could not access microphone. Please ensure you have a working microphone connected.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCapturedMedia(prev => [...prev, { type: 'image', url, blob: file }]);
    }
  };

  const removeMedia = (index: number) => {
    setCapturedMedia(prev => {
      const newMedia = [...prev];
      URL.revokeObjectURL(newMedia[index].url);
      newMedia.splice(index, 1);
      return newMedia;
    });
  };

  const handleSend = async () => {
    if (!messageText.trim() && capturedMedia.length === 0) return;
    
    const targetId = activeRecipientId || chat?.participants.find(p => p.id !== user?.id)?.id;
    if (!targetId) return;

    // E2EE Setup
    let sharedSecret: CryptoKey | null = null;
    try {
      const { cryptoService } = await import('../services/cryptoService');
      const remotePubKeyBase64 = await new Promise<string>((resolve) => {
        useAppStore.getState().socket?.emit("get_public_key", { userId: targetId }, resolve);
      });
      if (remotePubKeyBase64) {
        sharedSecret = await cryptoService.deriveSharedSecret(targetId, remotePubKeyBase64);
      }
    } catch(e) {
      console.error("Failed to setup E2EE", e);
    }

    if (messageText.trim()) {
      let e2eData = undefined;
      const { cryptoService } = await import('../services/cryptoService');
      if (sharedSecret) {
        const encrypted = await cryptoService.encryptText(messageText, sharedSecret);
        e2eData = {
          encryptedText: JSON.stringify({ iv: encrypted.iv, ciphertext: encrypted.ciphertext }),
          iv: encrypted.iv
        };
      }
      sendMessage(activeChatId, activeRecipientId, messageText, 'text', undefined, undefined, e2eData);
    }

    // Handle media sending via server storage with Compression & E2EE
    for (const media of capturedMedia) {
      try {
        const { compressionService } = await import('../services/compressionService');
        const { cryptoService } = await import('../services/cryptoService');

        // Compression
        let processedBlob = media.blob;
        try {
          processedBlob = await compressionService.compressFile(media.blob);
        } catch(e) {
          console.error("Compression failed, using original file", e);
        }

        // Encryption
        let uploadBlob = processedBlob;
        let e2eFileIv: number[] | undefined = undefined;
        let originalTextStr = media.type === 'audio' ? 'Voice Message' : (media.type === 'file' ? media.name || 'File' : '');
        let encTextStr = originalTextStr;

        if (sharedSecret) {
          const encFile = await cryptoService.encryptFile(processedBlob, sharedSecret);
          uploadBlob = encFile.encryptedBlob;
          e2eFileIv = encFile.iv;
          if (originalTextStr) {
             const encText = await cryptoService.encryptText(originalTextStr, sharedSecret);
             encTextStr = JSON.stringify({ iv: encText.iv, ciphertext: encText.ciphertext });
          }
        }

        const fileSizeStr = `${(uploadBlob.size / 1024 / 1024).toFixed(2)} MB`;
        const isOffline = !navigator.onLine || !useAppStore.getState().socket?.connected;

        if (isOffline) {
          console.log("Offline detected, converting media to base64 data URL for offline Firebase storage...");
          const base64Url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(uploadBlob);
          });

          const e2eData = sharedSecret ? {
            encryptedText: encTextStr,
            iv: e2eFileIv!
          } : undefined;

          sendMessage(activeChatId, activeRecipientId, originalTextStr, media.type, base64Url, fileSizeStr, e2eData);
          continue;
        }

        let uploadSuccess = false;
        try {
          const formData = new FormData();
          formData.append('file', uploadBlob, media.type === 'audio' ? 'voice_note.webm' : (media.type === 'file' ? media.name || 'file.bin' : 'image.jpg'));
          if (user?.id) formData.append('userId', user.id);

          const response = await fetch(`${BACKEND_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });

          if (response.status === 429) {
            setToast("Daily 100MB quota exceeded!");
            break;
          }

          if (response.ok) {
            const data = await response.json();
            const e2eData = sharedSecret ? {
              encryptedText: encTextStr,
              iv: e2eFileIv! // using file iv just as placeholder, actual is inside encTextStr JSON
            } : undefined;

            sendMessage(activeChatId, activeRecipientId, originalTextStr, media.type as any, data.fileUrl, data.fileSize, e2eData);
            uploadSuccess = true;
          } else {
            console.error("Failed to upload media to server");
          }
        } catch (uploadErr) {
          console.warn("Upload request failed, falling back to offline base64 storage:", uploadErr);
        }

        if (!uploadSuccess) {
          console.log("Fallback to offline base64 storage in Firebase...");
          const base64Url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(uploadBlob);
          });

          const e2eData = sharedSecret ? {
            encryptedText: encTextStr,
            iv: e2eFileIv!
          } : undefined;

          sendMessage(activeChatId, activeRecipientId, originalTextStr, media.type, base64Url, fileSizeStr, e2eData);
        }
      } catch (error) {
        console.error("Error uploading media:", error);
      }
    }

    setMessageText('');
    setCapturedMedia([]);
    if (cleared) setCleared(false);
    if (replyTo) setReplyTo(null);
    setShowEmojiPicker(false);
  };

  const forwardMessage = (targetChatId: string) => {
    const selectedMsgs = messages.filter(m => selectedMessageIds.includes(m.id));
    selectedMsgs.forEach(msg => {
      sendMessage(targetChatId, null, msg.text || '', msg.type, msg.fileUrl, msg.fileSize, undefined, true);
    });
    setShowForward(false);
    cancelSelection();
    setToast('Forwarded successfully');
    setTimeout(() => setToast(null), 2000);
  };

  const addReaction = (msgId: string, emoji: string) => {
    setReactions(prev => {
      const current = prev[msgId] || [];
      if (current.includes(emoji)) {
        return { ...prev, [msgId]: current.filter(e => e !== emoji) };
      }
      return { ...prev, [msgId]: [...current, emoji] };
    });
    setShowReactionPicker(null);
  };

  const handleMessageAction = (action: string) => {
    if (selectedMessageIds.length === 0) return;
    
    const selectedMsgs = messages.filter(m => selectedMessageIds.includes(m.id));
    const firstMsg = selectedMsgs[0];

    switch (action) {
      case 'copy':
        const allText = selectedMsgs
          .map(m => m.text)
          .filter(Boolean)
          .join('\n');
        if (allText) {
          navigator.clipboard.writeText(allText);
          setToast('Copied to clipboard');
          setTimeout(() => setToast(null), 2000);
        }
        cancelSelection();
        break;
      case 'share':
        if (navigator.share && firstMsg) {
          navigator.share({ text: firstMsg.text || 'Media' })
            .catch(err => {
              if (err instanceof Error && err.name === 'AbortError') {
                console.log('Share was canceled by user');
              } else {
                console.error('Error sharing message:', err);
              }
            });
        }
        break;
      case 'forward':
        setShowForward(true);
        break;
      case 'reply':
        if (firstMsg) {
          setReplyTo({ 
            id: firstMsg.id, 
            text: firstMsg.text || (firstMsg.type === 'image' ? 'Image' : 'Media'), 
            sender: firstMsg.isOwn ? 'You' : firstMsg.senderName || 'Friend' 
          });
        }
        cancelSelection();
        break;
      case 'delete_me':
        selectedMessageIds.forEach(id => deleteMessageLocally(id));
        cancelSelection();
        break;
      case 'delete_everyone':
        setShowDeleteEveryoneConfirm(true);
        break;
    }
  };

  const handleContextMenu = (e: React.MouseEvent | React.PointerEvent | React.TouchEvent, msgId: string, text: string, isOwn: boolean) => {
    e.preventDefault();
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      toggleMessageSelection(msgId);
    }
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const isAdmin = chat?.admins?.includes(user?.id || ''); 
  const canAdd = chat?.isGroup && (isAdmin || chat?.canAddMembers);
  const chatName = chat ? (chat.isGroup ? chat.name : chat.participants[0].name) : recipient?.displayName;
  const chatAvatar = chat ? (chat.isGroup ? chat.avatar! : chat.participants[0].avatar) : recipient?.avatar;
  const isOnline = chat ? (!chat.isGroup && users.find(u => u.id === chat.participants[0].id)?.isOnline) : recipient?.isOnline;
  const memberCount = chat?.isGroup ? chat.participants.length : null;
  const canSendMessages = chat?.isGroup 
    ? (chat.canSendMessage === 'everyone' || isAdmin) 
    : true;
  const canStartCalls = chat?.isGroup 
    ? (chat.canStartCall === 'everyone' || isAdmin) 
    : true;

  return (
    <div className="flex flex-col h-screen bg-bg-light relative overflow-hidden">
      <AnimatePresence>
        {showReactionPicker && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]"
              onClick={() => setShowReactionPicker(null)}
            />
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="relative bg-white/90 backdrop-blur-xl rounded-full p-2 shadow-2xl border border-primary/10 flex gap-1"
            >
              {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => addReaction(showReactionPicker, emoji)}
                  className="size-10 flex items-center justify-center text-xl hover:bg-primary/10 rounded-full transition-all active:scale-125"
                >
                  {emoji}
                </button>
              ))}
              <button 
                onClick={() => {
                  setShowReactionPicker(null);
                  setShowEmojiPicker(true);
                }}
                className="size-10 flex items-center justify-center text-slate-400 hover:bg-primary/10 rounded-full transition-all"
              >
                <Icon name="add" />
              </button>
            </motion.div>
          </div>
        )}
        {showDeleteMenu && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowDeleteMenu(false)}
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-2">
                <button 
                  onClick={() => {
                    handleMessageAction('delete_me');
                    setShowDeleteMenu(false);
                  }}
                  className="w-full p-4 text-left font-bold text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3"
                >
                  <Icon name="delete_outline" className="text-red-500" /> Delete for me
                </button>
                <button 
                  onClick={() => {
                    handleMessageAction('delete_everyone');
                    setShowDeleteMenu(false);
                  }}
                  className="w-full p-4 text-left font-bold text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3"
                >
                  <Icon name="delete_forever" className="text-red-500" /> Delete for everyone
                </button>
                <button 
                  onClick={() => setShowDeleteMenu(false)}
                  className="w-full p-4 text-left font-bold text-primary hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {showForward && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowForward(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl w-full max-max-sm max-h-[70vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <header className="p-6 border-b border-primary/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800">Forward to...</h3>
                <button onClick={() => setShowForward(false)} className="text-neutral-muted"><Icon name="close" /></button>
              </header>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                {chats.map(c => {
                  const name = c.isGroup ? c.name : c.participants[0].name;
                  const avatar = c.isGroup ? c.avatar! : c.participants[0].avatar;
                  return (
                    <button 
                      key={c.id}
                      onClick={() => forwardMessage(c.id)}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-primary/5 transition-all text-left"
                    >
                      <Avatar src={avatar} className="size-12" />
                      <div className="flex-1">
                        <p className="font-bold text-slate-800">{name}</p>
                        <p className="text-[10px] text-neutral-muted uppercase tracking-widest font-bold">{c.isGroup ? 'Group' : 'Direct'}</p>
                      </div>
                      <Icon name="send" className="text-primary text-sm" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
        {showDeleteEveryoneConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowDeleteEveryoneConfirm(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-6 text-center"
            >
              <div className="size-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto">
                <Icon name="delete_forever" className="text-4xl" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-800">Delete for Everyone?</h3>
                <p className="text-neutral-muted">This will permanently remove the message for all participants. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteEveryoneConfirm(false)}>Cancel</Button>
                <Button 
                  variant="primary" 
                  className="flex-1 bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                  onClick={() => {
                    selectedMessageIds.forEach(id => deleteMessageGlobally(id));
                    setShowDeleteEveryoneConfirm(false);
                    cancelSelection();
                  }}
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
        {showClearConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowClearConfirm(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-6 text-center"
            >
              <div className="size-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto">
                <Icon name="delete_sweep" className="text-4xl" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-800">Clear Chat?</h3>
                <p className="text-neutral-muted">This will permanently delete all messages in this conversation. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
                <Button 
                  variant="primary" 
                  className="flex-1 bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                  onClick={() => {
                    setCleared(true);
                    setShowClearConfirm(false);
                  }}
                >
                  Clear All
                </Button>
              </div>
            </motion.div>
          </div>
        )}
        {showMediaGallery && (
          <MediaGallery onClose={() => setShowMediaGallery(false)} groupId={activeChatId || undefined} />
        )}
        {showMicError && (
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
              <div className="size-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-6">
                <Icon name="mic_off" className="text-4xl" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight italic">Mic Error</h3>
              <p className="text-sm text-neutral-muted mb-8 leading-relaxed">{showMicError}</p>
              <Button className="w-full" onClick={() => setShowMicError(null)}>Got it</Button>
            </motion.div>
          </motion.div>
        )}
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[150] bg-slate-800/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-bold shadow-2xl flex items-center gap-3"
          >
            <Icon name="check_circle" className="text-green-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 h-full relative">
          <header className="px-6 py-4 bg-bg-light/80 backdrop-blur-xl border-b border-primary/5 sticky top-0 z-40">
            <AnimatePresence mode="wait">
              {isSelectionMode ? (
                <motion.div 
                  key="selection"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-4">
                    <button onClick={cancelSelection} className="size-10 rounded-xl bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all shadow-sm border border-white">
                      <Icon name="close" />
                    </button>
                    <span className="font-black text-slate-900 uppercase tracking-tighter italic">{selectedMessageIds.length} Selected</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleMessageAction('reply')}
                      className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all"
                      title="Reply"
                    >
                      <Icon name="reply" />
                    </button>
                    <button 
                      onClick={() => handleMessageAction('copy')}
                      className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all"
                      title="Copy"
                    >
                      <Icon name="content_copy" />
                    </button>
                    <button 
                      onClick={() => setShowForward(true)}
                      className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all"
                      title="Forward"
                    >
                      <Icon name="forward" />
                    </button>
                    <button 
                      onClick={() => setShowDeleteMenu(true)}
                      className="size-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all"
                      title="Delete"
                    >
                      <Icon name="delete" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="size-10 rounded-xl bg-white flex items-center justify-center text-slate-600 md:hidden shadow-sm border border-white">
                      <Icon name="chevron_left" />
                    </button>
                    <div 
                      onClick={() => {
                        if (chat?.isGroup) {
                          setActiveGroupInfoId(chat.id);
                        } else {
                          const userId = chat ? chat.participants[0].id : recipient?.id;
                          if (userId) useAppStore.getState().setViewingUserId(userId);
                        }
                      }}
                      className="flex items-center gap-3 flex-1 cursor-pointer group"
                    >
                      <Avatar 
                        src={chatAvatar!} 
                        className="size-11 group-hover:scale-105 transition-transform" 
                        status={!chat?.isGroup ? (isOnline ? 'online' : 'offline') : undefined} 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-black text-slate-900 truncate tracking-tight italic uppercase">{chatName}</h3>
                          {isMuted && <Icon name="notifications_off" className="text-[10px] text-slate-400" />}
                        </div>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-primary' : 'text-slate-400'}`}>
                          {chat?.isGroup ? `${memberCount} members` : (isOnline ? 'Live Now' : 'Offline')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 relative">
                    <button 
                      onClick={() => {
                        if (!canStartCalls) return;
                        if (chat?.isGroup) {
                          setActiveGroupCall({ type: 'voice', groupId: chat.id });
                        } else {
                          const userId = chat ? chat.participants[0].id : recipient?.id;
                          setActiveGroupCall({ type: 'voice', userId });
                        }
                      }}
                      disabled={!canStartCalls}
                      className={`size-11 rounded-2xl bg-white flex items-center justify-center transition-all active:scale-95 border border-white shadow-sm ${!canStartCalls ? 'opacity-50 grayscale cursor-not-allowed' : 'text-primary hover:bg-primary hover:text-white'}`}
                    >
                      <Icon name="call" />
                    </button>
                    <button 
                      onClick={() => {
                        if (!canStartCalls) return;
                        if (chat?.isGroup) {
                          setActiveGroupCall({ type: 'video', groupId: chat.id });
                        } else {
                          const userId = chat ? chat.participants[0].id : recipient?.id;
                          setActiveGroupCall({ type: 'video', userId });
                        }
                      }}
                      disabled={!canStartCalls}
                      className={`size-11 rounded-2xl bg-white flex items-center justify-center transition-all active:scale-95 border border-white shadow-sm ${!canStartCalls ? 'opacity-50 grayscale cursor-not-allowed' : 'text-primary hover:bg-primary hover:text-white'}`}
                    >
                      <Icon name="videocam" />
                    </button>

                    <div className="relative">
                      <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm"
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
                              className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-primary/10 p-2 z-50"
                            >
                              <button 
                                onClick={() => {
                                  if (chat?.isGroup) {
                                    setActiveGroupInfoId(chat.id);
                                  } else {
                                    const userId = chat ? chat.participants[0].id : recipient?.id;
                                    if (userId) useAppStore.getState().setViewingUserId(userId);
                                  }
                                  setShowMenu(false);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold text-sm transition-colors"
                              >
                                <Icon name="info" className="text-lg text-primary" /> {chat?.isGroup ? 'Group Info' : 'View Profile'}
                              </button>
                              <button 
                                onClick={() => {
                                  setShowMediaGallery(true);
                                  setShowMenu(false);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold text-sm transition-colors"
                              >
                                <Icon name="perm_media" className="text-lg text-primary" /> Media, Links & Docs
                              </button>
                              <button 
                                onClick={() => {
                                  setIsMuted(!isMuted);
                                  setShowMenu(false);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold text-sm transition-colors"
                              >
                                <Icon name={isMuted ? "notifications_active" : "notifications_off"} className="text-lg text-primary" /> {isMuted ? 'Unmute' : 'Mute'} Notifications
                              </button>
                              <div className="h-px bg-primary/5 my-2" />
                              <button 
                                onClick={() => {
                                  setShowClearConfirm(true);
                                  setShowMenu(false);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-500 font-bold text-sm transition-colors"
                              >
                                <Icon name="delete_sweep" className="text-lg" /> Clear Chat
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </header>
      <main 
        className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar"
        onClick={() => setShowEmojiPicker(false)}
      >
        {cleared ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
            <div className="size-20 rounded-full bg-primary/5 flex items-center justify-center text-primary/20">
              <Icon name="chat_bubble_outline" className="text-4xl" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800">Chat Cleared</h4>
              <p className="text-xs text-neutral-muted">Start a new conversation below.</p>
            </div>
          </div>
        ) : !chat && recipient ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6">
            <div className="size-24 rounded-full bg-primary/5 flex items-center justify-center">
              <Avatar src={recipient.avatar} className="size-20" />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-bold text-slate-800">Say hello to {recipient.displayName}!</h4>
              <p className="text-sm text-neutral-muted">This is the beginning of your conversation with {recipient.username}.</p>
            </div>
            <div className="flex gap-2">
              {['👋', 'Hey!', 'How are you?'].map(msg => (
                <button 
                  key={msg}
                  className="px-4 py-2 bg-white border border-primary/10 rounded-full text-sm font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted bg-card-light px-3 py-1 rounded-full">Today</span>
            </div>

            <div className="flex flex-col gap-6">
              {/* System Message */}
              <div className="flex justify-center">
                <p className="text-[10px] text-neutral-muted bg-primary/5 px-4 py-1 rounded-full font-bold uppercase tracking-widest">
                  {chat?.isGroup ? 'You joined the group' : 'End-to-end encrypted'}
                </p>
              </div>

              {messages.map((msg) => {
                const isOwn = msg.senderId === user?.id || msg.isOwn;
                const isDeleted = deletedMsgIds.includes(msg.id);
                const isGloballyDeleted = globallyDeletedIds.includes(msg.id);

                if (isDeleted) return null;

                return (
                  <div 
                    key={msg.id} 
                    className={cn(
                      "flex flex-col gap-1.5 max-w-[85%]",
                      isOwn ? "self-end items-end" : "self-start items-start"
                    )}
                  >
                    {!isOwn && chat?.isGroup && (
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest px-1">{msg.senderName}</span>
                    )}
                    <div className="flex items-end gap-2">
                      {!isOwn && chat?.isGroup && (
                        <Avatar src={msg.avatar || `https://picsum.photos/seed/${msg.senderId}/200`} className="size-8 mb-1" />
                      )}
                      <div 
                        onPointerDown={(e) => handlePointerDown(e, msg.id, msg.text || '', isOwn)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onContextMenu={(e) => handleContextMenu(e, msg.id, msg.text || '', isOwn)}
                        className={cn(
                          "p-4 rounded-[1.5rem] shadow-sm relative touch-none transition-all",
                          isOwn 
                            ? "bg-primary text-white rounded-tr-none shadow-primary/20" 
                            : "bg-white text-slate-700 rounded-tl-none border border-slate-100",
                          selectedMessageIds.includes(msg.id) && (isOwn ? "bg-primary-dark ring-4 ring-primary/20" : "bg-primary/10 ring-2 ring-primary/20")
                        )}
                      >
                        {isGloballyDeleted ? (
                          <span className={cn("italic", isOwn ? "text-white/60" : "text-slate-400")}>
                            {isOwn ? "You deleted this message" : "This message was deleted"}
                          </span>
                        ) : msg.type === 'image' || msg.type === 'audio' || msg.type === 'file' ? (
                          <DecryptedMedia msg={msg} isOwn={isOwn} />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        )}

                        {reactions[msg.id] && reactions[msg.id].length > 0 && !isGloballyDeleted && (
                          <div className={cn("absolute -bottom-2 flex gap-0.5", isOwn ? "-left-2" : "-right-2")}>
                            {Array.from(new Set(reactions[msg.id])).map(emoji => (
                              <div key={emoji} className="bg-white shadow-xl border border-slate-100 rounded-full px-2 py-1 flex items-center gap-1.5">
                                <span className="text-xs">{emoji}</span>
                                <span className="text-[9px] font-black text-slate-900">
                                  {reactions[msg.id].filter(e => e === emoji).length}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-1 mt-1">
                      {msg.isE2E && (
                        <div title="End-to-End Encrypted" className="flex items-center justify-center">
                          <Icon name="lock" className="text-[10px] text-primary/60" />
                        </div>
                      )}
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{msg.timestamp}</span>
                      {isOwn && !isGloballyDeleted && (() => {
                        const status = msg.status || 'read';
                        return (
                          <Icon 
                            name={status === 'read' || status === 'delivered' ? 'done_all' : 'check'} 
                            className={cn("text-[14px]", status === 'read' ? 'text-blue-500' : 'text-slate-400')} 
                          />
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
              
              {(() => {
                const partnerId = activeRecipientId || chat?.participants.find(p => p.id !== user?.id)?.id;
                if (partnerId && typingUsers[partnerId]) {
                  return (
                    <div className="flex flex-col gap-1.5 max-w-[85%] self-start items-start text-xs font-bold text-slate-400">
                      <div className="flex items-end gap-2">
                        <div className="p-4 rounded-[1.5rem] bg-white rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-1.5 h-10">
                          <motion.div className="w-1.5 h-1.5 bg-primary/50 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0 }} />
                          <motion.div className="w-1.5 h-1.5 bg-primary/50 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }} />
                          <motion.div className="w-1.5 h-1.5 bg-primary/50 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} />
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </>
        )}
      </main>

      <footer className="p-4 bg-bg-light/80 backdrop-blur-xl border-t border-primary/5 flex flex-col gap-3 sticky bottom-0 z-30">
        <AnimatePresence>
          {capturedMedia.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex gap-2 overflow-x-auto pb-2 no-scrollbar"
            >
              {capturedMedia.map((media, i) => (
                <div key={`captured-${i}`} className="relative size-20 flex-shrink-0 rounded-xl overflow-hidden border border-primary/10 bg-slate-50">
                  {media.type === 'image' ? (
                    <img src={media.url} className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : media.type === 'audio' ? (
                    <div className="size-full flex flex-col items-center justify-center text-primary">
                      <Icon name="mic" className="text-2xl" />
                      <span className="text-[8px] font-bold uppercase">Audio</span>
                    </div>
                  ) : (
                    <div className="size-full flex flex-col items-center justify-center text-primary">
                      <Icon name="description" className="text-2xl" />
                      <span className="text-[8px] font-bold uppercase w-full truncate px-1 text-center">{media.name || 'FILE'}</span>
                    </div>
                  )}
                  <button 
                    onClick={() => removeMedia(i)}
                    className="absolute top-1 right-1 size-5 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm"
                  >
                    <Icon name="close" className="text-[10px]" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
          {isRecording && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-primary/5 p-4 rounded-2xl flex items-center gap-4"
            >
              <div className="flex-1 flex items-center gap-3">
                <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                <div className="flex-1 h-1 bg-primary/10 rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="w-1/2 h-full bg-primary"
                  />
                </div>
                <span className="text-xs font-mono font-bold text-primary">
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <button onClick={stopRecording} className="text-red-500 font-bold text-xs uppercase tracking-widest">Stop</button>
            </motion.div>
          )}
          {showEmojiPicker && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-full left-0 mb-2 z-[100]"
            >
              <EmojiPicker 
                onEmojiClick={handleEmojiClick} 
                theme={Theme.LIGHT}
                width={320}
                height={400}
                lazyLoadEmojis={true}
              />
            </motion.div>
          )}
          {replyTo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-slate-50 border-l-4 border-primary p-3 rounded-r-xl flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{replyTo.sender}</p>
                  <p className="text-xs text-neutral-muted truncate">{replyTo.text}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-neutral-muted"><Icon name="close" className="text-sm" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={!canSendMessages}
              className={`size-10 rounded-full flex items-center justify-center transition-colors ${!canSendMessages ? 'opacity-50 grayscale cursor-not-allowed' : showEmojiPicker ? 'text-primary bg-primary/10' : 'text-neutral-muted hover:bg-slate-50'}`}
            >
              <Icon name="mood" />
            </button>
            {!messageText && canSendMessages && (
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="size-10 rounded-full flex items-center justify-center text-neutral-muted hover:bg-slate-50 transition-colors"
              >
                <Icon name="photo_camera" />
                <input 
                  type="file" 
                  ref={cameraInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  capture="environment"
                  onChange={handleCameraCapture}
                />
              </button>
            )}
          </div>
          <div className="flex-1 bg-white rounded-2xl px-4 py-2 flex items-center gap-2 shadow-sm border border-white">
            {!canSendMessages ? (
              <p className="flex-1 text-xs text-neutral-muted text-center py-2 font-bold uppercase tracking-widest">Only admins can send messages</p>
            ) : (
              <>
                <input 
                  type="text" 
                  placeholder={isRecording ? "Recording..." : "Message..."}
                  disabled={isRecording}
                  value={messageText}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:outline-none text-sm" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="text-neutral-muted hover:text-primary transition-colors"
                >
                  <Icon name="attach_file" />
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        const isImage = file.type.startsWith('image/');
                        setCapturedMedia(prev => [...prev, { type: isImage ? 'image' : 'file', url, blob: file, name: file.name }]);
                      }
                    }}
                  />
                </button>
              </>
            )}
          </div>
          {canSendMessages && (
            (messageText || capturedMedia.length > 0) ? (
              <button 
                onClick={handleSend}
                disabled={isRecording}
                className="size-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
              >
                <Icon name="send" />
              </button>
            ) : (
              <button 
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerLeave={stopRecording}
                className={`size-12 rounded-2xl flex items-center justify-center transition-all ${isRecording ? 'text-white bg-red-500 scale-110 shadow-lg shadow-red-500/30' : 'text-white bg-primary shadow-xl shadow-primary/30 hover:brightness-110'}`}
              >
                <Icon name="mic" />
              </button>
            )
          )}
        </div>
      </footer>
        </div>
        <AnimatePresence>
          {activeGroupInfoId && <GroupInfo onClose={() => setActiveGroupInfoId(null)} />}
        </AnimatePresence>
      </div>
    </div>
  );
};
