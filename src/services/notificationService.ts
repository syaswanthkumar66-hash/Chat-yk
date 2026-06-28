// Web Push Notification Registration Service using VAPID keys
export async function registerPushNotifications(userId: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log("Push notifications are not supported on this device/browser");
    return;
  }

  try {
    // 1. Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    
    // Ensure the service worker is active before subscribing
    await navigator.serviceWorker.ready;

    // 2. Check if a push subscription already exists in this browser
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log("Existing VAPID subscription found. Syncing silently with backend...");
      // Store the subscription object by sending it to the backend
      await fetch('/api/save-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          subscription: JSON.parse(JSON.stringify(subscription))
        })
      });
      console.log("VAPID subscription successfully synced with backend");
      return;
    }

    // 3. Since no active subscription is found, check if permission is already granted.
    // If it is NOT granted, then show the permission prompt.
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log("Notification permission not granted:", permission);
        return;
      }
    }

    // 4. Fetch Public VAPID Key from backend
    const response = await fetch('/api/vapid-public-key');
    if (!response.ok) {
      throw new Error(`Failed to fetch public VAPID key: ${response.statusText}`);
    }
    const { publicKey } = await response.json();
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
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: outputArray
    });

    console.log("Successfully subscribed to Web Push Notifications");

    // 6. Store the subscription object by sending it to the backend
    const saveResponse = await fetch('/api/save-subscription', {
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
  } catch (err) {
    console.error("Error during Web Push subscription setup:", err);
  }
}
