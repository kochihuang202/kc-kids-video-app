// Original complete 71891 collector behind InkBridge's immutable CAS boundary.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const MIME={bin:'application/octet-stream',wasm:'application/wasm',html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',cjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',ico:'image/x-icon',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',mp4:'video/mp4',pdf:'application/pdf',txt:'text/plain',htmlbundle:'application/json'};
const EXTENSIONS=Object.keys(MIME).join('|');
function loadCollector(file){
 const methods={50697:Object.keys,26100:Object.getOwnPropertySymbols,78928:Object.getOwnPropertyDescriptor,86226:value=>value.forEach,36751:Object.getOwnPropertyDescriptors,25110:Object.defineProperties,53930:Object.defineProperty,70533:(o,k,v)=>(Object.defineProperty(o,k,{value:v,enumerable:true,configurable:true,writable:true}),o),59261:Set,165:value=>value.startsWith,18979:value=>value.slice,11265:value=>value.trim,64007:value=>value.indexOf,48079:value=>value.map,31721:value=>value.some,96984:URL,96319:value=>value.filter,8628:value=>value.includes,14166:value=>value.every,85569:JSON.stringify,79896:fs,16928:path,84157:{},27315:{v4:crypto.randomUUID},29609:{},53189:{_S:()=>os.tmpdir()},16212:{},36924:{jN:()=>{}},7749:require('cheerio')};
 const req=id=>{if(!(id in methods))throw Error('Unbound HTML dependency '+id);return methods[id];};req.n=value=>()=>value;req.d=(target,values)=>{for(const [key,get]of Object.entries(values))Object.defineProperty(target,key,{get});};
 const exports={};require(file)({},exports,req);return exports.InkBridgePackage;
}
function safeRelative(value){if(typeof value!=='string'||!value||value.includes('\\')||value.includes('\0')||value.split('/').some(p=>!p||p==='.'||p==='..')||path.posix.isAbsolute(value))throw Error('Invalid HTML resource path');return value;}
function createHtmlPages({attachments,nativeFactory}){
 const collect=loadCollector(nativeFactory);
 async function prepare(source){
  if(typeof source!=='string'||!path.isAbsolute(source)||!['.html','.htm'].includes(path.extname(source).toLowerCase()))throw Error('Not an HTML file');
  const stat=await fs.promises.lstat(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Not a regular HTML file');
  const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'inkbridge-html-import-'));
  try{
   const result=await collect(source,temp),entries=[],records=[];
   async function walk(dir){for(const entry of await fs.promises.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('HTML symlink refused');if(entry.isDirectory())await walk(file);else{const relative=safeRelative(path.relative(temp,file).replaceAll('\\','/')),type=path.extname(file).slice(1).toLowerCase();const item=await attachments.prepareResource(file,MIME[type]?type:'bin',entry.name);records.push(item.fileRecord);entries.push({path:relative,fileId:item.fileId,type:item.type,contentType:MIME[type]||MIME.bin,size:item.fileRecord.size});}}}
   await walk(temp);entries.sort((a,b)=>a.path.localeCompare(b.path));const entry=safeRelative(result.relativeHtml.replaceAll('\\','/'));
   if(!entries.some(f=>f.path===entry))throw Error('HTML entry is missing');
   const bundle={format:'inkbridge-html-bundle',version:1,entry,files:entries},file=path.join(temp,'.bundle.json');await fs.promises.writeFile(file,JSON.stringify(bundle));const item=await attachments.prepareResource(file,'htmlbundle',path.basename(source));
   item.fileRecord.metadata=JSON.stringify({htmlBundle:true,entry,fileIds:entries.map(e=>e.fileId),resources:entries.map(e=>'flexnote://file/'+e.fileId)});
   const pageUrl='flexnote://page.'+item.fileId+'/'+entry.split('/').map(encodeURIComponent).join('/');
   return {success:true,file:{...item.fileRecord,metadata:{},pageUrl,pageRelativePath:entry},fileRecords:[...records,item.fileRecord],fileRecord:item.fileRecord};
  }finally{await fs.promises.rm(temp,{recursive:true,force:true});}
 }
 async function manifest(id){
  const info=await attachments.resolveUrl('flexnote://file/'+id+'.htmlbundle'),bundle=JSON.parse(await fs.promises.readFile(info.filePath,'utf8'));
  if(bundle.format!=='inkbridge-html-bundle'||bundle.version!==1||!Array.isArray(bundle.files)||bundle.files.length>200)throw Error('Invalid HTML bundle');
  safeRelative(bundle.entry);const seen=new Set();for(const f of bundle.files){safeRelative(f.path);if(seen.has(f.path)||!/^[a-f0-9]{64}$/.test(f.fileId)||!MIME[f.type]||!Object.values(MIME).includes(f.contentType)||!Number.isSafeInteger(f.size)||f.size<0)throw Error('Invalid HTML resource');seen.add(f.path);}return bundle;
 }
 async function resolveUrl(value){const url=new URL(value),id=url.hostname.slice(5);if(url.protocol!=='flexnote:'||!url.hostname.startsWith('page.')||!/^[a-f0-9]{64}$/.test(id)||url.username||url.password||url.port)throw Error('Invalid HTML page URL');const bundle=await manifest(id),relative=decodeURIComponent(url.pathname.slice(1))||bundle.entry;safeRelative(relative);const row=bundle.files.find(f=>f.path===relative);if(!row)throw Error('HTML resource is not in this page');let info;try{info=await attachments.resolveUrl('flexnote://file/'+row.fileId+'.'+row.type);}catch(error){if(error.code!=='ENOENT'&&error.message!=='Missing attachment')throw error;info=await attachments.resolveUrl('flexnote://file/'+row.fileId);}if(info.size!==row.size)throw Error('HTML resource integrity failure');return {...info,contentType:row.contentType,cacheControl:'no-store',htmlPage:true};}
 return {prepare,manifest,resolveUrl};
}
module.exports={createHtmlPages,loadCollector,safeRelative,MIME,EXTENSIONS};
