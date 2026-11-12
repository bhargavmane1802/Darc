import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { makeFakeModel } from '../helpers/models.js';
import { makeFakeBcrypt, makeFakeJwt, makeFakeNanoid } from '../helpers/crypto.js';
import { makeFakeRedis } from '../helpers/redis.js';
import { register, login, verifyEmail } from '../../controllers/user.controller.js';

// ---------------------------------------------------------------------------
// describe: register
// ---------------------------------------------------------------------------
describe('register', () => {
    it('returns 400 if username missing', async () => {
        const req = mockReq({ body: { password: 'pw123', email: 'a@b.com' } });
        const res = mockRes();
        const next = mockNext();

        await register()(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 400);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'Username and password are required');
    });

    it('returns 400 for invalid email format', async () => {
        const req = mockReq({ body: { username: 'alice', password: 'pw123', email: 'not-an-email' } });
        const res = mockRes();
        const next = mockNext();

        await register()(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 400);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'Invalid email format');
    });

    it('returns 409 if username/email already exists', async () => {
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => ({ username: 'alice', email: 'alice@example.com' }));

        const req = mockReq({ body: { username: 'alice', password: 'pw123', email: 'alice@example.com' } });
        const res = mockRes();
        const next = mockNext();

        await register(FakeUserModel)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 409);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'username or email already exists');
    });

    it('returns 400 if DNS MX lookup fails', async () => {
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => null);

        const dnsLib = { resolveMx: mock.fn(async () => { throw new Error('DNS failure'); }) };

        const req = mockReq({ body: { username: 'alice', password: 'pw123', email: 'alice@baddomain.xyz' } });
        const res = mockRes();
        const next = mockNext();

        await register(FakeUserModel, makeFakeBcrypt(), dnsLib)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 400);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'Email domain does not exist');
    });

    it('returns 400 if sendVerificationEmail throws', async () => {
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => null);

        const dnsLib = { resolveMx: mock.fn(async () => []) };
        const bcryptLib = makeFakeBcrypt();
        const generateId = makeFakeNanoid('TESTID1234');
        const redisClient = makeFakeRedis();
        const emailService = mock.fn(async () => { throw new Error('SMTP error'); });

        const req = mockReq({ body: { username: 'alice', password: 'pw123', email: 'alice@example.com' } });
        const res = mockRes();
        const next = mockNext();

        await register(FakeUserModel, bcryptLib, dnsLib, generateId, redisClient, emailService)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 400);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'error in verification');
    });

    it('returns 201 on successful registration', async () => {
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => null);

        const dnsLib = { resolveMx: mock.fn(async () => []) };
        const bcryptLib = makeFakeBcrypt();
        const generateId = makeFakeNanoid('ABCDEFGHIJ');
        const redisClient = makeFakeRedis();
        const emailService = mock.fn(async () => {});

        const req = mockReq({ body: { username: 'alice', password: 'pw123', email: 'alice@example.com' } });
        const res = mockRes();
        const next = mockNext();

        await register(FakeUserModel, bcryptLib, dnsLib, generateId, redisClient, emailService)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 201);
        assert.equal(emailService.mock.callCount(), 1);
    });
});

// ---------------------------------------------------------------------------
// describe: login
// ---------------------------------------------------------------------------
describe('login', () => {
    it('returns 400 if username or password missing', async () => {
        const req = mockReq({ body: { username: 'alice' } }); // no password
        const res = mockRes();
        const next = mockNext();

        await login()(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 400);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'missing data');
    });

    it('returns 401 if user not found', async () => {
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => null);

        const req = mockReq({ body: { username: 'ghost', password: 'pw' } });
        const res = mockRes();
        const next = mockNext();

        await login(FakeUserModel)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 401);
    });

    it('returns 401 if password does not match', async () => {
        const fakeUser = { _id: 'u1', username: 'alice', password: 'hashed' };
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => fakeUser);

        const bcryptLib = makeFakeBcrypt({ compare: mock.fn(async () => false) });

        const req = mockReq({ body: { username: 'alice', password: 'wrong' } });
        const res = mockRes();
        const next = mockNext();

        await login(FakeUserModel, makeFakeJwt(), bcryptLib)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 401);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'Incorrect credentials');
    });

    it('returns 200 with token on success', async () => {
        const fakeUser = { _id: 'u1', username: 'alice', password: 'hashed' };
        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => fakeUser);

        const bcryptLib = makeFakeBcrypt({ compare: mock.fn(async () => true) });
        const jwtLib = makeFakeJwt();

        const req = mockReq({ body: { username: 'alice', password: 'pw123' } });
        const res = mockRes();
        const next = mockNext();

        await login(FakeUserModel, jwtLib, bcryptLib)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 200);
        assert.deepEqual(res.json.mock.calls[0].arguments[0], { token: 'signed.jwt' });
    });
});

