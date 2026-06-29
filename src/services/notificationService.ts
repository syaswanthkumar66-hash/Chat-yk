// Web Push Notification Registration Service using VAPID keys
export async function registerPushNotifications(userId: string): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
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

    // 2. Check if a push subscription already exists in this browser
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log("Existing VAPID subscription found. Syncing silently with backend...");
      // Store the subscription object by sending it to the backend
      const res = await fetch(`${window.location.origin}/api/save-subscription`, {
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

    // 3. Since no active subscription is found, check if permission is already granted.
    // If it is NOT granted, then show the permission prompt.
    if (Notification.permission !== 'granted') {
      console.log("Notification permission not granted, requesting...");
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: `Notification permission denied (${permission})` };
      }
    }

    // 4. Fetch Public VAPID Key from backend
    console.log("Fetching VAPID public key from backend...");
    let response;
    try {
      const fetchUrl = `${window.location.origin}/api/vapid-public-key?cb=${Date.now()}`;
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

    // 5. Subscribe the user silently (since permission is already granted)
    console.log("Subscribing with PushManager...");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: outputArray
    });

    console.log("Successfully subscribed to Web Push Notifications");

    // 6. Store the subscription object by sending it to the backend
    const saveResponse = await fetch(`${window.location.origin}/api/save-subscription`, {
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
