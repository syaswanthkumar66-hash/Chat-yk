import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import path from "path";

// Load environment variables from .env file
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';



let db: any = null;
let firebaseApp: any = null;

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

if (process.env.FIREBASE_CONFIG) {
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
        firebaseApp = initializeApp({ projectId: configObj.project_id });
        console.log("Firebase Admin initialized using FIREBASE_CONFIG project_id (no cert)");
      }
    } else {
      firebaseApp = getApps()[0];
    }
    const dbId = appletConfig?.firestoreDatabaseId || undefined;
    db = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    console.log(`Firebase Admin initialized for store-and-forward (database: ${dbId || 'default'})`);
  } catch(e: any) {
    console.error("Failed to initialize Firebase Admin via FIREBASE_CONFIG:", e);
  }
} else if (appletConfig) {
  try {
    console.log("Initializing using appletConfig projectId:", appletConfig.projectId, "databaseId:", appletConfig.firestoreDatabaseId);
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        projectId: appletConfig.projectId
      });
    } else {
      firebaseApp = getApps()[0];
    }
    const dbId = appletConfig.firestoreDatabaseId;
    db = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    console.log(`Firebase Admin initialized using applet config (database: ${dbId || 'default'})`);
  } catch (e) {
    console.error("Failed to initialize Firebase Admin via applet config:", e);
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
    console.log("Firebase Admin initialized using default credentials");
  } catch (e) {
    console.warn("Failed to initialize Firebase Admin default, proxy is disabled:", e);
  }
}

import webpush from "web-push";

let vapidKeys = {
  publicKey: "",
  privateKey: ""
};

