// InkBridge's immutable local attachment boundary. Native paste UI/AST remains
// the original implementation. SQLite metadata is committed by the one renderer
// coordinator, never by an independent file IPC writer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createAttachmentStore(directory,decodeImage){
 fs.mkdirSync(directory,{recursive:true});
 const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 function prepare(input,name='image.png'){
  const bytes=Buffer.from(input);if(!bytes.length||bytes.length>64*1024*1024)throw Error('Invalid image byte length');
  const hex=bytes.subarray(0,12).toString('hex');
  const ext=bytes.subarray(0,5).toString()==='%PDF-'?'pdf':hex.startsWith('89504e470d0a1a0a')?'png':hex.startsWith('ffd8ff')?'jpg':bytes.subarray(0,6).toString().startsWith('GIF8')?'gif':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'webp':hex.startsWith('424d')?'bmp':null;
  if(!ext)throw Error('Unsupported attachment format');
  if(ext==='pdf'&&!bytes.subarray(-2048).toString('latin1').includes('%%EOF'))throw Error('Incomplete PDF');
  const metadata=ext==='pdf'?{}:decodeImage(bytes);if(ext!=='pdf'&&!(metadata.width>0&&metadata.height>0))throw Error('Image could not be decoded');
  const sha256=digest(bytes),fileId=sha256,filename=`${fileId}.${ext}`,target=path.join(directory,filename);
  if(fs.existsSync(target)){if(digest(fs.readFileSync(target))!==sha256)throw Error('Existing attachment integrity failure');}
  else{
   const temporary=path.join(directory,`.pending-${crypto.randomUUID()}`);let fd;
   try{fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;try{fs.linkSync(temporary,target);}catch(error){if(error.code!=='EEXIST'||digest(fs.readFileSync(target))!==sha256)throw error;}}
   finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  const fileRecord={id:fileId,name:path.basename(name).slice(0,255)||filename,rawName:path.basename(name).slice(0,255)||filename,type:ext,size:bytes.length,sha256,category:'user',metadata:JSON.stringify(metadata),filePath:`files/${filename}`};
  return {fileId,fileName:fileRecord.name,filePath:target,type:ext,metadata,remotePath:null,fileRecord};
 }
 function readUrl(value){const url=new URL(value);if(url.protocol!=='flexnote:'||url.hostname!=='file'||url.search||url.hash)throw Error('Invalid attachment URL');const match=/^([a-f0-9]{64})(?:\.(png|jpg|gif|webp|bmp|pdf))?$/.exec(decodeURIComponent(url.pathname.slice(1)));if(!match)throw Error('Invalid attachment ID');const id=match[1],candidates=fs.readdirSync(directory).filter(name=>new RegExp(`^${id}\\.(png|jpg|gif|webp|bmp|pdf)$`).test(name));if(candidates.length!==1||match[2]&&candidates[0]!==`${id}.${match[2]}`)throw Error('Missing attachment');const file=path.join(directory,candidates[0]),bytes=fs.readFileSync(file);if(digest(bytes)!==id)throw Error('Attachment integrity failure');return {bytes,ext:path.extname(file)};}
 return {prepare,readUrl};
}
module.exports={createAttachmentStore};
