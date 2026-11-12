// Tests for journal.controller.updateEntries
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import "../helpers/setup.js";
// import { updateEntries } from "../../controllers/journal.controller.js";
import { mockReq, mockRes, mockNext } from "../helpers/express.js";
import { fakeGetIO, fakeIO } from "../helpers/socket.js";

describe.skip("journal.controller.updateEntries (functionality removed)", () => {
  let JournalModel, getIO, io;
  let req, res, next;

  beforeEach(() => {
    io = fakeIO();
    getIO = fakeGetIO(io);
    req = mockReq({
      params: { roomId: "room_1", journalId: "j1" },
      user: { id: "u1" },
      body: { content: "new content" },
    });
    res = mockRes();
    next = mockNext();
  });

  it("happy path: updates content, saves, emits update_journal, returns 200", async () => {
    const saveSpy = mock.fn(async function () { return this; });
    const JournalModel = { findOne: mock.fn(async () => ({ _id: "j1", content: "old", save: saveSpy })) };
    const handler = updateEntries(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(JournalModel.findOne.mock.callCount(), 1);
    assert.deepStrictEqual(JournalModel.findOne.mock.calls[0].arguments[0], { _id: "j1", author: "u1" });
    assert.strictEqual(saveSpy.mock.callCount(), 1);
    assert.strictEqual(io.to.mock.callCount(), 1);
    assert.strictEqual(io.to.mock.calls[0].arguments[0], "room_1");
    assert.strictEqual(io.emit.mock.callCount(), 1);
    assert.strictEqual(io.emit.mock.calls[0].arguments[0], "update_journal");
    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: "journal updated" });
    assert.strictEqual(next.mock.callCount(), 0);
  });

  it("returns 404 with 'Insufficient' when content is missing", async () => {
    const JournalModel = { findOne: mock.fn() };
    req.body = { content: "" };
    const handler = updateEntries(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: "Insufficient" });
    assert.strictEqual(JournalModel.findOne.mock.callCount(), 0);
    assert.strictEqual(io.emit.mock.callCount(), 0);
  });

  it("returns 403 'Unauthorized' when journal not found / not owner", async () => {
    const JournalModel = { findOne: mock.fn(async () => null) };
    const handler = updateEntries(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: "Unauthorized" });
    assert.strictEqual(io.emit.mock.callCount(), 0);
  });

  it("passes a tagged error to next() when save throws", async () => {
    const saveSpy = mock.fn(async function () { throw new Error("save failed"); });
    const JournalModel = { findOne: mock.fn(async () => ({ _id: "j1", content: "old", save: saveSpy })) };
    const handler = updateEntries(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(next.mock.callCount(), 1);
    const err = next.mock.calls[0].arguments[0];
    assert.ok(err instanceof Error);
    assert.strictEqual(err.message, "Failed updateEntries");
    assert.strictEqual(res.status.mock.callCount(), 0);
  });
});
