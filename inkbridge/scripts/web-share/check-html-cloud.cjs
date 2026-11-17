// Actual Cloudflare validation with synthetic HTML only; no formal note capture.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const project=path.resolve(__dirname,'../..'),profile=process.env.INKBRIDGE_TEST_SHARE_PROFILE||path.join(process.env.LOCALAPPDATA,'InkBridge');app.setPath('userData',path.join(profile,'Profile'));
app.whenReady().then(async()=>{
 const config=await require('../../src/main/share-credentials.cjs').createShareCredentials({filename:path.join(profile,'Profile/share-device.json'),safeStorage}).clientConfig(),saved=JSON.parse(await fs.readFile(path.join(project,'private-original-editor/html-electron-result.json'))),data=saved.data,graph=saved.graph;
 graph.workspaceId='html-acceptance-'+crypto.randomUUID();
 const api=require('../../src/main/share-client.cjs').createShareClient({...config,jobDirectory:path.join(data,'cloud-jobs')});
 const make=()=>require('../../src/main/web-share-export.cjs').exportWebShare({graph,rootBoardId:'board-main',selectedBoardIds:['board-main'],workspaceDirectory:data,projectDirectory:project,outputDirectory:path.join(data,'cloud-packages'),contentOnly:true,readerBuild:config.readerBuild});
 const options={workspaceId:graph.workspaceId,rootBoardId:'board-main',selection:['board-main'],readerBuild:config.readerBuild};
 let pkg=await make(),current=await api.publish({...options,packageDirectory:pkg.directory,expectedVersion:null}),disabled=false;
 try{
  const browser=updated=>execFileSync(process.execPath,[path.join(__dirname,'check-html-share.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',INKBRIDGE_HTML_SHARE_URL:current.url,INKBRIDGE_HTML_EXPECT_UPDATED:updated?'1':''},windowsHide:true,stdio:'pipe',timeout:120000});
  browser(false);const first=current,old=JSON.parse(await fs.readFile(path.join(pkg.directory,'share.json'))),page=old.attachments.find(a=>a.reason==='html-page-bundle');
  const root=path.join(data,'source.moved'),entry=path.join(root,'測試 網頁.html');if(!(await fs.readFile(entry,'utf8')).includes('id="updated"'))await fs.appendFile(entry,'<footer id="updated">新版 HTML 內容</footer>');
  const store=require('../../src/main/attachment-store.cjs').createAttachmentStore(path.join(data,'files'),()=>({})),pages=require('../../src/main/html-pages.cjs').createHtmlPages({attachments:store,nativeFactory:path.join(project,'private-original-editor/html-page-runtime.cjs')}),prepared=await pages.prepare(entry),known=new Set(graph.files.map(f=>f.id));graph.files.push(...prepared.fileRecords.filter(f=>!known.has(f.id)));const meta=graph.cardMetadata.find(m=>m.id===graph.contents.find(c=>c.kind==='html').id);Object.assign(meta,{fileId:prepared.file.id,url:prepared.file.pageUrl});graph.revision++;
  pkg=await make();current=await api.publish({...options,packageDirectory:pkg.directory,expectedVersion:first.version});assert.equal(current.url,first.url);assert.equal((await fetch(new URL(page.path,current.url))).status,404);browser(true);
  const latest=JSON.parse(await fs.readFile(path.join(pkg.directory,'share.json'))),nextPage=latest.attachments.find(a=>a.reason==='html-page-bundle');await api.setEnabled({publicationId:current.publicationId,expectedVersion:current.version,enabled:false});disabled=true;assert.equal((await fetch(new URL(nextPage.path,current.url))).status,404);
  const receipt={actualCloudflare:true,url:current.url,site:config.baseUrl,htmlCssImagesFontsAndModules:true,realBrowserInteraction:true,fixedUrlHtmlUpdate:true,oldHtmlRemoved:true,disabledNewReads:true,syntheticOnly:true};await fs.writeFile(path.join(project,'release/html-cloud-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{if(!disabled)await api.setEnabled({publicationId:current.publicationId,expectedVersion:current.version,enabled:false}).catch(()=>{});}
 app.quit();
}).catch(async error=>{await fs.writeFile(path.join(project,'release/html-cloud-error.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));console.error(error);app.exit(1);});
