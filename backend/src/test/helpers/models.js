// Helpers for faking Mongoose models in unit tests.
// Each helper returns a constructor or query stub that mirrors the real API.

import { mock } from "node:test";

/**
 * Build a fake Mongoose model constructor.
 *   - Records every `new FakeModel(data)` call.
 *   - Each instance has a default `save()` (override via overrides.save).
 *   - Each instance has a default `populate()` chainable (override via overrides.populate).
 *   - Each instance has a default `toString()` returning the id (override via overrides.toString).
 *
 * @param {object} opts
 *   opts.save      - async function called for .save() on instances
 *   opts.populate  - async function called for .populate() on instances
 *   opts.toString  - function called for .toString() on instances
 *   opts.id        - id returned by .id (default "fake_id_<callCount>")
 *   opts.instanceOverrides - extra fields attached to every instance
 */
export const makeFakeModel = (opts = {}) => {
  const calls = [];
  const FakeModel = mock.fn(function (data) {
    calls.push(data);
    this.data = data;
    this.id = opts.id ? (typeof opts.id === "function" ? opts.id(calls.length) : opts.id) : `fake_id_${calls.length}`;
    if (opts.toString) this.toString = opts.toString;
    else this.toString = () => this.id;
    if (opts.populate) this.populate = opts.populate;
    else this.populate = mock.fn(async function () { return this; });
    if (opts.save) this.save = opts.save;
    else this.save = mock.fn(async () => this);
    if (opts.instanceOverrides) Object.assign(this, opts.instanceOverrides);
  });
  FakeModel.calls = calls;
  return FakeModel;
};

/**
 * Build a chainable Mongoose query stub.
 *   - .select, .populate, .lean, .sort, .limit all return the chain.
 *   - Awaiting the chain (or calling .exec()) resolves to `terminal`.
 *
 * @param {*} terminal - the value to resolve when awaited.
 */
export const makeChainableQuery = (terminal) => {
  const chain = {
    select: mock.fn(() => chain),
    populate: mock.fn(() => chain),
    lean: mock.fn(() => chain),
    sort: mock.fn(() => chain),
    limit: mock.fn(() => chain),
    exec: mock.fn(async () => terminal),
  };
  // Make the chain itself thenable, resolving to `terminal`.
  chain.then = (resolve) => Promise.resolve(terminal).then(resolve);
  // `await entry.select("reaction")` works via thenable.
  return chain;
};

/**
 * Build a fake `Model.aggregate(pipeline)` that returns `returns`.
 */
export const makeFakeAggregate = (returns) =>
  mock.fn(async () => returns);

/**
 * Build a fake `Model.exists(query)` that returns `returns`.
 */
export const makeFakeExists = (returns) =>
  mock.fn(async () => returns);

/**
 * Build a fake Mongoose model with a static .find/.findOne/.findById/etc.
 * that returns a chainable resolving to `terminal`.
 */
export const makeFakeModelWithStatics = (terminal, opts = {}) => {
  const chain = makeChainableQuery(terminal);
  const FakeModel = mock.fn();
  FakeModel.find = opts.find ?? mock.fn(() => chain);
  FakeModel.findOne = opts.findOne ?? mock.fn(() => chain);
  FakeModel.findById = opts.findById ?? mock.fn(() => chain);
  FakeModel.findOneAndUpdate = opts.findOneAndUpdate ?? mock.fn(async () => terminal);
  FakeModel.findByIdAndUpdate = opts.findByIdAndUpdate ?? mock.fn(async () => terminal);
  FakeModel.updateOne = opts.updateOne ?? mock.fn(async () => ({ modifiedCount: 1 }));
  FakeModel.deleteOne = opts.deleteOne ?? mock.fn(async () => ({ deletedCount: 1 }));
  FakeModel.create = opts.create ?? mock.fn(async () => terminal);
  FakeModel.exists = opts.exists ?? mock.fn(async () => terminal);
  FakeModel.aggregate = opts.aggregate ?? mock.fn(async () => terminal);
  return FakeModel;
};
