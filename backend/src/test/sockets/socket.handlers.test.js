import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSocket, fakeIO } from '../helpers/socket.js';
import { makeFakeRedis } from '../helpers/redis.js';
import { makeChainableQuery, makeFakeModel, makeFakeModelWithStatics } from '../helpers/models.js';
import {
    handleJoinRoom, handleSwitchRoom, handleLeaveRoom,
    handleMessageSend, handleTypingStart, handleTypingEnd,
    handleReadMessage, handleDisconnecting
} from '../../sockets/socket.js';

// ---------------------------------------------------------------------------
// handleJoinRoom
// ---------------------------------------------------------------------------

describe('handleJoinRoom', () => {

    it('returns early if socket already in room', async () => {
        const socket = fakeSocket();
        socket.rooms = new Set(['room_1']);
        const io = fakeIO();
        const redisClient = makeFakeRedis();
        const MessageModel = makeFakeModelWithStatics([]);

        await handleJoinRoom({ MessageModel, redisClient })({ room_id: 'room_1' }, socket, io);

        assert.strictEqual(socket.join.mock.callCount(), 0);
    });

    it('joins room, updates redis, fetches history, emits', async () => {
        const socket = fakeSocket();
        socket.rooms = new Set(); // room_1 not yet joined
        const io = fakeIO();

        // Exec returns 3 results: [sadd, expire, smembers]
        const redisClient = makeFakeRedis({
            exec: mock.fn(async () => [[null, 1], [null, 1], [null, ['user1']]]),
        });

        const history = [{ content: 'msg', sender: { username: 'u1' } }];
        const MessageModel = makeFakeModelWithStatics(history);

        await handleJoinRoom({ MessageModel, redisClient })({ room_id: 'room_1' }, socket, io);

        // socket.join was called
        assert.strictEqual(socket.join.mock.callCount(), 1);
        assert.strictEqual(socket.join.mock.calls[0].arguments[0], 'room_1');

        // io.to(room_id).emit('room_members', ...)
        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        const ioEmit = io.emit;
        assert.strictEqual(ioEmit.mock.calls[0].arguments[0], 'room_members');

        // socket.emit('message_display', ...)
        const displayCall = socket.emit.mock.calls.find(c => c.arguments[0] === 'message_display');
        assert.ok(displayCall, 'message_display event emitted');
    });

    it('emits error to socket if operation fails', async () => {
        const socket = fakeSocket();
        socket.rooms = new Set();
        const io = fakeIO();
        const redisClient = makeFakeRedis({
            exec: mock.fn(async () => { throw new Error('redis down'); }),
        });
        const MessageModel = makeFakeModelWithStatics([]);

        await handleJoinRoom({ MessageModel, redisClient })({ room_id: 'room_1' }, socket, io);

        const errCall = socket.emit.mock.calls.find(c => c.arguments[0] === 'error');
        assert.ok(errCall, 'error event emitted');
        assert.strictEqual(errCall.arguments[1].message, 'Failed to join room properly.');
    });

});

// ---------------------------------------------------------------------------
// handleSwitchRoom
// ---------------------------------------------------------------------------

describe('handleSwitchRoom', () => {

    it('removes from redis and leaves socket room', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const redisClient = makeFakeRedis();

        await handleSwitchRoom({ redisClient })('room_1', socket, io);

        assert.strictEqual(socket.leave.mock.callCount(), 1);
        assert.strictEqual(socket.leave.mock.calls[0].arguments[0], 'room_1');
    });

    it('emits updated members to room', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const redisClient = makeFakeRedis();

        await handleSwitchRoom({ redisClient })('room_1', socket, io);

        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        const ioEmit = io.emit;
        assert.strictEqual(ioEmit.mock.calls[0].arguments[0], 'room_members');
    });

});

// ---------------------------------------------------------------------------
// handleLeaveRoom
// ---------------------------------------------------------------------------

