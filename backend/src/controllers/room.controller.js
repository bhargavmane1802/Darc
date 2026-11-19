import room_Model from "../model/room.model.js";
import { nanoid } from "nanoid";
import { invalidateRoomMembershipCache } from "../middlewares/roomMember.middlware.js";

const create = (RoomModel = room_Model, generateId = nanoid) =>
    async (req, res, next) => {
        try {
            const { name, description, isPrivate } = req.body;
            // console.log(typeof isPrivate);
            //issue in setting private 
            if (!name) return res.status(400).json({ message: "incomplete information" });
            const roomExist = await RoomModel.findOne({ name: name });
            if (roomExist) return res.status(400).json({ message: "room already exists" });
            const { id } = req.user;
            const room = new RoomModel({
                name: name,
                owner: id,
                description: description,
                isPrivate: false,
                inviteCode: generateId(10),
            })
            room.members.push(id);
            await room.save();
            return res.status(200).json({ message: "room created", room_id: room._id, inviteCode: room.inviteCode });
        }
        catch (err) {
            console.log("room creation failed");
            next(err);
        }
    }

const join = (RoomModel = room_Model) =>
    async (req, res, next) => {
        try {
            const { inviteCode } = req.params;
            if (!inviteCode) return res.status(404).json({ message: "invite Code is missing" });
            const room = await RoomModel.findOne({ inviteCode: inviteCode });
            if (!room) return res.status(404).json({ message: "Room not found , invalid invite code" });
            // if (room.isPrivate) return res.status(404).json({ message: "room is private" });
            const { username, id } = req.user;
            if (room.members.some(member => member.equals(id))) return res.status(409).json({ message: `${username} already exists` });
            room.members.push(id);
            await room.save();
            return res.status(200).json({ message: `${username} joined the room`, room_id: room._id, name: room.name, description: room.description });
        }
        catch (err) {
            console.log("failed to join room through invite code ");
            err.message = "falied join room"
            next(err);
        }
    }

const remove = (RoomModel = room_Model) =>
    async (req, res, next) => {
        try {
            const { name } = req.params;
            const { id } = req.user;
            const match_room = await RoomModel.findOne({ name: name, owner: id });
            if (!match_room) return res.status(403).json({ message: "unauthorized" });
            await RoomModel.deleteOne({ _id: match_room._id });
            invalidateRoomMembershipCache(match_room._id.toString());
            return res.status(200).json({ message: "room deleted sucessfully" });
        }
        catch (err) {
            console.log("something is wrong in remove ", err);
            next(err);
        }
    }

const myRooms = (RoomModel = room_Model) =>
    async (req, res, next) => {
        try {
            const { id } = req.user;
            const rooms = await RoomModel.find({ members: id }).select('name description inviteCode isPrivate owner createdAt').lean();
            const final = rooms.map((room) => {
                if (room.isPrivate && room.owner != id) room.inviteCode = null;
                return room;
            })
            return res.status(200).json(final);
        }
        catch (err) {
            err.message = "failed to fetch room names"
            next(err);
        }
    }

export { create, join, remove, myRooms };

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO equivalent of create
 * Event: "room_create" or "create_room"
 * Emits to caller: "room_created" (or executes callback)
 */
const createRoomSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return createRoomSocket()(args[0], args[1], args[2], args[3]);
    }
    let RoomModel = room_Model;
    let generateId = nanoid;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].RoomModel) RoomModel = args[0].RoomModel;
        if (args[0].generateId) generateId = args[0].generateId;
    } else {
        if (args[0]) RoomModel = args[0];
        if (args[1]) generateId = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const { name, description, isPrivate } = data;
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Unauthorized: user id missing" });
                }
                socket?.emit("error", { message: "Unauthorized: user id missing" });
                return;
            }

            if (!name) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "incomplete information" });
                }
                socket?.emit("error", { message: "incomplete information" });
                return;
            }

            const roomExist = await RoomModel.findOne({ name });
            if (roomExist) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "room already exists" });
                }
                socket?.emit("error", { message: "room already exists" });
                return;
            }

            const room = new RoomModel({
                name,
                owner: id,
                description,
                isPrivate: false,
                inviteCode: generateId(10),
            });
            room.members.push(id);
            await room.save();

            socket?.join(room._id.toString());

            const response = {
                message: "room created",
                room_id: room._id,
                inviteCode: room.inviteCode,
            };

            if (typeof callback === "function") {
                callback({ status: 200, ...response });
            }
            socket?.emit("room_created", response);
            return response;
        } catch (err) {
            console.log("room creation failed (socket):", err);
            err.message = "room creation failed";
            if (typeof callback === "function") {
                callback({ status: 500, message: "room creation failed", error: err.message });
            }
            socket?.emit("error", { message: "room creation failed", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of join
 * Event: "room_join" or "join_room_code"
 * Broadcasts: "user_joined_room" to room
 * Emits to caller: "room_joined" (or executes callback)
 */
const joinRoomSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return joinRoomSocket()(args[0], args[1], args[2], args[3]);
    }
    let RoomModel = room_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].RoomModel) RoomModel = args[0].RoomModel;
    } else if (args[0]) {
        RoomModel = args[0];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const inviteCode = typeof data === "string" ? data : (data?.inviteCode || data?.invite_code);
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
            const username = socket?.user?.username || data?.username || "user";

            if (!inviteCode) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "invite Code is missing" });
                }
                socket?.emit("error", { message: "invite Code is missing" });
                return;
            }

            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Unauthorized: user id missing" });
                }
                socket?.emit("error", { message: "Unauthorized: user id missing" });
                return;
            }

            const room = await RoomModel.findOne({ inviteCode });
            if (!room) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "Room not found , invalid invite code" });
                }
                socket?.emit("error", { message: "Room not found , invalid invite code" });
                return;
            }

            if (room.members.some(member => member.equals(id))) {
                if (typeof callback === "function") {
                    return callback({ status: 409, message: `${username} already exists` });
                }
                socket?.emit("error", { message: `${username} already exists` });
                return;
            }

            room.members.push(id);
            await room.save();

            socket?.join(room._id.toString());
            socket?.to(room._id.toString()).emit("user_joined_room", {
                room_id: room._id,
                username,
                id,
            });

            const response = {
                message: `${username} joined the room`,
                room_id: room._id,
                name: room.name,
                description: room.description,
            };

            if (typeof callback === "function") {
                callback({ status: 200, ...response });
            }
            socket?.emit("room_joined", response);
            return response;
        } catch (err) {
            console.log("failed to join room through invite code (socket):", err);
            err.message = "failed join room";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed join room", error: err.message });
            }
            socket?.emit("error", { message: "failed join room", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of remove
 * Event: "room_remove" or "delete_room"
 * Broadcasts: "room_deleted" to room
 * Emits to caller: "room_removed" (or executes callback)
 */
const removeRoomSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return removeRoomSocket()(args[0], args[1], args[2], args[3]);
    }
    let RoomModel = room_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].RoomModel) RoomModel = args[0].RoomModel;
    } else if (args[0]) {
        RoomModel = args[0];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const name = typeof data === "string" ? data : (data?.name || data?.roomName);
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

            if (!name || !id) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing room name or user id" });
                }
                socket?.emit("error", { message: "Missing room name or user id" });
                return;
            }

            const match_room = await RoomModel.findOne({ name, owner: id });
            if (!match_room) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "unauthorized" });
                }
                socket?.emit("error", { message: "unauthorized" });
                return;
            }

            await RoomModel.deleteOne({ _id: match_room._id });

            const roomIdStr = match_room._id.toString();
            invalidateRoomMembershipCache(roomIdStr, socket);
            if (io) {
                io.to(roomIdStr).emit("room_deleted", { room_id: match_room._id, name });
            } else {
                socket?.to(roomIdStr).emit("room_deleted", { room_id: match_room._id, name });
            }

            const response = { message: "room deleted sucessfully" };

            if (typeof callback === "function") {
                callback({ status: 200, ...response });
            }
            socket?.emit("room_removed", response);
            return response;
        } catch (err) {
            console.log("something is wrong in remove (socket):", err);
            err.message = "failed remove";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed remove", error: err.message });
            }
            socket?.emit("error", { message: "failed remove", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of myRooms
 * Event: "my_rooms" or "get_my_rooms"
 * Emits to caller: "my_rooms" (or executes callback)
 */
const myRoomsSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return myRoomsSocket()(args[0], args[1], args[2], args[3]);
    }
    let RoomModel = room_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].RoomModel) RoomModel = args[0].RoomModel;
    } else if (args[0]) {
        RoomModel = args[0];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;

            if (!id) {
                if (typeof callback === "function") {
                    return callback({ status: 401, message: "Unauthorized: user id missing" });
                }
                socket?.emit("error", { message: "Unauthorized: user id missing" });
                return;
            }

            const rooms = await RoomModel.find({ members: id })
                .select('name description inviteCode isPrivate owner createdAt')
                .lean();

            const final = rooms.map((room) => {
                if (room.isPrivate && room.owner != id) room.inviteCode = null;
                return room;
            });

            if (typeof callback === "function") {
                callback({ status: 200, data: final });
            }
            socket?.emit("my_rooms", final);
            return final;
        } catch (err) {
            console.log("failed to fetch room names (socket):", err);
            err.message = "failed to fetch room names";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed to fetch room names", error: err.message });
            }
            socket?.emit("error", { message: "failed to fetch room names", error: err.message });
        }
    };
};

// Aliases matching handle* convention
const handleRoomCreate = createRoomSocket;
const handleRoomJoin = joinRoomSocket;
const handleRoomRemove = removeRoomSocket;
const handleMyRooms = myRoomsSocket;
const roomCreateSocket = createRoomSocket;
const roomJoinSocket = joinRoomSocket;
const roomRemoveSocket = removeRoomSocket;
const roomMyRoomsSocket = myRoomsSocket;

export {
    createRoomSocket,
    joinRoomSocket,
    removeRoomSocket,
    myRoomsSocket,
    roomCreateSocket,
    roomJoinSocket,
    roomRemoveSocket,
    roomMyRoomsSocket,
    handleRoomCreate,
    handleRoomJoin,
    handleRoomRemove,
    handleMyRooms,
};