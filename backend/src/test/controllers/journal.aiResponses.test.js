// Tests for journal.controller.aiResponses (SSE streaming, 5 branches)
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import "../helpers/setup.js";
import { aiResponses } from "../../controllers/journal.controller.js";
import { mockReq, mockRes, mockNext, captureSSE } from "../helpers/express.js";
import { makeFakeRedis } from "../helpers/redis.js";
import { makeAsyncIterable } from "../helpers/socket.js";

describe("journal.controller.aiResponses", () => {
  let JournalModel, redisClient, pcIndex, aiService;
  let req, res, next;

  beforeEach(() => {
    redisClient = makeFakeRedis();
    pcIndex = { query: mock.fn(), update: mock.fn() };
    aiService = { getAIFeedback: mock.fn() };
    req = mockReq({
      params: { roomId: "room_1", journalId: "j1" },
      user: { id: "u1" },
    });
    res = mockRes();
    next = mockNext();
  });

  it("cache hit: writes SSE payload from Redis and signals DONE, no DB or AI call", async () => {
    redisClient.get = mock.fn(async () => "cached answer");
    JournalModel = { findOne: mock.fn() };
    const handler = aiResponses(JournalModel, redisClient, pcIndex, aiService);
    const payloads = captureSSE(res);

    await handler(req, res, next);

    assert.strictEqual(redisClient.get.mock.callCount(), 1);
    assert.strictEqual(JournalModel.findOne.mock.callCount(), 0);
    assert.strictEqual(aiService.getAIFeedback.mock.callCount(), 0);
    assert.deepStrictEqual(payloads, [
      { token: "cached answer" },
      { token: "[DONE]" },
    ]);
  });

  it("DB hit: writes stored aiResponse, re-hydrates cache with 24h TTL, no AI call", async () => {
    redisClient.get = mock.fn(async () => null);
    redisClient.set = mock.fn(async () => "OK");
    JournalModel = {
      findOne: mock.fn(async () => ({ _id: "j1", author: "u1", room: "room_1", content: "x", aiResponse: "stored answer" })),
    };
    const handler = aiResponses(JournalModel, redisClient, pcIndex, aiService);
    const payloads = captureSSE(res);

    await handler(req, res, next);

    assert.strictEqual(JournalModel.findOne.mock.callCount(), 1);
    assert.strictEqual(aiService.getAIFeedback.mock.callCount(), 0);
    assert.deepStrictEqual(payloads, [
      { token: "stored answer" },
      { token: "[DONE]" },
    ]);
    // Cache re-hydrated with 24h TTL
    assert.strictEqual(redisClient.set.mock.callCount(), 1);
    assert.deepStrictEqual(redisClient.set.mock.calls[0].arguments, [
      "ai_response:room:room_1:journal:j1",
      "stored answer",
      "EX",
      86400,
    ]);
  });

  it("entry not found: writes error SSE, no AI call", async () => {
    redisClient.get = mock.fn(async () => null);
    JournalModel = { findOne: mock.fn(async () => null) };
    const handler = aiResponses(JournalModel, redisClient, pcIndex, aiService);
    const payloads = captureSSE(res);

    await handler(req, res, next);

    assert.deepStrictEqual(payloads, [{ error: "entry not found " }]);
    assert.strictEqual(aiService.getAIFeedback.mock.callCount(), 0);
  });

  it("cold path: queries Pinecone, streams tokens, saves Mongo+Redis+PC metadata, ends with [DONE]", async () => {
    redisClient.get = mock.fn(async () => null);
    redisClient.set = mock.fn(async () => "OK");
    const entry = {
      _id: "j1", author: "u1", room: "room_1", content: "fresh",
      embedding: [0.1, 0.2],
      save: mock.fn(async function () { return this; }),
    };
    JournalModel = { findOne: mock.fn(async () => entry) };
    pcIndex.query = mock.fn(async () => ({
      matches: [
        { id: "past_a", metadata: { content: "yesterday", aiResponse: "ok" } },
        { id: "j1", metadata: { content: "fresh", aiResponse: "" } },
        { id: "past_b", metadata: { content: "day before", aiResponse: "" } },
      ],
    }));
    pcIndex.update = mock.fn(() => ({ catch: mock.fn() }));
    aiService.getAIFeedback = mock.fn(async () => makeAsyncIterable(["Hello ", "world", "!"]));

    const handler = aiResponses(JournalModel, redisClient, pcIndex, aiService);
    const payloads = captureSSE(res);

    await handler(req, res, next);

    // Pinecone query was made with topK 3, room+author filter
    assert.strictEqual(pcIndex.query.mock.callCount(), 1);
    const qArgs = pcIndex.query.mock.calls[0].arguments[0];
    assert.strictEqual(qArgs.topK, 3);
    assert.deepStrictEqual(qArgs.filter, {
      roomId: { $eq: "room_1" },
      authorId: { $eq: "u1" },
    });

    // Past entries filtered (j1 dropped) and sliced to 2
    assert.strictEqual(aiService.getAIFeedback.mock.callCount(), 1);
    const past = aiService.getAIFeedback.mock.calls[0].arguments[1];
    assert.strictEqual(past.length, 2);
    assert.strictEqual(past[0].content, "yesterday");
    assert.strictEqual(past[1].content, "day before");

    // SSE stream in order
    assert.deepStrictEqual(payloads, [
      { token: "Hello " },
      { token: "world" },
      { token: "!" },
      { token: "[DONE]" },
    ]);

    // entry.save called, redis set with full response, pinecone update called
    assert.strictEqual(entry.save.mock.callCount(), 1);
    assert.strictEqual(redisClient.set.mock.callCount(), 1);
    assert.deepStrictEqual(redisClient.set.mock.calls[0].arguments, [
      "ai_response:room:room_1:journal:j1",
      "Hello world!",
      "EX",
      86400,
    ]);
    assert.strictEqual(pcIndex.update.mock.callCount(), 1);
    const updArgs = pcIndex.update.mock.calls[0].arguments[0];
    assert.strictEqual(updArgs.id, "j1");
    assert.deepStrictEqual(updArgs.metadata, {
      roomId: "room_1",
      authorId: "u1",
      content: "fresh",
      aiResponse: "Hello world!",
    });
  });

  it("stream throws: writes {error: 'Stream failed'} SSE", async () => {
    redisClient.get = mock.fn(async () => null);
    const entry = {
      _id: "j1", author: "u1", room: "room_1", content: "fresh",
      embedding: [0.1], save: mock.fn(async function () { return this; }),
    };
    JournalModel = { findOne: mock.fn(async () => entry) };
    pcIndex.query = mock.fn(async () => ({ matches: [] }));
    aiService.getAIFeedback = mock.fn(async () => {
      throw new Error("upstream AI down");
    });

    const handler = aiResponses(JournalModel, redisClient, pcIndex, aiService);
    const payloads = captureSSE(res);

    await handler(req, res, next);

    assert.deepStrictEqual(payloads, [{ error: "Stream failed" }]);
  });
});
