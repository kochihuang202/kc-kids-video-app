const assert = require('node:assert/strict');
const {spawn, execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {chromium, expect} = require('@playwright/test');
const {WorkspaceDatabase} = require('../../src/main/database.cjs');

async function debugPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const {port} = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const install = await fs.realpath(process.argv[2]);
  const build = JSON.parse(await fs.readFile(path.join(install, 'portable-build.json'), 'utf8'));
  const exe = path.join(install, 'runtime', 'electron.exe');
  const temporary = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, 'inkbridge-workspace-relaunch-'));
  const data = path.join(root, 'InkBridge');
  const port = await debugPort();
  const flag = `--remote-debugging-port=${port}`;
  const debugURL = `http://127.0.0.1:${port}`;
  const env = {...process.env, LOCALAPPDATA: root, INKBRIDGE_PORTABLE: '1', INKBRIDGE_ORIGINAL_VIEW: 'board'};
  delete env.ELECTRON_RUN_AS_NODE;

  const seed = new WorkspaceDatabase(path.join(data, 'Workspace', 'inkbridge.sqlite3'));
  seed.commit({requestId: randomUUID(), baseRevision: 0, operations: [
    {type: 'putContent', data: {id: 'existing-note', title: '原有筆記', body: '原有筆記', kind: 'text', tone: 'sage'}},
    {type: 'putInstance', data: {id: 'existing-instance', contentId: 'existing-note', boardId: 'board-main', x: 30, y: 30, width: 400, height: 160, z: 0}}
  ]});
  const originalId = seed.workspaceId;
  seed.close();

  const child = spawn(exe, [flag, path.join(install, 'app', 'scripts', 'original-reuse', 'host.cjs')], {cwd: install, env, stdio: 'ignore'});
  const switches = [];
  let browser, page;
  const picker = () => page.getByRole('region', {name: '工作空間清單'});
  async function connect(previous) {
    let socket;
    await expect.poll(async () => {
      socket = await fetch(`${debugURL}/json/version`, {signal: AbortSignal.timeout(1500)})
        .then(response => response.json()).then(value => value.webSocketDebuggerUrl).catch(() => null);
      return !!socket && socket !== previous;
    }, {timeout: 35000}).toBe(true);
    browser = await chromium.connectOverCDP(socket, {timeout: 15000});
    const context = browser.contexts()[0];
    page = context.pages()[0] || await context.waitForEvent('page', {timeout: 15000});
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, undefined, {timeout: 20000});
    const info = await page.evaluate(() => window.inkbridge.info());
    assert.equal(info.version, build.version);
    switches.push(socket);
  }
  async function activate(button) {
    await button.click().catch(error => { if (!/closed/i.test(error.message)) throw error; });
    await expect.poll(() => browser.isConnected(), {timeout: 30000}).toBe(false);
    await connect(switches.at(-1));
  }
  try {
    await connect();
    const before = await page.evaluate(() => window.inkbridge.load());
    assert.equal(before.workspaceId, originalId);
    const box = await page.locator('#board').boundingBox();
    await page.mouse.dblclick(box.x + 250, box.y + 250);
    const editor = page.locator('#board [contenteditable=true]').first();
    await expect(editor).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.insertText('切換前最後一筆中文');
    await page.locator('.workspace-trigger').click();
    await picker().getByRole('button', {name: '新建工作空間'}).click();
    await picker().getByRole('textbox').fill('公司');
    await activate(picker().getByRole('button', {name: '建立', exact: true}));
    await expect(page.locator('.workspace-trigger')).toContainText('公司');
    const company = await page.evaluate(() => window.inkbridge.load());
    assert.notEqual(company.workspaceId, originalId);
    assert(!company.contents.some(row => row.id === 'existing-note' || row.body?.includes('切換前最後一筆中文')));
    await page.locator('.workspace-trigger').click();
    await activate(picker().getByRole('button', {name: '主要工作空間', exact: true}));
    const returned = await page.evaluate(() => window.inkbridge.load());
    assert.equal(returned.workspaceId, originalId);
    assert.equal(returned.contents.find(row => row.id === 'existing-note')?.body, '原有筆記切換前最後一筆中文');
    assert.equal(new Set(switches).size, 3);
    console.log(JSON.stringify({version: build.version, buildId: build.buildId, nativeRelaunches: 2, originalWorkspacePreserved: true, latestChineseEditPreserved: true, isolation: true}));
  } finally {
    // Only close the acceptance process. This cannot target a normal InkBridge session.
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$processes=Get-CimInstance Win32_Process -Filter "Name = \'electron.exe\'" | Where-Object { $_.ExecutablePath -eq $env:INKBRIDGE_RELAUNCH_EXE -and $_.CommandLine.Contains($env:INKBRIDGE_RELAUNCH_FLAG) -and $_.CommandLine -notmatch "--type=" }; foreach($entry in $processes){$app=Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue;if($app -and $app.CloseMainWindow()){if(-not $app.WaitForExit(15000)){throw "Test window did not close"}}}'],
      {windowsHide: true, env: {...env, INKBRIDGE_RELAUNCH_EXE: exe, INKBRIDGE_RELAUNCH_FLAG: flag}});
    if (child.exitCode === null) child.kill();
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), temporary);
    assert(path.basename(resolved).startsWith('inkbridge-workspace-relaunch-'));
    await fs.rm(resolved, {recursive: true, force: true, maxRetries: 5, retryDelay: 300});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
