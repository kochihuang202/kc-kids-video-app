// Actual native menu -> hidden Lexical exporter -> packaged files -> .NET ZIP reader.
const {_electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
const {createAttachmentStore}=require('../../src/main/attachment-store.cjs');
function unzip(file){
  const command=`[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[System.IO.Compression.ZipFile]::OpenRead($env:INKBRIDGE_ZIP_TEST_FILE); try { $result=@($zip.Entries | ForEach-Object { $stream=$_.Open(); $memory=New-Object System.IO.MemoryStream; try { $stream.CopyTo($memory); @{name=$_.FullName;data=[Convert]::ToBase64String($memory.ToArray())} } finally {$stream.Dispose();$memory.Dispose()} }); ConvertTo-Json -InputObject $result -Compress } finally {$zip.Dispose()}`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',command],{env:{...process.env,INKBRIDGE_ZIP_TEST_FILE:file},encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.replace(/^\uFEFF/,'')).map(row=>({name:row.name,bytes:Buffer.from(row.data,'base64')}));
}
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-export-'));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII=','base64');
  const image=createAttachmentStore(path.join(data,'files'),()=>({width:1,height:1})).prepare(png,'image.png');
  const {noteDocument}=await import('../../src/core/rich-document.mjs');
  const document=noteDocument({title:'中文匯出測試',body:'組合格式'});
  document.root.children[1].children[0].format=3;
  document.root.children.push({type:'paragraph',version:1,direction:null,format:'',indent:0,children:[{type:'image',version:1,src:'flexnote://file/'+image.fileId,altText:'實際附件',width:1,height:1,maxWidth:500,showCaption:false,caption:{editorState:{root:{children:[],direction:null,format:'',indent:0,type:'root',version:1}}}}]});
  const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
  db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'export-note',title:'中文匯出測試',body:'組合格式',document,kind:'text',tone:'sage'}},{type:'putInstance',data:{id:'placement',contentId:'export-note',boardId:'board-main',x:100,y:200,width:420,height:240,z:0}},{type:'putCatalog',kind:'file',data:image.fileRecord}]});db.close();
  const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env,timeout:15000});let page;
  try{
    page=await app.firstWindow();page.setDefaultTimeout(8000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready&&typeof window.exportHtmlFromContent==='function');
    await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();
    await page.evaluate(()=>window.__inkbridgeIntegrated.flush());const before=(await page.evaluate(()=>window.inkbridge.load())).contents;
    const point=await page.evaluate(()=>{const box=document.querySelector('#board').getBoundingClientRect(),s=window.__originalRequire(23).gt.getState(),node=s.nodes[0];return{x:box.x+s.view.translateX+(node.position.x+90)*s.view.scale,y:box.y+s.view.translateY+(node.position.y+40)*s.view.scale};});
    const menu=async()=>{const state=await page.evaluate(()=>window.__inkbridgeIntegrated.inspect());if(!state.selectedNodeIds.includes('placement'))await page.mouse.click(point.x,point.y);await page.locator('[aria-label="More options"]').click();await page.locator('.context-menu-root [data-key=export]').hover();await expect(page.locator('.context-menu-root [data-key=markdown]')).toBeVisible();};
    const artifacts=async ext=>{const base=path.join(data,'exports');try{const folders=await fs.readdir(base);return(await Promise.all(folders.map(async folder=>(await fs.readdir(path.join(base,folder))).filter(name=>name.endsWith(ext)).map(name=>path.join(base,folder,name))))).flat();}catch{return[];}};
    await menu();await page.locator('.context-menu-root [data-key=markdown]').click();await expect.poll(async()=>(await artifacts('.zip')).length).toBe(1);
    const archive=unzip((await artifacts('.zip'))[0]),markdown=archive.find(row=>row.name.endsWith('.md'));
    assert.equal(markdown.name,'中文匯出測試.md');assert.match(markdown.bytes.toString(),/中文匯出測試/);assert.match(markdown.bytes.toString(),/\*{3}組合格式\*{3}|\*\*\*組合格式\*\*\*/);assert(!markdown.bytes.toString().includes('flexnote://'));assert.deepEqual(archive.find(row=>row.name.startsWith('media/')).bytes,png);
    await expect(page.locator('.context-menu-root')).toHaveCount(0);
    await menu();await page.locator('.context-menu-root [data-key=word]').click();await expect.poll(async()=>(await artifacts('.docx')).length).toBe(1);
    const word=unzip((await artifacts('.docx'))[0]),xml=word.find(row=>row.name==='word/document.xml').bytes.toString();
    assert.match(xml,/中文匯出測試/);assert.match(xml,/組合格式/);assert.match(xml,/<w:b\/>/);assert.match(xml,/<w:i\/>/);assert.deepEqual(word.find(row=>row.name.startsWith('word/media/')).bytes,png);assert(word.some(row=>row.name==='word/_rels/document.xml.rels'));
    assert.deepEqual((await page.evaluate(()=>window.inkbridge.load())).contents,before,'hidden exports must not change any note');assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
    console.log(JSON.stringify({nativeMarkdownMenu:true,nativeWordMenu:true,nativeLexicalConversion:true,combinedFormatting:true,chineseZipName:true,casMediaExact:true,independentZipRead:true,notesUnchanged:true}));
  }catch(error){if(page&&!page.isClosed()){console.log(await page.evaluate(()=>window.__inkbridgeIntegrated.errors));await page.screenshot({path:path.resolve(__dirname,'../../private-original-editor/exports-failure.png')});}await app.evaluate(({app})=>app.exit(1)).catch(()=>{});throw error;}
  finally{await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
