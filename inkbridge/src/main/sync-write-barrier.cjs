// Editor flush ACKs are followed by a main-process gate. A late request aborts
// replacement while the old editor is still intact, rather than losing a draft.
function isWorkspaceWrite(channel, payload) {
    if (channel === 'inkbridge:commit')
        return true;
    if (['inkbridge:uploadFile', 'inkbridge:uploadHtmlPage', 'inkbridge:savePastedImageBuffers', 'inkbridge:savePureBase64Image'].includes(channel))
        return true;
    if (channel === 'inkbridge:note-call')
        return ['commitNote', 'workspaceCommit'].includes(payload?.method) || payload?.method === 'service' && /^(add|update|delete|batch|upsert|restore|set|save|create|insert|remove|move)/i.test(payload?.payload?.name || '');
    return ['inkbridge:open-note-window', 'inkbridge:open-standalone-window'].includes(channel);
}
function createSyncWriteBarrier() {
    let frozen = false, late = false;
    const active = new Set();
    function assertClean() { if (frozen && late)
        throw Object.assign(Error('同步前仍有新的編輯，已保留原視窗與草稿，稍後會重新合併'), { code: 'SYNC_LATE_WRITE' }); }
    function run(action) {
        if (frozen) {
            late = true;
            return Promise.reject(Object.assign(Error('正在安全合併，這筆操作尚未寫入；原視窗草稿保留'), { code: 'SYNC_WRITE_PAUSED' }));
        }
        const promise = Promise.resolve().then(action);
        active.add(promise);
        promise.finally(() => active.delete(promise)).catch(() => { });
        return promise;
    }
    return { run, assertClean, get frozen() { return frozen; }, async freeze() { frozen = true; late = false; const pending = [...active], results = await Promise.allSettled(pending); if (results.some(r => r.status === 'rejected' || r.value?.ok === false))
            late = true; assertClean(); return { drainedActive: pending.length > 0 }; }, resume() { frozen = false; late = false; } };
}
module.exports = { createSyncWriteBarrier, isWorkspaceWrite };
