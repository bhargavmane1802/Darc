// src/socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import message_Model from "../model/message.model";
import room_Model from "../model/room.model.js"
let io;
const room={};
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*", // replace with your frontend URL in production
      methods: ["GET", "POST"],
    },
  });

  //auth middleware 
  io.use((socket,next)=>{
    try{
      const token =socket.handshake.auth.token;
      if(!token){
        return next(new Error("Unauthorised: No token provided"));
      }
      const user =jwt.verify(token,process.env.Jwt_Key);
      socket.user=user;
      return next();
    }
    catch(err){
      console.error("Socket Auth Error:", err.message);
      next(new Error("Unauthorised"));
    }
  })

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.on("join_room",async({room_id})=>{
      socket.join(room_id);
      
      try{
        const history=await message_Model.find({room:room_id}).sort({createdAt:-1}).limit(30).populate("author","username");
        socket.emit("message-display",history.reverse());
      }
      catch(err){
        console.error(err);
      }

      if(!room[room_id])room[room_id]=[];
      const present=room[room_id].find(s=>{return s.id==socket.user.id});
      if(!present){
        room[room_id].push({
          id:socket.user.id,
          username:socket.user.username
        })
      }
      io.to(room_id).emit("room_members",{
        room_id:room_id,
        members:room[room_id]
      })
    });
    socket.on("message_send", async ({ room_id, content }) => {
      try {
        // 1. Server-side Validation
        if (!content || content.trim().length === 0) {
          return socket.emit("error", { message: "Message content cannot be empty." });
        }
        if (content.length > 1000) {
          return socket.emit("error", { message: "Message is too long (max 1000 characters)." });
        }

        // 2. Persist to MongoDB
        const newMessage = new message_Model({
          room: room_id,
          author: socket.user.id,
          content: content
        });

        await newMessage.save();
        await newMessage.populate("author", "username");

        // 3. Broadcast to EVERYONE in the room
        io.to(room_id).emit("message:new", newMessage);

      } catch (err) {
        console.error("Message Save Error:", err);
        socket.emit("error", { message: "Failed to send message. Please try again." });
      }
    });

    socket.on("disconnecting",()=>{
      socket.rooms.forEach(socket_room_id => {
        if(room[socket_room_id]){
          room[socket_room_id]=room[socket_room_id].filter((s)=>{return s.id!==socket.user.id});
        }
        socket.to(socket_room_id).emit("room_members",{
          room_id:socket_room_id,
          members:room[socket_room_id]
        })
      });
    })

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};