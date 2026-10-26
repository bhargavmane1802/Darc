import { Worker } from "bullmq";
import journal_Model from "../model/journal.model.js";
import { bullConnection } from "../queue/journal.queue.js";
import { date } from "../utils/digestDate.js";
import { hasProcessedRoom, markProcessedRoom } from "../utils/redisDigestState.js";
import { generateDigest } from "../services/ai.service.js";
import {digest_Model} from "../model/digest.model.js";
import mongoose  from "mongoose";
let botId = "6a4ff1e4ecae03826a338e15";
const retrieveRoomentries=async(rooms)=>{
     const roomIds = rooms.map(id =>
        id instanceof mongoose.Types.ObjectId
            ? id
            : new mongoose.Types.ObjectId(id)
    );
    return await journal_Model.aggregate([
        {
            $match: {
                room: { $in: roomIds },
                createdAt: {
                    $gte: date.start,
                    $lt: date.end
                }
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "authorInfo"
            }
        },
        { $unwind: "$authorInfo" },
        { $sort: { createdAt: 1 } },
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
}
export const handleDigestJob = async (job) => {
    
    if (job.name !== "createDigest") {
        console.warn(`Unknown job type: "${job.name}". Skipping.`);
        return;
    }

    const { rooms } = job.data;
    //retrieve all the rooms entries
    const roomGroups = await retrieveRoomentries(rooms);
    if (roomGroups.length === 0) {
        console.log("No journals found for today.");
        return { success: true, processed: 0, failed: 0 };
    }
    //generate all the digest for roomEntries in serialized order
    const redisKey = `digests:${date.key}`;
    const failedTasks = [];
    const completed=[];
    let processed = 0;
    let skipped = 0;
    for (const group of roomGroups) {
        const roomId = group._id.toString();
        const start = Date.now();
            try {
                // 1. Check whether already processed
                // const alreadyDone = await hasProcessedRoom(redisKey, roomId);

                // if (alreadyDone) {
                //     skipped++;
                //     console.log(`${roomId} already done. Skipping.`);
                //     continue;
                // }

                // 2. Generate digest and wait until it finishes and save it in completed
                const digest = await generateDigest(group.entries);
                completed.push({roomId,digest});
                // 3. Mark processed only after successful generation
                await markProcessedRoom(redisKey, roomId);
                processed++;

                console.log(
                    `Finished room: ${roomId} in ${Date.now() - start}ms`
                );

            } catch (error) {
                failedTasks.push(group);
                console.error(`Error processing room ${roomId}:`, error);
            }
    }
    if (completed.length > 0) {
        await digest_Model.bulkWrite(
            completed.map(({ roomId, digest }) => ({
                updateOne: {
                    filter: {
                        room: roomId,
                        dateKey: date.key
                    },
                    update: {
                        $set: {
                            author: botId,
                            content: digest
                        },
                        $setOnInsert: {
                            created: new Date()
                        }
                    },
                    upsert: true
                }
            }))
        );
    }

        console.log({
            processed,
            skipped,
            failed: failedTasks.length,
        });

        // Let BullMQ retry the job if any room failed
        if (failedTasks.length > 0) {
            // failed cases handling is yet to decide
        }

        return {
            success: true,
            processed,
            skipped,
            failed: failedTasks.length
        };
    };

const isTestEnvironment = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('--test'));

const digestWorker = isTestEnvironment
  ? { on: () => {} }
  : new Worker(
      'digestQueue',
      (job) => handleDigestJob(job),
      {
          connection: bullConnection,
          concurrency: 3,
      }
  );

// Log failed jobs with full error details and attempt count
digestWorker.on('failed', (job, err) => {
    console.error(
        `❌ Job "${job?.name}" (id: ${job?.id}) failed after ${job?.attemptsMade} attempt(s):`,
        err.message
    );
});

// Log successful completions
digestWorker.on('completed', (job, result) => {
    console.log(`✅ Job "${job.name}" (id: ${job.id}) completed:`, result);
});

// Catch unexpected worker-level errors (connection drops, etc.)
digestWorker.on('error', (err) => {
    console.error('❌ Journal Worker encountered an error:', err);
});

export default digestWorker;
