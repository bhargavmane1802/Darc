import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { makeChainableQuery } from '../helpers/models.js';
import { create, join, remove, myRooms } from '../../controllers/room.controller.js';

// ---------------------------------------------------------------------------
// describe('create')
// ---------------------------------------------------------------------------
describe('create', () => {
    it('returns 400 if name is missing', async () => {
        const RoomModel = {};
        const generateId = mock.fn();
        const req = mockReq({ body: {}, user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await create(RoomModel, generateId)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'incomplete information' });
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 400 if room name already exists', async () => {
        const RoomModel = {
            findOne: mock.fn(async () => ({ _id: 'existing_room' })),
        };
        const generateId = mock.fn();
        const req = mockReq({ body: { name: 'MyRoom' }, user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await create(RoomModel, generateId)(req, res, next);

        assert.strictEqual(RoomModel.findOne.mock.callCount(), 1);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'room already exists' });
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('creates room and returns room_id + inviteCode', async () => {
        // Constructor mock: instances have members[], _id, inviteCode, save
        const RoomModel = mock.fn(function (data) {
            this.members = [];
            this._id = 'room_1';
            this.inviteCode = 'ABCDEFGHIJ';
            this.save = mock.fn(async () => {});
            Object.assign(this, data);
        });
        RoomModel.findOne = mock.fn(async () => null);

        const generateId = mock.fn(() => 'ABCDEFGHIJ');
        const req = mockReq({
            body: { name: 'MyRoom', description: 'A room' },
            user: { id: 'user_1' },
        });
        const res = mockRes();
        const next = mockNext();

        await create(RoomModel, generateId)(req, res, next);

        assert.strictEqual(RoomModel.findOne.mock.callCount(), 1);
        assert.strictEqual(generateId.mock.callCount(), 1);
        assert.deepStrictEqual(generateId.mock.calls[0].arguments[0], 10);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
            message: 'room created',
            room_id: 'room_1',
            inviteCode: 'ABCDEFGHIJ',
        });
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if save throws', async () => {
        const saveError = new Error('DB write failed');
        const RoomModel = mock.fn(function (data) {
            this.members = [];
            this._id = 'room_1';
            this.inviteCode = 'XXXXXXXXXX';
            this.save = mock.fn(async () => { throw saveError; });
            Object.assign(this, data);
        });
        RoomModel.findOne = mock.fn(async () => null);

        const generateId = mock.fn(() => 'XXXXXXXXXX');
        const req = mockReq({
            body: { name: 'MyRoom' },
            user: { id: 'user_1' },
        });
        const res = mockRes();
        const next = mockNext();

        await create(RoomModel, generateId)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments[0], saveError);
        assert.strictEqual(res.status.mock.callCount(), 0);
    });
});

// ---------------------------------------------------------------------------
// describe('join')
// ---------------------------------------------------------------------------
describe('join', () => {
    it('returns 404 if inviteCode param is missing', async () => {
        const RoomModel = { findOne: mock.fn() };
        const req = mockReq({ params: { inviteCode: '' }, user: { id: 'user_1', username: 'Alice' } });
        const res = mockRes();
        const next = mockNext();

        await join(RoomModel)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'invite Code is missing' });
        assert.strictEqual(RoomModel.findOne.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 404 if room not found', async () => {
        const RoomModel = { findOne: mock.fn(async () => null) };
        const req = mockReq({ params: { inviteCode: 'BAD_CODE' }, user: { id: 'user_1', username: 'Alice' } });
        const res = mockRes();
        const next = mockNext();

        await join(RoomModel)(req, res, next);

        assert.strictEqual(RoomModel.findOne.mock.callCount(), 1);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'Room not found , invalid invite code' });
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 409 if user is already a member', async () => {
        const room = {
            members: [{ equals: () => true }],
            save: mock.fn(async () => {}),
        };
        const RoomModel = { findOne: mock.fn(async () => room) };
        const req = mockReq({ params: { inviteCode: 'CODE123456' }, user: { id: 'user_1', username: 'Alice' } });
        const res = mockRes();
        const next = mockNext();

        await join(RoomModel)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 409);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'Alice already exists' });
        assert.strictEqual(room.save.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('joins room and returns 200', async () => {
        const room = {
            members: [{ equals: () => false }],
            save: mock.fn(async () => {}),
            _id: 'r1',
            name: 'TestRoom',
            description: 'desc',
        };
        const RoomModel = { findOne: mock.fn(async () => room) };
        const req = mockReq({ params: { inviteCode: 'VALIDCODE1' }, user: { id: 'user_1', username: 'Alice' } });
        const res = mockRes();
        const next = mockNext();

        await join(RoomModel)(req, res, next);

        assert.strictEqual(room.save.mock.callCount(), 1);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
            message: 'Alice joined the room',
            room_id: 'r1',
            name: 'TestRoom',
            description: 'desc',
        });
        assert.strictEqual(next.mock.callCount(), 0);
    });
});

