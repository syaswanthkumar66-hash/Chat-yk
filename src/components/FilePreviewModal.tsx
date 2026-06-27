import React, { useState } from 'react';
import { Transfer } from '../types';
import { Icon, Card, Button } from './UI';
import { motion } from 'framer-motion';

interface FilePreviewModalProps {
  transfer: Transfer;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  transfer,
  onClose,
  onAccept,
  onDecline,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeSlide, setActiveSlide] = useState<number>(1);
  const [activePdfPage, setActivePdfPage] = useState<number>(1);
  const [zipFolderExpanded, setZipFolderExpanded] = useState<boolean>(true);

  // Custom preview stages depending on file type
  const renderPreviewStage = () => {
    switch (transfer.fileType) {
      case 'image':
        return (
          <div className="flex flex-col items-center gap-4 bg-slate-950 p-6 rounded-3xl border border-white/5 relative overflow-hidden">
            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-white/5 z-10 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              SRGB • 300 DPI
            </div>
            <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-black text-primary uppercase tracking-widest border border-white/5 z-10">
              {zoomLevel}% SCALE
            </div>
            
            <div className="w-full h-64 flex items-center justify-center overflow-hidden rounded-2xl bg-checkered relative border border-white/5">
              <motion.img 
                src={transfer.previewUrl || "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=400&q=80"} 
                alt={transfer.fileName}
                className="max-h-full max-w-full object-contain shadow-2xl rounded"
                animate={{ scale: zoomLevel / 100 }}
                transition={{ type: 'spring', damping: 25 }}
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Image Controls */}
            <div className="w-full flex items-center justify-between px-2">
              <div className="flex gap-2">
                {[
                  { name: 'zoom_in', label: 'Zoom In', onClick: () => setZoomLevel(prev => Math.min(prev + 25, 200)) },
                  { name: 'zoom_out', label: 'Zoom Out', onClick: () => setZoomLevel(prev => Math.max(prev - 25, 50)) },
                  { name: 'crop_free', label: 'Fit Screen', onClick: () => setZoomLevel(100) }
                ].map((btn) => (
                  <button 
                    key={btn.name}
                    onClick={btn.onClick}
                    className="size-9 rounded-xl bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all active:scale-95 border border-white/5"
                    title={btn.label}
                  >
                    <Icon name={btn.name} className="text-lg" />
                  </button>
                ))}
              </div>
              
              {/* Fake Color Palette Extracted */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-1">PALETTE:</span>
                {['#3B82F6', '#10B981', '#F59E0B', '#1E293B'].map((color, i) => (
                  <div key={i} className="size-4 rounded-full border border-white/10" style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="flex flex-col gap-4 bg-slate-950 p-6 rounded-3xl border border-white/5 relative overflow-hidden">
            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-black text-rose-500 uppercase tracking-widest border border-white/5 z-10 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
              1080P HEVC • H.265
            </div>
            
            <div className="w-full h-64 rounded-2xl relative overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
              <img 
                src={transfer.previewUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80"} 
                alt="Video poster" 
                className="w-full h-full object-cover opacity-60"
                referrerPolicy="no-referrer"
              />
              
              {/* Custom Play Overlay */}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="size-16 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/30 border border-white/10 z-20"
                >
                  <Icon name={isPlaying ? "pause" : "play_arrow"} className="text-3xl" fill={!isPlaying} />
                </motion.button>
              </div>

              {/* Fake playback progress */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/5">
                <span className="text-[10px] font-mono text-slate-300">0:14</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1/3 h-full bg-primary rounded-full" />
                </div>
                <span className="text-[10px] font-mono text-slate-400">2:45</span>
                <Icon name="volume_up" className="text-slate-300 text-sm" />
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FPS: 60.0 • Audio: AAC 2.0</p>
              <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-slate-400 text-[9px] font-black border border-white/5">SUBTITLES: AUTO</span>
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div className="flex flex-col gap-4 bg-slate-100 p-6 rounded-3xl border border-slate-200/60">
            {/* PDF page stage */}
            <div className="w-full bg-white rounded-2xl p-6 shadow-md border border-slate-200/50 min-h-64 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header of document */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">ACME GLOBAL GROUP</h4>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">INVOICE PROTOCOL</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-800">#INV-2026-904</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">DATE: 26 JUN 2026</p>
                  </div>
                </div>

                {/* Content of PDF */}
                {activePdfPage === 1 ? (
                  <div className="space-y-3">
                    <div className="h-2 bg-slate-100 rounded w-3/4" />
                    <div className="h-2 bg-slate-100 rounded w-5/6" />
                    <div className="h-2 bg-slate-100 rounded w-1/2" />
                    <div className="pt-4 space-y-2">
                      <div className="flex justify-between text-[10px] border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-800">Connect Pro Implementation</span>
                        <span className="font-mono text-slate-600">$4,500.00</span>
                      </div>
                      <div className="flex justify-between text-[10px] border-b border-slate-100 pb-1">
                        <span className="font-bold text-slate-800">Secure Node Configuration</span>
                        <span className="font-mono text-slate-600">$1,200.00</span>
                      </div>
                      <div className="flex justify-between text-[10px] pt-1">
                        <span className="font-black text-slate-900">Total Due</span>
                        <span className="font-black text-primary">$5,700.00</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Terms & Conditions</h5>
                    <div className="h-2 bg-slate-100 rounded w-full" />
                    <div className="h-2 bg-slate-100 rounded w-full" />
                    <div className="h-2 bg-slate-100 rounded w-full" />
                    <div className="h-2 bg-slate-100 rounded w-2/3" />
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                      <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs">
                        <Icon name="verified" className="text-xs" />
                      </div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">DIGITALLY SECURED VIA CONNECT PROTKEY</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <span>ACME_INVOICE.PDF</span>
                <span>PAGE {activePdfPage} OF 2</span>
              </div>
            </div>

            {/* Page Controls */}
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Adobe PDF Spec 1.7</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActivePdfPage(1)}
                  disabled={activePdfPage === 1}
                  className="px-3 py-1 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/60 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  PREV
                </button>
                <button 
                  onClick={() => setActivePdfPage(2)}
                  disabled={activePdfPage === 2}
                  className="px-3 py-1 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/60 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  NEXT
                </button>
              </div>
            </div>
          </div>
        );

      case 'presentation':
        return (
          <div className="flex gap-4 bg-slate-900 p-5 rounded-3xl border border-white/5">
            {/* Thumbnails Sidebar */}
            <div className="w-16 flex flex-col gap-2.5">
              {[1, 2, 3].map((slide) => (
                <button
                  key={slide}
                  onClick={() => setActiveSlide(slide)}
                  className={`aspect-[4/3] rounded-lg border overflow-hidden relative transition-all ${
                    activeSlide === slide 
                      ? 'border-primary ring-2 ring-primary/30' 
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="absolute inset-0 bg-slate-950 flex flex-col justify-between p-1.5 text-left">
                    <span className="text-[5px] font-black text-slate-500 uppercase">SLIDE 0{slide}</span>
                    <div className="space-y-0.5">
                      <div className="w-8 h-1 bg-white/20 rounded" />
                      <div className="w-6 h-0.5 bg-white/10 rounded" />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Main Stage */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="aspect-[4/3] bg-slate-950 rounded-2xl p-6 border border-white/5 flex flex-col justify-between shadow-inner">
                <div>
                  <span className="text-[8px] font-black text-primary uppercase tracking-[0.2em]">CONNECT MASTERCLASS • 0{activeSlide}</span>
                  {activeSlide === 1 && (
                    <div className="mt-4 space-y-4">
                      <h4 className="text-xl font-black text-white uppercase italic tracking-tighter leading-tight border-l-4 border-primary pl-3">
                        Q3 MARKETING STRATEGY & VISION
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                        An overview of targeted growth corridors, native integration capabilities, and product alignment cycles for the year 2026.
                      </p>
                    </div>
                  )}
                  {activeSlide === 2 && (
                    <div className="mt-4 space-y-3">
                      <h4 className="text-md font-black text-white uppercase tracking-tight">Key Deliverables</h4>
                      <div className="space-y-1.5">
                        {['Omnichannel customer alignment', 'Frictionless P2P protocol deployment', 'Decentralized caching nodes'].map((item, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-primary" />
                            <span className="text-[9px] font-bold text-slate-300">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeSlide === 3 && (
                    <div className="mt-4 space-y-3">
                      <h4 className="text-md font-black text-white uppercase tracking-tight">Target Timeline</h4>
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        {['Q1: R&D', 'Q2: Alpha', 'Q3: Launch'].map((t, index) => (
                          <div key={index} className="bg-slate-900 p-2 rounded-xl border border-white/5 text-center">
                            <span className="text-[8px] font-black text-slate-400 block uppercase">{t.split(': ')[0]}</span>
                            <span className="text-[10px] font-black text-white mt-1 block italic">{t.split(': ')[1]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-[8px] font-black text-slate-500 uppercase tracking-widest border-t border-white/5 pt-3">
                  <span>Apple Keynote Format</span>
                  <span>CONFIDENTIAL</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'zip':
        return (
          <div className="flex flex-col gap-4 bg-slate-950 p-6 rounded-3xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Icon name="folder_zip" fill className="text-xl" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">{transfer.fileName}</h4>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">PKZIP Archive v2.0</p>
                </div>
              </div>
              <span className="text-xs font-black text-primary italic bg-primary/10 px-3 py-1 rounded-full">{transfer.fileSize}</span>
            </div>

            {/* Folder Explorer */}
            <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-4 max-h-56 overflow-y-auto no-scrollbar space-y-3">
              {/* Folder Node */}
              <div className="space-y-1.5">
                <button 
                  onClick={() => setZipFolderExpanded(!zipFolderExpanded)}
                  className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-white transition-all"
                >
                  <Icon name={zipFolderExpanded ? "expand_more" : "chevron_right"} className="text-sm" />
                  <Icon name="folder" className="text-amber-500 text-sm" fill />
                  production_assets /
                </button>

                {zipFolderExpanded && (
                  <div className="pl-6 space-y-2.5 border-l border-white/10 ml-2 pt-1">
                    {[
                      { name: 'logo_full_color.png', size: '240 KB', type: 'image' },
                      { name: 'web_font_bold.woff2', size: '92 KB', type: 'font' },
                      { name: 'config_schema.json', size: '12 KB', type: 'code' },
                    ].map((file) => (
                      <div key={file.name} className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                          <Icon name={file.type === 'image' ? 'photo' : file.type === 'font' ? 'font_download' : 'code'} className="text-slate-500 text-sm" />
                          <span className="hover:text-white cursor-pointer transition-all">{file.name}</span>
                        </div>
                        <span className="font-mono text-[8px] text-slate-500">{file.size}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Root Files */}
              <div className="pt-2 border-t border-white/5 space-y-2.5">
                {[
                  { name: 'index.html', size: '8.4 KB', type: 'html' },
                  { name: 'README.md', size: '1.2 KB', type: 'doc' },
                ].map((file) => (
                  <div key={file.name} className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <div className="flex items-center gap-2 pl-4">
                      <Icon name={file.type === 'html' ? 'html' : 'article'} className="text-slate-500 text-sm" />
                      <span className="hover:text-white cursor-pointer transition-all">{file.name}</span>
                    </div>
                    <span className="font-mono text-[8px] text-slate-500">{file.size}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">
              Compression Ratio: 89.2% • 5 Files Total
            </p>
          </div>
        );

      default: // audio, document, etc.
        return (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-3xl border border-slate-200/60 text-center space-y-4">
            <div className="size-20 rounded-[2rem] bg-primary/10 text-primary flex items-center justify-center animate-bounce">
              <Icon name="description" className="text-4xl" fill />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-900 uppercase tracking-tight italic">{transfer.fileName}</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{transfer.fileSize} • {transfer.fileType?.toUpperCase()} FILE</p>
            </div>
            <div className="px-4 py-2 bg-white rounded-2xl shadow-sm border border-slate-200/50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              SHA256 CHECKSUM SECURED
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 z-[200]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="visibility" className="text-xl" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic">File Share Preview</h3>
              <p className="text-[9px] font-black text-primary uppercase tracking-widest mt-0.5">Secure Connect Protocol Preview</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="size-10 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-800 flex items-center justify-center transition-all active:scale-95"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </header>

        {/* Preview Stage */}
        <div className="p-8 overflow-y-auto no-scrollbar flex-1 space-y-6">
          {/* Main Visual Component */}
          {renderPreviewStage()}

          {/* Transfer Info */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Sender Device</p>
                <p className="text-xs font-black text-slate-900 uppercase tracking-tight mt-1">{transfer.senderName || 'Unknown Device'}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estimated Transfer</p>
                <p className="text-xs font-black text-slate-900 uppercase tracking-tight mt-1">{transfer.fileSize} @ Wi-Fi Direct</p>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
              <Icon name="lock" className="text-emerald-500 text-sm" />
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.15em]">
                END-TO-END ENCRYPTED VIA SECURE SIGNAL PROTOCOL
              </span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <footer className="p-8 border-t border-slate-100 flex gap-4 bg-slate-50">
          <button 
            onClick={() => {
              onDecline();
              onClose();
            }}
            className="flex-1 h-14 rounded-2xl bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-500 font-black uppercase tracking-widest text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
          >
            <Icon name="block" className="text-md" />
            Decline Share
          </button>
          
          <button 
            onClick={() => {
              onAccept();
              onClose();
            }}
            className="flex-1 h-14 rounded-2xl bg-primary text-white hover:brightness-110 font-black uppercase tracking-widest text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
          >
            <Icon name="cloud_download" className="text-md" />
            Accept & Transfer
          </button>
        </footer>
      </motion.div>
    </div>
  );
};
