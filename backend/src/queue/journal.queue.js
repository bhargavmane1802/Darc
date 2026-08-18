import Redis from 'ioredis';
import { Queue } from 'bullmq';

// BullMQ requires a dedicated Redis connection — cannot share the app-wide instance.
// enableReadyCheck: false — prevents startup crash when Redis isn't immediately ready
// maxRetriesPerRequest: null — required by BullMQ; lets it block indefinitely on commands
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('--test'));

const bullConnection = isTestEnvironment
  ? { quit: async () => {} }
  : process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new Redis({
        host: '127.0.0.1',
        port: 6379,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

// In testing, do not instantiate the Queue, otherwise BullMQ starts background
// workers and blocking BPOP commands that hang the test runner process.
const journalQueue = isTestEnvironment
  ? { add: async () => {}, close: async () => {} }
  : new Queue('journalQueue', { connection: bullConnection });

export { journalQueue, bullConnection };