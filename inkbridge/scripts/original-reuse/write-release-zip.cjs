// Streaming ZIP32 writer for signed full releases. No complete application in RAM.
const fs=require('node:fs'),fsp=require('node:fs/promises'),zlib=require('node:zlib'),crypto=require('node:crypto'),{Transform}=require('node:stream');
async function writeReleaseZip(file,entries){
 const out=await fsp.open(file,'wx'),central=[];let offset=0;
 const write=async b=>{await out.writeFile(b);offset+=b.length;if(offset>0xffffffff)throw Error('Release exceeds ZIP32 limit');};
 try{
  for(const entry of entries){
   const name=Buffer.from(entry.name,'utf8'),start=offset,header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x808,6);header.writeUInt16LE(8,8);header.writeUInt16LE(name.length,26);await write(header);await write(name);
   let bytes=0,compressed=0,crc=0;const sha=crypto.createHash('sha256');
   const input=entry.file?fs.createReadStream(entry.file):require('node:stream').Readable.from([Buffer.from(entry.data)]),meter=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;crc=zlib.crc32(chunk,crc);sha.update(chunk);done(null,chunk);}}),deflate=zlib.createDeflateRaw();
   input.on('error',e=>deflate.destroy(e));meter.on('error',e=>deflate.destroy(e));input.pipe(meter).pipe(deflate);
   try{for await(const chunk of deflate){compressed+=chunk.length;await write(chunk);}}finally{input.destroy();meter.destroy();deflate.destroy();}
   const digest=sha.digest('hex');if(entry.sha256&&digest!==entry.sha256||entry.bytes!==undefined&&entry.bytes!==bytes)throw Error('Release source changed: '+entry.name);
   const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(compressed,8);descriptor.writeUInt32LE(bytes,12);await write(descriptor);
   const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0x808,8);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(compressed,20);cd.writeUInt32LE(bytes,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(start,42);central.push(cd,name);
  }
  const start=offset,index=Buffer.concat(central);await write(index);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(start,16);await write(end);await out.sync();
 }finally{await out.close();}
}
module.exports={writeReleaseZip};
