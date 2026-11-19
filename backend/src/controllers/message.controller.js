import mongoose from "mongoose";
import message_Model from "../model/message.model.js";
import { getIO } from "../sockets/socketInstance.js";
import crypto  from "crypto";
import { randomUUID } from "node:crypto";
import {
    recordCacheHit,
    recordCacheMiss,
    recordCacheFallback,
    recordCacheWrite,
    recordCacheError,
} from "../utils/benchMetrics.js";

// =============================================
// REDIS CLIENT ADAPTER (ioredis v5 + node-redis v4)
// =============================================

const isRedisReady = (redis) => {
    if (!redis) return false;
    if (redis.status === "ready") return true;
    if (redis.isReady === true) return true;
    return false;
};

const isIoRedisClient = (redis) =>
    typeof redis?.zscore === "function" || typeof redis?.status === "string";

const redisEval = async (redis, script, keys, args) => {
    if (isIoRedisClient(redis)) {
        return redis.eval(script, keys.length, ...keys, ...args);
    }
    return redis.eval(script, { keys, arguments: args });
};

const redisSetLock = async (redis, key, value, ttlSeconds) => {
    if (isIoRedisClient(redis)) {
        return redis.set(key, value, "EX", ttlSeconds, "NX");
    }
    return redis.set(key, value, { NX: true, EX: ttlSeconds });
};

const redisDel = async (redis, keys) => {
    if (isIoRedisClient(redis)) {
        return redis.del(...keys);
    }
    return redis.del(keys);
};

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO equivalent of messageCreate
 * Event: "message_send" or "create_message"
 * Broadcasts: "message_new" to room
 * Emits to sender: "message_create_success" (or executes callback)
 */
