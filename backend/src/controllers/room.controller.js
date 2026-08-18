import room_Model from "../model/room.model.js";
import { nanoid } from "nanoid";

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