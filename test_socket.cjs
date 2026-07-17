const { io } = require("socket.io-client");
const socket = io("http://localhost:3000", { transports: ["polling", "websocket"] });
socket.on("connect", () => { console.log("connected"); process.exit(0); });
socket.on("connect_error", (err) => { console.error("connect error:", err); process.exit(1); });