const messageCreateSocket = (...args) => {
    if (
        args.length >= 2 &&
        args[1] &&
        typeof args[1].emit === "function"
    ) {
        return messageCreateSocket()(
            args[0],
            args[1],
            args[2],
            args[3]
        );
    }

    let MessageModel = message_Model;
    let getSocketIO = getIO;
    let redis = null;

    // Dependency injection.
    if (
        args.length === 1 &&
        args[0] &&
        typeof args[0] === "object" &&
        !args[0].schema
    ) {
        if (args[0].MessageModel) {
            MessageModel = args[0].MessageModel;
        }

        if (args[0].getSocketIO) {
            getSocketIO = args[0].getSocketIO;
        }

        if (args[0].redis) {
            redis = args[0].redis;
        }

    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {

        const sendError = (status, message) => {
            const response = { status, message };

            if (typeof callback === "function") {
                callback(response);
            } else {
                socket?.emit("error", response);
            }

            return response;
        };

        try {

            const senderId =
                socket?.user?.id ||
                socket?.user?._id;

            const roomId =
                data.roomId ||
                data.room_id ||
                data.room;

            const content = data.content;

            const imageUrl =
                data.imageUrl ||
                data.image_url ||
                null;

            const textContent =
                typeof content === "string"
                    ? content.trim()
                    : "";

            // Validate content.
            if (!textContent && !imageUrl) {
                return sendError(
                    400,
                    "Content or image is required"
                );
            }

            // Validate sender and room.
            if (
                !senderId ||
                !roomId ||
                !mongoose.Types.ObjectId.isValid(senderId) ||
                !mongoose.Types.ObjectId.isValid(roomId)
            ) {
                return sendError(
                    400,
                    "Valid sender id and roomId are required"
                );
            }

            const type =
                data.type ||
                (
                    imageUrl
                        ? (textContent ? "mixed" : "image")
                        : "text"
                );

            // 1. Create MongoDB document.
            const message = new MessageModel({
                sender: senderId,
                room: roomId,
                content: textContent,
                imageUrl,
                type
            });

            // 2. Persist first.
            await message.save();

            // 3. Build sender payload from authenticated socket user (avoids .populate).
            const senderImage = socket?.user?.imageUrl || socket?.user?.avatar || null;
            const responseMessage = {
                ...(typeof message.toObject === "function" ? message.toObject() : message),
                sender: {
                    _id: senderId,
                    username: socket?.user?.username,
                    imageUrl: senderImage,
                    avatar: senderImage,
                },
            };

            // 4. Update Redis cache.
            // Redis errors must not undo a successful MongoDB write.
            try {

                const cached = await addMessageToRecentCache(
                    redis,
                    roomId.toString(),
                    responseMessage
                );

                if (!cached && isRedisReady(redis)) {
                    // Cache not yet initialized for this room; will populate on first display.
                }

            } catch (redisError) {

                console.error(
                    "Failed to update recent message cache:",
                    redisError.message
                );
            }

            // 5. Emit to room.
            const ioInstance =
                io ||
                (getSocketIO ? getSocketIO() : getIO());

            ioInstance.to(roomId.toString()).emit(
                "message_new",
                responseMessage
            );

            // 6. Return existing response structure.
            const responsePayload = {
                message: "Message created successfully",
                data: responseMessage
            };

            if (typeof callback === "function") {
                callback({
                    status: 201,
                    ...responsePayload
                });
            }

            socket?.emit(
                "message_create_success",
                responsePayload
            );

            return responseMessage;

        } catch (err) {

            console.error(
                "Failed to create new message (socket):",
                err
            );

            const response = {
                status: 500,
                message: "failed messageCreate",
                error: err.message
            };

            if (typeof callback === "function") {
                callback(response);
            } else {
                socket?.emit("error", response);
            }
        }
    };
};

/**
 * Socket.IO equivalent of messageUpdate
 * Event: "update_message"
 * Broadcasts: "update_message" to room
 * Emits to sender: "message_update_success" (or executes callback)
 */
// =============================================
// ATOMIC RECENT MESSAGE UPDATE SCRIPT
// =============================================

const UPDATE_RECENT_MESSAGE_SCRIPT = `
    local indexKey = KEYS[1]
    local dataKey = KEYS[2]

    local marker = ARGV[1]
    local messageId = ARGV[2]
    local payload = ARGV[3]
    local ttl = tonumber(ARGV[4])

    -- Cache must be initialized.
    if not redis.call("ZSCORE", indexKey, marker) then
        return 0
    end

    -- Only update messages currently in the recent cache.
    if not redis.call("ZSCORE", indexKey, messageId) then
        return 0
    end

    redis.call("HSET", dataKey, messageId, payload)

    redis.call("EXPIRE", indexKey, ttl)
    redis.call("EXPIRE", dataKey, ttl)

    return 1
`;

// =============================================
// UPDATE MESSAGE IN RECENT CACHE
// =============================================

const updateMessageInRecentCache = async (
    redis,
    roomId,
    message
) => {

    if (!isRedisReady(redis)) {
        recordCacheWrite("skipped");
        return false;
    }

    const keys = getRecentMessageKeys(roomId);

    const messageId = message._id.toString();

    const payload = JSON.stringify(
        typeof message.toObject === "function"
            ? message.toObject()
            : message
    );

    const result = await redisEval(
        redis,
        UPDATE_RECENT_MESSAGE_SCRIPT,
        [keys.index, keys.data],
        [
            RECENT_CACHE_MARKER,
            messageId,
            payload,
            String(MESSAGE_CACHE_TTL)
        ]
    );

    if (result === 1) {
        recordCacheWrite("update");
    } else {
        recordCacheWrite("skipped");
    }
    return result === 1;
}; 


const messageUpdateSocket = (...args) => {

    // Preserve direct invocation compatibility.
    if (
        args.length >= 2 &&
        args[1] &&
        typeof args[1].emit === "function"
    ) {
        return messageUpdateSocket()(
            args[0],
            args[1],
            args[2],
            args[3]
        );
    }

    let MessageModel = message_Model;
    let getSocketIO = getIO;
    let redis = null;

    // Object-based dependency injection.
    if (
        args.length === 1 &&
        args[0] &&
        typeof args[0] === "object" &&
        !args[0].schema
    ) {
        MessageModel =
            args[0].MessageModel ||
            args[0].message_Model ||
            message_Model;

        getSocketIO = args[0].getSocketIO || getIO;
        redis = args[0].redis || null;

    } else {
        // Existing positional dependency injection.
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
        if (args[2]) redis = args[2];
    }

    return async (data = {}, socket, io, callback) => {

        const sendError = (status, message, extra = {}) => {
            const response = { status, message, ...extra };

            if (typeof callback === "function") {
                callback(response);
            } else {
                socket?.emit("error", response);
            }

            return response;
        };

        try {

            const userId =
                socket?.user?.id ||
                socket?.user?._id;

            const roomId =
                data?.roomId ||
                data?.room_id ||
                data?.room;

            const messageId =
                data?.messageId ||
                data?.message_id ||
                data?._id;

            const content = data?.content;
            const type = data?.type;

            // Validate required identifiers.
            if (
                !userId ||
                !roomId ||
                !messageId ||
                !mongoose.Types.ObjectId.isValid(userId) ||
                !mongoose.Types.ObjectId.isValid(roomId) ||
                !mongoose.Types.ObjectId.isValid(messageId)
            ) {
                return sendError(
                    400,
                    "Invalid user, room or message ID"
                );
            }

            // Check whether update data was provided.
            const hasContent =
                Object.prototype.hasOwnProperty.call(
                    data,
                    "content"
                );

            const hasType =
                Object.prototype.hasOwnProperty.call(
                    data,
                    "type"
                );

            if (!hasContent && !hasType) {
                return sendError(
                    400,
                    "Insufficient data"
                );
            }

            if (
                hasContent &&
                typeof content !== "string"
            ) {
                return sendError(
                    400,
                    "Content must be a string"
                );
            }

            if (
                hasType &&
                (
                    typeof type !== "string" ||
                    !type.trim()
                )
            ) {
                return sendError(
                    400,
                    "Invalid message type"
                );
            }

            const updateFields = {};
            if (hasContent) {
                updateFields.content = content;
            }
            if (hasType) {
                updateFields.type = type.trim();
            }

            // Collapse findOne + save into single atomic findOneAndUpdate.
            let message;
            if (typeof MessageModel.findOneAndUpdate === "function") {
                message = await MessageModel.findOneAndUpdate(
                    {
                        _id: messageId,
                        sender: userId,
                        room: roomId
                    },
                    { $set: updateFields },
                    { new: true }
                );
            } else {
                message = await MessageModel.findOne({
                    _id: messageId,
                    sender: userId,
                    room: roomId
                });
                if (message) {
                    if (hasContent) message.content = content;
                    if (hasType) message.type = type.trim();
                    if (typeof message.save === "function") {
                        await message.save();
                    }
                }
            }

            if (!message) {
                return sendError(
                    403,
                    "Unauthorized"
                );
            }

            // 2. Build sender payload from authenticated socket user (avoids .populate).
            const senderImage = socket?.user?.imageUrl || socket?.user?.avatar || null;
            const responseMessage = {
                ...(typeof message.toObject === "function" ? message.toObject() : message),
                sender: {
                    _id: userId,
                    username: socket?.user?.username,
                    imageUrl: senderImage,
                    avatar: senderImage,
                },
            };

            // 3. Update Redis cache.
            // Redis failure must not undo MongoDB update.
            try {

                const updated = await updateMessageInRecentCache(
                    redis,
                    roomId.toString(),
                    responseMessage
                );

                if (!updated && isRedisReady(redis)) {
                    // Message was older than the cached window or cache not initialized.
                }

            } catch (redisError) {

                console.error(
                    "Failed to update message in Redis:",
                    redisError.message
                );
            }

            // 4. Emit updated message.
            const ioInstance =
                io ||
                (getSocketIO ? getSocketIO() : getIO());

            ioInstance.to(roomId.toString()).emit(
                "update_message",
                responseMessage
            );

            // 5. Return response via callback and success event.
            const responsePayload = {
                message: "Message updated",
                data: responseMessage
            };

            if (typeof callback === "function") {
                callback({
                    status: 200,
                    ...responsePayload
                });
            }

            socket?.emit(
                "message_update_success",
                responsePayload
            );

            return responseMessage;

        } catch (err) {

            console.error(
                "Failed to update message (socket):",
                err
            );

            return sendError(
                500,
                "failed messageUpdate",
                { error: err.message }
            );
        }
    };
};


/**
 * Socket.IO equivalent of messageDelete
 * Event: "delete_message"
 * Broadcasts: "delete_message" to room
 * Emits to sender: "message_delete_success" (or executes callback)
 */
const DELETE_RECENT_MESSAGE_SCRIPT = `
    local indexKey = KEYS[1]
    local dataKey = KEYS[2]

    local marker = ARGV[1]
    local messageId = ARGV[2]
    local ttl = tonumber(ARGV[3])

    if not redis.call("ZSCORE", indexKey, marker) then
        return 0
    end

    local removed = redis.call("ZREM", indexKey, messageId)
    redis.call("HDEL", dataKey, messageId)

    redis.call("EXPIRE", indexKey, ttl)
    redis.call("EXPIRE", dataKey, ttl)

    return removed
`;

const deleteMessageFromRecentCache = async (
    redis,
    roomId,
    messageId
) => {
    if (!isRedisReady(redis)) {
        recordCacheWrite("skipped");
        return false;
    }

    const keys = getRecentMessageKeys(roomId);
    const result = await redisEval(
        redis,
        DELETE_RECENT_MESSAGE_SCRIPT,
        [keys.index, keys.data],
        [
            RECENT_CACHE_MARKER,
            messageId.toString(),
            String(MESSAGE_CACHE_TTL)
        ]
    );

    if (result >= 1) {
        recordCacheWrite("delete");
    } else {
        recordCacheWrite("skipped");
    }
    return result >= 1;
};

const messageDeleteSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageDeleteSocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;
    let getSocketIO = getIO;
    let redis = null;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
        if (args[0].redis) redis = args[0].redis;
    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
        if (args[2]) redis = args[2];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId || data.sender;
            const roomId = data.roomId || data.room_id || data.room;
            const messageId = data.messageId || data.message_id || data._id;

            if (!id || !roomId || !messageId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing required parameters" });
                }
                socket?.emit("error", { message: "Missing required parameters" });
                return;
            }

            // Collapse findOne + deleteOne into single atomic findOneAndDelete.
            let message;
            if (typeof MessageModel.findOneAndDelete === "function") {
                message = await MessageModel.findOneAndDelete({
                    _id: messageId,
                    sender: id
                });
            } else {
                message = await MessageModel.findOne({ _id: messageId, sender: id });
                if (message && typeof MessageModel.deleteOne === "function") {
                    await MessageModel.deleteOne({ _id: messageId });
                }
            }

            if (!message) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "Unauthorized" });
                }
                socket?.emit("error", { message: "Unauthorized" });
                return;
            }

            try {
                await deleteMessageFromRecentCache(redis, roomId.toString(), message._id);
            } catch (redisError) {
                recordCacheError();
                console.error("Failed to remove deleted message from Redis cache:", redisError.message);
            }

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            ioInstance.to(roomId).emit("delete_message", message._id);

            if (typeof callback === "function") {
                callback({ status: 200, message: "message deleted", messageId: message._id });
            }
            socket?.emit("message_delete_success", { message: "message deleted", messageId: message._id });
            return { message: "message deleted", messageId: message._id };
        } catch (err) {
            console.log("failed to delete message (socket):", err);
            err.message = "failed messageDelete";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageDelete", error: err.message });
            }
            socket?.emit("error", { message: "failed messageDelete", error: err.message });
        }
    };
};