describe('handleLeaveRoom', () => {

    it('calls RoomModel.updateOne and leaves socket room', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const redisClient = makeFakeRedis();
        const RoomModel = makeFakeModelWithStatics(null);

        await handleLeaveRoom({ RoomModel, redisClient })('room_1', socket, io);

        assert.strictEqual(RoomModel.updateOne.mock.callCount(), 1);
        assert.strictEqual(socket.leave.mock.callCount(), 1);
        assert.strictEqual(socket.leave.mock.calls[0].arguments[0], 'room_1');
    });

    it('updates redis presence and emits room_members', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const redisClient = makeFakeRedis();
        const RoomModel = makeFakeModelWithStatics(null);

        await handleLeaveRoom({ RoomModel, redisClient })('room_1', socket, io);

        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        const ioEmit = io.emit;
        assert.strictEqual(ioEmit.mock.calls[0].arguments[0], 'room_members');
    });

    it('emits error to socket if operation fails', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const redisClient = makeFakeRedis();
        const RoomModel = makeFakeModelWithStatics(null, {
            updateOne: mock.fn(async () => { throw new Error('db error'); }),
        });

        await handleLeaveRoom({ RoomModel, redisClient })('room_1', socket, io);

        const errCall = socket.emit.mock.calls.find(c => c.arguments[0] === 'error');
        assert.ok(errCall, 'error event emitted');
        assert.strictEqual(errCall.arguments[1].message, 'Failed to leave room properly.');
    });

});

// ---------------------------------------------------------------------------
// handleMessageSend
// ---------------------------------------------------------------------------

describe('handleMessageSend', () => {

    it('emits error if content is empty and no imageUrl', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const MessageModel = makeFakeModel();

        await handleMessageSend({ MessageModel })({ room_id: 'room_1', content: '  ', imageUrl: null }, socket, io);

        const errCall = socket.emit.mock.calls.find(c => c.arguments[0] === 'error');
        assert.ok(errCall, 'error event emitted');
        assert.strictEqual(errCall.arguments[1].message, 'Message content cannot be empty.');
    });

    it('emits error if content exceeds 1000 chars', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const MessageModel = makeFakeModel();

        await handleMessageSend({ MessageModel })({ room_id: 'room_1', content: 'a'.repeat(1001), imageUrl: null }, socket, io);

        const errCall = socket.emit.mock.calls.find(c => c.arguments[0] === 'error');
        assert.ok(errCall, 'error event emitted');
        assert.strictEqual(errCall.arguments[1].message, 'Message is too long (max 1000 characters).');
    });

    it('saves message and emits message_new', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const MessageModel = makeFakeModel();

        await handleMessageSend({ MessageModel })({ room_id: 'room_1', content: 'hello', imageUrl: null }, socket, io);

        // Constructor was called once
        assert.strictEqual(MessageModel.mock.callCount(), 1);

        // io.to(room_id).emit('message_new', ...)
        assert.strictEqual(io.to.mock.callCount(), 1);
        assert.strictEqual(io.to.mock.calls[0].arguments[0], 'room_1');
        const ioEmit = io.emit;
        assert.strictEqual(ioEmit.mock.calls[0].arguments[0], 'message_new');
    });

    it('emits error to socket if save throws', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        const MessageModel = makeFakeModel({
            save: mock.fn(async () => { throw new Error('save failed'); }),
        });

        await handleMessageSend({ MessageModel })({ room_id: 'room_1', content: 'hello', imageUrl: null }, socket, io);

        const errCall = socket.emit.mock.calls.find(c => c.arguments[0] === 'error');
        assert.ok(errCall, 'error event emitted');
        assert.strictEqual(errCall.arguments[1].message, 'Failed to send message. Please try again.');
    });

});

// ---------------------------------------------------------------------------
// handleTypingStart + handleTypingEnd
// ---------------------------------------------------------------------------

