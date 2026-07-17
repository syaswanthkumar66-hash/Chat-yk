import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icon, Button } from './UI';

export const WebBrowser = ({ onClose }: { onClose: () => void }) => {
  const [url, setUrl] = useState('https://www.wikipedia.org/');
  const [inputUrl, setInputUrl] = useState(url);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUrl = inputUrl.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    setUrl(finalUrl);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-[150] bg-white dark:bg-slate-900 flex flex-col"
    >
      <div className="flex items-center gap-2 p-2 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
          <Icon name="close" />
        </button>
        <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Surf the web... (Enter URL)"
            className="flex-1 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" className="rounded-full px-4 text-xs font-bold uppercase tracking-widest">
            Go
          </Button>
        </form>
      </div>
      <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative">
        <iframe
          src={url}
          className="w-full h-full border-none"
          sandbox="allow-same-origin allow-scripts allow-forms"
          title="In-App Browser"
        />
      </div>
    </motion.div>
  );
};
