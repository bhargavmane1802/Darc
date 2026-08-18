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