// =============================================
// LATEST 100 MESSAGE CACHE CONFIGURATION
// =============================================
const RECENT_MESSAGE_LIMIT = 100;
const MESSAGE_INITIAL_LIMIT = 60;
const MESSAGE_CACHE_TTL = 1800; // 30 minutes
const MESSAGE_LOCK_TTL = 10;

const RECENT_CACHE_MARKER = "__recent_cache_initialized__";

// =============================================
// REDIS KEYS
// =============================================

const getRecentMessageKeys = (roomId) => ({
    index: `chat:{${roomId}}:recent:index`,
    data: `chat:{${roomId}}:recent:data`,
    lock: `chat:{${roomId}}:recent:lock`
});
const addMessageToRecentCache = async (
    redis,
    roomId,
    message
) => {
    if (!isRedisReady(redis)) {
        recordCacheWrite("skipped");
        return false;
    }

    const keys = getRecentMessageKeys(roomId);

    const messageId = message._id.toString();

    const score = new Date(message.createdAt).getTime();

    if (!Number.isFinite(score)) {
        throw new Error("Invalid message timestamp");
    }

    const payload = JSON.stringify(
        typeof message.toObject === "function"
            ? message.toObject()
            : message
    );

    const result = await redisEval(
        redis,
        INSERT_RECENT_MESSAGE_SCRIPT,
        [keys.index, keys.data],
        [
            RECENT_CACHE_MARKER,
            messageId,
            String(score),
            payload,
            String(RECENT_MESSAGE_LIMIT),
            String(MESSAGE_CACHE_TTL)
        ]
    );

    // -1 means the cache has not been initialized.
    if (result === 1) {
        recordCacheWrite("insert");
    } else {
        recordCacheWrite("skipped");
    }
    return result === 1;
};
// =============================================
// ATOMIC CACHE INITIALIZATION SCRIPT
// =============================================

