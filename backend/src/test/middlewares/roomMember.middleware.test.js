import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { verifyRoom } from '../../middlewares/roomMember.middlware.js';

describe('verifyRoom', () => {
    it('returns 403 if roomId or user id is missing', async () => {
        const FakeRoomModel = { exists: mock.fn(async () => ({ _id: 'r1' })) };
        const req = mockReq({ params: {}, user: { id: 'u1' } }); // roomId is undefined
        const res = mockRes();
        const next = mockNext();

        const handler = verifyRoom(FakeRoomModel);
        await handler(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
        assert.strictEqual(next.mock.callCount(), 0);
        assert.strictEqual(FakeRoomModel.exists.mock.callCount(), 0);
    });

    it('returns 403 if room does not exist or user is not a member', async () => {
        const FakeRoomModel = { exists: mock.fn(async () => null) }; // returns falsy
        const req = mockReq({ params: { roomId: 'room123' }, user: { id: 'u1' } });
        const res = mockRes();
        const next = mockNext();

        const handler = verifyRoom(FakeRoomModel);
        await handler(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
        assert.strictEqual(next.mock.callCount(), 0);
        assert.strictEqual(FakeRoomModel.exists.mock.callCount(), 1);
    });

    it('calls next() on valid membership', async () => {
        const FakeRoomModel = { exists: mock.fn(async () => ({ _id: 'r1' })) }; // returns truthy
        const req = mockReq({ params: { roomId: 'room123' }, user: { id: 'u1' } });
        const res = mockRes();
        const next = mockNext();

        const handler = verifyRoom(FakeRoomModel);
        await handler(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments.length, 0); // next() with no error
        assert.strictEqual(FakeRoomModel.exists.mock.callCount(), 1);
    });
});
