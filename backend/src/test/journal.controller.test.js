// src/test/journal.controller.test.js
import "./helpers/setup.js";
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createEntries } from "../controllers/journal.controller.js"; // Adjust path to your controller

describe("createEntries Controller (with Dependency Injection)", () => {
  it("creates a journal entry successfully with content and triggers queue & socket", async () => {
    // 1. Arrange: Fake Saved Result
    const fakeSavedJournal = {
      id: "journal_123",
      author: "user_456",
      room: "room_789",
      content: "Today was productive",
      imageUrl: null,
      populate: mock.fn(async function (field, select) {
        this.author = { username: "alex" };
        return this;
      }),
    };

    // 2. Arrange: Fake Dependencies to Inject
    const saveSpy = mock.fn(async () => fakeSavedJournal);
    const FakeJournalModel = mock.fn(function (data) {
      this.data = data;
      this.save = saveSpy;
    });

    const fakeQueue = {
      add: mock.fn(async () => ({ id: "job_1" })),
    };

    const emitSpy = mock.fn();
    const toSpy = mock.fn(() => ({ emit: emitSpy }));
    const fakeGetIO = mock.fn(() => ({ to: toSpy }));

    // 3. Arrange: Express req, res, next
    const req = {
      params: { roomId: "room_789" },
      user: { id: "user_456" },
      body: { content: "Today was productive", imageUrl: null },
    };

    const res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
    const next = mock.fn();

    // 4. Act: Instantiate controller with fake dependencies and execute
    const handler = createEntries(FakeJournalModel, fakeQueue, fakeGetIO);
    await handler(req, res, next);

    // 5. Assert: Model instantiation & save
    assert.strictEqual(FakeJournalModel.mock.callCount(), 1);
    assert.deepStrictEqual(FakeJournalModel.mock.calls[0].arguments[0], {
      author: "user_456",
      room: "room_789",
      content: "Today was productive",
      imageUrl: null,
    });
    assert.strictEqual(saveSpy.mock.callCount(), 1);

    // 5. Assert: Queue job addition
    assert.strictEqual(fakeQueue.add.mock.callCount(), 1);
    assert.strictEqual(fakeQueue.add.mock.calls[0].arguments[0], "createEmbedding");
    assert.deepStrictEqual(fakeQueue.add.mock.calls[0].arguments[1], {
      journalId: "journal_123",
      content: "Today was productive",
    });
    assert.deepStrictEqual(fakeQueue.add.mock.calls[0].arguments[2], {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    // 5. Assert: Socket emission to the specific room
    assert.strictEqual(toSpy.mock.callCount(), 1);
    assert.strictEqual(toSpy.mock.calls[0].arguments[0], "room_789");
    assert.strictEqual(emitSpy.mock.callCount(), 1);
    assert.strictEqual(emitSpy.mock.calls[0].arguments[0], "create_journal");

    // 5. Assert: HTTP Response & no error passed to next
    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 201);
    assert.strictEqual(res.json.mock.calls[0].arguments[0], "journal entry created");
    assert.strictEqual(next.mock.callCount(), 0);
  });

  
  // Test 2: Image-only Entry (Queue Should NOT be called)

  it("creates an image-only entry and skips enqueuing embedding job", async () => {
    const fakeSavedJournal = {
      id: "journal_999",
      author: "user_456",
      room: "room_789",
      content: null,
      imageUrl: "https://example.com/photo.png",
      populate: mock.fn(async function () {
        return this;
      }),
    };

    const FakeJournalModel = mock.fn(function () {
      this.save = mock.fn(async () => fakeSavedJournal);
    });
    const fakeQueue = {
      add: mock.fn(async () => {}),
    };
    const fakeGetIO = mock.fn(() => ({
      to: mock.fn(() => ({ emit: mock.fn() })),
    }));

    const req = {
      params: { roomId: "room_789" },
      user: { id: "user_456" },
      body: { content: null, imageUrl: "https://example.com/photo.png" },
    };
    const res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
    const next = mock.fn();

    const handler = createEntries(FakeJournalModel, fakeQueue, fakeGetIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.calls[0].arguments[0], 201);
    // Queue should not run when content is null/empty
    assert.strictEqual(fakeQueue.add.mock.callCount(), 0);
    assert.strictEqual(next.mock.callCount(), 0);
  });

  // Test 3: Validation Failure - Missing User ID
  
  it("returns 404 if user id is missing", async () => {
    const FakeJournalModel = mock.fn();
    const fakeQueue = { add: mock.fn() };
    const fakeGetIO = mock.fn();

    const req = {
      params: { roomId: "room_789" },
      user: {}, // No id
      body: { content: "Sample content" },
    };
    const res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
    const next = mock.fn();

    const handler = createEntries(FakeJournalModel, fakeQueue, fakeGetIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
      message: "Insufficient",
    });
    // DB, Queue, and Sockets should never be touched
    assert.strictEqual(FakeJournalModel.mock.callCount(), 0);
    assert.strictEqual(next.mock.callCount(), 0);
  });


  // Test 4: Validation Failure - Missing Content AND ImageUrl
  
  it("returns 404 if both content and imageUrl are missing", async () => {
    const FakeJournalModel = mock.fn();
    const fakeQueue = { add: mock.fn() };
    const fakeGetIO = mock.fn();

    const req = {
      params: { roomId: "room_789" },
      user: { id: "user_456" },
      body: { content: "", imageUrl: null }, // Both missing
    };
    const res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
    const next = mock.fn();

    const handler = createEntries(FakeJournalModel, fakeQueue, fakeGetIO);
    await handler(req, res, next);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
      message: "Insufficient",
    });
    assert.strictEqual(FakeJournalModel.mock.callCount(), 0);
  });

  
  // Test 5: Error Handling - Database Save Fails
  
  it("catches errors, assigns error message, and passes it to next()", async () => {
    // Model that throws during save()
    const FakeJournalModel = mock.fn(function () {
      this.save = mock.fn(async () => {
        throw new Error("Database query failed");
      });
    });
    const fakeQueue = { add: mock.fn() };
    const fakeGetIO = mock.fn();

    const req = {
      params: { roomId: "room_789" },
      user: { id: "user_456" },
      body: { content: "Will fail at DB save", imageUrl: null },
    };
    const res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
    const next = mock.fn();

    const handler = createEntries(FakeJournalModel, fakeQueue, fakeGetIO);
    await handler(req, res, next);

    // Verify error was passed to next()
    assert.strictEqual(next.mock.callCount(), 1);
    const passedError = next.mock.calls[0].arguments[0];
    assert.strictEqual(passedError.message, "Failed createEntries");

    // Ensure status 201 was never sent
    assert.strictEqual(res.status.mock.callCount(), 0);
  });
});