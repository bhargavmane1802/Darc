// Tests for journal.controller.displayEntries
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import "../helpers/setup.js";
import { displayEntries } from "../../controllers/journal.controller.js";
import { mockReq, mockRes, mockNext } from "../helpers/express.js";
import { makeChainableQuery } from "../helpers/models.js";

describe("journal.controller.displayEntries", () => {
  let JournalModel;
  let req, res, next;
  let capturedChain;

  beforeEach(() => {
    const chain = makeChainableQuery([{ _id: "j1", content: "hello" }]);
    capturedChain = chain;
    JournalModel = { find: mock.fn(() => chain) };
    req = mockReq({ params: { roomId: "room_1" } });
    res = mockRes();
    next = mockNext();
  });

  it("happy path: calls find().select().populate().lean() and sends the array", async () => {
    const handler = displayEntries(JournalModel);
    await handler(req, res, next);

    assert.strictEqual(JournalModel.find.mock.callCount(), 1);
    assert.deepStrictEqual(JournalModel.find.mock.calls[0].arguments[0], { room: "room_1" });
    assert.strictEqual(capturedChain.select.mock.callCount(), 1);
    assert.strictEqual(capturedChain.populate.mock.callCount(), 1);
    assert.strictEqual(capturedChain.populate.mock.calls[0].arguments[0], "author");
    assert.strictEqual(capturedChain.populate.mock.calls[0].arguments[1], "username");
    assert.strictEqual(capturedChain.lean.mock.callCount(), 1);
    assert.strictEqual(res.send.mock.callCount(), 1);
    assert.deepStrictEqual(res.send.mock.calls[0].arguments[0], [{ _id: "j1", content: "hello" }]);
    assert.strictEqual(next.mock.callCount(), 0);
  });

  it("returns an empty array when no entries exist", async () => {
    const chain = makeChainableQuery([]);
    JournalModel.find = mock.fn(() => chain);
    const handler = displayEntries(JournalModel);
    await handler(req, res, next);

    assert.deepStrictEqual(res.send.mock.calls[0].arguments[0], []);
    assert.strictEqual(next.mock.callCount(), 0);
  });

  it("passes a tagged error to next() when find throws", async () => {
    JournalModel.find = mock.fn(() => { throw new Error("db down"); });
    const handler = displayEntries(JournalModel);
    await handler(req, res, next);

    assert.strictEqual(next.mock.callCount(), 1);
    const err = next.mock.calls[0].arguments[0];
    assert.ok(err instanceof Error);
    assert.strictEqual(err.message, "Failed displayEntries");
    assert.strictEqual(res.send.mock.callCount(), 0);
  });
});
