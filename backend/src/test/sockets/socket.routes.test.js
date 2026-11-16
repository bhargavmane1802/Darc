import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSocket, fakeIO } from '../helpers/socket.js';
import { makeFakeModelWithStatics } from '../helpers/models.js';
import { makeFakeBcrypt, makeFakeJwt } from '../helpers/crypto.js';

// Import Socket.IO Routers & Handlers
import { 
    userLoginRoute, 
    userRegisterRoute, 
    userVerifyRoute,
    registerUserSocketRoutes, 
    USER_SOCKET_ROUTES 
} from '../../routers/user.Router.js';

import { 
    profileDetailsRoute, 
    profileUpdateRoute, 
    profileAvatarRoute,
    registerProfileSocketRoutes, 
    PROFILE_SOCKET_ROUTES 
} from '../../routers/profile.Router.js';

import { 
    roomMyRoomsRoute, 
    roomCreateRoute, 
    roomJoinRoute, 
    roomRemoveRoute,
    registerRoomSocketRoutes, 
    ROOM_SOCKET_ROUTES 
} from '../../routers/room.Router.js';

import { 
    messageCreateRoute, 
    messageUpdateRoute, 
    messageDeleteRoute, 
    messageDisplayRoute, 
    messageReadRoute,
    registerMessageSocketRoutes, 
    MESSAGE_SOCKET_ROUTES 
} from '../../routers/message.Router.js';

import { 
    journalCreateRoute, 
    journalDisplayRoute, 
    journalDeleteRoute, 
    journalAiResponseRoute, 
    journalReactionRoute,
    registerJournalSocketRoutes, 
    JOURNAL_SOCKET_ROUTES 
} from '../../routers/journal.Router.js';

import { 
    uploadSocketRoute, 
    registerUploadSocketRoutes, 
    UPLOAD_SOCKET_ROUTES 
} from '../../routers/upload.routes.js';

