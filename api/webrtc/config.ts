export default function handler(req, res) {
  res.status(200).json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { 
        urls: process.env.TURN_SERVER_URL || 'turn:your-turn-server.com', 
        username: process.env.TURN_SERVER_USERNAME || 'user', 
        credential: process.env.TURN_SERVER_PASSWORD || 'password' 
      }
    ]
  });
}