const INITIALIZE_RECENT_CACHE_SCRIPT = `
    local indexKey = KEYS[1]
    local dataKey = KEYS[2]

    local marker = ARGV[1]
    local ttl = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local count = tonumber(ARGV[4])

    -- Do not overwrite an existing initialized cache.
    if redis.call("ZSCORE", indexKey, marker) then
        return 0
    end

    redis.call("DEL", indexKey, dataKey)

    -- Marker also supports empty rooms.
    redis.call(
        "ZADD",
        indexKey,
        -9007199254740991,
        marker
    )

    redis.call("HSET", dataKey, marker, "1")

    local position = 5

    for i = 1, count do

        local messageId = ARGV[position]
        local score = tonumber(ARGV[position + 1])
        local payload = ARGV[position + 2]

        redis.call(
            "ZADD",
            indexKey,
            score,
            messageId
        )

        redis.call(
            "HSET",
            dataKey,
            messageId,
            payload
        )

        position = position + 3
    end

    -- Keep the newest 100 messages.
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
            redis.call(
                "HDEL",
                dataKey,
                messageId
            )
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

// =============================================
// CACHE INSERTION SCRIPT
// =============================================

const INSERT_RECENT_MESSAGE_SCRIPT = `
    local indexKey = KEYS[1]
    local dataKey = KEYS[2]

    local marker = ARGV[1]
    local messageId = ARGV[2]
    local score = tonumber(ARGV[3])
    local payload = ARGV[4]
    local limit = tonumber(ARGV[5])
    local ttl = tonumber(ARGV[6])

    -- Cache must already be initialized.
    if not redis.call("ZSCORE", indexKey, marker) then
        return -1
    end

    redis.call("ZADD", indexKey, score, messageId)
    redis.call("HSET", dataKey, messageId, payload)

    local total = redis.call("ZCARD", indexKey)
    local excess = total - 1 - limit

    if excess > 0 then

        local oldest = redis.call(
            "ZRANGE",
            indexKey,
            1,
            excess
        )

        for _, id in ipairs(oldest) do
            redis.call("HDEL", dataKey, id)
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