// ---------------------------------------------------------------------------
// describe: verifyEmail
// ---------------------------------------------------------------------------
describe('verifyEmail', () => {
    it('returns 400 if redis key expired/not found', async () => {
        const redisClient = makeFakeRedis();
        // makeFakeRedis.get returns null by default

        const req = mockReq({ params: { id: 'missing-id' } });
        const res = mockRes();
        const next = mockNext();

        await verifyEmail({}, redisClient)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 400);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'Invalid or expired token');
    });

    it('returns 409 if user already verified', async () => {
        const userData = { username: 'alice', password: 'hashed_pw', email: 'alice@example.com' };
        const redisClient = makeFakeRedis({
            get: mock.fn(async () => JSON.stringify(userData)),
            del: mock.fn(async () => 1),
        });

        const FakeUserModel = {};
        FakeUserModel.findOne = mock.fn(async () => ({ username: 'alice' }));

        const req = mockReq({ params: { id: 'some-id' } });
        const res = mockRes();
        const next = mockNext();

        await verifyEmail(FakeUserModel, redisClient)(req, res, next);

        assert.equal(res.status.mock.calls[0].arguments[0], 409);
        assert.equal(res.json.mock.calls[0].arguments[0].message, 'User already verified');
        assert.equal(redisClient.del.mock.callCount(), 1);
    });

    it('saves user, deletes redis key, and redirects on success', async () => {
        const userData = { username: 'alice', password: 'hashed_pw', email: 'alice@example.com' };
        const redisClient = makeFakeRedis({
            get: mock.fn(async () => JSON.stringify(userData)),
            del: mock.fn(async () => 1),
        });

        // FakeUserModel that is both a callable constructor and has static findOne
        const FakeUserModel = makeFakeModel();
        FakeUserModel.findOne = mock.fn(async () => null);

        const req = mockReq({ params: { id: 'verify-id' } });
        const res = mockRes();
        const next = mockNext();

        await verifyEmail(FakeUserModel, redisClient)(req, res, next);

        // save was called on the new instance
        assert.equal(FakeUserModel.mock.callCount(), 1);
        assert.equal(redisClient.del.mock.callCount(), 1);
        assert.equal(res.redirect.mock.callCount(), 1);
        assert.ok(
            res.redirect.mock.calls[0].arguments[0].includes('/login?verified=true'),
            'should redirect to login with verified=true'
        );
    });

    it('passes error to next() if save throws', async () => {
        const userData = { username: 'alice', password: 'hashed_pw', email: 'alice@example.com' };
        const redisClient = makeFakeRedis({
            get: mock.fn(async () => JSON.stringify(userData)),
        });

        const saveError = new Error('DB write failed');
        const FakeUserModel = makeFakeModel({ save: mock.fn(async () => { throw saveError; }) });
        FakeUserModel.findOne = mock.fn(async () => null);

        const req = mockReq({ params: { id: 'verify-id' } });
        const res = mockRes();
        const next = mockNext();

        await verifyEmail(FakeUserModel, redisClient)(req, res, next);

        assert.equal(next.mock.callCount(), 1);
        assert.equal(next.mock.calls[0].arguments[0], saveError);
    });
});
