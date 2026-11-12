import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { makeFakeJwt } from '../helpers/crypto.js';
import validate_auth from '../../middlewares/auth.middlware.js';

describe('validate_auth', () => {
    it('returns 401 if no authorization header', async () => {
        const fakeJwt = makeFakeJwt();
        const req = mockReq({ headers: {} });
        const res = mockRes();
        const next = mockNext();

        const handler = validate_auth(fakeJwt);
        await handler(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 401 if header does not start with Bearer', async () => {
        const fakeJwt = makeFakeJwt();
        const req = mockReq({ headers: { authorization: 'Token abc123' } });
        const res = mockRes();
        const next = mockNext();

        const handler = validate_auth(fakeJwt);
        await handler(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('calls next() and sets req.user on valid token', async () => {
        const fakeJwt = makeFakeJwt(); // verify returns { id: 'u1', username: 'u1' }
        const req = mockReq({ headers: { authorization: 'Bearer mytoken123' } });
        const res = mockRes();
        const next = mockNext();

        const handler = validate_auth(fakeJwt);
        await handler(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments.length, 0); // next() with no error
        assert.deepStrictEqual(req.user, { id: 'u1', username: 'u1' });
        assert.strictEqual(fakeJwt.verify.mock.calls[0].arguments[0], 'mytoken123');
    });

    it('calls next(err) if jwt.verify throws', async () => {
        const fakeJwt = makeFakeJwt({ verify: mock.fn(() => { throw new Error('bad token'); }) });
        const req = mockReq({ headers: { authorization: 'Bearer badtoken' } });
        const res = mockRes();
        const next = mockNext();

        const handler = validate_auth(fakeJwt);
        await handler(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments[0].message, 'error in auth validation');
    });

    it('correctly extracts token after Bearer prefix', async () => {
        const fakeJwt = makeFakeJwt();
        const req = mockReq({ headers: { authorization: 'Bearer specific.token.value' } });
        const res = mockRes();
        const next = mockNext();

        const handler = validate_auth(fakeJwt);
        await handler(req, res, next);

        assert.strictEqual(fakeJwt.verify.mock.calls[0].arguments[0], 'specific.token.value');
        assert.strictEqual(next.mock.callCount(), 1);
    });
});
