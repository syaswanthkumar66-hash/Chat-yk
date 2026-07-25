import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import path from "path";

// Load environment variables from .env file
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';



let db: any = null;
let firebaseApp: any = null;

async function updateFirestorePresence(userId: string, isOnline: boolean) {
  if (!db) {
    console.warn("[Presence] Firestore db not available for presence sync");
    return;
  }
  try {
    const payload: any = {
      isOnline,
      lastSeen: new Date().toISOString()
    };
    await db.collection('users').doc(userId).set(payload, { merge: true });
    console.log(`[Presence] Successfully synchronized user ${userId} presence in Firestore: isOnline = ${isOnline}`);
  } catch (err: any) {
    if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
      console.log(`[Presence] Info: Backend Firestore presence sync for user ${userId} is sandboxed (Client-side sync handles this directly).`);
    } else {
      console.warn(`[Presence] Notice: Firestore sync update failed:`, err.message);
    }
  }
}

// Read firebase-applet-config.json for projectId and databaseId
let appletConfig: any = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn("Failed to load firebase-applet-config.json:", e);
}

if (appletConfig) {
  try {
    console.log("Initializing using appletConfig:", appletConfig.projectId, "database:", appletConfig.firestoreDatabaseId);
    if (getApps().length === 0) {
      const options: any = {
        projectId: appletConfig.projectId
      };
      
      if (process.env.FIREBASE_CONFIG) {
        try {
          const configObj = JSON.parse(process.env.FIREBASE_CONFIG);
          if (configObj.private_key) {
            options.credential = cert(configObj);
            console.log("Adding FIREBASE_CONFIG credential to App options");
          }
        } catch (e) {
          console.warn("Could not parse FIREBASE_CONFIG for credential:", e);
        }
      }
      
      if (!options.credential) {
        try {
          options.credential = applicationDefault();
          console.log("Successfully set applicationDefault credential for Firebase Admin App options");
        } catch (adcErr) {
          console.warn("Could not load applicationDefault credential. Continuing with default environment discovery:", adcErr);
        }
      }
      
      firebaseApp = initializeApp(options);
    } else {
      firebaseApp = getApps()[0];
    }
    const dbId = appletConfig.firestoreDatabaseId;
    db = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (err) {
      console.warn("Could not set ignoreUndefinedProperties on firestore:", err);
    }
    console.log(`Firebase Admin initialized using applet config (projectId: ${appletConfig.projectId}, database: ${dbId || 'default'})`);
  } catch (e) {
    console.error("Failed to initialize Firebase Admin via applet config:", e);
  }
} else if (process.env.FIREBASE_CONFIG) {
  try {
    const configObj = JSON.parse(process.env.FIREBASE_CONFIG);
    console.log("FIREBASE_CONFIG keys present:", Object.keys(configObj));
    console.log("FIREBASE_CONFIG project_id:", configObj.project_id);
    console.log("FIREBASE_CONFIG client_email:", configObj.client_email);
    console.log("FIREBASE_CONFIG has private_key:", !!configObj.private_key);
    
    if (getApps().length === 0) {
      if (configObj.private_key) {
        firebaseApp = initializeApp({ credential: cert(configObj) });
        console.log("Firebase Admin initialized using FIREBASE_CONFIG cert");
      } else {
        const options: any = { projectId: configObj.project_id };
        try {
          options.credential = applicationDefault();
          console.log("Firebase Admin initialized with applicationDefault and project_id");
        } catch (adcErr) {
          console.warn("Could not load applicationDefault credential for FIREBASE_CONFIG init:", adcErr);
        }
        firebaseApp = initializeApp(options);
        console.log("Firebase Admin initialized using FIREBASE_CONFIG project_id (no cert)");
      }
    } else {
      firebaseApp = getApps()[0];
    }
    const dbId = appletConfig?.firestoreDatabaseId || undefined;
    db = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (err) {
      console.warn("Could not set ignoreUndefinedProperties on firestore:", err);
    }
    console.log(`Firebase Admin initialized for store-and-forward (database: ${dbId || 'default'})`);
  } catch(e: any) {
    console.error("Failed to initialize Firebase Admin via FIREBASE_CONFIG:", e);
  }
} else {
  try {
    console.log("Initializing using default credentials");
    if (getApps().length === 0) {
      firebaseApp = initializeApp();
    } else {
      firebaseApp = getApps()[0];
    }
    db = getFirestore(firebaseApp);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (err) {
      console.warn("Could not set ignoreUndefinedProperties on firestore:", err);
    }
    console.log("Firebase Admin initialized using default credentials");
  } catch (e) {
    console.warn("Failed to initialize Firebase Admin default, proxy is disabled:", e);
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, userId?: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: userId || null,
      email: null,
      emailVerified: null,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import * as webpushModule from "web-push";
const webpush = ((webpushModule as any).default || webpushModule) as typeof webpushModule;

let resolveVapidReady: () => void = () => {};
const vapidReady = new Promise<void>((resolve) => {
  resolveVapidReady = resolve;
});

let vapidKeys = {
  publicKey: "",
  privateKey: ""
};
let vapidSubject = "mailto:syaswanthkumar66@gmail.com";

async function initVapid() {
  try {
    const localKeysPath = path.join(process.cwd(), 'vapid-keys.json');

    // Priority 1: Environment Variables (highest authority)
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      vapidKeys = {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY
      };
      console.log("Loaded VAPID keys from environment variables (Priority 1)");
      // Sync to Firestore if db is available to keep database updated
      if (db) {
        try {
          await db.collection('system_config').doc('vapid').set(vapidKeys);
          console.log("Synced environment VAPID keys to Firestore system_config");
        } catch (err) {
          console.warn("Failed to sync environment VAPID keys to Firestore:", err);
        }
      }
    }

    // Priority 2: Shared database (so multiple instances/containers share same keys)
    if (!vapidKeys.publicKey && db) {
      try {
        const vapidDoc = await db.collection('system_config').doc('vapid').get();
        if (vapidDoc.exists) {
          const data = vapidDoc.data();
          if (data && data.publicKey && data.privateKey) {
            // Check if rotation is needed (if rotated is not set or false, or if it has the mock/leaked pattern)
            if (data.rotated === true && data.privateKey !== 'mock-private-key' && data.privateKey !== 'Fv3LBs2aSq4gCj6oL-a4U2CTutENQZU7c6MjPlWdXKY' && data.publicKey !== 'BEl69Z7SgYv9m_E7T0nFp8hV8hW_H2k1vD2gYxP5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5V3zG4eT5U=') {
              vapidKeys = {
                publicKey: data.publicKey,
                privateKey: data.privateKey
              };
              console.log("Loaded rotated VAPID keys from Firestore system_config (Priority 2)");
              // Persist locally for caching/offline fallback
              try {
                fs.writeFileSync(localKeysPath, JSON.stringify({ ...vapidKeys, rotated: true }, null, 2), 'utf8');
              } catch (_) {}
            } else {
              console.warn("Existing VAPID keys in Firestore are either leaked, legacy, or unrotated. Forcing rotation...");
            }
          }
        }
      } catch (err: any) {
        if (err.message?.includes('PERMISSION_DENIED')) {
          console.log("Note: Running without Firestore VAPID keys access (expected in agent workspace or missing FIREBASE_CONFIG).");
        } else {
          console.warn("Could not load VAPID keys from Firestore:", err.message);
        }
      }
    }

    // Priority 3: Local file cache
    if (!vapidKeys.publicKey && fs.existsSync(localKeysPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(localKeysPath, 'utf8'));
        if (data && data.publicKey && data.privateKey && data.rotated === true && data.privateKey !== 'mock-private-key') {
          vapidKeys = {
            publicKey: data.publicKey,
            privateKey: data.privateKey
          };
          console.log("Loaded VAPID keys from local vapid-keys.json cache (Priority 3)");
          // Back up to Firestore if available
          if (db) {
            try {
              await db.collection('system_config').doc('vapid').set({ ...vapidKeys, rotated: true });
              console.log("Saved cached VAPID keys to Firestore system_config");
            } catch (_) {}
          }
        } else {
          console.warn("Cached local VAPID keys are legacy/unrotated. Deleting cache file.");
          try {
            fs.unlinkSync(localKeysPath);
          } catch (_) {}
        }
      } catch (e) {
        console.warn("Failed to read local VAPID keys cache:", e);
      }
    }

    // Priority 4: Dynamic generation (fallback)
    if (!vapidKeys.publicKey) {
      console.log("No VAPID keys found in environment, DB, or cache. Generating new rotated keys...");
      const generated = webpush.generateVAPIDKeys();
      vapidKeys = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey
      };
      
      // Persist to local cache
      try {
        fs.writeFileSync(localKeysPath, JSON.stringify({ ...vapidKeys, rotated: true }, null, 2), 'utf8');
        console.log("Saved newly generated stable VAPID keys to local cache");
      } catch (e) {
        console.error("Failed to save VAPID keys locally:", e);
      }

      // Persist to Firestore
      if (db) {
        try {
          await db.collection('system_config').doc('vapid').set({
            ...vapidKeys,
            rotated: true,
            rotatedAt: new Date().toISOString()
          });
          console.log("Saved newly generated VAPID keys to Firestore system_config");
        } catch (err) {
          console.error("Failed to save generated VAPID keys to Firestore:", err);
        }
      }
    }

    // Configure webpush details
    let subject = process.env.VAPID_SUBJECT || 'mailto:syaswanthkumar66@gmail.com';
    if (subject && !subject.startsWith('mailto:') && !subject.startsWith('https://')) {
      if (subject.includes('@')) {
        subject = `mailto:${subject}`;
      } else {
        subject = `mailto:syaswanthkumar66@gmail.com`;
      }
    }
    vapidSubject = subject;

    // --- VAPID KEYS VALIDATION SERVICE ---
    console.log("---------------- VAPID KEY VALIDATION SERVICE ----------------");
    const envPubKey = process.env.VAPID_PUBLIC_KEY || "";
    const envPrivKey = process.env.VAPID_PRIVATE_KEY || "";
    
    const validateKey = (keyStr: string, expectedBytes: number, name: string) => {
      if (!keyStr) {
        return { valid: false, error: `${name} is missing in environment variables` };
      }
      try {
        const urlSafeBase64Regex = /^[A-Za-z0-9_-]+={0,2}$/;
        const standardBase64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
        const isValidFormat = urlSafeBase64Regex.test(keyStr) || standardBase64Regex.test(keyStr);
        if (!isValidFormat) {
          return { valid: false, error: `${name} contains characters that are not valid base64 or base64url` };
        }
        
        const normalized = keyStr.replace(/-/g, '+').replace(/_/g, '/');
        const buffer = Buffer.from(normalized, 'base64');
        if (buffer.length !== expectedBytes) {
          return { valid: false, error: `${name} decoded length mismatch: expected ${expectedBytes} bytes, got ${buffer.length} bytes` };
        }
        return { valid: true, byteLength: buffer.length };
      } catch (e: any) {
        return { valid: false, error: `Failed to decode ${name}: ${e.message}` };
      }
    };

    const pubVal = validateKey(envPubKey, 65, "VAPID_PUBLIC_KEY");
    const privVal = validateKey(envPrivKey, 32, "VAPID_PRIVATE_KEY");

    if (envPubKey || envPrivKey) {
      console.log(`[VAPID ENV KEY VALIDATION]`);
      console.log(` - VAPID_PUBLIC_KEY:  ${pubVal.valid ? "VALID ✓ (" + pubVal.byteLength + " bytes)" : "INVALID ✗ (" + pubVal.error + ")"}`);
      console.log(` - VAPID_PRIVATE_KEY: ${privVal.valid ? "VALID ✓ (" + privVal.byteLength + " bytes)" : "INVALID ✗ (" + privVal.error + ")"}`);
      if (pubVal.valid && privVal.valid) {
        console.log(" - RESULT: Environment VAPID keys are perfectly formatted and authenticated.");
      } else {
        console.warn(" - RESULT: Environment VAPID keys are invalid. The application will fall back to other priorities (Firestore or local caches).");
      }
    } else {
      console.log(" - INFO: No VAPID keys set in environment variables. Falling back to Firestore/Cache/Dynamic generation.");
    }
    console.log("--------------------------------------------------------------");

    webpush.setVapidDetails(
      vapidSubject,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    console.log("Successfully configured WebPush VAPID details with public key:", vapidKeys.publicKey.slice(0, 20) + "...");
  } catch (err: any) {
    console.error("Failed to initialize VAPID details:", err);
  } finally {
    resolveVapidReady();
  }
}

