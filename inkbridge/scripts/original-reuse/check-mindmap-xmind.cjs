// Real Electron check for the XMind-parity mindmap (docs/MINDMAP_XMIND.md): Rainbow style as
// the default, no "+" beside topics, XMind keys (Enter/F2/Space, Enter ends editing), dropping
// on a topic's child side, branch colour from the menu (custom picker above it), cut/copy/paste of subtrees and external text, undo and restart.
// Synthetic SQLite workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
const sharp = require('sharp');
const doc = text => ({ root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }], direction: null, format: '', indent: 0 }], direction: null, format: '', indent: 0 } });
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-xmind-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
  const rows = [['root', '出發去動物園', ['a', 'b', 'c']], ['a', '麥當勞', ['a1', 'a2']], ['a1', '薯條', []], ['a2', '可樂', []], ['b', '動物', []], ['c', '要帶的物品', []]];
  db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putBoard', data: { id: 'board-main', title: 'XMind', view: { x: 0, y: 0, zoom: 1 } } }, { type: 'putCatalog', kind: 'mindmap', data: { id: 'map', title: 'Root', layoutMode: 'logic-right' } }, ...rows.map(([id, text, childNodeIds]) => ({ type: 'putCatalog', kind: 'mindmap-node', data: { id, mindMapId: 'map', isRoot: id === 'root', type: 'Text', content: doc(text), childNodeIds } })), { type: 'putCatalog', kind: 'mindmap-instance', data: { id: 'root', objectId: 'map', whiteboardId: 'board-main', x: 200, y: 300 } }] });
  const right = Array.from({ length: 11 }, (_, i) => `right-${i}`);
  const left = Array.from({ length: 10 }, (_, i) => `left-${i}`);
  const branchOrder = [...right.slice(0, 6), ...left, ...right.slice(6)];
  const dualRows = [
    ['dual-root', 'right', branchOrder],
    ...right.map(id => [id, 'right', []]),
    [left[0], 'left', ['left-child']],
    ...left.slice(1).map(id => [id, 'left', []]),
    ['left-child', 'left', []],
  ];
  db.commit({ requestId: crypto.randomUUID(), baseRevision: db.revision(), operations: [
    { type: 'putBoard', data: { id: 'board-dual', title: 'Dual side', view: { x: 0, y: 0, zoom: 1 } } },
    { type: 'putCatalog', kind: 'mindmap', data: { id: 'dual', title: 'Dual', layoutMode: 'dual-side' } },
    ...dualRows.map(([id, side, childNodeIds]) => ({ type: 'putCatalog', kind: 'mindmap-node', data: { id, mindMapId: 'dual', isRoot: id === 'dual-root', side, type: 'Text', content: doc(id), childNodeIds } })),
    { type: 'putCatalog', kind: 'mindmap-instance', data: { id: 'dual-root', objectId: 'dual', whiteboardId: 'board-dual', x: 400, y: 300 } },
  ] });
  const linkedBoard = 'board-reference';
  const linkedTitle = 'REFERENCE_BOARD';
  const linkedDoc = doc(linkedTitle);
  linkedDoc.root.children[0].children = [
    { type: 'mention', version: 1, objectId: linkedBoard, objectType: 'Whiteboard', mentionName: linkedTitle },
  ];
  const noteIds = ['mention-note-a', 'mention-note-b'];
  const noteTitles = ['MENTION_TARGET_A', 'MENTION_TARGET_B'];
  const noteLinkDoc = doc(noteTitles[0]);
  noteLinkDoc.root.children[0].children = [
    { type: 'mention', version: 1, objectId: noteIds[0], objectType: 'NoteCard', mentionName: noteTitles[0] },
  ];
  db.commit({ requestId: crypto.randomUUID(), baseRevision: db.revision(), operations: [
    { type: 'putBoard', data: { id: linkedBoard, title: linkedTitle, view: { x: 0, y: 0, zoom: 1 } } },
    { type: 'putBoard', data: { id: 'board-links', title: 'Mindmap links', view: { x: 0, y: 0, zoom: 1 } } },
    ...noteIds.map((id, i) => ({ type: 'putContent', data: { id, title: noteTitles[i], body: '', kind: 'text', tone: 'sage', document: doc(noteTitles[i]) } })),
    { type: 'putCatalog', kind: 'mindmap', data: { id: 'links', title: 'Links', layoutMode: 'logic-right' } },
    ...[
      ['links-root', undefined, ['link-dark', 'link-light', 'link-input'], doc('連結')],
      ['link-dark', '#274363', ['link-child'], linkedDoc],
      ['link-child', undefined, [], noteLinkDoc],
      ['link-light', '#008A9E', [], noteLinkDoc],
      ['link-input', '#008A9E', [], doc('')],
    ].map(([id, color, childNodeIds, content]) => ({
      type: 'putCatalog', kind: 'mindmap-node',
      data: { id, mindMapId: 'links', type: 'Text', isRoot: id === 'links-root', ...(color && { color }), childNodeIds, content },
    })),
    { type: 'putCatalog', kind: 'mindmap-instance', data: { id: 'links-root', objectId: 'links', whiteboardId: 'board-links', x: 200, y: 300 } },
  ] });
  db.close();
  const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
  const candidate = process.env.INKBRIDGE_TEST_BUILD;
  const launch = () => _electron.launch({
    args: [candidate ? path.join(candidate, 'app/scripts/original-reuse/host.cjs') : path.join(__dirname, 'host.cjs')],
    executablePath: candidate ? path.join(candidate, 'runtime/electron.exe') : require('electron'),
    env,
  });
  let app = await launch(), page, stage = 'boot'; const errors = [];
  const ready = async () => { page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message)); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('board-main')); await page.waitForFunction(() => window.__inkbridgeIntegrated.inspect().nodes.some(n => n.id === 'root')); await page.evaluate(() => window.__inkbridgeIntegrated.controls.fitView({ duration: 0, maxZoom: 1 })); await app.evaluate(({ app }) => app.focus({ steal: true })); await page.bringToFront(); };
  const map = async () => (await page.evaluate(() => window.inkbridge.load())).mindmapNodes.filter(n => n.mindMapId === 'map');
  const text = n => n.content?.root?.children?.map(p => (p.children || []).map(c => c.text).join('')).join('|');
  const tree = async () => { const all = await map(), by = new Map(all.map(n => [n.id, n])); const walk = (id, d) => { const n = by.get(id); return [' '.repeat(d) + text(n), ...(n.childNodeIds || []).flatMap(c => walk(c, d + 1))]; }; return walk('root', 0).join('/'); };
  const kids = async id => (await map()).find(n => n.id === id).childNodeIds;
  const state = () => page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(); return { sel: [...s.selectedNodeIds], editing: s.editingNodeId }; });
  const pos = id => page.evaluate(id => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.id === id), b = document.querySelector('#board').getBoundingClientRect(); return { x: b.x + s.view.translateX + (n.position.x + n.width / 2) * s.view.scale, y: b.y + s.view.translateY + (n.position.y + n.height / 2) * s.view.scale, w: n.width * s.view.scale, h: n.height * s.view.scale }; }, id);
  const click = async id => { const p = await pos(id); await page.mouse.click(p.x, p.y); await expect.poll(async () => (await state()).sel).toEqual([id]); };
  const blank = async () => { await page.keyboard.press('Escape'); await page.mouse.click(1100, 850); await page.waitForFunction(() => !window.__inkbridgeIntegrated.inspect().editingNodeId); };
  const checkDualColours = async () => {
    await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('board-dual'));
    await page.waitForFunction(() => window.__inkbridgeIntegrated.inspect().nodes.some(n => n.id === 'dual-root'));
    const { nodes, edges } = await page.evaluate(() => {
      const scene = window.__originalRequire(23).gt.getState();
      return {
        nodes: Object.fromEntries(scene.nodes.map(n => [n.id, { x: n.position.x, colour: n.data.inkbridgeBranchColor }])),
        edges: Object.fromEntries(scene.connections.map(edge => [edge.target.nodeId, edge.style.color])),
      };
    });
    assert(left.every(id => nodes[id].x < nodes['dual-root'].x));
    assert(right.every(id => nodes[id].x > nodes['dual-root'].x));
    const colours = branchOrder.map(id => nodes[id].colour);
    assert.equal(new Set(colours.slice(0, 20)).size, 20);
    assert.equal(colours[6], '#008A9E');
    assert.equal(colours[20], colours[0]);
    assert.equal(nodes['left-child'].colour, nodes[left[0]].colour);
    for (const id of [...left, ...right, 'left-child']) assert.equal(edges[id], nodes[id].colour);
    return nodes;
  };
  const openLinkBoard = async () => {
    await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('board-links'));
    await page.waitForFunction(() => window.__inkbridgeIntegrated.inspect().nodes.some(n => n.id === 'links-root'));
    await page.evaluate(() => window.__inkbridgeIntegrated.controls.fitView({ duration: 0, maxZoom: 1 }));
    await page.mouse.move(0, 0);
  };
  const checkMentionKeyboard = async () => {
    await click('link-input');
    await page.keyboard.press('F2');
    const editor = page.locator('#board [contenteditable=true]');
    await expect(editor).toBeVisible();
    await page.keyboard.insertText('@MENTION_TARGET');
    const menu = page.getByRole('dialog').last();
    for (const title of noteTitles) await expect(menu.getByRole('option', { name: title, exact: true })).toBeVisible();
    const activeTitle = async () => {
      const preview = await menu.locator('.preview').innerText();
      return noteTitles.find(title => preview.includes(title));
    };
    await expect.poll(activeTitle).toBeDefined();
    const before = await activeTitle();
    await page.keyboard.press('ArrowDown');
    await expect.poll(activeTitle).not.toBe(before);
    await page.keyboard.press('ArrowUp');
    await expect.poll(activeTitle).toBe(before);
    const chosenId = noteIds[noteTitles.indexOf(before)];
    assert(chosenId);
    await page.keyboard.press('Enter');
    await expect(editor.locator('[data-inline-mention-object-id="' + chosenId + '"]')).toBeVisible();
    await expect(menu).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state()).editing).toBe(null);
    await page.evaluate(() => window.__inkbridgeIntegrated.flush());
    const saved = (await page.evaluate(() => window.inkbridge.load())).mindmapNodes.find(n => n.id === 'link-input');
    assert(saved.content.root.children[0].children.some(n => n.type === 'mention' && n.objectId === chosenId));
    return chosenId;
  };
  const checkLinkPixels = async () => {
    const { data: pixels, info } = await sharp(await page.screenshot({ path: path.join(data, 'mindmap-links.png'), scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => {
      const offset = (y * info.width + x) * info.channels;
      return [...pixels.subarray(offset, offset + info.channels)];
    };
    for (const [id, fill, foreground] of [
      ['link-dark', [39, 67, 99], 255],
      ['link-child', [39, 67, 99], 255],
      ['link-light', [0, 138, 158], 0],
      ['link-input', [0, 138, 158], 0],
    ]) {
      const { x, y, w, h } = await pos(id);
      const left = Math.round(x - w / 2);
      const top = Math.round(y - h / 2);
      assert.deepEqual(pixel(left + 4, Math.round(y)), fill);
      const isInk = (x, y) => {
        const sample = pixel(x, y);
        const alpha = (sample[1] - fill[1]) / (foreground - fill[1]);
        return alpha > 0.35 && sample.every((channel, i) => Math.abs(channel - (fill[i] + alpha * (foreground - fill[i]))) < 5);
      };
      let longest = 0, iconPixels = 0;
      for (let row = top + 5; row < top + h - 5; row++) {
        for (let col = left + 8; col < left + 23; col++) iconPixels += Number(isInk(col, row));
        let run = 0;
        for (let col = left + 23; col < left + w - 4; col++) {
          run = isInk(col, row) ? run + 1 : 0;
          longest = Math.max(run, longest);
        }
      }
      assert(iconPixels > 8, id + ' has a high-contrast icon');
      assert(longest > 35, id + ' has a continuous high-contrast underline');
    }
  };
  try {
    await ready();
    stage = 'mention picker Enter';
    await openLinkBoard();
    const insertedNote = await checkMentionKeyboard();
    stage = 'note and whiteboard mention contrast';
    await openLinkBoard();
    await checkLinkPixels();
    await ready();
    stage = 'dual side default colours';
    const dualColours = await checkDualColours();
    await ready();
    stage = 'rainbow style by default';
    const look = await page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(); return { nodes: Object.fromEntries(s.nodes.filter(n => n.type === 'MindmapNode').map(n => [n.id, { style: n.data.inkbridgeMapStyle, branch: n.data.inkbridgeBranchColor, depth: n.data.inkbridgeDepth }])), edges: s.connections.filter(e => String(e.id).startsWith('mindmap-conn-')).map(e => ({ to: e.target.nodeId, pathType: e.pathType, color: e.style.color, width: e.style.strokeWidth })) }; });
    assert.equal(look.nodes.root.style, 'xmind');
    assert.deepEqual([look.nodes.a.branch, look.nodes.b.branch, look.nodes.c.branch], ['#F9423A', '#F6A04D', '#F3D321']);
    assert.deepEqual([look.nodes.a1.branch, look.nodes.a1.depth, look.nodes.a.depth], ['#F9423A', 2, 1]);
    assert.deepEqual(look.edges.find(e => e.to === 'a'), { to: 'a', pathType: 'mindmapCurve', color: '#F9423A', width: 3 });
    assert.deepEqual(look.edges.find(e => e.to === 'a1'), { to: 'a1', pathType: 'smoothStep', color: '#F9423A', width: 2 });
    stage = 'same background throughout a branch';
    const { data: pixels, info } = await sharp(await page.screenshot({ path: path.join(data, 'xmind-style.png'), scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const background = async id => {
      const { x, y, w } = await pos(id);
      const offset = (Math.round(y) * info.width + Math.round(x - w / 2 + 4)) * info.channels;
      return [...pixels.subarray(offset, offset + info.channels)];
    };
    const branchBackground = await background('a');
    assert.deepEqual(branchBackground, [249, 66, 58]);
    assert.deepEqual(await background('a1'), branchBackground);
    assert.deepEqual(await background('a2'), branchBackground);
    assert.notDeepEqual(await background('b'), branchBackground);
    stage = 'no add button';
    await click('a');
    const hit = await page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.id === 'a'), drawer = window.__originalRequire(66597).L.getDrawer('MindmapNode'); const ctx = { CanvasKit: window.__originalRequire(66597).L.CanvasKit, selectedNodeIds: s.selectedNodeIds, hoveredNodeId: 'a', isSelecting: false, getMindmap: id => window.__originalRequire(63268).Z.getState().flow.mindmaps.find(m => m.id === id), view: s.view }; const element = { ...n, x: n.position.x, y: n.position.y }; const results = []; for (let dx = 0; dx <= 80; dx += 4) { const r = drawer.isHit?.(n.position.x + n.width + dx, n.position.y + n.height / 2, element, ctx); if (r && typeof r === 'object' && r.action) results.push(r.action); } return results; });
    assert(!hit.includes('add'), 'no add hit area beside a topic: ' + hit.join(','));
    stage = 'toolbar only on right-click';
    const toolbar = () => page.evaluate(() => { const t = document.querySelector('.selection-toolbar-container'), m = document.querySelector('[class*="context-menu"]'); const tb = t?.getBoundingClientRect(), mb = m?.getBoundingClientRect(); return { shown: !!t && getComputedStyle(t).visibility !== 'hidden' && tb.width > 0, menu: !!m, overlap: !!(tb && mb && mb.top < tb.bottom && mb.bottom > tb.top && mb.left < tb.right && mb.right > tb.left), labels: t ? [...t.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || '') : [] }; });
    await blank(); await click('a'); await page.waitForTimeout(300); assert.equal((await toolbar()).shown, false, 'a click shows no toolbar');
    const pa = await pos('a'); await page.mouse.click(pa.x, pa.y, { button: 'right' });
    await expect.poll(async () => { const t = await toolbar(); return t.shown && t.menu && !t.overlap; }).toBe(true);
    const labels = (await toolbar()).labels; assert(labels.includes('收合子節點') && !labels.some(l => /Unterknoten/.test(l)), labels.join(','));
    await page.locator('.selection-toolbar-container button[aria-label="節點標記"]').click();
    await expect.poll(async () => (await toolbar()).menu).toBe(false);
    await expect(page.getByRole('button', { name: '彩色圓點：紅', exact: true })).toBeVisible();
    await blank(); await click('a'); await page.waitForTimeout(300); assert.equal((await toolbar()).shown, false, 'hidden again after reselecting');
    await blank();
    stage = 'menu colour recolours the branch';
    const branches = () => page.evaluate(() => Object.fromEntries(window.__originalRequire(23).gt.getState().nodes.filter(n => n.type === 'MindmapNode').map(n => [n.id, n.data.inkbridgeBranchColor || null])));
    const colours = async () => Object.fromEntries((await map()).map(n => [n.id, n.color || null]));
    const swatch = async (id, rgb) => { const p = await pos(id); await click(id); await page.mouse.click(p.x, p.y, { button: 'right' }); await expect.poll(async () => (await toolbar()).menu).toBe(true); await page.waitForTimeout(400); // the menu settles below the toolbar first
      const at = await page.evaluate(rgb => { const m = [...document.querySelectorAll('[class*="context-menu"]')].find(e => e.getBoundingClientRect().width > 0), e = [...m.querySelectorAll('div')].find(e => getComputedStyle(e).backgroundColor === rgb && e.getBoundingClientRect().width < 24); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, rgb);
      await page.mouse.click(at.x, at.y); };
    await swatch('a', 'rgb(79, 173, 220)');
    await expect.poll(async () => { const l = await branches(); return [l.a, l.a1, l.a2, l.b]; }).toEqual(['#4faddc', '#4faddc', '#4faddc', '#F6A04D']);
    // A child carrying the copied colour (as the original does on creation) follows a new branch colour.
    await page.evaluate(() => globalThis.__inkbridgeServices.call('updateMindMapNode', { node: { id: 'a1', color: '#4FADDC' } })); await blank();
    await swatch('a', 'rgb(208, 69, 69)');
    await expect.poll(async () => { const c = await colours(); return [c.a, c.a1, c.a2]; }).toEqual(['#D04545', '#D04545', null]);
    await expect.poll(async () => (await branches()).a2).toBe('#d04545');
    // The "+" custom colour picker opens above the menu and can be used.
    await blank(); const pa2 = await pos('a'); await click('a'); await page.mouse.click(pa2.x, pa2.y, { button: 'right' }); await expect.poll(async () => (await toolbar()).menu).toBe(true);
    await page.locator('[class*="context-menu"] button.z-10').first().click();
    await expect.poll(() => page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(i => /^#?[0-9A-F]{6}$/i.test(i.value)); if (!i) return 'none'; const r = i.getBoundingClientRect(), e = document.elementFromPoint(r.x + 5, r.y + 5); return e === i || i.contains(e); })).toBe(true);
    // White (the original's default) restores the rainbow colours for the branch.
    await page.keyboard.press('Escape'); await blank();
    await swatch('a', 'rgb(255, 255, 255)');
    await expect.poll(async () => { const l = await branches(); return [l.a, l.a1, l.a2]; }).toEqual(['#F9423A', '#F9423A', '#F9423A']);
    await blank();
    stage = 'Enter adds a sibling, Enter ends editing';
    await click('b'); await page.keyboard.press('Enter');
    await expect.poll(async () => (await kids('root')).length).toBe(4);
    const sibling = (await kids('root'))[2]; await expect.poll(async () => (await state()).editing).toBe(sibling);
    await page.keyboard.insertText('新節點'); await page.keyboard.press('Enter');
    await expect.poll(state).toEqual({ sel: [sibling], editing: null });
    await expect.poll(async () => text((await map()).find(n => n.id === sibling))).toBe('新節點');
    await page.keyboard.press('Enter'); await expect.poll(async () => (await kids('root')).length).toBe(5);
    await blank();
    stage = 'Enter on the central topic adds a main topic';
    await click('root'); await page.keyboard.press('Enter'); await expect.poll(async () => (await kids('root')).length).toBe(6);
    await blank();
    stage = 'F2 and Space edit';
    await click('c'); await page.keyboard.press('F2'); await expect.poll(async () => (await state()).editing).toBe('c'); await page.keyboard.press('Escape');
    await blank(); await click('c'); await page.keyboard.press(' '); await expect.poll(async () => (await state()).editing).toBe('c');
    await page.keyboard.press('End'); await page.keyboard.insertText('!'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state()).editing).toBe(null);
    await expect.poll(async () => text((await map()).find(n => n.id === 'c'))).toBe('要帶的物品!');
    await blank();
    stage = 'drop on the child side';
    for (const id of (await kids('root')).filter(id => !['a', 'b', 'c'].includes(id))) { await click(id); await page.keyboard.press('Delete'); await blank(); }
    await page.evaluate(() => window.__inkbridgeIntegrated.controls.fitView({ duration: 0, maxZoom: 1 }));
    const from = await pos('b'), to = await pos('c');
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 15, from.y + 15, { steps: 5 }); await page.mouse.move(to.x + to.w / 2 + 30, to.y, { steps: 20 }); await page.mouse.up();
    await expect.poll(async () => await kids('c')).toEqual(['b']);
    await blank();
    stage = 'cut, paste, copy, undo';
    await click('b'); await page.keyboard.press('Control+x'); await expect.poll(async () => await kids('c')).toEqual([]);
    await click('a2'); await page.keyboard.press('Control+v'); await expect.poll(tree).toBe('出發去動物園/ 麥當勞/  薯條/  可樂/   動物/ 要帶的物品!');
    await blank(); await click('a'); await page.keyboard.press('Control+c');
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('麥當勞\n\t薯條\n\t可樂\n\t\t動物');
    await click('c'); await page.keyboard.press('Control+v'); await expect.poll(tree).toBe('出發去動物園/ 麥當勞/  薯條/  可樂/   動物/ 要帶的物品!/  麥當勞/   薯條/   可樂/    動物');
    await blank(); await page.keyboard.press('Control+z'); await expect.poll(tree).toBe('出發去動物園/ 麥當勞/  薯條/  可樂/   動物/ 要帶的物品!');
    stage = 'paste external text';
    await app.evaluate(({ clipboard }) => clipboard.writeText('第一行\n第二行'));
    await click('c'); await page.keyboard.press('Control+v'); await expect.poll(tree).toBe('出發去動物園/ 麥當勞/  薯條/  可樂/   動物/ 要帶的物品!/  第一行/  第二行');
    stage = 'pasting an image keeps the map';
    // Image paste goes through the media-card writer, whose scene refresh once dropped mindmap nodes.
    await click('a1');
    await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 120, 80); const blob = await new Promise(done => c.toBlob(done, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', { type: 'image/png' })); (document.activeElement || document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    await expect.poll(() => page.evaluate(() => window.__originalRequire(23).gt.getState().nodes.some(n => n.type === 'MediaCard'))).toBe(true);
    assert.equal(await page.evaluate(() => window.__originalRequire(23).gt.getState().nodes.filter(n => n.type === 'MindmapNode').length), (await map()).length, 'every topic is still on the canvas');
    await blank();
    stage = 'restart';
    await page.evaluate(() => window.__inkbridgeIntegrated.flush()); await app.close(); app = await launch(); await ready();
    assert.equal(await tree(), '出發去動物園/ 麥當勞/  薯條/  可樂/   動物/ 要帶的物品!/  第一行/  第二行');
    assert.equal(await page.evaluate(() => window.__originalRequire(23).gt.getState().nodes.find(n => n.id === 'a').data.inkbridgeBranchColor), '#F9423A');
    assert.deepEqual(errors, []);
    assert.deepEqual(await checkDualColours(), dualColours);
    stage = 'mention after restart';
    await openLinkBoard();
    await checkLinkPixels();
    const restored = (await page.evaluate(() => window.inkbridge.load())).mindmapNodes.find(n => n.id === 'link-input');
    assert(restored.content.root.children[0].children.some(n => n.type === 'mention' && n.objectId === insertedNote));
    await click('link-dark');
    await page.keyboard.press('F2');
    const mention = page.locator('#board [contenteditable=true] [data-inline-mention-object-id="board-reference"]');
    await mention.click();
    await expect.poll(() => page.evaluate(() => window.__inkbridgeIntegrated.inspect().boardId)).toBe(linkedBoard);
    console.log(JSON.stringify({ data, rainbowDefault: true, dualSideColours: true, mentionContrast: true, keyboardMentionInsert: true, whiteboardMentionNavigation: true, noAddButton: true, toolbarOnRightClick: true, branchColour: true, customColourAbove: true, enterSiblingAndEndEdit: true, rootEnterMainTopic: true, f2SpaceEdit: true, dropOnChildSide: true, cutCopyPasteUndo: true, externalTextPaste: true, imagePasteKeepsMap: true, restart: true }));
  } catch (error) { console.error({ stage, data }); await page?.screenshot({ path: path.join(data, 'failure.png') }).catch(() => {}); console.error(error); process.exitCode = 1; }
  finally { await app.close(); }
})();
