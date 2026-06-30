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

  console.log('Showing notification (if not focused):', title, options);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the user has a focused browser tab open, suppress the redundant push notification
      const isFocused = windowClients.some(client => client.focused);
      if (isFocused) {
        console.log('App tab is currently active and focused. Suppressing push notification.');
        return;
      }

      return self.registration.showNotification(title, options)
        .then(() => {
          console.log('Notification successfully displayed');
        })
        .catch((err) => {
          console.error('Failed to show standard notification, trying minimal fallback:', err);
          // Fallback to absolute minimal properties if browser complains about advanced features (like tag, renotify, etc.)
          return self.registration.showNotification(title, {
            body: body
          });
        });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open at the target URL, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