// =============================================
// CACHE INITIALIZATION
// =============================================

const initializeRecentMessageCache = async (
    redis,
    roomId,
    messages
) => {

    const keys = getRecentMessageKeys(roomId);

    // Input messages: newest to oldest.
    // Redis insertion: oldest to newest.
    const orderedMessages = [...messages].reverse();

    const args = [
        RECENT_CACHE_MARKER,
        String(MESSAGE_CACHE_TTL),
        String(RECENT_MESSAGE_LIMIT),
        String(orderedMessages.length)
    ];

    for (const message of orderedMessages) {

        const messageId = message._id.toString();

        const score = new Date(
            message.createdAt
        ).getTime();

        if (!Number.isFinite(score)) {
            throw new Error("Invalid message timestamp");
        }

        args.push(
            messageId,
            String(score),
            JSON.stringify(message)
        );
    }

    return redisEval(
        redis,
        INITIALIZE_RECENT_CACHE_SCRIPT,
        [keys.index, keys.data],
        args
    );
};

// =============================================
// ATOMIC CACHE RETRIEVAL SCRIPT
// =============================================

const GET_RECENT_MESSAGES_SCRIPT = `
    local indexKey = KEYS[1]
    local dataKey = KEYS[2]

    local marker = ARGV[1]
    local limit = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])

    -- Cache must be initialized.
    if not redis.call("ZSCORE", indexKey, marker) then
        return false
    end

    -- Fetch only up to (limit + 1) newest IDs so marker can be skipped if present.
    local ids = redis.call("ZREVRANGE", indexKey, 0, limit)
    local messageIds = {}

    for _, id in ipairs(ids) do
        if id ~= marker then
            table.insert(messageIds, id)
            if #messageIds >= limit then
                break
            end
        end
    end

    if #messageIds == 0 then
        redis.call("EXPIRE", indexKey, ttl)
        redis.call("EXPIRE", dataKey, ttl)
        return {}
    end

    local payloads = redis.call("HMGET", dataKey, unpack(messageIds))

    for i = 1, #messageIds do
        if not payloads[i] then
            return redis.error_reply("ERR Recent cache inconsistency")
        end
    end

    -- Refresh sliding expiration atomically.
    redis.call("EXPIRE", indexKey, ttl)
    redis.call("EXPIRE", dataKey, ttl)

    return payloads
`;

// =============================================
// CACHE RETRIEVAL
// =============================================