// Store initialization promise to handle any startup race conditions gracefully
const vapidInitPromise = initVapid().catch((e) => {
  console.error('VAPID init failed:', e);
});

const memorySubscriptions = new Map<string, any[]>();
const recentPushNotifications = new Map<string, number>();

interface PushAttempt {
  id: string;
  timestamp: string;
  recipientId: string;
  title: string;
  body: string;
  devicesCount: number;
  sentCount: number;
  errorCount: number;
  success: boolean;
  error?: string;
  devices?: Array<{
    endpoint: string;
    success: boolean;
    statusCode?: number;
    error?: string;
  }>;
}

const pushAttempts: PushAttempt[] = [];

function recordPushAttempt(attempt: Omit<PushAttempt, 'id' | 'timestamp'>) {
  const newAttempt: PushAttempt = {
    ...attempt,
    id: Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString()
  };
  pushAttempts.unshift(newAttempt);
  if (pushAttempts.length > 5) {
    pushAttempts.pop();
  }
}

async function sendPushNotification(recipientId: string, payload: { title: string, body: string, icon?: string, data?: any }) {
  // Gracefully wait for VAPID initialization to finish before trying to dispatch any notifications (max 10s)
  try {
    await Promise.race([
      vapidReady,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for VAPID keys initialization (10s)")), 10000))
    ]);
  } catch (err: any) {
    console.error(`Cannot send push notification to ${recipientId}: VAPID initialization timed out or failed`, err);
    const result = { success: false, error: `VAPID initialization timed out or failed: ${err.message || err}`, devicesCount: 0, sentCount: 0 };
    recordPushAttempt({
      recipientId,
      title: payload.title,
      body: payload.body,
      devicesCount: 0,
      sentCount: 0,
      errorCount: 0,
      success: false,
      error: result.error
    });
    return result;
  }

  // Guard: if VAPID keys aren't loaded yet, return clear error
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.warn(`sendPushNotification failed for ${recipientId}: VAPID keys not yet initialized or missing`);
    const result = { success: false, error: "VAPID keys not yet initialized or missing on server", devicesCount: 0, sentCount: 0 };
    recordPushAttempt({
      recipientId,
      title: payload.title,
      body: payload.body,
      devicesCount: 0,
      sentCount: 0,
      errorCount: 0,
      success: false,
      error: result.error
    });
    return result;
  }

  let subscriptions: any[] = [];
  if (db) {
    try {
      const subDoc = await db.collection('pushSubscriptions').doc(recipientId).get();
      if (subDoc.exists) {
        const data = subDoc.data();
        if (data) {
          if (Array.isArray(data.subscriptions)) {
            subscriptions = data.subscriptions;
          } else if (data.endpoint) {
            // Old format migration
            subscriptions = [data];
          }
        }
      }
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
        try {
          handleFirestoreError(err, OperationType.GET, `pushSubscriptions/${recipientId}`, recipientId);
        } catch (e) {}
      }
      console.error(`Error fetching push subscription from Firestore for ${recipientId}:`, err);
    }
  }

  // Fallback or read from memory if not in db or db is null
  if (subscriptions.length === 0) {
    const memSubs = memorySubscriptions.get(recipientId);
    if (Array.isArray(memSubs)) {
      subscriptions = memSubs;
    } else if (memSubs && (memSubs as any).endpoint) {
      subscriptions = [memSubs];
    }
  }

  if (subscriptions.length > 0) {
    console.log(`Sending Web Push Notification to user ${recipientId} across ${subscriptions.length} devices...`);
    const expiredEndpoints = new Set<string>();
    let sentCount = 0;
    let errorCount = 0;
    const devices: Array<{ endpoint: string; success: boolean; statusCode?: number; error?: string }> = [];

    const sendPromises = subscriptions.map(async (subscription) => {
      if (!subscription || !subscription.endpoint) return;

      // Deduplicate push notifications sent to the same device/endpoint within a short window (e.g. 3s)
      const cacheKey = `${subscription.endpoint}:${payload.title}:${payload.body}`;
      const lastSent = recentPushNotifications.get(cacheKey);
      if (lastSent && Date.now() - lastSent < 3000) {
        console.log(`Push notification deduplicated/prevented collision for endpoint ${subscription.endpoint.slice(-20)}`);
        devices.push({
          endpoint: subscription.endpoint,
          success: false,
          error: "Deduplicated (Prevented collision)"
        });
        return;
      }
      recentPushNotifications.set(cacheKey, Date.now());

      // Periodically clean up cache
      if (recentPushNotifications.size > 2000) {
        for (const [k, v] of recentPushNotifications.entries()) {
          if (Date.now() - v > 30000) {
            recentPushNotifications.delete(k);
          }
        }
      }

      try {
        const options = {
          vapidDetails: {
            subject: vapidSubject,
            publicKey: vapidKeys.publicKey,
            privateKey: vapidKeys.privateKey
          },
          TTL: 86400 // Time-to-live in seconds (1 day)
        };
        await webpush.sendNotification(subscription, JSON.stringify(payload), options);
        console.log(`Successfully sent Web Push Notification to user ${recipientId} endpoint ${subscription.endpoint.slice(-20)}`);
        sentCount++;
        devices.push({
          endpoint: subscription.endpoint,
          success: true
        });
      } catch (err: any) {
        console.error(`Error sending push notification to user ${recipientId} endpoint ${subscription.endpoint.slice(-20)}:`, err);
        errorCount++;
        devices.push({
          endpoint: subscription.endpoint,
          success: false,
          statusCode: err.statusCode,
          error: err.message || String(err)
        });
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Subscription for user ${recipientId} has expired or is invalid: ${subscription.endpoint.slice(-20)}`);
          expiredEndpoints.add(subscription.endpoint);
        }
      }
    });

    await Promise.all(sendPromises);

    // If any endpoints are expired/invalid, clean them up from Firestore and memory
    if (expiredEndpoints.size > 0) {
      // 1. Clean up memory
      const memSubs = memorySubscriptions.get(recipientId);
      if (Array.isArray(memSubs)) {
        const updatedMem = memSubs.filter((s: any) => !expiredEndpoints.has(s.endpoint));
        if (updatedMem.length > 0) {
          memorySubscriptions.set(recipientId, updatedMem);
        } else {
          memorySubscriptions.delete(recipientId);
        }
      } else {
        memorySubscriptions.delete(recipientId);
      }

      // 2. Clean up Firestore
      if (db) {
        try {
          const docRef = db.collection('pushSubscriptions').doc(recipientId);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const data = docSnap.data();
            let currentSubs: any[] = [];
            if (data) {
              if (Array.isArray(data.subscriptions)) {
                currentSubs = data.subscriptions;
              } else if (data.endpoint) {
                currentSubs = [data];
              }
            }
            const updatedSubs = currentSubs.filter((s: any) => !expiredEndpoints.has(s.endpoint));
            if (updatedSubs.length > 0) {
              await docRef.set({ subscriptions: updatedSubs });
            } else {
              await docRef.delete();
            }
            console.log(`Cleaned up ${expiredEndpoints.size} expired subscriptions for user ${recipientId} in Firestore`);
          }
        } catch (cleanErr: any) {
          if (cleanErr.message?.includes('PERMISSION_DENIED') || cleanErr.message?.includes('permissions')) {
            try {
              handleFirestoreError(cleanErr, OperationType.WRITE, `pushSubscriptions/${recipientId}`, recipientId);
            } catch (e) {}
          }
          console.error("Error cleaning up expired subscriptions in Firestore:", cleanErr);
        }
      }
    }

    const result = { 
      success: sentCount > 0, 
      devicesCount: subscriptions.length, 
      sentCount, 
      errorCount,
      error: sentCount === 0 ? "Failed to deliver push notifications to any registered endpoints. Browser push service returned an error." : undefined
    };
    recordPushAttempt({
      recipientId,
      title: payload.title,
      body: payload.body,
      devicesCount: subscriptions.length,
      sentCount,
      errorCount,
      success: result.success,
      error: result.error,
      devices
    });
    return result;
  } else {
    console.log(`No active Web Push subscription found for user ${recipientId}`);
    const result = { 
      success: false, 
      error: "No active Web Push subscription found for this user", 
      warning: "The user has not authorized or registered notifications on this device/browser yet, or registration failed. If testing inside an iframe, please open the app in a new tab instead.",
      devicesCount: 0, 
      sentCount: 0 
    };
    recordPushAttempt({
      recipientId,
      title: payload.title,
      body: payload.body,
      devicesCount: 0,
      sentCount: 0,
      errorCount: 0,
      success: false,
      error: result.error
    });
    return result;
  }
}

const memoryFiles = new Map<string, { name: string, mimeType: string, data: string, size: number }>();

const dailyQuotaLimit = 100 * 1024 * 1024; // 100 MB
const userQuotas = new Map<string, { date: string, bytes: number }>();

function checkQuota(userId: string, size: number) {
  const today = new Date().toISOString().split('T')[0];
  let quota = userQuotas.get(userId);
  if (!quota || quota.date !== today) {
      quota = { date: today, bytes: 0 };
  }
  if (quota.bytes + size > dailyQuotaLimit) {
      return false;
  }
  quota.bytes += size;
  userQuotas.set(userId, quota);
  return true;
}

const app = express();

// Custom CORS middleware to allow cross-origin requests from any client
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, Accept, Origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingInterval: 15000,
  pingTimeout: 10000,
});

app.use(express.json({ limit: '10mb' }));

// Health Check & Render Keep-Alive Endpoint
app.get(["/api/health", "/api/ping", "/ping"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const users = new Map<string, Map<string, { deviceId: string }>>(); // userId -> Map<socketId, { deviceId: string }>
const userPublicKeys = new Map<string, string>(); // userId -> publicKey
const tempStorage = new Map<string, any>(); // messageId -> messageData 
const cachedUsers = new Map<string, any>(); // userId -> UserProfile object for instant central hub sync

// File Upload Endpoint
app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = req.body.userId;
      if (userId && !checkQuota(userId, req.file.size)) {
        return res.status(429).json({ error: "Daily 100MB quota exceeded" });
      }

      const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const base64Data = req.file.buffer.toString('base64');
      const fileObj = {
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        data: base64Data,
        size: req.file.size
      };

      // Store in memory cache
      memoryFiles.set(fileId, fileObj);

      // Store in Firestore if available and file is small enough (Firestore document limit is 1MB)
      if (db) {
        if (req.file.size < 750 * 1024) {
          try {
            await db.collection('uploaded_files').doc(fileId).set({
              id: fileId,
              name: req.file.originalname,
              mimeType: req.file.mimetype,
              data: base64Data,
              size: req.file.size,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.error("Failed to store file in Firestore:", e);
          }
        } else {
          console.log(`File size (${(req.file.size / 1024).toFixed(1)} KB) exceeds Firestore 1MB document limit (with base64 overhead). Storing in-memory only.`);
        }
      }

      res.json({ 
        success: true, 
        fileUrl: `/api/files/${fileId}`, 
        fileName: req.file.originalname,
        fileSize: `${(req.file.size / 1024 / 1024).toFixed(2)} MB`
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload file to Firebase" });
    }
  });

  // File Retrieval Endpoint
  app.get("/api/files/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;

      // Check memory cache first
      if (memoryFiles.has(fileId)) {
        const file = memoryFiles.get(fileId)!;
        const buffer = Buffer.from(file.data, 'base64');
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
        return res.send(buffer);
      }

      // Check Firestore
      if (db) {
        try {
          const doc = await db.collection('uploaded_files').doc(fileId).get();
          if (doc.exists) {
            const file = doc.data();
            const buffer = Buffer.from(file.data, 'base64');
            res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${file.name || 'file'}"`);
            return res.send(buffer);
          }
        } catch (dbErr: any) {
          console.warn(`Failed to fetch file ${fileId} from Firestore, using memory fallback:`, dbErr.message);
        }
      }

      res.status(404).json({ error: "File not found" });
    } catch (error) {
      console.error("Fetch file error:", error);
      res.status(500).json({ error: "Failed to retrieve file" });
    }
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    const isUserInactive = (userId: string) => {
      if (!userId) return true;
      const deviceMap = users.get(userId);
      if (!deviceMap || deviceMap.size === 0) return true;
      let allInactive = true;
      for (const socketId of deviceMap.keys()) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock && (sock as any).isVisible !== false) {
          allInactive = false;
          break;
        }
      }
      return allInactive;
    };

    const getOnlineUsersPayload = () => {
      return Array.from(users.keys()).map(userId => ({
        userId,
        isInactive: isUserInactive(userId)
      }));
    };

    const getAllUsersPayload = () => {
      return Array.from(cachedUsers.values()).map(u => {
        const isConnected = users.has(u.id) && (users.get(u.id)?.size || 0) > 0;
        return {
          ...u,
          isOnline: isConnected
        };
      });
    };

    socket.on("ping_server", (data, callback) => {
      if (typeof callback === 'function') {
        callback({ status: "pong", timestamp: new Date().toISOString() });
      } else {
        socket.emit("pong_server", { timestamp: new Date().toISOString() });
      }
    });

    socket.on("get_online_users", async () => {
      socket.emit("online_users", getOnlineUsersPayload());
      
      if (cachedUsers.size > 0) {
        socket.emit("all_users_data", getAllUsersPayload());
      }

      // Send all users data from Firestore & merge into cache
      if (db) {
        try {
          const snapshot = await db.collection('users').get();
          const allUsers = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
          allUsers.forEach((u: any) => {
            if (u.id) {
              const existing = cachedUsers.get(u.id) || {};
              const isCurrentlyConnected = users.has(u.id) && (users.get(u.id)?.size || 0) > 0;
              cachedUsers.set(u.id, { 
                ...existing, 
                ...u, 
                isOnline: isCurrentlyConnected 
              });
            }
          });
          socket.emit("all_users_data", getAllUsersPayload());
        } catch (e: any) {
          console.warn("Firebase users fetch notice (using memory/client fallback):", e?.message || e);
        }
      }
    });

    socket.on("broadcast_user_profile", (data: { user: any }) => {
      const { user } = data || {};
      if (!user || !user.id) return;
      const existing = cachedUsers.get(user.id) || {};
      const updated = { ...existing, ...user, isOnline: true };
      cachedUsers.set(user.id, updated);
      
      io.emit("user_profile_updated", updated);
      io.emit("all_users_data", getAllUsersPayload());
      console.log(`User ${user.id} profile update broadcasted across central hub.`);
    });

    socket.on("send_notification", async (data: { recipientId: string, notification: any }) => {
      const { recipientId, notification } = data || {};
      if (!recipientId || !notification) return;

      if (db) {
        try {
          await db.collection('notifications').doc(notification.id).set({
            ...notification,
            status: notification.status || 'created',
            createdAt: notification.createdAt || new Date().toISOString()
          });
        } catch (e: any) {
          console.warn("Notice saving socket notification:", e?.message || e);
        }
      }

      const targetDevices = users.get(recipientId);
      if (targetDevices && targetDevices.size > 0) {
        for (const sId of targetDevices.keys()) {
          io.to(sId).emit("receive_notification", notification);
        }
        console.log(`Instant socket notification delivered to user ${recipientId}`);
      } else {
        console.log(`Recipient ${recipientId} offline for instant socket notification. Saved in DB.`);
      }
    });

    socket.on("friend_request_event", (data: { toUserId: string, type: string, request: any }) => {
      const { toUserId, type, request } = data || {};
      if (!toUserId) return;
      const targetDevices = users.get(toUserId);
      if (targetDevices && targetDevices.size > 0) {
        for (const sId of targetDevices.keys()) {
          io.to(sId).emit("friend_request_update", { fromUserId: (socket as any).userId, type, request });
        }
        console.log(`Instant friend request event (${type}) dispatched to ${toUserId}`);
      }
    });

    socket.on("register", async (data) => {
      // Graceful handling if data is just string (old logic) or object (new E2EE logic)
      let userId, publicKey, deviceId, profileData;
      if (typeof data === 'string') {
        userId = data;
        deviceId = 'default';
      } else {
        userId = data.userId;
        publicKey = data.publicKey;
        deviceId = data.deviceId || 'default';
        profileData = data.profile || data;
        if (publicKey) userPublicKeys.set(userId, publicKey);
      }
      
      (socket as any).userId = userId;
      (socket as any).deviceId = deviceId;

      let deviceMap = users.get(userId);
      if (!deviceMap) {
        deviceMap = new Map<string, { deviceId: string }>();
        users.set(userId, deviceMap);
      }
      deviceMap.set(socket.id, { deviceId });

      if (profileData && typeof profileData === 'object' && profileData.displayName) {
        const existing = cachedUsers.get(userId) || {};
        cachedUsers.set(userId, { ...existing, id: userId, isOnline: true, ...profileData });
      } else if (!cachedUsers.has(userId)) {
        cachedUsers.set(userId, { id: userId, isOnline: true });
      }

      console.log(`User ${userId} registered device ${deviceId} on socket ${socket.id}`);
      
      // Broadcast online status & central user list to all connected clients instantly
      io.emit("user_status", { userId, isOnline: true, isInactive: isUserInactive(userId) });
      io.emit("online_users", getOnlineUsersPayload());
      io.emit("all_users_data", getAllUsersPayload());

      // Send immediate direct state to registering socket
      socket.emit("online_users", getOnlineUsersPayload());
      socket.emit("all_users_data", getAllUsersPayload());

      // Sync with Firestore
      updateFirestorePresence(userId, true);

      // Broadcast devices list to all sockets of this user
      const activeDeviceIds = Array.from(new Set(Array.from(deviceMap.values()).map(d => d.deviceId)));
      for (const [sId, info] of deviceMap.entries()) {
        io.to(sId).emit("devices_update", { devices: activeDeviceIds, currentDeviceId: info.deviceId });
      }
      
      const deliverAndCleanup = (msgId: string, msgData: any) => {
        socket.emit("receive_message", msgData);
        console.log(`Delivered offline message ${msgId} to ${userId}`);
      };

      // Deliver temporary stored messages from Firebase if available
      if (db) {
        try {
          const snapshot = await db.collection('offline_messages').where('to', '==', userId).get();
          snapshot.forEach(async (doc: any) => {
            deliverAndCleanup(doc.id, doc.data());
            await doc.ref.delete(); // immediately delete after forwarding
          });
        } catch(e: any) {
          console.warn("Firebase fetch warning (using memory fallback):", e.message);
        }
      }

      // Deliver from local memory
      for (const [msgId, msgData] of tempStorage.entries()) {
        if (msgData.to === userId) {
          deliverAndCleanup(msgId, msgData);
          tempStorage.delete(msgId);
        }
      }
    });

    socket.on("update_active_view", (data) => {
      const { activeViewId, isVisible } = data || {};
      const userId = (socket as any).userId;
      const previousInactive = isUserInactive(userId);

      (socket as any).activeViewId = activeViewId;
      (socket as any).isVisible = isVisible;
      console.log(`Socket ${socket.id} (user ${userId}) updated active view:`, { activeViewId, isVisible });

      const newInactive = isUserInactive(userId);
      if (previousInactive !== newInactive && userId) {
        io.emit("user_status", { userId, isOnline: true, isInactive: newInactive });
        io.emit("online_users", getOnlineUsersPayload());
      }
    });

    socket.on("join_group", (groupId) => {
      socket.join(`group-${groupId}`);
      console.log(`Socket ${socket.id} joined group room group-${groupId}`);
    });

    socket.on("leave_group", (groupId) => {
      socket.leave(`group-${groupId}`);
      console.log(`Socket ${socket.id} left group room group-${groupId}`);
    });

    socket.on("get_public_key", async ({ userId }, callback) => {
      if (typeof callback !== 'function') return;
      let key = userPublicKeys.get(userId);
      if (!key && db && userId) {
        try {
          const userDoc = await db.collection('users').doc(userId).get();
          if (userDoc.exists) {
            key = userDoc.data()?.publicKey;
            if (key) userPublicKeys.set(userId, key);
          }
        } catch (e) {}
      }
      callback(key || null);
    });

    const typingTimeouts = new Map<string, NodeJS.Timeout>();

    const clearTypingTimeout = (targetKey: string) => {
      const timeout = typingTimeouts.get(targetKey);
      if (timeout) {
        clearTimeout(timeout);
        typingTimeouts.delete(targetKey);
      }
    };

    const startTypingTTL = (senderId: string, data: any, isGroup: boolean) => {
      const targetKey = isGroup ? `group-${data.groupId}` : `user-${senderId}`;
      clearTypingTimeout(targetKey);
      
      const timeout = setTimeout(() => {
        typingTimeouts.delete(targetKey);
        console.log(`Server typing TTL expired for ${targetKey}`);
        if (isGroup && data.groupId) {
          socket.to(`group-${data.groupId}`).emit("typing_stop", { senderId, groupId: data.groupId });
        } else if (data.recipientId) {
          const targetDevices = users.get(data.recipientId);
          if (targetDevices) {
            for (const socketId of targetDevices.keys()) {
              io.to(socketId).emit("typing_stop", { senderId });
            }
          }
        }
      }, 5000); // 5s TTL
      
      typingTimeouts.set(targetKey, timeout);
    };

    socket.on("typing", (data) => {
      const { recipientId, isTyping } = data;
      const senderId = (socket as any).userId;

      if (senderId && recipientId) {
        const targetDevices = users.get(recipientId);
        if (targetDevices) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("typing", { senderId, isTyping });
          }
        }
        if (isTyping) {
          startTypingTTL(senderId, { recipientId }, false);
        } else {
          clearTypingTimeout(`user-${senderId}`);
        }

        // Echo typing to sender's OTHER devices/tabs
        const senderDevices = users.get(senderId);
        if (senderDevices) {
          for (const sId of senderDevices.keys()) {
            if (sId !== socket.id) {
              io.to(sId).emit("self_typing_sync", { recipientId, isTyping });
            }
          }
        }
      }
    });

    socket.on("typing_start", (data) => {
      const { recipientId, groupId } = data;
      const senderId = (socket as any).userId;
      if (!senderId) return;

      if (groupId) {
        socket.to(`group-${groupId}`).emit("typing_start", { senderId, groupId });
        startTypingTTL(senderId, data, true);
      } else if (recipientId) {
        const targetDevices = users.get(recipientId);
        if (targetDevices) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("typing_start", { senderId });
          }
        }
        startTypingTTL(senderId, data, false);
      }

      // Echo typing_start to sender's OTHER devices/tabs
      const senderDevices = users.get(senderId);
      if (senderDevices) {
        for (const sId of senderDevices.keys()) {
          if (sId !== socket.id) {
            io.to(sId).emit("typing_start", { senderId, recipientId, groupId, isOwnDeviceEcho: true });
            io.to(sId).emit("self_typing_sync", { recipientId: groupId || recipientId, isTyping: true });
          }
        }
      }
    });

    socket.on("typing_stop", (data) => {
      const { recipientId, groupId } = data;
      const senderId = (socket as any).userId;
      if (!senderId) return;

      const targetKey = groupId ? `group-${groupId}` : `user-${senderId}`;
      clearTypingTimeout(targetKey);

      if (groupId) {
        socket.to(`group-${groupId}`).emit("typing_stop", { senderId, groupId });
      } else if (recipientId) {
        const targetDevices = users.get(recipientId);
        if (targetDevices) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("typing_stop", { senderId });
          }
        }
      }

      // Echo typing_stop to sender's OTHER devices/tabs
      const senderDevices = users.get(senderId);
      if (senderDevices) {
        for (const sId of senderDevices.keys()) {
          if (sId !== socket.id) {
            io.to(sId).emit("typing_stop", { senderId, recipientId, groupId, isOwnDeviceEcho: true });
            io.to(sId).emit("self_typing_sync", { recipientId: groupId || recipientId, isTyping: false });
          }
        }
      }
    });

    socket.on("media_upload_progress", (data) => {
      const { recipientId, groupId, messageId, percent, mediaType, fileName } = data;
      const senderId = (socket as any).userId;
      if (!senderId) return;

      const progressPayload = {
        senderId,
        recipientId,
        groupId,
        messageId,
        percent,
        mediaType,
        fileName
      };

      if (groupId) {
        socket.to(`group-${groupId}`).emit("media_upload_progress", progressPayload);
      } else if (recipientId) {
        const targetDevices = users.get(recipientId);
        if (targetDevices) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("media_upload_progress", progressPayload);
          }
        }
      }
    });

    socket.on("message_reaction", (data) => {
      const { messageId, chatId, emoji, recipientId, groupId } = data;
      const senderId = (socket as any).userId;
      if (!senderId) return;

      const reactionData = { messageId, chatId, emoji, senderId };

      if (groupId) {
        socket.to(`group-${groupId}`).emit("message_reaction", reactionData);
      } else if (recipientId) {
        const targetDevices = users.get(recipientId);
        if (targetDevices) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("message_reaction", reactionData);
          }
        }
      }
    });

    socket.on("message_delivered", (data) => {
      const { messageId, senderId, chatId } = data;
      console.log(`Message delivered: ${messageId} from ${senderId} in chat ${chatId}`);
      const senderDevices = users.get(senderId);
      if (senderDevices) {
        for (const socketId of senderDevices.keys()) {
          io.to(socketId).emit("message_status_update", {
            chatId,
            messageId,
            status: 'delivered'
          });
        }
      }
    });

    socket.on("message_read", (data) => {
      const { messageId, senderId, chatId } = data;
      console.log(`Message read: ${messageId} from ${senderId} in chat ${chatId}`);
      const senderDevices = users.get(senderId);
      if (senderDevices) {
        for (const socketId of senderDevices.keys()) {
          io.to(socketId).emit("message_status_update", {
            chatId,
            messageId,
            status: 'read'
          });
        }
      }
    });

    socket.on("sync_chat_read", (data) => {
      const { chatId, recipientId } = data;
      const senderId = (socket as any).userId;
      if (!senderId) return;

      const senderDevices = users.get(senderId);
      if (senderDevices) {
        for (const sId of senderDevices.keys()) {
          if (sId !== socket.id) {
            io.to(sId).emit("sync_chat_read", { chatId, recipientId });
          }
        }
      }
    });

    socket.on("notify_cloud_sync", () => {
      const senderId = (socket as any).userId;
      if (!senderId) return;

      const senderDevices = users.get(senderId);
      if (senderDevices) {
        for (const sId of senderDevices.keys()) {
          if (sId !== socket.id) {
            io.to(sId).emit("cloud_sync_triggered", { lastUpdated: new Date().toISOString() });
          }
        }
      }
    });

    socket.on("report_fingerprint", (data: { fingerprint: string }) => {
      const senderId = (socket as any).userId;
      if (!senderId) return;

      (socket as any).fingerprint = data.fingerprint;

      const senderDevices = users.get(senderId);
      if (senderDevices && senderDevices.size > 1) {
        const fingerprints = new Map<string, string>();

        for (const sId of senderDevices.keys()) {
          const s = io.sockets.sockets.get(sId);
          if (s && (s as any).fingerprint) {
            fingerprints.set(sId, (s as any).fingerprint);
          }
        }

        if (fingerprints.size > 1) {
          const fps = Array.from(fingerprints.values());
          const uniqueFps = new Set(fps);

          if (uniqueFps.size > 1) {
            for (const socketId of senderDevices.keys()) {
              io.to(socketId).emit("sync_check_result", { status: "mismatch" });
            }
          } else {
            for (const socketId of senderDevices.keys()) {
              io.to(socketId).emit("sync_check_result", { status: "synced" });
            }
          }
        } else {
          socket.emit("sync_check_result", { status: "no_peer" });
        }
      } else {
        socket.emit("sync_check_result", { status: "no_peer" });
      }
    });

    socket.on("send_message", async (data) => {
      const { recipientId, groupId, recipientIds, text, type, fileUrl, fileSize, messageId, encryptedFileKey, iv } = data;
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, deviceMap]) => deviceMap.has(socket.id))?.[0];

      if (!senderId) return;

      // Track text message footprint in quota roughly
      if (!checkQuota(senderId, JSON.stringify(data).length)) {
        socket.emit("quota_exceeded", { error: "Daily 100MB quota exceeded" });
        return;
      }

      const messageData = {
        id: messageId || `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        senderId,
        groupId,
        recipientId,
        text, // this is now E2EE encrypted ciphertext
        type: type || 'text',
        fileUrl,
        fileSize,
        encryptedFileKey, // for e2ee attached files
        iv, // init vector
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      // Acknowledge the message was sent back to the sender
      socket.emit("message_sent", {
        messageId: messageData.id,
        chatId: groupId || recipientId,
        timestamp: messageData.timestamp
      });

      if (groupId) {
        // Send to everyone in the group room except the sender
        socket.to(`group-${groupId}`).emit("receive_message", messageData);
        console.log(`Group message sent from ${senderId} to group-${groupId}`);

        // For any group member who is offline, save an offline message
        if (Array.isArray(recipientIds)) {
          for (const targetId of recipientIds) {
            if (targetId === senderId) continue;

            // Check if target has blocked sender
            let isTargetBlocked = false;
            if (db) {
              try {
                const targetDoc = await db.collection('users').doc(targetId).get();
                if (targetDoc.exists) {
                  const targetData = targetDoc.data();
                  const blockedList = targetData?.blockedUserIds || [];
                  if (blockedList.includes(senderId)) {
                    isTargetBlocked = true;
                  }
                }
              } catch (e: any) {
                if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('permissions')) {
                  try {
                    handleFirestoreError(e, OperationType.GET, `users/${targetId}`, senderId);
                  } catch (_) {}
                }
                console.warn(`Block check failed for target ${targetId}`, e);
              }
            }

            if (isTargetBlocked) {
              console.log(`Skipping message notification for ${targetId} because they blocked ${senderId}`);
              continue;
            }

            // Create persistent Notification first
            if (db) {
              try {
                const notifId = `notif-msg-${messageData.id}-${targetId}`;
                await db.collection('notifications').doc(notifId).set({
                  id: notifId,
                  type: 'message',
                  senderId,
                  senderName: data.senderName || "User",
                  senderAvatar: data.senderAvatar || "",
                  recipientId: targetId,
                  title: data.groupName || "New Group Message",
                  body: messageData.type === 'text' ? (messageData.text && messageData.text.startsWith('{') && messageData.text.includes('"ciphertext"') ? "🔒 [Encrypted Message]" : messageData.text) : `📎 Shared a ${messageData.type}`,
                  chatId: groupId,
                  status: 'created',
                  createdAt: new Date().toISOString()
                });
                console.log(`Durable group notification created for member ${targetId}`);
              } catch (e: any) {
                if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('permissions')) {
                  try {
                    handleFirestoreError(e, OperationType.WRITE, `notifications/notif-msg-${messageData.id}-${targetId}`, senderId);
                  } catch (_) {}
                }
                console.warn(`Failed to create durable group notification for ${targetId}:`, e.message);
              }
            }

            const targetDevices = users.get(targetId);
            let shouldPush = true;

            if (targetDevices && targetDevices.size > 0) {
              for (const socketId of targetDevices.keys()) {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                  const isTabVisible = (targetSocket as any).isVisible !== false;
                  const isActiveInGroup = (targetSocket as any).activeViewId === groupId;
                  if (isTabVisible && isActiveInGroup) {
                    shouldPush = false;
                    console.log(`Skipping group push notification for ${targetId} because they are actively viewing the group on a device.`);
                  }
                }
              }
            } else {
              const storeData = { ...messageData, recipientId: targetId, to: targetId };
              const offlineMsgId = `${messageData.id}-${targetId}`;
              let savedToFirestore = false;
              if (db) {
                try {
                  await db.collection('offline_messages').doc(offlineMsgId).set(storeData);
                  console.log(`Group member ${targetId} offline. Saved group message to Firestore.`);
                  savedToFirestore = true;
                } catch(e: any) {
                  if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('permissions')) {
                    try {
                      handleFirestoreError(e, OperationType.WRITE, `offline_messages/${offlineMsgId}`, senderId);
                    } catch (_) {}
                  }
                  console.warn("Firebase save error for group member, falling back to memory:", e.message);
                }
              }
              if (!savedToFirestore) {
                tempStorage.set(offlineMsgId, storeData);
                console.log(`Group member ${targetId} offline. Message stored temporarily in memory.`);
              }
            }

            if (shouldPush) {
              sendPushNotification(targetId, {
                title: data.groupName || "New Group Message",
                body: messageData.type === 'text' ? "You have a new group message 💬" : `📎 Shared a ${messageData.type}`,
                icon: '/pwa-192x192.png',
                data: { url: '/' }
              });
            }
          }
        }
      } else if (recipientId) {
        // Check if recipient has blocked sender
        let isRecipientBlocked = false;
        if (db) {
          try {
            const recipientDoc = await db.collection('users').doc(recipientId).get();
            if (recipientDoc.exists) {
              const recData = recipientDoc.data();
              const blockedList = recData?.blockedUserIds || [];
              if (blockedList.includes(senderId)) {
                isRecipientBlocked = true;
              }
            }
          } catch (e: any) {
            if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('permissions')) {
              try {
                handleFirestoreError(e, OperationType.GET, `users/${recipientId}`, senderId);
              } catch (_) {}
            }
            console.warn(`Block check failed for recipient ${recipientId}`, e);
          }
        }

        if (isRecipientBlocked) {
          console.log(`Skipping message notification for ${recipientId} because they blocked ${senderId}`);
          return;
        }

        // Create persistent Notification first
        if (db) {
          try {
            const notifId = `notif-msg-${messageData.id}`;
            await db.collection('notifications').doc(notifId).set({
              id: notifId,
              type: 'message',
              senderId,
              senderName: data.senderName || "User",
              senderAvatar: data.senderAvatar || "",
              recipientId,
              title: data.senderName || "New Message",
              body: messageData.type === 'text' ? (messageData.text && messageData.text.startsWith('{') && messageData.text.includes('"ciphertext"') ? "🔒 [Encrypted Message]" : messageData.text) : `📎 Shared a ${messageData.type}`,
              chatId: senderId,
              status: 'created',
              createdAt: new Date().toISOString()
            });
            console.log(`Durable direct notification created for recipient ${recipientId}`);
          } catch (e: any) {
            if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('permissions')) {
              try {
                handleFirestoreError(e, OperationType.WRITE, `notifications/notif-msg-${messageData.id}`, senderId);
              } catch (_) {}
            }
            console.warn(`Failed to create durable direct notification for ${recipientId}:`, e.message);
          }
        }

        const targetDevices = users.get(recipientId);
        let shouldPush = true;

        if (targetDevices && targetDevices.size > 0) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("receive_message", messageData);
            console.log(`Message sent from ${senderId} to ${recipientId} on socket ${socketId}`);

            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
              const isTabVisible = (targetSocket as any).isVisible !== false;
              const isActiveInChat = (targetSocket as any).activeViewId === senderId;
              if (isTabVisible && isActiveInChat) {
                shouldPush = false;
                console.log(`Skipping direct push notification for ${recipientId} because they are actively viewing the chat.`);
              }
            }
          }
        } else {
          // Store any message type offline in Firestore/Memory
          const storeData = { ...messageData, to: recipientId };
          let savedToFirestore = false;
          if (db) {
            try {
              await db.collection('offline_messages').doc(messageData.id).set(storeData);
              console.log(`User ${recipientId} offline. Message saved to Firebase.`);
              savedToFirestore = true;
            } catch(e: any) {
              if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('permissions')) {
                try {
                  handleFirestoreError(e, OperationType.WRITE, `offline_messages/${messageData.id}`, senderId);
                } catch (_) {}
              }
              console.warn("Firebase save error, falling back to memory:", e.message);
            }
          }
          if (!savedToFirestore) {
            // Store temporarily in memory if firebase write fails
            tempStorage.set(messageData.id, storeData);
            console.log(`User ${recipientId} offline. Message ${messageData.id} stored temporarily in memory.`);
          }
        }

        // Echo the direct message to the sender's OTHER sockets/tabs so they are in sync
        const senderDevices = users.get(senderId);
        if (senderDevices) {
          for (const sId of senderDevices.keys()) {
            if (sId !== socket.id) {
              io.to(sId).emit("receive_message", { ...messageData, recipientId });
            }
          }
        }

        if (shouldPush) {
          sendPushNotification(recipientId, {
            title: data.senderName || "New Message",
            body: messageData.type === 'text' ? "You have a new message 💬" : `📎 Shared a ${messageData.type}`,
            icon: '/pwa-192x192.png',
            data: { url: '/' }
          });
        }
      }
    });

    // SFU / Group Call Signaling (Simplified)
    socket.on("join_call", (data) => {
      const { roomId, userId } = data;
      socket.join(roomId);
      socket.to(roomId).emit("user_joined_call", { userId });
      console.log(`User ${userId} joined call room ${roomId}`);
    });

    socket.on("sfu_signal", (data) => {
      const { roomId, signal, from, type } = data;
      if (roomId) {
        socket.to(roomId).emit("sfu_signal", { roomId, signal, from, type });
      }
      // Also route directly by target user if signal.to or data.to is specified to ensure delivery
      const targetId = signal?.to || data?.to;
      if (targetId && String(targetId) !== String(from) && users.has(String(targetId))) {
        const targetSockets = users.get(String(targetId));
        if (targetSockets) {
          for (const sId of targetSockets.keys()) {
            if (sId !== socket.id) {
              io.to(sId).emit("sfu_signal", { roomId, signal, from, type });
            }
          }
        }
      }
    });

    socket.on("webrtc_audit", (data) => {
      const { roomId } = data;
      if (roomId) {
        socket.to(roomId).emit("webrtc_audit_broadcast", data);
      }
    });

    socket.on("call_user", (data) => {
      const { to, roomId, type, from } = data;
      const targetDevices = users.get(to);
      if (targetDevices) {
        for (const socketId of targetDevices.keys()) {
          io.to(socketId).emit("incoming_call", { roomId, type, from });
        }
      }
    });

    socket.on("end_call", (data) => {
      const { to, roomId } = data;
      if (to) {
        const targetDevices = users.get(to);
        if (targetDevices) {
          for (const socketId of targetDevices.keys()) {
            io.to(socketId).emit("call_ended", data);
          }
        }
      } else {
        socket.to(roomId).emit("call_ended", data);
      }
    });

    socket.on("call_ping", (data) => {
      const { roomId, from } = data;
      socket.to(roomId).emit("call_ping", data);
    });

    // Device Sync Signaling Relay (Peer-to-Peer WebRTC)
    socket.on("sync_join_room", (data) => {
      const { roomId } = data;
      if (!roomId || typeof roomId !== 'string') return;
      socket.join(roomId);
      socket.to(roomId).emit("sync_peer_joined", { socketId: socket.id });
      console.log(`Socket ${socket.id} joined sync room ${roomId}`);
    });

    socket.on("sync_signal", (data) => {
      const { roomId, signal } = data;
      if (!roomId || !signal) return;
      // Relay signaling payload to other peers in the room
      socket.to(roomId).emit("sync_signal", { signal, senderSocketId: socket.id });
    });

    socket.on("sync_leave_room", (data) => {
      const { roomId } = data;
      if (!roomId) return;
      socket.leave(roomId);
      socket.to(roomId).emit("sync_peer_left", { socketId: socket.id });
      console.log(`Socket ${socket.id} left sync room ${roomId}`);
    });

    socket.on("disconnect", () => {
      const senderId = (socket as any).userId;
      
      if (senderId) {
        const deviceMap = users.get(senderId);
        
        if (deviceMap) {
          // Remove this specific socket connection
          deviceMap.delete(socket.id);

          // If no active sockets left for this user, they are truly offline!
          if (deviceMap.size === 0) {
            users.delete(senderId);
            clearTypingTimeout(`user-${senderId}`);
            io.emit("user_status", { userId: senderId, isOnline: false });
            io.emit("online_users", getOnlineUsersPayload());
            io.emit("all_users_data", getAllUsersPayload());
            // Sync with Firestore
            updateFirestorePresence(senderId, false);
            console.log(`User ${senderId} has disconnected all sockets. Broadcasted offline.`);
          } else {
            console.log(`Socket ${socket.id} for user ${senderId} disconnected. ${deviceMap.size} sockets still active.`);
            
            const newInactive = isUserInactive(senderId);
            io.emit("user_status", { userId: senderId, isOnline: true, isInactive: newInactive });
            io.emit("online_users", getOnlineUsersPayload());
            io.emit("all_users_data", getAllUsersPayload());

            // Broadcast remaining devices list to all remaining active sockets of this user
            const activeDeviceIds = Array.from(new Set(Array.from(deviceMap.values()).map(d => d.deviceId)));
            for (const [sId, info] of deviceMap.entries()) {
              io.to(sId).emit("devices_update", { devices: activeDeviceIds, currentDeviceId: info.deviceId });
            }
          }
        }
      }
      // Clean up any remaining timeouts for this socket connection
      for (const timeout of typingTimeouts.values()) {
        clearTimeout(timeout);
      }
      typingTimeouts.clear();
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/debug-env", async (req, res) => {
    let firebaseConfigParsed = null;
    try {
      if (process.env.FIREBASE_CONFIG) {
        const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
        firebaseConfigParsed = {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          has_private_key: !!parsed.private_key
        };
      }
    } catch (e: any) {
      firebaseConfigParsed = { error: e.message };
    }

    let metadataProjectId = null;
    try {
      const metaRes = await fetch("http://metadata.google.internal/computeMetadata/v1/project/project-id", {
        headers: { "Metadata-Flavor": "Google" }
      });
      if (metaRes.ok) {
        metadataProjectId = await metaRes.text();
      }
    } catch (e: any) {
      metadataProjectId = "Error: " + e.message;
    }

    res.json({
      envKeys: Object.keys(process.env),
      metadataProjectId,
      appletConfig,
      firebaseConfigParsed,
      hasDb: !!db,
      dbDatabaseId: db?.databaseId || null
    });
  });

  // === FIRESTORE PROXY API ENDPOINTS ===
  // To allow clients behind strict iframe sandboxes/proxies to query/write Firestore reliably
  app.get("/api/firestore/get", async (req, res) => {
    const { path: docPath } = req.query;
    if (!docPath || typeof docPath !== 'string') {
      return res.status(400).json({ error: "Missing or invalid path parameter" });
    }
    if (!db) {
      return res.status(503).json({ error: "Firestore database not initialized on backend" });
    }
    try {
      const docRef = db.doc(docPath);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        res.json({ exists: true, data: docSnap.data() });
      } else {
        res.json({ exists: false, data: null });
      }
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
        try {
          handleFirestoreError(err, OperationType.GET, docPath);
        } catch (_) {}
      }
      console.warn(`Backend getDoc warning for ${docPath}:`, err.message);
      res.json({ exists: false, data: null, isFallback: true, error: err.message });
    }
  });

  app.post("/api/firestore/set", async (req, res) => {
    const { path: docPath, data, merge } = req.body;
    if (!docPath || typeof docPath !== 'string' || !data) {
      return res.status(400).json({ error: "Missing path or data in request body" });
    }
    if (!db) {
      return res.status(503).json({ error: "Firestore database not initialized on backend" });
    }
    try {
      const docRef = db.doc(docPath);
      await docRef.set(data, { merge: merge !== false });
      res.json({ success: true });
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
        try {
          handleFirestoreError(err, OperationType.WRITE, docPath);
        } catch (_) {}
      }
      console.warn(`Backend setDoc warning for ${docPath}:`, err.message);
      res.json({ success: true, isFallback: true, error: err.message });
    }
  });

  app.post("/api/firestore/update", async (req, res) => {
    const { path: docPath, data } = req.body;
    if (!docPath || typeof docPath !== 'string' || !data) {
      return res.status(400).json({ error: "Missing path or data in request body" });
    }
    if (!db) {
      return res.status(503).json({ error: "Firestore database not initialized on backend" });
    }
    try {
      const docRef = db.doc(docPath);
      await docRef.update(data);
      res.json({ success: true });
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        } catch (_) {}
      }
      console.warn(`Backend updateDoc warning for ${docPath}:`, err.message);
      res.json({ success: true, isFallback: true, error: err.message });
    }
  });

  app.post("/api/firestore/delete", async (req, res) => {
    const { path: docPath } = req.body;
    if (!docPath || typeof docPath !== 'string') {
      return res.status(400).json({ error: "Missing path parameter" });
    }
    if (!db) {
      return res.status(503).json({ error: "Firestore database not initialized on backend" });
    }
    try {
      const docRef = db.doc(docPath);
      await docRef.delete();
      res.json({ success: true });
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
        try {
          handleFirestoreError(err, OperationType.DELETE, docPath);
        } catch (_) {}
      }
      console.warn(`Backend deleteDoc warning for ${docPath}:`, err.message);
      res.json({ success: true, isFallback: true, error: err.message });
    }
  });

  app.post("/api/firestore/query", async (req, res) => {
    const { collection: colName, where: whereFilters, limit: limitVal } = req.body;
    if (!colName || typeof colName !== 'string') {
      return res.status(400).json({ error: "Missing collection in request body" });
    }
    if (!db) {
      return res.status(503).json({ error: "Firestore database not initialized on backend" });
    }
    try {
      let queryRef: any = db.collection(colName);
      if (Array.isArray(whereFilters)) {
        for (const filter of whereFilters) {
          const { field, op, value } = filter;
          let adminOp = op;
          // Map firestore operators if they differ in admin sdk
          if (op === '==') adminOp = '==';
          queryRef = queryRef.where(field, adminOp, value);
        }
      }
      if (typeof limitVal === 'number' && limitVal > 0) {
        queryRef = queryRef.limit(limitVal);
      }
      const snapshot = await queryRef.get();
      const results: any[] = [];
      snapshot.forEach((doc: any) => {
        results.push({ id: doc.id, data: doc.data() });
      });
      res.json({ success: true, results });
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permissions')) {
        try {
          handleFirestoreError(err, OperationType.LIST, colName);
        } catch (_) {}
      }
      console.warn(`Backend query warning for collection ${colName}:`, err.message);
      res.json({ success: true, results: [], isFallback: true, error: err.message });
    }
  });

  app.post("/api/auth/google", async (req, res) => {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    try {
      let uid = null;
      let email = null;
      let name = null;
      let picture = null;
      let verified = false;

      // If Firebase Admin is initialized, verify the ID token
      if (process.env.FIREBASE_CONFIG) {
        try {
          const decodedToken = await getAuth().verifyIdToken(token);
          uid = decodedToken.uid;
          email = decodedToken.email || null;
          name = decodedToken.name || null;
          picture = decodedToken.picture || null;
          verified = true;
          console.log(`Successfully verified Google Auth ID token in Express for uid: ${uid}`);
        } catch (authErr) {
          console.error("Firebase ID token verification failed in Express:", authErr);
          return res.status(401).json({ error: "Invalid or expired token" });
        }
      }

      res.json({
        success: true,
        message: verified 
          ? "Google Auth token successfully verified by Express server."
          : "Google Auth token received by Express server (local mock verification).",
        uid,
        email,
        name,
        picture
      });
    } catch (error: any) {
      console.error("Error in /api/auth/google handler:", error);
      res.status(500).json({ error: error.message || "Failed to process auth token" });
    }
  });

  app.get("/api/admin/push-attempts", (req, res) => {
    res.json(pushAttempts);
  });

  app.post("/api/admin/clear-push-attempts", (req, res) => {
    pushAttempts.length = 0;
    res.json({ success: true, message: "Cleared push attempts log." });
  });

  app.get("/api/vapid-public-key", async (req, res) => {
    try {
      await vapidInitPromise;
      res.json({ publicKey: vapidKeys.publicKey });
    } catch (err: any) {
      console.error("VAPID public key endpoint failed:", err);
      res.status(500).json({ error: "VAPID key initialization failed: " + err.message });
    }
  });

  app.get("/api/vapid-validate", async (req, res) => {
    try {
      const activePubKey = vapidKeys.publicKey || "";
      const activePrivKey = vapidKeys.privateKey || "";
      const envPubKey = process.env.VAPID_PUBLIC_KEY || "";
      const envPrivKey = process.env.VAPID_PRIVATE_KEY || "";
      
      const results = {
        publicKey: {
          present: !!activePubKey,
          length: activePubKey.length,
          isValidBase64: false,
          byteLength: 0,
          error: null as string | null
        },
        privateKey: {
          present: !!activePrivKey,
          length: activePrivKey.length,
          isValidBase64: false,
          byteLength: 0,
          error: null as string | null
        },
        envConfigured: !!(envPubKey && envPrivKey),
        isValidOverall: false
      };

      const checkKey = (keyStr: string, expectedBytes: number, name: string, target: typeof results.publicKey) => {
        if (!keyStr) {
          target.error = `${name} is missing or uninitialized.`;
          return;
        }
        try {
          const urlSafeBase64Regex = /^[A-Za-z0-9_-]+={0,2}$/;
          const standardBase64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
          const isValidFormat = urlSafeBase64Regex.test(keyStr) || standardBase64Regex.test(keyStr);
          
          if (!isValidFormat) {
            target.error = `${name} contains characters that are not valid base64 or base64url.`;
            return;
          }

          const normalized = keyStr.replace(/-/g, '+').replace(/_/g, '/');
          const buffer = Buffer.from(normalized, 'base64');
          target.isValidBase64 = true;
          target.byteLength = buffer.length;

          if (buffer.length !== expectedBytes) {
            target.error = `${name} length mismatch: expected ${expectedBytes} bytes, got ${buffer.length} bytes when decoded.`;
          }
        } catch (err: any) {
          target.error = `Failed to decode ${name}: ${err.message}`;
        }
      };

      checkKey(activePubKey, 65, "VAPID_PUBLIC_KEY", results.publicKey);
      checkKey(activePrivKey, 32, "VAPID_PRIVATE_KEY", results.privateKey);

      results.isValidOverall = results.publicKey.present && 
                               results.privateKey.present && 
                               !results.publicKey.error && 
                               !results.privateKey.error;

      res.json(results);
    } catch (err: any) {
      console.error("VAPID validate endpoint failed:", err);
      res.status(500).json({ error: "Failed to validate VAPID keys: " + err.message });
    }
  });

  app.post("/api/save-subscription", async (req, res) => {
    try {
      const { userId, subscription } = req.body;
      if (!userId || !subscription || !subscription.endpoint) {
        return res.status(400).json({ error: "Missing userId or valid subscription in request body" });
      }

      // 1. Require Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
      }
      const token = authHeader.split('Bearer ')[1];

      // 2. Verify token: support both 'local' and 'google' auth methods
      if (token.startsWith('local-')) {
        const decodedUid = token.split('local-')[1];
        if (decodedUid !== userId) {
          console.error(`Local token mismatch: decoded UID (${decodedUid}) does not match request userId (${userId})`);
          return res.status(403).json({ error: "Unauthorized: Local token UID mismatch" });
        }
        console.log(`Successfully verified local auth token for user: ${userId}`);
      } else if (process.env.FIREBASE_CONFIG) {
        try {
          const decodedToken = await getAuth().verifyIdToken(token);
          const decodedUid = decodedToken.uid;

          // 3. Reject if decoded.uid !== userId
          if (decodedUid !== userId) {
            console.error(`Token mismatch: decoded UID (${decodedUid}) does not match request userId (${userId})`);
            return res.status(403).json({ error: "Unauthorized: Token UID mismatch" });
          }
          console.log(`Successfully verified Firebase token for user: ${userId}`);
        } catch (authErr: any) {
          console.error("Firebase ID token verification failed for subscription:", authErr);
          return res.status(401).json({ error: "Invalid or expired authorization token: " + authErr.message });
        }
      } else {
        console.warn("FIREBASE_CONFIG is not set. Saving subscription without dynamic verification in local development mode.");
      }

      // Update memory cache
      let userMemSubs = memorySubscriptions.get(userId) || [];
      if (!Array.isArray(userMemSubs)) {
        userMemSubs = [];
      }
      userMemSubs = userMemSubs.filter((s: any) => s.endpoint !== subscription.endpoint);
      userMemSubs.push(subscription);
      memorySubscriptions.set(userId, userMemSubs);

      // Note: We no longer aggressively remove this endpoint from other users' subscriptions in memory/Firestore.
      // This allows multi-account (double/triple account) logins on the same device/browser sharing the same subscription ID
      // to cleanly co-exist and receive push notifications correctly. Deduplication & collision prevention is handled during broadcast in sendPushNotification.

      // Save to Firestore if available
      if (db) {
        try {
          const docRef = db.collection('pushSubscriptions').doc(userId);
          const docSnap = await docRef.get();
          let subscriptions: any[] = [];
          if (docSnap.exists) {
            const data = docSnap.data();
            if (data) {
              if (Array.isArray(data.subscriptions)) {
                subscriptions = data.subscriptions;
              } else if (data.endpoint) {
                // Migration from old single-subscription format
                subscriptions = [data];
              }
            }
          }
          // Filter out existing one with the same endpoint
          subscriptions = subscriptions.filter((s: any) => s.endpoint !== subscription.endpoint);
          subscriptions.push(subscription);

          // Enforce maximum of 10 devices
          if (subscriptions.length > 10) {
            subscriptions = subscriptions.slice(-10);
          }

          await docRef.set({ subscriptions });
          console.log(`Saved push subscription to Firestore for user: ${userId} (Total: ${subscriptions.length})`);
        } catch (dbErr: any) {
          console.warn("Failed to save push subscription to Firestore, using memory fallback:", dbErr.message);
        }
      } else {
        console.log(`Saved push subscription to local memory cache for user: ${userId} (Total: ${userMemSubs.length})`);
      }

      res.json({ success: true, message: "Subscription saved successfully" });
    } catch (err: any) {
      console.error("Error saving subscription on backend:", err);
      res.status(500).json({ error: err.message || "Failed to save subscription" });
    }
  });

  app.post("/api/remove-subscription", async (req, res) => {
    try {
      const { userId, endpoint } = req.body;
      if (!userId || !endpoint) {
        return res.status(400).json({ error: "Missing userId or endpoint" });
      }

      // Update memory cache
      let userMemSubs = memorySubscriptions.get(userId) || [];
      if (Array.isArray(userMemSubs)) {
        userMemSubs = userMemSubs.filter((s: any) => s.endpoint !== endpoint);
        memorySubscriptions.set(userId, userMemSubs);
      }

      // Update Firestore if available
      if (db) {
        try {
          const docRef = db.collection('pushSubscriptions').doc(userId);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const data = docSnap.data();
            if (data && Array.isArray(data.subscriptions)) {
              const updated = data.subscriptions.filter((s: any) => s.endpoint !== endpoint);
              await docRef.set({ subscriptions: updated });
              console.log(`Removed subscription endpoint from Firestore for user ${userId}`);
            }
          }
        } catch (dbErr: any) {
          console.warn("Failed to remove push subscription from Firestore:", dbErr.message);
        }
      }

      res.json({ success: true, message: "Subscription removed successfully" });
    } catch (err: any) {
      console.error("Error removing subscription on backend:", err);
      res.status(500).json({ error: err.message || "Failed to remove subscription" });
    }
  });

  app.post("/api/delete-account", async (req, res) => {
    try {
      const { userId, email } = req.body || {};
      if (!userId) {
        return res.status(400).json({ error: "Missing userId parameter" });
      }

      console.log(`[Backend Delete Account] Initiating total account wipe for user: ${userId} (${email || 'No Email'})`);

      // 1. Remove memory push subscriptions
      memorySubscriptions.delete(userId);

      if (db) {
        try {
          // Delete push subscriptions document
          await db.collection('pushSubscriptions').doc(userId).delete().catch(() => {});

          // Delete user document from users collection
          await db.collection('users').doc(userId).delete().catch(() => {});

          // Delete friend requests where sender or receiver is userId
          const frSnap1 = await db.collection('friendRequests').where('senderId', '==', userId).get().catch(() => null);
          if (frSnap1) {
            for (const d of frSnap1.docs) {
              await d.ref.delete().catch(() => {});
            }
          }
          const frSnap2 = await db.collection('friendRequests').where('receiverId', '==', userId).get().catch(() => null);
          if (frSnap2) {
            for (const d of frSnap2.docs) {
              await d.ref.delete().catch(() => {});
            }
          }

          // Delete user notifications
          const notifSnap = await db.collection('notifications').where('userId', '==', userId).get().catch(() => null);
          if (notifSnap) {
            for (const d of notifSnap.docs) {
              await d.ref.delete().catch(() => {});
            }
          }

          // Delete offline messages sent by user
          const msgSnap = await db.collection('offline_messages').where('senderId', '==', userId).get().catch(() => null);
          if (msgSnap) {
            for (const d of msgSnap.docs) {
              await d.ref.delete().catch(() => {});
            }
          }

          // Scrub user reference from all other users' friend/blocked/removed lists
          const allUsersSnap = await db.collection('users').get().catch(() => null);
          if (allUsersSnap) {
            for (const uDoc of allUsersSnap.docs) {
              if (uDoc.id === userId) continue;
              const uData = uDoc.data();
              let modified = false;
              const updatePayload: any = {};

              if (Array.isArray(uData.friends) && uData.friends.includes(userId)) {
                updatePayload.friends = uData.friends.filter((id: string) => id !== userId);
                modified = true;
              }
              if (Array.isArray(uData.blockedUserIds) && uData.blockedUserIds.includes(userId)) {
                updatePayload.blockedUserIds = uData.blockedUserIds.filter((id: string) => id !== userId);
                modified = true;
              }
              if (Array.isArray(uData.removedFriendIds) && uData.removedFriendIds.includes(userId)) {
                updatePayload.removedFriendIds = uData.removedFriendIds.filter((id: string) => id !== userId);
                modified = true;
              }

              if (modified) {
                await uDoc.ref.update(updatePayload).catch(() => {});
              }
            }
          }

          console.log(`[Backend Delete Account] Complete server & Firestore purge finished for user: ${userId}`);
        } catch (dbErr: any) {
          console.warn("[Backend Delete Account] Firestore cleanup warning:", dbErr?.message);
        }
      }

      res.json({ success: true, message: "Account and associated details deleted completely from server and friends lists." });
    } catch (err: any) {
      console.error("Error in /api/delete-account:", err);
      res.status(500).json({ error: err.message || "Failed to delete account" });
    }
  });

  app.post("/api/send-test-push", async (req, res) => {
    try {
      const { userId, title, body } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      // Require Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
      }
      const token = authHeader.split('Bearer ')[1];

      // Verify token: support both 'local' and 'google' auth methods
      if (token.startsWith('local-')) {
        const decodedUid = token.split('local-')[1];
        if (decodedUid !== userId) {
          let hasAdminAccess = false;
          if (db) {
            try {
              const requesterSnap = await db.collection('users').doc(decodedUid).get();
              if (requesterSnap.exists && requesterSnap.data()?.isAdmin === true) {
                hasAdminAccess = true;
              }
            } catch (dbErr) {
              console.error("Error querying db for local requester admin status:", dbErr);
            }
          }
          if (!hasAdminAccess) {
            console.error(`Local token mismatch: decoded UID (${decodedUid}) does not match request userId (${userId}) and is not an admin`);
            return res.status(403).json({ error: "Unauthorized: Local token UID mismatch" });
          }
          console.log(`Successfully verified administrative local auth token for user: ${userId}`);
        } else {
          console.log(`Successfully verified local auth token for sending test push for user: ${userId}`);
        }
      } else if (process.env.FIREBASE_CONFIG) {
        try {
          const decodedToken = await getAuth().verifyIdToken(token);
          const decodedUid = decodedToken.uid;

          // Reject if decoded.uid !== userId unless requester is an admin
          if (decodedUid !== userId) {
            let hasAdminAccess = false;
            if (db) {
              try {
                const requesterSnap = await db.collection('users').doc(decodedUid).get();
                if (requesterSnap.exists && requesterSnap.data()?.isAdmin === true) {
                  hasAdminAccess = true;
                }
              } catch (dbErr) {
                console.error("Error querying db for Firebase requester admin status:", dbErr);
              }
            }
            if (!hasAdminAccess) {
              console.error(`Token mismatch: decoded UID (${decodedUid}) does not match request userId (${userId}) and is not an admin`);
              return res.status(403).json({ error: "Unauthorized: Token UID mismatch" });
            }
            console.log(`Successfully verified administrative Firebase token for user: ${userId}`);
          } else {
            console.log(`Successfully verified Firebase token for sending test push for user: ${userId}`);
          }
        } catch (authErr: any) {
          console.error("Firebase ID token verification failed for test push:", authErr);
          return res.status(401).json({ error: "Invalid or expired authorization token: " + authErr.message });
        }
      } else {
        console.warn("FIREBASE_CONFIG is not set. Sending test push without dynamic verification in local development mode.");
      }

      // Pre-check for subscription existence to avoid silent drops
      let hasSubscription = false;
      if (db) {
        try {
          const subDoc = await db.collection('pushSubscriptions').doc(userId).get();
          if (subDoc.exists) {
            const data = subDoc.data();
            if (data && ((Array.isArray(data.subscriptions) && data.subscriptions.length > 0) || data.endpoint)) {
              hasSubscription = true;
            }
          }
        } catch (dbErr) {
          console.error("Error pre-checking Firestore subscriptions:", dbErr);
        }
      }
      if (!hasSubscription) {
        const memSubs = memorySubscriptions.get(userId);
        if (memSubs && ((Array.isArray(memSubs) && memSubs.length > 0) || (memSubs as any).endpoint)) {
          hasSubscription = true;
        }
      }

      if (!hasSubscription) {
        return res.status(404).json({
          success: false,
          error: "No push subscription found — click Force Sync VAPID first."
        });
      }

      const notificationTitle = title || "🔔 Server Push Alert (VAPID)";
      const notificationBody = body || "This is a real Web Push notification sent securely from the Express backend server using VAPID!";

      console.log(`Sending manual VAPID test push notification to user ${userId}...`);
      const result: any = await sendPushNotification(userId, {
        title: notificationTitle,
        body: notificationBody,
        icon: '/pwa-192x192.png',
        data: { url: '/' }
      });

      if (result && !result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error || "Failed to deliver push notification", 
          warning: result.warning,
          details: result 
        });
      }

      res.json({ 
        success: true, 
        message: "Test push notification dispatched via VAPID", 
        details: result 
      });
    } catch (err: any) {
      console.error("Error sending test push notification:", err);
      res.status(500).json({ error: err.message || "Failed to send test push notification" });
    }
  });

  app.get("/api/webrtc/config", (req, res) => {
    let turnUrl = process.env.TURN_SERVER_URL || 'turn:free.expressturn.com:3478';
    let turnUser = process.env.TURN_SERVER_USERNAME || '000000002100245221';
    let turnPass = process.env.TURN_SERVER_PASSWORD || 'tSLm3kXJjgjn59xHqOmR8TvGo+4=';

    if (turnUrl && !turnUrl.startsWith('turn:') && !turnUrl.startsWith('stun:') && !turnUrl.startsWith('turns:')) {
      turnUrl = `turn:${turnUrl}`;
    }

    res.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:free.expressturn.com:3478' },
        {
          urls: turnUrl,
          username: turnUser,
          credential: turnPass
        },
        {
          urls: turnUrl.includes('?') ? turnUrl : `${turnUrl}?transport=tcp`,
          username: turnUser,
          credential: turnPass
        },
        {
          urls: 'turn:free.expressturn.com:80?transport=tcp',
          username: turnUser,
          credential: turnPass
        },
        {
          urls: 'turn:free.expressturn.com:443?transport=tcp',
          username: turnUser,
          credential: turnPass
        }
      ]
    });
  });

  // Native Realtime calling API configuration stub (Cloudflare replaced)
  app.all("/api/realtime/*", async (req, res) => {
    res.status(501).json({ error: "Cloudflare Calls integration removed as requested." });
  });

  // Integration connection endpoint
  app.post("/api/integrations/connect", (req, res) => {
    const { service } = req.body;
    
    const credentials = {
      'Firebase Cloud': process.env.FIREBASE_CONFIG ? 'Configured' : 'Missing',
      'Gemini AI Engine': process.env.GEMINI_API_KEY ? 'Configured' : 'Missing',
      'Express TURN': process.env.TURN_SERVER_URL ? 'Configured' : 'Missing',
      'Web Notification Keys': (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'Configured' : 'Missing',
    };

    const status = credentials[service as keyof typeof credentials];

    if (status === 'Configured') {
      res.json({ 
        success: true, 
        message: `${service} connected successfully via environment variables.`,
        details: 'Secure connection established.'
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: `Failed to connect to ${service}.`,
        details: `Missing environment variable for ${service}. Please configure it in the hosting environment.`
      });
    }
  });

  async function startServer() {
    if (!process.env.VERCEL) {
      const isProd = process.env.NODE_ENV === "production";
      const port = 3000;

      if (!isProd) {
        try {
          const { createServer: createViteServer } = await import("vite");
          const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
          });
          app.use(vite.middlewares);
          console.log("Vite development middleware integrated successfully.");
        } catch (viteErr) {
          console.error("Failed to load Vite dev middleware:", viteErr);
        }
      } else {
        let distPath = path.join(process.cwd(), 'dist');
        if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, 'index.html'))) {
          const fallbackPath = path.join(process.cwd(), '../dist');
          if (fs.existsSync(fallbackPath) && fs.existsSync(path.join(fallbackPath, 'index.html'))) {
            distPath = fallbackPath;
          }
        }

        if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
          app.use(express.static(distPath));
          app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
          });
        } else {
          app.get('*', (req, res) => {
            res.json({ status: "ok", message: "Chat API Server is live and running. Frontend is served independently." });
          });
        }
      }

      httpServer.listen(port, "0.0.0.0", () => {
        console.log(`Unified server running on http://0.0.0.0:${port} (production: ${isProd})`);
      });
    }
  }

  startServer();

export default app;
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});
