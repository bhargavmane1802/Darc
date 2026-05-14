import cron from "node-cron";
import pLimit from "p-limit";
import redis from "../config/redis.js"; // Adjust path to your redis config
import {user_Model} from "../model/user.model.js";
import journal_Model from "../model/journal.model.js";
import { generateRoomDigest } from "../services/ai.service.js";
import { getIO } from "../sockets/socket.js";

// Helper to get or create the "AI Bot" identity
let botId = null;
const getBotId = async () => {
    if (botId) return botId;
    let bot = await user_Model.findOne({ username: "AI Mentor" });
    if (!bot) {
        bot = await user_Model.create({
            username: "AI Mentor",
            password: "system_generated_password",
            status: "bot"
        });
    }
    botId = bot._id;
    return botId;
};

// The Worker: Handles a single room's independent pipeline
const processRoomDigest = async (group, mentorId, todayStr) => {
    const roomId = group._id.toString();
    const redisKey = `digests:${todayStr}`;

    try {
        // 1. Redis Check (Fast Skip)
        const alreadyDone = await redis.sismember(redisKey, roomId);
        if (alreadyDone) return;

        // 2. AI Request (The long wait)
        const digestText = await generateRoomDigest(group.entries);

        // 3. Sequential Finish (Consistency over speed)
        // A. Save to DB
        const digestJournal = new journal_Model({
            room: roomId,
            author: mentorId,
            content: `🤖 **Daily Standup Summary**\n\n${digestText}`,
        });
        const savedJournal = await digestJournal.save();

        // B. Emit to Socket
        getIO().to(roomId).emit("create_journal", savedJournal);

        // C. Mark as Done in Redis (Only if A & B succeeded)
        await redis.sadd(redisKey, roomId);
        await redis.expire(redisKey, 86400); // 24h TTL

        console.log(`[SLIDING WINDOW] Finished Room: ${roomId}`);
    } catch (err) {
        console.error(`Error processing room ${roomId}:`, err);
        // We don't throw the error here so that one bad room 
        // doesn't crash the entire batch of 10.
    }
};

const startDigestJob = () => {
    // Sliding window: 10 rooms processing at any given time
    const limit = pLimit(3);

    // Runs every minute for testing. Change to "0 0 * * *" for Midnight.
    cron.schedule("*/1 * * * *", async () => {
        console.log("Running Daily Digest Job...");

        try {
            const mentorId = await getBotId();
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const todayStr = startOfDay.toISOString().slice(0, 10);

            // STEP 1: Aggregation (Fetch everything in one big DB call)
            const roomGroups = await journal_Model.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startOfDay }
                    }
                },
                {
                    $group: {
                        _id: "$room",
                        entries: { $push: "$content" }
                    }
                }
            ]);

            if (roomGroups.length === 0) {
                console.log("No journals found for today.");
                return;
            }

            // STEP 2: Create Tasks & Start Sliding Window
            const tasks = roomGroups.map((group) => {
                // Wrap the worker in the p-limit sliding window
                return limit(() => processRoomDigest(group, mentorId, todayStr));
            });

            // STEP 3: Wait for all "slots" in the window to finish
            await Promise.all(tasks);
            console.log(`✅ All ${roomGroups.length} rooms processed.`);

        } catch (err) {
            console.error("Critical Digest Job Failure:", err);
        }
    });
};

export default startDigestJob;