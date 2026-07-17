const { io } = require("socket.io-client");
const socket = io("http://127.0.0.1:3000", { transports: ["polling", "websocket"] });
socket.on("connect_error", (err) => {
  console.log("Connect error:", err.message);
});
socket.on("connect", () => {
  console.log("Connected!");
  process.exit(0);
});
