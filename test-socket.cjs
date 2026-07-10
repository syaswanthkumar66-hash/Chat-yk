const io = require("socket.io-client");
const socket = io("http://localhost:3000", {
  transports: ["polling", "websocket"]
});

socket.on("connect", () => {
  console.log("Connected with id", socket.id);
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});