// ---------------------------------------------------------------------------
// describe('remove')
// ---------------------------------------------------------------------------
describe('remove', () => {
    it('returns 403 if room not found or not owner', async () => {
        const RoomModel = {
            findOne: mock.fn(async () => null),
            deleteOne: mock.fn(),
        };
        const req = mockReq({ params: { name: 'GhostRoom' }, user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await remove(RoomModel)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'unauthorized' });
        assert.strictEqual(RoomModel.deleteOne.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('deletes room and returns 200', async () => {
        const match_room = { _id: 'room_99' };
        const RoomModel = {
            findOne: mock.fn(async () => match_room),
            deleteOne: mock.fn(async () => ({ deletedCount: 1 })),
        };
        const req = mockReq({ params: { name: 'MyRoom' }, user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await remove(RoomModel)(req, res, next);

        assert.strictEqual(RoomModel.deleteOne.mock.callCount(), 1);
        assert.deepStrictEqual(RoomModel.deleteOne.mock.calls[0].arguments[0], { _id: 'room_99' });
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'room deleted sucessfully' });
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if deleteOne throws', async () => {
        const dbError = new Error('deleteOne failed');
        const RoomModel = {
            findOne: mock.fn(async () => ({ _id: 'room_99' })),
            deleteOne: mock.fn(async () => { throw dbError; }),
        };
        const req = mockReq({ params: { name: 'MyRoom' }, user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await remove(RoomModel)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments[0], dbError);
        assert.strictEqual(res.status.mock.callCount(), 0);
    });
});

// ---------------------------------------------------------------------------
// describe('myRooms')
// ---------------------------------------------------------------------------
describe('myRooms', () => {
    it('returns rooms; nulls inviteCode for private rooms not owned by user', async () => {
        const rooms = [
            // private, owned by someone else → inviteCode must be nulled
            { name: 'PrivateOther', description: 'd1', inviteCode: 'SECRET111', isPrivate: true, owner: 'other_user', createdAt: new Date() },
            // private, owned by current user → inviteCode must be kept
            { name: 'PrivateMine', description: 'd2', inviteCode: 'MYCODE222', isPrivate: true, owner: 'user_1', createdAt: new Date() },
        ];
        const RoomModel = { find: mock.fn(() => makeChainableQuery(rooms)) };
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await myRooms(RoomModel)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        const result = res.json.mock.calls[0].arguments[0];
        assert.strictEqual(result[0].inviteCode, null,   'private room from other user should have inviteCode nulled');
        assert.strictEqual(result[1].inviteCode, 'MYCODE222', 'own private room should keep inviteCode');
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns empty array for user with no rooms', async () => {
        const RoomModel = { find: mock.fn(() => makeChainableQuery([])) };
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await myRooms(RoomModel)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], []);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if find throws', async () => {
        const dbError = new Error('find failed');
        const RoomModel = { find: mock.fn(() => { throw dbError; }) };
        const req = mockReq({ user: { id: 'user_1' } });
        const res = mockRes();
        const next = mockNext();

        await myRooms(RoomModel)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments[0].message, 'failed to fetch room names');
        assert.strictEqual(res.status.mock.callCount(), 0);
    });
});
