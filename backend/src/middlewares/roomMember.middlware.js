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
// Socket.IO Equivalent Middleware: verifyRoom
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a user is a member of the given room.
 * @param {string} roomId
 * @param {string} userId
 * @param {object} RoomModel
 * @returns {Promise<{ authorized: boolean, status: number, message?: string }>}
 */
export const checkSocketRoomMember = async (roomId, userId, RoomModel = room_Model) => {
    try {
        if (!roomId || !userId) {
            return {
                authorized: false,
                status: 403,
                message: "insufficient information",
            };
        }

        const room = await RoomModel.exists({ _id: roomId, members: userId });
        if (!room) {
            return {
                authorized: false,
                status: 403,
                message: " room id invalid or u are not he member in the room",
            };
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

                const check = await checkSocketRoomMember(roomId, userId, RoomModel);
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

            const check = await checkSocketRoomMember(roomId, userId, RoomModel);
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
