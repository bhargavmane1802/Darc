// src/socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import message_Model from "../model/message.model.js";
import room_Model from "../model/room.model.js"
import redis from "./config/redis.js";
let io;
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
    const user=socket.user;
    // joins room 
    socket.on("join_room",async({room_id})=>{
      try {
        socket.join(room_id);

        const roomKey = `room:${room_id}:presence`;
        const memberData = JSON.stringify({ id: user.id, username: user.username });

        // 1. Redis Operations
        await redis.sadd(roomKey, memberData);
        await redis.expire(roomKey, 86400);

        // 2. Fetch and Broadcast Members
        const membersRaw = await redis.smembers(roomKey);
        const members = membersRaw.map(m => JSON.parse(m));
        io.to(room_id).emit("room_members", { room_id, members });

        // 3. Fetch History
        const history = await message_Model.find({ room: room_id })
          .sort({ createdAt: -1 })
          .limit(30)
          .populate("sender", "username");
        
        socket.emit("message_display", history.reverse());

    } catch (err) {
      console.error("Join Room Error:", err);
      socket.emit("error", { message: "Failed to join room properly." });
    }
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
          sender: socket.user.id,
          content: content
        });

        await newMessage.save();
        await newMessage.populate("sender", "username");

        // 3. Broadcast to EVERYONE in the room
        io.to(room_id).emit("message_new", newMessage);

      } catch (err) {
        console.error("Message Save Error:", err);
        socket.emit("error", { message: "Failed to send message. Please try again." });
      }
    });
    socket.on("typing_start",(room_id)=>{
      socket.to(room_id).emit("is_typing",{
        username: socket.user.username, 
        id: socket.user.id
      });
    })
    socket.on("typing_end",(room_id)=>{
      socket.to(room_id).emit("stop_typing",{
        username: socket.user.username, 
        id: socket.user.id
      });
    })

    socket.on("disconnecting", async () => {
    // socket.rooms is a Set containing the socket ID and the rooms joined
    for (const room_id of socket.rooms) {
      if (room_id !== socket.id) { // Don't process the socket's private room
        try {
          const roomKey = `room:${room_id}:presence`;
          
          // Remove the user from the Redis Set
          // Note: Must match the exact string added in sadd
          await redis.srem(roomKey, JSON.stringify({ id: user.id, username: user.username }));

          const membersRaw = await redis.smembers(roomKey);
          const members = membersRaw.map(m => JSON.parse(m));

          socket.to(room_id).emit("room_members", { room_id, members });
        } catch (err) {
          console.error("Redis Leave Error:", err);
        }
      }
    }
  });

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