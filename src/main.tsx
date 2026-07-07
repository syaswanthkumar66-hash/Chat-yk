/// <reference types="vite-plugin-pwa/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Register the unified Service Worker (/sw.js) directly to prevent scope conflicts
if (typeof window !== 'undefined') {
  // Proactive cache-busting of stale Cache Storage from the main thread
  if (window.caches) {
    caches.keys().then((keys) => {
      const oldKeys = keys.filter(key => key !== 'app-cache-v4');
      if (oldKeys.length > 0) {
        console.log('[Main] Found outdated Service Worker caches to purge:', oldKeys);
        Promise.all(oldKeys.map(key => caches.delete(key)))
          .then(() => {
            console.log('[Main] Purged all outdated caches. Forcing fresh reload...');
            window.location.reload();
          })
          .catch(err => {
            console.error('[Main] Failed to purge outdated caches:', err);
          });
      }
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[Main] Service Worker registered successfully with scope:', reg.scope);
          
          // Check if there is an updated service worker waiting to activate
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[Main] New Service Worker content is available; please refresh.');
                  // Optionally force page reload to let new service worker claim control
                  window.location.reload();
                }
              };
            }
          };
        })
        .catch(err => {
          console.error('[Main] Service Worker registration failed:', err);
        });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
