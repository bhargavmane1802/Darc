
const RECENT_MESSAGE_LIMIT = 100;
const MESSAGE_CACHE_TTL = 1800;

// Reserved member: MongoDB ObjectIds cannot equal this value.
const CACHE_MARKER = "__recent_cache_initialized__";

const getRecentKeys = (roomId) => ({
    index: `chat:{${roomId}}:recent:index`,
    data: `chat:{${roomId}}:recent:data`
});

// -----------------------------------------
// ATOMIC CACHE INITIALIZATION
// -----------------------------------------

const INITIALIZE_CACHE_SCRIPT = `
    local indexKey = KEYS[1]
    local dataKey = KEYS[2]

    local marker = ARGV[1]
    local ttl = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])

    -- Another request or writer already initialized this cache.
    if redis.call("ZSCORE", indexKey, marker) then
        return 0
    end

    -- Remove any incomplete cache.
    redis.call("DEL", indexKey, dataKey)

    -- Marker ensures even an empty room has a valid cache.
    redis.call("ZADD", indexKey, -9007199254740991, marker)
    redis.call("HSET", dataKey, marker, "1")

    local count = tonumber(ARGV[4])
    local position = 5

    for i = 1, count do
        local messageId = ARGV[position]
        local score = tonumber(ARGV[position + 1])
        local payload = ARGV[position + 2]

        redis.call("ZADD", indexKey, score, messageId)
        redis.call("HSET", dataKey, messageId, payload)

        position = position + 3
    end

    -- Keep only the newest 100 actual messages.
    local total = redis.call("ZCARD", indexKey)
    local excess = total - 1 - limit

    if excess > 0 then
        local oldest = redis.call(
            "ZRANGE",
            indexKey,
            1,
            excess
        )

        for _, messageId in ipairs(oldest) do
            redis.call("HDEL", dataKey, messageId)
        end

        redis.call(
            "ZREMRANGEBYRANK",
            indexKey,
            1,
            excess
        )
    end

    redis.call("EXPIRE", indexKey, ttl)
    redis.call("EXPIRE", dataKey, ttl)

    return 1
`;

// -----------------------------------------
// CACHE INITIALIZATION
// -----------------------------------------

const initializeRecentCache = async (
    redis,
    roomId,
    messages
) => {
    const keys = getRecentKeys(roomId);

    // MongoDB messages are expected newest-to-oldest.
    const orderedMessages = messages.slice().reverse();

    const args = [
        CACHE_MARKER,
        String(MESSAGE_CACHE_TTL),
        String(RECENT_MESSAGE_LIMIT),
        String(orderedMessages.length)
    ];

    for (const message of orderedMessages) {
        const messageId = message._id.toString();

        const timestamp = new Date(
            message.createdAt
        ).getTime();

        if (!Number.isFinite(timestamp)) {
            throw new Error("Invalid message createdAt");
        }

        args.push(
            messageId,
            String(timestamp),
            JSON.stringify(message)
        );
    }

    return redis.eval(
        INITIALIZE_CACHE_SCRIPT,
        {
            keys: [keys.index, keys.data],
            arguments: args
        }
    );
};

// -----------------------------------------
// CACHE RETRIEVAL
// -----------------------------------------

const getRecentMessages = async (
    redis,
    roomId
) => {
    const keys = getRecentKeys(roomId);

    // Check whether cache has been initialized.
    const initialized = await redis.zScore(
        keys.index,
        CACHE_MARKER
    );

    if (initialized === null) {
        return null;
    }

    // Redis returns newest first:
    // score DESC, member DESC.
    const messageIds = await redis.zRange(
        keys.index,
        0,
        -1,
        { REV: true }
    );

    const actualIds = messageIds
        .filter(id => id !== CACHE_MARKER)
        .slice(0, RECENT_MESSAGE_LIMIT);

    let messages = [];

    if (actualIds.length > 0) {
        const payloads = await redis.hmGet(
            keys.data,
            actualIds
        );

        messages = payloads
            .filter(Boolean)
            .map(payload => JSON.parse(payload));

        // Missing payload means cache inconsistency.
        if (messages.length !== actualIds.length) {
            throw new Error(
                "Recent message cache is inconsistent"
            );
        }
    }

    // Refresh sliding expiration on both keys.
    await redis.multi()
        .expire(keys.index, MESSAGE_CACHE_TTL)
        .expire(keys.data, MESSAGE_CACHE_TTL)
        .exec();

    // Return chronological order for the chat UI.
    return messages.reverse();
};

// -----------------------------------------
// CACHE INVALIDATION
// -----------------------------------------

const invalidateRecentCache = async (
    redis,
    roomId
) => {
    const keys = getRecentKeys(roomId);

    await redis.del([
        keys.index,
        keys.data
    ]);
};

export {
    RECENT_MESSAGE_LIMIT,
    MESSAGE_CACHE_TTL,
    getRecentKeys,
    initializeRecentCache,
    getRecentMessages,
    invalidateRecentCache
};
