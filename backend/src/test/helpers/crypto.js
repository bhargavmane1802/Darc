// Helpers for faking crypto / id-generation libraries.

import { mock } from "node:test";

/**
 * Fake bcrypt with spy methods. Override behavior per test by reassigning fields.
 *   - hash: returns "hashed_<input>"
 *   - compare: returns true
 */
export const makeFakeBcrypt = (overrides = {}) => ({
  hash: mock.fn(async (pw) => `hashed_${pw}`),
  compare: mock.fn(async () => true),
  ...overrides,
});

/**
 * Fake jsonwebtoken with spy methods.
 *   - sign: returns "signed.jwt"
 *   - verify: returns { id: "u1", username: "u1" } (override .verify to throw for failure paths)
 */
export const makeFakeJwt = (overrides = {}) => ({
  sign: mock.fn(() => "signed.jwt"),
  verify: mock.fn(() => ({ id: "u1", username: "u1" })),
  ...overrides,
});

/**
 * Fake nanoid that returns a fixed string by default.
 */
export const makeFakeNanoid = (value = "ABCDEFGHIJ") =>
  mock.fn(() => value);
