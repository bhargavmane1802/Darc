import room_Model from "../model/room.model.js";

const verifyRoom = (RoomModel = room_Model) => async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { id } = req.user;
        if (!roomId || !id) return res.status(403).json({ message: "insufficient information" });
        const room = await RoomModel.exists({ _id: roomId, members: id });
        if (!room) return res.status(403).json({ message: " room id invalid or u are not he member in the room" });
        return next();
    }
    catch (err) {
        console.log("Failed to verifyRoom");
        err.message = "Failed verifyRoom";
        next(err);
    }
};
export { verifyRoom };

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Middleware: verifyRoom (with per-socket TTL cache)
// ─────────────────────────────────────────────────────────────────────────────

const ROOM_MEMBER_CACHE_TTL_MS = Math.max(
    Number(process.env.ROOM_MEMBER_CACHE_TTL_MS) || 60_000,
    1_000
);

// Process-wide invalidation watermarks so leave_room / room:remove invalidate
// cached membership immediately across all open sockets (including multi-tab).
const roomInvalidatedAt = new Map();   // roomId -> timestampMs
const memberInvalidatedAt = new Map(); // `${userId}:${roomId}` -> timestampMs

const pruneInvalidationMap = (map, now) => {
    if (map.size < 500) return;
    const cutoff = now - ROOM_MEMBER_CACHE_TTL_MS;
    for (const [key, ts] of map.entries()) {
        if (ts < cutoff) map.delete(key);
    }
};

const getVerifiedRoomsMap = (socket) => {
    if (!socket || typeof socket !== "object") return null;
    if (!socket.data || typeof socket.data !== "object") {
        socket.data = {};
    }
    if (!(socket.data.verifiedRooms instanceof Map)) {
        socket.data.verifiedRooms = new Map();
    }
    return socket.data.verifiedRooms;
};

/**
 * Invalidates cached room membership for a specific user in a room (e.g. leave_room).
 */
export const invalidateSocketRoomMembership = (roomId, userId, socket = null) => {
    if (!roomId || !userId) return;
    const now = Date.now();
    const cacheKey = `${String(userId)}:${String(roomId)}`;
    memberInvalidatedAt.set(cacheKey, now);
    pruneInvalidationMap(memberInvalidatedAt, now);

    const verifiedRooms = socket?.data?.verifiedRooms;
    if (verifiedRooms instanceof Map) {
        verifiedRooms.delete(cacheKey);
    }
};

/**
 * Invalidates cached room membership for an entire room across all sockets (e.g. room:remove).
 */
export const invalidateRoomMembershipCache = (roomId, socket = null) => {
    if (!roomId) return;
    const now = Date.now();
    const roomKey = String(roomId);
    roomInvalidatedAt.set(roomKey, now);
    pruneInvalidationMap(roomInvalidatedAt, now);

    const verifiedRooms = socket?.data?.verifiedRooms;
    if (verifiedRooms instanceof Map) {
        const suffix = `:${roomKey}`;
        for (const key of verifiedRooms.keys()) {
            if (key.endsWith(suffix)) verifiedRooms.delete(key);
        }
    }
};

/**
 * Checks if a user is a member of the given room.
 * When `socket` is provided, caches positive membership on `socket.data.verifiedRooms`
 * with a TTL (default 60s) and honors immediate invalidation on leave_room / room:remove.
 * @param {string} roomId
 * @param {string} userId
 * @param {object} [RoomModel]
 * @param {object} [socket]
 * @returns {Promise<{ authorized: boolean, status: number, message?: string, cached?: boolean }>}
 */
