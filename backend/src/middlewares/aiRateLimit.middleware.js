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

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Middleware: aiRateLimit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks AI feedback rate limit for a user in Redis (10 requests per day, expires at midnight).
 * @param {string} userId
 * @param {object} redisClient
 * @returns {Promise<{ allowed: boolean, status: number, message?: string, limit: number, remaining: number }>}
 */
export const checkSocketAiRateLimit = async (userId, redisClient = redis) => {
    try {
        if (!userId) {
            return {
                allowed: false,
                status: 401,
                message: "Unauthorized: user id missing for rate limiting",
                limit: 10,
                remaining: 0,
            };
        }

        const today = new Date().toISOString().slice(0, 10);
        const key = `ratelimit:${userId}:${today}`;
        const limit = 10;
        const count = await redisClient.incr(key);

        if (count === 1) {
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const ttlSeconds = Math.floor((midnight - now) / 1000);
            await redisClient.expire(key, ttlSeconds);
        }

        const remaining = Math.max(0, limit - count);

        if (count > limit) {
            return {
                allowed: false,
                status: 429,
                message: "Daily AI feedback limit reached. Try again tomorrow!",
                limit,
                remaining: 0,
            };
        }

        return {
            allowed: true,
            status: 200,
            limit,
            remaining,
        };
    } catch (err) {
        console.error("Socket AI Rate Limit Check Error:", err);
        return {
            allowed: true,
            status: 200,
            limit: 10,
            remaining: 10,
        };
    }
};

/**
 * Socket.IO middleware for AI rate limiting
 * Can be used:
 * 1. As an inline check: const check = await socketAiRateLimit()(data, socket, next);
 * 2. As an event wrapper: socket.on("ai_event", socketAiRateLimit()(handler));
 * 3. As a packet middleware: socket.use(socketAiRateLimitPacket());
 */
export const socketAiRateLimit = (redisClient = redis) => {
    const middleware = async (dataOrPacket, socketOrNext, nextOrIo, callback) => {
        // Pattern 1: Handler wrapper -> socketAiRateLimit()(handler)
        if (typeof dataOrPacket === "function") {
            const handler = dataOrPacket;
            return async (data, socket, io, cb) => {
                const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
                const check = await checkSocketAiRateLimit(userId, redisClient);

                socket?.emit("rate_limit_status", { limit: check.limit, remaining: check.remaining });

                if (!check.allowed) {
                    if (typeof cb === "function") cb(check);
                    socket?.emit("error", check);
                    return;
                }

                return handler(data, socket, io, cb);
            };
        }

        // Pattern 2: Middleware execution -> (data, socket, next)
        const data = dataOrPacket;
        const socket = socketOrNext;
        const next = typeof nextOrIo === "function" ? nextOrIo : callback;

        const userId = socket?.user?.id || socket?.user?._id || data?.id || data?.userId;
        const check = await checkSocketAiRateLimit(userId, redisClient);

        socket?.emit("rate_limit_status", { limit: check.limit, remaining: check.remaining });

        if (!check.allowed) {
            if (typeof callback === "function") callback(check);
            socket?.emit("error", check);
            if (typeof next === "function") next(new Error(check.message));
            return check;
        }

        if (typeof next === "function") next();
        return check;
    };

    return middleware;
};

/**
 * Socket.IO packet-level middleware for AI events
 * Usage: socket.use(socketAiRateLimitPacket())
 */
export const socketAiRateLimitPacket = (redisClient = redis) => async ([event, data, callback], next) => {
    if (typeof event === "string" && (event.includes("ai") || event.includes("feedback"))) {
        const userId = data?.userId || data?.id;
        const check = await checkSocketAiRateLimit(userId, redisClient);
        if (!check.allowed) {
            if (typeof callback === "function") callback(check);
            return next(new Error(check.message));
        }
    }
    next();
};

// Aliases
export const aiRateLimitSocket = socketAiRateLimit;
export { socketAiRateLimit as socketAiRateLimitMiddleware };