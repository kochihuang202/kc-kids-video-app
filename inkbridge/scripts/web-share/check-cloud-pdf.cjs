const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const receipt=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../release/share-live-acceptance.json'))),url=process.env.INKBRIDGE_WEB_URL||receipt.url,dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-cloud-pdf-')),browser=await chromium.launch({headless:false,channel:'chrome'}),page=await browser.newPage({viewport:{width:1500,height:1000}}),ranges=[],errors=[],responses=[];
 page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('.pdf'))ranges.push({range:r.headers().range||null});});
 page.on('response',r=>{if(r.url().includes('.pdf'))responses.push({status:r.status(),range:r.headers()['content-range'],bytes:r.headers()['content-length']});});
 try{
  await page.goto(url);await page.waitForFunction(()=>window.__inkbridgeWeb?.inspect?.().nodes.some(n=>n.id==='pdf-instance'),null,{timeout:60000});
  await page.evaluate(()=>{window.__pdfTicks=0;window.__pdfHeartbeat=setInterval(()=>window.__pdfTicks++,50);});
  await page.evaluate(()=>new Promise(resolve=>{let last='',n=0;function tick(){const s=JSON.stringify(window.__inkbridgeWeb.inspect().view);n=s===last?n+1:0;last=s;if(n>=12)return resolve();requestAnimationFrame(tick);}tick();}));
  const point=await page.evaluate(()=>{const s=window.__inkbridgeWeb.inspect(),n=s.nodes.find(n=>n.id==='pdf-instance'),box=document.querySelector('canvas').getBoundingClientRect();return{x:box.x+s.view.translateX+(n.position.x+80)*s.view.scale,y:box.y+s.view.translateY+(n.position.y+80)*s.view.scale};});
  await page.mouse.click(point.x,point.y);await expect(page.locator('.textLayer').first()).toContainText('INKBRIDGE PAGE 1',{timeout:180000});
  const field=page.getByRole('spinbutton');await field.fill('3');await field.press('Enter');await expect(page.getByText('INKBRIDGE PAGE 3',{exact:true})).toBeInViewport({timeout:30000});
  const ticks=await page.evaluate(()=>{clearInterval(window.__pdfHeartbeat);return window.__pdfTicks;});assert(ticks>0);assert.deepEqual(errors,[]);
  const publication=await fetch(new URL('share.json',url)).then(r=>r.json()),size=publication.attachments.find(a=>a.contentType==='application/pdf').size;
  if(size>1024*1024)assert(ranges.some(r=>r.range));
  await page.screenshot({path:path.join(dir,'pdf-page3.png')});const result={actualCloudflare:true,exact512MiB:size===512*1024*1024,bytes:size,nativePDFPage3:true,byteRangeRequested:ranges.some(r=>r.range),uiHeartbeats:ticks,data:dir,url};await fs.writeFile(path.resolve(__dirname,'../../release/'+(result.exact512MiB?'share-pdf-browser-acceptance.json':'share-small-pdf-browser-acceptance.json')),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){await fs.writeFile(path.join(dir,'failure.json'),JSON.stringify({error:error.message,errors,ranges,responses},null,2));await page.screenshot({path:path.join(dir,'failure.png')});console.error({data:dir});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
