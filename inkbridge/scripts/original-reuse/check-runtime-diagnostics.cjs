const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {_electron, expect} = require('@playwright/test');

async function main() {
  const temp = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temp, 'inkbridge-original-modules-diagnostics-'));
  const logs = path.join(root, 'Logs', 'Diagnostics');
  const env = {...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: root, INKBRIDGE_ORIGINAL_VIEW: 'board'};
  delete env.INKBRIDGE_PORTABLE;
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page, pid;

  async function launch() {
    app = await _electron.launch({args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env});
    pid = await app.evaluate(() => ({pid: process.pid, root: process.env.INKBRIDGE_ORIGINAL_PROBE_DATA})).then(identity => {
      assert.equal(identity.root, root);
      return identity.pid;
    });
    page = await app.firstWindow();
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, undefined, {timeout: 20000});
  }
  async function events() {
    const names = (await fs.readdir(logs)).filter(name => name.endsWith('.jsonl')).sort();
    return Promise.all(names.map(async name => (await fs.readFile(path.join(logs, name), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))));
  }
  async function waitForEvent(event, index = 0, timeout = 8000) {
    let match;
    await expect.poll(async () => {
      match = (await events())[index]?.find(row => row.event === event);
      return Boolean(match);
    }, {timeout}).toBe(true);
    assert(Number.isFinite(Date.parse(match.at)));
    return match;
  }
  async function exit(graceful) {
    const closed = app.waitForEvent('close', {timeout: 15000});
    if (graceful) await app.evaluate(({app}) => { setTimeout(() => app.exit(0), 100); });
    else process.kill(pid, 'SIGKILL');
    await closed;
    pid = null;
  }

  try {
    await launch();
    await page.getByRole('button', {name: '設定', exact: true}).click();
    await page.getByRole('tab', {name: '關於'}).click();
    await expect(page.getByRole('button', {name: '開啟診斷紀錄資料夾'})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(() => { setTimeout(() => {
      const error = new TypeError('synthetic private note contents: must not be persisted');
      error.code = 'DIAGNOSTIC_TEST';
      throw error;
    }, 0); });
    const error = await waitForEvent('renderer-exception');
    assert.equal(error.name, 'TypeError');
    assert.equal(error.code, 'DIAGNOSTIC_TEST');
    assert(!JSON.stringify(error).includes('private note contents'));

    await app.evaluate(() => { setTimeout(() => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 22000);
    }, 150); });
    const hang = await waitForEvent('main-unresponsive', 0, 22000);
    assert(hang.elapsedMs >= 15000);
    await waitForEvent('main-responsive', 0, 15000);

    const nativeWindow = await app.browserWindow(page);
    await nativeWindow.evaluate(win => { setTimeout(() => win.webContents.forcefullyCrashRenderer(), 100); });
    const crash = await waitForEvent('renderer-gone');
    assert.equal(typeof crash.exitCode, 'number');
    assert(['crashed', 'killed', 'abnormal-exit'].includes(crash.reason));
    await exit(false);

    await launch();
    const interrupted = await waitForEvent('previous-session-interrupted', 1);
    assert(Number.isFinite(Date.parse(interrupted.lastHeartbeatAt)));
    await exit(true);
    await waitForEvent('session-end', 1);

    await launch();
    const third = (await events())[2];
    assert(!third.some(row => row.event === 'previous-session-interrupted'));
    await exit(true);
    console.log(JSON.stringify({mainWatchdog:true, rendererException:true, rendererCrash:true, interruptedRestart:true, cleanExit:true, settingsEntry:true}));
  } finally {
    if (pid) {
      const closed = app.waitForEvent('close', {timeout: 5000}).catch(() => {});
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await closed;
    }
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), temp);
    assert(path.basename(resolved).startsWith('inkbridge-original-modules-diagnostics-'));
    await fs.rm(resolved, {recursive: true, force: true, maxRetries: 4});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
