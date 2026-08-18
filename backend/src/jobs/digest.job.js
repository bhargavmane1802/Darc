import cron from "node-cron";
import pLimit from "p-limit";
import redis from "../config/redis.js";
import { user_Model } from "../model/user.model.js";
import journal_Model from "../model/journal.model.js";
import { generateRoomDigest as generateRoomDigestFactory } from "../services/ai.service.js";
const _generateRoomDigest = generateRoomDigestFactory();
import { getIO } from "../sockets/socket.js";
import bcrypt from "bcrypt";

// Helper to get or create the "AI Bot" identity
let botId = null;
export const _resetBotId = () => { botId = null; };

export const getBotId = async (
    UserModel = user_Model,
    bcryptLib = bcrypt
) => {
    if (botId) return botId;
    let bot = await UserModel.findOne({ username: "AI Mentor" });
    if (!bot) {
        const password = "system_generated_password";
        const hashed_password = await bcryptLib.hash(password, 10);
        bot = await UserModel.create({
            username: "AI Mentor",
            password: hashed_password,
            status: "bot"
        });
    }
    botId = bot._id;
    return botId;
};

// The Worker: Handles a single room's independent pipeline
export const processRoomDigest = async (
    group,
    mentorId,
    todayStr,
    {
        redisClient = redis,
        JournalModel = journal_Model,
        digestFn = _generateRoomDigest,
        getSocketIO = getIO
    } = {}
) => {
    const roomId = group._id.toString();
    const redisKey = `digests:${todayStr}`;
    try {
        // 1. Redis Check (Fast Skip)
        const alreadyDone = await redisClient.sismember(redisKey, roomId);
        if (alreadyDone) return;

        // 2. AI Request (The long wait)
        const digestText = await digestFn(group.entries);

        // 3. Sequential Finish (Consistency over speed)
        // A. Save to DB
        const digestJournal = new JournalModel({
            room: roomId,
            author: mentorId,
            content: `🤖 **Daily Standup Summary**\n\n${digestText}`,
        });
        const savedJournal = await digestJournal.save();

        // B. Emit to Socket
        getSocketIO().to(roomId).emit("create_journal", savedJournal);

        // C. Mark as Done in Redis (Only if A & B succeeded)
        await redisClient.sadd(redisKey, roomId);
        await redisClient.expire(redisKey, 86400); // 24h TTL

        console.log(`[SLIDING WINDOW] Finished Room: ${roomId}`);
    } catch (err) {
        console.error(`Error processing room ${roomId}:`, err);
        // We don't throw the error here so that one bad room
        // doesn't crash the entire batch.
    }
};

export const runDigestTick = async ({
    getBotIdFn = getBotId,
    JournalModel = journal_Model,
    processRoomFn = processRoomDigest,
    limitConcurrency = pLimit(3)
} = {}) => {
    try {
        const mentorId = await getBotIdFn();
        const startOfYesterday = new Date();
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        startOfYesterday.setHours(0, 0, 0, 0);

        const endOfYesterday = new Date();
        endOfYesterday.setDate(endOfYesterday.getDate() - 1);
        endOfYesterday.setHours(23, 59, 59, 999);
        const todayStr = startOfYesterday.toISOString().slice(0, 10);

        // STEP 1: Aggregation (Fetch everything in one big DB call)
        const roomGroups = await JournalModel.aggregate([
            { $match: { createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } } },
            { $group: { _id: "$room", entries: { $push: "$content" } } }
        ]);

        if (roomGroups.length === 0) {
            console.log("No journals found for today.");
            return;
        }

        // STEP 2: Create Tasks & Start Sliding Window
        const tasks = roomGroups.map((group) =>
            limitConcurrency(() => processRoomFn(group, mentorId, todayStr))
        );

        // STEP 3: Wait for all "slots" in the window to finish
        await Promise.all(tasks);
        console.log(`✅ All ${roomGroups.length} rooms processed.`);
    } catch (err) {
        console.error("Critical Digest Job Failure:", err);
    }
};

const startDigestJob = () => {
    // Sliding window: 3 rooms processing at any given time
    const limit = pLimit(3);

    // Runs every day at midnight IST
    cron.schedule("0 0 * * *", async () => {
        console.log("Running Daily Digest Job...");
        await runDigestTick({ limitConcurrency: limit });
    }, { timezone: "Asia/Kolkata" });
};

export default startDigestJob;