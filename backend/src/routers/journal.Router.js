import { Router } from "express";
import { 
    createEntries, 
    displayEntries, 
    deleteEntries, 
    aiResponses, 
    manageReaction,
    createEntriesSocket,
    displayEntriesSocket,
    deleteEntriesSocket,
    aiResponsesSocket,
    manageReactionSocket
} from "../controllers/journal.controller.js";
import { verifyRoom } from "../middlewares/roomMember.middlware.js";
import aiRateLimit from "../middlewares/aiRateLimit.middleware.js";
import upload from "../config/cloudinary.js";
import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
import redis from "../config/redis.js";

const journalRoutes = Router();
// HTTP Routes (commented out in favor of Socket.IO routes)
// journalRoutes.route("/:roomId/create").post(verifyRoom(), upload.single("image"), createEntries());
// journalRoutes.route("/:roomId/display").get(verifyRoom(), displayEntries());
// journalRoutes.route("/:roomId/delete/:journalId").delete(verifyRoom(), deleteEntries());
// journalRoutes.route("/:roomId/aiResponse/:journalId").get(verifyRoom(), aiRateLimit(), aiResponses());
// journalRoutes.route("/:roomId/reaction/:journalId").patch(verifyRoom(), manageReaction());
export { journalRoutes };

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Routes for Journal Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO Route Names / Events equivalent to HTTP Routes:
 * - POST   /:roomId/create               => "journal:create"
 * - GET    /:roomId/display              => "journal:display"
 * - DELETE /:roomId/delete/:journalId    => "journal:delete"
 * - GET    /:roomId/aiResponse/:journalId=> "journal:ai_response"
 * - PATCH  /:roomId/reaction/:journalId  => "journal:reaction"
 */
export const JOURNAL_SOCKET_ROUTES = {
    CREATE: "journal:create",
    DISPLAY: "journal:display",
    DELETE: "journal:delete",
    AI_RESPONSE: "journal:ai_response",
    REACTION: "journal:reaction",
};

/**
 * Helper: Socket.IO equivalent of verifyRoom middleware
 */
const verifySocketRoom = async (roomId, userId, RoomModel = room_Model) => {
    if (!roomId || !userId) {
        return { authorized: false, status: 403, message: "insufficient information" };
    }
    const room = await RoomModel.exists({ _id: roomId, members: userId });
    if (!room) {
        return { authorized: false, status: 403, message: " room id invalid or u are not he member in the room" };
    }
    return { authorized: true };
};

/**
 * Helper: Socket.IO equivalent of aiRateLimit middleware
 */
const checkSocketAiRateLimit = async (userId, redisClient = redis) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const key = `ratelimit:${userId}:${today}`;
        const limit = 10;
        const count = await redisClient.incr(key);
        if (count === 1) {
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const ttlSeconds = Math.floor((midnight - now) / 1000);
            await redisClient.expire(key, ttlSeconds);
        }
        if (count > limit) {
            return {
                allowed: false,
                status: 429,
                message: "Daily AI feedback limit reached. Try again tomorrow!",
                limit,
                remaining: 0
            };
        }
        return { allowed: true, remaining: Math.max(0, limit - count) };
    } catch (err) {
        console.error("Socket AI Rate Limit Error:", err);
        return { allowed: true };
    }
};

/**
 * Socket Route: Equivalent to POST /:roomId/create
 * Middleware: verifyRoom
 */