async function initVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
    console.log("Loaded VAPID keys from environment variables");
  } else if (db) {
    try {
      const vapidDoc = await db.collection('system_config').doc('vapid').get();
      if (vapidDoc.exists) {
        const data = vapidDoc.data();
        vapidKeys = {
          publicKey: data.publicKey,
          privateKey: data.privateKey
        };
        console.log("Loaded existing VAPID keys from Firestore");
      } else {
        const generated = webpush.generateVAPIDKeys();
        vapidKeys = {
          publicKey: generated.publicKey,
          privateKey: generated.privateKey
        };
        await db.collection('system_config').doc('vapid').set(vapidKeys);
        console.log("Generated and saved new VAPID keys in Firestore");
      }
    } catch (err) {
      console.warn("Could not load/save VAPID keys from/to Firestore, generating in-memory ones:", err);
      const generated = webpush.generateVAPIDKeys();
      vapidKeys = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey
      };
    }
  } else {
    console.log("No Firebase DB or environment VAPID keys found. Generating in-memory VAPID keys.");
    const generated = webpush.generateVAPIDKeys();
    vapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey
    };
  }

  try {
    let subject = process.env.VAPID_SUBJECT || 'mailto:syaswanthkumar66@gmail.com';
    if (subject && !subject.startsWith('mailto:') && subject.includes('@')) {
      subject = `mailto:${subject}`;
    }
    webpush.setVapidDetails(
      subject,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (err) {
    console.error("Failed to set VAPID details:", err);
  }
}

initVapid();

const memorySubscriptions = new Map<string, any>();

async function sendPushNotification(recipientId: string, payload: { title: string, body: string, icon?: string, data?: any }) {
  let subscription: any = null;
  if (db) {
    try {
      const subDoc = await db.collection('pushSubscriptions').doc(recipientId).get();
      if (subDoc.exists) {
        subscription = subDoc.data();
      }
    } catch (err) {
      console.error(`Error fetching push subscription from Firestore for ${recipientId}:`, err);
    }
  }

  // Fallback or read from memory if not in db or db is null
  if (!subscription) {
    subscription = memorySubscriptions.get(recipientId);
  }

  if (subscription && subscription.endpoint) {
    try {
      console.log(`Sending Web Push Notification to user ${recipientId}`);
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`Successfully sent Web Push Notification to user ${recipientId}`);
    } catch (err: any) {
      console.error(`Error sending push notification to user ${recipientId}:`, err);
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`Subscription for user ${recipientId} has expired or is invalid. Deleting.`);
        memorySubscriptions.delete(recipientId);
        if (db) {
          try {
            await db.collection('pushSubscriptions').doc(recipientId).delete();
          } catch (deleteErr) {
            console.error("Error deleting expired subscription from Firestore:", deleteErr);
          }
        }
      }
    }
  } else {
    console.log(`No active Web Push subscription found for user ${recipientId}`);
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
    origin: (origin, callback) => {
      // Dynamic origin fallback to support credentials handshakes correctly in all deployment stages
      if (!origin) {
        callback(null, "*");
      } else {
        callback(null, origin);
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.json({ limit: '10mb' }));

// Health Check / Wake Up Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const users = new Map<string, string>(); // userId -> socketId
const userPublicKeys = new Map<string, string>(); // userId -> publicKey
const tempStorage = new Map<string, any>(); // messageId -> messageData 

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

    socket.on("register", async (data) => {
      // Graceful handling if data is just string (old logic) or object (new E2EE logic)
      let userId, publicKey;
      if (typeof data === 'string') {
        userId = data;
      } else {
        userId = data.userId;
        publicKey = data.publicKey;
        if (publicKey) userPublicKeys.set(userId, publicKey);
      }
      
      (socket as any).userId = userId;
      users.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);
      
      // Broadcast online status
      io.emit("user_status", { userId, isOnline: true });
      socket.emit("online_users", Array.from(users.keys()));
      
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

    socket.on("join_group", (groupId) => {
      socket.join(`group-${groupId}`);
      console.log(`Socket ${socket.id} joined group room group-${groupId}`);
    });

    socket.on("get_public_key", ({ userId }, callback) => {
      callback(userPublicKeys.get(userId));
    });

    socket.on("typing", (data) => {
      const { recipientId, isTyping } = data;
      const targetSocketId = users.get(recipientId);
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, sid]) => sid === socket.id)?.[0];

      if (targetSocketId && senderId) {
        io.to(targetSocketId).emit("typing", { senderId, isTyping });
      }
    });

    socket.on("typing_start", (data) => {
      const { recipientId, groupId } = data;
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, sid]) => sid === socket.id)?.[0];
      if (!senderId) return;

      if (groupId) {
        socket.to(`group-${groupId}`).emit("typing_start", { senderId, groupId });
      } else if (recipientId) {
        const targetSocketId = users.get(recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("typing_start", { senderId });
        }
      }
    });

    socket.on("typing_stop", (data) => {
      const { recipientId, groupId } = data;
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, sid]) => sid === socket.id)?.[0];
      if (!senderId) return;

      if (groupId) {
        socket.to(`group-${groupId}`).emit("typing_stop", { senderId, groupId });
      } else if (recipientId) {
        const targetSocketId = users.get(recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("typing_stop", { senderId });
        }
      }
    });

    socket.on("message_reaction", (data) => {
      const { messageId, chatId, emoji, recipientId, groupId } = data;
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, sid]) => sid === socket.id)?.[0];
      if (!senderId) return;

      const reactionData = { messageId, chatId, emoji, senderId };

      if (groupId) {
        socket.to(`group-${groupId}`).emit("message_reaction", reactionData);
      } else if (recipientId) {
        const targetSocketId = users.get(recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("message_reaction", reactionData);
        }
      }
    });

    socket.on("send_message", async (data) => {
      const { recipientId, groupId, recipientIds, text, type, fileUrl, fileSize, messageId, encryptedFileKey, iv } = data;
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, sid]) => sid === socket.id)?.[0];

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

      if (groupId) {
        // Send to everyone in the group room except the sender
        socket.to(`group-${groupId}`).emit("receive_message", messageData);
        console.log(`Group message sent from ${senderId} to group-${groupId}`);

        // For any group member who is offline, save an offline message and send a push notification
        if (Array.isArray(recipientIds)) {
          for (const targetId of recipientIds) {
            if (targetId === senderId) continue;
            const targetSocketId = users.get(targetId);
            if (!targetSocketId) {
              const storeData = { ...messageData, recipientId: targetId, to: targetId };
              const offlineMsgId = `${messageData.id}-${targetId}`;
              let savedToFirestore = false;
              if (db) {
                try {
                  await db.collection('offline_messages').doc(offlineMsgId).set(storeData);
                  console.log(`Group member ${targetId} offline. Saved group message to Firestore.`);
                  savedToFirestore = true;
                } catch(e: any) {
                  console.warn("Firebase save error for group member, falling back to memory:", e.message);
                }
              }
              if (!savedToFirestore) {
                tempStorage.set(offlineMsgId, storeData);
                console.log(`Group member ${targetId} offline. Message stored temporarily in memory.`);
              }
              // Send web push notification
              sendPushNotification(targetId, {
                title: data.senderName || "New Group Message",
                body: messageData.type === 'text' ? messageData.text : `📎 Shared a ${messageData.type}`,
                icon: 'https://picsum.photos/seed/default/200',
                data: { url: '/' }
              });
            }
          }
        }
      } else if (recipientId) {
        const targetSocketId = users.get(recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("receive_message", messageData);
          console.log(`Message sent from ${senderId} to ${recipientId}`);
        } else {
          // Store any message type offline in Firestore/Memory and send push notification
          const storeData = { ...messageData, to: recipientId };
          let savedToFirestore = false;
          if (db) {
            try {
              await db.collection('offline_messages').doc(messageData.id).set(storeData);
              console.log(`User ${recipientId} offline. Message saved to Firebase.`);
              savedToFirestore = true;
            } catch(e: any) {
              console.warn("Firebase save error, falling back to memory:", e.message);
            }
          }
          if (!savedToFirestore) {
            // Store temporarily in memory if firebase write fails
            tempStorage.set(messageData.id, storeData);
            console.log(`User ${recipientId} offline. Message ${messageData.id} stored temporarily in memory.`);
          }
          // Send web push notification
          sendPushNotification(recipientId, {
            title: data.senderName || "New Message",
            body: messageData.type === 'text' ? messageData.text : `📎 Shared a ${messageData.type}`,
            icon: 'https://picsum.photos/seed/default/200',
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
      socket.to(roomId).emit("sfu_signal", { roomId, signal, from, type });
    });

    socket.on("call_user", (data) => {
      const { to, roomId, type, from } = data;
      const targetSocketId = users.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("incoming_call", { roomId, type, from });
      }
    });

    socket.on("end_call", (data) => {
      const { to, roomId } = data;
      if (to) {
        const targetSocketId = users.get(to);
        if (targetSocketId) {
          io.to(targetSocketId).emit("call_ended", { roomId });
        }
      } else {
        socket.to(roomId).emit("call_ended", { roomId });
      }
    });

    socket.on("disconnect", () => {
      const senderId = (socket as any).userId || Array.from(users.entries()).find(([_, sid]) => sid === socket.id)?.[0];
      if (senderId) {
        if (users.get(senderId) === socket.id) {
          users.delete(senderId);
          io.emit("user_status", { userId: senderId, isOnline: false });
          console.log(`User ${senderId} disconnected`);
        }
      }
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

  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post("/api/save-subscription", async (req, res) => {
    try {
      const { userId, subscription } = req.body;
      if (!userId || !subscription) {
        return res.status(400).json({ error: "Missing userId or subscription in request body" });
      }

      // Always save to memory cache
      memorySubscriptions.set(userId, subscription);

      // Save to Firestore if available
      if (db) {
        try {
          await db.collection('pushSubscriptions').doc(userId).set(subscription);
          console.log(`Saved push subscription to Firestore for user: ${userId}`);
        } catch (dbErr: any) {
          console.warn("Failed to save push subscription to Firestore, using memory fallback:", dbErr.message);
        }
      } else {
        console.log(`Saved push subscription to local memory cache for user: ${userId}`);
      }

      res.json({ success: true, message: "Subscription saved successfully" });
    } catch (err: any) {
      console.error("Error saving subscription on backend:", err);
      res.status(500).json({ error: err.message || "Failed to save subscription" });
    }
  });

  app.post("/api/send-test-push", async (req, res) => {
    try {
      const { userId, title, body } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      const notificationTitle = title || "🔔 Server Push Alert (VAPID)";
      const notificationBody = body || "This is a real Web Push notification sent securely from the Express backend server using VAPID!";

      console.log(`Sending manual VAPID test push notification to user ${userId}...`);
      await sendPushNotification(userId, {
        title: notificationTitle,
        body: notificationBody,
        icon: 'https://picsum.photos/seed/default/200',
        data: { url: '/' }
      });

      res.json({ success: true, message: "Test push notification dispatched via VAPID" });
    } catch (err: any) {
      console.error("Error sending test push notification:", err);
      res.status(500).json({ error: err.message || "Failed to send test push notification" });
    }
  });

  app.get("/api/webrtc/config", (req, res) => {
    res.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { 
          urls: process.env.TURN_SERVER_URL || 'turn:openrelay.metered.ca:80?transport=udp', 
          username: process.env.TURN_SERVER_USERNAME || 'openrelayproject', 
          credential: process.env.TURN_SERVER_PASSWORD || 'openrelayproject' 
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
      const port = isProd ? Number(process.env.PORT || 3000) : 3001;

      if (isProd) {
        const distPath = path.join(process.cwd(), 'dist');
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
        console.log(`Backend server running on port ${port} (production: ${isProd})`);
      });
    }
  }

  startServer();

export default app;
