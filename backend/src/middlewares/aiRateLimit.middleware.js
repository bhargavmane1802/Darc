import redis from "../config/redis.js"

const aiRateLimit = (redisClient = redis) => async (req, res, next) => {
    try {
        const id = req.user.id;
        const today = new Date().toISOString().slice(0, 10);
        const key = `ratelimit:${id}:${today}`;
        const limit = 10;
        const count = await redisClient.incr(key);
        if (count == 1) {
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const ttlSeconds = Math.floor((midnight - now) / 1000);
            await redisClient.expire(key, ttlSeconds);
        }
        const remaining = Math.max(0, limit - count);
        res.set("X-RateLimit-Remaining", remaining.toString());
        if (count > limit) {
            return res.status(429).json({
                message: "Daily AI feedback limit reached. Try again tomorrow!",
                limit,
                remaining: 0
            });
        }
        next();
    }
    catch (err) {
        console.error("Rate Limit Middleware Error:", err);
        err.message = "Failed aiRateLimit";
        next(err);
    }
};
export default aiRateLimit;