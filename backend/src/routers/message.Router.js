import { Router } from "express";
import { 
    messageCreateSocket,
    messageUpdateSocket,
    messageDeleteSocket,
    messageDisplaySocket,
    messageReadSocket
} from "../controllers/message.controller.js";
import { verifyRoom, checkSocketRoomMember } from "../middlewares/roomMember.middlware.js";
import upload from "../config/cloudinary.js";
import message_Model from "../model/message.model.js";
import redisClient from "../config/redis.js";

import { getIO } from "../sockets/socketInstance.js";
// Create the Redis-enabled message display handler once.
const messageDisplayHandler = messageDisplaySocket({
    message_Model,
    redis: redisClient,
    paginationSecret: process.env.MESSAGE_CURSOR_SECRET
});
const messageCreateHandler = messageCreateSocket({
    MessageModel: message_Model,
    redis: redisClient,
    getSocketIO: () => getIO(),
});
const messageUpdateHandler = messageUpdateSocket({
    MessageModel: message_Model,
    getSocketIO: () => getIO(),
    redis: redisClient
});

const messageRoutes = Router();
// HTTP Routes (commented out in favor of Socket.IO routes)
// messageRoutes.route("/:roomId/create").post(verifyRoom(), upload.single("image"), messageCreate());
// messageRoutes.route("/:roomId/update/:messageId").put(verifyRoom(), messageUpdate());
// messageRoutes.route("/:roomId/delete/:messageId").delete(verifyRoom(), messageDelete());
// messageRoutes.route("/:roomId/display/").get(verifyRoom(), messageDisplay());
export { messageRoutes };

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Routes for Message Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO Route Names / Events equivalent to HTTP Routes:
 * - POST   /:roomId/create             => "message:create" / "message:send"
 * - PUT    /:roomId/update/:messageId  => "message:update"
 * - DELETE /:roomId/delete/:messageId  => "message:delete"
 * - GET    /:roomId/display/           => "message:display"
 * - (Read) /:roomId/read/:messageId    => "message:read"
 */
export const MESSAGE_SOCKET_ROUTES = {
    CREATE: "message:create",
    SEND: "message:send",
    UPDATE: "message:update",
    DELETE: "message:delete",
    DISPLAY: "message:display",
    READ: "message:read",
};

/**
 * Socket Route: Equivalent to POST /:roomId/create
 * Middleware: verifyRoom
 */
export const messageCreateRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id || data?.room;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId || data?.sender;

        const authCheck = await checkSocketRoomMember(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message, status: authCheck.status });
            return;
        }

        return await await messageCreateHandler(
            data,
            socket,
            io,
            callback
        );
    } catch (err) {
        console.error("messageCreateRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to PUT /:roomId/update/:messageId
 * Middleware: verifyRoom
 */
export const messageUpdateRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id || data?.room;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId || data?.sender;

        const authCheck = await checkSocketRoomMember(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message, status: authCheck.status });
            return;
        }

        return await messageUpdateHandler(
            data,
            socket,
            io,
            callback
        );
    } catch (err) {
        console.error("messageUpdateRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to DELETE /:roomId/delete/:messageId
 * Middleware: verifyRoom
 */
export const messageDeleteRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id || data?.room;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId || data?.sender;

        const authCheck = await checkSocketRoomMember(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message, status: authCheck.status });
            return;
        }

        return await messageDeleteSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("messageDeleteRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to GET /:roomId/display/
 * Middleware: verifyRoom
 */

export const messageDisplayRoute = async (
    data = {},
    socket,
    io,
    callback
) => {
    try {
        const roomId = typeof data === "string"
            ? data
            : (
                data?.roomId ||
                data?.room_id ||
                data?.room
            );

        // Use the authenticated socket user.
        // Do not trust a user ID supplied by the client.
        const userId =
            socket?.user?.id ||
            socket?.user?._id;

        if (!roomId) {
            const response = {
                status: 400,
                message: "roomId is required"
            };

            if (typeof callback === "function") {
                return callback(response);
            }

            return socket?.emit("error", response);
        }

        if (!userId) {
            const response = {
                status: 401,
                message: "Authentication required"
            };

            if (typeof callback === "function") {
                return callback(response);
            }

            return socket?.emit("error", response);
        }

        // Keep your existing room-membership authorization.
        const authCheck = await checkSocketRoomMember(
            roomId,
            userId
        );

        if (!authCheck.authorized) {
            const response = {
                status: authCheck.status,
                message: authCheck.message
            };

            if (typeof callback === "function") {
                return callback(response);
            }

            return socket?.emit("error", response);
        }

        // Use the already-created Redis-enabled handler.
        return await messageDisplayHandler(
            data,
            socket,
            io,
            callback
        );

    } catch (err) {
        console.error("messageDisplayRoute error:", err);

        const response = {
            status: 500,
            message: "Failed to display messages"
        };

        if (typeof callback === "function") {
            return callback(response);
        }

        socket?.emit("error", response);
    }
};


/**
 * Socket Route: Equivalent to messageRead
 * Middleware: verifyRoom
 */
export const messageReadRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id || data?.room;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

        if (roomId && userId) {
            const authCheck = await checkSocketRoomMember(roomId, userId);
            if (!authCheck.authorized) {
                if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
                socket?.emit("error", { message: authCheck.message, status: authCheck.status });
                return;
            }
        }

        return await messageReadSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("messageReadRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Registers all message Socket.IO routes on a connected socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export const registerMessageSocketRoutes = (socket, io) => {
    // 1. Create / Send: POST /:roomId/create
    socket.on(MESSAGE_SOCKET_ROUTES.CREATE, (data, callback) => messageCreateRoute(data, socket, io, callback));
    socket.on(MESSAGE_SOCKET_ROUTES.SEND, (data, callback) => messageCreateRoute(data, socket, io, callback));
    socket.on("message_send", (data, callback) => messageCreateRoute(data, socket, io, callback));
    socket.on("create_message", (data, callback) => messageCreateRoute(data, socket, io, callback));

    // 2. Update: PUT /:roomId/update/:messageId
    socket.on(MESSAGE_SOCKET_ROUTES.UPDATE, (data, callback) => messageUpdateRoute(data, socket, io, callback));
    socket.on("update_message", (data, callback) => messageUpdateRoute(data, socket, io, callback));
    socket.on("message_update", (data, callback) => messageUpdateRoute(data, socket, io, callback));

    // 3. Delete: DELETE /:roomId/delete/:messageId
    socket.on(MESSAGE_SOCKET_ROUTES.DELETE, (data, callback) => messageDeleteRoute(data, socket, io, callback));
    socket.on("delete_message", (data, callback) => messageDeleteRoute(data, socket, io, callback));
    socket.on("message_delete", (data, callback) => messageDeleteRoute(data, socket, io, callback));

    // 4. Display: GET /:roomId/display/
    socket.on(MESSAGE_SOCKET_ROUTES.DISPLAY, (data, callback) => messageDisplayRoute(data, socket, io, callback));
    socket.on("display_message", (data, callback) => messageDisplayRoute(data, socket, io, callback));
    socket.on("message_display", (data, callback) => messageDisplayRoute(data, socket, io, callback));

    // 5. Read: read_message
    socket.on(MESSAGE_SOCKET_ROUTES.READ, (data, callback) => messageReadRoute(data, socket, io, callback));
    socket.on("read_message", (roomId, messageId) => messageReadRoute({ roomId, messageId }, socket, io));
};

// Aliases
export const messageSocketRouter = registerMessageSocketRoutes;
export const messageSocketRoutes = registerMessageSocketRoutes;
