import "../helpers/setup.js";
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handleJournalJob } from '../../workers/journal.worker.js';

const makeJob = (overrides = {}) => ({
    name: 'createEmbedding',
    data: { journalId: 'j1', content: 'hello world' },
    log: mock.fn(),
    ...overrides
});

describe('handleJournalJob', () => {
    it('returns undefined and warns if job.name is not createEmbedding', async () => {
        const job = makeJob({ name: 'unknownJob' });
        const result = await handleJournalJob(job, {
            generateEmbeddingsFn: mock.fn(),
            JournalModel: {},
            pcIndex: {}
        });
        assert.strictEqual(result, undefined);
    });

    it('throws if journalId or content is missing', async () => {
        await assert.rejects(
            () => handleJournalJob(
                makeJob({ data: { journalId: null, content: 'text' } }),
                {}
            ),
            /Missing required job data/
        );
    });

    it('throws if embedding is empty', async () => {
        const generateEmbeddingsFn = mock.fn(async () => []);
        await assert.rejects(
            () => handleJournalJob(makeJob(), { generateEmbeddingsFn, JournalModel: {}, pcIndex: {} }),
            /empty result/
        );
    });

    it('returns { success: true } on happy path (embed -> mongo -> pinecone)', async () => {
        const fakeEmbedding = [0.1, 0.2, 0.3];
        const fakeJournalEntry = {
            _id: { toString: () => 'j1' },
            room: { toString: () => 'room_1' },
            author: { toString: () => 'user_1' }
        };
        const generateEmbeddingsFn = mock.fn(async () => fakeEmbedding);
        const JournalModel = { findOneAndUpdate: mock.fn(async () => fakeJournalEntry) };
        const pcIndex = { upsert: mock.fn(async () => {}) };

        const result = await handleJournalJob(makeJob(), { generateEmbeddingsFn, JournalModel, pcIndex });

        assert.deepStrictEqual(result, { success: true, journalId: 'j1' });
        assert.strictEqual(pcIndex.upsert.mock.callCount(), 1);
    });

    it('returns { success: false, reason: journal_not_found } if journal deleted mid-flight', async () => {
        const JournalModel = { findOneAndUpdate: mock.fn(async () => null) };
        const result = await handleJournalJob(makeJob(), {
            generateEmbeddingsFn: mock.fn(async () => [0.1]),
            JournalModel,
            pcIndex: { upsert: mock.fn() }
        });
        assert.deepStrictEqual(result, { success: false, reason: 'journal_not_found' });
    });
});
