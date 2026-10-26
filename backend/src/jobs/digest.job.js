import cron from "node-cron";
import { user_Model } from "../model/user.model.js";
import journal_Model from "../model/journal.model.js";
import { generateRoomDigest as generateRoomDigestFactory } from "../services/ai.service.js";
const _generateRoomDigest = generateRoomDigestFactory();
import bcrypt from "bcrypt";
import { date } from "../utils/digestDate.js";
import { hasProcessedRoom, markProcessedRoom } from "../utils/redisDigestState.js";
import { DateTime } from "luxon";
import room_Model from "../model/room.model.js";
import { digestQueue } from "../queue/digest.queue.js";

let botId = "6a4ff1e4ecae03826a338e15";

export const processRoomDigest = async (
    group,
    mentorId,
    todayStr,
    {
        JournalModel = journal_Model,
        digestFn = _generateRoomDigest,
    } = {}
) => {
    const roomId = group._id.toString();
    const redisKey = `digests:${todayStr}`;
    try {
        const start=new Date();
        // 1. Redis Check (Fast Skip)
        const alreadyDone = await hasProcessedRoom(redisKey, roomId);
        if (alreadyDone) {
            const time=new Date()-start;
            console.log(time,roomId," already done");
            return;}

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


        // C. Mark as Done in Redis (Only if A & B succeeded)
        await markProcessedRoom(redisKey, roomId); // 24h TTL
        const time=new Date()-start;
        console.log(time,roomId);
        console.log(`[SLIDING WINDOW] Finished Room: ${roomId}`);
    } catch (err) {
        console.error(`Error processing room ${roomId}:`, err);
        // We don't throw the error here so that one bad room
        // doesn't crash the entire batch.
        // change promise.all to promise.allSetteld so now i need to throw error
        throw err;

    }
};

export const runDigestTick = async ({
    JournalModel = journal_Model,
    processRoomFn = processRoomDigest,
} = {}) => {
    try {
        const mentorId = botId;
        const todayStr = date.key;

        // STEP 1: Aggregation (Fetch everything in one big DB call)
        const roomGroups = await JournalModel.aggregate([
    // 1. Get only yesterday's journals
    {
        $match: {
            createdAt: {
                $gte: date.start,
                $lt: date.end
            }
        }
    },

    // 2. Get the User document using Journal.author
    {
        $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "authorInfo"
        }
    },

    // 3. Convert authorInfo array into an object
    {
        $unwind: "$authorInfo"
    },

    // 4. Keep journal entries in chronological order
    {
        $sort: {
            createdAt: 1
        }
    },

    // 5. Group journals by room
    {
        $group: {
            _id: "$room",
            entries: {
                $push: {
                    username: "$authorInfo.username",
                    content: "$content"
                }
            }
        }
    }
]);

        if (roomGroups.length === 0) {
            console.log("No journals found for today.");
            return;
        }

        // STEP 2: Create Tasks & Start Sliding Window
        const tasks = roomGroups.map((group) =>
            limitConcurrency(() =>
                processRoomFn(group, mentorId, todayStr)
            )
        );

        const results = await Promise.allSettled(tasks);

        const failed = results.filter(
            result => result.status === "rejected"
        );

        console.log(
            `Processed ${roomGroups.length} rooms. ` +
            `Rejected tasks: ${failed.length}.`
        );
    } catch (err) {
        console.error("Critical Digest Job Failure:", err);
    }
};

// export const startDigestJob = () => {
//     // Sliding window: 3 rooms processing at any given time

//     // Runs every day at midnight IST
//     cron.schedule("0 0 * * *", async () => {
//         console.log("Running Daily Digest Job...");
//         await runDigestTick({ limitConcurrency: limit });
//     }, { timezone: "Asia/Kolkata" });
// };

export const testStartDigestJob = async () => {
    console.log("Running Daily Digest Job...");

    // 1. Retrieve all room IDs
    const roomIds = await room_Model.distinct("_id");
    const size = roomIds.length;

    // 2. Process rooms in batches of 10
    for (let i = 0; i < size; i += 10) {
        const batchRoomIds = roomIds.slice(i, i + 10);

        await digestQueue.add(
            "createDigest",
            { rooms: batchRoomIds },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000
                }
            }
        );

        console.log(
            `Queued batch: ${i + 1}-${i + batchRoomIds.length} of ${size}`
        );
    }

    console.log("All digest batches queued.");
};


//this is the newer version of the digest report generation
// cron job
export const startDigestJob = async() => {

    // Runs every day at midnight IST
    cron.schedule("0 0 * * *", async () => {
        console.log("Running Daily Digest Job...");
        //a->retrive all the room ids and batch them .
        const roomIds = await room_Model.find({}).distinct("_id");
        const size=roomIds.length;
        for(let i=0;i<size;i+=10){
            let end=Math.min(size-1,i+9);
            let batchRoomIds=roomIds.slice(i,end);
            digestQueue.add('createDigest',{})
            await queue.add('createDigest',{rooms:batchRoomIds},{attempts: 3,backoff: { type: 'exponential', delay: 2000}});
        }
    }, { timezone: "Asia/Kolkata" });
};
