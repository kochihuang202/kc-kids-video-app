// A real three-page PDF with an indexed, unused large stream. Huge whitespace
// between referenced objects and xref makes PDF lexers scan512MiB as one token
// separator; keep that pathological old fixture opt-in for diagnostic replay.
const fs=require('node:fs/promises');
module.exports=async function writeLargePDF(file,size,{whitespace=false}={}){
 const source=require('./pdf-fixture.cjs')(3).toString('latin1'),xref=source.lastIndexOf('\nxref\n')+1,prefix=Buffer.from(source.slice(0,xref),'latin1');
 let start=size-source.slice(xref).length,suffix,header=Buffer.alloc(0),tail=Buffer.alloc(0),streamLength=0;
 for(let i=0;i<8;i++){
  let index=source.slice(xref);
  if(!whitespace){const count=Number(/xref\n0 (\d+)/.exec(index)[1]);header=Buffer.from(`${count} 0 obj\n<< /Length ${streamLength} >>\nstream\n`);tail=Buffer.from('\nendstream\nendobj\n');index=index.replace(/xref\n0 \d+/,`xref\n0 ${count+1}`).replace('trailer\n',String(prefix.length).padStart(10,'0')+' 00000 n \ntrailer\n').replace(/\/Size \d+/,`/Size ${count+1}`);}
  suffix=Buffer.from(index.replace(/startxref\n\d+/,`startxref\n${start}`),'latin1');start=size-suffix.length;streamLength=start-prefix.length-header.length-tail.length;
 }
 if(streamLength<0)throw Error('Fixture is too small');
 const handle=await fs.open(file,'wx'),padding=Buffer.alloc(64*1024,32);
 try{await handle.writeFile(prefix);await handle.writeFile(header);for(let remaining=streamLength;remaining>0;remaining-=padding.length)await handle.writeFile(padding.subarray(0,Math.min(remaining,padding.length)));await handle.writeFile(tail);await handle.writeFile(suffix);}finally{await handle.close();}
};
