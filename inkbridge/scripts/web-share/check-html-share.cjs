const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium,expect}=require('@playwright/test');
(async()=>{
 const project=path.resolve(__dirname,'../..'),receipt=JSON.parse(await fs.readFile(path.join(project,'private-original-editor/html-electron-result.json'))),live=process.env.INKBRIDGE_HTML_SHARE_URL;
 let server,dir,url=live;
 if(!live){const pkg=await require('../../src/main/web-share-export.cjs').exportWebShare({graph:receipt.graph,rootBoardId:'board-main',workspaceDirectory:receipt.data,projectDirectory:project,outputDirectory:path.join(project,'release/html-share-tests')});dir=pkg.directory;
  server=spawn(process.execPath,[path.join(dir,'serve.cjs')],{env:{...process.env,INKBRIDGE_NO_BROWSER:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{let buffer='';server.stdout.on('data',b=>{buffer+=b;const m=buffer.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.once('error',reject);server.once('exit',code=>reject(Error('Share server exited '+code)));});
 }
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1400,height:1000}}),failures=[];page.on('pageerror',e=>failures.push(e.message));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.__inkbridgeWeb?.ready,{},{timeout:60000});
  const frame=page.frameLocator('[data-website-overlay-frame]').first();await expect(frame.locator('#heading')).toHaveText('HTML 完整呈現',{timeout:30000});await expect(frame.locator('html')).toHaveAttribute('data-module-ready','yes');await expect(frame.locator('html')).toHaveAttribute('data-inline-ready','yes');await expect(frame.locator('body')).toHaveCSS('background-color','rgb(20, 80, 130)');await expect(frame.locator('#picture')).toHaveJSProperty('naturalWidth',80);
  if(process.env.INKBRIDGE_HTML_EXPECT_UPDATED==='1')await expect(frame.locator('#updated')).toHaveText('新版 HTML 內容');
  await expect(page.locator('[data-website-overlay-frame]').first()).toHaveAttribute('sandbox','allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation');await frame.locator('body').evaluate(()=>{localStorage.setItem('html-share-check','ok');});assert.equal(await frame.locator('body').evaluate(()=>localStorage.getItem('html-share-check')),'ok');
  const overlay=await page.locator('[data-website-overlay-content]').first().boundingBox();await page.mouse.click(overlay.x+20,overlay.y+80);
  const box=await page.locator('[data-website-overlay-frame]').first().boundingBox(),button=await frame.locator('#increment').evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth};});await page.mouse.click(box.x+button.x*box.width/button.width,box.y+button.y*box.width/button.width);await expect(frame.locator('#increment')).toHaveText('計數 1');
  await frame.locator('#typed').fill('網頁分享中文');await expect(frame.locator('#typed')).toHaveValue('網頁分享中文');
  await page.reload();await expect(frame.locator('html')).toHaveAttribute('data-module-ready','yes',{timeout:30000});assert.deepEqual(failures,[]);
  const out={actualCloudflare:!!live,url,directory:dir||null,imagesCssFont:true,modulesAndInteraction:true,nativeSandboxAndWebStorage:true,reload:true};await fs.writeFile(path.join(project,live?'release/html-share-live-browser.json':'release/html-share-offline-browser.json'),JSON.stringify(out,null,2));await page.screenshot({path:path.join(project,'private-original-editor/html-share-'+(live?'live':'offline')+'.png')});console.log(JSON.stringify(out));
 }catch(error){await page.screenshot({path:path.join(project,'private-original-editor/html-share-failure.png')});console.error({url,dir,failures});throw error;}finally{await browser.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
