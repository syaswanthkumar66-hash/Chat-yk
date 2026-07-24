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
      const oldKeys = keys.filter(key => key.startsWith('app-cache-') && key !== 'app-cache-v4');
      if (oldKeys.length > 0) {
        console.log('[Main] Found outdated Service Worker caches to purge:', oldKeys);
        Promise.all(oldKeys.map(key => caches.delete(key)))
          .then(() => {
            console.log('[Main] Purged outdated app caches.');
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
          // Force check for update on load
          reg.update();
        })
        .catch(err => {
          console.error('[Main] Service Worker registration failed:', err);
        });
        
      // Handle the new service worker taking control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
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
