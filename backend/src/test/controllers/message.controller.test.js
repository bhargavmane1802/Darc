import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { makeFakeModelWithStatics, makeChainableQuery } from '../helpers/models.js';
import { fakeIO, fakeGetIO } from '../helpers/socket.js';
import { messageCreate, messageUpdate, messageDelete, messageDisplay } from '../../controllers/message.controller.js';

// ---------------------------------------------------------------------------
// messageCreate
// ---------------------------------------------------------------------------
describe('messageCreate', () => {
    it('saves message and emits to room on success', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        // Build a fake instance that save() and populate() resolve on
        const fakeInstance = {
            _id: 'msg_1',
            save: mock.fn(async function () { return this; }),
            populate: mock.fn(async function () { return this; }),
        };
        // Fake constructor: new MessageModel(...) returns fakeInstance
        const MessageModel = mock.fn(function () {
            Object.assign(this, fakeInstance);
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1' },
            body: { content: 'Hello world', type: 'text' },
        });
        const res = mockRes();
        const next = mockNext();

        await messageCreate(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 0);
        assert.strictEqual(res.status.mock.callCount(), 1);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 201);
        assert.strictEqual(res.json.mock.calls[0].arguments[0].message, 'Message created successfully');

        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        // io.to() returns { emit }, so check emit on that returned object
        const toResult = io.to.mock.calls[0].result;
        assert.strictEqual(toResult.emit.mock.callCount(), 1);
        assert.strictEqual(toResult.emit.mock.calls[0].arguments[0], 'message_new');
    });

    it('returns 404 if content is missing', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);
        const MessageModel = mock.fn(); // should never be called

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1' },
            body: {},
        });
        const res = mockRes();
        const next = mockNext();

        await messageCreate(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'Content or image is required' });
        assert.strictEqual(MessageModel.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if save throws', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const fakeInstance = {
            _id: 'msg_1',
            save: mock.fn(async function () { throw new Error('db down'); }),
            populate: mock.fn(async function () { return this; }),
        };
        const MessageModel = mock.fn(function () {
            Object.assign(this, fakeInstance);
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1' },
            body: { content: 'Hello', type: 'text' },
        });
        const res = mockRes();
        const next = mockNext();

        await messageCreate(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        const err = next.mock.calls[0].arguments[0];
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'failed messageCreate');
        assert.strictEqual(res.status.mock.callCount(), 0);
    });
});

// ---------------------------------------------------------------------------
// messageUpdate
// ---------------------------------------------------------------------------
describe('messageUpdate', () => {
    it('updates message content and emits update_message', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const fakeMessage = {
            _id: 'msg_1',
            content: 'original',
            save: mock.fn(async () => {}),
        };
        const MessageModel = makeFakeModelWithStatics(null, {
            findOne: mock.fn(async () => fakeMessage),
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1', messageId: 'msg_1' },
            body: { content: 'updated text' },
        });
        const res = mockRes();
        const next = mockNext();

        await messageUpdate(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(fakeMessage.save.mock.callCount(), 1);
        assert.strictEqual(fakeMessage.content, 'updated text');
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'message updated' });

        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        const toResult = io.to.mock.calls[0].result;
        assert.strictEqual(toResult.emit.mock.calls[0].arguments[0], 'update_message');
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 403 if message not owned by user', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const MessageModel = makeFakeModelWithStatics(null, {
            findOne: mock.fn(async () => null),
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1', messageId: 'msg_99' },
            body: { content: 'updated' },
        });
        const res = mockRes();
        const next = mockNext();

        await messageUpdate(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'Unauthorized' });
        assert.strictEqual(io.to.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 404 if no content or type in body', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const fakeMessage = {
            _id: 'msg_1',
            content: 'original',
            save: mock.fn(async () => {}),
        };
        const MessageModel = makeFakeModelWithStatics(null, {
            findOne: mock.fn(async () => fakeMessage),
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1', messageId: 'msg_1' },
            body: {},
        });
        const res = mockRes();
        const next = mockNext();

        await messageUpdate(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 404);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'Insufficent data' });
        assert.strictEqual(fakeMessage.save.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });
});