import { 
    socketAuthMiddleware, 
    requireSocketAuth, 
    PUBLIC_SOCKET_EVENTS 
} from '../../sockets/socket.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. User Socket Routes
// ─────────────────────────────────────────────────────────────────────────────
describe('User Socket Routes', () => {

    it('userLoginRoute rejects missing credentials', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        let callbackResult = null;

        await userLoginRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 400);
        assert.strictEqual(callbackResult?.message, 'missing data');
    });

    it('userRegisterRoute rejects missing fields', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        let callbackResult = null;

        await userRegisterRoute({ username: 'test' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 400);
    });

    it('registerUserSocketRoutes mounts all user event listeners', () => {
        const socket = fakeSocket();
        const io = fakeIO();
        registerUserSocketRoutes(socket, io);

        const registeredEvents = socket.on.mock.calls.map(c => c.arguments[0]);
        assert.ok(registeredEvents.includes(USER_SOCKET_ROUTES.LOGIN));
        assert.ok(registeredEvents.includes(USER_SOCKET_ROUTES.REGISTER));
        assert.ok(registeredEvents.includes(USER_SOCKET_ROUTES.VERIFY));
        assert.ok(registeredEvents.includes("login"));
        assert.ok(registeredEvents.includes("register"));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Profile Socket Routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Profile Socket Routes', () => {

    it('profileDetailsRoute rejects unauthenticated socket', async () => {
        const socket = fakeSocket({ user: null });
        const io = fakeIO();
        let callbackResult = null;

        await profileDetailsRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 401);
        assert.ok(callbackResult?.message?.includes('Unauthorized'));
    });

    it('profileUpdateRoute rejects unauthenticated socket', async () => {
        const socket = fakeSocket({ user: null });
        const io = fakeIO();
        let callbackResult = null;

        await profileUpdateRoute({ name: 'New Name' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 401);
    });

    it('profileAvatarRoute rejects unauthenticated socket', async () => {
        const socket = fakeSocket({ user: null });
        const io = fakeIO();
        let callbackResult = null;

        await profileAvatarRoute({ imageUrl: 'https://img.com/avatar.png' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 401);
    });

    it('registerProfileSocketRoutes mounts all profile event listeners', () => {
        const socket = fakeSocket();
        const io = fakeIO();
        registerProfileSocketRoutes(socket, io);

        const registeredEvents = socket.on.mock.calls.map(c => c.arguments[0]);
        assert.ok(registeredEvents.includes(PROFILE_SOCKET_ROUTES.DETAILS));
        assert.ok(registeredEvents.includes(PROFILE_SOCKET_ROUTES.UPDATE));
        assert.ok(registeredEvents.includes(PROFILE_SOCKET_ROUTES.AVATAR));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Room Socket Routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Room Socket Routes', () => {

    it('roomMyRoomsRoute rejects unauthenticated socket', async () => {
        const socket = fakeSocket({ user: null });
        const io = fakeIO();
        let callbackResult = null;

        await roomMyRoomsRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 401);
    });

    it('roomJoinRoute rejects missing inviteCode', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        let callbackResult = null;

        await roomJoinRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 404);
        assert.ok(callbackResult?.message?.includes('invite Code is missing'));
    });

    it('roomRemoveRoute rejects missing room name', async () => {
        const socket = fakeSocket();
        const io = fakeIO();
        let callbackResult = null;

        await roomRemoveRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 400);
        assert.strictEqual(callbackResult?.message, 'Missing room name');
    });

    it('registerRoomSocketRoutes mounts all room event listeners', () => {
        const socket = fakeSocket();
        const io = fakeIO();
        registerRoomSocketRoutes(socket, io);

        const registeredEvents = socket.on.mock.calls.map(c => c.arguments[0]);
        assert.ok(registeredEvents.includes(ROOM_SOCKET_ROUTES.MY_ROOMS));
        assert.ok(registeredEvents.includes(ROOM_SOCKET_ROUTES.CREATE));
        assert.ok(registeredEvents.includes(ROOM_SOCKET_ROUTES.JOIN));
        assert.ok(registeredEvents.includes(ROOM_SOCKET_ROUTES.REMOVE));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Message Socket Routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Message Socket Routes', () => {

    it('messageCreateRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        // No roomId provided
        await messageCreateRoute({ content: 'Hello' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('messageUpdateRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await messageUpdateRoute({ messageId: 'm1', content: 'Updated' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('messageDeleteRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await messageDeleteRoute({ messageId: 'm1' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('messageDisplayRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await messageDisplayRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('registerMessageSocketRoutes mounts all message event listeners', () => {
        const socket = fakeSocket();
        const io = fakeIO();
        registerMessageSocketRoutes(socket, io);

        const registeredEvents = socket.on.mock.calls.map(c => c.arguments[0]);
        assert.ok(registeredEvents.includes(MESSAGE_SOCKET_ROUTES.CREATE));
        assert.ok(registeredEvents.includes(MESSAGE_SOCKET_ROUTES.SEND));
        assert.ok(registeredEvents.includes(MESSAGE_SOCKET_ROUTES.UPDATE));
        assert.ok(registeredEvents.includes(MESSAGE_SOCKET_ROUTES.DELETE));
        assert.ok(registeredEvents.includes(MESSAGE_SOCKET_ROUTES.DISPLAY));
        assert.ok(registeredEvents.includes(MESSAGE_SOCKET_ROUTES.READ));
        assert.ok(registeredEvents.includes("read_message"));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Journal Socket Routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Journal Socket Routes', () => {

    it('journalCreateRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await journalCreateRoute({ content: 'Journal entry' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('journalDisplayRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await journalDisplayRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('journalDeleteRoute enforces room authorization', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await journalDeleteRoute({ journalId: 'j1' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 403);
    });

    it('journalReactionRoute enforces required parameters', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await journalReactionRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 400);
    });

    it('registerJournalSocketRoutes mounts all journal event listeners', () => {
        const socket = fakeSocket();
        const io = fakeIO();
        registerJournalSocketRoutes(socket, io);

        const registeredEvents = socket.on.mock.calls.map(c => c.arguments[0]);
        assert.ok(registeredEvents.includes(JOURNAL_SOCKET_ROUTES.CREATE));
        assert.ok(registeredEvents.includes(JOURNAL_SOCKET_ROUTES.DISPLAY));
        assert.ok(registeredEvents.includes(JOURNAL_SOCKET_ROUTES.DELETE));
        assert.ok(registeredEvents.includes(JOURNAL_SOCKET_ROUTES.AI_RESPONSE));
        assert.ok(registeredEvents.includes(JOURNAL_SOCKET_ROUTES.REACTION));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Upload Socket Routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Upload Socket Routes', () => {

    it('uploadSocketRoute rejects unauthenticated socket', async () => {
        const socket = fakeSocket({ user: null });
        const io = fakeIO();
        let callbackResult = null;

        await uploadSocketRoute({ image: 'data:image/png;base64,...' }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 401);
    });

    it('uploadSocketRoute rejects missing image payload', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        await uploadSocketRoute({}, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 400);
        assert.strictEqual(callbackResult?.message, 'No image file provided.');
    });

    it('uploadSocketRoute enforces 5MB file limit', async () => {
        const socket = fakeSocket({ user: { id: 'u1' } });
        const io = fakeIO();
        let callbackResult = null;

        // Create a large data URI string exceeding 5MB
        const largeString = 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024);

        await uploadSocketRoute({ image: largeString }, socket, io, (res) => {
            callbackResult = res;
        });

        assert.strictEqual(callbackResult?.status, 413);
        assert.strictEqual(callbackResult?.message, 'File exceeds the 5MB limit.');
    });

    it('registerUploadSocketRoutes mounts all upload event listeners', () => {
        const socket = fakeSocket();
        const io = fakeIO();
        registerUploadSocketRoutes(socket, io);

        const registeredEvents = socket.on.mock.calls.map(c => c.arguments[0]);
        assert.ok(registeredEvents.includes(UPLOAD_SOCKET_ROUTES.UPLOAD));
        assert.ok(registeredEvents.includes(UPLOAD_SOCKET_ROUTES.FILE));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Handshake Auth & Packet Guard Middleware
// ─────────────────────────────────────────────────────────────────────────────
describe('Socket Auth Middleware & Guard', () => {

    it('socketAuthMiddleware allows unauthenticated connection for public routes', () => {
        const socket = fakeSocket({ handshake: { auth: {} } });
        const next = mock.fn();
        socketAuthMiddleware(makeFakeJwt())(socket, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments.length, 0); // next() without error
    });

    it('socketAuthMiddleware attaches socket.user when valid token present', () => {
        const fakeJwt = makeFakeJwt();
        const socket = fakeSocket({ handshake: { auth: { token: 'valid.token' } } });
        const next = mock.fn();
        socketAuthMiddleware(fakeJwt)(socket, next);

        assert.strictEqual(next.mock.callCount(), 1);
        assert.deepStrictEqual(socket.user, { id: 'u1', username: 'u1' });
    });

    it('requireSocketAuth allows public events without socket.user', () => {
        const socket = fakeSocket({ user: null, use: mock.fn() });
        requireSocketAuth(socket);

        assert.strictEqual(socket.use.mock.callCount(), 1);
        const guardFn = socket.use.mock.calls[0].arguments[0];

        // Public event: user:login
        const next = mock.fn();
        guardFn(['user:login', {}, null], next);
        assert.strictEqual(next.mock.callCount(), 1);
        assert.strictEqual(next.mock.calls[0].arguments.length, 0);
    });

    it('requireSocketAuth blocks protected events without socket.user', () => {
        const socket = fakeSocket({ user: null, use: mock.fn() });
        requireSocketAuth(socket);

        const guardFn = socket.use.mock.calls[0].arguments[0];

        // Protected event: profile:details
        let callbackResult = null;
        const next = mock.fn();
        guardFn(['profile:details', {}, (res) => { callbackResult = res; }], next);

        assert.strictEqual(callbackResult?.status, 401);
        assert.strictEqual(callbackResult?.message, 'unauthorized user');
        assert.strictEqual(next.mock.callCount(), 1);
        assert.ok(next.mock.calls[0].arguments[0] instanceof Error);
    });
});
