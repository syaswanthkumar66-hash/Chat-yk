require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust for production to match your Vercel URL
    methods: ["GET", "POST"]
  }
});

// STUN/TURN Server Configuration (passed to clients for WebRTC)
// In production, replace the TURN credentials with a paid service like Twilio or Metered.ca
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // {
  //   urls: "turn:global.turn.twilio.com:3478?transport=udp",
  //   username: process.env.TURN_USERNAME,
  //   credential: process.env.TURN_PASSWORD
  // }
];

app.get('/', (req, res) => {
  res.send('Backend signaling server is running!');
});

// Endpoint to fetch ICE servers securely 
app.get('/api/ice-servers', (req, res) => {
  res.json({ iceServers: ICE_SERVERS });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Room joining logic for specific chats
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    socket.to(roomId).emit('user_joined', { userId: socket.id });
  });

  // Handle standard chat messages
  socket.on('send_message', (data) => {
    const { roomId, message, senderId, timestamp } = data;
    // Broadcast to everyone in the room EXCEPT the sender
    socket.to(roomId).emit('receive_message', {
      messageId: Math.random().toString(36).substring(7),
      message,
      senderId,
      timestamp: timestamp || new Date().toISOString()
    });
  });

  // --- WebRTC Signaling Setup (Calls/Video/Audio) ---
  socket.on('webrtc_offer', (data) => {
    socket.to(data.roomId).emit('webrtc_offer', {
      sdp: data.sdp,
      senderId: socket.id
    });
  });

  socket.on('webrtc_answer', (data) => {
    socket.to(data.roomId).emit('webrtc_answer', {
      sdp: data.sdp,
      senderId: socket.id
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    socket.to(data.roomId).emit('webrtc_ice_candidate', {
      candidate: data.candidate,
      senderId: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 8080; // Standard for Fly.io / Render
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server listening on port ${PORT}`);
});
