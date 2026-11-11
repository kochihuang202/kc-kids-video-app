// Real Chrome user flows against a static-only, non-root publication URL.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test'),{exportWebShare}=require('../../src/main/web-share-export.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-web-share-')),project=path.resolve(__dirname,'../..');
 const graph=await require('../../tests/helpers/web-share-fixture.cjs')(data);
 const result=process.env.INKBRIDGE_WEB_PACKAGE?{directory:process.env.INKBRIDGE_WEB_PACKAGE}:await exportWebShare({graph,rootBoardId:'root',workspaceDirectory:data,projectDirectory:project,outputDirectory:path.join(project,'release/web-shares')});
 const root=result.directory,prefix='/published/demo/',requests=[],errors=[],external=[],failed=[];
 const original=await fs.readFile(path.join(root,'share.json'),'utf8');
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.pdf':'application/pdf','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const server=http.createServer(async(req,res)=>{try{
  requests.push({url:req.url,method:req.method});if(req.method!=='GET')throw Error('Read only');
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!name.startsWith(prefix))throw Error('Invalid prefix');
  const file=path.resolve(root,name.slice(prefix.length)||'index.html');if(path.relative(root,file).startsWith('..'))throw Error('Path escape');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+prefix;
 const browser=await chromium.launch({headless:false,channel:'chrome'}).catch(error=>{server.close();throw error;});
 const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(url).origin)return route.continue();external.push(route.request().url());return route.abort();});
 let stage='boot';
 const inspect=()=>page.evaluate(()=>window.__inkbridgeWeb.inspect());
 const loaded=async id=>{await page.waitForFunction(id=>window.__inkbridgeWeb?.inspect?.().nodes.some(n=>n.id===id),id,{timeout:40000});};
 const click=async(id,dx=50,dy=40)=>{const point=await page.evaluate(({id,dx,dy})=>{
  const s=window.__inkbridgeWeb.inspect(),node=s.nodes.find(n=>n.id===id),box=document.querySelector('canvas').getBoundingClientRect();
  return {x:box.x+s.view.translateX+(node.position.x+dx)*s.view.scale,y:box.y+s.view.translateY+(node.position.y+dy)*s.view.scale};
 },{id,dx,dy});await page.mouse.click(point.x,point.y);};
 try{
  await page.goto(url);await loaded('note-instance');assert.equal((await inspect()).nodes.length,4);
  stage='zoom and pan';const before=(await inspect()).view.scale;await page.getByRole('button',{name:'zoom-in',exact:true}).click();await expect.poll(async()=>(await inspect()).view.scale).not.toBe(before);
  const view=(await inspect()).view;await page.mouse.move(500,860);await page.mouse.down({button:'right'});await page.mouse.move(550,880,{steps:8});await page.mouse.up({button:'right'});await expect.poll(async()=>(await inspect()).view.translateX).not.toBe(view.translateX);
  stage='native read-only note';await click('note-instance',100,80);await expect(page.getByText('第一頁中文內容',{exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.notes_sidebar-right').evaluate(e=>Math.round(e.getBoundingClientRect().width))).toBe(460);
  await expect(page.locator('[data-tabs-tab]')).toHaveCount(2);await page.locator('[data-tabs-tab]').nth(1).click();await expect(page.getByText('第二頁中文內容',{exact:true})).toBeVisible();
  await expect(page.getByText('提示正文可以閱讀',{exact:true})).toBeVisible();const title=page.locator('[data-callout-title-input]');await expect(title).toHaveValue('提示區塊標題');assert(await title.evaluate(e=>e.readOnly||e.disabled));
  const editor=page.locator('.ContentEditable__root').first();assert.equal(await editor.getAttribute('contenteditable'),'false');const oldText=await editor.innerText();await editor.click();await page.keyboard.type('MUST_NOT_EDIT');await page.keyboard.press('Delete');assert.equal(await editor.innerText(),oldText);assert.equal(await page.locator('[contenteditable=true]').count(),0);
  const inline=page.getByAltText('原始綠色圖片');await expect(inline).toBeVisible();await expect.poll(()=>inline.evaluate(e=>e.complete&&e.naturalWidth)).toBe(128);
  await page.screenshot({path:path.join(data,'note.png')});
  stage='native image gallery';await page.keyboard.press('Escape');await click('image-instance',100,80);const gallery=page.locator('.PhotoView-Portal img').first();await expect(gallery).toBeVisible();await expect.poll(()=>gallery.evaluate(e=>e.complete&&e.naturalWidth)).toBe(128);await page.keyboard.press('Escape');await expect(page.locator('.PhotoView-Portal')).toBeHidden();
  stage='native PDF pagination';await click('pdf-instance',100,100);await expect(page.locator('.textLayer').first()).toContainText('INKBRIDGE PAGE 1',{timeout:30000});
  const number=page.getByRole('spinbutton');await number.fill('3');await number.press('Enter');await expect(page.getByText('INKBRIDGE PAGE 3',{exact:true})).toBeInViewport();
  await page.screenshot({path:path.join(data,'pdf.png')});await page.getByRole('button',{name:'收合側邊欄',exact:true}).click();await page.getByRole('button',{name:'zoom',exact:true}).click();await page.getByRole('button',{name:'50%',exact:true}).click();await expect.poll(async()=>(await inspect()).view.scale).toBe(.5);
  stage='nested board navigation';await click('board-ref-0',100,100);await expect(page).toHaveURL(/shareId=child/);await loaded('child-note-instance');await click('board-ref-1',100,100);await expect(page).toHaveURL(/shareId=grand/);await loaded('grand-note-instance');
  stage='deep link reload';await page.reload();await loaded('grand-note-instance');await page.screenshot({path:path.join(data,'grand.png')});
  stage='browser back and breadcrumbs';await page.goBack();await expect(page).toHaveURL(/shareId=child/);await loaded('child-note-instance');await page.getByRole('navigation',{name:'白板導覽'}).getByText('根白板',{exact:true}).click();await loaded('note-instance');
  stage='direct child URL';const second=await browser.newPage();await second.goto(url+'?shareId=grand');await second.waitForFunction(()=>window.__inkbridgeWeb?.inspect?.().nodes.some(n=>n.id==='grand-note-instance'));await second.close();
  assert.deepEqual(errors,[]);
  stage='reject unknown board';await page.goto(url+'?shareId=private');await expect(page.locator('#error')).toContainText('此白板不在分享包中');assert.equal(errors.length,1);assert(errors[0].includes('此白板不在分享包中'));
  assert.equal(await fs.readFile(path.join(root,'share.json'),'utf8'),original);assert(!original.includes('SECRET_'));assert.deepEqual(external,[]);assert.deepEqual(failed,[]);assert(requests.every(r=>r.method==='GET'&&r.url.startsWith(prefix)));assert(!requests.some(r=>r.url.includes('/api/')));
  const report={directory:root,data,nativeViewer:true,subdirectoryHosting:true,panZoom:true,tabs:true,callout:true,readOnly:true,inlineImage:true,imageGallery:true,pdfPage3:true,nestedRootChildGrandchild:true,reload:true,browserBack:true,breadcrumbs:true,directGrandchildURL:true,rejectUnpublishedBoard:true,noExternalRequests:true,noWriteRequests:true,publicationUnchanged:true};
  await fs.writeFile(path.join(project,'private-original-editor/web-share-research/browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){await fs.writeFile(path.join(data,'failure.json'),JSON.stringify({stage,errors,failed,requests,external,state:await page.evaluate(()=>window.__inkbridgeWeb?.inspect?.()||window.__inkbridgeWeb).catch(()=>null)},null,2));await page.screenshot({path:path.join(data,'failure.png')});console.error({stage,data,directory:root});throw error;
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
