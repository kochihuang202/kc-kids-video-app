// InkBridge's immutable local attachment boundary. Native paste UI/AST remains
// the original implementation. SQLite metadata is committed by the one renderer
// coordinator, never by an independent file IPC writer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {scanFile,copyVerified,fingerprint}=require('./stream-files.cjs');
const IMAGE_MAX_BYTES=64*1024*1024,PDF_MAX_BYTES=512*1024*1024;
function createAttachmentStore(directory,decodeImage){
 fs.mkdirSync(directory,{recursive:true});
 const verified=new Map();
 const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 function result(sha256,ext,size,name,metadata={}){const filename=`${sha256}.${ext}`,fileName=path.basename(name).slice(0,255)||filename;return {fileId:sha256,fileName,filePath:path.join(directory,filename),type:ext,metadata,remotePath:null,fileRecord:{id:sha256,name:fileName,rawName:fileName,type:ext,size,sha256,category:'user',metadata:JSON.stringify(metadata),filePath:`files/${filename}`}};}
 function prepare(input,name='image.png'){
  const bytes=Buffer.from(input);if(!bytes.length||bytes.length>64*1024*1024)throw Error('Invalid image byte length');
  const hex=bytes.subarray(0,12).toString('hex');
  const ext=bytes.subarray(0,5).toString()==='%PDF-'?'pdf':hex.startsWith('89504e470d0a1a0a')?'png':hex.startsWith('ffd8ff')?'jpg':bytes.subarray(0,6).toString().startsWith('GIF8')?'gif':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'webp':hex.startsWith('424d')?'bmp':null;
  if(!ext)throw Error('Unsupported attachment format');
  if(ext==='pdf'&&!bytes.subarray(-2048).toString('latin1').includes('%%EOF'))throw Error('Incomplete PDF');
  const metadata=ext==='pdf'?{}:decodeImage(bytes);if(ext!=='pdf'&&!(metadata.width>0&&metadata.height>0))throw Error('Image could not be decoded');
  const sha256=digest(bytes),fileId=sha256,filename=`${fileId}.${ext}`,target=path.join(directory,filename);
  if(fs.existsSync(target)){if(!fs.lstatSync(target).isFile()||digest(fs.readFileSync(target))!==sha256)throw Error('Existing attachment integrity failure');}
  else{
   const temporary=path.join(directory,`.pending-${crypto.randomUUID()}`);let fd;
   try{fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;try{fs.linkSync(temporary,target);}catch(error){if(error.code!=='EEXIST'||digest(fs.readFileSync(target))!==sha256)throw error;}}
   finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  verified.set(target,fingerprint(fs.statSync(target)));
  return result(sha256,ext,bytes.length,name,metadata);
 }
 async function prepareFile(source,name=path.basename(source)){
  const handle=await fs.promises.open(source,'r');let isPDF;
  try{const stat=await handle.stat();if(!stat.isFile()||!stat.size||stat.size>PDF_MAX_BYTES)throw Error('Invalid attachment byte length');const header=Buffer.alloc(5);await handle.read(header,0,5,0);isPDF=header.toString()==='%PDF-';if(!isPDF&&stat.size>IMAGE_MAX_BYTES)throw Error('Invalid image byte length');}finally{await handle.close();}
  if(!isPDF){const chunks=[];await scanFile(source,{maxBytes:IMAGE_MAX_BYTES,onChunk:chunk=>chunks.push(chunk)});return prepare(Buffer.concat(chunks),name);}
  const published=await copyVerified(source,path.join(directory,'.import'),{maxBytes:PDF_MAX_BYTES,destination:info=>path.join(directory,info.sha256+'.pdf'),validate:async(info,temporary)=>{
   const h=await fs.promises.open(temporary,'r');try{const head=Buffer.alloc(5),tail=Buffer.alloc(Math.min(info.bytes,2048));await h.read(head,0,5,0);await h.read(tail,0,tail.length,info.bytes-tail.length);if(head.toString()!=='%PDF-')throw Error('Unsupported attachment format');if(!tail.toString('latin1').includes('%%EOF'))throw Error('Incomplete PDF');}finally{await h.close();}
  }});
  verified.set(published.filePath,fingerprint(await fs.promises.stat(published.filePath)));
  return result(published.sha256,'pdf',published.bytes,name);
 }
 function locate(value){
  const url=new URL(value);if(url.protocol!=='flexnote:'||url.hostname!=='file'||url.username||url.password||url.port||url.search||url.hash)throw Error('Invalid attachment URL');
  const match=/^([a-f0-9]{64})(?:\.(png|jpg|gif|webp|bmp|pdf))?$/.exec(decodeURIComponent(url.pathname.slice(1)));if(!match)throw Error('Invalid attachment ID');
  const id=match[1],candidates=fs.readdirSync(directory).filter(name=>new RegExp(`^${id}\\.(png|jpg|gif|webp|bmp|pdf)$`).test(name));if(candidates.length!==1||match[2]&&candidates[0]!==`${id}.${match[2]}`)throw Error('Missing attachment');
  const file=path.join(directory,candidates[0]),stat=fs.lstatSync(file),real=fs.realpathSync(file);if(!stat.isFile()||path.dirname(real)!==fs.realpathSync(directory))throw Error('Attachment path escapes workspace');
  const ext=path.extname(real),limit=ext==='.pdf'?PDF_MAX_BYTES:IMAGE_MAX_BYTES;if(!stat.size||stat.size>limit)throw Error('Invalid attachment byte length');
  return {filePath:real,size:stat.size,ext,sha256:id,fingerprint:fingerprint(stat)};
 }
 function readUrl(value){const info=locate(value);if(info.size>IMAGE_MAX_BYTES)throw Error('Large attachment requires streaming');const bytes=fs.readFileSync(info.filePath);if(digest(bytes)!==info.sha256)throw Error('Attachment integrity failure');return {bytes,ext:info.ext};}
 async function resolveUrl(value){const info=locate(value);if(verified.get(info.filePath)!==info.fingerprint){const checked=await scanFile(info.filePath);if(checked.sha256!==info.sha256||checked.fingerprint!==info.fingerprint)throw Error('Attachment integrity failure');verified.set(info.filePath,info.fingerprint);}return info;}
 // Synchronous legacy callers need a safe path, not a 512MiB blocking hash.
 // Snapshot/export boundaries must independently verify actual hashes.
 function resolvePath(id){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid attachment ID');const info=locate('flexnote://file/'+id);if(info.size<=IMAGE_MAX_BYTES)readUrl('flexnote://file/'+id);return info.filePath;}
 return {prepare,prepareFile,readUrl,resolveUrl,resolvePath};
}
module.exports={createAttachmentStore,IMAGE_MAX_BYTES,PDF_MAX_BYTES};
