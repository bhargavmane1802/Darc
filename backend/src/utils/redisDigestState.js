import redis from "../config/redis.js";

export const hasProcessedRoom = async (redisKey, roomId) => {
    return (await redis.sismember(redisKey, roomId)) === 1;
};

export const markProcessedRoom = async (redisKey, roomId) => {
    return redis.eval(
        `
        redis.call("SADD", KEYS[1], ARGV[1])
        redis.call("EXPIRE", KEYS[1], ARGV[2])
        return 1
        `,
        1,     
        redisKey,
        String(roomId), 
        720
    );
};