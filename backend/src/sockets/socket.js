// src/socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import message_Model from "../model/message.model.js";
import room_Model from "../model/room.model.js";
import redis from "../config/redis.js";
import readReceipt_Model from "../model/readReceipt.model.js";

// Socket.IO Router Registrars mirroring Express HTTP Routers
import { registerUserSocketRoutes } from "../routers/user.Router.js";
import { registerProfileSocketRoutes } from "../routers/profile.Router.js";
import { registerRoomSocketRoutes } from "../routers/room.Router.js";
import { registerJournalSocketRoutes } from "../routers/journal.Router.js";
import { registerMessageSocketRoutes } from "../routers/message.Router.js";
import { registerUploadSocketRoutes } from "../routers/upload.routes.js";

let io;

/**
 * Connection-level authentication middleware (equivalent to handshake auth).
 * Extracts JWT token from handshake auth, authorization header, or query.
 * Verifies token and attaches user to socket.user.
 * If no token is provided, allows connection for public routes (login/register).
 */
export const socketAuthMiddleware = (jwtLib = jwt) => (socket, next) => {
    try {
        const authHeader = socket.handshake?.headers?.authorization;
        const authToken = socket.handshake?.auth?.token;
        const queryToken = socket.handshake?.query?.token;

        let token = null;
        if (authToken) {
            token = authToken.startsWith("Bearer ") ? authToken.split(" ")[1] : authToken;
        } else if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        } else if (queryToken) {
            token = queryToken.startsWith("Bearer ") ? queryToken.split(" ")[1] : queryToken;
        }

        if (token) {
            const user = jwtLib.verify(token, process.env.Jwt_Key);
            socket.user = user;
            return next();
        }

        // Allow connection without token so public user routes (login, register, verify) can proceed.
        // Protected routes are gated by requireSocketAuth.
        return next();
    } catch (err) {
        console.error("Socket Auth Error:", err.message);
        next(new Error("Unauthorised"));
    }
};

/**
 * Public socket events accessible without authentication.
 * Mirrors unauthenticated Express routes: app.use("/user", userRoutes)
 */
export const PUBLIC_SOCKET_EVENTS = new Set([
    // User routes
    "user:login", "login", "user_login",
    "user:register", "register", "user_register",
    "user:verify", "user:verify_email", "verify_email", "user_verify",
    // Connection / System events
    "disconnecting", "disconnect", "error"
]);

/**
 * Packet-level authentication guard mirroring Express middleware:
 * app.use("/auth/", validate_auth())
 * Enforces valid socket.user for all non-public events.
 */
export const requireSocketAuth = (socket) => {
    socket.use(([event, data, callback], next) => {
        if (PUBLIC_SOCKET_EVENTS.has(event)) {
            return next();
        }

        if (!socket.user) {
            const errPayload = { status: 401, message: "unauthorized user" };
            if (typeof callback === "function") callback(errPayload);
            socket.emit("error", errPayload);
            return next(new Error("unauthorized user"));
        }

        next();
    });
};

export const handleJoinRoom = ({ MessageModel = message_Model, redisClient = redis } = {}) =>
    async ({ room_id }, socket, io) => {
        try {
            // Guard: if the socket is already in this room, do not re-join.
            // Re-joining causes Socket.IO to deliver subsequent io.to(room_id).emit()
            // calls multiple times to the same client, breaking the member count display.
            if (socket.rooms.has(room_id)) return;

            socket.join(room_id);

            const roomKey = `room:${room_id}:presence`;
            const memberData = socket.user.username;
            // 1. Redis Operations
            const [, , members] = await redisClient
                .multi()
                .sadd(roomKey, memberData)
                .expire(roomKey, 180)
                .smembers(roomKey)
                .exec();

            io.to(room_id).emit("room_members", { room_id, members: members[1] });

            // 3. Fetch History
            const history = await MessageModel.find({ room: room_id })
                .sort({ createdAt: -1 })
                .limit(30)
                .populate("sender", "username imageUrl avatar")
                .lean(); // as it is read only

            socket.emit("message_display", history.reverse());
        } catch (err) {
            console.error("Join Room Error:", err);
            socket.emit("error", { message: "Failed to join room properly." });
        }
    };

export const handleSwitchRoom = ({ redisClient = redis } = {}) =>
    async (room_id, socket, io) => {
        try {
            // Remove user from the old room's Redis presence set
            const roomKey = `room:${room_id}:presence`;
            const memberData = socket.user.username;
            const [, members] = await redisClient
                .multi()
                .srem(roomKey, memberData)
                .smembers(roomKey)
                .exec();

            // Actually leave the socket room so no more events are received from it
            socket.leave(room_id);

            // Broadcast updated member list to EVERYONE remaining in the old room
            io.to(room_id).emit("room_members", { room_id, members: members[1] });
        } catch (err) {
            console.error("Switch Room Error:", err);
        }
    };

