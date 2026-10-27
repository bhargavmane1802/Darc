import Redis from 'ioredis';
import { Queue } from 'bullmq';
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
const digestQueue = isTestEnvironment
  ? { add: async () => {}, close: async () => {} }
  : new Queue('digestQueue', { connection: bullConnection });

export { digestQueue, bullConnection };