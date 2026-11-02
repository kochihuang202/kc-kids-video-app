// Full native75000/73866 note editor, with an owned single-writer/version bridge.
// Gemini b5fd5bc's dedicated renderer idea is retained; its independent SQLite
// coordinator and custom Markdown converter are intentionally not used.
import { PersistenceCoordinator } from '/inkbridge-core/persistence-coordinator.mjs';
import { documentIdentity, standaloneServices } from '/inkbridge-core/note-version.mjs';
import {installOperationUI} from './operation-ui.mjs';
import {noteDocument} from '/inkbridge-core/rich-document.mjs';
const r = window.__originalRequire, $ = s => document.querySelector(s);
const state = window.__inkbridgeStandalone = { ready: false, errors: [], conflict: false };
const rpc = async (method, payload) => { const response = await window.inkbridge.noteCall({ method, payload }); if (!response.ok)
    throw Object.assign(Error(response.error.message), { code: response.error.code }); return response.result; };
function report(error) { state.errors.push({ message: error.message, code: error.code }); $('#standalone-status').textContent = error.message; $('#standalone-status').dataset.error = 'true'; }
window.addEventListener('error', event => report(event.error || Error(event.message)));
window.addEventListener('unhandledrejection', event => report(event.reason instanceof Error ? event.reason : Error(String(event.reason))));
async function boot() {
    installOperationUI();
    r.p = '/_next/';
    r(64744);
    globalThis.__inkbridgeControlledNoteSaves = true;
    const React = r(27378), ReactDOM = r(31542), redux = r(63268).Z, Provider = r(16125).zt, Theme = r(2726).f, helpers = r(45828), id = new URL(location.href).searchParams.get('cardId');
    let initial;try{initial=await rpc('loadNote');}catch(error){if(error.code!=='NOTE_UNAVAILABLE')throw error;document.body.inert=false;$('#standalone-status').textContent='這張卡片已被移除，不會重新建立。';state.ready=true;window.inkbridge.onBridgeRequest(async()=>({saved:true}));window.inkbridge.ready();return;}
    initial.content={...initial.content,document:initial.content.document||noteDocument({title:initial.content.title,body:initial.content.body})};
    let content = initial.content, editor, stagedIdentity = documentIdentity(content.document), applying = false, setDocument, refreshing = Promise.resolve(), recoveryPath = '', closeEpoch = 0;
    r(19281).YH.init('inkbridge-local', initial.workspaceId);
    const pageProps = await fetch('/_next/data/LOq0EGi9XWnc3BD21aEGY/zh-TW/board.json').then(response => response.json());
    window.__NEXT_DATA__ = { buildId: 'LOq0EGi9XWnc3BD21aEGY', page: '/note-detail', query: { id, standalone: '1' }, props: pageProps, isFallback: false };
    const RouterContext = r(29242).RouterContext, pageLoader = new (r(43867).default)(window.__NEXT_DATA__.buildId, '');
    const router = r(51648).createRouter('/note-detail', { id, standalone: '1' }, '/zh-TW/note-detail?id=' + encodeURIComponent(id) + '&standalone=1', { initialProps: pageProps, pageLoader, App: r(64744).default, Component: r(75000).a, wrapApp: component => component, subscription: () => { }, isFallback: false, locale: 'zh-TW', locales: ['zh-TW', 'zh', 'en'], defaultLocale: 'zh-TW', isPreview: false });
    router.push = async (destination) => { await flush(); const url = new URL(typeof destination === 'string' ? destination : destination.pathname + '?' + new URLSearchParams(destination.query), location.origin); if (/\/note-detail\/?$/.test(url.pathname))
        return window.inkbridge.openNoteWindow({ cardId: url.searchParams.get('id') }); return rpc('navigate', { href: url.pathname + url.search }); };
    router.replace = router.push;
    window.router = router;
    function title() { const value = content.title || '筆記'; $('#standalone-title').textContent = value; document.title = value + ' — InkBridge'; }
    function read() { if (!editor || applying || editor.isComposing())
        return; const document = editor.getEditorState().toJSON(), identity = documentIdentity(document); if (identity === stagedIdentity)
        return; stagedIdentity = identity; coordinator.stage({ type: 'putContent', data: { id, document } }); }
    async function settleComposition() { if (editor?.isComposing()) {
        const root = editor.getRootElement();
        if (!root)
            throw Error('編輯器尚在組字，請完成輸入');
        await new Promise(resolve => root.addEventListener('compositionend', () => queueMicrotask(resolve), { once: true }));
    } }
    const pendingExternal = new Set();
    globalThis.__inkbridgeTrackOperation = operation => { const task = Promise.resolve().then(operation); pendingExternal.add(task); task.then(() => pendingExternal.delete(task), error => { pendingExternal.delete(task); report(error); }); return task; };
    const coordinator = new PersistenceCoordinator({ revision: content.revision, beforeFlush: async () => { await settleComposition(); read(); }, commit: async (request) => {
            const operation = request.operations.at(-1), ack = await rpc('commitNote', { requestId: request.requestId, expectedRevision: request.baseRevision, document: operation.data.document });
            content = { ...content, document: operation.data.document, title: helpers.LG(operation.data.document) };
            title();
            state.conflict = false;
            return ack;
        }, onStatus: value => { state.persistence = value; $('#standalone-status').dataset.error = String(!!value.error); $('#standalone-status').textContent = value.error ? '未保存：' + value.error : value.saving ? '正在保存…' : value.dirty ? '有待保存內容' : '已保存' + (recoveryPath ? '；舊草稿保留於 ' + recoveryPath : ''); $('#standalone-recover').hidden = !value.error; } });
    function register(value) { editor = value; state.editor = editor; stagedIdentity = documentIdentity(editor.getEditorState().toJSON()); editor.registerUpdateListener(({ tags }) => { if (tags.has('editor-force-update'))
        return; queueMicrotask(read); }); }
    async function flush() { while (pendingExternal.size)
        await Promise.all([...pendingExternal]); await coordinator.flush(); return { saved: true, revision: coordinator.revision }; }
    state.flush = flush;
    state.coordinator = coordinator;
    async function refresh() {
        read();
        if (!editor || editor.isComposing() || coordinator.pending.size || coordinator.inflight)
            return;
        const previous = stagedIdentity;
        let latest;
        try {
            latest = await rpc('loadNote');
        }
        catch (error) {
            if (error.code === 'NOTE_UNAVAILABLE') {
                editor.setEditable(false);
                $('#standalone-status').textContent = error.message;
            }
            else
                report(error);
            return;
        }
        read();
        if (editor.isComposing() || coordinator.pending.size || coordinator.inflight || stagedIdentity !== previous)
            return;
        if (latest.content.revision === coordinator.revision)
            return;
        applying = true;
        try {
            content = {...latest.content,document:latest.content.document||noteDocument({title:latest.content.title,body:latest.content.body})};
            editor.setEditorState(editor.parseEditorState(content.document), { tag: 'editor-force-update' });
            editor.update(() => { }, { discrete: true, tag: 'editor-force-update' });
            stagedIdentity = documentIdentity(editor.getEditorState().toJSON());
            setDocument(content.document);
            coordinator.revision = content.revision;
            title();
            coordinator.status();
        }
        finally {
            applying = false;
        }
    }
    // A broadcast can arrive before this renderer receives its own commit ACK.
    // Re-read after that flush finishes instead of permanently skipping the event.
    window.inkbridge.onWorkspaceUpdated(() => { const barrier = coordinator.flushTail; refreshing = refreshing.catch(() => { }).then(() => barrier.catch(() => { })).then(refresh); });
    const forwarded = new Set(standaloneServices);
    globalThis.__inkbridgeServices = { has: name => forwarded.has(name) || ['updateNoteCard', 'savePureBase64Image', 'savePastedImageBuffers', 'uploadFile'].includes(name), call: async (name, payload) => {
            if (name === 'updateNoteCard') {
                read();
                return;
            }
            if (name === 'savePureBase64Image' || name === 'savePastedImageBuffers') {
                const files = await window.inkbridge[name](payload);
                await rpc('service', { name: 'registerFiles', payload: { files: files.map(item => item.fileRecord) } });
                return files;
            }
            if (name === 'uploadFile') {
                const result = await window.inkbridge.uploadFile(payload);
                await rpc('service', { name: 'registerFiles', payload: { files: [result.fileRecord] } });
                return result;
            }
            if (!forwarded.has(name))
                throw Error('Unsupported standalone service: ' + name);
            return rpc('service', { name, payload });
        } };
    function NativeMainModalForwarder() { const ui = r(16125).v9(value => value.ui); React.useEffect(() => { if (!ui.globalModalShow)
        return; const payload = ui.globalModalParams; redux.dispatch(r(22676).aV({ show: false })); flush().then(() => rpc('service', { name: 'openCardInMainModal', payload })).catch(report); }, [ui.globalModalShow, ui.globalModalParams]); return null; }
    function App() {
        const [document, update] = React.useState(content.document);
        setDocument = update;
        return React.createElement(RouterContext.Provider, { value: router }, React.createElement(Provider, { store: redux }, React.createElement(Theme, { attribute: 'class', defaultTheme: 'light', enableSystem: false }, React.createElement(React.Fragment, null, React.createElement(r(75000).a, { id, cardId: id, editorContent: document, position: 'noteDetail', hideInfo: false, defaultExpandInfo: true, onEditorReady: register, onChange: read }), React.createElement(NativeMainModalForwarder), React.createElement(r(64744).InkBridgeCardPopover), React.createElement(r(64744).InkBridgeImportExportHost), React.createElement(r(55153).VW, { maxVisibleToasts: 1, placement: 'top-right' })))));
    }
    const Translated = r(1643).Jc(App);
    ReactDOM.createRoot($('#standalone-editor')).render(React.createElement(Translated, { pageProps: pageProps.pageProps }));
    await new Promise((resolve, reject) => { const deadline = setTimeout(() => reject(Error('Native editor did not initialize')), 30000); const poll = () => { if (editor) {
        clearTimeout(deadline);
        resolve();
    }
    else
        requestAnimationFrame(poll); }; poll(); });
    title();
    coordinator.status();
    document.body.inert = false;
    state.ready = true;
    window.inkbridge.onBridgeRequest(async (request) => { if(request.method==='resume'){closeEpoch++;document.body.inert=false;return {resumed:true};}if (request.method !== 'flush')
        throw Error('Unsupported editor lifecycle request'); const epoch = closeEpoch; try {
        await settleComposition();
        if (epoch !== closeEpoch)
            throw Error('關閉已取消');
        read();
        if (request.freeze !== false) document.body.inert = true;
        const result = await flush();
        if (epoch !== closeEpoch)
            document.body.inert = false;
        return result;
    }
    catch (error) {
        document.body.inert = false;
        state.conflict = error.code === 'CONTENT_CONFLICT';
        throw error;
    } });
    window.inkbridge.onCloseCancelled(request => { closeEpoch++; document.body.inert = false; $('#standalone-status').textContent = request.message; });
    window.inkbridge.ready();
    const saveSnapshot=async()=>{await flush();await window.inkbridge.createSnapshot();};
    $('#standalone-save').onclick = () => saveSnapshot().catch(report);
    document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveSnapshot().catch(report);
    } }, true);
    $('#standalone-recover').onclick = async () => { try {
        await settleComposition();
        document.body.inert = true;
        await coordinator.flushTail.catch(() => { });
        read();
        const noteDoc = editor.getEditorState().toJSON(), saved = await rpc('saveDraft', { baseRevision: coordinator.revision, document: noteDoc, title: helpers.LG(noteDoc) });
        recoveryPath = saved.file;
        const latest = await rpc('loadNote');
        applying = true;
        try {
            content = latest.content;
            editor.setEditorState(editor.parseEditorState(content.document), { tag: 'editor-force-update' });
            editor.update(() => { }, { discrete: true, tag: 'editor-force-update' });
            stagedIdentity = documentIdentity(editor.getEditorState().toJSON());
            clearTimeout(coordinator.timer);
            coordinator.timer = null;
            coordinator.pending.clear();
            coordinator.revision = content.revision;
            coordinator.error = null;
            setDocument(content.document);
            state.conflict = false;
            title();
            coordinator.status();
        }
        finally {
            applying = false;
        }
    }
    catch (error) {
        report(error);
    }
    finally {
        document.body.inert = false;
    } };
}
boot().catch(error => { document.body.inert = false; report(error); });