export const handleLeaveRoom = ({ RoomModel = room_Model, redisClient = redis } = {}) =>
    async (room_id, socket, io) => {
        try {
            await RoomModel.updateOne(
                { _id: room_id },
                { $pull: { members: socket.user.id } }
            );
            socket.leave(room_id);
            const roomKey = `room:${room_id}:presence`;
            const [, members] = await redisClient
                .multi()
                .srem(roomKey, socket.user.username)
                .smembers(roomKey)
                .exec();
            io.to(room_id).emit("room_members", { room_id, members: members[1] });
        } catch (err) {
            console.error("leave Room Error:", err);
            socket.emit("error", { message: "Failed to leave room properly." });
        }
    };

export const handleMessageSend = ({ MessageModel = message_Model } = {}) =>
    async ({ room_id, content, imageUrl }, socket, io) => {
        try {
            // 1. Server-side Validation
            if ((!content || content.trim().length === 0) && !imageUrl) {
                return socket.emit("error", { message: "Message content cannot be empty." });
            }
            if (content && content.length > 1000) {
                return socket.emit("error", { message: "Message is too long (max 1000 characters)." });
            }

            // 2. Persist to MongoDB
            const newMessage = new MessageModel({
                room: room_id,
                sender: socket.user.id,
                content: content || '',
                imageUrl: imageUrl || null
            });

            await newMessage.save();
            await newMessage.populate("sender", "username imageUrl avatar");

            // 3. Broadcast to EVERYONE in the room
            io.to(room_id).emit("message_new", newMessage);
        } catch (err) {
            console.error("Message Save Error:", err);
            socket.emit("error", { message: "Failed to send message. Please try again." });
        }
    };

export const handleTypingStart = () => ({ room_id }, socket) => {
    socket.to(room_id).emit("is_typing", { username: socket.user.username, id: socket.user.id });
};

export const handleTypingEnd = () => ({ room_id }, socket) => {
    socket.to(room_id).emit("stop_typing", { username: socket.user.username, id: socket.user.id });
};

export const handleReadMessage = ({ ReadReceiptModel = readReceipt_Model } = {}) =>
    async (room_id, message_id, socket) => {
        try {
            const userId = socket.user.id;
            const update = await ReadReceiptModel.findOneAndUpdate(
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
    };

export const handleDisconnecting = ({ redisClient = redis } = {}) =>
    async (socket, io) => {
        try {
            // clone rooms before async operations
            const rooms = [...socket.rooms];

            for (const room_id of rooms) {
                // skip private socket room
                if (room_id === socket.id) continue;

                const roomKey = `room:${room_id}:presence`;

                // remove username from redis set
                const [, members] = await redisClient
                    .multi()
                    .srem(roomKey, socket.user.username)
                    .smembers(roomKey)
                    .exec();

                // notify remaining users
                io.to(room_id).emit("room_members", { room_id, members: members[1] });
            }
        } catch (err) {
            console.error("Disconnecting Error:", err);
        }
    };

/**
 * Initializes Socket.IO with all middleware and routes matching Express HTTP flow.
 * Request / Route Flow:
 *   1. Connection Auth (handshake token verification)
 *   2. Public Routes: registerUserSocketRoutes (mirroring app.use("/user", userRoutes))
 *   3. Auth Guard: requireSocketAuth (mirroring app.use("/auth/", validate_auth()))
 *   4. Protected Routes:
 *      - registerProfileSocketRoutes (mirroring app.use("/auth/profile", profileRoutes))
 *      - registerRoomSocketRoutes (mirroring app.use("/auth/room", roomRoutes))
 *      - registerJournalSocketRoutes (mirroring app.use("/auth/journal", journalRoutes))
 *      - registerMessageSocketRoutes (mirroring app.use("/auth/message", messageRoutes))
 *      - registerUploadSocketRoutes (mirroring app.use("/auth/upload", uploadRouter))
 *   5. Core Real-time Room & Messaging handlers
 */
export const initSocket = (server) => {
    io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET", "POST"] } });

    // Step 1: Handshake Authentication Middleware
    io.use(socketAuthMiddleware());

    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        // Step 2: Public User Routes (/user equivalent: login, register, verify)
        registerUserSocketRoutes(socket, io);

        // Step 3: Auth Protection Guard (/auth/ equivalent: validate_auth)
        requireSocketAuth(socket);

        // Step 4: Protected Routers (/auth/* equivalents)
        registerProfileSocketRoutes(socket, io);
        registerRoomSocketRoutes(socket, io);
        registerJournalSocketRoutes(socket, io);
        registerMessageSocketRoutes(socket, io);
        registerUploadSocketRoutes(socket, io);

        // Step 5: Real-time room presence and messaging events
        socket.on("join_room", (data) => handleJoinRoom()(data, socket, io));
        socket.on("switch_room", (room_id) => handleSwitchRoom()(room_id, socket, io));
        socket.on("leave_room", (room_id) => handleLeaveRoom()(room_id, socket, io));
        socket.on("typing_start", (data) => handleTypingStart()(data, socket));
        socket.on("typing_end", (data) => handleTypingEnd()(data, socket));
        socket.on("disconnecting", () => handleDisconnecting()(socket, io));
        socket.on("disconnect", () => console.log("User disconnected:", socket.id));
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};
