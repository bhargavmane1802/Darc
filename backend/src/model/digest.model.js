
import mongoose from "mongoose"
const digest_Schema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Room",
        required: true
    },
    content: {
        type: String,
        required: true
    },
    dateKey: {
        type: String,
        required: true
    },
    created: {
        type: Date,
        default: Date.now
    }
});

// Enforce one digest per room per day
digest_Schema.index(
    { room: 1, dateKey: 1 },
    { unique: true }
);
export const digest_Model= mongoose.model("Digest",digest_Schema);

