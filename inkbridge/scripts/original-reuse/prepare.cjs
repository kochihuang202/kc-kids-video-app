// Inert private source copy + module inventory. Does not run the target app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'private-original-editor');
const asar=process.argv[2]||'C:/Users/ji3cp/AppData/Local/Programs/flexnote/resources/app.asar';
const bytes=fs.readFileSync(asar),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const expected='d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1';
if(hash(bytes)!==expected)throw Error('Original artifact identity differs; do not silently mix versions');
const header=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)).toString('utf8')),base=8+bytes.readUInt32LE(4),members=[];
function walk(node,prefix=''){for(const [name,value]of Object.entries(node.files||{})){const logical=prefix+name;if(value.files)walk(value,logical+'/');else members.push({logical,...value});}}
walk(header);const selected=members.filter(member=>member.logical.startsWith('app/_next/')||member.logical.startsWith('app/assets/')||member.logical.startsWith('app/fonts/')||member.logical.startsWith('app/canvaskit/')||member.logical==='app/package.json');
const receipt={asarSha256:expected,files:[],execution:'not executed; copied as bytes',private:true};
for(const member of selected){
  if(member.link||member.logical.includes('..'))throw Error('Unsafe member');
  const target=path.resolve(out,'vendor',member.logical);if(!target.startsWith(out+path.sep))throw Error('Outside private root');
  const data=member.unpacked?fs.readFileSync(path.join(asar+'.unpacked',member.logical)):bytes.subarray(base+Number(member.offset),base+Number(member.offset)+member.size);
  if(data.length!==member.size)throw Error('Truncated member');fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==hash(data))throw Error('Refusing to overwrite different source');
  if(!fs.existsSync(target))fs.writeFileSync(target,data);
  receipt.files.push({path:member.logical,bytes:data.length,sha256:hash(data)});
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'source-receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({privateRoot:out,files:receipt.files.length,bytes:receipt.files.reduce((sum,file)=>sum+file.bytes,0),asarSha256:expected}));
