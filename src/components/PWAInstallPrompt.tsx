import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, Button } from './UI';


export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    const isStandAloneMatch = window.matchMedia('(display-mode: standalone)').matches;
    const isNavStandalone = (navigator as any).standalone === true;
    if (isStandAloneMatch || isNavStandalone) {
      setIsStandalone(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt if we have the event and it hasn't been dismissed recently
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed || Date.now() - parseInt(hasDismissed) > 86400000) {
        setTimeout(() => setShowPrompt(true), 2000); // delay showing slightly
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS we just show it if they aren't in standalone and haven't dismissed
    if (isIOSDevice) {
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed || Date.now() - parseInt(hasDismissed) > 86400000) {
        setTimeout(() => setShowPrompt(true), 2000);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl z-[9999] p-6 border border-slate-200 dark:border-slate-700/50"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
              <Icon name="app_shortcut" className="text-white text-3xl" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Install App</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Install for a better, fullscreen experience.
              </p>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-full transition-colors">
            <Icon name="close" className="text-xl" />
          </button>
        </div>
        
        {isIOS && !deferredPrompt ? (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              To install on iOS: tap <Icon name="ios_share" className="inline text-lg align-bottom mx-1" /> and select <strong>Add to Home Screen</strong>.
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <Button onClick={handleInstall} variant="primary" className="w-full rounded-xl py-3 font-semibold text-[15px]">
              Add to Home Screen
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
