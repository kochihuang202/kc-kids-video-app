const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{scopeWebShare}=require('./web-share-data.cjs');
async function exportWebShare({graph,rootBoardId,workspaceDirectory,projectDirectory,outputDirectory}){
 const selected=scopeWebShare(graph,rootBoardId),source=path.join(projectDirectory,'private-original-editor'),runtime=path.join(source,'web-runtime'),manifest=JSON.parse(await fs.readFile(path.join(runtime,'runtime-manifest.json')));
 const {noteDocument}=await import('../core/rich-document.mjs');for(const content of selected.graph.contents)if(content.kind==='text'&&content.document==null)content.document=noteDocument(content);
 const parent=path.resolve(outputDirectory),name='InkBridge-web-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8),stage=path.join(parent,'.pending-'+name),target=path.join(parent,name);await fs.mkdir(stage,{recursive:true});
 const copy=async(from,to)=>{await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true,dereference:false,errorOnExist:true,force:false});};
 try{
  for(const file of manifest.files){if(!/^[\w.-]+$/.test(file))throw Error('Unsafe runtime asset');await copy(path.join(runtime,file),path.join(stage,file));}
  for(const folder of ['fonts','canvaskit','pdfjs'])await copy(path.join(source,'vendor/app',folder),path.join(stage,folder));
  await copy(path.join(source,'vendor/app/_next/static/chunks/6989.3a38db4f1b05d6ee.js'),path.join(stage,'_next/static/chunks/6989.3a38db4f1b05d6ee.js'));
  await copy(path.join(source,'vendor/app/_next/static/css'),path.join(stage,'_next/static/css'));
  await copy(path.join(source,'vendor/app/_next/static/media'),path.join(stage,'_next/static/media'));
  for(const file of ['0a3dd850c67b254e.css','inkbridge-content-blocks.css'])await copy(path.join(source,'vendor/app/_next/static/css',file),path.join(stage,'styles',file));
  for(const folder of ['styles','_next/static/css'])for(const file of await fs.readdir(path.join(stage,folder))){const p=path.join(stage,folder,file);let css=await fs.readFile(p,'utf8');const base=folder==='styles'?'../':'../../../';css=css.replaceAll('url(/fonts/','url('+base+'fonts/').replaceAll('url(/_next/','url('+base+'_next/');await fs.writeFile(p,css);}
  for(const file of ['viewer.mjs','payload.mjs','index.html','inkbridge.svg','serve.cjs','Start-Web.bat'])await copy(path.join(projectDirectory,'src/web-share',file),path.join(stage,file));
  const attachments=[];await fs.mkdir(path.join(stage,'assets'));
  for(const record of selected.files){
   const expected=new RegExp('^files/'+record.id+'\\.(png|jpg|gif|webp|bmp|pdf)$');if(!/^[a-f0-9]{64}$/.test(record.id)||!expected.test(record.filePath))throw Error('附件格式尚未支援獨立網頁分享：'+record.name);
   if(record.size>25*1024*1024)throw Error('附件「'+record.name+'」超過目前網頁包的 25 MiB 單檔上限');
   const from=path.resolve(workspaceDirectory,record.filePath),real=await fs.realpath(from),filesRoot=await fs.realpath(path.join(workspaceDirectory,'files'));if(path.dirname(real)!==filesRoot)throw Error('Attachment escapes workspace');
   const bytes=await fs.readFile(real);if(bytes.length!==record.size||crypto.createHash('sha256').update(bytes).digest('hex')!==record.sha256||record.sha256!==record.id)throw Error('Attachment integrity failure: '+record.name);
   const filename=path.basename(record.filePath);await fs.writeFile(path.join(stage,'assets',filename),bytes,{flag:'wx'});attachments.push({source_file_id:record.id,path:'assets/'+filename,size:record.size,sha256:record.sha256});
  }
  await fs.writeFile(path.join(stage,'share.json'),JSON.stringify({format:selected.format,version:1,rootBoardId,boardIds:selected.boardIds,graph:selected.graph,attachments}));
  const scripts=manifest.files.filter(f=>f.endsWith('.js')).map(f=>`<script src="./${f}"></script>`).join('');const html=await fs.readFile(path.join(stage,'index.html'),'utf8');await fs.writeFile(path.join(stage,'index.html'),html.replace('<!-- NATIVE_RUNTIME -->',scripts));
  await fs.writeFile(path.join(stage,'_headers'),`/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
  await fs.writeFile(path.join(stage,'README.txt'),'InkBridge 唯讀網頁包\r\n本機：安裝 Node.js 後執行 Start-Web.bat。\r\n網站：將整個資料夾上傳靜態網站主機；入口 index.html。\r\n子白板使用 ?shareId=網址，不需伺服器 API。僅本次選定白板與其子白板包含在包內。\r\n');
  const fileRecords=[];async function inspect(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Web package symlink refused');if(entry.isDirectory())await inspect(f);else{const b=await fs.readFile(f);if(b.length>25*1024*1024)throw Error('Static asset exceeds 25 MiB');fileRecords.push({path:path.relative(stage,f).replaceAll('\\','/'),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}}await inspect(stage);
  await fs.writeFile(path.join(stage,'package-manifest.json'),JSON.stringify({format:'inkbridge-static-web',version:1,rootBoardId,boardCount:selected.boardIds.length,files:fileRecords},null,2));await fs.rename(stage,target);return {directory:target,rootBoardId,boards:selected.boardIds.length,files:fileRecords.length};
 }catch(error){await fs.writeFile(path.join(stage,'FAILED.txt'),error.message).catch(()=>{});throw error;}
}
module.exports={exportWebShare};
