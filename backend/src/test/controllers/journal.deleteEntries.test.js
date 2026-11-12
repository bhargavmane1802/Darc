// Tests for journal.controller.deleteEntries (cascading delete)
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import "../helpers/setup.js";
import { deleteEntries } from "../../controllers/journal.controller.js";
import { mockReq, mockRes, mockNext } from "../helpers/express.js";
import { fakeGetIO, fakeIO } from "../helpers/socket.js";
import { makeFakeRedis } from "../helpers/redis.js";

describe("journal.controller.deleteEntries", () => {
  let JournalModel, pcIndex, redisClient, getIO, io;
  let req, res, next;

  beforeEach(() => {
    io = fakeIO();
    getIO = fakeGetIO(io);
    pcIndex = { deleteOne: mock.fn(async () => {}) };
    redisClient = makeFakeRedis();
    req = mockReq({
      params: { roomId: "room_1", journalId: "j1" },
      user: { id: "u1" },
    });
    res = mockRes();
    next = mockNext();
  });

  it("happy path: cascades through Mongo -> Pinecone -> Redis -> emit", async () => {
    const findOne = mock.fn(async () => ({ _id: "j1", author: "u1" }));
    const deleteOne = mock.fn(async () => ({ deletedCount: 1 }));
    JournalModel = { findOne, deleteOne };

    const handler = deleteEntries(JournalModel, pcIndex, redisClient, getIO);
    await handler(req, res, next);

    assert.strictEqual(findOne.mock.callCount(), 1);
    assert.strictEqual(deleteOne.mock.callCount(), 1);
    assert.deepStrictEqual(deleteOne.mock.calls[0].arguments[0], { _id: "j1" });

    assert.strictEqual(pcIndex.deleteOne.mock.callCount(), 1);
    assert.deepStrictEqual(pcIndex.deleteOne.mock.calls[0].arguments[0], { id: "j1" });

    assert.strictEqual(redisClient.del.mock.callCount(), 1);
    assert.strictEqual(redisClient.del.mock.calls[0].arguments[0], "ai_response:room:room_1:journal:j1");

    assert.strictEqual(io.to.mock.callCount(), 1);
    assert.strictEqual(io.to.mock.calls[0].arguments[0], "room_1");
    assert.strictEqual(io.emit.mock.callCount(), 1);
    assert.strictEqual(io.emit.mock.calls[0].arguments[0], "delete_journal");
    assert.deepStrictEqual(io.emit.mock.calls[0].arguments[1], { entry_id: "j1" });

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: "journal deleted" });
    assert.strictEqual(next.mock.callCount(), 0);
  });

  it("returns 403 and short-circuits when journal not owned / not found", async () => {
    const findOne = mock.fn(async () => null);
    const deleteOne = mock.fn();
    JournalModel = { findOne, deleteOne };

    const handler = deleteEntries(JournalModel, pcIndex, redisClient, getIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: "Unauthorized or entry not found" });
    assert.strictEqual(deleteOne.mock.callCount(), 0);
    assert.strictEqual(pcIndex.deleteOne.mock.callCount(), 0);
    assert.strictEqual(redisClient.del.mock.callCount(), 0);
    assert.strictEqual(io.emit.mock.callCount(), 0);
  });

  it("passes a tagged error to next() when Pinecone deleteOne throws", async () => {
    const findOne = mock.fn(async () => ({ _id: "j1", author: "u1" }));
    const deleteOne = mock.fn(async () => ({ deletedCount: 1 }));
    JournalModel = { findOne, deleteOne };
    pcIndex.deleteOne = mock.fn(async () => { throw new Error("pinecone down"); });

    const handler = deleteEntries(JournalModel, pcIndex, redisClient, getIO);
    await handler(req, res, next);

    assert.strictEqual(next.mock.callCount(), 1);
    const err = next.mock.calls[0].arguments[0];
    assert.ok(err instanceof Error);
    assert.strictEqual(err.message, "Failed deleteEntries");
    // Mongo delete already happened, but emit and res should not have been reached
    assert.strictEqual(io.emit.mock.callCount(), 0);
    assert.strictEqual(res.status.mock.callCount(), 0);
  });

  it("passes a tagged error to next() when Redis del throws", async () => {
    const findOne = mock.fn(async () => ({ _id: "j1", author: "u1" }));
    const deleteOne = mock.fn(async () => ({ deletedCount: 1 }));
    JournalModel = { findOne, deleteOne };
    redisClient.del = mock.fn(async () => { throw new Error("redis down"); });

    const handler = deleteEntries(JournalModel, pcIndex, redisClient, getIO);
    await handler(req, res, next);

    assert.strictEqual(next.mock.callCount(), 1);
    const err = next.mock.calls[0].arguments[0];
    assert.ok(err instanceof Error);
    assert.strictEqual(err.message, "Failed deleteEntries");
    // Mongo and Pinecone completed; emit and res should not have been reached
    assert.strictEqual(pcIndex.deleteOne.mock.callCount(), 1);
    assert.strictEqual(io.emit.mock.callCount(), 0);
    assert.strictEqual(res.status.mock.callCount(), 0);
  });
});
