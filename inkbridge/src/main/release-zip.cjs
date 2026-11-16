// Read only the small signed envelope, not the complete program ZIP, when
// checking OneDrive. Payload extraction/validation happens in update-helper.
const fs=require('node:fs/promises'),zlib=require('node:zlib');
async function readZipEnvelope(file){
 const h=await fs.open(file,'r');try{
  const size=(await h.stat()).size;if(size<22)throw Error('Incomplete release ZIP');
  const tail=Buffer.alloc(Math.min(size,65557));await h.read(tail,0,tail.length,size-tail.length);
  let end=-1;for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
  if(end<0||tail.readUInt16LE(end+4)||tail.readUInt16LE(end+6)||tail.readUInt16LE(end+8)!==tail.readUInt16LE(end+10))throw Error('Incomplete or split release ZIP');
  const count=tail.readUInt16LE(end+10),length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);
  if(!count||count>20000||length>16*1024*1024||offset+length!==size-tail.length+end)throw Error('Unsupported release ZIP index');
  const cd=Buffer.alloc(length);await h.read(cd,0,length,offset);let at=0,envelope,seen=new Set();
  for(let i=0;i<count;i++){
   if(at+46>length||cd.readUInt32LE(at)!==0x02014b50)throw Error('Invalid release ZIP index');
   const n=cd.readUInt16LE(at+28),extra=cd.readUInt16LE(at+30),comment=cd.readUInt16LE(at+32),flags=cd.readUInt16LE(at+8),method=cd.readUInt16LE(at+10),compressed=cd.readUInt32LE(at+20),bytes=cd.readUInt32LE(at+24),start=cd.readUInt32LE(at+42);
   if(at+46+n+extra+comment>length||flags&1||((cd.readUInt32LE(at+38)>>>16)&0xf000)===0xa000)throw Error('Encrypted/symlink release refused');
   const name=cd.toString('utf8',at+46,at+46+n),normal=name.toLowerCase();if(seen.has(normal))throw Error('Duplicate release entry');seen.add(normal);
   if(name==='release.json'){
    if(envelope||bytes>4*1024*1024||compressed>4*1024*1024||start+30>offset)throw Error('Invalid release envelope');
    const local=Buffer.alloc(30);await h.read(local,0,30,start);if(local.readUInt32LE(0)!==0x04034b50)throw Error('Invalid release local header');
    const dataAt=start+30+local.readUInt16LE(26)+local.readUInt16LE(28);if(dataAt+compressed>offset)throw Error('Truncated release envelope');
    const b=Buffer.alloc(compressed);await h.read(b,0,b.length,dataAt);const data=method===8?zlib.inflateRawSync(b,{maxOutputLength:4*1024*1024}):method===0?b:null;
    if(!data||data.length!==bytes)throw Error('Invalid release envelope compression');envelope=JSON.parse(data.toString('utf8'));
   }
   at+=46+n+extra+comment;
  }
  if(at!==length||!envelope)throw Error('No signed release envelope');return envelope;
 }finally{await h.close();}
}
async function verifyReleaseZip(file,key){
 const {verifyEnvelope}=require('./program-updates.cjs'),crypto=require('node:crypto'),streams=require('node:fs');
 const m=verifyEnvelope(await readZipEnvelope(file),key);if(m.version!==2)throw Error('ZIP-only release required');
 const expected=new Map(m.files.filter(f=>f.sha256).map(f=>[f.path,f])),h=await fs.open(file,'r');
 try{
  const before=await h.stat(),tail=Buffer.alloc(Math.min(before.size,65557));await h.read(tail,0,tail.length,before.size-tail.length);let end=-1;
  for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
  if(end<0)throw Error('Incomplete ZIP');const length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16),cd=Buffer.alloc(length);await h.read(cd,0,length,offset);let at=0,count=0;
  while(at<length){const n=cd.readUInt16LE(at+28),extra=cd.readUInt16LE(at+30),comment=cd.readUInt16LE(at+32),name=cd.toString('utf8',at+46,at+46+n),method=cd.readUInt16LE(at+10),compressed=cd.readUInt32LE(at+20),start=cd.readUInt32LE(at+42);at+=46+n+extra+comment;
   if(name==='release.json')continue;const entry=expected.get(name);if(!entry)throw Error('Unsigned extra ZIP entry');expected.delete(name);
   const local=Buffer.alloc(30);await h.read(local,0,30,start);if(local.readUInt32LE(0)!==0x04034b50)throw Error('Invalid local header');const dataAt=start+30+local.readUInt16LE(26)+local.readUInt16LE(28);if(dataAt+compressed>offset)throw Error('Truncated ZIP');
   const input=streams.createReadStream(file,{start:dataAt,end:dataAt+compressed-1}),output=method===8?input.pipe(zlib.createInflateRaw()):method===0?input:null;if(!output){input.destroy();throw Error('Unsupported compression');}
   let bytes=0;const hash=crypto.createHash('sha256');try{for await(const chunk of output){bytes+=chunk.length;if(bytes>entry.bytes)throw Error('ZIP expanded length mismatch');hash.update(chunk);}}finally{input.destroy();output.destroy();}
   if(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256)throw Error('ZIP payload hash mismatch');count++;
  }
  if(expected.size)throw Error('Missing ZIP payload');const after=await h.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw Error('Release changed while verifying');return {descriptor:m,filesVerified:count,bytes:before.size};
 }finally{await h.close();}
}
module.exports={readZipEnvelope,verifyReleaseZip};
