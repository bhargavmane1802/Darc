import "../helpers/setup.js";
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { makeAsyncIterable } from "../helpers/socket.js";
import {
  getAIFeedback,
  generateRoomDigest,
  generateEmbeddings,
} from "../../services/ai.service.js";

// ---------------------------------------------------------------------------
// getAIFeedback
// ---------------------------------------------------------------------------
describe("getAIFeedback", () => {
  it("calls getGenerativeModel and returns stream", async () => {
    const fakeStream = makeAsyncIterable(["hello"]);
    const fakeGenAI = {
      getGenerativeModel: mock.fn(() => ({
        generateContentStream: mock.fn(async () => ({ stream: fakeStream })),
      })),
    };

    const fn = getAIFeedback(fakeGenAI);
    const result = await fn("entry", []);

    assert.strictEqual(result, fakeStream);
    assert.strictEqual(fakeGenAI.getGenerativeModel.mock.callCount(), 1);
    assert.strictEqual(
      fakeGenAI.getGenerativeModel.mock.calls[0].arguments[0].model,
      "gemini-2.5-flash"
    );
  });

  it("includes past entries in context blocks", async () => {
    const fakeStream = makeAsyncIterable([]);
    let capturedArgs;
    const fakeModel = {
      generateContentStream: mock.fn(async (args) => {
        capturedArgs = args;
        return { stream: fakeStream };
      }),
    };
    const fakeGenAI = { getGenerativeModel: mock.fn(() => fakeModel) };

    const fn = getAIFeedback(fakeGenAI);
    await fn("my entry", [
      { content: "past entry 1", aiResponse: "ai resp 1" },
      { content: "past entry 2", aiResponse: null },
    ]);

    // The first element is the systemPrompt string
    const systemPrompt = capturedArgs[0];
    assert.ok(
      systemPrompt.includes("past entry 1"),
      "prompt should include past entry 1 content"
    );
    assert.ok(
      systemPrompt.includes("past entry 2"),
      "prompt should include past entry 2 content"
    );
    assert.ok(
      systemPrompt.includes("ai resp 1"),
      "prompt should include prior AI response"
    );
    assert.ok(
      systemPrompt.includes("No prior analysis recorded for this entry."),
      "prompt should handle null aiResponse"
    );
    // The second element is the live entry content
    assert.strictEqual(capturedArgs[1], "my entry");
  });

  it("throws wrapped error if generateContentStream throws", async () => {
    const fakeModel = {
      generateContentStream: mock.fn(async () => {
        throw new Error("network failure");
      }),
    };
    const fakeGenAI = { getGenerativeModel: mock.fn(() => fakeModel) };

    const fn = getAIFeedback(fakeGenAI);
    await assert.rejects(
      () => fn("entry", []),
      (err) => {
        assert.strictEqual(
          err.message,
          "Failed to initialize generative feedback stream"
        );
        return true;
      }
    );
  });

  it("handles empty pastEntries array", async () => {
    const fakeStream = makeAsyncIterable([]);
    let capturedPrompt;
    const fakeModel = {
      generateContentStream: mock.fn(async (args) => {
        capturedPrompt = args[0];
        return { stream: fakeStream };
      }),
    };
    const fakeGenAI = { getGenerativeModel: mock.fn(() => fakeModel) };

    const fn = getAIFeedback(fakeGenAI);
    const result = await fn("entry", []);

    assert.strictEqual(result, fakeStream);
    assert.ok(
      capturedPrompt.includes(
        "No past tracking logs available for this user in this room."
      ),
      "should fall back to no-past-logs message"
    );
  });
});

// ---------------------------------------------------------------------------
// generateRoomDigest
// ---------------------------------------------------------------------------
describe("generateRoomDigest", () => {
  it("returns response text from model", async () => {
    const fakeGenAI = {
      getGenerativeModel: mock.fn(() => ({
        generateContent: mock.fn(async () => ({
          response: { text: () => "summary" },
        })),
      })),
    };

    const fn = generateRoomDigest(fakeGenAI);
    const result = await fn([{ content: "fixed a bug" }]);

    assert.strictEqual(result, "summary");
  });

  it("joins entries with dashes", async () => {
    let capturedPrompt;
    const fakeModel = {
      generateContent: mock.fn(async (prompt) => {
        capturedPrompt = prompt;
        return { response: { text: () => "ok" } };
      }),
    };
    const fakeGenAI = { getGenerativeModel: mock.fn(() => fakeModel) };

    const fn = generateRoomDigest(fakeGenAI);
    await fn([{ content: "alpha" }, { content: "beta" }]);

    assert.ok(capturedPrompt.includes("- alpha"), "should prefix with dash");
    assert.ok(capturedPrompt.includes("- beta"), "should prefix with dash");
  });

  it("throws if model throws", async () => {
    const fakeGenAI = {
      getGenerativeModel: mock.fn(() => ({
        generateContent: mock.fn(async () => {
          throw new Error("model exploded");
        }),
      })),
    };

    const fn = generateRoomDigest(fakeGenAI);
    await assert.rejects(() => fn([{ content: "x" }]), /model exploded/);
  });
});

// ---------------------------------------------------------------------------
// generateEmbeddings
// ---------------------------------------------------------------------------
describe("generateEmbeddings", () => {
  it("returns empty array for empty text", async () => {
    const fn = generateEmbeddings();
    const result = await fn("");
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array for whitespace-only text", async () => {
    const fn = generateEmbeddings();
    const result = await fn("   ");
    assert.deepStrictEqual(result, []);
  });

  it("returns embedding values on success", async () => {
    const FakeGoogleGenAI = mock.fn(function () {
      this.models = {
        embedContent: mock.fn(async () => ({
          embeddings: [{ values: [0.1, 0.2] }],
        })),
      };
    });

    const fn = generateEmbeddings(FakeGoogleGenAI);
    const result = await fn("some text");

    assert.deepStrictEqual(result, [0.1, 0.2]);
    assert.strictEqual(FakeGoogleGenAI.mock.callCount(), 1);
  });

  it("throws wrapped error if embedContent throws", async () => {
    const FakeGoogleGenAI = mock.fn(function () {
      this.models = {
        embedContent: mock.fn(async () => {
          throw new Error("embed failure");
        }),
      };
    });

    const fn = generateEmbeddings(FakeGoogleGenAI);
    await assert.rejects(
      () => fn("some text"),
      (err) => {
        assert.strictEqual(err.message, "Failed to process text semantic layer.");
        return true;
      }
    );
  });
});
