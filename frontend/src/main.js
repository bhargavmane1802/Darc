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

//connection error
socket.on("connect_error",(err)=>{
  console.log(err.message);
  if(err.message=="Unauthorised"){
    alert("Session expired. Please log in again.");
  }
})

//displaying last 30 messages
socket.on("message_display",(chats)=>{
  console.log("these are the latest 30 chats of the room ")
  console.log(chats);
})
//create a new message
socket.emit("message_send",{room_id:"69cd4bbb89fa0be42b0ffb6e",content: "he hee hakuna matata"});

//some one sent a new message
socket.on("message_new",(newMessage)=>{
  console.log(`new message recived from ${newMessage.username}`);
  console.log(newMessage.content);
})

//updated message
socket.on("updated_message",(message)=>{
  console.log(`updated message recived ${message._id}`);
  console.log(message.content);
})

//deleted message
socket.on("delete_message",(mess_id)=>{
  console.log(`deleted message  ${mess_id}`);
})
//display journal entries htttp 

//create new journal entry
socket.on("create_journal",(journal)=>{
  console.log("new journal entry");
  console.log(journal);
})
//update jouirnal entry
socket.on("update_journal",({journal})=>{
  console.log("this was updated");
  console.log(journal);
})
//delete journal entry
socket.on("delete_journal",({entry_id})=>{
  console.log("this id journal entry was deleted");
  console.log(entry_id);
})

//currenty active memberes in a room
socket.on("room_members",(members)=>{
  console.log("these are the currently active members in the room");
  console.log(members);
})

//error 
socket.on("error",({message})=>{
  console.log(message);
})

socket.emit("typing_start",{room_id:"69cd4bbb89fa0be42b0ffb6e"})
socket.emit("typing_end",{room_id:"69cd4bbb89fa0be42b0ffb6e"})
socket.on("is_typing",({username,id})=>{
  console.log(username,id);
  console.log("is typing ");
})
socket.on("stop_typing",({username,id})=>{
  console.log(username,id);
  console.log("stoped typing ");
})
//listen for disconnect
socket.on("disconnect", () => {
  console.log("Disconnected from server");
});