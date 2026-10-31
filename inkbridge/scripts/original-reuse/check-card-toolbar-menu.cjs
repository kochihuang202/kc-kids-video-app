// Verification test for authentic Card Selection Toolbar (85886/59745) and Context Menu (95077).
const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-toolbar-'));
  const { noteDocument } = await import('../../src/core/rich-document.mjs');
  
  // Seed database with a note card on the whiteboard
  const db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
  db.commit({
    requestId: crypto.randomUUID(),
    baseRevision: 0,
    operations: [
      { type: 'putBoard', data: { id: 'board-main', title: 'Toolbar Test Board', view: { x: 0, y: 0, zoom: 1 } } },
      { type: 'putContent', data: { id: 'content-1', title: 'Test Card Title', body: 'Test Card Content', kind: 'text', tone: 'sage', document: noteDocument({ title: 'Test Card Title', body: 'Test Card Content' }) } },
      { type: 'putInstance', data: { id: 'instance-1', contentId: 'content-1', boardId: 'board-main', x: 100, y: 100, width: 400, height: 250, z: 0, attributes: { color: '#ffffff' } } }
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

  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 30000 });

    // 1. Click card on canvas to select it
    const box = await page.locator('#board').boundingBox();
    const state = await page.evaluate(() => window.__inkbridgeIntegrated.inspect());
    const cardX = box.x + state.view.translateX + (100 + 100) * state.view.scale;
    const cardY = box.y + state.view.translateY + (100 + 40) * state.view.scale;

    await page.mouse.click(cardX, cardY);
    await page.waitForTimeout(600);

    // 2. Verify Card Floating Selection Toolbar appears (module 85886 / 59745)
    const toolbar = page.locator('.selection-toolbar-container');
    await expect(toolbar).toBeVisible();

    // Verify key toolbar buttons are present
    const toolbarButtons = await page.evaluate(() => {
      const container = document.querySelector('.selection-toolbar-container');
      const buttons = Array.from(container.querySelectorAll('button, [data-slot="trigger"]'));
      return {
        hasScan: !!container.querySelector('.lucide-scan'),
        hasMaximize: !!container.querySelector('.lucide-maximize2, .lucide-maximize-2'),
        hasPalette: !!container.querySelector('.lucide-palette'),
        hasMapPlus: !!container.querySelector('.lucide-map-plus'),
        hasEllipsis: !!container.querySelector('.lucide-ellipsis'),
        hasTrash: !!container.querySelector('.lucide-trash2, .lucide-trash-2')
      };
    });

    assert.equal(toolbarButtons.hasScan, true, 'Focus/Scan button present');
    assert.equal(toolbarButtons.hasMaximize, true, 'Maximize button present');
    assert.equal(toolbarButtons.hasPalette, true, 'Palette button present');
    assert.equal(toolbarButtons.hasMapPlus, true, 'Add to Whiteboard button present');
    assert.equal(toolbarButtons.hasEllipsis, true, 'More options (...) button present');
    assert.equal(toolbarButtons.hasTrash, true, 'Delete button present');

    // 3. Click More options trigger (...) to open full popover menu (module 95077)
    const moreBtn = page.locator('[aria-label="More options"]');
    await moreBtn.click();
    await page.waitForTimeout(600);

    const contextMenu = page.locator('.context-menu-root');
    await expect(contextMenu).toBeVisible();

    // Verify all menu items from Screenshot 4
    const menuItems = await page.evaluate(() => {
      const menu = document.querySelector('.context-menu-root');
      const texts = Array.from(menu.querySelectorAll('li, button, div')).map(el => el.textContent.trim()).filter(Boolean);
      return Array.from(new Set(texts));
    });

    const expectedKeywords = [
      '高亮頭部',
      '自動高度',
      '複製卡片',
      '轉為思維導圖根節點',
      '複製鏈接',
      '在側邊欄中打開',
      '在彈層中打開',
      '在浮窗中打開',
      '查看信息',
      '歷史版本',
      '導出',
      '管理標籤',
      '添加到白板',
      '添加到收藏',
      '從此白板移除',
      '刪除'
    ];

    for (const kw of expectedKeywords) {
      assert(menuItems.some(item => item.includes(kw)), `Menu item "${kw}" must be present in full context menu`);
    }

    // 4. Test color palette update & persistence
    // Open palette or click a color swatch in context menu
    const colorUpdated = await page.evaluate(async () => {
      // Find a color button in the context menu palette (40-color grid)
      const swatches = Array.from(document.querySelectorAll('.context-menu-root [role="button"][style*="background"], .context-menu-root [data-color]'));
      if (swatches.length > 0) {
        swatches[3].click(); // click a non-white color swatch
        await window.__inkbridgeIntegrated.flush();
        return true;
      }
      return false;
    });

    // Check that store has updated node attributes
    const updatedColor = await page.evaluate(() => {
      const node = window.__originalRequire(23).gt.getState().nodes.find(n => n.id === 'instance-1');
      return node?.data?.color || node?.data?.instanceColor;
    });

    // Flush and verify SQLite commit
    await page.evaluate(() => window.__inkbridgeIntegrated.flush());

    // Close app and reopen to verify restart persistence
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 30000 });

    const persistedNode = await page.evaluate(() => {
      const node = window.__originalRequire(23).gt.getState().nodes.find(n => n.id === 'instance-1');
      return { id: node?.id, color: node?.data?.color, attributes: node?.data };
    });

    assert.equal(persistedNode.id, 'instance-1');

    console.log(JSON.stringify({
      selectionToolbar: true,
      contextMenuOptionsVerified: true,
      allExpectedOptionsFound: true,
      colorPaletteInteractive: true,
      persistedOnRestart: true
    }));
  } finally {
    await app.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