const getRecentMessagesFromCache = async (
    redis,
    roomId,
    limit = RECENT_MESSAGE_LIMIT
) => {

    const keys = getRecentMessageKeys(roomId);
    const effectiveLimit = Math.min(
        Math.max(Number(limit) || RECENT_MESSAGE_LIMIT, 1),
        RECENT_MESSAGE_LIMIT
    );

    const payloads = await redisEval(
        redis,
        GET_RECENT_MESSAGES_SCRIPT,
        [keys.index, keys.data],
        [
            RECENT_CACHE_MARKER,
            String(effectiveLimit),
            String(MESSAGE_CACHE_TTL)
        ]
    );

    if (payloads === null || payloads === undefined) {
        return null;
    }

    if (!Array.isArray(payloads)) {
        throw new Error("Unexpected recent cache response");
    }

    if (payloads.length === 0) {
        return [];
    }

    if (payloads.some(payload => !payload)) {
        throw new Error("Recent cache inconsistency");
    }

    const messages = payloads.map(payload =>
        JSON.parse(payload)
    );

    // Oldest to newest.
    return messages.reverse();
};

// =============================================
// CACHE INVALIDATION
// =============================================

const invalidateRecentMessageCache = async (
    redis,
    roomId
) => {

    const keys = getRecentMessageKeys(roomId);

    await redisDel(redis, [
        keys.index,
        keys.data
    ]);
};

// =============================================
// FETCH LATEST 100 FROM MONGODB
// =============================================

const fetchLatestRoomMessages = async (
    MessageModel,
    roomId
) => {

    return MessageModel.find({
        room: new mongoose.Types.ObjectId(roomId)
    })
        .sort({
            createdAt: -1,
            _id: -1
        })
        .limit(RECENT_MESSAGE_LIMIT)
        .populate(
            "sender",
            "username imageUrl avatar"
        )
        .lean();
};

// =============================================
// SAFE CACHE INITIALIZATION LOCK RELEASE
// =============================================

const RELEASE_RECENT_LOCK_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
    end

    return 0
