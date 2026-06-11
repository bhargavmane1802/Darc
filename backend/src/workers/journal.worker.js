import { Worker } from "bullmq";
import { generateEmbeddings } from "../services/ai.service.js";
import { pineconeIndex } from "../config/pinecone.js";
import journal_Model from "../model/journal.model.js";
import { bullConnection } from "../queue/journal.queue.js";

const journalWorker = new Worker(
    'journalQueue',
    async (job) => {
        // Only handle the embedding creation job
        if (job.name !== 'createEmbedding') {
            console.warn(`⚠️ Unknown job type received: "${job.name}". Skipping.`);
            return;
        }

        const { journalId, content } = job.data;

        // Guard: ensure required data is present before doing any work
        if (!journalId || !content) {
            throw new Error(`Missing required job data: journalId=${journalId}, content present=${!!content}`);
        }

        // Step 1: Generate the embedding vector from the journal content
        job.log(`Generating embedding for journal ${journalId}...`);
        const embedding = await generateEmbeddings(content);

        if (!embedding?.length) {
            throw new Error(`Embedding generation returned empty result for journal ${journalId}`);
        }

        // Step 2: Persist the embedding back into MongoDB
        job.log(`Saving embedding to MongoDB for journal ${journalId}...`);
        const journalEntry = await journal_Model.findOneAndUpdate(
            { _id: journalId },
            { embedding },
            { returnDocument: 'after' }
        );

        if (!journalEntry) {
            // The journal was deleted before the worker ran — do not throw, just skip cleanly
            console.warn(`⚠️ Journal ${journalId} not found in MongoDB (likely deleted). Skipping Pinecone upsert.`);
            return { success: false, reason: 'journal_not_found' };
        }

        // Step 3: Upsert the embedding + metadata into Pinecone for RAG queries
        job.log(`Upserting vector to Pinecone for journal ${journalId}...`);
        await pineconeIndex.upsert({
            records: [{
                id: journalEntry._id.toString(),
                values: embedding,
                metadata: {
                    roomId: journalEntry.room.toString(),
                    authorId: journalEntry.author.toString(),
                    content: content,
                    aiResponse: ""
                }
            }]
        });

        job.log(`✅ Embedding pipeline complete for journal ${journalId}.`);
        return { success: true, journalId };
    },
    {
        connection: bullConnection,
        // Process one job at a time to avoid hammering the embedding API
        concurrency: 1,
    }
);

// Log failed jobs with full error details and attempt count
journalWorker.on('failed', (job, err) => {
    console.error(
        `❌ Job "${job?.name}" (id: ${job?.id}) failed after ${job?.attemptsMade} attempt(s):`,
        err.message
    );
});

// Log successful completions
journalWorker.on('completed', (job, result) => {
    console.log(`✅ Job "${job.name}" (id: ${job.id}) completed:`, result);
});

// Catch unexpected worker-level errors (connection drops, etc.)
journalWorker.on('error', (err) => {
    console.error('❌ Journal Worker encountered an error:', err);
});

export default journalWorker;
