// Preserve the native bundle's relative layout in one selected publication.
const fs=require('node:fs/promises'),path=require('node:path');
const {safeRelative}=require('./html-pages.cjs'),{scanFile,copyVerified}=require('./stream-files.cjs');
async function exportHtmlPages({selected,workspaceDirectory,stage,attachments,htmlResources}){
 const known=new Map(selected.files.map(f=>[f.id,f])),filesRoot=await fs.realpath(path.join(workspaceDirectory,'files'));
 async function source(record){if(!record||!/^[a-f0-9]{64}$/.test(record.id)||record.sha256!==record.id||record.filePath!==`files/${record.id}.${record.type}`)throw Error('Invalid HTML resource catalog');const file=await fs.realpath(path.join(workspaceDirectory,record.filePath));if(path.dirname(file)!==filesRoot)throw Error('HTML resource escapes workspace');const info=await scanFile(file,{allowEmpty:true});if(info.sha256!==record.id||info.bytes!==record.size)throw Error('HTML resource integrity failure');return file;}
 for(const record of selected.files.filter(f=>f.type==='htmlbundle')){
  const file=await source(record),bundle=JSON.parse(await fs.readFile(file,'utf8'));if(bundle.format!=='inkbridge-html-bundle'||bundle.version!==1||!Array.isArray(bundle.files)||bundle.files.length>200)throw Error('Invalid HTML bundle');
  const seen=new Set();let entryHash,entrySize;
  for(const row of bundle.files){safeRelative(row.path);if(seen.has(row.path))throw Error('Duplicate HTML path');seen.add(row.path);const asset=known.get(row.fileId);if(!asset||row.size!==asset.size)throw Error('HTML resource is missing');const from=await source(asset),target=path.join(stage,'assets','html-'+record.id,...row.path.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await copyVerified(from,target,{sha256:asset.id,bytes:asset.size});if(row.path===bundle.entry){entryHash=asset.id;entrySize=asset.size;}}
  for(const row of bundle.files)htmlResources.push({path:'assets/html-'+record.id+'/'+row.path,sha256:row.fileId,size:row.size});
  if(!entryHash)throw Error('HTML entry is missing');
  attachments.push({source_file_id:record.id,path:'assets/html-'+record.id+'/'+safeRelative(bundle.entry),sha256:entryHash,size:entrySize,contentType:'text/html',reason:'html-page-bundle'});
 }
}
module.exports={exportHtmlPages};
