const { _electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {WorkspaceDatabase} = require('../../src/main/database.cjs');

async function main() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-spaces-'));
  const relaunch = path.join(base, 'relaunch.txt');
  const seed = new WorkspaceDatabase(path.join(base, 'Workspace', 'inkbridge.sqlite3'));
  seed.commit({requestId: randomUUID(), baseRevision: 0, operations: [
    {type: 'putContent', data: {id: 'note-a', title: '原有筆記', body: '原有筆記', kind: 'text', tone: 'sage'}},
    {type: 'putInstance', data: {id: 'instance-a', contentId: 'note-a', boardId: 'board-main', x: 30, y: 30, width: 400, height: 160, z: 0}}
  ]});
  seed.close();

  let app, page;
  const env = {...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: base};
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.INKBRIDGE_PORTABLE;
  const graph = () => page.evaluate(() => window.inkbridge.load());
  const picker = () => page.getByRole('region', {name: '工作空間清單'});
  const toggle = () => page.locator('.workspace-trigger').click();

  async function start() {
    app = await _electron.launch({args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env});
    await app.evaluate(({app}, file) => {
      app.relaunch = () => {
        if (globalThis.failRelaunch) throw Error('test relaunch failure');
        process.getBuiltinModule('node:fs').writeFileSync(file, 'requested');
      };
    }, relaunch);
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
    await expect(page.locator('.workspace-trigger')).toBeVisible();
  }

  async function switchAndStart(button) {
    await fs.rm(relaunch, {force: true});
    const exited = app.waitForEvent('close', {timeout: 20000});
    await button.click().catch(error => {
      if (!/closed/i.test(error.message)) throw error;
    });
    await exited.catch(async error => {
      const message = await picker().getByRole('alert').allTextContents().catch(() => []);
      if (message.length) throw Error(`Workspace switch did not complete: ${message.join(' ')}`, {cause: error});
      throw error;
    });
    assert.equal(await fs.readFile(relaunch, 'utf8'), 'requested');
    await start();
  }

  try {
    await start();
    const original = await graph();
    await toggle();
    await picker().getByRole('button', {name: '新建工作空間'}).click();
    await picker().getByRole('textbox', {name: '工作空間名稱'}).fill('公司');
    await app.evaluate(() => { globalThis.failRelaunch = true; });
    await picker().getByRole('button', {name: '建立', exact: true}).click();
    await expect(picker().getByRole('alert')).toContainText('test relaunch failure');
    assert.equal((await graph()).workspaceId, original.workspaceId);
    assert.equal((await page.evaluate(() => window.inkbridge.workspaces({method: 'list'}))).workspaces.length, 1);
    await app.evaluate(() => { globalThis.failRelaunch = false; });
    await switchAndStart(picker().getByRole('button', {name: '建立', exact: true}));

    await expect(page.locator('.workspace-trigger')).toContainText('公司');
    const company = await graph();
    assert.notEqual(company.workspaceId, original.workspaceId);
    assert(!company.contents.some(content => content.id === 'note-a'));
    const info = await page.evaluate(() => window.inkbridge.info());
    assert.equal(path.dirname(info.dataRoot), path.join(base, 'Spaces'));
    await fs.access(path.join(info.dataRoot, 'files'));
    const ack = await page.evaluate(request => window.inkbridge.commit(request), {requestId: randomUUID(), baseRevision: company.revision, operations: [
      {type: 'putContent', data: {id: 'note-b', title: '公司筆記', body: '公司筆記', kind: 'text', tone: 'sage'}},
      {type: 'putInstance', data: {id: 'instance-b', contentId: 'note-b', boardId: 'board-main', x: 30, y: 30, width: 400, height: 160, z: 0}}
    ]});
    assert.equal(ack.ok, true);

    await toggle();
    await picker().getByRole('button', {name: '重新命名 公司', exact: true}).click();
    await picker().getByRole('textbox').fill('工作');
    await picker().getByRole('button', {name: '儲存', exact: true}).click();
    await expect(page.locator('.workspace-trigger')).toContainText('工作');
    await picker().getByRole('button', {name: '上移 工作', exact: true}).click();
    await expect(picker().getByRole('listitem').first()).toContainText('工作');
    await switchAndStart(picker().getByRole('button', {name: '主要工作空間', exact: true}));
    const returned = await graph();
    assert.equal(returned.workspaceId, original.workspaceId);
    assert(returned.contents.some(content => content.id === 'note-a'));
    assert(!returned.contents.some(content => content.id === 'note-b'));

    await toggle();
    await expect(picker().getByRole('listitem').first()).toContainText('工作');
    await switchAndStart(picker().getByRole('button', {name: '工作', exact: true}));
    const reopened = await graph();
    assert.equal(reopened.workspaceId, company.workspaceId);
    assert(reopened.contents.some(content => content.id === 'note-b'));
    console.log('PASS workspace create, failed relaunch rollback, rename, reorder, and data isolation across Electron restarts');
  } finally {
    await app?.close().catch(() => {});
    const resolved = await fs.realpath(base);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert(path.basename(resolved).startsWith('inkbridge-original-modules-spaces-'));
    await fs.rm(resolved, {recursive: true, force: true, maxRetries: 3});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
