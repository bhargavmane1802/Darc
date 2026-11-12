import "../helpers/setup.js";
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { sendVerificationEmail } from "../../services/email.service.js";

// ---------------------------------------------------------------------------
// sendVerificationEmail
// ---------------------------------------------------------------------------
describe("sendVerificationEmail", () => {
  it("calls gmail.users.messages.send with correct userId", async () => {
    const fakeGmail = {
      users: { messages: { send: mock.fn(async () => ({})) } },
    };

    const fn = sendVerificationEmail(fakeGmail);
    await fn("test@example.com", "token123");

    assert.strictEqual(fakeGmail.users.messages.send.mock.callCount(), 1);
    assert.strictEqual(
      fakeGmail.users.messages.send.mock.calls[0].arguments[0].userId,
      "me"
    );
  });

  it("encodes email as base64url (replaces +, /, =)", async () => {
    let capturedRaw;
    const fakeGmail = {
      users: {
        messages: {
          send: mock.fn(async ({ requestBody }) => {
            capturedRaw = requestBody.raw;
          }),
        },
      },
    };

    const fn = sendVerificationEmail(fakeGmail);
    await fn("r@example.com", "tok");

    assert.ok(capturedRaw !== undefined, "raw payload should be captured");
    assert.ok(!capturedRaw.includes("+"), "should not contain +");
    assert.ok(!capturedRaw.includes("/"), "should not contain /");
    assert.ok(!/=+$/.test(capturedRaw), "should not have trailing =");
  });

  it("does not throw if gmail.send fails (swallows error)", async () => {
    const fakeGmail = {
      users: {
        messages: {
          send: mock.fn(async () => {
            throw new Error("send failed");
          }),
        },
      },
    };

    const fn = sendVerificationEmail(fakeGmail);
    // Should resolve without throwing
    await assert.doesNotReject(() => fn("err@example.com", "tok"));
  });

  it("includes recipient email in the To: header", async () => {
    let capturedRaw;
    const fakeGmail = {
      users: {
        messages: {
          send: mock.fn(async ({ requestBody }) => {
            capturedRaw = requestBody.raw;
          }),
        },
      },
    };

    const fn = sendVerificationEmail(fakeGmail);
    await fn("recipient@example.com", "tok");

    // Decode base64url back to the original email string
    const decoded = Buffer.from(
      capturedRaw.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");

    assert.ok(
      decoded.includes("To: recipient@example.com"),
      "decoded email should contain the To: header with recipient address"
    );
  });
});
