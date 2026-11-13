// Real Electron check: the left creation toolbar's 視頻 placement opens the original 67569 video
// dialog (toolbar child 6). Cancel leaves no card; create stores a path-linked card that plays.
// Synthetic ffmpeg fixture and a temporary workspace only.
const R=require('node:path').resolve(__dirname,'../..');
const {_electron,expect}=require(R+'/node_modules/@playwright/test'),fs=require('fs/promises'),path=require('path'),os=require('os'),assert=require('assert/strict');
(async()=>{const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-')),media=await fs.mkdtemp(path.join(os.tmpdir(),'ib-probe-media-'));const file=path.join(media,'sample.mp4');require(R+'/tests/helpers/video-fixture.cjs')(file);
const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({args:[R+'/scripts/original-reuse/host.cjs'],executablePath:require(R+'/node_modules/electron'),env});const page=await app.firstWindow();page.setDefaultTimeout(10000);const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
const t=k=>page.evaluate(k=>window.__originalRequire(1643).ag.t(k,{ns:'common'}),k);
const pending=()=>page.evaluate(()=>window.__originalRequire(23).gt.getState().nodes.filter(n=>n.type==='MediaCard').length);
const dialog=page.getByRole('dialog').filter({has:page.getByRole('tablist')});
const place=async(x,y)=>{await page.mouse.click(301,536);await page.waitForTimeout(300);await page.getByText(/^(視頻|视频)$/).first().click();await page.waitForTimeout(300);await page.mouse.click(x,y);await expect(dialog).toBeVisible();};
const res={};
try{
 // cancel: no orphan card
 await place(700,300);res.dialogOnPlace=true;await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await page.waitForTimeout(500);res.cancelLeavesNoCard=(await pending())===0;
 // create
 await place(700,400);
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),dialog.getByText(await t('videoModal.dropTitle'),{exact:true}).click()]);await chooser.setFiles(file);
 await expect(dialog.getByText(path.basename(file),{exact:true})).toBeVisible();
 await dialog.locator('button').filter({hasText:/^(創建|创建|Create)$/}).last().click();await expect(dialog).toBeHidden();await page.waitForTimeout(800);
 const g=await page.evaluate(()=>window.inkbridge.load());const c=g.contents.find(r=>r.kind==='video'),m=(g.cardMetadata||[]).find(r=>r.id===c?.id);
 res.stored=!!(c&&m&&m.path===file&&m.platform==='local');res.instances=g.instances.filter(r=>r.contentId===c?.id).length;res.oneNode=(await pending())===1;
 // open overlay and play
 const at=await page.evaluate(()=>{const s=window.__originalRequire(23).gt.getState(),n=s.nodes.find(n=>n.type==='MediaCard'),rect=(s.containerElement||s.canvasElement).getBoundingClientRect();return{x:rect.x+(n.position.x+n.width/2)*s.view.scale+s.view.translateX,y:rect.y+(n.position.y+n.height/2)*s.view.scale+s.view.translateY};});
 await page.mouse.click(at.x,at.y);await page.waitForTimeout(300);await page.mouse.click(at.x,at.y);
 await expect.poll(()=>page.evaluate(()=>{const v=document.querySelector('[data-video-overlay-content] video');return v?v.readyState:-1;}),{timeout:10000}).toBeGreaterThanOrEqual(2);res.plays=true;
 await page.screenshot({path:path.join(R,'private-original-editor','video-toolbar-insert.png')});
}catch(e){res.error=e.message.slice(0,400);await page.screenshot({path:path.join(R,'private-original-editor','video-toolbar-insert-error.png')});}
res.pageErrors=errs;console.log(JSON.stringify(res));await app.close();if(res.error||errs.length||!res.cancelLeavesNoCard||!res.stored||res.instances!==1||!res.plays)process.exitCode=1;})();
