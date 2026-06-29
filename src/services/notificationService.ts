// Web Push Notification Registration Service using VAPID keys
import { BACKEND_URL } from '../config';

function arrayBuffersEqual(buf1: ArrayBuffer | null, buf2: Uint8Array): boolean {
  if (!buf1) return false;
  if (buf1.byteLength !== buf2.byteLength) return false;
  const view1 = new Uint8Array(buf1);
  for (let i = 0; i < view1.length; i++) {
    if (view1[i] !== buf2[i]) return false;
  }
  return true;
}

export async function registerPushNotifications(userId: string, force?: boolean): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: "Window is undefined" };
  }
  if (!('serviceWorker' in navigator)) {
    return { success: false, error: "Service Worker not supported in this browser" };
  }
  if (!('PushManager' in window)) {
    return { success: false, error: "PushManager not supported in this browser" };
  }

  try {
    // 1. Register service worker
    console.log("Registering service worker '/sw.js'...");
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    
    // Ensure the service worker is active before subscribing
    console.log("Waiting for service worker to be ready...");
    await navigator.serviceWorker.ready;

    // 2. Fetch Public VAPID Key from backend first
    console.log("Fetching VAPID public key from backend...");
    let response;
    try {
      const targetUrl = BACKEND_URL || window.location.origin;
      const fetchUrl = `${targetUrl}/api/vapid-public-key?cb=${Date.now()}`;
      response = await fetch(fetchUrl);
    } catch (fetchErr: any) {
      console.error("Network error fetching VAPID public key:", fetchErr);
      throw new Error(`Network error fetching public VAPID key: ${fetchErr.message || fetchErr}`);
    }

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (_) {}
      throw new Error(`Failed to fetch public VAPID key (HTTP ${response.status}): ${response.statusText || ""} ${bodyText}`.trim());
    }

    const data = await response.json();
    const publicKey = data.publicKey;
    if (!publicKey) {
      throw new Error("No public VAPID key returned from server");
    }

    // Convert base64 VAPID key to Uint8Array
    const padding = '='.repeat((4 - publicKey.length % 4) % 4);
    const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    // 3. Check if a push subscription already exists in this browser
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Check if the subscription has a different VAPID key or force is true
      const hasKeyMismatch = !subscription.options.applicationServerKey || 
                            !arrayBuffersEqual(subscription.options.applicationServerKey, outputArray);

      if (force || hasKeyMismatch) {
        console.log(`Unsubscribing existing push subscription (force=${!!force}, keyMismatch=${hasKeyMismatch})...`);
        try {
          await subscription.unsubscribe();
        } catch (unsubErr) {
          console.warn("Failed to unsubscribe old subscription:", unsubErr);
        }
        subscription = null;
      } else {
        console.log("Existing valid VAPID subscription found. Syncing silently with backend...");
        // Store the subscription object by sending it to the backend
        const targetUrl = BACKEND_URL || window.location.origin;
        const res = await fetch(`${targetUrl}/api/save-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId,
            subscription: JSON.parse(JSON.stringify(subscription))
          })
        });
        if (!res.ok) {
          throw new Error(`Failed to sync existing subscription: ${res.statusText}`);
        }
        console.log("VAPID subscription successfully synced with backend");
        return { success: true, subscription };
      }
    }

    // 4. Since no active subscription is found, check if permission is already granted.
    if (Notification.permission !== 'granted') {
      console.log("Notification permission not granted, requesting...");
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: `Notification permission denied (${permission})` };
      }
    }

    // 5. Subscribe the user silently (since permission is already granted)
    console.log("Subscribing with PushManager...");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: outputArray
    });

    console.log("Successfully subscribed to Web Push Notifications");

    // 6. Store the subscription object by sending it to the backend
    const targetUrl = BACKEND_URL || window.location.origin;
    const saveResponse = await fetch(`${targetUrl}/api/save-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        subscription: JSON.parse(JSON.stringify(subscription))
      })
    });

    if (!saveResponse.ok) {
      throw new Error(`Failed to save subscription to backend: ${saveResponse.statusText}`);
    }

    console.log("Push subscription sent to backend successfully");
    return { success: true, subscription };
  } catch (err: any) {
    console.error("Error during Web Push subscription setup:", err);
    return { success: false, error: err.message || String(err) };
  }
}
