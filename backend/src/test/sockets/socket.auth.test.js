import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeJwt } from '../helpers/crypto.js';
import { fakeSocket } from '../helpers/socket.js';
import { socketAuthMiddleware } from '../../sockets/socket.js';

describe('socketAuthMiddleware', () => {

    it('calls next(error) if no token', () => {
        const socket = fakeSocket({ handshake: { auth: {} } });
        const next = mock.fn();
        socketAuthMiddleware(makeFakeJwt())(socket, next);
        assert.strictEqual(next.mock.callCount(), 1);
        assert.ok(next.mock.calls[0].arguments[0] instanceof Error);
    });

    it('sets socket.user and calls next() for valid token', () => {
        const fakeJwt = makeFakeJwt(); // verify returns { id: 'u1', username: 'u1' }
        const socket = fakeSocket({ handshake: { auth: { token: 'valid.jwt' } } });
        const next = mock.fn();
        socketAuthMiddleware(fakeJwt)(socket, next);
        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments.length, 0);
        assert.deepStrictEqual(socket.user, { id: 'u1', username: 'u1' });
    });

    it('calls next(error) if jwt.verify throws', () => {
        const fakeJwt = makeFakeJwt({
            verify: mock.fn(() => { throw new Error('bad token'); }),
        });
        const socket = fakeSocket({ handshake: { auth: { token: 'bad.jwt' } } });
        const next = mock.fn();
        socketAuthMiddleware(fakeJwt)(socket, next);
        assert.strictEqual(next.mock.callCount(), 1);
        assert.ok(next.mock.calls[0].arguments[0] instanceof Error);
    });

});
