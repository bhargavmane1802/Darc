import cron from "node-cron";
import room_Model from "../model/room.model.js";
import { digestQueue } from "../queue/digest.queue.js";
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
    }, { timezone: "Asia/Kolkata" });
};
