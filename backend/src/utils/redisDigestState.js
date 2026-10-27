
import redis from "../config/redis.js";

export const hasProcessedRoom = async (redisKey, roomIds) => {
    if (roomIds.length === 0) return [];

    const ids = roomIds.map(id => id.toString());

    // ioredis: key, then each member as a separate argument
    const processed = await redis.smismember(redisKey, ...ids);

    return ids.filter((_, index) => Number(processed[index]) === 0);
};

export const markProcessedRoom = async (redisKey, roomIds) => {
    if (roomIds.length === 0) return 0;

    const ids = roomIds.map(id => id.toString());

    // ioredis eval signature: script, numberOfKeys, keys..., args...
    return redis.eval(
        `
        redis.call("SADD", KEYS[1], unpack(ARGV, 2))
        redis.call("EXPIRE", KEYS[1], ARGV[1])
        return 1
        `,
        1,
        redisKey,
        "720",
        ...ids
    );
};
