import React, { useState, useRef, useEffect, useMemo } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useStore, useAppStore, shallowEqual, generateInitialsAvatar } from '../store';
import { BACKEND_URL } from '../config';
import { webrtcService } from '../services/webrtcService';
import { Icon, Avatar, Button, Card, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { GroupInfo } from './GroupInfo';
import { MediaGallery } from './MediaGallery';
import { FileTransferError, FileTransferErrorDetails } from '../types';

function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';
  try {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return 'Offline';
  }
}

const fetchWithProgress = async (url: string, onProgress: (percent: number) => void): Promise<Blob> => {
  const response = await fetch(url).catch(() => {
    throw new Error('DOWNLOAD_NETWORK_ERROR');
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('DOWNLOAD_NOT_FOUND');
    throw new Error('DOWNLOAD_SERVER_ERROR');
  }
  if (!response.body) {
    return response.blob();
  }
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (total === 0) {
    return response.blob();
  }

  const reader = response.body.getReader();
  let loaded = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      const percent = Math.round((loaded / total) * 100);
      onProgress(percent);
    }
  }

  return new Blob(chunks);
};

const DecryptedMedia = ({ msg, isOwn, peerId, onPreview, onRetrySend }: { msg: any; isOwn: boolean; peerId?: string | null; onPreview?: (data: { type: 'image' | 'file'; url: string; name: string; size?: string }) => void; onRetrySend?: (msg: any) => void }) => {
  const [url, setUrl] = useState(msg.fileUrl || msg.url);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [transferProgress, setTransferProgress] = useState<number | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentChunkSize, setCurrentChunkSize] = useState<number | null>(null);

  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const isFailed = msg.status === 'failed';
  const displayError = (() => {
    if (isOwn && isFailed) {
      const code = msg.errorCode as FileTransferError || FileTransferError.UNKNOWN_ERROR;
      const detail = FileTransferErrorDetails[code] || FileTransferErrorDetails[FileTransferError.UNKNOWN_ERROR];
      return `Failed to send — ${code}: ${detail.message}`;
    }
    return loadError;
  })();

  useEffect(() => {
    if (isOwn && isFailed) return; // Sender doesn't need to decrypt if upload failed

    const handleProgress = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { messageId, progress, chunkSize } = customEvent.detail;
      if (messageId === msg.id) {
        setIsTransferring(true);
        setTransferProgress(progress);
        if (chunkSize) setCurrentChunkSize(chunkSize);
        if (progress >= 100) {
          setTimeout(() => {
            setIsTransferring(false);
            setTransferProgress(null);
          }, 1200);
        }
      }
    };

    window.addEventListener('webrtc_transfer_progress', handleProgress);
    return () => {
      window.removeEventListener('webrtc_transfer_progress', handleProgress);
    };
  }, [msg.id]);
  
  useEffect(() => {
    let active = true;
    const fetchDecrypted = async () => {
      setLoadError(null);
      const targetUrl = msg.fileUrl || msg.url;
      if (!targetUrl) return;

      // Check cache first for audio messages (voice notes)
      if (msg.type === 'audio') {
        try {
          const { voiceNoteCache } = await import('../services/voiceNoteCache');
          const cacheKey = msg.id || targetUrl;
          const cachedBlob = await voiceNoteCache.get(cacheKey);
          if (cachedBlob && active) {
            console.log("Loading voice note from IndexedDB Cache:", cacheKey);
            setUrl(URL.createObjectURL(cachedBlob));
            return;
          }
        } catch (err) {
          console.error("IndexedDB voice note cache read error:", err);
        }
      }

      // If it is a local blob URL or not encrypted, set the URL directly and bypass decryption
      if (targetUrl.startsWith('blob:') || !msg.isE2E) {
        if (msg.type === 'audio' && !targetUrl.startsWith('blob:')) {
          try {
            const { voiceNoteCache } = await import('../services/voiceNoteCache');
            const cacheKey = msg.id || targetUrl;
            const blob = await fetchWithProgress(targetUrl, (percent) => {
              if (active) setDownloadProgress(percent);
            });
            if (active) setDownloadProgress(null);
            await voiceNoteCache.set(cacheKey, blob);
            if (active) setUrl(URL.createObjectURL(blob));
            return;
          } catch (err) {
            console.error("Failed to fetch and cache unencrypted audio:", err);
            if (active) setDownloadProgress(null);
          }
        }
        if (active) setUrl(targetUrl);
        return;
      }

      try {
        const { cryptoService } = await import('../services/cryptoService');
        const { compressionService } = await import('../services/compressionService');
        
        const encryptedBlob = await fetchWithProgress(targetUrl, (percent) => {
          if (active) setDownloadProgress(percent);
        });
        if (active) setDownloadProgress(null);
        
        let sharedSecret: CryptoKey;
        // Fetch remote pub key to derive shared secret for E2EE decryption
        const remoteId = isOwn ? (msg.recipientId || peerId) : msg.senderId;
        const state = useAppStore.getState();
        let pubKeyBase64 = await new Promise<string>((resolve) => {
          const socket = state.socket;
          if (socket && socket.connected) {
            const timeout = setTimeout(() => resolve(''), 1000);
            socket.emit("get_public_key", { userId: remoteId }, (res: string) => {
              clearTimeout(timeout);
              resolve(res || '');
            });
          } else {
            resolve('');
          }
        });

        // Fallback to Firestore if live socket fetch failed (e.g. peer is offline)
        if (!pubKeyBase64) {
          try {
            const { db, doc, getDoc } = await import('../firebase');
            if (db) {
              const userDoc = await getDoc(doc(db, 'users', remoteId));
              if (userDoc.exists()) {
                pubKeyBase64 = userDoc.data().publicKey || '';
              }
            }
          } catch (fallbackErr) {
            console.error("Failed to fetch public key from Firestore:", fallbackErr);
          }
        }

        if (!pubKeyBase64) {
          throw new Error("DECRYPT_KEY_MISSING");
        }

        if (!msg.iv) {
          throw new Error("DECRYPT_FAILED");
        }

        try {
          sharedSecret = await cryptoService.deriveSharedSecret(remoteId, pubKeyBase64, state.user?.id);
        } catch (deriveErr) {
          throw new Error("DECRYPT_KEY_MISSING");
        }

        let decryptedBlob;
        try {
          console.log(`[Decryption Debug] Preparing decryption for message: ${msg.id || 'unknown'}. Remote User ID: ${remoteId}. Public Key (b64 length: ${pubKeyBase64 ? pubKeyBase64.length : 0}, first 20: "${pubKeyBase64 ? pubKeyBase64.slice(0, 20) : 'none'}"). IV (length in bytes: ${msg.iv ? msg.iv.length : 0}, values: ${JSON.stringify(msg.iv)}). Ciphertext blob size: ${encryptedBlob.size} bytes. Expected file size in metadata: ${msg.fileSize || 'N/A'}`);
          decryptedBlob = await cryptoService.decryptFile(encryptedBlob, msg.iv, sharedSecret, msg.type === 'audio' ? '' : (msg.type === 'file' ? 'application/octet-stream' : 'image/jpeg'));
        } catch (decErr) {
          console.error(`[Decryption Debug] Decryption failed with error:`, decErr);
          throw new Error("DECRYPT_FAILED");
        }

        let decompressed;
        try {
          decompressed = await compressionService.decompressFile(decryptedBlob);
        } catch (decompErr) {
          throw new Error('DECOMPRESS_FAILED');
        }
        
        // Cache newly decrypted audio voice note
        if (msg.type === 'audio') {
          try {
            const { voiceNoteCache } = await import('../services/voiceNoteCache');
            const cacheKey = msg.id || targetUrl;
            await voiceNoteCache.set(cacheKey, decompressed);
            console.log("Cached decrypted voice note successfully:", cacheKey);
          } catch (cacheErr) {
            console.error("Failed to cache decrypted voice note in IndexedDB:", cacheErr);
          }
        }

        if (active) setUrl(URL.createObjectURL(decompressed));
      } catch (e: any) {
        if (active) {
          setDownloadProgress(null);
          
          let errorCode = FileTransferError.UNKNOWN_ERROR;
          if (e.message === 'DECRYPT_KEY_MISSING') {
            errorCode = FileTransferError.DECRYPT_KEY_MISSING;
          } else if (e.message === 'DECRYPT_FAILED') {
            errorCode = FileTransferError.DECRYPT_FAILED;
          } else if (e.message === 'DECOMPRESS_FAILED') {
            errorCode = FileTransferError.DECOMPRESS_FAILED;
          } else if (e.message === 'DOWNLOAD_NETWORK_ERROR') {
            errorCode = FileTransferError.DOWNLOAD_NETWORK_ERROR;
          } else if (e.message === 'DOWNLOAD_NOT_FOUND') {
            errorCode = FileTransferError.DOWNLOAD_NOT_FOUND;
          } else if (e.message === 'DOWNLOAD_SERVER_ERROR') {
            errorCode = FileTransferError.DOWNLOAD_SERVER_ERROR;
          }
          
          const detail = FileTransferErrorDetails[errorCode];
          const baseMsg = msg.type === 'audio' ? "Couldn't load voice note" : msg.type === 'image' ? "Couldn't load image" : "Couldn't load file";
          
          setLoadError(`${baseMsg} — ${errorCode}`);
          console.error(`[Receiver Media Load Failure] Message ID: ${msg.id}, Error Code: ${errorCode}, Technical details: ${detail?.technicalDescription || 'None'}, Exception:`, e);
        }
      }
    };
    fetchDecrypted();
    return () => { active = false; };
  }, [msg.fileUrl, msg.url, msg.isE2E, msg.iv, isOwn, msg.recipientId, msg.senderId, msg.id, msg.type, retryKey]);

  useEffect(() => {
    if (msg.type === 'audio' && msg.fileSize && msg.fileSize.includes('|')) {
      const parts = msg.fileSize.split('|');
      const timePart = parts[0].trim();
      const timeParts = timePart.split(':');
      if (timeParts.length === 2) {
        const mins = parseInt(timeParts[0], 10);
        const secs = parseInt(timeParts[1], 10);
        if (!isNaN(mins) && !isNaN(secs)) {
          setDuration(mins * 60 + secs);
        }
      }
    }
  }, [msg.fileSize, msg.type]);

  useEffect(() => {
    if (msg.type === 'audio' && url) {
      const audio = new Audio(url);
      audioRef.current = audio;

      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleLoadedMetadata = () => {
        const d = audio.duration;
        if (d && isFinite(d) && !isNaN(d)) {
          setDuration(d);
        }
      };
      const handleEnded = () => setIsPlaying(false);
      const handleError = () => {
        console.error("Audio playback error");
        setLoadError(`Couldn't load voice note — ${FileTransferError.RENDER_FAILED}`);
        setIsPlaying(false);
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);

      return () => {
        audio.pause();
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
      };
    }
  }, [url, msg.type]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isUploading = msg.status === 'uploading';
  const showProgress = isUploading || downloadProgress !== null;
  const progressPercent = isUploading ? (msg.uploadProgress || 0) : (downloadProgress || 0);
  const progressText = isUploading 
    ? (progressPercent === 100 ? "Ending | 100%" : `Uploading ${progressPercent}%`) 
    : (progressPercent === 100 ? "Finalizing..." : `Downloading ${progressPercent}%`);

  const renderProgressOverlay = () => {
    if (!showProgress) return null;
    return (
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white z-20 rounded-xl p-3">
        <div className="size-10 rounded-full border-2 border-white/20 border-t-white animate-spin flex items-center justify-center mb-2">
          <span className="text-[9px] font-black">{progressPercent}%</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider animate-pulse text-center">{progressText}</span>
        <div className="w-24 h-1 bg-white/20 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    );
  };

  if (msg.type === 'image') {
    if (displayError) {
      return (
        <div className="flex flex-col items-center justify-center p-4 min-w-[150px] min-h-[100px] max-w-[min(380px,72%)] bg-black/5 rounded-xl border border-red-500/20 text-red-500">
          <Icon name="broken_image" className="text-2xl mb-2 opacity-80" />
          <span className="text-[10px] font-bold uppercase tracking-wider mb-2">{displayError}</span>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              if (isOwn && msg.status === 'failed' && onRetrySend) onRetrySend(msg);
              else setRetryKey(k => k + 1); 
            }}
            className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-full text-[10px] font-bold transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      if (naturalWidth && naturalHeight) {
        setAspectRatio(naturalWidth / naturalHeight);
      }
      setImageLoaded(true);
    };

    const containerStyle: React.CSSProperties = {
      aspectRatio: aspectRatio ? `${aspectRatio}` : '1.333',
      maxWidth: 'min(400px, 72%)',
      maxHeight: 'min(450px, 50vh)',
      minWidth: '120px',
      minHeight: '120px',
      width: '100%',
      transition: 'aspect-ratio 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
    };
    
    return (
      <div 
        className="flex flex-col gap-2 cursor-pointer group/image relative max-w-full" 
        onClick={() => !showProgress && onPreview?.({ type: 'image', url, name: msg.text || 'Image', size: msg.fileSize })}
      >
        <div 
          style={containerStyle}
          className="relative rounded-xl overflow-hidden shadow-sm border border-slate-100 hover:border-primary/20 transition-all bg-black/5 flex items-center justify-center"
        >
          {url ? (
            <img 
              src={url} 
              onLoad={handleImageLoad}
              onError={() => setLoadError(`Couldn't load image — ${FileTransferError.RENDER_FAILED}`)} 
              className={`w-full h-full object-contain rounded-xl hover:scale-[1.01] transition-all duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} 
              referrerPolicy="no-referrer" 
            />
          ) : null}

          {(!url || !imageLoaded) && !displayError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/50 dark:bg-slate-900/50 animate-pulse text-slate-400 p-3">
              <Icon name="image" className="text-3xl mb-1.5 opacity-50 animate-bounce" />
              <span className="text-[9px] font-bold tracking-wider uppercase opacity-60">Loading Secure Image...</span>
            </div>
          )}

          {renderProgressOverlay()}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/10 flex items-center justify-center transition-colors">
            <Icon name="zoom_in" className="text-white opacity-0 group-hover/image:opacity-100 transition-opacity text-2xl drop-shadow-md" />
          </div>
        </div>
        {msg.text && <p className="text-xs sm:text-sm font-medium leading-relaxed max-w-[min(400px,72%)] break-words">{msg.text}</p>}
      </div>
    );
  }
  
  if (msg.type === 'file') {
    if (displayError) {
      return (
        <div className="flex items-center gap-3 bg-red-500/5 p-2 rounded-xl border border-red-500/20 text-red-500 min-w-[220px]">
          <div className="size-10 rounded-xl flex items-center justify-center bg-red-500/10 shrink-0">
            <Icon name="error_outline" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold truncate">{displayError}</p>
          </div>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              if (isOwn && msg.status === 'failed' && onRetrySend) onRetrySend(msg);
              else setRetryKey(k => k + 1); 
            }}
            className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-full text-[10px] font-bold transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div 
        className="flex flex-col gap-2 min-w-[220px] cursor-pointer hover:bg-black/5 rounded-xl p-1.5 transition-all relative"
        onClick={(e) => {
          if (showProgress) return;
          if ((e.target as HTMLElement).closest('a')) return;
          onPreview?.({ type: 'file', url, name: msg.text || 'File', size: msg.fileSize });
        }}
      >
        <div className="flex items-center gap-3">
          <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner relative overflow-hidden", isOwn ? "bg-white/20 text-white" : "bg-primary/10 text-primary")}>
            <Icon name="description" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className={cn("text-xs font-bold truncate", isOwn ? "text-white" : "text-slate-800")}>
              {msg.text || (msg.fileUrl ? (msg.fileUrl.startsWith('data:') ? 'Offline File' : msg.fileUrl.split('/').pop()) : 'File')}
            </p>
            <div className={cn("text-[9px] font-bold uppercase tracking-widest mt-0.5 opacity-70", isOwn ? "text-white" : "text-slate-400")}>
              {msg.fileSize || 'FILE'}
            </div>
          </div>
          {!showProgress && url && (
            <a href={url} download={msg.text || 'file'} className={cn("size-9 rounded-full flex items-center justify-center shrink-0 hover:bg-black/10 transition-colors", isOwn ? "text-white" : "text-primary")}>
              <Icon name="download" className="text-base" />
            </a>
          )}
        </div>
        
        {showProgress && (
          <div className="w-full mt-1 px-1">
            <div className={cn("h-1 rounded-full overflow-hidden", isOwn ? "bg-white/20" : "bg-slate-200")}>
              <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className={cn("text-[9px] font-mono flex justify-between mt-1", isOwn ? "text-white/75" : "text-slate-400")}>
              <span className="animate-pulse">{progressText}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (msg.type === 'audio') {
    if (displayError) {
      return (
        <div className="flex items-center gap-3 bg-red-500/5 p-2 rounded-xl border border-red-500/20 text-red-500 min-w-[220px]">
          <div className="size-10 rounded-full flex items-center justify-center bg-red-500/10 shrink-0">
            <Icon name="error_outline" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold truncate">{displayError}</p>
          </div>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              if (isOwn && msg.status === 'failed' && onRetrySend) onRetrySend(msg);
              else setRetryKey(k => k + 1); 
            }}
            className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-full text-[10px] font-bold transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    return (
      <div className="flex flex-col gap-1 min-w-[220px] py-1">
        <div className="flex items-center gap-3">
          <button 
            disabled={isTransferring || showProgress || !url}
            onClick={togglePlay}
            className={cn("size-10 rounded-full flex items-center justify-center transition-transform active:scale-95 shrink-0 shadow-sm", isOwn ? "bg-white/25 text-white hover:bg-white/35" : "bg-primary/10 text-primary hover:bg-primary/20", (isTransferring || showProgress || !url) && "opacity-50 cursor-not-allowed")}
          >
            <Icon name={isTransferring || showProgress ? "sync" : (isPlaying ? "pause" : "play_arrow")} className={cn("text-xl", (isTransferring || showProgress) && "animate-spin")} />
          </button>
          <div className="flex-1 min-w-0">
            {isTransferring && transferProgress !== null ? (
              <div className="space-y-1">
                <div className={cn("h-1.5 rounded-full overflow-hidden", isOwn ? "bg-white/20" : "bg-slate-200")}>
                  <div className="h-full bg-blue-500 animate-pulse transition-all duration-150" style={{ width: `${transferProgress}%` }} />
                </div>
                <div className={cn("text-[9px] font-mono flex justify-between", isOwn ? "text-white/75" : "text-slate-400")}>
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-blue-500 animate-ping inline-block" />
                    P2P {isOwn ? "Uploading" : "Downloading"}
                  </span>
                  <span>{transferProgress}%</span>
                </div>
              </div>
            ) : showProgress ? (
              <div className="space-y-1">
                <div className={cn("h-1.5 rounded-full overflow-hidden", isOwn ? "bg-white/20" : "bg-slate-200")}>
                  <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className={cn("text-[9px] font-mono flex justify-between", isOwn ? "text-white/75" : "text-slate-400")}>
                  <span className="animate-pulse">{progressText}</span>
                  <span>{progressPercent}%</span>
                </div>
              </div>
            ) : (
              <>
                <div className={cn("h-1 rounded-full overflow-hidden", isOwn ? "bg-white/20" : "bg-slate-200")}>
                  <div className="h-full bg-current transition-all duration-100" style={{ width: `${progress}%` }} />
                </div>
                <div className={cn("text-[9px] mt-1 flex justify-between font-bold", isOwn ? "text-white/75" : "text-slate-400")}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration) || msg.fileSize || 'Voice'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};

const AudioPreviewPlayer = ({ url, duration: initialDuration }: { url: string; duration?: number }) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      const d = audio.duration;
      if (d && isFinite(d) && !isNaN(d)) {
        setDuration(d);
      }
    };
    const handleEnded = () => setPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [url]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="size-full flex flex-col items-center justify-center text-primary relative bg-primary/5 hover:bg-primary/10 transition-colors p-2 rounded-xl">
      <button 
        onClick={togglePlay}
        className="size-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-95 transition-transform shrink-0"
      >
        <Icon name={playing ? "pause" : "play_arrow"} className="text-xs" />
      </button>
      <div className="w-full mt-1.5 px-1">
        <div className="h-0.5 w-full bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[7px] font-mono mt-0.5 opacity-80 leading-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

const validateFileBeforeUpload = (file: File | Blob, type: string): { valid: boolean; error?: FileTransferError; message?: string } => {
  // 1. Check file exists and size is non-zero
  if (!file || file.size === 0) {
    return {
      valid: false,
      error: FileTransferError.FILE_CAPTURE_EMPTY,
      message: 'Empty file captured — The file has no data or size is zero.'
    };
  }

  // 2. File size within limit (50MB)
  const MAX_LIMIT = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_LIMIT) {
    return {
      valid: false,
      error: FileTransferError.FILE_TOO_LARGE,
      message: 'File too large — The selected file exceeds the 50MB limit.'
    };
  }

  // 3. File type validation via actual MIME type (or name as fallback)
  const mime = file.type || '';
  const nameLower = (file instanceof File ? file.name : '').toLowerCase();

  if (type === 'image') {
    if (mime && !mime.startsWith('image/')) {
      return {
        valid: false,
        error: FileTransferError.FILE_TYPE_UNSUPPORTED,
        message: 'Unsupported format — The file is not a valid image.'
      };
    }
  } else if (type === 'audio') {
    if (mime && !mime.startsWith('audio/') && !nameLower.endsWith('.mp3') && !nameLower.endsWith('.wav') && !nameLower.endsWith('.m4a') && !nameLower.endsWith('.webm') && !nameLower.endsWith('.ogg') && !nameLower.endsWith('.caf') && !nameLower.endsWith('.amr')) {
      return {
        valid: false,
        error: FileTransferError.FILE_TYPE_UNSUPPORTED,
        message: 'Unsupported format — The file is not a valid audio recording.'
      };
    }
  } else if (type === 'video') {
    if (mime && !mime.startsWith('video/')) {
      return {
        valid: false,
        error: FileTransferError.FILE_TYPE_UNSUPPORTED,
        message: 'Unsupported format — The file is not a valid video file.'
      };
    }
  } else if (nameLower) {
    const blockedExtensions = ['.exe', '.bat', '.sh', '.com', '.msi', '.vbs', '.cmd'];
    const hasBlockedExt = blockedExtensions.some(ext => nameLower.endsWith(ext));
    if (hasBlockedExt) {
      return {
        valid: false,
        error: FileTransferError.FILE_TYPE_UNSUPPORTED,
        message: 'Unsupported format — Executable/script files are blocked for security.'
      };
    }
  }

  return { valid: true };
};

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
    incomingMediaUploads,
    selfTypingChats,
    sendMessage,
    users,
    onlineUserIds,
    deletedMsgIds,
    globallyDeletedIds,
    deleteMessageLocally,
    deleteMessageGlobally
  } = useStore(s => ({
    user: s.user,
    activeChatId: s.activeChatId,
    setActiveChatId: s.setActiveChatId,
    activeRecipientId: s.activeRecipientId,
    setActiveRecipientId: s.setActiveRecipientId,
    selectedMessageIds: s.selectedMessageIds,
    toggleMessageSelection: s.toggleMessageSelection,
    setSelectedMessageIds: s.setSelectedMessageIds,
    activeGroupCall: s.activeGroupCall,
    setActiveGroupCall: s.setActiveGroupCall,
    activeGroupInfoId: s.activeGroupInfoId,
    setActiveGroupInfoId: s.setActiveGroupInfoId,
    chats: s.chats,
    typingUsers: s.typingUsers,
    incomingMediaUploads: s.incomingMediaUploads,
    selfTypingChats: s.selfTypingChats,
    sendMessage: s.sendMessage,
    users: s.users,
    onlineUserIds: s.onlineUserIds,
    deletedMsgIds: s.deletedMsgIds,
    globallyDeletedIds: s.globallyDeletedIds,
    deleteMessageLocally: s.deleteMessageLocally,
    deleteMessageGlobally: s.deleteMessageGlobally
  }), shallowEqual);
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'file'; url: string; name: string; size?: string } | null>(null);
  const [cleared, setCleared] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showDeleteEveryoneConfirm, setShowDeleteEveryoneConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string, text: string, sender: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<{ type: 'image' | 'audio' | 'file', url: string, blob: Blob, name?: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
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
  const recordingStartTime = useRef<number>(0);
  const isHoldingRef = useRef(false);
  const pressStartTimeRef = useRef(0);
  const isToggleModeRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isCurrentlyTyping = useRef(false);

  useEffect(() => {
    const socket = useAppStore.getState().socket;
    if (!socket) return;

    const handleMessageReaction = (data: { messageId: string, emoji: string, senderId: string }) => {
      setReactions(prev => {
        const current = prev[data.messageId] || [];
        if (current.includes(data.emoji)) {
          return { ...prev, [data.messageId]: current.filter(e => e !== data.emoji) };
        }
        return { ...prev, [data.messageId]: [...current, data.emoji] };
      });
    };

    socket.on('message_reaction', handleMessageReaction);
    return () => {
      socket.off('message_reaction', handleMessageReaction);
    };
  }, []);

  const handleTyping = (text: string) => {
    setMessageText(text);
    
    const socket = useAppStore.getState().socket;
    const targetId = activeRecipientId || chat?.participants.find(p => p.id !== user?.id)?.id;
    
    if (socket && chat) {
      const emitData = chat.isGroup 
        ? { groupId: chat.id }
        : { recipientId: targetId };

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        if (!isCurrentlyTyping.current) {
          isCurrentlyTyping.current = true;
          socket.emit('typing_start', emitData);
          
          if (targetId && !chat.isGroup) {
            socket.emit('typing', { recipientId: targetId, isTyping: true });
          }
        }
        
        // Setup stop timeout 3 seconds later
        const stopTimeoutId = setTimeout(() => {
          isCurrentlyTyping.current = false;
          socket.emit('typing_stop', emitData);
          if (targetId && !chat.isGroup) {
            socket.emit('typing', { recipientId: targetId, isTyping: false });
          }
        }, 3000);
        
        typingTimeoutRef.current = stopTimeoutId;
      }, 300);
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

  const chat = useMemo(() => chats.find(c => c.id === activeChatId), [chats, activeChatId]);
  const recipient = useMemo(() => users.find(u => u.id === activeRecipientId), [users, activeRecipientId]);
  const messages = useMemo(() => chat?.messages || [], [chat?.messages]);

  useEffect(() => {
    if (!user || (!activeRecipientId && !chat)) return;
    const peerId = activeRecipientId || chat?.participants.find(p => p.id !== user?.id)?.id;
    if (!peerId) return;

    // Sort IDs alphabetically to generate a unique, deterministic room name
    const sortedIds = [user.id, peerId].sort();
    const roomName = `chat-webrtc-${sortedIds[0]}-${sortedIds[1]}`;

    console.log(`Connecting direct WebRTC session for room ${roomName} with peer ${peerId}`);
    webrtcService.joinChatRoom(roomName, peerId);

    const handleAudioReceived = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { messageId, from, url, fileSize } = customEvent.detail;
      if (from === peerId) {
        console.log(`WebRTC: Audio received from ${from}. Message ID: ${messageId || "unknown"}. URL: ${url}`);
        
        // Cache globally so any delayed socket message picks it up instantly
        if (messageId) {
          (window as any).__webrtcAudioUrlCache = (window as any).__webrtcAudioUrlCache || {};
          (window as any).__webrtcAudioUrlCache[messageId] = { fileUrl: url, fileSize };

          // Update message in real-time in our store if it has already been rendered!
          const { updateMessageFileUrl } = useAppStore.getState();
          updateMessageFileUrl(messageId, url, fileSize);
        }

        setToast("Media received directly via WebRTC!");
        setTimeout(() => setToast(null), 3000);
      }
    };

    window.addEventListener('webrtc_audio_received', handleAudioReceived);

    return () => {
      console.log(`Disconnecting direct WebRTC session for room ${roomName} with peer ${peerId}`);
      window.removeEventListener('webrtc_audio_received', handleAudioReceived);
      webrtcService.leaveChatRoom(roomName, peerId);
    };
  }, [user, activeRecipientId, chat]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText(prev => prev + emojiData.emoji);
  };

  const startRecording = async () => {
    try {
       setShowMicError(null);
       const stream = await navigator.mediaDevices.getUserMedia({
         audio: {
           echoCancellation: true,
           noiseSuppression: true,
           autoGainControl: true
         }
       });
      
      // If user released the hold and we are not in toggle mode, discard immediately
      if (!isHoldingRef.current && !isToggleModeRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      let options: any = {};
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac',
        'audio/wav'
      ];
      
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options = { mimeType: type };
          selectedMimeType = type;
          break;
        }
      }
      
      console.log("Selected recording mimeType:", selectedMimeType);
      mediaRecorder.current = new MediaRecorder(stream, options);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.current.push(e.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        const finalMime = selectedMimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks.current, { type: finalMime });
        const audioUrl = URL.createObjectURL(audioBlob);
        const durationSecs = Math.max(1, Math.round((Date.now() - recordingStartTime.current) / 1000));
        setCapturedMedia(prev => [...prev, { type: 'audio', url: audioUrl, blob: audioBlob, duration: durationSecs }]);
        stream.getTracks().forEach(track => track.stop());
      };

      recordingStartTime.current = Date.now();
      mediaRecorder.current.start(250); // Periodic chunks every 250ms for maximum reliability
      setIsRecording(true);
      setRecordingDuration(0);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      setIsRecording(false);
      isHoldingRef.current = false;
      isToggleModeRef.current = false;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setShowMicError("Microphone access denied. Please enable microphone permissions in your browser settings to record voice messages.");
      } else {
        setShowMicError("Could not access microphone. Please ensure you have a working microphone connected.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      try {
        mediaRecorder.current.stop();
      } catch (err) {
        console.error("Error stopping MediaRecorder:", err);
      }
    }
    setIsRecording(false);
    isHoldingRef.current = false;
    isToggleModeRef.current = false;
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
  };

  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    // If we are currently recording in toggle mode, clicking stops it
    if (isRecording && isToggleModeRef.current) {
      stopRecording();
      return;
    }

    isHoldingRef.current = true;
    isToggleModeRef.current = false;
    pressStartTimeRef.current = Date.now();
    startRecording();
  };

  const handleMicPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    const pressDuration = Date.now() - pressStartTimeRef.current;
    
    if (pressDuration < 350) {
      // Quick tap -> Enter toggle-to-record mode (so they don't have to hold if they prefer)
      isToggleModeRef.current = true;
      isHoldingRef.current = false;
      console.log("Quick tap detected - entered toggle recording mode");
    } else {
      // Long press -> stop recording on release
      isHoldingRef.current = false;
      stopRecording();
    }
  };

  const handleMicPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.releasePointerCapture(e.pointerId);
    isHoldingRef.current = false;
    isToggleModeRef.current = false;
    stopRecording();
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFileBeforeUpload(file, 'image');
      if (!validation.valid) {
        setToast(validation.message || 'Validation failed');
        setTimeout(() => setToast(null), 4000);
        e.target.value = "";
        return;
      }
      const url = URL.createObjectURL(file);
      setCapturedMedia(prev => [...prev, { type: 'image', url, blob: file }]);
    }
    e.target.value = "";
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
    
    // Copy states immediately to prevent race conditions & double-sends!
    const textToSend = messageText;
    const mediaToSend = [...capturedMedia];
    
    // Immediately clear composer UI state
    setMessageText('');
    setCapturedMedia([]);
    if (cleared) setCleared(false);
    if (replyTo) setReplyTo(null);
    setShowEmojiPicker(false);
    
    const isGroup = chat?.isGroup;
    const targetId = activeRecipientId || chat?.participants.find(p => p.id !== user?.id)?.id;
    if (!targetId && !isGroup) return;

    // E2EE Setup (Only for 1-to-1 chats)
    let sharedSecret: CryptoKey | null = null;
    let pubKeyBase64: string = '';
    if (!isGroup && targetId) {
      try {
        const { cryptoService } = await import('../services/cryptoService');
        pubKeyBase64 = await new Promise<string>((resolve) => {
          const socket = useAppStore.getState().socket;
          if (socket && socket.connected) {
            const timeout = setTimeout(() => resolve(''), 1000);
            socket.emit("get_public_key", { userId: targetId }, (res: string) => {
              clearTimeout(timeout);
              resolve(res || '');
            });
          } else {
            resolve('');
          }
        });
        
        if (!pubKeyBase64) {
          try {
            const { db, doc, getDoc } = await import('../firebase');
            if (db) {
              const userDoc = await getDoc(doc(db, 'users', targetId));
              if (userDoc.exists()) {
                pubKeyBase64 = userDoc.data().publicKey || '';
              }
            }
          } catch (e) {
            console.warn("Failed to fetch public key from Firestore", e);
          }
        }
        
        if (pubKeyBase64) {
          sharedSecret = await cryptoService.deriveSharedSecret(targetId, pubKeyBase64, user?.id);
        }
      } catch(e) {
        console.error("Failed to setup E2EE", e);
      }
    }

    if (textToSend.trim()) {
      let e2eData = undefined;
      const { cryptoService } = await import('../services/cryptoService');
      if (sharedSecret) {
        const encrypted = await cryptoService.encryptText(textToSend, sharedSecret);
        e2eData = {
          encryptedText: JSON.stringify({ iv: encrypted.iv, ciphertext: encrypted.ciphertext }),
          iv: encrypted.iv
        };
      }
      sendMessage(activeChatId, activeRecipientId, textToSend, 'text', undefined, undefined, e2eData);
    }

    if (mediaToSend.length > 0) {
      const isSelfOnline = navigator.onLine && useAppStore.getState().socket?.connected;
      if (!isSelfOnline) {
        setToast("You are currently offline. Files will be sent as base64 strings and may be limited in size.");
        setTimeout(() => setToast(null), 4000);
      }
    }

    // Handle media sending via server storage with Compression & E2EE
    for (const media of mediaToSend) {
      try {
        const { compressionService } = await import('../services/compressionService');
        const { cryptoService } = await import('../services/cryptoService');

        // Robust pre-upload validation check
        const validation = validateFileBeforeUpload(media.blob, media.type);
        if (!validation.valid) {
          console.error(`Media double-safety check failed: ${validation.message}`);
          setToast(validation.message || 'Validation failed');
          setTimeout(() => setToast(null), 4000);
          continue; // Skip upload & do not add bubble
        }

        // Compression
        let processedBlob = media.blob;
        try {
          processedBlob = await compressionService.compressFile(media.blob);
        } catch(e) {
          console.error("Compression failed, using original file", e);
        }

        const isOffline = !navigator.onLine || !useAppStore.getState().socket?.connected;
        const generatedMessageId = `m-webrtc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        let originalTextStr = media.type === 'audio' ? 'Voice Message' : (media.type === 'file' ? media.name || 'File' : '');
        let fileSizeStr = `${(processedBlob.size / 1024 / 1024).toFixed(2)} MB`;
        if (media.type === 'audio' && (media as any).duration) {
          const m = Math.floor((media as any).duration / 60);
          const s = Math.floor((media as any).duration % 60);
          const durStr = `${m}:${s < 10 ? '0' : ''}${s}`;
          fileSizeStr = `${durStr} | ${(processedBlob.size / 1024).toFixed(0)} KB`;
        }

        // Pre-add message to local UI state in uploading/pending mode so progress is visible
        const localMsg: any = {
          id: generatedMessageId,
          senderId: user?.id || 'u1',
          senderName: user?.displayName || 'You',
          text: media.name || (media.type === 'audio' ? 'Voice Message' : 'File'),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: media.type,
          fileUrl: media.url || (media.blob ? URL.createObjectURL(media.blob) : undefined), // locally set to Blob URL so preview works instantly!
          fileSize: fileSizeStr,
          isOwn: true,
          status: isOffline ? 'pending' : 'uploading',
          uploadProgress: 0,
          isE2E: !!sharedSecret,
          iv: undefined,
          encryptedFileKey: sharedSecret ? [] : undefined
        };

        // Cache original blob locally so we can retry even after page reload
        try {
          const { voiceNoteCache } = await import('../services/voiceNoteCache');
          await voiceNoteCache.set(generatedMessageId, media.blob);
        } catch (cacheErr) {
          console.error("Failed to cache original media for potential retry:", cacheErr);
        }

        useAppStore.getState().addPendingMessage(activeChatId, activeRecipientId, localMsg);

        if (!isGroup && targetId && !pubKeyBase64) {
          console.error("Missing remote public key, aborting media upload for E2EE.");
          useAppStore.getState().updateMessageProgress(generatedMessageId, 0, 'failed', FileTransferError.ENCRYPT_KEY_MISSING);
          continue;
        }

        // Encryption
        let uploadBlob = processedBlob;
        let e2eFileIv: number[] | undefined = undefined;
        let encTextStr = originalTextStr;

        if (sharedSecret) {
          try {
            const encFile = await cryptoService.encryptFile(processedBlob, sharedSecret);
            uploadBlob = encFile.encryptedBlob;
            e2eFileIv = encFile.iv;
            if (originalTextStr) {
               const encText = await cryptoService.encryptText(originalTextStr, sharedSecret);
               encTextStr = JSON.stringify({ iv: encText.iv, ciphertext: encText.ciphertext });
            }
          } catch (encErr) {
            console.error("Encryption failed:", encErr);
            useAppStore.getState().updateMessageProgress(generatedMessageId, 0, 'failed', FileTransferError.ENCRYPT_FAILED);
            continue; // Skip upload
          }
        }

        // WebRTC direct chunk-by-chunk P2P transmission
        if (targetId && !isGroup) {
          try {
            console.log(`WebRTC: Sending chunk-by-chunk media ${generatedMessageId} directly to peer ${targetId}...`);
            webrtcService.sendAudioChunks(targetId, uploadBlob, media.blob.type, generatedMessageId);
          } catch (rtcErr) {
            console.warn("Direct WebRTC media chunk sending failed, relying on server backup", rtcErr);
          }
        }

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

          sendMessage(activeChatId, activeRecipientId, originalTextStr, media.type, base64Url, fileSizeStr, e2eData, undefined, generatedMessageId);
          continue;
        }

        let finalErrorCode = FileTransferError.UNKNOWN_ERROR;
        try {
          const filename = media.type === 'audio' ? 'voice_note.webm' : (media.type === 'file' ? media.name || 'file.bin' : 'image.jpg');
          
          // XMLHttpRequest upload engine with exponential retry + backoff & stall detection!
          const uploadWithRetryAndTimeout = async (
            blobToUpload: Blob,
            filenameStr: string,
            onProgress: (percent: number) => void
          ): Promise<{ fileUrl: string; fileSize: string }> => {
            const MAX_ATTEMPTS = 3;
            let attempt = 0;

            while (true) {
              attempt++;
              let lastProgressTime = Date.now();
              let lastLoadedBytes = 0;

              try {
                return await new Promise<{ fileUrl: string; fileSize: string }>((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  const formData = new FormData();
                  formData.append('file', blobToUpload, filenameStr);
                  if (user?.id) formData.append('userId', user.id);

                  // Stall checker (interval of 2s)
                  const STALL_TIMEOUT_MS = 30000; // 30 seconds stall threshold
                  const stallInterval = setInterval(() => {
                    const now = Date.now();
                    if (now - lastProgressTime > STALL_TIMEOUT_MS) {
                      console.warn(`[Upload Stall Detector] No upload progress for 30s. Aborting...`);
                      clearInterval(stallInterval);
                      xhr.abort();
                      reject(new Error('UPLOAD_STALLED'));
                    }
                  }, 2000);

                  xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                      const now = Date.now();
                      if (e.loaded > lastLoadedBytes) {
                        lastProgressTime = now;
                        lastLoadedBytes = e.loaded;
                      }
                      const percent = Math.round((e.loaded / e.total) * 100);
                      onProgress(percent);
                    }
                  });

                  xhr.addEventListener('load', () => {
                    clearInterval(stallInterval);
                    if (xhr.status === 429) {
                      reject(new Error('QUOTA_EXCEEDED'));
                    } else if (xhr.status >= 200 && xhr.status < 300) {
                      try {
                        const parsed = JSON.parse(xhr.responseText);
                        resolve(parsed);
                      } catch (err) {
                        reject(new Error('Invalid JSON response'));
                      }
                    } else if (xhr.status >= 500) {
                      reject(new Error(`Server error ${xhr.status}`));
                    } else {
                      reject(new Error(`Client error ${xhr.status}`));
                    }
                  });

                  xhr.addEventListener('error', () => {
                    clearInterval(stallInterval);
                    reject(new Error('Network error'));
                  });

                  xhr.addEventListener('abort', () => {
                    clearInterval(stallInterval);
                    reject(new Error('Aborted'));
                  });

                  xhr.open('POST', `${BACKEND_URL}/api/upload`);
                  xhr.send(formData);
                });
              } catch (err: any) {
                console.warn(`[Upload Attempt ${attempt} failed]:`, err.message);
                
                const isTransientError = 
                  err.message === 'Network error' || 
                  err.message?.startsWith('Server error') || 
                  err.message === 'UPLOAD_STALLED';

                if (isTransientError && attempt < MAX_ATTEMPTS) {
                  const delayMs = Math.pow(2, attempt) * 1000; // exponential backoff
                  console.log(`[Upload Retry] Retrying in ${delayMs}ms (Attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
                  await new Promise(r => setTimeout(r, delayMs));
                  continue;
                } else {
                  throw err;
                }
              }
            }
          };

          let lastSentPercent = -10;
          const data = await uploadWithRetryAndTimeout(uploadBlob, filename, (percent) => {
            // Update progress in global state
            useAppStore.getState().updateMessageProgress(generatedMessageId, percent, 'uploading');

            // Throttled progress event emit
            if (percent - lastSentPercent >= 10 || percent === 100) {
              lastSentPercent = percent;
              const socket = useAppStore.getState().socket;
              if (socket && socket.connected) {
                socket.emit('media_upload_progress', {
                  recipientId: isGroup ? undefined : targetId,
                  groupId: isGroup ? chat?.id : undefined,
                  messageId: generatedMessageId,
                  percent,
                  mediaType: media.type,
                  fileName: media.type === 'file' ? media.name : undefined
                });
              }
            }
          });
          
          const e2eData = sharedSecret ? {
            encryptedText: encTextStr,
            iv: e2eFileIv!
          } : undefined;

          // Update progress to 100% (finalizing)
          useAppStore.getState().updateMessageProgress(generatedMessageId, 100, 'uploading');

          sendMessage(activeChatId, activeRecipientId, originalTextStr, media.type as any, data.fileUrl, data.fileSize, e2eData, undefined, generatedMessageId);
        } catch (uploadErr: any) {
          if (uploadErr.message === 'QUOTA_EXCEEDED') {
            finalErrorCode = FileTransferError.UPLOAD_QUOTA_EXCEEDED;
            setToast("Daily 100MB quota exceeded!");
          } else if (uploadErr.message === 'Network error') {
            finalErrorCode = FileTransferError.UPLOAD_NETWORK_ERROR;
          } else if (uploadErr.message?.startsWith('Server error')) {
            finalErrorCode = FileTransferError.UPLOAD_SERVER_ERROR;
          } else if (uploadErr.message === 'UPLOAD_STALLED') {
            finalErrorCode = FileTransferError.UPLOAD_STALLED;
          } else {
            finalErrorCode = FileTransferError.UNKNOWN_ERROR;
          }
          const detail = FileTransferErrorDetails[finalErrorCode];
          console.error(`[Sender Media Send Failure] Message ID: ${generatedMessageId}, Error Code: ${finalErrorCode}, Technical details: ${detail?.technicalDescription || 'None'}, Exception:`, uploadErr);
          useAppStore.getState().updateMessageProgress(generatedMessageId, 0, 'failed', finalErrorCode);
          continue;
        }
      } catch (error) {
        console.error("Error uploading media:", error);
      }
    }

    // Stop typing indicator on message send
    if (isCurrentlyTyping.current) {
      isCurrentlyTyping.current = false;
      const socket = useAppStore.getState().socket;
      if (socket && chat) {
        const emitData = chat.isGroup ? { groupId: chat.id } : { recipientId: targetId };
        socket.emit('typing_stop', emitData);
        if (targetId && !chat.isGroup) {
          socket.emit('typing', { recipientId: targetId, isTyping: false });
        }
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
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

    const socket = useAppStore.getState().socket;
    if (socket && chat) {
      socket.emit('message_reaction', {
        messageId: msgId,
        chatId: chat.id,
        emoji,
        recipientId: activeRecipientId || chat.participants.find(p => p.id !== user?.id)?.id,
        groupId: chat.isGroup ? chat.id : undefined
      });
    }
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

  const retrySendMedia = async (msg: any) => {
    try {
      let file: File | null = null;
      
      // Try to recover from the voiceNoteCache (IndexedDB) first, using msg.id
      try {
        const { voiceNoteCache } = await import('../services/voiceNoteCache');
        const cachedBlob = await voiceNoteCache.get(msg.id);
        if (cachedBlob) {
          console.log("Successfully recovered original blob from IndexedDB cache for retry.");
          file = new File([cachedBlob], msg.text || (msg.type === 'audio' ? 'Voice Message' : 'File'), { type: cachedBlob.type });
        }
      } catch (cacheErr) {
        console.warn("Failed to get blob from IndexedDB cache:", cacheErr);
      }

      // Fallback to fetching the fileUrl
      if (!file && msg.fileUrl) {
        try {
          const response = await fetch(msg.fileUrl);
          const blob = await response.blob();
          file = new File([blob], msg.text || (msg.type === 'audio' ? 'Voice Message' : 'File'), { type: blob.type });
        } catch (fetchErr) {
          console.error("Failed to fetch from blob URL:", fetchErr);
        }
      }

      if (!file) {
        console.error("Cannot retry: Could not recover local file blob from cache or URL");
        setToast("Retry failed: Local file blob could not be recovered.");
        return;
      }
      
      const media = {
        type: msg.type,
        blob: file,
        url: URL.createObjectURL(file),
        name: msg.text || (msg.type === 'audio' ? 'Voice Message' : 'File')
      };
      
      setCapturedMedia([media]); // Replace with just this media to prevent duplication
      useAppStore.getState().deleteMessageLocally(msg.id);
      
      // Auto-trigger send on next render
      setTimeout(() => {
        const sendBtn = document.getElementById('chat-send-btn');
        if (sendBtn) sendBtn.click();
      }, 100);

    } catch (e) {
      console.error("Failed to recover blob for retry", e);
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
  const partner = chat && !chat.isGroup ? (chat.participants.find(p => p.id !== user?.id) || chat.participants[0]) : null;
  const chatName = chat ? (chat.isGroup ? chat.name : (partner?.name || '')) : recipient?.displayName;
  const chatAvatar = chat ? (chat.isGroup ? chat.avatar! : (partner?.avatar || '')) : recipient?.avatar;
  const otherParticipantId = chat ? (chat.isGroup ? null : (partner?.id || null)) : recipient?.id;
  const isOnline = chat 
    ? (!chat.isGroup && (users.find(u => u.id === otherParticipantId)?.isOnline || (otherParticipantId && onlineUserIds.includes(otherParticipantId))))
    : (recipient?.isOnline || (recipient?.id && onlineUserIds.includes(recipient.id)));
  const otherParticipant = chat
    ? (!chat.isGroup ? users.find(u => u.id === otherParticipantId) : null)
    : recipient;
  const lastSeenVal = otherParticipant?.lastSeen;
  const memberCount = chat?.isGroup ? chat.participants.length : null;
  const canSendMessages = chat?.isGroup 
    ? (chat.canSendMessage === 'everyone' || isAdmin) 
    : true;
  const canStartCalls = chat?.isGroup 
    ? (chat.canStartCall === 'everyone' || isAdmin) 
    : isOnline;

  const typingUsersInChat = useMemo(() => {
    if (chat) {
      if (chat.isGroup) {
        return chat.participants
          .filter(p => p.id !== user?.id && typingUsers[p.id])
          .map(p => p.name);
      } else {
        const partnerId = activeRecipientId || chat.participants.find(p => p.id !== user?.id)?.id;
        return partnerId && typingUsers[partnerId] ? [chat.participants.find(p => p.id === partnerId)?.name || 'Typing'] : [];
      }
    } else if (recipient) {
      return typingUsers[recipient.id] ? [recipient.displayName || 'Typing'] : [];
    }
    return [];
  }, [chat, activeRecipientId, recipient, typingUsers, user?.id]);

  const isSelfTyping = useMemo(() => {
    if (chat) {
      if (chat.isGroup) {
        return !!selfTypingChats[chat.id];
      } else {
        const partnerId = activeRecipientId || chat.participants.find(p => p.id !== user?.id)?.id;
        return !!(partnerId && selfTypingChats[partnerId]);
      }
    } else if (recipient) {
      return !!selfTypingChats[recipient.id];
    }
    return false;
  }, [chat, activeRecipientId, recipient, selfTypingChats, user?.id]);

  const isRecipientTyping = typingUsersInChat.length > 0;
  const typingText = useMemo(() => {
    if (typingUsersInChat.length === 0) return '';
    if (chat?.isGroup) {
      if (typingUsersInChat.length === 1) {
        return `${typingUsersInChat[0]} is typing...`;
      } else if (typingUsersInChat.length === 2) {
        return `${typingUsersInChat[0]} & ${typingUsersInChat[1]} are typing...`;
      } else {
        return 'Several people are typing...';
      }
    } else {
      return 'Typing...';
    }
  }, [typingUsersInChat, chat?.isGroup]);

  const activeUploads = useMemo(() => {
    const currentChatUploads: Array<{ senderId: string; senderName: string; percent: number; mediaType: string; fileName?: string; messageId: string }> = [];
    if (!chat) return currentChatUploads;

    if (chat.isGroup) {
      chat.participants.forEach(p => {
        if (p.id !== user?.id && incomingMediaUploads?.[p.id]) {
          currentChatUploads.push({
            senderId: p.id,
            senderName: p.name,
            ...incomingMediaUploads[p.id]
          });
        }
      });
    } else {
      const partnerId = activeRecipientId || chat.participants.find(p => p.id !== user?.id)?.id;
      if (partnerId && incomingMediaUploads?.[partnerId]) {
        currentChatUploads.push({
          senderId: partnerId,
          senderName: chat.participants.find(p => p.id === partnerId)?.name || 'Friend',
          ...incomingMediaUploads[partnerId]
        });
      }
    }
    return currentChatUploads;
  }, [chat, activeRecipientId, incomingMediaUploads, user?.id]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canSendMessages) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!canSendMessages) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        const typeKey = isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file'));

        const validation = validateFileBeforeUpload(file, typeKey);
        if (!validation.valid) {
          setToast(validation.message || 'Validation failed');
          setTimeout(() => setToast(null), 4000);
          continue; // Skip this file safely
        }

        const url = URL.createObjectURL(file);
        setCapturedMedia(prev => [...prev, { type: isImage ? 'image' : 'file', url, blob: file, name: file.name }]);
      }
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-bg-light relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] border-4 border-dashed border-primary z-[100] flex flex-col items-center justify-center pointer-events-none transition-all duration-300">
          <div className="p-6 rounded-3xl bg-white/95 shadow-2xl flex flex-col items-center justify-center max-w-sm text-center border border-primary/20 scale-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 animate-bounce">
              <Icon name="cloud_upload" className="text-3xl" />
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">Drag & Drop Files</h4>
            <p className="text-xs text-neutral-muted px-4 leading-relaxed">Release to attach and share your files securely in this chat</p>
          </div>
        </div>
      )}
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
              className="relative bg-white rounded-3xl w-full max-w-sm max-h-[70vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <header className="p-6 border-b border-primary/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800">Forward to...</h3>
                <button onClick={() => setShowForward(false)} className="text-neutral-muted"><Icon name="close" /></button>
              </header>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                {chats.map(c => {
                  const partner = c.isGroup ? null : (c.participants.find(p => p.id !== user?.id) || c.participants[0]);
                  const name = c.isGroup ? c.name : (partner?.name || '');
                  const avatar = c.isGroup ? c.avatar! : (partner?.avatar || '');
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

      <div className="flex flex-1 overflow-hidden h-full min-h-0 w-full">
        <div className="flex flex-col flex-1 min-h-0 relative w-full">
          <header className="px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-6 sm:py-4 bg-bg-light/80 backdrop-blur-xl border-b border-primary/5 sticky top-0 z-40">
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
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                    <button onClick={handleBack} className="size-9 sm:size-10 rounded-xl bg-white flex-shrink-0 flex items-center justify-center text-slate-600 md:hidden shadow-sm border border-white">
                      <Icon name="chevron_left" />
                    </button>
                    <div 
                      onClick={() => {
                        if (chat?.isGroup) {
                          setActiveGroupInfoId(chat.id);
                        } else {
                          const userId = otherParticipantId;
                          if (userId) useAppStore.getState().setViewingUserId(userId);
                        }
                      }}
                      className="flex items-center gap-2 sm:gap-3 flex-1 cursor-pointer group min-w-0"
                    >
                      <Avatar 
                        src={chatAvatar!} 
                        className="size-9 sm:size-11 flex-shrink-0 group-hover:scale-105 transition-transform" 
                        status={!chat?.isGroup ? (isOnline ? 'online' : 'offline') : undefined} 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-black text-slate-900 truncate tracking-tight italic uppercase text-xs sm:text-base">{chatName}</h3>
                          {isMuted && <Icon name="notifications_off" className="text-[10px] text-slate-400" />}
                        </div>
                        <p className={`text-[10px] font-black uppercase tracking-widest transition-colors duration-200 ${isRecipientTyping ? 'text-green-500 animate-pulse' : (isSelfTyping ? 'text-slate-400 animate-pulse italic' : (isOnline ? 'text-primary' : 'text-slate-400'))}`}>
                          {isRecipientTyping ? (
                            <span>{typingText}</span>
                          ) : isSelfTyping ? (
                            <span>Typing from another device...</span>
                          ) : (
                            chat?.isGroup ? `${memberCount} members` : (isOnline ? 'Live Now' : (lastSeenVal ? `Last seen: ${formatLastSeen(lastSeenVal)}` : 'Offline'))
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2 relative flex-shrink-0">
                    <button 
                      onClick={() => {
                        if (!canStartCalls) return;
                        if (chat?.isGroup) {
                          setActiveGroupCall({ type: 'voice', groupId: chat.id });
                        } else {
                          const userId = otherParticipantId;
                          if (userId) setActiveGroupCall({ type: 'voice', userId });
                        }
                      }}
                      disabled={!canStartCalls}
                      className={`size-9 sm:size-11 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center transition-all active:scale-95 border border-white shadow-sm ${!canStartCalls ? 'opacity-50 grayscale cursor-not-allowed' : 'text-primary hover:bg-primary hover:text-white'}`}
                    >
                      <Icon name="call" />
                    </button>
                    <button 
                      onClick={() => {
                        if (!canStartCalls) return;
                        if (chat?.isGroup) {
                          setActiveGroupCall({ type: 'video', groupId: chat.id });
                        } else {
                          const userId = otherParticipantId;
                          if (userId) setActiveGroupCall({ type: 'video', userId });
                        }
                      }}
                      disabled={!canStartCalls}
                      className={`size-9 sm:size-11 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center transition-all active:scale-95 border border-white shadow-sm ${!canStartCalls ? 'opacity-50 grayscale cursor-not-allowed' : 'text-primary hover:bg-primary hover:text-white'}`}
                    >
                      <Icon name="videocam" />
                    </button>

                    <div className="relative">
                      <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className="size-9 sm:size-11 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm"
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
                                    const userId = otherParticipantId;
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
                  <span>{chat?.isGroup ? 'You joined the group' : 'End-to-end encrypted'}</span>
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
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest px-1">
                        <span>{msg.senderName}</span>
                      </span>
                    )}
                    <div className="flex items-end gap-2">
                      {!isOwn && chat?.isGroup && (
                        <Avatar src={msg.avatar || generateInitialsAvatar(msg.senderId, msg.senderName || 'User')} className="size-8 mb-1" />
                      )}
                      <div 
                        onPointerDown={(e) => handlePointerDown(e, msg.id, msg.text || '', isOwn)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onContextMenu={(e) => handleContextMenu(e, msg.id, msg.text || '', isOwn)}
                        className={cn(
                          "p-4 rounded-[1.5rem] shadow-sm relative touch-none transition-all max-w-full overflow-hidden break-words break-all",
                          isOwn 
                             ? (msg.status === 'failed'
                                 ? "bg-red-500/10 text-red-600 rounded-tr-none border border-red-500/20 shadow-none"
                                 : "bg-primary text-white rounded-tr-none shadow-primary/20")
                             : "bg-white text-slate-700 rounded-tl-none border border-slate-100",
                          selectedMessageIds.includes(msg.id) && (isOwn ? "bg-primary-dark ring-4 ring-primary/20" : "bg-primary/10 ring-2 ring-primary/20")
                        )}
                      >
                        {isGloballyDeleted ? (
                          <span className={cn("italic", isOwn ? "text-white/60" : "text-slate-400")}>
                            <span>{isOwn ? "You deleted this message" : "This message was deleted"}</span>
                          </span>
                        ) : msg.type === 'image' || msg.type === 'audio' || msg.type === 'file' ? (
                          <DecryptedMedia msg={msg} isOwn={isOwn} peerId={otherParticipantId} onPreview={(data) => setPreviewMedia(data)} onRetrySend={retrySendMedia} />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap break-words break-all"><span>{msg.text}</span></p>
                        )}

                        {reactions[msg.id] && reactions[msg.id].length > 0 && !isGloballyDeleted && (
                          <div className={cn("absolute -bottom-2 flex gap-0.5", isOwn ? "-left-2" : "-right-2")}>
                            {Array.from(new Set(reactions[msg.id])).map(emoji => (
                              <div key={emoji} className="bg-white shadow-xl border border-slate-100 rounded-full px-2 py-1 flex items-center gap-1.5">
                                <span className="text-xs"><span>{emoji}</span></span>
                                <span className="text-[9px] font-black text-slate-900">
                                  <span>{reactions[msg.id].filter(e => e === emoji).length}</span>
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
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                        <span>{msg.timestamp}</span>
                      </span>
                      {isOwn && !isGloballyDeleted && (() => {
                        const status = msg.status || 'read';
                        const iconName = 
                          status === 'failed' ? 'error_outline' :
                          status === 'pending' ? 'schedule' :
                          (status === 'read' || status === 'delivered') ? 'done_all' : 'check';
                        const iconColor = 
                          status === 'failed' ? 'text-red-500 font-black' :
                          status === 'pending' ? 'text-amber-500 animate-pulse' :
                          status === 'read' ? 'text-blue-500' : 'text-slate-400';
                        return (
                          <Icon 
                            name={iconName} 
                            className={cn("text-[14px]", iconColor)} 
                          />
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
              
              {activeUploads.map((upload) => {
                let iconName = 'insert_drive_file';
                let typeText = 'file';
                if (upload.mediaType === 'audio') {
                  iconName = 'mic';
                  typeText = 'voice note';
                } else if (upload.mediaType === 'image') {
                  iconName = 'image';
                  typeText = 'photo';
                } else if (upload.mediaType === 'video') {
                  iconName = 'videocam';
                  typeText = 'video';
                }

                const fileLabel = upload.fileName || typeText;

                return (
                  <div key={`upload-${upload.senderId}-${upload.messageId}`} className="flex flex-col gap-1.5 max-w-[85%] self-start items-start text-xs font-semibold text-slate-500">
                    <div className="flex items-end gap-2">
                      <div className="px-4 py-3 rounded-[1.5rem] bg-white rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-3">
                        <div className="relative flex items-center justify-center">
                          <div className="size-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                          <div className="absolute flex items-center justify-center">
                            <Icon name={iconName} className="text-[10px] text-primary" />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-700 leading-tight">
                            {chat?.isGroup && (
                              <span className="font-bold text-primary mr-1">{upload.senderName}:</span>
                            )}
                            Sending {fileLabel}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Progress: {upload.percent}%
                          </span>
                        </div>
                      </div>
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

      <footer className="px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4 bg-bg-light/80 backdrop-blur-xl border-t border-primary/5 flex flex-col gap-2 sm:gap-3 sticky bottom-0 z-30">
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
                    <AudioPreviewPlayer url={media.url} duration={(media as any).duration} />
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
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={!canSendMessages}
              className={`size-9 sm:size-10 rounded-full flex items-center justify-center transition-colors ${!canSendMessages ? 'opacity-50 grayscale cursor-not-allowed' : showEmojiPicker ? 'text-primary bg-primary/10' : 'text-neutral-muted hover:bg-slate-50'}`}
            >
              <Icon name="mood" />
            </button>
            {!messageText && canSendMessages && (
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="size-9 sm:size-10 rounded-full flex items-center justify-center text-neutral-muted hover:bg-slate-50 transition-colors"
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
          <div className="flex-1 bg-white rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 shadow-sm border border-white">
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
                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:outline-none text-xs sm:text-sm" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="text-neutral-muted hover:text-primary transition-colors flex-shrink-0"
                >
                  <Icon name="attach_file" />
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const isImage = file.type.startsWith('image/');
                        const isVideo = file.type.startsWith('video/');
                        const isAudio = file.type.startsWith('audio/');
                        const typeKey = isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file'));
                        
                        const validation = validateFileBeforeUpload(file, typeKey);
                        if (!validation.valid) {
                          setToast(validation.message || 'Validation failed');
                          setTimeout(() => setToast(null), 4000);
                          e.target.value = "";
                          return;
                        }

                        const url = URL.createObjectURL(file);
                        setCapturedMedia(prev => [...prev, { type: isImage ? 'image' : 'file', url, blob: file, name: file.name }]);
                      }
                      e.target.value = "";
                    }}
                  />
                </button>
              </>
            )}
          </div>
          {canSendMessages && (
            (messageText || capturedMedia.length > 0) ? (
              <button 
                id="chat-send-btn"
                onClick={handleSend}
                disabled={isRecording}
                className="size-10 sm:size-12 rounded-xl sm:rounded-2xl bg-primary text-white flex-shrink-0 flex items-center justify-center shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
              >
                <Icon name="send" />
              </button>
            ) : (
              <button 
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                style={{ touchAction: 'none' }}
                className={`size-10 sm:size-12 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center transition-all ${isRecording ? 'text-white bg-red-500 scale-110 shadow-lg shadow-red-500/30' : 'text-white bg-primary shadow-xl shadow-primary/30 hover:brightness-110'}`}
              >
                <Icon name={isRecording ? "stop" : "mic"} />
              </button>
            )
          )}
        </div>
      </footer>
        </div>
        <AnimatePresence>
          {activeGroupInfoId && <GroupInfo onClose={() => setActiveGroupInfoId(null)} />}
          {previewMedia && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-955/95 backdrop-blur-md"
                onClick={() => setPreviewMedia(null)}
              />
              
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[85vh]"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Icon name={previewMedia.type === 'image' ? 'image' : 'description'} />
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="text-sm font-bold text-white truncate">{previewMedia.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{previewMedia.size || 'Unknown Size'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a 
                      href={previewMedia.url} 
                      download={previewMedia.name} 
                      className="size-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors"
                      title="Download file"
                    >
                      <Icon name="download" className="text-lg" />
                    </a>
                    <button 
                      onClick={() => setPreviewMedia(null)} 
                      className="size-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors"
                    >
                      <Icon name="close" className="text-lg" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-950/30 min-h-[300px]">
                  {previewMedia.type === 'image' ? (
                    <img 
                      src={previewMedia.url} 
                      alt={previewMedia.name} 
                      className="max-w-[90vw] max-h-[85vh] md:max-w-[85vw] md:max-h-[80vh] object-contain rounded-lg shadow-2xl transition-all duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="text-center max-w-sm p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
                      <div className="size-16 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4 shadow-inner">
                        <Icon name="description" className="text-3xl" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">{previewMedia.name}</h4>
                      <p className="text-xs text-slate-400 mb-6">This document can be downloaded or previewed natively on your device.</p>
                      <a 
                        href={previewMedia.url} 
                        download={previewMedia.name} 
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
                      >
                        <Icon name="download" className="text-sm" /> Download to View
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
