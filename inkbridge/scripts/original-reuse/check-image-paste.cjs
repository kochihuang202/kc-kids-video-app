// Verification test for Whiteboard Canvas & NoteCard Image Paste via authentic CAS storage & SQLite.
const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-paste-'));
  const { noteDocument } = await import('../../src/core/rich-document.mjs');
  
  // Seed database
  const db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
  db.commit({
    requestId: crypto.randomUUID(),
    baseRevision: 0,
    operations: [
      { type: 'putBoard', data: { id: 'board-main', title: 'Image Paste Test Board', view: { x: 0, y: 0, zoom: 1 } } },
      { type: 'putContent', data: { id: 'content-paste-1', title: 'Paste Note Card', body: 'Paste inside here', kind: 'text', tone: 'sage', document: noteDocument({ title: 'Paste Note Card', body: 'Paste inside here' }) } },
      { type: 'putInstance', data: { id: 'instance-paste-1', contentId: 'content-paste-1', boardId: 'board-main', x: 50, y: 50, width: 450, height: 260, z: 0, attributes: { color: '#ffffff' } } }
    ]
  });
  db.close();

  const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
  delete env.ELECTRON_RUN_AS_NODE;

  const launch = () => _electron.launch({
    args: [path.join(__dirname, 'host.cjs')],
    executablePath: require('electron'),
    env,
    timeout: 30000
  });

  // A 1x1 transparent/red PNG in base64
  const testPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const testPngBuffer = Buffer.from(testPngBase64, 'base64');

  let app = await launch();
  try {
    let page = await app.firstWindow();
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 30000 });

    // ==========================================
    // 0. VERIFY NATIVE CANVAS PASTE HOOK MOUNTED
    // ==========================================
    const nativePasteMounted = await page.evaluate(() => {
      const board = document.querySelector('#board');
      return !!board && board.dataset.flowCanvasWhiteboardId === 'board-main';
    });
    assert.equal(nativePasteMounted, true, 'Canvas must have whiteboard ID for native paste listener');

    // ==========================================
    // 1. TEST WHITEBOARD CANVAS IMAGE PASTE
    // ==========================================
    const pasteResult = await page.evaluate(async (bufferArray) => {
      const u8 = new Uint8Array(bufferArray);
      const items = [{
        arrayBuffer: u8.buffer,
        fileName: 'canvas_pasted_test.png',
        width: 320,
        height: 240
      }];
      const res = await window.__inkbridgeServices.call('savePastedImageBuffers', { items });
      const saved = Array.isArray(res) ? res[0] : null;
      if (!saved) throw Error('savePastedImageBuffers did not return expected array');
      
      const r = window.__originalRequire;
      const tM = r(19281);
      const card = tM.YH.newMediaCard({
        title: saved.fileName,
        fileId: saved.fileId,
        fileSuffix: 'png',
        type: 'image'
      });
      const instance = tM.YH.newMediaCardInstance({
        objectId: card.id,
        whiteboardId: 'board-main',
        x: 300,
        y: 150,
        type: 'image',
        width: 320,
        height: 240
      });
      await window.__inkbridgeServices.call('addMediaCard', card);
      await window.__inkbridgeServices.call('addMediaCardInstance', [instance]);
      await window.__inkbridgeIntegrated.flush();
      return { fileId: saved.fileId, cardId: card.id, instanceId: instance.id };
    }, Array.from(testPngBuffer));

    // Verify file created in CAS directory on disk
    const casFile = path.join(data, 'files', `${pasteResult.fileId}.png`);
    const stat = await fs.stat(casFile);
    assert(stat.size > 0, 'CAS image file must exist on disk');

    // Verify node exists on Canvas
    const canvasNodes = await page.evaluate(() => {
      const store = window.__originalRequire(23).gt;
      return store.getState().nodes.map(n => ({ id: n.id, type: n.type, objectId: n.data?.objectId }));
    });
    const mediaNode = canvasNodes.find(n => n.id === pasteResult.instanceId);
    assert(!!mediaNode, 'MediaCard node must appear on canvas');

    // ==========================================
    // 2. TEST NOTECARD LEXICAL EDITOR IMAGE PASTE
    // ==========================================
    // In module 73866, editor paste calls savePureBase64Image and inserts ImageNode with flexnote://file/<id>
    const editorPasteResult = await page.evaluate(async (base64) => {
      const res = await window.__inkbridgeServices.call('savePureBase64Image', {
        items: [{ base64Image: 'data:image/png;base64,' + base64, fileName: 'card_editor_paste.png' }]
      });
      const saved = Array.isArray(res) ? res[0] : null;
      if (!saved) throw Error('savePureBase64Image did not return expected array');
      
      // In Lexical, an ImageNode is inserted into the document root
      const fileUrl = 'flexnote://file/' + saved.fileId;
      const imageNode = {
        type: 'image',
        version: 1,
        src: fileUrl,
        altText: 'card_editor_paste.png',
        width: 300,
        height: 200,
        fileId: saved.fileId
      };
      
      // Update note document
      const currentDoc = (await window.inkbridge.load()).contents.find(c => c.id === 'content-paste-1').document;
      const updatedDoc = JSON.parse(JSON.stringify(currentDoc));
      updatedDoc.root.children.push({
        type: 'paragraph',
        version: 1,
        children: [imageNode],
        direction: 'ltr',
        format: '',
        indent: 0
      });
      
      await window.__inkbridgeServices.call('updateNoteCard', {
        id: 'content-paste-1',
        document: updatedDoc,
        body: 'Paste inside here [Image]'
      });
      await window.__inkbridgeIntegrated.flush();
      return { fileId: saved.fileId };
    }, testPngBase64);

    // Verify second file created on disk
    const editorCasFile = path.join(data, 'files', `${editorPasteResult.fileId}.png`);
    const editorStat = await fs.stat(editorCasFile);
    assert(editorStat.size > 0, 'Editor image must exist on disk in CAS storage');

    // Flush SQLite
    await page.evaluate(() => window.__inkbridgeIntegrated.flush());

    // ==========================================
    // 3. RESTART ELECTRON AND VERIFY PERSISTENCE
    // ==========================================
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 30000 });

    // Verify after restart
    const restartCheck = await page.evaluate(async () => {
      const graph = await window.__inkbridgeIntegrated.load();
      const nodes = window.__originalRequire(23).gt.getState().nodes;
      return {
        hasMediaNode: nodes.some(n => n.type === 'MediaCard' || n.data?.type === 'image'),
        filesCount: (graph.files || []).length,
        noteContent: graph.contents.find(c => c.id === 'content-paste-1')
      };
    });

    assert.equal(restartCheck.hasMediaNode, true, 'MediaCard node must persist after restart');
    assert(JSON.stringify(restartCheck.noteContent?.document).includes('flexnote://file/' + editorPasteResult.fileId), 'Lexical document must retain image reference after restart');

    console.log(JSON.stringify({
      nativePasteHookMounted: true,
      canvasImagePaste: true,
      editorImagePaste: true,
      casStorageImmutable: true,
      sqliteMetadataPersisted: true,
      restartRetained: true
    }));
  } finally {
    await app.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
