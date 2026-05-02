import { io } from "socket.io-client";
// connect to your backend
const socket = io("http://localhost:8080");

// listen for connection
socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
});

// optional: listen for disconnect
socket.on("disconnect", () => {
  console.log("Disconnected from server");
});