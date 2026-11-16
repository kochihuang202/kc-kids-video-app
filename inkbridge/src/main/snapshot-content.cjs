// Exact shared-state comparison: SQLite headers and commit receipts are not
// note edits. No text, formatting, catalog metadata or geometry is discarded.
const {DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto'),fs=require('node:fs/promises');
const {hashFile}=require('./stream-files.cjs');
const path=require('node:path');
function proofOf(m,source,digest){return {format:'inkbridge-content-equivalence',version:1,snapshotId:m.snapshotId,sourceSnapshotId:source.snapshotId,workspaceId:m.workspaceId,snapshotHash:m.database.sha256,sourceHash:source.database.sha256,digest};}
async function readProof(root,m,source){try{const v=JSON.parse(await fs.readFile(path.join(root,'lineage-equivalent',m.workspaceId,m.snapshotId+'.json'),'utf8'));return /^[a-f0-9]{64}$/.test(v.digest||'')&&JSON.stringify(v)===JSON.stringify(proofOf(m,source,v.digest));}catch{return false;}}
async function saveProof(root,m,source,digest){const file=path.join(root,'lineage-equivalent',m.workspaceId,m.snapshotId+'.json');await fs.mkdir(path.dirname(file),{recursive:true});const value=JSON.stringify(proofOf(m,source,digest)),tmp=file+'.pending-'+crypto.randomUUID();try{await fs.writeFile(tmp,value,{flag:'wx'});try{await fs.link(tmp,file);}catch(e){if(e.code!=='EEXIST')throw e;if(await fs.readFile(file,'utf8')!==value)throw Error('Equivalence proof conflict');}}finally{await fs.rm(tmp,{force:true});}}
async function snapshotContent(file,expected){
 const before=await fs.stat(file);if(before.size!==expected.bytes||await hashFile(file)!==expected.sha256)throw Error('Snapshot comparison integrity failure');
 const db=new DatabaseSync(file,{readOnly:true}),hash=crypto.createHash('sha256');
 try{db.exec('BEGIN');for(const table of ['boards','contents','instances','meta']){hash.update(table+'\n');for(const row of db.prepare('SELECT * FROM '+table+' ORDER BY '+(table==='meta'?'key':'id')).all())hash.update(JSON.stringify(row)+'\n');}db.exec('COMMIT');}finally{db.close();}
 const after=await fs.stat(file);if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size)throw Error('Snapshot changed during comparison');return hash.digest('hex');
}
module.exports={snapshotContent,readProof,saveProof};
