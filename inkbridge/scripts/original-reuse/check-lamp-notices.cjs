// Real Electron check: operation notices go to the bottom-left lamp (progress amber, decisions
// blue with actions in its panel) and completions/failures use the original toast (55153);
// the old own notification boxes are gone. Notices are sent the way the main process does.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-lamp-'));
  const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env }); let page, stage = 'boot';
  const send = value => app.evaluate(({ BrowserWindow }, value) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('inkbridge:operation', value); }, value);
  const lamp = page => page.locator('#onedrive-save-indicator');
  try {
    page = await app.firstWindow(); page.setDefaultTimeout(10000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
    stage = 'progress on the lamp only';
    await send({ key: 'sync', state: 'progress', title: '正在同步工作區…' });
    await expect(lamp(page)).toHaveAttribute('data-notice', 'progress'); await expect(lamp(page)).toHaveAttribute('aria-label', /正在同步工作區/);
    assert.equal(await page.locator('#operation-notifications section').count(), 0, 'no own notification box');
    stage = 'update waits on the lamp';
    await send({ key: 'update', state: 'waiting', title: '發現程式新版本', action: 'update', releaseId: '00000000-0000-4000-8000-000000000000', message: '0.6.2' });
    await expect(lamp(page)).toHaveAttribute('data-notice', 'attention');
    await expect(page.getByText('點左下角燈號更新').first()).toBeAttached();
    await lamp(page).click(); await expect(page.locator('#onedrive-lamp-panel')).toContainText('發現程式新版本');
    await expect(page.locator('#onedrive-lamp-panel').getByRole('button', { name: '更新並重新啟動' })).toBeVisible();
    await page.keyboard.press('Escape');
    stage = 'clear';
    await send({ key: 'sync', state: 'clear' }); await send({ key: 'update', state: 'clear' });
    await expect(lamp(page)).toHaveAttribute('data-notice', 'none');
    stage = 'failure toast';
    await send({ key: 'save', state: 'error', title: '自動保存未完成', message: '磁碟已滿' });
    await expect(page.getByText('磁碟已滿').first()).toBeVisible();
    assert.equal(await page.locator('#operation-notifications section').count(), 0);
    console.log(JSON.stringify({ data, progressOnLamp: true, decisionOnLampWithActions: true, clear: true, originalToast: true }));
  } catch (error) { console.error({ stage, data }); await page?.screenshot({ path: path.join(data, 'failure.png') }).catch(() => {}); console.error(error); process.exitCode = 1; }
  finally { await app.close(); }
})();
