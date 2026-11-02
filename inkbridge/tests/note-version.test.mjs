import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNoteVersion, documentIdentity } from '../src/core/note-version.mjs';
test('different notes use content revisions rather than a shared workspace revision', () => {
    const current = { revision: 4, document: { root: { text: 'old' } } };
    assert.equal(checkNoteVersion(current, 4, { root: { text: 'new' } }), true);
    assert.throws(() => checkNoteVersion(current, 3, { root: { text: 'new' } }), { code: 'CONTENT_CONFLICT' });
});
test('canonical identity permits idempotent retries without making another content version', () => {
    const document = { root: { text: '中文', format: 3, unused: undefined } };
    assert.equal(documentIdentity(document), documentIdentity({ root: { format: 3, text: '中文' } }));
    assert.equal(checkNoteVersion({ revision: 8, document }, 7, { root: { format: 3, text: '中文' } }), false);
    assert.notEqual(documentIdentity({ children: ['a', 'b'] }), documentIdentity({ children: ['b', 'a'] }));
});
test('deleted or trashed notes cannot be recreated by a late editor commit', () => {
    assert.throws(() => checkNoteVersion(null, 4, { root: { text: 'draft' } }), { code: 'NOTE_UNAVAILABLE' });
});
