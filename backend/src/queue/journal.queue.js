import Redis from 'ioredis';
import { Queue } from 'bullmq';

// BullMQ requires a dedicated Redis connection — cannot share the app-wide instance.
// enableReadyCheck: false — prevents startup crash when Redis isn't immediately ready
// maxRetriesPerRequest: null — required by BullMQ; lets it block indefinitely on commands
const bullConnection = new Redis(process.env.REDIS_URL,{maxRetriesPerRequest: null} || {
    host: '127.0.0.1',
    port: 6379,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
});

const journalQueue = new Queue('journalQueue', { connection: bullConnection });

export { journalQueue, bullConnection };