import "../helpers/setup.js";
import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";
import { makeFakeRedis } from "../helpers/redis.js";
import { fakeIO, fakeGetIO } from "../helpers/socket.js";
import {
    getBotId,
    processRoomDigest,
    runDigestTick,
    _resetBotId,
} from "../../jobs/digest.job.js";

// ---------------------------------------------------------------------------
// getBotId
// ---------------------------------------------------------------------------
describe("getBotId", () => {
    it("creates AI Mentor bot if not found and returns _id", async () => {
        _resetBotId();

        const FakeUserModel = {
            findOne: mock.fn(async () => null),
            create: mock.fn(async () => ({ _id: "bot_1" })),
        };
        const fakeBcrypt = {
            hash: mock.fn(async () => "hashed"),
        };

        const id = await getBotId(FakeUserModel, fakeBcrypt);

        assert.strictEqual(id, "bot_1");
        assert.strictEqual(FakeUserModel.create.mock.callCount(), 1);
        const createArgs = FakeUserModel.create.mock.calls[0].arguments[0];
        assert.strictEqual(createArgs.username, "AI Mentor");
        assert.strictEqual(createArgs.password, "hashed");
        assert.strictEqual(createArgs.status, "bot");
    });

    it("returns cached botId on second call without hitting DB again", async () => {
        _resetBotId();

        const FakeUserModel = {
            findOne: mock.fn(async () => null),
            create: mock.fn(async () => ({ _id: "bot_2" })),
        };
        const fakeBcrypt = {
            hash: mock.fn(async () => "hashed"),
        };

        // First call — hits DB
        const id1 = await getBotId(FakeUserModel, fakeBcrypt);
        // Second call — should use cache
        const id2 = await getBotId(FakeUserModel, fakeBcrypt);

        assert.strictEqual(id1, "bot_2");
        assert.strictEqual(id2, "bot_2");
        // findOne should only have been called once
        assert.strictEqual(FakeUserModel.findOne.mock.callCount(), 1);
    });
});

// ---------------------------------------------------------------------------
// processRoomDigest
// ---------------------------------------------------------------------------
describe("processRoomDigest", () => {
    const group = { _id: { toString: () => "room_1" }, entries: ["entry text"] };
    const mentorId = "mentor_1";
    const todayStr = "2025-01-01";

    it("skips processing if room already marked done in Redis", async () => {
        const fakeRedis = makeFakeRedis();
        fakeRedis.sismember = mock.fn(async () => 1); // already done

        const digestFn = mock.fn(async () => "Great work!");

        await processRoomDigest(group, mentorId, todayStr, {
            redisClient: fakeRedis,
            digestFn,
        });

        assert.strictEqual(digestFn.mock.callCount(), 0);
    });

    it("generates digest, saves journal, emits socket, marks redis done", async () => {
        const fakeRedis = makeFakeRedis(); // sismember returns 0 by default

        const savedJournal = { _id: "j_1", content: "summary" };
        const fakeSave = mock.fn(async () => savedJournal);

        // JournalModel is used as a constructor
        function FakeJournalModel(data) {
            this.data = data;
            this.save = fakeSave;
        }

        const digestFn = mock.fn(async () => "Great work!");
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        await processRoomDigest(group, mentorId, todayStr, {
            redisClient: fakeRedis,
            JournalModel: FakeJournalModel,
            digestFn,
            getSocketIO,
        });

        // digestFn called with the entries
        assert.strictEqual(digestFn.mock.callCount(), 1);
        assert.deepStrictEqual(digestFn.mock.calls[0].arguments[0], group.entries);

        // journal saved
        assert.strictEqual(fakeSave.mock.callCount(), 1);

        // socket emitted
        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], "room_1");

        // redis marked done
        assert.strictEqual(fakeRedis.sadd.mock.callCount(), 1);
        assert.strictEqual(fakeRedis.expire.mock.callCount(), 1);
    });

    it("swallows error if digestFn throws (does not rethrow)", async () => {
        const fakeRedis = makeFakeRedis(); // sismember returns 0

        const digestFn = mock.fn(async () => {
            throw new Error("AI exploded");
        });

        // Should resolve normally without throwing
        await assert.doesNotReject(() =>
            processRoomDigest(group, mentorId, todayStr, {
                redisClient: fakeRedis,
                digestFn,
            })
        );
    });

    it("swallows error if JournalModel.save throws", async () => {
        const fakeRedis = makeFakeRedis(); // sismember returns 0

        const fakeSave = mock.fn(async () => {
            throw new Error("DB write failed");
        });

        function FakeJournalModel() {
            this.save = fakeSave;
        }

        const digestFn = mock.fn(async () => "digest text");

        await assert.doesNotReject(() =>
            processRoomDigest(group, mentorId, todayStr, {
                redisClient: fakeRedis,
                JournalModel: FakeJournalModel,
                digestFn,
            })
        );
    });
});

// ---------------------------------------------------------------------------
// runDigestTick
// ---------------------------------------------------------------------------
describe("runDigestTick", () => {
    it("does nothing if aggregate returns empty array", async () => {
        const FakeJournalModel = {
            aggregate: mock.fn(async () => []),
        };
        const processRoomFn = mock.fn(async () => {});

        await runDigestTick({
            getBotIdFn: mock.fn(async () => "mentor_1"),
            JournalModel: FakeJournalModel,
            processRoomFn,
        });

        assert.strictEqual(processRoomFn.mock.callCount(), 0);
    });

    it("calls processRoomFn for each room group", async () => {
        const group1 = { _id: "room_A", entries: ["a"] };
        const group2 = { _id: "room_B", entries: ["b"] };

        const FakeJournalModel = {
            aggregate: mock.fn(async () => [group1, group2]),
        };
        const processRoomFn = mock.fn(async () => {});

        await runDigestTick({
            getBotIdFn: mock.fn(async () => "mentor_1"),
            JournalModel: FakeJournalModel,
            processRoomFn,
        });

        assert.strictEqual(processRoomFn.mock.callCount(), 2);

        const calledGroups = processRoomFn.mock.calls.map(
            (c) => c.arguments[0]
        );
        assert.ok(calledGroups.includes(group1));
        assert.ok(calledGroups.includes(group2));
    });

    it("swallows error if getBotIdFn throws", async () => {
        await assert.doesNotReject(() =>
            runDigestTick({
                getBotIdFn: mock.fn(async () => {
                    throw new Error("DB down");
                }),
            })
        );
    });
});
