// Helpers for faking the ioredis client used throughout the backend.
// `multi().exec()` returns the [ [err, val], ... ] shape that real ioredis returns.

import { mock } from "node:test";

/**
 * Build a fake ioredis client.
 *   - Every method is a mock.fn() that resolves to a sensible default.
 *   - Override per test by reassigning fields, or use script() to queue a sequence.
 *
 * Each call also pushes onto a `calls` log for easy assertion of the call shape.
 */
export const makeFakeRedis = (overrides = {}) => {
  const fake = {
    calls: { incr: [], expire: [], get: [], set: [], del: [], sadd: [], smembers: [], sismember: [], srem: [], multi: [] },
    incr: mock.fn(async (key) => {
      fake.calls.incr.push(key);
      return 1;
    }),
    expire: mock.fn(async (key, ttl) => {
      fake.calls.expire.push({ key, ttl });
      return 1;
    }),
    get: mock.fn(async (key) => {
      fake.calls.get.push(key);
      return null;
    }),
    set: mock.fn(async (key, value, ...rest) => {
      fake.calls.set.push({ key, value, rest });
      return "OK";
    }),
    del: mock.fn(async (key) => {
      fake.calls.del.push(key);
      return 1;
    }),
    sadd: mock.fn(async (key, member) => {
      fake.calls.sadd.push({ key, member });
      return 1;
    }),
    smembers: mock.fn(async (key) => {
      fake.calls.smembers.push(key);
      return [];
    }),
    sismember: mock.fn(async (key, member) => {
      fake.calls.sismember.push({ key, member });
      return 0;
    }),
    srem: mock.fn(async (key, member) => {
      fake.calls.srem.push({ key, member });
      return 1;
    }),
    on: mock.fn(),
    ...overrides,
  };

  // multi() returns a chainable that ends with exec().
  // exec() returns the standard [ [err, val], ... ] shape.
  const multi = (overrides.exec ? overrides.exec : mock.fn(async () => [
    [null, 1],
    [null, 1],
    [null, []],
  ]));
  fake.multi = mock.fn(() => {
    const chain = {
      sadd: mock.fn(() => chain),
      srem: mock.fn(() => chain),
      smembers: mock.fn(() => chain),
      sismember: mock.fn(() => chain),
      expire: mock.fn(() => chain),
      get: mock.fn(() => chain),
      set: mock.fn(() => chain),
      del: mock.fn(() => chain),
      exec: multi,
    };
    return chain;
  });
  return fake;
};
