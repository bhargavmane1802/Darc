import { io } from "socket.io-client";
// connect to your backend
const token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5Y2Q1MWE4ZjRmMzgxMzgzZjM1OWNhYSIsInVzZXJuYW1lIjoieWFzaCIsImlhdCI6MTc3NzkwNTM3OCwiZXhwIjoxNzc3OTA4OTc4fQ.ETXTUrfBGLa2h-3CEFFsbM0-D3qMHRlmpotcaWQJFdo";
const socket = io("http://localhost:8080", 
  {auth:
    {token: token}
  }
);


// listen for connection
socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
  socket.emit("join_room",{room_id:"69cd4bbb89fa0be42b0ffb6e"})
});
socket.on("connect_error",(err)=>{
  console.log(err.message);
  if(err.message=="Unauthorised"){
    alert("Session expired. Please log in again.");
  }
})
socket.on("create_journal",(res)=>{
  console.log(res);
})
socket.on("room_members",(res)=>{
  console.log(res);
})

// optional: listen for disconnect
socket.on("disconnect", () => {
  console.log("Disconnected from server");
});