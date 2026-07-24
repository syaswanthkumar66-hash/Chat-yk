const io = require("socket.io-client");
const socket = io("http://localhost:3000", { transports: ["websocket"] });
socket.on("connect", () => {
  socket.emit("get_online_users");
  socket.emit("register", "test_user");
});
socket.on("online_users", () => {
  console.log("got online users");
  socket.disconnect();
});
socket.on("disconnect", () => console.log("disconnected"));
