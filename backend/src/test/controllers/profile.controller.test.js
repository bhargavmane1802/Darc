import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReq, mockRes, mockNext } from '../helpers/express.js';
import { user_Model } from '../../model/user.model.js';
import { profileDetails, updateProfileDetails, updateProfileAvatar } from '../../controllers/profile.controller.js';

describe('profile.controller', () => {
    describe('profileDetails', () => {
        it('returns 200 with user profile excluding password', async () => {
            const fakeUser = {
                _id: 'user123',
                username: 'alice',
                email: 'alice@example.com',
                name: 'Alice Cooper',
                about: 'Software engineer',
                status: 'Coding',
                imageUrl: 'https://cloudinary.com/pic.jpg',
            };

            const findByIdMock = mock.method(user_Model, 'findById', () => ({
                select: mock.fn(async () => fakeUser),
            }));

            const req = mockReq({ user: { id: 'user123' } });
            const res = mockRes();
            const next = mockNext();

            await profileDetails(req, res, next);

            assert.equal(res.status.mock.calls[0].arguments[0], 200);
            assert.deepEqual(res.json.mock.calls[0].arguments[0], fakeUser);

            findByIdMock.mock.restore();
        });

        it('returns 404 if user not found', async () => {
            const findByIdMock = mock.method(user_Model, 'findById', () => ({
                select: mock.fn(async () => null),
            }));

            const req = mockReq({ user: { id: 'nonexistent' } });
            const res = mockRes();
            const next = mockNext();

            await profileDetails(req, res, next);

            assert.equal(res.status.mock.calls[0].arguments[0], 404);
            assert.equal(res.json.mock.calls[0].arguments[0].message, 'user not found');

            findByIdMock.mock.restore();
        });
    });

    describe('updateProfileDetails', () => {
        it('updates name, about, status and returns 200', async () => {
            const updatedUser = {
                _id: 'user123',
                username: 'alice',
                name: 'Alice New Name',
                about: 'Updated about',
                status: '🟢 Available',
            };

            const findByIdAndUpdateMock = mock.method(user_Model, 'findByIdAndUpdate', () => ({
                select: mock.fn(async () => updatedUser),
            }));

            const req = mockReq({
                user: { id: 'user123' },
                body: { name: 'Alice New Name', about: 'Updated about', status: '🟢 Available' },
            });
            const res = mockRes();
            const next = mockNext();

            await updateProfileDetails(req, res, next);

            assert.equal(res.status.mock.calls[0].arguments[0], 200);
            assert.deepEqual(res.json.mock.calls[0].arguments[0], updatedUser);

            findByIdAndUpdateMock.mock.restore();
        });
    });

    describe('updateProfileAvatar', () => {
        it('updates avatar and imageUrl and returns 200', async () => {
            const updatedUser = {
                _id: 'user123',
                imageUrl: 'https://cloudinary.com/avatar.jpg',
                avatar: 'https://cloudinary.com/avatar.jpg',
            };

            const findByIdAndUpdateMock = mock.method(user_Model, 'findByIdAndUpdate', () => ({
                select: mock.fn(async () => updatedUser),
            }));

            const req = mockReq({
                user: { id: 'user123' },
                file: { path: 'https://cloudinary.com/avatar.jpg' },
            });
            const res = mockRes();
            const next = mockNext();

            await updateProfileAvatar(req, res, next);

            assert.equal(res.status.mock.calls[0].arguments[0], 200);
            const responseData = res.json.mock.calls[0].arguments[0];
            assert.equal(responseData.imageUrl, 'https://cloudinary.com/avatar.jpg');

            findByIdAndUpdateMock.mock.restore();
        });
    });
});
