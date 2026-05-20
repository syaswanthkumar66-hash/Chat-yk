import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Button, cn } from './UI';

interface MediaGalleryProps {
  onClose: () => void;
  groupId?: string;
}

type TabType = 'photos' | 'videos' | 'docs' | 'links';

export const MediaGallery = ({ onClose, groupId }: MediaGalleryProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('photos');
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'photos', label: 'Photos', icon: 'image' },
    { id: 'videos', label: 'Videos', icon: 'videocam' },
    { id: 'docs', label: 'Docs', icon: 'description' },
    { id: 'links', label: 'Links', icon: 'link' },
  ];

  const mockData = {
    photos: Array.from({ length: 15 }).map((_, i) => ({ id: `photo-${i}`, title: `Photo ${i + 1}`, url: `https://picsum.photos/seed/photo${i}/300` })),
    videos: Array.from({ length: 6 }).map((_, i) => ({ id: `video-${i}`, title: `Video ${i + 1}`, url: `https://picsum.photos/seed/video${i}/400/225`, duration: '0:45', size: '12.4 MB' })),
    docs: Array.from({ length: 8 }).map((_, i) => ({ id: `doc-${i}`, title: `Project_Specs_v${i + 1}.pdf`, size: '1.2 MB', date: 'Oct 24, 2023' })),
    links: Array.from({ length: 10 }).map((_, i) => ({ id: `link-${i}`, url: `https://figma.com/file/design-system-${i}`, description: 'Check out the latest updates to the design system components and styles.' })),
  };

  const filteredData = {
    photos: mockData.photos.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase())),
    videos: mockData.videos.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase())),
    docs: mockData.docs.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase())),
    links: mockData.links.filter(item => item.url.toLowerCase().includes(searchQuery.toLowerCase()) || item.description.toLowerCase().includes(searchQuery.toLowerCase())),
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'photos':
        return (
          <div className="grid grid-cols-3 gap-1">
            {filteredData.photos.map((item, i) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={item.id} 
                className="aspect-square bg-slate-200 overflow-hidden"
              >
                <img 
                  src={item.url} 
                  alt={item.title} 
                  className="size-full object-cover hover:scale-110 transition-transform duration-500 cursor-pointer" 
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            ))}
            {filteredData.photos.length === 0 && (
              <div className="col-span-3 py-20 text-center text-slate-400">
                <Icon name="search_off" className="text-4xl mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest">No photos found</p>
              </div>
            )}
          </div>
        );
      case 'videos':
        return (
          <div className="grid grid-cols-2 gap-2 p-2">
            {filteredData.videos.map((item, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={item.id} 
                className="aspect-video bg-slate-900 rounded-xl overflow-hidden relative group cursor-pointer"
              >
                <img 
                  src={item.url} 
                  className="size-full object-cover opacity-60 group-hover:scale-105 transition-transform" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="size-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <Icon name="play_arrow" className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                  <span className="text-[8px] font-bold text-white uppercase tracking-widest">{item.duration}</span>
                  <span className="text-[8px] font-bold text-white uppercase tracking-widest">{item.size}</span>
                </div>
              </motion.div>
            ))}
            {filteredData.videos.length === 0 && (
              <div className="col-span-2 py-20 text-center text-slate-400">
                <Icon name="search_off" className="text-4xl mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest">No videos found</p>
              </div>
            )}
          </div>
        );
      case 'docs':
        return (
          <div className="p-4 space-y-2">
            {filteredData.docs.map((item, i) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={item.id} 
                className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-primary/5 hover:border-primary/20 transition-all cursor-pointer group"
              >
                <div className="size-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                  <Icon name="description" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{item.title}</p>
                  <p className="text-[10px] text-neutral-muted uppercase tracking-widest">{item.size} • {item.date}</p>
                </div>
                <Icon name="download" className="text-slate-300 group-hover:text-primary transition-colors" />
              </motion.div>
            ))}
            {filteredData.docs.length === 0 && (
              <div className="py-20 text-center text-slate-400">
                <Icon name="search_off" className="text-4xl mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest">No documents found</p>
              </div>
            )}
          </div>
        );
      case 'links':
        return (
          <div className="p-4 space-y-3">
            {filteredData.links.map((item, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={item.id} 
                className="p-4 bg-white rounded-2xl border border-primary/5 hover:border-primary/20 transition-all cursor-pointer group space-y-2"
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                    <Icon name="link" className="text-sm" />
                  </div>
                  <p className="text-xs font-bold text-primary truncate">{item.url}</p>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
            {filteredData.links.length === 0 && (
              <div className="py-20 text-center text-slate-400">
                <Icon name="search_off" className="text-4xl mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest">No links found</p>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-0 z-[150] bg-bg-light flex flex-col"
    >
      <header className="px-6 pt-10 pb-6 bg-white border-b border-primary/5 flex items-center gap-4">
        <button onClick={onClose} className="size-11 rounded-2xl bg-primary/5 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95">
          <Icon name="chevron_left" />
        </button>
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {isSearching ? (
              <motion.div
                key="search-input"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="relative"
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Search media..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-100 border-none rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                />
              </motion.div>
            ) : (
              <motion.div
                key="title"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h3 className="text-xl font-black uppercase tracking-tight italic text-slate-900">Media & Links</h3>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Weekend Planners</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button 
          onClick={() => {
            setIsSearching(!isSearching);
            if (isSearching) setSearchQuery('');
          }}
          className={cn(
            "size-11 rounded-2xl flex items-center justify-center transition-all active:scale-95",
            isSearching ? "bg-primary text-white" : "bg-primary/5 text-primary hover:bg-primary hover:text-white"
          )}
        >
          <Icon name={isSearching ? "close" : "search"} />
        </button>
      </header>
      <div className="bg-white border-b border-primary/5 flex p-2 gap-1 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all",
              activeTab === tab.id 
                ? "bg-primary text-white shadow-xl shadow-primary/20" 
                : "text-slate-400 hover:bg-primary/5 hover:text-primary"
            )}
          >
            <Icon name={tab.icon} className="text-lg" />
            <span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto no-scrollbar bg-bg-light">
        {renderContent()}
      </main>
    </motion.div>
  );
};
