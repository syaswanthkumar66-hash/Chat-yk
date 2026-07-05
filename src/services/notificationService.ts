// Web Push Notification Registration Service using VAPID keys
import { BACKEND_URL } from '../config';
import { auth } from '../firebase';

/**
 * Bulletproof helper to fetch a valid authentication token for both Google (Firebase) and Local authentication methods.
 */
async function getAuthToken(userId: string): Promise<string> {
  const authMethod = typeof window !== 'undefined' ? localStorage.getItem('proto_authMethod') : null;
  if (authMethod === 'local') {
    return `local-${userId}`;
  }
  return auth.currentUser ? await auth.currentUser.getIdToken() : '';
}

function arrayBuffersEqual(buf1: ArrayBuffer | null, buf2: Uint8Array): boolean {
  if (!buf1) return false;
  if (buf1.byteLength !== buf2.byteLength) return false;
  const view1 = new Uint8Array(buf1);
  for (let i = 0; i < view1.length; i++) {
    if (view1[i] !== buf2[i]) return false;
  }
  return true;
}

/**
 * Bulletproof helper to extract endpoint and keys (p256dh, auth) from a PushSubscription.
 * Avoids browser serialization issues where JSON.stringify(subscription) can return an empty object or omit keys.
 */
function serializePushSubscription(subscription: PushSubscription): any {
  const result: any = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: '',
      auth: ''
    }
  };

  if (typeof subscription.getKey === 'function') {
    try {
      const p256dhBuffer = subscription.getKey('p256dh');
      const authBuffer = subscription.getKey('auth');
      if (p256dhBuffer) {
        // Convert buffer to standard base64/base64url format safely
        result.keys.p256dh = btoa(String.fromCharCode(...new Uint8Array(p256dhBuffer)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      if (authBuffer) {
        result.keys.auth = btoa(String.fromCharCode(...new Uint8Array(authBuffer)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
    } catch (e) {
      console.warn("Manual extraction of VAPID subscription keys failed:", e);
    }
  }

  // Fallback to standard toJSON() if manual extraction was completely empty
  if (!result.keys.p256dh || !result.keys.auth) {
    try {
      const json = subscription.toJSON();
      if (json) {
        result.endpoint = result.endpoint || json.endpoint;
        result.keys.p256dh = result.keys.p256dh || json.keys?.p256dh || '';
        result.keys.auth = result.keys.auth || json.keys?.auth || '';
      }
    } catch (_) {}
  }

  return result;
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
    let registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      console.log("Registering service worker '/sw.js'...");
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } else {
      console.log("Service Worker already registered, reusing existing registration");
    }
    
    // Force service worker to look for updates immediately
    try {
      await registration.update();
      console.log("Service Worker registration update triggered");
    } catch (updateErr) {
      console.warn("Failed to update service worker registration:", updateErr);
    }
    
    // Ensure the service worker is active before subscribing
    console.log("Waiting for service worker to be ready...");
    await navigator.serviceWorker.ready;

    // 2. Fetch Public VAPID Key from backend first (with retry)
    console.log("Fetching VAPID public key from backend...");
    let response;
    try {
      const targetUrl = BACKEND_URL || window.location.origin;
      const fetchUrl = `${targetUrl}/api/vapid-public-key?cb=${Date.now()}`;
      response = await retryWithBackoff(async () => {
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          let bodyText = "";
          try {
            bodyText = await res.text();
          } catch (_) {}
          throw new Error(`Failed to fetch public VAPID key (HTTP ${res.status}): ${res.statusText || ""} ${bodyText}`.trim());
        }
        return res;
      }, 5, 1000); // Retry 5 times, starting with 1000ms delay and doubling each time
    } catch (fetchErr: any) {
      console.error("Network error fetching VAPID public key:", fetchErr);
      throw new Error(`Network error fetching public VAPID key: ${fetchErr.message || fetchErr}`);
    }

    const data = await response.json();
    const publicKey = data.publicKey;
    if (!publicKey) {
      throw new Error("No public VAPID key returned from server");
    }

    // Convert base64 VAPID key to Uint8Array cleanly and reliably
    const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
    };
    const outputArray = urlBase64ToUint8Array(publicKey);

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
        const idToken = await getAuthToken(userId);
        const res = await fetch(`${targetUrl}/api/save-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            userId,
            subscription: serializePushSubscription(subscription)
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
    if (Notification.permission === 'denied') {
      console.warn("Browser-level notification permission is explicitly denied by the user.");
      return { 
        success: false, 
        error: "Notification permission explicitly denied. Please reset notification settings in your browser address bar to allow alerts." 
      };
    }

    if (Notification.permission !== 'granted') {
      console.log("Notification permission not granted, requesting...");
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn(`Browser-level notification permission was denied or ignored by user: status = ${permission}`);
        return { 
          success: false, 
          error: `Notification permission denied (${permission}). Please allow notifications to enable live alerts.` 
        };
      }
    }

    // 5. Subscribe the user silently (since permission is already granted) with retry mechanism
    console.log("Subscribing with PushManager using VAPID key (with retry mechanism)...");
    const maxSubscribeAttempts = 3;
    for (let attempt = 1; attempt <= maxSubscribeAttempts; attempt++) {
      try {
        console.log(`PushManager subscribe attempt ${attempt}/${maxSubscribeAttempts}...`);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });
        // If we reach here, we succeeded!
        break;
      } catch (subErr: any) {
        console.warn(`PushManager subscribe attempt ${attempt}/${maxSubscribeAttempts} failed:`, subErr);

        // Check if this is a permanent failure (like permission denial or VAPID mismatch)
        const isVapidError = subErr.name === 'InvalidAccessError' || 
                             subErr.message?.includes('applicationServerKey') || 
                             subErr.message?.includes('VAPID') ||
                             subErr.message?.includes('key') ||
                             subErr.name === 'SecurityError';
                             
        const isPermissionDenied = subErr.name === 'NotAllowedError' ||
                                   subErr.message?.includes('permission') ||
                                   subErr.message?.includes('allowed') ||
                                   subErr.message?.includes('denied');

        if (isVapidError) {
          console.error("CRITICAL: VAPID Public Key mismatch or malformed key detected! The browser's push engine rejected the applicationServerKey. Ensure the backend VAPID keys match this client public key exactly.", subErr);
          throw new Error(`VAPID public key mismatch or browser rejection: ${subErr.message || subErr}`);
        } else if (isPermissionDenied) {
          console.warn("CRITICAL: Permission denied when calling pushManager.subscribe (NotAllowedError or equivalent).", subErr);
          throw new Error("Permission denied by browser configuration or secure origin rules during push registration.");
        }

        // For other transient errors, wait and retry unless we hit max attempts
        if (attempt < maxSubscribeAttempts) {
          console.log(`Waiting 1000ms before retrying pushManager.subscribe...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // If we run out of retries, throw the final error
          console.error(`All ${maxSubscribeAttempts} pushManager.subscribe attempts failed.`);
          throw subErr;
        }
      }
    }

    console.log("Successfully subscribed to Web Push Notifications");

    // 6. Store the subscription object by sending it to the backend with simple retry support
    const targetUrl = BACKEND_URL || window.location.origin;
    let saveResponse: Response | null = null;
    let saveError: any = null;
    
    // Attempt saving to backend up to 3 times to handle transient offline/network states
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Saving push subscription to backend (attempt ${attempt}/3)...`);
        const idToken = await getAuthToken(userId);
        saveResponse = await fetch(`${targetUrl}/api/save-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            userId,
            subscription: serializePushSubscription(subscription)
          })
        });
        if (saveResponse.ok) {
          saveError = null;
          break;
        }
        saveError = new Error(`HTTP ${saveResponse.status}: ${saveResponse.statusText}`);
      } catch (err) {
        saveError = err;
      }
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (saveError || !saveResponse || !saveResponse.ok) {
      throw new Error(`Failed to save subscription to backend after multiple attempts: ${saveError?.message || 'Unknown network error'}`);
    }

    console.log("Push subscription sent to backend successfully");
    return { success: true, subscription };
  } catch (err: any) {
    console.warn("Notice: Web Push subscription setup did not complete:", err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Helper to retry asynchronous network tasks with exponential backoff.
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[Retry Helper] Attempt ${i + 1}/${retries} failed. Retrying in ${delay}ms...`, err);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      }
    }
  }
  throw lastError;
}

/**
 * Dispatches a Web Push Notification delivery request to the Express backend
 * with a built-in retry mechanism using exponential backoff to handle transient network errors.
 */
export async function triggerPushNotificationWithRetry(
  userId: string, 
  title: string, 
  body: string, 
  retries = 3
): Promise<{ success: boolean; error?: string }> {
  const targetUrl = BACKEND_URL || window.location.origin;
  
  const attemptDelivery = async () => {
    console.log(`[Push Delivery] Dispatched request for user ${userId} to backend...`);
    const idToken = await getAuthToken(userId);
    const res = await fetch(`${targetUrl}/api/send-test-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        userId,
        title,
        body
      })
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    
    return await res.json();
  };

  try {
    await retryWithBackoff(attemptDelivery, retries, 1000);
    console.log("[Push Delivery] Successfully delivered push notification via backend after retries!");
    return { success: true };
  } catch (err: any) {
    console.error("[Push Delivery] All delivery attempts failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Universally safe local notification helper.
 * On mobile devices (like Chrome on Android), 'new Notification()' throws an error.
 * This helper automatically checks for an active Service Worker registration
 * and uses reg.showNotification() as a bulletproof fallback, falls back to
 * standard Notification constructor, and logs failures gracefully.
 */
export async function showLocalNotification(
  title: string, 
  options: {
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    renotify?: boolean;
    data?: any;
    [key: string]: any;
  } = {}
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    // 1. Try displaying via Service Worker registration (required for Android Chrome/Firefox and highly recommended)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && 'showNotification' in registration) {
          // Some options (like renotify without tag) might fail on certain browsers,
          // so we ensure tag is present if renotify is true.
          const swOptions = { ...options };
          if (swOptions.renotify && !swOptions.tag) {
            swOptions.tag = 'default-tag';
          }
          await registration.showNotification(title, swOptions as any);
          console.log('[Notification Utility] Displayed successfully via Service Worker');
          return true;
        }
      } catch (swErr) {
        console.warn('[Notification Utility] SW showNotification failed, trying standard constructor:', swErr);
      }
    }

    // 2. Fall back to standard Notification constructor (standard on desktop browsers)
    const fallbackOptions = { ...options };
    // 'renotify' requires 'tag' to be set, otherwise standard constructor throws
    if (fallbackOptions.renotify && !fallbackOptions.tag) {
      fallbackOptions.tag = 'default-tag';
    }
    const notification = new Notification(title, fallbackOptions as any);
    console.log('[Notification Utility] Displayed successfully via standard Notification constructor');
    return true;
  } catch (err) {
    console.warn('[Notification Utility] Standard Notification constructor also failed:', err);
    // Absolute minimal parameters fallback
    try {
      new Notification(title, { body: options.body });
      return true;
    } catch (finalErr) {
      console.error('[Notification Utility] All notification mechanisms failed:', finalErr);
      return false;
    }
  }
}