`;

// =============================================
// GET LATEST MESSAGES WITH REDIS
// =============================================

const getLatestRoomMessages = async (
    MessageModel,
    redis,
    roomId,
    limit = RECENT_MESSAGE_LIMIT
) => {

    // Redis unavailable: MongoDB fallback.
    if (!isRedisReady(redis)) {
        recordCacheFallback();

        const messages = await fetchLatestRoomMessages(
            MessageModel,
            roomId
        );

        return messages.reverse();
    }

    const keys = getRecentMessageKeys(roomId);

    // 1. Check cache.
    try {

        const cached = await getRecentMessagesFromCache(
            redis,
            roomId,
            limit
        );

        if (cached !== null) {
            recordCacheHit();
            return cached;
        }

    } catch (error) {
        recordCacheError();

        console.error(
            "Recent message cache read error:",
            error.message
        );

        try {
            await invalidateRecentMessageCache(
                redis,
                roomId
            );
        } catch (invalidateError) {
            console.error(
                "Recent cache invalidation error:",
                invalidateError.message
            );
        }
    }

    // 2. Acquire initialization lock.
    const lockToken = randomUUID();

    let lockAcquired = false;

    try {

        const result = await redisSetLock(
            redis,
            keys.lock,
            lockToken,
            MESSAGE_LOCK_TTL
        );

        lockAcquired = result === "OK";

    } catch (error) {
        recordCacheError();

        console.error(
            "Recent cache lock error:",
            error.message
        );
    }

    // 3. Another request is initializing.
    if (!lockAcquired) {

        for (let i = 0; i < 20; i++) {

            await new Promise(resolve =>
                setTimeout(resolve, 50)
            );

            try {

                const cached = await getRecentMessagesFromCache(
                    redis,
                    roomId,
                    limit
                );

                if (cached !== null) {
                    recordCacheHit();
                    return cached;
                }

            } catch (error) {
                recordCacheError();

                console.error(
                    "Recent cache retry error:",
                    error.message
                );

                break;
            }
        }

        // MongoDB fallback.
        recordCacheMiss();
        const messages = await fetchLatestRoomMessages(
            MessageModel,
            roomId
        );

        return messages.reverse();
    }

    try {

        // 4. Check cache again after lock acquisition.
        let cached = null;

        try {

            cached = await getRecentMessagesFromCache(
                redis,
                roomId,
                limit
            );

        } catch (error) {
            recordCacheError();

            console.error(
                "Recent cache recheck error:",
                error.message
            );

            try {
                await invalidateRecentMessageCache(
                    redis,
                    roomId
                );
            } catch {
                // Continue with MongoDB.
            }
        }

        if (cached !== null) {
            recordCacheHit();
            return cached;
        }

        // 5. Fetch latest 100 from MongoDB.
        recordCacheMiss();
        const messages = await fetchLatestRoomMessages(
            MessageModel,
            roomId
        );

        // 6. Initialize Redis.
        try {

            await initializeRecentMessageCache(
                redis,
                roomId,
                messages
            );
            recordCacheWrite("init");

        } catch (error) {
            recordCacheError();

            console.error(
                "Recent cache initialization error:",
                error.message
            );
        }

        // 7. Return MongoDB result.
        return messages.reverse();

    } finally {

        // 8. Release our own lock only.
        try {

            await redisEval(
                redis,
                RELEASE_RECENT_LOCK_SCRIPT,
                [keys.lock],
                [lockToken]
            );

        } catch (error) {

            console.error(
                "Recent cache lock release error:",
                error.message
            );
        }
    }
};

// =============================================
// NEW MESSAGE DISPLAY SOCKET HANDLER
// =============================================

const messageDisplaySocket = ({
    message_Model: MessageModel = message_Model,
    redis = null,
    paginationSecret = process.env.MESSAGE_CURSOR_SECRET
} = {}) => {

    return async (data, socket, io, callback) => {

        const sendResponse = (response) => {

            if (typeof callback === "function") {
                return callback(response);
            }

            socket?.emit(
                "message_display",
                response
            );
        };

        try {

            const roomId = typeof data === "string"
                ? data
                : (
                    data?.roomId ||
                    data?.room_id ||
                    data?.room
                );

            const requestedLimit =
                typeof data === "object" && data !== null
                    ? parseInt(data.limit, 10)
                    : MESSAGE_INITIAL_LIMIT;

            const initialLimit = Number.isFinite(requestedLimit)
                ? Math.min(
                    Math.max(requestedLimit, 1),
                    RECENT_MESSAGE_LIMIT
                )
                : MESSAGE_INITIAL_LIMIT;

            // Validate room ID.
            if (
                !roomId ||
                !mongoose.Types.ObjectId.isValid(roomId)
            ) {

                return sendResponse({
                    status: 400,
                    message: "A valid roomId is required"
                });
            }

            const normalizedRoomId = roomId.toString();

            // Retrieve latest messages from cache (scoped to initialLimit) or MongoDB.
            const recentMessages = await getLatestRoomMessages(
                MessageModel,
                redis,
                normalizedRoomId,
                initialLimit
            );

            // Return requested number of latest messages.
            const messages = recentMessages.slice(
                -initialLimit
            );

            return sendResponse({
                status: 200,
                roomId: normalizedRoomId,
                messages,
                message: messages,
                hasMore: false,
                nextCursor: null
            });

        } catch (error) {

            console.error(
                "Failed to display recent messages:",
                error
            );

            return sendResponse({
                status: 500,
                message: "Failed to display messages"
            });
        }
    };
};


/**
 * Socket.IO equivalent of messageRead
 * Event: "read_message"
 * Broadcasts: "readUpdate_message" to room
 * Emits to caller: "message_read_success" (or executes callback)
 */
const messageReadSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageReadSocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId;
            let roomId, messageId;

            if (typeof data === "string" && typeof socket === "string") {
                roomId = data;
                messageId = socket;
                socket = io;
                io = arguments[3];
                callback = arguments[4];
            } else {
                roomId = data.roomId || data.room_id || data.room;
                messageId = data.messageId || data.message_id || data._id;
            }

            if (!id || !roomId || !messageId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing required parameters" });
                }
                socket?.emit("error", { message: "Missing required parameters" });
                return;
            }

            // Collapse findOne + save into single atomic updateOne with $addToSet.
            let result;
            if (typeof MessageModel.updateOne === "function") {
                result = await MessageModel.updateOne(
                    { _id: messageId, room: roomId },
                    { $addToSet: { readBy: id } }
                );
            } else {
                const msg = await MessageModel.findOne({ _id: messageId });
                if (msg) {
                    if (Array.isArray(msg.readBy) && !msg.readBy.includes(id)) {
                        msg.readBy.push(id);
                        if (typeof msg.save === "function") await msg.save();
                    }
                    result = { matchedCount: 1, modifiedCount: 1 };
                } else {
                    result = { matchedCount: 0, modifiedCount: 0 };
                }
            }

            if (!result || (result.matchedCount ?? result.n ?? 0) === 0) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "the message does not exist" });
                }
                socket?.emit("error", { message: "the message does not exist" });
                return;
            }

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            socket?.to(roomId.toString()).emit("readUpdate_message", {
                room_id: roomId,
                user_id: id,
                lastReadMessageId: messageId,
            });

            if (typeof callback === "function") {
                callback({ status: 200, message: "message marked as read" });
            }
            if (typeof socket?.emit === "function") {
                socket.emit("message_read_success", { message: "message marked as read", messageId });
            }
            return { _id: messageId, room: roomId, readBy: id };
        } catch (err) {
            console.log("failed to mark message read (socket):", err);
            err.message = "failed messageRead";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageRead", error: err.message });
            }
            if (typeof socket?.emit === "function") {
                socket.emit("error", { message: "failed messageRead", error: err.message });
            }
        }
    };
};

// Aliases matching handle* convention
const handleMessageCreate = messageCreateSocket;
const handleMessageUpdate = messageUpdateSocket;
const handleMessageDelete = messageDeleteSocket;
const handleMessageDisplay = messageDisplaySocket;
const handleMessageRead = messageReadSocket;
const handleMessageSend = messageCreateSocket;

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Express Handlers (for backwards compatibility & unit tests)
// ─────────────────────────────────────────────────────────────────────────────

const messageCreate = (MessageModel = message_Model, getSocketIO = getIO) =>
  async (req, res, next) => {
    try {
      const { id } = req.user;
      const { roomId } = req.params;
      const { content } = req.body;

      const imageUrl = req.file ? req.file.path : null;
      const textContent = content?.trim() || "";

      if (!textContent && !imageUrl) {
        return res.status(400).json({ message: "Content or image is required" });
      }

      const type = imageUrl ? (textContent ? "mixed" : "image") : "text";

      const message = new MessageModel({
        sender: id,
        room: roomId,
        content: textContent,
        imageUrl: imageUrl,
        type: type,
      });

      await message.save();
      if (typeof message.populate === "function") {
        await message.populate("sender", "username imageUrl avatar");
      }

      const io = getSocketIO();
      io.to(roomId).emit("message_new", message);

      return res.status(201).json({ 
        message: "Message created successfully", 
        data: message 
      });
    } catch (err) {
      console.error("failed to create new message:", err);
      err.message = "failed messageCreate";
      next(err);
    }
  };

const messageUpdate = (MessageModel = message_Model, getSocketIO = getIO) =>
    async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, messageId } = req.params;
        const message = await MessageModel.findOne({ _id: messageId, sender: id });
        if (!message) return res.status(403).json({ message: "Unauthorized" });
        const { content, type } = req.body;
        if (!content && !type) return res.status(404).json({ message: "Insufficent data" });
        if (content) message.content = content;
        if (type) message.type = type;
        await message.save();
        const io = getSocketIO();
        io.to(roomId).emit("update_message", message);
        res.status(200).json({ message: "message updated" });
    }
    catch (err) {
        console.log("failed to update message");
        err.message = "failed messageUpdate";
        next(err);
    }
};

const messageDelete = (MessageModel = message_Model, getSocketIO = getIO) =>
    async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, messageId } = req.params;
        let message;
        if (typeof MessageModel.findOneAndDelete === "function") {
            message = await MessageModel.findOneAndDelete({ _id: messageId, sender: id });
        } else {
            message = await MessageModel.findOne({ _id: messageId, sender: id });
            if (message && typeof MessageModel.deleteOne === "function") {
                await MessageModel.deleteOne({ _id: messageId });
            }
        }
        if (!message) return res.status(403).json({ message: "Unauthorized" });
        const io = getSocketIO();
        io.to(roomId).emit("delete_message", message._id);
        res.status(200).json({ message: "message deleted" });
    }
    catch (err) {
        console.log("failed to delete message");
        err.message = "failed messageDelete";
        next(err);
    }
};

const messageDisplay = (MessageModel = message_Model) =>
    async (req, res, next) => {
    try {
        const { roomId } = req.params;
        let query = MessageModel.find({ room: roomId });
        if (query && typeof query.populate === "function") {
            query = query.populate("sender", "username imageUrl avatar");
        }
        const message = await query;
        return res.status(200).json({ message });
    }
    catch (err) {
        console.log("failed to display message");
        err.message = "failed messageDisplay";
        next(err);
    }
};

export {
    messageCreateSocket,
    messageUpdateSocket,
    messageDeleteSocket,
    messageDisplaySocket,
    messageReadSocket,
    handleMessageCreate,
    handleMessageUpdate,
    handleMessageDelete,
    handleMessageDisplay,
    handleMessageRead,
    handleMessageSend,
    messageCreate,
    messageUpdate,
    messageDelete,
    messageDisplay,
};