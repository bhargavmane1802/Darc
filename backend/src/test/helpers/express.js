// Helpers for faking Express req/res/next in unit tests.
// Res uses chainable status() like real Express.

import { mock } from "node:test";

/**
 * Build a fake Express req object. Pass overrides for any field.
 * Defaults: empty params/body/headers, no user.
 */
export const mockReq = (overrides = {}) => ({
  params: {},
  body: {},
  headers: {},
  user: undefined,
  ...overrides,
});

/**
 * Build a fake Express res object. All methods are mock.fn() spies.
 * status() returns res for chaining (matches real Express).
 */
export const mockRes = () => {
  const res = {
    status: mock.fn(() => res),
    json: mock.fn(() => res),
    send: mock.fn(() => res),
    set: mock.fn(() => res),
    setHeader: mock.fn(() => res),
    write: mock.fn(() => true),
    end: mock.fn(() => res),
    flushHeaders: mock.fn(() => res),
    redirect: mock.fn(() => res),
  };
  return res;
};

export const mockNext = () => mock.fn();

/**
 * Parse every res.write("data: <json>\n\n") call into a payload array.
 * Used for SSE stream assertions.
 */
export const captureSSE = (res) => {
  const payloads = [];
  // Replace res.write with a recorder that still delegates to the spy.
  const originalWrite = res.write;
  res.write = mock.fn((chunk) => {
    if (typeof chunk === "string" && chunk.startsWith("data: ")) {
      // strip "data: " prefix and trailing "\n\n"
      const json = chunk.slice(6).replace(/\n+$/, "");
      try {
        payloads.push(JSON.parse(json));
      } catch {
        payloads.push({ raw: json });
      }
    }
    return originalWrite.mock.callCount() >= 0 ? true : true;
  });
  return payloads;
};
