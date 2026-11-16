import { Router } from "express";
import { 
    create, 
    join, 
    remove, 
    myRooms,
    createRoomSocket,
    joinRoomSocket,
    removeRoomSocket,
    myRoomsSocket
} from "../controllers/room.controller.js";

const roomRoutes = Router();
// HTTP Routes (commented out in favor of Socket.IO routes)
// roomRoutes.route("/my-rooms").get(myRooms());
// roomRoutes.route("/create").post(create());
// roomRoutes.route("/join/:inviteCode").get(join());
// roomRoutes.route("/remove/:name").delete(remove());
export { roomRoutes };

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Routes for Room Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO Route Names / Events equivalent to HTTP Routes:
 * - GET    /my-rooms           => "room:my_rooms" / "room:list"
 * - POST   /create             => "room:create"
 * - GET    /join/:inviteCode   => "room:join" / "room:join_by_code"
 * - DELETE /remove/:name       => "room:remove" / "room:delete"
 */
export const ROOM_SOCKET_ROUTES = {
    MY_ROOMS: "room:my_rooms",
    LIST: "room:list",
    CREATE: "room:create",
    JOIN: "room:join",
    JOIN_BY_CODE: "room:join_by_code",
    REMOVE: "room:remove",
    DELETE: "room:delete",
};

/**
 * Socket Route: Equivalent to GET /my-rooms
 */
export const roomMyRoomsRoute = async (data = {}, socket, io, callback) => {
    try {
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
        if (!userId) {
            if (typeof callback === "function") callback({ status: 401, message: "Unauthorized: user id missing" });
            socket?.emit("error", { message: "Unauthorized: user id missing", status: 401 });
            return;
        }

        return await myRoomsSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("roomMyRoomsRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to POST /create
 */
export const roomCreateRoute = async (data = {}, socket, io, callback) => {
    try {
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
        if (!userId) {
            if (typeof callback === "function") callback({ status: 401, message: "Unauthorized: user id missing" });
            socket?.emit("error", { message: "Unauthorized: user id missing", status: 401 });
            return;
        }

        return await createRoomSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("roomCreateRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to GET /join/:inviteCode
 */
export const roomJoinRoute = async (data = {}, socket, io, callback) => {
    try {
        const inviteCode = typeof data === "string" ? data : (data?.inviteCode || data?.invite_code);
        if (!inviteCode) {
            if (typeof callback === "function") callback({ status: 404, message: "invite Code is missing" });
            socket?.emit("error", { message: "invite Code is missing", status: 404 });
            return;
        }

        return await joinRoomSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("roomJoinRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Socket Route: Equivalent to DELETE /remove/:name
 */
export const roomRemoveRoute = async (data = {}, socket, io, callback) => {
    try {
        const name = typeof data === "string" ? data : (data?.name || data?.roomName);
        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

        if (!name) {
            if (typeof callback === "function") callback({ status: 400, message: "Missing room name" });
            socket?.emit("error", { message: "Missing room name", status: 400 });
            return;
        }

        if (!userId) {
            if (typeof callback === "function") callback({ status: 401, message: "Unauthorized: user id missing" });
            socket?.emit("error", { message: "Unauthorized: user id missing", status: 401 });
            return;
        }

        return await removeRoomSocket()(data, socket, io, callback);
    } catch (err) {
        console.error("roomRemoveRoute error:", err);
        if (typeof callback === "function") callback({ status: 500, message: err.message });
        socket?.emit("error", { message: err.message });
    }
};

/**
 * Registers all room Socket.IO routes on a connected socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export const registerRoomSocketRoutes = (socket, io) => {
    // 1. My Rooms: GET /my-rooms
    socket.on(ROOM_SOCKET_ROUTES.MY_ROOMS, (data, callback) => roomMyRoomsRoute(data, socket, io, callback));
    socket.on(ROOM_SOCKET_ROUTES.LIST, (data, callback) => roomMyRoomsRoute(data, socket, io, callback));
    socket.on("my_rooms", (data, callback) => roomMyRoomsRoute(data, socket, io, callback));
    socket.on("get_my_rooms", (data, callback) => roomMyRoomsRoute(data, socket, io, callback));

    // 2. Create Room: POST /create
    socket.on(ROOM_SOCKET_ROUTES.CREATE, (data, callback) => roomCreateRoute(data, socket, io, callback));
    socket.on("create_room", (data, callback) => roomCreateRoute(data, socket, io, callback));
    socket.on("room_create", (data, callback) => roomCreateRoute(data, socket, io, callback));

    // 3. Join Room: GET /join/:inviteCode
    socket.on(ROOM_SOCKET_ROUTES.JOIN, (data, callback) => roomJoinRoute(data, socket, io, callback));
    socket.on(ROOM_SOCKET_ROUTES.JOIN_BY_CODE, (data, callback) => roomJoinRoute(data, socket, io, callback));
    socket.on("join_room_by_code", (data, callback) => roomJoinRoute(data, socket, io, callback));
    socket.on("room_join", (data, callback) => roomJoinRoute(data, socket, io, callback));

    // 4. Remove Room: DELETE /remove/:name
    socket.on(ROOM_SOCKET_ROUTES.REMOVE, (data, callback) => roomRemoveRoute(data, socket, io, callback));
    socket.on(ROOM_SOCKET_ROUTES.DELETE, (data, callback) => roomRemoveRoute(data, socket, io, callback));
    socket.on("remove_room", (data, callback) => roomRemoveRoute(data, socket, io, callback));
    socket.on("room_remove", (data, callback) => roomRemoveRoute(data, socket, io, callback));
    socket.on("delete_room", (data, callback) => roomRemoveRoute(data, socket, io, callback));
};

// Aliases
export const roomSocketRouter = registerRoomSocketRoutes;
export const roomSocketRoutes = registerRoomSocketRoutes;
