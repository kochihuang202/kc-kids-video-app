// A real, parseable three-page PDF padded with legal PDF whitespace before xref.
// Offsets of the original objects stay intact; startxref points to its new byte.
const fs=require('node:fs/promises');
module.exports=async function writeLargePDF(file,size){
 const source=require('./pdf-fixture.cjs')(3).toString('latin1'),xref=source.lastIndexOf('\nxref\n')+1,prefix=Buffer.from(source.slice(0,xref),'latin1');
 let start=size-source.slice(xref).length,suffix;
 for(let i=0;i<3;i++){suffix=Buffer.from(source.slice(xref).replace(/startxref\n\d+/,`startxref\n${start}`),'latin1');start=size-suffix.length;}
 if(start<prefix.length)throw Error('Fixture is too small');
 const handle=await fs.open(file,'wx'),padding=Buffer.alloc(64*1024,32);
 try{await handle.writeFile(prefix);for(let remaining=start-prefix.length;remaining>0;remaining-=padding.length)await handle.writeFile(padding.subarray(0,Math.min(remaining,padding.length)));await handle.writeFile(suffix);}finally{await handle.close();}
};
