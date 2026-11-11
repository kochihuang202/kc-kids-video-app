// Publishing authority is local to this Windows account, never a workspace asset.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function createShareCredentials({filename,safeStorage}){
 const available=()=>safeStorage.isAsyncEncryptionAvailable?safeStorage.isAsyncEncryptionAvailable():safeStorage.isEncryptionAvailable();
 const encrypt=value=>safeStorage.encryptStringAsync?safeStorage.encryptStringAsync(value):safeStorage.encryptString(value);
 const decrypt=async value=>safeStorage.decryptStringAsync?(await safeStorage.decryptStringAsync(value)).result:safeStorage.decryptString(value);
 const validateUrl=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('請使用 HTTPS 分享網站根網址');return u.origin;};
 const read=async()=>{try{const v=JSON.parse(await fs.readFile(filename,'utf8'));if(v.format!=='inkbridge-share-device'||v.version!==1)throw Error('分享裝置設定格式無效');validateUrl(v.baseUrl);return v;}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 async function write({baseUrl,token,readerBuild}){
  baseUrl=validateUrl(baseUrl);if(!await available())throw Error('Windows 加密儲存目前無法使用');
  if(typeof token!=='string'||token.length<32||token.length>512)throw Error('分享裝置金鑰無效');
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(readerBuild||''))throw Error('閱讀器版本無效');
  const value={format:'inkbridge-share-device',version:1,baseUrl,readerBuild,encrypted:(await encrypt(token)).toString('base64')};
  await fs.mkdir(path.dirname(filename),{recursive:true});const tmp=filename+'.'+crypto.randomUUID()+'.tmp';
  const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}
  try{await fs.rename(tmp,filename);}finally{await fs.rm(tmp,{force:true});}return status();
 }
 async function status(){const v=await read();return {configured:!!v,baseUrl:v?.baseUrl||'',readerBuild:v?.readerBuild||''};}
 async function clientConfig(){const v=await read();if(!v)throw Error('請先連接分享網站');if(!await available())throw Error('無法解密此電腦的分享裝置設定');return {baseUrl:v.baseUrl,readerBuild:v.readerBuild,token:await decrypt(Buffer.from(v.encrypted,'base64'))};}
 return {status,write,clientConfig,validateUrl};
}
module.exports={createShareCredentials};
