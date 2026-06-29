// Service Worker for Web Push Notifications
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push event received in Service Worker');
  
  let data = { title: 'New Message', body: 'You have a new message.' };
  
  if (event.data) {
    const rawText = event.data.text();
    console.log('Push raw text:', rawText);
    
    try {
      data = event.data.json();
    } catch (e) {
      console.warn('Failed to parse push data as JSON directly, attempting manual string parse:', e);
      // Attempt manual parsing fallback if text looks like JSON
      if (rawText && rawText.trim().startsWith('{')) {
        try {
          data = JSON.parse(rawText);
        } catch (parseErr) {
          console.error('Failed manual JSON parse fallback:', parseErr);
          data = { title: 'New Message', body: rawText };
        }
      } else {
        data = { title: 'New Message', body: rawText || 'You have a new message.' };
      }
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
  const urlToOpen = '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
