const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function exists(file){try{await fs.stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function json(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomic(file,bytes){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.pending-'+crypto.randomUUID();let h;try{h=await fs.open(temp,'wx');await h.writeFile(bytes);await h.sync();await h.close();h=null;await fs.rename(temp,file);}finally{if(h)await h.close();await fs.rm(temp,{force:true});}}
const writeJSON=(file,value)=>atomic(file,JSON.stringify(value,null,2));
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
module.exports={exists,json,atomic,writeJSON,UUID};
