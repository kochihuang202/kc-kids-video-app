const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {scopeWebShare}=require('./web-share-data.cjs'),{scanFile,copyVerified}=require('./stream-files.cjs');
const {createShareImages}=require('./share-images.cjs');
const TYPES={png:'image/png',jpg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',pdf:'application/pdf',json:'application/json',js:'text/javascript',mjs:'text/javascript',html:'text/html',css:'text/css',svg:'image/svg+xml',wasm:'application/wasm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
const EXT={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/bmp':'bmp','application/pdf':'pdf'};
async function exportWebShare({graph,rootBoardId,selectedBoardIds,workspaceDirectory,projectDirectory,outputDirectory,imagePreset='clarity',losslessImageIds=[],shareImages,imageCacheDirectory,contentOnly=false,readerBuild,capturedAt,revision}){
 if(!['clarity','compact'].includes(imagePreset))throw Error('不支援的圖片壓縮設定');
 const selected=scopeWebShare(graph,rootBoardId,{selectedBoardIds}),source=path.join(projectDirectory,'private-original-editor'),runtime=path.join(source,'web-runtime');
 const {noteDocument}=await import('../core/rich-document.mjs');for(const content of selected.graph.contents)if(content.kind==='text'&&content.document==null)content.document=noteDocument(content);
 const parent=path.resolve(outputDirectory),name='InkBridge-web-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8),stage=path.join(parent,'.pending-'+name),target=path.join(parent,name);await fs.mkdir(stage,{recursive:true});
 const copy=async(from,to)=>{await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true,dereference:false,errorOnExist:true,force:false});};
 let images=shareImages,ownedImages=false;
 try{
  let manifest;
  if(!contentOnly){
   manifest=JSON.parse(await fs.readFile(path.join(runtime,'runtime-manifest.json')));
   for(const file of manifest.files){if(!/^[\w.-]+$/.test(file))throw Error('Unsafe runtime asset');await copy(path.join(runtime,file),path.join(stage,file));}
   for(const folder of ['fonts','canvaskit','pdfjs'])await copy(path.join(source,'vendor/app',folder),path.join(stage,folder));
   await copy(path.join(source,'vendor/app/_next/static/chunks/6989.3a38db4f1b05d6ee.js'),path.join(stage,'_next/static/chunks/6989.3a38db4f1b05d6ee.js'));
   await copy(path.join(source,'vendor/app/_next/static/css'),path.join(stage,'_next/static/css'));
   await copy(path.join(source,'vendor/app/_next/static/media'),path.join(stage,'_next/static/media'));
   for(const file of ['0a3dd850c67b254e.css','inkbridge-content-blocks.css'])await copy(path.join(source,'vendor/app/_next/static/css',file),path.join(stage,'styles',file));
   for(const folder of ['styles','_next/static/css'])for(const file of await fs.readdir(path.join(stage,folder))){const p=path.join(stage,folder,file);let css=await fs.readFile(p,'utf8');const base=folder==='styles'?'../':'../../../';css=css.replaceAll('url(/fonts/','url('+base+'fonts/').replaceAll('url(/_next/','url('+base+'_next/');await fs.writeFile(p,css);}
   for(const file of ['viewer.mjs','payload.mjs','index.html','inkbridge.svg','serve.cjs','Start-Web.bat'])await copy(path.join(projectDirectory,'src/web-share',file),path.join(stage,file));
  }
  const attachments=[];await fs.mkdir(path.join(stage,'assets'));
  for(const record of selected.files){
   const expected=new RegExp('^files/'+record.id+'\\.(png|jpg|gif|webp|bmp|pdf)$');if(!/^[a-f0-9]{64}$/.test(record.id)||!expected.test(record.filePath)||record.sha256!==record.id)throw Error('附件格式尚未支援獨立網頁分享：'+record.name);
   const ext=path.extname(record.filePath).slice(1),limit=ext==='pdf'?512*1024*1024:64*1024*1024;
   if(record.size>limit)throw Error('附件「'+record.name+'」超過分享單檔上限');
   const from=path.resolve(workspaceDirectory,record.filePath),real=await fs.realpath(from),filesRoot=await fs.realpath(path.join(workspaceDirectory,'files'));if(path.dirname(real)!==filesRoot)throw Error('Attachment escapes workspace');
   const info=await scanFile(real,{maxBytes:limit});if(info.bytes!==record.size||info.sha256!==record.id)throw Error('Attachment integrity failure: '+record.name);
   let full={path:real,sha256:info.sha256,size:info.bytes,type:TYPES[ext],original:true},preview=null,reason='original-pdf',reused=false,encoderVersion;
   if(ext!=='pdf'){
    if(!images){images=createShareImages({cacheDirectory:imageCacheDirectory||path.join(parent,'.image-cache')});ownedImages=true;}
    const derived=await images.prepare({sourcePath:real,fileRecord:record,preset:imagePreset,forceLossless:losslessImageIds.includes(record.id)});({full,preview,reason,reused,encoderVersion}=derived);
   }
   const publishFile=async object=>{const extension=EXT[object.type];if(!extension)throw Error('不支援的分享附件格式');const filename=object.sha256+'.'+extension;await copyVerified(object.path,path.join(stage,'assets',filename),{sha256:object.sha256,bytes:object.size,maxBytes:limit});return 'assets/'+filename;};
   const file={source_file_id:record.id,path:await publishFile(full),size:full.size,sha256:full.sha256,contentType:full.type,reason,reused,encoderVersion};
   if(full.width)file.width=full.width;if(full.height)file.height=full.height;
   if(preview){file.preview_path=await publishFile(preview);file.preview_sha256=preview.sha256;file.preview_size=preview.size;file.preview_width=preview.width;file.preview_height=preview.height;}
   attachments.push(file);
  }
  await fs.writeFile(path.join(stage,'share.json'),JSON.stringify({format:selected.format,version:1,rootBoardId,boardIds:selected.boardIds,graph:selected.graph,attachments,capturedAt:capturedAt||new Date().toISOString(),revision,imagePreset}));
  if(!contentOnly){
   const scripts=manifest.files.filter(f=>f.endsWith('.js')).map(f=>`<script src="./${f}"></script>`).join('');const html=await fs.readFile(path.join(stage,'index.html'),'utf8');await fs.writeFile(path.join(stage,'index.html'),html.replace('<!-- NATIVE_RUNTIME -->',scripts));
   await fs.writeFile(path.join(stage,'_headers'),`/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
   await fs.writeFile(path.join(stage,'README.txt'),'InkBridge 唯讀網頁包\r\n本機：安裝 Node.js 後執行 Start-Web.bat。\r\n網站：將整個資料夾上傳靜態網站主機；入口 index.html。\r\n子白板使用 ?shareId=網址。只包含此次明確選定的白板與附件。大型附件請透過 InkBridge 分享面板發布至 R2。\r\n');
  }
  const fileRecords=[];async function inspect(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Web package symlink refused');if(entry.isDirectory())await inspect(f);else{const info=await scanFile(f);const relative=path.relative(stage,f).replaceAll('\\','/');if(!relative.startsWith('assets/')&&info.bytes>25*1024*1024)throw Error('Static reader asset exceeds 25 MiB');fileRecords.push({path:relative,bytes:info.bytes,sha256:info.sha256,contentType:TYPES[path.extname(f).slice(1)]||'application/octet-stream'});}}}await inspect(stage);
  await fs.writeFile(path.join(stage,'package-manifest.json'),JSON.stringify({format:contentOnly?'inkbridge-share-package':'inkbridge-static-web',version:1,rootBoardId,readerBuild,boardCount:selected.boardIds.length,files:fileRecords},null,2));await fs.rename(stage,target);return {directory:target,rootBoardId,boards:selected.boardIds.length,files:fileRecords.length,bytes:fileRecords.reduce((n,f)=>n+f.bytes,0),attachments:attachments.map(({source_file_id,size,preview_size,reason,reused})=>({source_file_id,size,preview_size,reason,reused}))};
 }catch(error){await fs.writeFile(path.join(stage,'FAILED.txt'),error.message).catch(()=>{});throw error;}finally{if(ownedImages)await images.dispose();}
}
module.exports={exportWebShare};
