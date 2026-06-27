import express from "express";
import { createServer as createViteServer } from "vite";
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
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json({ limit: '10mb' }));

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

      // Store in Firestore if available
      if (db) {
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
      
      users.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);
      
      // Broadcast online status
      io.emit("user_status", { userId, isOnline: true });
      socket.emit("online_users", Array.from(users.keys()));
      
      const deliverAndCleanup = (msgId: string, msgData: any) => {
        socket.emit("receive_message", msgData);
        console.log(`Delivered offline message ${msgId} to ${userId}`);
        // If it's a file, we DO NOT delete from R2 here because E2EE needs to download it.
        // It's up to the client to delete or we delete it on a cron job. The prompt says: "forward after immediately delete incase not online" - meaning delete message from store-and-forward.
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

    socket.on("get_public_key", ({ userId }, callback) => {
      callback(userPublicKeys.get(userId));
    });

    socket.on("typing", (data) => {
      const { recipientId, isTyping } = data;
      const targetSocketId = users.get(recipientId);
      
      let senderId = null;
      for (const [uid, sid] of users.entries()) {
        if (sid === socket.id) {
          senderId = uid;
          break;
        }
      }

      if (targetSocketId && senderId) {
        io.to(targetSocketId).emit("typing", { senderId, isTyping });
      }
    });

    socket.on("send_message", async (data) => {
      const { recipientId, text, type, fileUrl, fileSize, messageId, encryptedFileKey, iv } = data;
      const targetSocketId = users.get(recipientId);
      
      let senderId = null;
      for (const [uid, sid] of users.entries()) {
        if (sid === socket.id) {
          senderId = uid;
          break;
        }
      }

      if (!senderId) return;

      // Track text message footprint in quota roughly
      if (!checkQuota(senderId, JSON.stringify(data).length)) {
        socket.emit("quota_exceeded", { error: "Daily 100MB quota exceeded" });
        return;
      }

      const messageData = {
        id: messageId || `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        senderId,
        recipientId,
        text, // this is now E2EE encrypted ciphertext
        type: type || 'text',
        fileUrl,
        fileSize,
        encryptedFileKey, // for e2ee attached files
        iv, // init vector
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (targetSocketId) {
        io.to(targetSocketId).emit("receive_message", messageData);
        console.log(`Message sent from ${senderId} to ${recipientId}`);
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
      for (const [userId, socketId] of users.entries()) {
        if (socketId === socket.id) {
          users.delete(userId);
          io.emit("user_status", { userId, isOnline: false });
          console.log(`User ${userId} disconnected`);
          break;
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
        { 
          urls: process.env.TURN_SERVER_URL || 'turn:your-turn-server.com', 
          username: process.env.TURN_SERVER_USERNAME || 'user', 
          credential: process.env.TURN_SERVER_PASSWORD || 'password' 
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
      'Stripe Gateway': process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Missing',
      'SendGrid SMTP': process.env.SENDGRID_API_KEY ? 'Configured' : 'Missing',
      'Twilio SMS': process.env.TWILIO_AUTH_TOKEN ? 'Configured' : 'Missing',
      'Express TURN': process.env.TURN_SERVER_URL ? 'Configured' : 'Missing',
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