// ---------------------------------------------------------------------------
// messageDelete
// ---------------------------------------------------------------------------
describe('messageDelete', () => {
    it('deletes message and emits delete_message', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const fakeMessage = { _id: 'msg_1', sender: 'user_1' };
        const MessageModel = makeFakeModelWithStatics(null, {
            findOne: mock.fn(async () => fakeMessage),
            deleteOne: mock.fn(async () => ({ deletedCount: 1 })),
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1', messageId: 'msg_1' },
            body: {},
        });
        const res = mockRes();
        const next = mockNext();

        await messageDelete(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(MessageModel.deleteOne.mock.callCount(), 1);
        assert.deepStrictEqual(MessageModel.deleteOne.mock.calls[0].arguments[0], { _id: 'msg_1' });

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'message deleted' });

        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        const toResult = io.to.mock.calls[0].result;
        assert.strictEqual(toResult.emit.mock.calls[0].arguments[0], 'delete_message');
        assert.strictEqual(toResult.emit.mock.calls[0].arguments[1], 'msg_1');
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('returns 403 if message not owned by user', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const MessageModel = makeFakeModelWithStatics(null, {
            findOne: mock.fn(async () => null),
            deleteOne: mock.fn(),
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1', messageId: 'msg_99' },
            body: {},
        });
        const res = mockRes();
        const next = mockNext();

        await messageDelete(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: 'Unauthorized' });
        assert.strictEqual(MessageModel.deleteOne.mock.callCount(), 0);
        assert.strictEqual(io.to.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if deleteOne throws', async () => {
        const io = fakeIO();
        const getSocketIO = fakeGetIO(io);

        const fakeMessage = { _id: 'msg_1', sender: 'user_1' };
        const MessageModel = makeFakeModelWithStatics(null, {
            findOne: mock.fn(async () => fakeMessage),
            deleteOne: mock.fn(async () => { throw new Error('db crash'); }),
        });

        const req = mockReq({
            user: { id: 'user_1' },
            params: { roomId: 'room_1', messageId: 'msg_1' },
            body: {},
        });
        const res = mockRes();
        const next = mockNext();

        await messageDelete(MessageModel, getSocketIO)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        const err = next.mock.calls[0].arguments[0];
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'failed messageDelete');
        assert.strictEqual(res.status.mock.callCount(), 0);
        assert.strictEqual(io.to.mock.callCount(), 0);
    });
});

// ---------------------------------------------------------------------------
// messageDisplay
// ---------------------------------------------------------------------------
describe('messageDisplay', () => {
    it('returns messages for a room', async () => {
        const fakeMessages = [
            { _id: 'msg_1', content: 'Hello', sender: { username: 'alice' } },
            { _id: 'msg_2', content: 'World', sender: { username: 'bob' } },
        ];
        // find() returns a chainable query resolving to fakeMessages
        const chain = makeChainableQuery(fakeMessages);
        const MessageModel = makeFakeModelWithStatics(null, {
            find: mock.fn(() => chain),
        });

        const req = mockReq({
            params: { roomId: 'room_1' },
        });
        const res = mockRes();
        const next = mockNext();

        await messageDisplay(MessageModel)(req, res, next);

        assert.strictEqual(MessageModel.find.mock.callCount(), 1);
        assert.deepStrictEqual(MessageModel.find.mock.calls[0].arguments[0], { room: 'room_1' });
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { message: fakeMessages });
        assert.strictEqual(next.mock.callCount(), 0);
    });

    it('passes error to next() if find throws', async () => {
        const MessageModel = makeFakeModelWithStatics(null, {
            find: mock.fn(() => { throw new Error('db error'); }),
        });

        const req = mockReq({
            params: { roomId: 'room_1' },
        });
        const res = mockRes();
        const next = mockNext();

        await messageDisplay(MessageModel)(req, res, next);

        assert.strictEqual(next.mock.callCount(), 1);
        const err = next.mock.calls[0].arguments[0];
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'failed messageDisplay');
        assert.strictEqual(res.status.mock.callCount(), 0);
    });
});
