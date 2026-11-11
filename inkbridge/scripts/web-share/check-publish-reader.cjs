// Targeted real Chrome acceptance for explicit scope, native image buckets and
// separate Pages-reader/R2-content paths. No FlexNote profile or server is used.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium,expect}=require('@playwright/test'),sharp=require('sharp');
const {exportWebShare}=require('../../src/main/web-share-export.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-publish-reader-')),project=path.resolve(__dirname,'../..'),graph=await require('../../tests/helpers/web-share-fixture.cjs')(data);
 const bytes=await sharp({create:{width:1280,height:960,channels:3,background:'#23aa5a'}}).png().toBuffer(),id=crypto.createHash('sha256').update(bytes).digest('hex');await fs.writeFile(path.join(data,'files',id+'.png'),bytes);
 graph.files.push({id,sha256:id,size:bytes.length,name:'large.png',type:'png',filePath:'files/'+id+'.png',metadata:JSON.stringify({width:1280,height:960})});
 graph.cardMetadata.find(r=>r.id==='image').fileId=id;graph.cardMetadata.find(r=>r.id==='image').width=1280;graph.cardMetadata.find(r=>r.id==='image').height=960;
 graph.instances=graph.instances.filter(i=>i.contentId==='image');graph.instances[0].x=40;graph.instances[0].y=50;
 const result=await exportWebShare({graph,rootBoardId:'root',selectedBoardIds:['root'],workspaceDirectory:data,projectDirectory:project,outputDirectory:path.join(data,'exports')});
 const publication=JSON.parse(await fs.readFile(path.join(result.directory,'share.json')));publication.publicationVersion='version-one';const image=publication.attachments.find(f=>f.source_file_id===id);
 assert(image.preview_path&&image.preview_path!==image.path);assert.equal(image.preview_width,512);assert.equal(image.width,1280);
 let version='version-one';const requests=[],errors=[],external=[],types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.pdf':'application/pdf','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const server=http.createServer(async(req,res)=>{try{
  requests.push(req.url);const url=new URL(req.url,'http://localhost');if(req.method!=='GET')throw Error('Read only');
  if(url.pathname==='/s/demo/share.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...publication,publicationVersion:version}));return;}
  if(url.pathname.startsWith('/s/demo/assets/')&&url.searchParams.get('v')!==version){res.writeHead(409);res.end('Version changed');return;}
  let name=url.pathname.startsWith('/reader/test/')?url.pathname.slice('/reader/test/'.length):url.pathname.startsWith('/s/demo/assets/')?url.pathname.slice('/s/demo/'.length):url.pathname==='/s/demo/'?'index.html':null;
  if(name===null)throw Error('Unknown path');const file=path.resolve(result.directory,name);if(path.relative(result.directory,file).startsWith('..'))throw Error('Path escape');res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');let body=await fs.readFile(file);if(name==='index.html')body=body.toString().replace('<head>','<head><base href="/reader/test/">');res.end(body);
 }catch{res.statusCode=404;res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/s/demo/',browser=await chromium.launch({headless:false,channel:'chrome'}),page=await browser.newPage({viewport:{width:1400,height:950}});page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(url).origin)return route.continue();external.push(route.request().url());return route.abort();});
 let stage='boot';try{
  await page.goto(url);await page.waitForFunction(()=>window.__inkbridgeWeb?.ready,{timeout:40000});
  await expect.poll(()=>requests.some(p=>p.startsWith('/s/demo/'+image.preview_path+'?v=version-one'))).toBe(true);
  stage='unshared placeholder';const nodes=await page.evaluate(()=>window.__inkbridgeWeb.inspect().nodes);const placeholder=nodes.find(n=>n.id==='board-ref-0');assert(placeholder);assert.equal(placeholder.data.title,'未分享');assert(!placeholder.data.shareId);
  const clickNode=async(id,dx=70,dy=50)=>{const point=await page.evaluate(({id,dx,dy})=>{const s=window.__inkbridgeWeb.inspect(),n=s.nodes.find(n=>n.id===id),b=document.querySelector('canvas').getBoundingClientRect();return {x:b.x+s.view.translateX+(n.position.x+dx)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+dy)*s.view.scale};},{id,dx,dy});await page.mouse.click(point.x,point.y);};
  await clickNode('board-ref-0');await page.waitForTimeout(300);assert.equal(new URL(page.url()).searchParams.get('shareId'),'root');assert(!requests.some(p=>p.includes('/api/')));
  stage='native resolution upgrade';await page.getByRole('button',{name:'zoom',exact:true}).click();await page.getByRole('button',{name:'200%',exact:true}).click();await expect.poll(()=>requests.some(p=>p.startsWith('/s/demo/'+image.path+'?v=version-one'))).toBe(true);
  stage='gallery full resolution';await clickNode('image-instance');const gallery=page.locator('.PhotoView-Portal img').first();await expect(gallery).toBeVisible();await expect.poll(()=>gallery.evaluate(e=>e.complete&&e.naturalWidth)).toBe(1280);await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(requests.some(p=>p.startsWith('/reader/test/factories-')));assert(!requests.some(p=>p==='/reader/test/share.json'));
  stage='publication replacement';version='version-two';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'重新載入',exact:true})).toBeVisible();await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.waitForFunction(()=>window.__inkbridgeWeb?.ready&&window.__inkbridgeWeb.publicationVersion==='version-two');
  const report={data,directory:result.directory,rootOnlyPrivacy:true,unsharedPlaceholderNoNavigation:true,separateReaderAndDataPaths:true,native512Preview:true,zoomLoadsFull:true,gallery1280:true,versionPinned:true,versionReplacementReload:true,noExternal:true,noServerFallback:true};await fs.writeFile(path.join(data,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await fs.writeFile(path.join(data,'failure.json'),JSON.stringify({stage,errors,external,requests,state:await page.evaluate(()=>window.__inkbridgeWeb?.inspect?.()||window.__inkbridgeWeb)},null,2));await page.screenshot({path:path.join(data,'failure.png')});console.error({stage,data});throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
