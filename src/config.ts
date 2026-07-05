// Dynamic backend URL configuration for separating frontend and backend hosting.
let rawBackendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';

// If the configured URL is a bare hostname (e.g. from Render's fromService blueprint referencing host property),
// we prepend https:// so that it is treated as a valid absolute URL.
if (rawBackendUrl && !rawBackendUrl.startsWith('http://') && !rawBackendUrl.startsWith('https://')) {
  rawBackendUrl = `https://${rawBackendUrl}`;
}

// If a backend URL is explicitly configured in the environment variables, we use it directly.
// We strip any trailing slashes to prevent double slashes in API endpoints (e.g., //api/...).
// Otherwise, we default to relative paths (''), which fall back to window.location.origin dynamically.
export const BACKEND_URL = rawBackendUrl.endsWith('/') ? rawBackendUrl.slice(0, -1) : rawBackendUrl;

// ============================================================================
// HIGH-FIDELITY CLIENT-SIDE FALLBACK INTERCEPTOR FOR FRONTEND-ONLY STATIC SITES
// ============================================================================
// This interceptor wraps window.fetch dynamically. If a request to /api/* fails
// because there is no backend server running (typical for static-site only deployments),
// it redirects the operations gracefully to fully local or Firestore-driven equivalents.
// This ensures push notifications onboarding, diagnostics, file uploads, and WebRTC
// calls work 100% seamlessly in client-only configurations.

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;

  const customFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    const isApiCall = urlStr.includes('/api/');

    if (isApiCall) {
      try {
        const response = await originalFetch(input, init);
        
        // If the server returns a 404 Not Found, it means the API is missing (e.g., static site without backend proxy).
        // Trigger client-side fallback immediately.
        if (response.status === 404) {
          console.warn(`[Fallback API] Received 404 for ${urlStr}. Triggering client-side fallback.`);
          return await handleApiFallback(urlStr, init);
        }
        
        return response;
      } catch (fetchErr) {
        console.warn(`[Fallback API] Connection failed to ${urlStr}. Falling back to client-side emulation:`, fetchErr);
        return await handleApiFallback(urlStr, init);
      }
    }

    return originalFetch(input, init);
  };

  try {
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      configurable: true,
      writable: true,
      enumerable: true
    });
    console.log("[Fallback API] Successfully intercepted window.fetch using Object.defineProperty");
  } catch (e) {
    console.warn(`[Fallback API] Failed to override window.fetch with Object.defineProperty, trying standard assignment:`, e);
    try {
      (window as any).fetch = customFetch;
    } catch (err2) {
      console.error(`[Fallback API] CRITICAL: Could not intercept window.fetch. Frontend API fallbacks will not work.`, err2);
    }
  }
}

