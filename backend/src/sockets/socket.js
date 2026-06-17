// src/socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import message_Model from "../model/message.model.js";
import room_Model from "../model/room.model.js"
import redis from "../config/redis.js";
import readReceipt_Model from "../model/readReceipt.model.js";
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
    
    // joins room //who all are live
    socket.on("join_room",async({room_id})=>{
      try {
        // Guard: if the socket is already in this room, do not re-join.
        // Re-joining causes Socket.IO to deliver subsequent io.to(room_id).emit()
        // calls multiple times to the same client, breaking the member count display.
        if (socket.rooms.has(room_id)) return;

        socket.join(room_id);
        
        const roomKey = `room:${room_id}:presence`;
        const memberData = user.username;
        // 1. Redis Operations
        const [, , members] = await redis
            .multi()
            .sadd(roomKey, memberData)
            .expire(roomKey, 180)
            .smembers(roomKey)
            .exec();

        io.to(room_id).emit("room_members", { room_id, members:members[1] });

        // 3. Fetch History
        const history = await message_Model.find({ room: room_id })
          .sort({ createdAt: -1 })
          .limit(30)
          .populate("sender", "username")
          .lean(); // as it is read only
        
        socket.emit("message_display", history.reverse());

    }catch (err) {
      console.error("Join Room Error:", err);
      socket.emit("error", { message: "Failed to join room properly." });
    }
    });
    //when ever the user leaves and switches form this room
    socket.on("switch_room",async(room_id)=>{
      try{
        // Remove user from the old room's Redis presence set
        const roomKey = `room:${room_id}:presence`;
        const memberData = user.username;
        const [,members]=await redis
        .multi()
        .srem(roomKey, memberData)
        .smembers(roomKey)
        .exec()
        // await redis.srem(roomKey, memberData);

        // Actually leave the socket room so no more events are received from it
        socket.leave(room_id);

        // Broadcast updated member list to EVERYONE remaining in the old room
        // const members = await redis.smembers(roomKey);
        io.to(room_id).emit("room_members", { room_id, members:members[1] });
      } catch(err){
        console.error("Switch Room Error:", err);
      }
    })

    //user actually leaves the room
    socket.on("leave_room",async(room_id)=>{
      try{
        await room_Model.updateOne(
          {_id:room_id},
          {
            $pull:{
              members:user.id
            }
          }
        );
        socket.leave(room_id);
        const roomKey = `room:${room_id}:presence`;
        const memberData =  user.username;
        const [, members] = await redis
          .multi()
          .srem(roomKey, user.username)
          .smembers(roomKey)
          .exec();
        io.to(room_id).emit("room_members", { room_id, members:members[1]});
      }
      catch(err){
        console.error("leave Room Error:", err);
        socket.emit("error", { message: "Failed to leave room properly." });
      }
    });

    //add a new message in chat
    socket.on("message_send", async ({ room_id, content, imageUrl }) => {
      try {
        // 1. Server-side Validation
        if ((!content || content.trim().length === 0) && !imageUrl) {
          return socket.emit("error", { message: "Message content cannot be empty." });
        }
        if (content && content.length > 1000) {
          return socket.emit("error", { message: "Message is too long (max 1000 characters)." });
        }

        // 2. Persist to MongoDB
        const newMessage = new message_Model({
          room: room_id,
          sender: socket.user.id,
          content: content || '',
          imageUrl: imageUrl || null
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
    socket.on("typing_start",({room_id})=>{
      socket.to(room_id).emit("is_typing",{
        username: socket.user.username, 
        id: socket.user.id
      });
    })
    socket.on("typing_end",({room_id})=>{
      socket.to(room_id).emit("stop_typing",{
        username: socket.user.username, 
        id: socket.user.id
      });
    })
  
    socket.on("read_message", async (room_id, message_id) => {
    try {
        const userId = socket.user.id;
        const update = await readReceipt_Model.findOneAndUpdate(
            { 
                room: room_id, 
                user: userId,
                $or: [
                    { lastReadMessageId: { $lt: message_id } },
                    { lastReadMessageId: { $exists: false } }
                ]
            },
            { $set: { lastReadMessageId: message_id } },
            { upsert: true, returnDocument: 'after' }
        );
        if (update) {
            socket.to(room_id).emit("readUpdate_message", {
                room_id,
                user_id: userId,
                lastReadMessageId: message_id
            });
        }
    } catch (err) {
        console.error("Read Receipt Error:", err);
    }
});

socket.on("disconnecting", async () => {
  try {
    // clone rooms before async operations
    const rooms = [...socket.rooms];

    for (const room_id of rooms) {

      // skip private socket room
      if (room_id === socket.id) continue;

      const roomKey = `room:${room_id}:presence`;

      // remove username from redis set
      const [,members]=await redis
        .multi()
        .srem(roomKey, user.username)
        .smembers(roomKey)
        .exec()

      // await redis.srem(roomKey, user.username);

      // // get updated members
      // const members = await redis.smembers(roomKey);

      // notify remaining users
      io.to(room_id).emit("room_members", {
        room_id,
        members:members[1]
      });
    }

  } catch (err) {
    console.error("Disconnecting Error:", err);
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