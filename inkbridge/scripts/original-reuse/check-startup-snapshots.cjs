const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs'),{createDatabaseClient}=require('../../src/main/database-client.cjs'),{createWorkspaceSnapshots}=require('../../src/main/workspace-snapshots.cjs');
const {createStorageSettings}=require('../../src/main/storage-settings.cjs');
const project=path.resolve(__dirname,'../..');
const req=(baseRevision,body)=>({requestId:crypto.randomUUID(),baseRevision,operations:[{type:'putContent',data:{id:'card',title:'交接筆記',body,kind:'text',tone:'sage'}}]});
(async()=>{
  const seed=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-startup-seed-')),exchange=path.join(seed,'exchange'),local=path.join(seed,'local');await fs.mkdir(exchange);await fs.mkdir(path.join(local,'Profile'),{recursive:true});
  const db=new WorkspaceDatabase(path.join(local,'Workspace','inkbridge.sqlite3'));db.commit(req(0,'V1 本機原文'));db.close();
  const database=createDatabaseClient({filename:path.join(local,'Workspace','inkbridge.sqlite3')}),snapshots=createWorkspaceSnapshots({localDirectory:local,database,getExchange:()=>exchange,resolveAttachment:()=>{throw Error('No fixture attachment');}});
  const first=await snapshots.create(),workspaceId=first.workspaceId,firstDB=path.join(exchange,'snapshots',workspaceId,first.snapshotId,'database.sqlite3');
  await database.close();
  async function remote(name,body){const dir=path.join(seed,name);await fs.mkdir(path.join(dir,'Profile'),{recursive:true});await fs.mkdir(path.join(dir,'Workspace'));await fs.copyFile(firstDB,path.join(dir,'Workspace','inkbridge.sqlite3'));
    const state={deviceId:crypto.randomUUID(),heads:{[exchange+'|'+workspaceId]:{snapshotId:first.snapshotId,revision:first.revision}}};await fs.writeFile(path.join(dir,'Profile','snapshot-state.json'),JSON.stringify(state));
    const db=createDatabaseClient({filename:path.join(dir,'Workspace','inkbridge.sqlite3')});try{await db.commit(req(first.revision,body));return await createWorkspaceSnapshots({localDirectory:dir,database:db,getExchange:()=>exchange,resolveAttachment:()=>{throw Error('No attachment');}}).create();}finally{await db.close();}}
  const second=await remote('B','V2 另一台的新內容');
  async function fixture(){const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-startup-'));
    // The exchange must be a separate sibling, never within working data.
    const ex=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-startup-exchange-'));await fs.cp(exchange,ex,{recursive:true});
    await fs.mkdir(path.join(data,'Profile'));await fs.mkdir(path.join(data,'Workspace'));await fs.copyFile(firstDB,path.join(data,'Workspace','inkbridge.sqlite3'));
    await fs.writeFile(path.join(data,'Profile','snapshot-state.json'),JSON.stringify({deviceId:crypto.randomUUID(),heads:{[ex+'|'+workspaceId]:{snapshotId:first.snapshotId,revision:first.revision}}}));
    createStorageSettings({filename:path.join(data,'Profile','storage-settings.json'),localDirectory:data,applicationDirectory:project}).save(ex);return {data,exchange:ex};
  }
  async function launch(data){const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;const packaged=process.env.INKBRIDGE_STARTUP_PACKAGED_DIR;const app=await _electron.launch({args:[packaged?path.join(packaged,'app/scripts/original-reuse/host.cjs'):path.join(__dirname,'host.cjs')],executablePath:packaged?path.join(packaged,'runtime/electron.exe'):require('electron'),env});
    await app.evaluate(({dialog})=>{dialog.showErrorBox=(title,message)=>console.error(title,message);});const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);return {app,page};}
  const current=await fixture();let {app,page}=await launch(current.data);
  try{
    const notice=page.locator('#startup-snapshot-notice');await expect(notice).toContainText('發現同一版本鏈的新版本');await expect(notice).toContainText(second.snapshotId);
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V1 本機原文');
    await expect(page.locator('#persistence-status')).toContainText(`快照 v${first.revision}`);
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});await notice.getByRole('button',{name:'保存本機後載入新版'}).click();await expect(notice).toContainText('已取消載入');
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V1 本機原文');
    await app.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:1});app.relaunch=()=>{};});const closed=app.waitForEvent('close',{timeout:20000});await notice.getByRole('button',{name:'保存本機後載入新版'}).click().catch(()=>{});await closed;
    ({app,page}=await launch(current.data));assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V2 另一台的新內容');await expect(page.locator('#persistence-status')).toContainText(`快照 v${second.revision}`);
    await page.screenshot({path:path.join(current.data,'startup-loaded.png')});
  }finally{await app.close();}
  const incomplete=await fixture();await fs.rename(path.join(incomplete.exchange,'snapshots',workspaceId,second.snapshotId,'database.sqlite3'),path.join(incomplete.exchange,'snapshots',workspaceId,second.snapshotId,'database.offline'));
  ({app,page}=await launch(incomplete.data));try{
    const notice=page.locator('#startup-snapshot-notice');await expect(notice).toContainText('快照檔案尚未到齊');await expect(notice.getByRole('button',{name:'保存本機後載入新版'})).toHaveCount(0);
    await fs.rename(path.join(incomplete.exchange,'snapshots',workspaceId,second.snapshotId,'database.offline'),path.join(incomplete.exchange,'snapshots',workspaceId,second.snapshotId,'database.sqlite3'));
    await notice.getByRole('button',{name:'重新檢查'}).click();await expect(notice).toContainText('發現同一版本鏈的新版本');await expect(notice.getByRole('button',{name:'保存本機後載入新版'})).toBeVisible();
    await notice.getByRole('button',{name:'稍後再說'}).click();await expect(notice).toBeHidden();assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V1 本機原文');
  }finally{await app.close();}
  await remote('C','V2-C 獨立分支');const branched=await fixture();({app,page}=await launch(branched.data));try{
    const notice=page.locator('#startup-snapshot-notice');await expect(notice).toContainText('發現不同版本分支');await expect(notice.getByRole('button',{name:'保存本機後載入新版'})).toHaveCount(0);
    await page.screenshot({path:path.join(branched.data,'startup-branches.png')});await notice.getByRole('button',{name:'查看所有版本'}).click();await expect(page.locator('#workspace-snapshot-list')).toContainText(`v${second.revision}`);await expect(page.locator('#workspace-snapshot-list')).toContainText('來源電腦');
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V1 本機原文');
  }finally{await app.close();}
  console.log(JSON.stringify({startupFindsRemoteDescendant:true,noSilentOverwrite:true,cancelLoad:true,confirmRestoresNewer:true,versionFooter:true,incompleteBlockedThenArrives:true,branchesRequireChoice:true,data:current.data,branchData:branched.data}));
})().catch(error=>{console.error(error);process.exitCode=1;});