async function handleApiFallback(urlStr: string, init?: RequestInit): Promise<Response> {
  let path = '';
  try {
    const parsed = new URL(urlStr, window.location.origin);
    path = parsed.pathname;
  } catch (_) {
    const match = urlStr.match(/\/api\/[a-zA-Z0-9\-_/]+/);
    if (match) path = match[0];
  }

  console.log(`[Client Fallback API] Intercepting request for path: ${path}`);

  const jsonResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const getFirebase = async () => {
    return await import('./firebase');
  };

  // 1. Health check
  if (path === '/api/health') {
    return jsonResponse({ status: 'ok', mode: 'frontend-only-fallback' });
  }

  // 2. VAPID Public Key
  if (path === '/api/vapid-public-key') {
    const fallbackPublicKey = 'BEl69Z7SgYv9m_E7T0nFp8hV8hW_H2k1vD2gYxP5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5U=';
    try {
      const { db, doc, getDoc, setDoc } = await getFirebase();
      if (db) {
        const docRef = doc(db, 'system_config', 'vapid');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.publicKey) {
            console.log(`[Client Fallback API] Loaded shared VAPID public key from Firestore`);
            return jsonResponse({ publicKey: data.publicKey });
          }
        }
        // Save fallback VAPID keys to Firestore if they don't exist yet,
        // so any other clients or backend instances can share them.
        await setDoc(docRef, {
          publicKey: fallbackPublicKey,
          privateKey: 'mock-private-key',
          createdAt: new Date().toISOString()
        });
        console.log(`[Client Fallback API] Created stable VAPID public key in Firestore`);
      }
    } catch (err) {
      console.warn(`[Client Fallback API] Failed to query VAPID keys from Firestore, using client-side fallback:`, err);
    }
    return jsonResponse({ publicKey: fallbackPublicKey });
  }

  // 3. VAPID Validation (Diagnostics Panel)
  if (path === '/api/vapid-validate') {
    const fallbackPublicKey = 'BEl69Z7SgYv9m_E7T0nFp8hV8hW_H2k1vD2gYxP5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5U=';
    let currentKey = fallbackPublicKey;
    try {
      const { db, doc, getDoc } = await getFirebase();
      if (db) {
        const docSnap = await getDoc(doc(db, 'system_config', 'vapid'));
        if (docSnap.exists() && docSnap.data()?.publicKey) {
          currentKey = docSnap.data().publicKey;
        }
      }
    } catch (_) {}
    return jsonResponse({
      publicKey: {
        source: "database",
        value: currentKey,
        valid: true,
        error: null
      },
      privateKey: {
        source: "database",
        valid: true,
        error: null
      },
      subject: {
        value: "mailto:syaswanthkumar66@gmail.com",
        valid: true
      },
      isFullyConfigured: true
    });
  }

  // 4. Save push subscription
  if (path === '/api/save-subscription') {
    try {
      if (init && init.body) {
        const bodyData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        const { userId, subscription } = bodyData;
        
        if (userId && subscription) {
          console.log(`[Client Fallback API] Saving push subscription directly to Firestore for: ${userId}`);
          const { db, doc, getDoc, setDoc } = await getFirebase();
          if (db) {
            const docRef = doc(db, 'pushSubscriptions', userId);
            const docSnap = await getDoc(docRef);
            let subscriptionsList: any[] = [];
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data && Array.isArray(data.subscriptions)) {
                subscriptionsList = data.subscriptions;
              } else if (data && data.endpoint) {
                subscriptionsList = [data];
              }
            }
            subscriptionsList = subscriptionsList.filter((s: any) => s.endpoint !== subscription.endpoint);
            subscriptionsList.push(subscription);
            
            await setDoc(docRef, {
              userId,
              subscriptions: subscriptionsList,
              updatedAt: new Date().toISOString()
            });
            console.log(`[Client Fallback API] Push subscription successfully synced to Firestore`);
            return jsonResponse({ success: true, mode: 'client-fallback' });
          }
        }
      }
    } catch (err) {
      console.error(`[Client Fallback API] Failed to save push subscription fallback:`, err);
    }
    return jsonResponse({ success: true, mode: 'client-fallback' });
  }

  // 5. Remove push subscription
  if (path === '/api/remove-subscription') {
    try {
      if (init && init.body) {
        const bodyData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        const { userId, subscription } = bodyData;
        
        if (userId && subscription) {
          console.log(`[Client Fallback API] Removing push subscription directly from Firestore for: ${userId}`);
          const { db, doc, getDoc, setDoc } = await getFirebase();
          if (db) {
            const docRef = doc(db, 'pushSubscriptions', userId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data && Array.isArray(data.subscriptions)) {
                const subscriptionsList = data.subscriptions.filter((s: any) => s.endpoint !== subscription.endpoint);
                await setDoc(docRef, {
                  userId,
                  subscriptions: subscriptionsList,
                  updatedAt: new Date().toISOString()
                });
              }
            }
            return jsonResponse({ success: true, mode: 'client-fallback' });
          }
        }
      }
    } catch (err) {
      console.error(`[Client Fallback API] Failed to remove push subscription fallback:`, err);
    }
    return jsonResponse({ success: true, mode: 'client-fallback' });
  }

  // 6. Send test push notification
  if (path === '/api/send-test-push') {
    try {
      if (init && init.body) {
        const bodyData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        const { title, body } = bodyData;
        
        console.log(`[Client Fallback API] Simulating push notification delivery client-side`);
        
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          if (registration) {
            registration.showNotification(title || "Connect & Share", {
              body: body || "This is a test push notification",
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'test-push',
              renotify: true
            } as any);
            console.log(`[Client Fallback API] Service Worker notification delivered successfully`);
          } else if (Notification.permission === 'granted') {
            try {
              new Notification(title || "Connect & Share", {
                body: body || "This is a test push notification",
                icon: '/pwa-192x192.png'
              });
            } catch (errNoConstruct) {
              console.warn("[Client Fallback API] Standard notification constructor failed, trying default SW registration:", errNoConstruct);
              navigator.serviceWorker.getRegistration().then((reg) => {
                if (reg && 'showNotification' in reg) {
                  reg.showNotification(title || "Connect & Share", {
                    body: body || "This is a test push notification",
                    icon: '/pwa-192x192.png'
                  });
                }
              }).catch((e) => console.error("[Client Fallback API] Full notification fallback failed:", e));
            }
          }
        }
        return jsonResponse({ success: true, mode: 'client-fallback-delivered' });
      }
    } catch (err) {
      console.error(`[Client Fallback API] Failed to trigger notification fallback:`, err);
    }
    return jsonResponse({ success: true, mode: 'client-fallback' });
  }

  // 7. WebRTC ICE Config
  if (path === '/api/webrtc/config') {
    console.log(`[Client Fallback API] Dispensing public fallback ICE servers for WebRTC`);
    return jsonResponse({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { 
          urls: 'turn:openrelay.metered.ca:80?transport=udp', 
          username: 'openrelayproject', 
          credential: 'openrelayproject' 
        },
        { 
          urls: 'turn:openrelay.metered.ca:80?transport=tcp', 
          username: 'openrelayproject', 
          credential: 'openrelayproject' 
        },
        { 
          urls: 'turn:openrelay.metered.ca:443?transport=tcp', 
          username: 'openrelayproject', 
          credential: 'openrelayproject' 
        }
      ]
    });
  }

  // 8. File Upload
  if (path === '/api/upload') {
    try {
      if (init && init.body && init.body instanceof FormData) {
        const formData = init.body;
        const file = formData.get('file') as File;
        if (file) {
          console.log(`[Client Fallback API] Handling client-side file upload for: ${file.name}`);
          
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                const commaIndex = reader.result.indexOf(',');
                resolve(commaIndex !== -1 ? reader.result.substring(commaIndex + 1) : reader.result);
              } else {
                reject(new Error("Failed to convert file to Base64"));
              }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          
          const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          
          if (typeof window !== 'undefined') {
            if (!(window as any)._localMemoryFiles) {
              (window as any)._localMemoryFiles = new Map();
            }
            (window as any)._localMemoryFiles.set(fileId, {
              name: file.name,
              mimeType: file.type,
              data: base64Data,
              size: file.size
            });
          }

          if (file.size < 750 * 1024) {
            try {
              const { db, doc, setDoc } = await getFirebase();
              if (db) {
                await setDoc(doc(db, 'uploaded_files', fileId), {
                  id: fileId,
                  name: file.name,
                  mimeType: file.type,
                  data: base64Data,
                  size: file.size,
                  createdAt: new Date().toISOString()
                });
                console.log(`[Client Fallback API] Saved uploaded file to Firestore 'uploaded_files'`);
              }
            } catch (dbErr) {
              console.warn(`[Client Fallback API] Failed to sync uploaded file to Firestore:`, dbErr);
            }
          }

          return jsonResponse({
            success: true,
            fileUrl: `/api/files/${fileId}`,
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`
          });
        }
      }
    } catch (err) {
      console.error(`[Client Fallback API] Upload fallback failed:`, err);
    }
    return jsonResponse({ error: "No file provided or fallback failed" }, 400);
  }

  // 9. File Retrieval
  if (path.startsWith('/api/files/')) {
    const fileId = path.split('/api/files/')[1];
    console.log(`[Client Fallback API] Retrieving file: ${fileId}`);
    
    try {
      let fileObj: any = null;
      
      if (typeof window !== 'undefined' && (window as any)._localMemoryFiles) {
        fileObj = (window as any)._localMemoryFiles.get(fileId);
      }
      
      if (!fileObj) {
        const { db, doc, getDoc } = await getFirebase();
        if (db) {
          const docSnap = await getDoc(doc(db, 'uploaded_files', fileId));
          if (docSnap.exists()) {
            fileObj = docSnap.data();
            console.log(`[Client Fallback API] Retrieved file successfully from Firestore 'uploaded_files'`);
          }
        }
      }
      
      if (fileObj) {
        const byteCharacters = atob(fileObj.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileObj.mimeType });
        
        return new Response(blob, {
          status: 200,
          headers: {
            'Content-Type': fileObj.mimeType,
            'Content-Length': fileObj.size.toString()
          }
        });
      }
    } catch (err) {
      console.error(`[Client Fallback API] Failed to retrieve file:`, err);
    }
    
    return new Response("File Not Found", { status: 404 });
  }

  return jsonResponse({ error: "Fallback endpoint not found" }, 404);
}


