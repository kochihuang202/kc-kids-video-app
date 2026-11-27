const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {_electron, expect} = require('@playwright/test');
const sharp = require('sharp');
const {WorkspaceDatabase} = require('../../src/main/database.cjs');

async function main() {
  const temp = await fs.realpath(os.tmpdir());
  const data = await fs.mkdtemp(path.join(temp, 'inkbridge-original-modules-mindmap-zoom-'));
  const db = new WorkspaceDatabase(path.join(data, 'Workspace', 'inkbridge.sqlite3'));
  const {noteDocument} = await import('../../src/core/rich-document.mjs');
  db.commit({requestId:randomUUID(), baseRevision:0, operations:[
    {type:'putBoard', data:{id:'board-main', title:'Zoom', view:{x:0,y:0,zoom:1}}},
    {type:'putCatalog', kind:'mindmap', data:{id:'map', title:'Zoom', layoutMode:'logic-right'}},
    {type:'putCatalog', kind:'mindmap-node', data:{id:'root', mindMapId:'map', isRoot:true, type:'Text', childNodeIds:[], content:noteDocument('縮放測試')}},
    {type:'putCatalog', kind:'mindmap-instance', data:{id:'root', objectId:'map', whiteboardId:'board-main', x:270, y:255}},
  ]});
  db.close();
  const env = {...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA:data, INKBRIDGE_ORIGINAL_VIEW:'board'};
  delete env.INKBRIDGE_PORTABLE;
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];

  async function launch() {
    app = await _electron.launch({args:[path.join(__dirname,'host.cjs')], executablePath:require('electron'), env});
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
    await page.waitForFunction(() => window.__inkbridgeIntegrated.inspect().nodes.some(node => node.id === 'root'));
  }
  const zoom = () => page.evaluate(() => window.__inkbridgeIntegrated.inspect().view.scale);
  const rootPoint = () => page.evaluate(() => {
    const state = window.__inkbridgeIntegrated.inspect();
    const {position} = state.nodes.find(node => node.id === 'root');
    const canvas = document.querySelector('#board canvas').getBoundingClientRect();
    return {x: canvas.x + state.view.translateX + (position.x + 22) * state.view.scale,
      y: canvas.y + state.view.translateY + (position.y + 11) * state.view.scale};
  });
  async function hasRootColor() {
    assert.deepEqual(errors, [], 'native CanvasKit cannot finish a frame after a drawing exception');
    const point = await rootPoint();
    const image = await page.screenshot({clip:{x:Math.floor(point.x)-3,y:Math.floor(point.y)-3,width:12,height:10}});
    const pixels = await sharp(image).removeAlpha().raw().toBuffer();
    for (let i = 0; i < pixels.length; i += 3) {
      if (pixels[i] <= 5 && pixels[i+1] <= 12 && Math.abs(pixels[i+2]-41) <= 6) return true;
    }
    return false;
  }
  async function wheel(delta) {
    const point = await rootPoint();
    await page.mouse.move(point.x,point.y);
    await page.keyboard.down('Control');
    try { await page.mouse.wheel(0,delta); } finally { await page.keyboard.up('Control'); }
  }
  try {
    await launch();
    await expect.poll(hasRootColor).toBe(true);
    await wheel(1700);
    await expect.poll(zoom).toBeLessThan(.1);
    await expect.poll(hasRootColor).toBe(true);
    await wheel(-1700);
    await expect.poll(zoom).toBeGreaterThan(.8);
    await expect.poll(hasRootColor).toBe(true);
    await wheel(1700);
    await expect.poll(zoom).toBeLessThan(.1);
    await expect.poll(() => page.evaluate(() => window.inkbridge.sync({method:'deviceRead'}).then(state => state.boardViews?.['board-main']?.zoom))).toBeLessThan(.1);
    await app.close();
    await launch();
    assert((await zoom()) < .1);
    await expect.poll(hasRootColor).toBe(true);
    assert.equal((await page.evaluate(() => window.inkbridge.load())).mindmapNodes.length, 1);
    console.log('PASS mindmap pixels at 9.3%, wheel zoom out and back, saved low zoom and restart');
  } finally {
    await app?.close().catch(() => {});
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), temp);
    assert(path.basename(resolved).startsWith('inkbridge-original-modules-mindmap-zoom-'));
    await fs.rm(resolved, {recursive:true, force:true, maxRetries:4});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
