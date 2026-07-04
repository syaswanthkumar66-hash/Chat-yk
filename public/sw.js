// Service Worker for Web Push Notifications and Offline Support

const CACHE_NAME = 'app-cache-v2';
const OFFLINE_URL = '/offline.html';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/favicon.ico',
  '/pwa-192x192.png',
  '/pwa-512x512.png'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching initial assets');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Failed to cache some assets during install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  // Delete old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old Service Worker cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event listener: cache-first with network fallback and offline page support
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Skip API requests and Chrome extensions
  if (event.request.url.includes('/api/') || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for next time
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // User is offline and asset isn't cached
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
    })
  );
});

self.addEventListener('push', (event) => {
  console.log('Push event received in Service Worker');
  
  let data = { title: 'New Message', body: 'You have a new message.' };
  
  if (event.data) {
    // Call .text() ONCE only — never call both .text() and .json()
    const rawText = event.data.text();
    console.log('Push raw text:', rawText);
    
    if (rawText && rawText.trim().startsWith('{')) {
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('Failed to parse push payload as JSON:', parseErr);
        data = { title: 'New Message', body: rawText };
      }
    } else if (rawText) {
      data = { title: 'New Message', body: rawText };
    }
  }

  // Ensure title and body are valid strings
  const title = data.title || 'New Message';
  const body = data.body || 'You have a new message.';
  
  // Use a local, guaranteed-to-exist app icon to bypass any CORS issues with remote image URLs
  const icon = '/pwa-192x192.png';
  const badge = '/favicon.ico';

  const options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: data.tag || 'chat-alert',
    data: data.data || {}
  };

  console.log('Showing notification:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('Notification successfully displayed');
      })
      .catch((err) => {
        console.error('Failed to show standard notification, trying minimal fallback:', err);
        // Fallback to absolute minimal properties if browser complains about advanced features (like tag, renotify, etc.)
        return self.registration.showNotification(title, {
          body: body
        });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If we have an open tab of our app, focus it, post a message and navigate
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          client.focus();
          if ('postMessage' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              url: rawUrl,
              data: event.notification.data
            });
          }
          if ('navigate' in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }

      // 2. Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle push subscription changes from the browser
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription expired or changed, triggering renewal...');
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then((newSubscription) => {
        // Broadcast the change to all open clients so they can re-register and sync
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          windowClients.forEach((client) => {
            if ('postMessage' in client) {
              client.postMessage({
                type: 'PUSH_SUBSCRIPTION_CHANGE',
                endpoint: newSubscription.endpoint
              });
            }
          });
        });
      })
      .catch((err) => {
        console.error('Failed to automatically re-subscribe push subscription:', err);
      })
  );
});
