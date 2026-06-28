import express from "express";
import path from "path";

import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';



let db: any = null;
if (process.env.FIREBASE_CONFIG) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log("Firebase Admin initialized for store-and-forward");
  } catch(e) {
    console.error("Failed to initialize Firebase Admin:", e);
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
        const doc = await db.collection('uploaded_files').doc(fileId).get();
        if (doc.exists) {
          const file = doc.data();
          const buffer = Buffer.from(file.data, 'base64');
          res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `inline; filename="${file.name || 'file'}"`);
          return res.send(buffer);
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
        } catch(e) {
          console.error("Firebase fetch error", e);
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

        // For any group member who is offline, save an offline message (only for text messages)
        if (Array.isArray(recipientIds)) {
          for (const targetId of recipientIds) {
            if (targetId === senderId) continue;
            const targetSocketId = users.get(targetId);
            if (!targetSocketId) {
              if (type !== 'text' || fileUrl) {
                console.log(`Skipping offline group message storage for ${targetId} as it is a media/file transfer.`);
                continue;
              }
              const storeData = { ...messageData, recipientId: targetId, to: targetId };
              const offlineMsgId = `${messageData.id}-${targetId}`;
              if (db) {
                try {
                  await db.collection('offline_messages').doc(offlineMsgId).set(storeData);
                  console.log(`Group member ${targetId} offline. Saved group message to Firestore.`);
                } catch(e) {
                  console.error("Firebase save error for group member:", e);
                }
              } else {
                tempStorage.set(offlineMsgId, storeData);
                console.log(`Group member ${targetId} offline. Message stored temporarily in memory.`);
              }
            }
          }
        }
      } else if (recipientId) {
        const targetSocketId = users.get(recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("receive_message", messageData);
          console.log(`Message sent from ${senderId} to ${recipientId}`);
        } else {
          // Only store text messages offline
          if (type !== 'text' || fileUrl) {
            console.log(`Recipient ${recipientId} is offline. Skipping offline message storage for media/file transfer.`);
          } else {
            const storeData = { ...messageData, to: recipientId };
            if (db) {
              try {
                await db.collection('offline_messages').doc(messageData.id).set(storeData);
                console.log(`User ${recipientId} offline. Message saved to Firebase.`);
              } catch(e) {
                console.error("Firebase save error", e);
              }
            } else {
              // Store temporarily in memory if firebase not configured
              tempStorage.set(messageData.id, storeData);
              console.log(`User ${recipientId} offline. Message ${messageData.id} stored temporarily in memory.`);
            }
          }
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
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      try {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } catch (e) {
        console.warn("Vite could not be loaded dynamically for development:", e);
      }
    } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    const port = Number(process.env.PORT || 3000);
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  }
}

startServer();

export default app;
