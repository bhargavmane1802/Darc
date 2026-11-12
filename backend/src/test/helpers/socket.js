// Helpers for faking Socket.IO server / client objects.

import { mock } from "node:test";

/**
 * Build a fake `io` object with the only API used in this codebase:
 *   io.to(roomId).emit(event, payload)
 */
export const fakeIO = () => {
  const emit = mock.fn();
  const to = mock.fn(() => ({ emit }));
  return { to, emit };
};

/**
 * Build a fake `getIO` function that always returns the given io (default fakeIO()).
 */
export const fakeGetIO = (io = fakeIO()) => mock.fn(() => io);

/**
 * Build a fake socket object matching the shape used in src/sockets/socket.js.
 * Pass overrides for any field. The .rooms field is a real Set.
 */
export const fakeSocket = (overrides = {}) => {
  const sock = {
    id: "sock_1",
    user: { id: "user_1", username: "tester" },
    handshake: { auth: {} },
    rooms: new Set(),
    join: mock.fn(),
    leave: mock.fn(),
    emit: mock.fn(),
    on: mock.fn(),
    to: mock.fn(() => ({ emit: mock.fn() })),
    ...overrides,
  };
  return sock;
};

/**
 * Build an async iterable from an array of items. Each item's .text() method
 * (matching the @google/generative-ai stream chunk shape) is called and returned.
 */
export const makeAsyncIterable = (chunks) => {
  const items = chunks.map((c) =>
    typeof c === "string" ? { text: () => c } : c
  );
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => {
          if (i >= items.length) return { value: undefined, done: true };
          return { value: items[i++], done: false };
        },
      };
    },
  };
};