describe('handleTypingStart + handleTypingEnd', () => {

    it('emits is_typing to room excluding sender', () => {
        const emitSpy = mock.fn();
        const socket = fakeSocket({
            to: mock.fn(() => ({ emit: emitSpy })),
        });

        handleTypingStart()({ room_id: 'room_1' }, socket);

        assert.strictEqual(socket.to.mock.callCount(), 1);
        assert.strictEqual(socket.to.mock.calls[0].arguments[0], 'room_1');
        assert.strictEqual(emitSpy.mock.callCount(), 1);
        assert.strictEqual(emitSpy.mock.calls[0].arguments[0], 'is_typing');
        assert.deepStrictEqual(emitSpy.mock.calls[0].arguments[1], {
            username: socket.user.username,
            id: socket.user.id,
        });
    });

    it('emits stop_typing to room excluding sender', () => {
        const emitSpy = mock.fn();
        const socket = fakeSocket({
            to: mock.fn(() => ({ emit: emitSpy })),
        });

        handleTypingEnd()({ room_id: 'room_1' }, socket);

        assert.strictEqual(socket.to.mock.callCount(), 1);
        assert.strictEqual(socket.to.mock.calls[0].arguments[0], 'room_1');
        assert.strictEqual(emitSpy.mock.callCount(), 1);
        assert.strictEqual(emitSpy.mock.calls[0].arguments[0], 'stop_typing');
        assert.deepStrictEqual(emitSpy.mock.calls[0].arguments[1], {
            username: socket.user.username,
            id: socket.user.id,
        });
    });

});

// ---------------------------------------------------------------------------
// handleReadMessage
// ---------------------------------------------------------------------------

describe('handleReadMessage', () => {

    it('updates read receipt and emits readUpdate_message', async () => {
        const emitSpy = mock.fn();
        const socket = fakeSocket({
            to: mock.fn(() => ({ emit: emitSpy })),
        });
        const ReadReceiptModel = makeFakeModelWithStatics({ _id: 'rr_1' });

        await handleReadMessage({ ReadReceiptModel })('room_1', 'msg_99', socket);

        assert.strictEqual(ReadReceiptModel.findOneAndUpdate.mock.callCount(), 1);
        assert.strictEqual(emitSpy.mock.callCount(), 1);
        assert.strictEqual(emitSpy.mock.calls[0].arguments[0], 'readUpdate_message');
        assert.deepStrictEqual(emitSpy.mock.calls[0].arguments[1], {
            room_id: 'room_1',
            user_id: socket.user.id,
            lastReadMessageId: 'msg_99',
        });
    });

    it('does not emit if no update returned', async () => {
        const emitSpy = mock.fn();
        const socket = fakeSocket({
            to: mock.fn(() => ({ emit: emitSpy })),
        });
        // findOneAndUpdate returns null → no update
        const ReadReceiptModel = makeFakeModelWithStatics(null);

        await handleReadMessage({ ReadReceiptModel })('room_1', 'msg_99', socket);

        assert.strictEqual(emitSpy.mock.callCount(), 0);
    });

});

// ---------------------------------------------------------------------------
// handleDisconnecting
// ---------------------------------------------------------------------------

describe('handleDisconnecting', () => {

    it('removes user from all joined rooms in redis and emits room_members', async () => {
        const socket = fakeSocket();
        socket.id = 'sock_1';
        socket.rooms = new Set(['sock_1', 'room_1', 'room_2']);
        const io = fakeIO();
        const redisClient = makeFakeRedis();

        await handleDisconnecting({ redisClient })(socket, io);

        // 2 rooms (room_1, room_2), so io.to called twice
        assert.strictEqual(io.to.mock.callCount(), 2);
        const roomsEmitted = io.to.mock.calls.map(c => c.arguments[0]);
        assert.ok(roomsEmitted.includes('room_1'));
        assert.ok(roomsEmitted.includes('room_2'));
        assert.ok(!roomsEmitted.includes('sock_1'));
    });

    it('skips the socket private room (room_id === socket.id)', async () => {
        const socket = fakeSocket();
        socket.id = 'sock_1';
        socket.rooms = new Set(['sock_1']); // only the private room
        const io = fakeIO();
        const redisClient = makeFakeRedis();

        await handleDisconnecting({ redisClient })(socket, io);

        // No real rooms — io.to should never be called
        assert.strictEqual(io.to.mock.callCount(), 0);
    });

});