export const journalCreateRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

        const authCheck = await verifySocketRoom(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message });
            return;
        }

        return await createEntriesSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("journalCreateRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to GET /:roomId/display
 * Middleware: verifyRoom
 */
export const journalDisplayRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = typeof data === "string" ? data : (data?.roomId || data?.room_id);
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

        const authCheck = await verifySocketRoom(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message });
            return;
        }

        return await displayEntriesSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("journalDisplayRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to DELETE /:roomId/delete/:journalId
 * Middleware: verifyRoom
 */
export const journalDeleteRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

        const authCheck = await verifySocketRoom(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message });
            return;
        }

        return await deleteEntriesSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("journalDeleteRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to GET /:roomId/aiResponse/:journalId
 * Middleware: verifyRoom, aiRateLimit
 */
export const journalAiResponseRoute = async (data = {}, socket, io, callback) => {
    try {
        const roomId = data?.roomId || data?.room_id;
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

        const authCheck = await verifySocketRoom(roomId, userId);
        if (!authCheck.authorized) {
            if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
            socket?.emit("error", { message: authCheck.message });
            return;
        }

        const rateLimitCheck = await checkSocketAiRateLimit(userId);
        if (!rateLimitCheck.allowed) {
            if (typeof callback === "function") callback({ status: rateLimitCheck.status, message: rateLimitCheck.message, limit: rateLimitCheck.limit, remaining: 0 });
            socket?.emit("error", { message: rateLimitCheck.message, limit: rateLimitCheck.limit, remaining: 0 });
            return;
        }

        if (rateLimitCheck.remaining !== undefined) {
            socket?.emit("rate_limit_status", { remaining: rateLimitCheck.remaining, limit: rateLimitCheck.limit || 10 });
        }

        return await aiResponsesSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("journalAiResponseRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to PATCH /:roomId/reaction/:journalId
 * Middleware: verifyRoom
 */
export const journalReactionRoute = async (data = {}, socket, io, callback) => {
    try {
        const journalId = data?.journalId || data?.journal_id || data?.entryId || data?.entry_id;
        const userId = socket?.user?.id || socket?.user?._id || data?.userId || data?.user_id;
        let roomId = data?.roomId || data?.room_id;

        if (!roomId && journalId) {
            const entry = await journal_Model.findById(journalId).select("room");
            if (entry) roomId = entry.room?.toString();
        }

        if (roomId) {
            const authCheck = await verifySocketRoom(roomId, userId);
            if (!authCheck.authorized) {
                if (typeof callback === "function") callback({ status: authCheck.status, message: authCheck.message });
                socket?.emit("error", { message: authCheck.message });
                return;
            }
        }

        return await manageReactionSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("journalReactionRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Registers all journal Socket.IO routes on a connected socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export const registerJournalSocketRoutes = (socket, io) => {
    // 1. Create Route: POST /:roomId/create
    socket.on(JOURNAL_SOCKET_ROUTES.CREATE, (data, callback) => journalCreateRoute(data, socket, io, callback));
    socket.on("create_journal", (data, callback) => journalCreateRoute(data, socket, io, callback));
    socket.on("journal_create", (data, callback) => journalCreateRoute(data, socket, io, callback));

    // 2. Display Route: GET /:roomId/display
    socket.on(JOURNAL_SOCKET_ROUTES.DISPLAY, (data, callback) => journalDisplayRoute(data, socket, io, callback));
    socket.on("display_journal", (data, callback) => journalDisplayRoute(data, socket, io, callback));
    socket.on("journal_display", (data, callback) => journalDisplayRoute(data, socket, io, callback));

    // 3. Delete Route: DELETE /:roomId/delete/:journalId
    socket.on(JOURNAL_SOCKET_ROUTES.DELETE, (data, callback) => journalDeleteRoute(data, socket, io, callback));
    socket.on("delete_journal", (data, callback) => journalDeleteRoute(data, socket, io, callback));
    socket.on("journal_delete", (data, callback) => journalDeleteRoute(data, socket, io, callback));

    // 4. AI Response Route: GET /:roomId/aiResponse/:journalId
    socket.on(JOURNAL_SOCKET_ROUTES.AI_RESPONSE, (data, callback) => journalAiResponseRoute(data, socket, io, callback));
    socket.on("journal:aiResponse", (data, callback) => journalAiResponseRoute(data, socket, io, callback));
    socket.on("ai_response", (data, callback) => journalAiResponseRoute(data, socket, io, callback));
    socket.on("journal_ai_response", (data, callback) => journalAiResponseRoute(data, socket, io, callback));

    // 5. Reaction Route: PATCH /:roomId/reaction/:journalId
    socket.on(JOURNAL_SOCKET_ROUTES.REACTION, (data, callback) => journalReactionRoute(data, socket, io, callback));
    socket.on("reaction_journal", (data, callback) => journalReactionRoute(data, socket, io, callback));
    socket.on("journal_reaction", (data, callback) => journalReactionRoute(data, socket, io, callback));
};

// Aliases
export const journalSocketRouter = registerJournalSocketRoutes;
export const journalSocketRoutes = registerJournalSocketRoutes;
