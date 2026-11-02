// Owned window/RPC boundary. Native32573 opens one window per note; the note UI
// and Lexical remain native75000/73866. No original Electron main is executed.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function installStandaloneWindows({ ipcMain, BrowserWindow, origin, data, preload, getMain, load }) {
    const windows = new Map(), pending = new Map();
    const child = event => { const row = [...windows.values()].find(row => row.window.webContents === event.sender); return row && event.senderFrame?.url === row.url ? row : null; };
    const main = event => event.sender === getMain()?.webContents && event.senderFrame?.url.startsWith(origin + '/');
    function request(window, payload) {
        if (!window || window.isDestroyed())
            return Promise.reject(Error('Editor window is closed'));
        return new Promise((resolve, reject) => { const id = crypto.randomUUID(), timer = setTimeout(() => { pending.delete(id); reject(Error('Editor did not acknowledge the operation; window retained')); }, 30000); pending.set(id, { sender: window.webContents.id, resolve, reject, timer }); window.webContents.send('inkbridge:bridge-request', { id, payload }); });
    }
    ipcMain.on('inkbridge:bridge-result', (event, value) => { const item = pending.get(value?.id); if (!item || item.sender !== event.sender.id)
        return; clearTimeout(item.timer); pending.delete(value.id); value.ok ? item.resolve(value.result) : item.reject(Object.assign(Error(value.error?.message || 'Editor operation failed'), { code: value.error?.code })); });
    async function open(payload) {
        const boardId=payload?.whiteboardId,workspace=!!boardId,id=boardId||payload?.cardId;
        if (typeof id !== 'string' || !id)
            throw Error('A note card ID is required');
        const graph = await load(), content = workspace?graph.boards.find(row=>row.id===id&&!row.attributes?.isTrashed):graph.contents.find(row => row.id === id && row.kind === 'text');
        if (!content || graph.cardMetadata?.some(row => row.id === id && row.isTrashed))
            throw Error('Note is missing or in trash');
        const key=(workspace?'Whiteboard:':'note-card:')+id,old = windows.get(key);
        if (old && !old.window.isDestroyed()) {
            if (old.window.isMinimized())
                old.window.restore();
            old.window.show();
            old.window.focus();
            return { success: true, windowId: old.window.id };
        }
        const win = new BrowserWindow({ width: 960, height: 760, minWidth: 560, minHeight: 420, show: false, autoHideMenuBar: true, title: (content.title || '筆記') + ' — InkBridge', backgroundColor: '#ffffff', ...(workspace?{titleBarStyle:'hidden',titleBarOverlay:{color:'#eeeef0',symbolColor:'#3f3f46',height:36}}:{}),webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
        const webContentsId = win.webContents.id;
        const row = { window: win, url: origin + (workspace?'/board-window?whiteboardId=':'/standalone?cardId=') + encodeURIComponent(id), cardId: workspace?null:id, kind:workspace?'workspace':'note', ready: false, approved: false, closing: null };
        windows.set(key, row);
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (event, url) => { if (url !== row.url)
            event.preventDefault(); });
        win.once('ready-to-show', () => { win.show(); win.focus(); });
        win.on('close', event => { if (row.approved)
            return; event.preventDefault(); if (row.closing)
            return; row.closing = (async () => { try {
            if (row.ready)
                await request(win, { method: 'flush' });
            row.approved = true;
            win.close();
        }
        catch (error) {
            win.webContents.send('inkbridge:close-cancelled', { message: error.message });
            require('electron').dialog.showErrorBox('InkBridge 尚未保存', error.message + '；保留編輯視窗。');
        }
        finally {
            row.closing = null;
        } })(); });
        win.on('closed', () => { if (windows.get(key) === row)
            windows.delete(key); for (const [key, item] of pending)
            if (item.sender === webContentsId) {
                clearTimeout(item.timer);
                pending.delete(key);
                item.reject(Error('Editor closed before acknowledgement'));
            } });
        await win.loadURL(row.url);
        return { success: true, windowId: win.id };
    }
    ipcMain.handle('inkbridge:open-note-window', (event, payload) => { if (!main(event) && !child(event))
        throw Error('Unexpected sender'); return open(payload); });
    ipcMain.handle('inkbridge:open-standalone-window',(event,payload)=>{if(!main(event)&&!child(event))throw Error('Unexpected sender');const route=new URL(payload?.route,origin+'/');if(route.origin!==origin)throw Error('External standalone route is not allowed');if(/\/flow$/.test(route.pathname))return open({whiteboardId:route.searchParams.get('whiteboardId')});if(/\/note-detail$/.test(route.pathname))return open({cardId:route.searchParams.get('id')});throw Error('此分頁類型尚未接入獨立視窗：'+route.pathname);});
    ipcMain.handle('inkbridge:note-call', async (event, { method, payload } = {}) => {
        const row = child(event);
        if (!row)
            throw Error('Unexpected sender');
        try {
            if (method === 'saveDraft') {
                const text = JSON.stringify({ cardId: row.cardId, createdAt: new Date().toISOString(), ...payload });
                if (Buffer.byteLength(text) > 8 * 1024 * 1024)
                    throw Error('Draft is too large');
                const directory = path.join(data, 'Recovery');
                fs.mkdirSync(directory, { recursive: true });
                const file = path.join(directory, crypto.randomUUID() + '.json'), fd = fs.openSync(file, 'wx');
                try {
                    fs.writeFileSync(fd, text);
                    fs.fsyncSync(fd);
                }
                finally {
                    fs.closeSync(fd);
                }
                return { ok: true, result: { file } };
            }
            if (!['loadNote', 'commitNote', 'service', 'navigate', 'workspaceCommit'].includes(method))
                throw Error('Unsupported note bridge operation');
            if(method==='workspaceCommit'&&row.kind!=='workspace')throw Error('Workspace writes require a registered board window');
            const result = await request(getMain(), { method, cardId: row.cardId, payload });
            if (method === 'navigate' || method === 'service' && payload?.name === 'openCardInMainModal') {
                getMain().show();
                getMain().focus();
            }
            return { ok: true, result };
        }
        catch (error) {
            return { ok: false, error: { message: error.message, code: error.code } };
        }
    });
    ipcMain.on('inkbridge:workspace-committed', event => { if (!main(event))
        return; for (const row of windows.values())
        if (row.ready && !row.window.isDestroyed())
            row.window.webContents.send('inkbridge:workspace-updated'); });
    const markReady = event => { const row = child(event); if (row)
        row.ready = true; };
    async function prepareAll() { try {
        for (const row of windows.values())
            if (!row.window.isDestroyed() && row.ready)
                await request(row.window, { method: 'flush' });
        await request(getMain(), { method: 'flush' });
    }
    catch (error) {
        await cancelAll();
        throw error;
    } }
    async function cancelAll() { for (const row of windows.values())
        if (!row.window.isDestroyed())
            row.window.webContents.send('inkbridge:close-cancelled', { message: '關閉已取消；草稿保留' }); }
    function destroyAll() { for (const row of windows.values()) {
        row.approved = true;
        if (!row.window.isDestroyed())
            row.window.close();
    } }
    return { child, main, markReady, prepareAll, cancelAll, destroyAll };
}
module.exports = { installStandaloneWindows };
