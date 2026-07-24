const io = require("socket.io-client");
const socket = io("http://localhost:3000", { transports: ["polling"] });
socket.on("connect", () => {
  console.log("Connected via polling");
  socket.emit("get_online_users");
});
socket.on("online_users", (data) => {
  console.log("Online users:", data);
  process.exit(0);
});
socket.on("connect_error", (err) => {
  console.error("Connect error:", err);
  process.exit(1);
});
socket.on("disconnect", () => {
  console.log("Disconnected");
});
