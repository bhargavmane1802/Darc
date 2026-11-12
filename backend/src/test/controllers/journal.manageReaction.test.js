// Tests for journal.controller.manageReaction
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import "../helpers/setup.js";
import { manageReaction } from "../../controllers/journal.controller.js";
import { mockReq, mockRes, mockNext } from "../helpers/express.js";
import { fakeGetIO, fakeIO } from "../helpers/socket.js";

describe("journal.controller.manageReaction", () => {
  let JournalModel, getIO, io;
  let req, res, next;

  beforeEach(() => {
    io = fakeIO();
    getIO = fakeGetIO(io);
    req = mockReq({
      params: { journalId: "j1" },
      user: { id: "u1" },
      body: { emoji: "👍" },
    });
    res = mockRes();
    next = mockNext();
  });

  it("creates a new reaction group via findByIdAndUpdate $push when emoji group does not exist", async () => {
    let findByIdCalls = 0;
    const findById = mock.fn(() => {
      findByIdCalls++;
      if (findByIdCalls === 1) return Promise.resolve({ _id: "j1", room: "r1", reaction: [] });
      if (findByIdCalls === 2) return { select: mock.fn(async () => ({ reaction: [{ emoji: "👍", users: ["u1"] }] })) };
    });
    const findByIdAndUpdate = mock.fn(async () => ({}));
    const updateOne = mock.fn(async () => ({}));
    JournalModel = { findById, findByIdAndUpdate, updateOne };

    const handler = manageReaction(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(findByIdAndUpdate.mock.callCount(), 1);
    assert.deepStrictEqual(findByIdAndUpdate.mock.calls[0].arguments[0], "j1");
    assert.deepStrictEqual(findByIdAndUpdate.mock.calls[0].arguments[1], {
      $push: { reaction: { emoji: "👍", users: ["u1"] } },
    });
    assert.strictEqual(updateOne.mock.callCount(), 0);
    assert.strictEqual(io.to.mock.callCount(), 1);
    assert.strictEqual(io.to.mock.calls[0].arguments[0], "r1");
    assert.strictEqual(io.emit.mock.callCount(), 1);
    assert.strictEqual(io.emit.mock.calls[0].arguments[0], "reaction_journal");
    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], [{ emoji: "👍", users: ["u1"] }]);
  });

  it("adds the user via $addToSet when group exists and user has not reacted", async () => {
    let findByIdCalls = 0;
    const findById = mock.fn(() => {
      findByIdCalls++;
      if (findByIdCalls === 1) return Promise.resolve({ _id: "j1", room: "r1", reaction: [{ emoji: "👍", users: ["u_other"] }] });
      if (findByIdCalls === 2) return { select: mock.fn(async () => ({ reaction: [{ emoji: "👍", users: ["u_other", "u1"] }] })) };
    });
    const findByIdAndUpdate = mock.fn();
    const updateOne = mock.fn(async () => ({}));
    JournalModel = { findById, findByIdAndUpdate, updateOne };

    const handler = manageReaction(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(updateOne.mock.callCount(), 1);
    assert.deepStrictEqual(updateOne.mock.calls[0].arguments[0], { _id: "j1", "reaction.emoji": "👍" });
    assert.deepStrictEqual(updateOne.mock.calls[0].arguments[1], { $addToSet: { "reaction.$.users": "u1" } });
    assert.strictEqual(findByIdAndUpdate.mock.callCount(), 0);
  });

  it("removes the user via $pull when group exists and user has already reacted", async () => {
    let findByIdCalls = 0;
    const findById = mock.fn(() => {
      findByIdCalls++;
      if (findByIdCalls === 1) return Promise.resolve({ _id: "j1", room: "r1", reaction: [{ emoji: "👍", users: ["u1", "u_other"] }] });
      if (findByIdCalls === 2) return { select: mock.fn(async () => ({ reaction: [{ emoji: "👍", users: ["u_other"] }] })) };
    });
    const findByIdAndUpdate = mock.fn();
    const updateOne = mock.fn(async () => ({}));
    JournalModel = { findById, findByIdAndUpdate, updateOne };

    const handler = manageReaction(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(updateOne.mock.callCount(), 1);
    assert.deepStrictEqual(updateOne.mock.calls[0].arguments[1], { $pull: { "reaction.$.users": "u1" } });
    assert.strictEqual(findByIdAndUpdate.mock.callCount(), 0);
  });

  it("returns 404 'Insufficient' when the journal entry is not found", async () => {
    const findById = mock.fn(async () => null);
    const findByIdAndUpdate = mock.fn();
    const updateOne = mock.fn();
    JournalModel = { findById, findByIdAndUpdate, updateOne };

    const handler = manageReaction(JournalModel, getIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: "Insufficient" });
    assert.strictEqual(findByIdAndUpdate.mock.callCount(), 0);
    assert.strictEqual(updateOne.mock.callCount(), 0);
    assert.strictEqual(io.emit.mock.callCount(), 0);
  });
});
