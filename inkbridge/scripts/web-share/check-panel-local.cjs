// Real Electron share panel against a local copy of the share site (share-site/_worker.js on
// Miniflare over HTTPS with a self-signed certificate, accepted only by this test's process).
// Checks the user decisions of 2026-11-14: descendants selected by default, publish as the
// primary action above the extra options, and one fixed URL per board with a copy button.
// Synthetic workspace and local R2 only; nothing is sent to the real share site.
const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-share-local-')),graph=await require('../../tests/helpers/web-share-fixture.cjs')(data),db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 const operations=[...graph.boards.map(data=>({type:'putBoard',data})),...graph.contents.map(data=>({type:'putContent',data:{tone:'sage',body:'',...data}})),...graph.instances.map(data=>({type:'putInstance',data})),...graph.cardMetadata.map(data=>({type:'putCatalog',kind:'card',data})),...graph.files.map(data=>({type:'putCatalog',kind:'file',data})),...graph.whiteboardInstances.map(data=>({type:'putCatalog',kind:'whiteboard-instance',data}))];
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations});db.close();
 const config={modules:true,scriptPath:path.resolve(__dirname,'../../share-site/_worker.js'),compatibilityDate:'2026-08-28',r2Buckets:['SHARE_BUCKET'],bindings:{BOOTSTRAP_TOKEN_SHA256:hash('synthetic-bootstrap')},serviceBindings:{ASSETS:()=>new Response('<!doctype html><html><head></head><body>reader</body></html>',{headers:{'content-type':'text/html'}})},https:true,host:'127.0.0.1',port:0};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config),site=new URL(await mf.ready).origin;
 const local=(url,init)=>mf.dispatchFetch(url,{redirect:'manual',...init});
 const pairing=await(await local(site+'/api/pairings',{method:'POST',headers:{authorization:'Bearer synthetic-bootstrap','content-type':'application/json'},body:'{}'})).json();
 const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data,NODE_TLS_REJECT_UNAUTHORIZED:'0'};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const app=await _electron.launch({args:[path.join(__dirname,'../original-reuse/host.cjs')],executablePath:require('electron'),env});
 let page,savedClipboard=null;
 try{
  // The check writes to the system clipboard; keep the user's text and put it back afterwards.
  savedClipboard=await app.evaluate(({clipboard})=>clipboard.readText());
  page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await page.evaluate(()=>window.__inkbridgeIntegrated.switchBoard('root'));
  const t=key=>page.evaluate(key=>window.__originalRequire(1643).ag.t(key,{ns:'common'}),key);
  await page.locator('#original-native-tools .react-flow__panel').getByRole('button',{name:await t('share.title'),exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox',{name:'分享網站網址'}).fill(site);await page.getByRole('textbox',{name:'裝置配對碼'}).fill(pairing.code);await page.getByRole('button',{name:'連接裝置',exact:true}).click();
  // 1. Never published: child and grandchild are selected by default; the private board is not in the tree.
  const tree=page.getByTestId('share-board-tree');await expect(tree).toBeVisible();
  const box=id=>tree.locator('[data-board-id="'+id+'"]').getByRole('checkbox');
  for(const id of ['root','child','grand'])await expect(box(id)).toBeChecked();await expect(tree).not.toContainText('PRIVATE');
  // 2. Publish is the primary, large button and comes before the extra options.
  const first=page.locator('[data-inkbridge-publish="first"]');await expect(first).toBeVisible();
  const layout=await page.evaluate(()=>{const b=document.querySelector('[data-inkbridge-publish="first"]'),extras=document.querySelector('[data-testid="share-extra-options"]');return {before:!!(b.compareDocumentPosition(extras)&Node.DOCUMENT_POSITION_FOLLOWING),height:b.getBoundingClientRect().height,background:getComputedStyle(b).backgroundColor};});
  assert.equal(layout.before,true,'publish button above the extra options');assert(layout.height>=40,'large publish button: '+layout.height);
  await page.screenshot({path:path.join(data,'share-local-before.png')});
  await first.click();
  let receipt;await expect.poll(async()=>{receipt=await page.evaluate(()=>window.inkbridge.webShare({method:'status',boardId:'root'}));return !!receipt?.publicationId;},{timeout:120000}).toBe(true);
  // 3. One fixed URL per published board; the panel shows the root's own URL.
  assert.deepEqual(Object.keys(receipt.boardUrls).sort(),['child','grand','root']);
  assert.equal(new URL(receipt.boardUrls.root).pathname,'/s/'+receipt.publicationId+'/');
  await expect(page.getByRole('dialog')).toContainText(receipt.boardUrls.root);
  const child=await local(receipt.boardUrls.child);assert.equal(child.status,302);assert.equal(child.headers.get('location'),new URL(receipt.boardUrls.child).pathname+'?shareId=child');
  assert.equal((await local(receipt.boardUrls.grand+'share.json')).status,200);
  assert.equal(await page.locator('[data-inkbridge-publish="update"]').count(),1,'update button after publishing');
  // 4. Copy buttons per board copy that board's URL.
  await expect(tree.locator('[data-copy-board-url="grand"]')).toBeVisible();
  const clip=()=>app.evaluate(({clipboard})=>clipboard.readText()),reset=()=>app.evaluate(({clipboard})=>clipboard.writeText('inkbridge-check-sentinel'));
  await reset();await tree.locator('[data-copy-board-url="child"]').click();
  await expect.poll(clip).toBe(receipt.boardUrls.child);
  // 5. The original 複製 button beside the link copies the current board's URL (it used the
  // denied web clipboard before and only showed "copied").
  await reset();await page.getByRole('dialog').getByRole('button',{name:await t('share.settings.copy'),exact:true}).click();
  await expect.poll(clip).toBe(receipt.boardUrls.root);
  await page.screenshot({path:path.join(data,'share-local-after.png')});
  assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
  console.log(JSON.stringify({data,descendantsByDefault:true,publishPrimaryAboveOptions:true,boardUrls:Object.keys(receipt.boardUrls).length,childRedirect:true,copyBoardUrl:true,nativeCopyButton:true,realSiteUntouched:true}));
 }catch(error){await page?.screenshot({path:path.join(data,'share-local-failure.png')}).catch(()=>{});console.error({data});throw error;}
 finally{if(savedClipboard!==null)await app.evaluate(({clipboard},text)=>clipboard.writeText(text),savedClipboard).catch(()=>{});await app.close().catch(()=>{});await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
