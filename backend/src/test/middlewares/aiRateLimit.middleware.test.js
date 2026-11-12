import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { makeFakeRedis } from '../helpers/redis.js';
import aiRateLimit from '../../middlewares/aiRateLimit.middleware.js';

describe('aiRateLimit', () => {
    it('sets expire when count == 1 (first call of the day)', async () => {
        const fakeRedis = makeFakeRedis(); // default incr returns 1
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        const handler = aiRateLimit(fakeRedis);
        await handler(req, res, next);

        assert.strictEqual(fakeRedis.expire.mock.callCount(), 1);
        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments.length, 0); // next() with no error
    });

    it('does not set expire when count > 1', async () => {
        const fakeRedis = makeFakeRedis({ incr: mock.fn(async () => 5) });
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        const handler = aiRateLimit(fakeRedis);
        await handler(req, res, next);

        assert.strictEqual(fakeRedis.expire.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 1);
    });

    it('returns 429 when count exceeds limit (>10)', async () => {
        const fakeRedis = makeFakeRedis({ incr: mock.fn(async () => 11) });
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        const handler = aiRateLimit(fakeRedis);
        await handler(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 429);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if redis.incr throws', async () => {
        const fakeRedis = makeFakeRedis({ incr: mock.fn(async () => { throw new Error('redis down'); }) });
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        const handler = aiRateLimit(fakeRedis);
        await handler(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.ok(next.mock.calls[0].arguments[0] instanceof Error);
        assert.strictEqual(next.mock.calls[0].arguments[0].message, 'Failed aiRateLimit');
    });
});
