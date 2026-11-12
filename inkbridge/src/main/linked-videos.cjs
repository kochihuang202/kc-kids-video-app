// Local videos are linked by absolute path (user decision 2026-11-12): the file is
// never copied into the attachment store, snapshots or shares. The original player
// (59771) requests flexnote://file/<fileId>.<ext>; only a path recorded on one of the
// workspace's own video cards can be served, with the same Range contract as
// attachment-response.cjs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TYPES={mp4:'video/mp4',m4v:'video/mp4',mov:'video/mp4',webm:'video/webm',ogv:'video/ogg',ogg:'video/ogg',mkv:'video/x-matroska',avi:'video/x-msvideo',wmv:'video/x-ms-wmv',flv:'video/x-flv',mpg:'video/mpeg',mpeg:'video/mpeg'};
const EXTENSIONS=Object.keys(TYPES),pattern=new RegExp(`^([a-f0-9]{64})\\.(${EXTENSIONS.join('|')})$`);
const extensionOf=file=>path.extname(file).slice(1).toLowerCase();
const isVideoPath=file=>typeof file==='string'&&path.isAbsolute(file)&&EXTENSIONS.includes(extensionOf(file));
// Stable per path, so re-adding the same file reuses the same card and highlights.
const linkId=file=>crypto.createHash('sha256').update('inkbridge-linked-video\0'+path.resolve(file).toLowerCase()).digest('hex');
async function inspect(file){
 if(!isVideoPath(file))throw Error('Unsupported video file');
 const stat=await fs.promises.stat(file);if(!stat.isFile()||!stat.size)throw Error('Video file is missing or empty');
 return {id:linkId(file),name:path.basename(file).slice(0,255),type:extensionOf(file),size:stat.size,path:path.resolve(file)};
}
function createLinkedVideos({load}){
 let paths=null;
 const invalidate=()=>{paths=null;};
 async function lookup(id){
  if(!paths){const graph=await load(),next=new Map();for(const row of graph.cardMetadata||[])if(row.type==='video'&&row.fileId&&isVideoPath(row.path))next.set(row.fileId,row.path);paths=next;}
  return paths.get(id);
 }
 // Returns null when the URL is not a linked-video URL, so attachments keep their own path.
 async function resolveUrl(value){
  let url;try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='flexnote:'||url.hostname!=='file')return null;
  const match=pattern.exec(decodeURIComponent(url.pathname.slice(1)));if(!match)return null;
  const file=await lookup(match[1]);if(!file)return null;
  const stat=await fs.promises.stat(file);if(!stat.isFile()||!stat.size)throw Error('Linked video is missing');
  return {filePath:file,size:stat.size,ext:'.'+match[2],sha256:`linked-${stat.size}-${Math.trunc(stat.mtimeMs)}`,contentType:TYPES[extensionOf(file)]||TYPES[match[2]],cacheControl:'no-store'};
 }
 return {resolveUrl,invalidate};
}
module.exports={createLinkedVideos,inspect,isVideoPath,linkId,EXTENSIONS};