export const checkSocketRoomMember = async (roomId, userId, RoomModel = room_Model, socket = null) => {
    try {
        // Support calling checkSocketRoomMember(roomId, userId, socket) directly
        if (RoomModel && typeof RoomModel.exists !== "function" && typeof RoomModel.emit === "function") {
            socket = RoomModel;
            RoomModel = room_Model;
        }
        const Model = RoomModel || room_Model;

        if (!roomId || !userId) {
            return {
                authorized: false,
                status: 403,
                message: "insufficient information",
            };
        }

        const roomKey = String(roomId);
        const userKey = String(userId);
        const cacheKey = `${userKey}:${roomKey}`;
        const verifiedRooms = getVerifiedRoomsMap(socket);

        if (verifiedRooms) {
            const now = Date.now();
            const entry = verifiedRooms.get(cacheKey);
            if (entry) {
                const roomRevoked = roomInvalidatedAt.get(roomKey) || 0;
                const memberRevoked = memberInvalidatedAt.get(cacheKey) || 0;
                if (
                    entry.expiresAt > now &&
                    entry.verifiedAt > roomRevoked &&
                    entry.verifiedAt > memberRevoked
                ) {
                    return {
                        authorized: true,
                        status: 200,
                        cached: true,
                    };
                }
                verifiedRooms.delete(cacheKey);
            }
        }

        const checkStartedAt = Date.now();
        const room = await Model.exists({ _id: roomId, members: userId });
        if (!room) {
            return {
                authorized: false,
                status: 403,
                message: " room id invalid or u are not he member in the room",
            };
        }

        if (verifiedRooms) {
            // Only cache if no revocation occurred while the DB query was in flight
            const roomRevoked = roomInvalidatedAt.get(roomKey) || 0;
            const memberRevoked = memberInvalidatedAt.get(cacheKey) || 0;
            if (checkStartedAt > roomRevoked && checkStartedAt > memberRevoked) {
                verifiedRooms.set(cacheKey, {
                    verifiedAt: checkStartedAt,
                    expiresAt: checkStartedAt + ROOM_MEMBER_CACHE_TTL_MS,
                });
            }
        }

        return {
            authorized: true,
            status: 200,
        };
    } catch (err) {
        console.error("Failed to checkSocketRoomMember:", err);
        return {
            authorized: false,
            status: 500,
            message: "Failed verifyRoom",
        };
    }
};

/**
 * Socket.IO middleware for verifying room membership.
 * Can be used:
 * 1. As an event wrapper: socket.on("room_event", verifyRoomSocket()(handler));
 * 2. As an inline middleware: await verifyRoomSocket()(data, socket, next);
 */
export const verifyRoomSocket = (RoomModel = room_Model) => {
    return (dataOrHandler, maybeSocket, maybeIo, maybeCallback) => {
        // Pattern 1: Handler wrapper -> verifyRoomSocket()(handler)
        if (typeof dataOrHandler === "function") {
            const handler = dataOrHandler;
            return async (data, socket, io, callback) => {
                const roomId = typeof data === "string" ? data : (data?.roomId || data?.room_id || data?.room);
                const userId = socket?.user?.id || socket?.user?._id || data?.userId || data?.id;

                const check = await checkSocketRoomMember(roomId, userId, RoomModel, socket);
                if (!check.authorized) {
                    if (typeof callback === "function") {
                        return callback({ status: check.status, message: check.message });
                    }
                    socket?.emit("error", { message: check.message, status: check.status });
                    return;
                }

                return await handler(data, socket, io, callback);
            };
        }

        // Pattern 2: Middleware execution -> verifyRoomSocket()(data, socket, next)
        const data = dataOrHandler;
        const socket = maybeSocket;
        const next = typeof maybeIo === "function" ? maybeIo : maybeCallback;

        return (async () => {
            const roomId = typeof data === "string" ? data : (data?.roomId || data?.room_id || data?.room);
            const userId = socket?.user?.id || socket?.user?._id || data?.userId || data?.id;

            const check = await checkSocketRoomMember(roomId, userId, RoomModel, socket);
            if (!check.authorized) {
                if (typeof maybeCallback === "function") {
                    maybeCallback({ status: check.status, message: check.message });
                }
                socket?.emit("error", { message: check.message, status: check.status });
                if (typeof next === "function") next(new Error(check.message));
                return check;
            }

            if (typeof next === "function") next();
            return check;
        })();
    };
};

/**
 * Socket.IO packet-level middleware to verify room membership on events that contain roomId.
 * Usage: socket.use(socketRoomMemberPacket())
 */
export const socketRoomMemberPacket = (RoomModel = room_Model) => async ([event, data, callback], next) => {
    const roomId = data?.roomId || data?.room_id || data?.room;
    const userId = data?.userId || data?.id;

    // If packet carries a roomId, verify room membership
    if (roomId && userId) {
        const check = await checkSocketRoomMember(roomId, userId, RoomModel);
        if (!check.authorized) {
            if (typeof callback === "function") callback({ status: check.status, message: check.message });
            return next(new Error(check.message));
        }
    }
    next();
};

// Aliases
export const socketVerifyRoom = verifyRoomSocket;
export const roomMemberSocketMiddleware = verifyRoomSocket;
export const verifySocketRoom = checkSocketRoomMember;
