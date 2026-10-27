import { Worker } from "bullmq";
import journal_Model from "../model/journal.model.js";
import { bullConnection } from "../queue/journal.queue.js";
import { date } from "../utils/digestDate.js";
import { hasProcessedRoom, markProcessedRoom } from "../utils/redisDigestState.js";
import { generateDigest } from "../services/ai.service.js";
import {digest_Model} from "../model/digest.model.js";
import mongoose  from "mongoose";
let botId = "6a4ff1e4ecae03826a338e15";
const retrieveRoomentries=async(rooms,redisKey)=>{
    const notProcessedRooms=await hasProcessedRoom(redisKey,rooms);
    if (notProcessedRooms.length === 0) {
       return {
            roomGroups: [],
            allSkipped: true
        };
    }

     const roomIds = notProcessedRooms.map(id =>
        id instanceof mongoose.Types.ObjectId
            ? id
            : new mongoose.Types.ObjectId(id)
    );
    const roomGroups=await journal_Model.aggregate([
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

        {
            $unwind: "$authorInfo"
        },

        {
            $sort: {
                createdAt: 1
            }
        },

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
        },

        {
            $lookup: {
                from: "digests",
                let: {
                    roomId: "$_id"
                },
                pipeline: [
                    {
                        $match: {
                            dateKey: date.key,
                            $expr: {
                                $eq: ["$room", "$$roomId"]
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1
                        }
                    }
                ],
                as: "existingDigest"
            }
        },

        {
            $set: {
                digestExists: {
                    $gt: [
                        { $size: "$existingDigest" },
                        0
                    ]
                }
            }
        },

        {
            $project: {
                _id: 1,
                entries: 1,
                digestExists: 1
            }
        }
    ]);
    return {
    roomGroups: roomGroups,
    allSkipped: false
};
};
export const handleDigestJob = async (job,apikey) => {
    console.log("this is the llm key ",apikey);
    if (job.name !== "createDigest") {
        console.warn(`Unknown job type: "${job.name}". Skipping.`);
        return;
    }
    const redisKey = `digests:${date.key}`;
    const { rooms } = job.data;
    //retrieve all the rooms entries
    const {roomGroups,allSkipped} = await retrieveRoomentries(rooms,redisKey);
    if (allSkipped) {
        return {
            success: true,
            processed: 0,
            skipped: rooms.length,
            failed: 0
        };

    }
    if (roomGroups.length === 0) {
        console.log("No journals found for today.");
        return { success: true, processed: 0, failed: 0 };
    }
    //generate all the digest for roomEntries in serialized order
    const failedTasks = [];
    const completed=[];
    const roomsToMarkProcessed =[];
    for (const group of roomGroups) {
        const roomId = group._id.toString();
        if (group.digestExists){
            roomsToMarkProcessed .push(roomId);
            continue;
        }
        const start = Date.now();
            try {

                // 1. Generate digest and wait until it finishes and save it in completed
                const digest = await generateDigest(group.entries,apikey);
                completed.push({roomId,digest});
                roomsToMarkProcessed .push(roomId);
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
    await markProcessedRoom(redisKey,roomsToMarkProcessed);
        console.log({
            processed:completed.length,
            skipped:roomsToMarkProcessed.length-completed.length,
            failed: failedTasks.length,
        });

        // Let BullMQ retry the job if any room failed
       if (failedTasks.length > 0) {
            throw new Error(
                `Failed to generate digests for ${failedTasks.length} room(s)`
            );
        }

        return {
            success: true,
            processed:completed.length,
            skipped:roomsToMarkProcessed.length-completed.length,
            failed: failedTasks.length
        };
    };

const isTestEnvironment =
    process.env.NODE_ENV === "test" ||
    process.argv.some(arg => arg.includes("--test"));

const createDigestWorker = (workerNumber,apikey) => {
    const worker = new Worker(
        "digestQueue",
        (job) => handleDigestJob(job,apikey),
        {
            connection: bullConnection,
            concurrency: 3,
        }
    );

    worker.on("failed", (job, err) => {
        console.error(
            `❌ Worker ${workerNumber}: Job ${job?.id} failed after ${job?.attemptsMade} attempt(s)`
        );
        console.error(err.stack || err);
    });

    worker.on("completed", (job, result) => {
        console.log(
            `✅ Worker ${workerNumber}: Job ${job.id} completed`,
            result
        );
    });

    worker.on("error", (err) => {
        console.error(`❌ Worker ${workerNumber} error:`, err);
    });

    return worker;
};
const llmApiKeys = [
    process.env.Llm_Api_Key1,
    process.env.Llm_Api_Key2
];
const digestWorkers = isTestEnvironment
    ? []
    : llmApiKeys.map((apiKey, index) =>
          createDigestWorker(index + 1, apiKey)
      );
export default digestWorkers;

