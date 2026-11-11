// Execute with Electron, locally after provisioning. Never ships in portable.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// Electron's encryption key belongs to this exact userData profile.
const localProfile=process.env.INKBRIDGE_SHARE_PROFILE;
if(localProfile&&process.argv.includes('--migrate')===false)app.setPath('userData',path.join(localProfile,'Profile'));
app.whenReady().then(async()=>{
 const baseUrl=process.env.INKBRIDGE_SHARE_SITE,profile=process.env.INKBRIDGE_SHARE_PROFILE;
 if(!baseUrl||!profile||!path.isAbsolute(profile))throw Error('Explicit site and local profile required');
 const config=path.join(profile,'Profile','share-device.json'),output=path.resolve(__dirname,'../../private-share-site/bootstrap-sha256.txt');
 if(process.argv.includes('--migrate')){
  const old=await require('../../src/main/share-credentials.cjs').createShareCredentials({filename:config,safeStorage}).clientConfig();
  const env={...process.env,INKBRIDGE_MIGRATION_CREDENTIALS:JSON.stringify(old)};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(process.execPath,[__filename,'--encrypt-migrated'],{env,windowsHide:true,stdio:['ignore','inherit','inherit']});
  const code=await new Promise(resolve=>child.once('exit',resolve));if(code!==0)throw Error('Credential migration failed');app.quit();return;
 }
 if(process.argv.includes('--encrypt-migrated')){
  const value=JSON.parse(process.env.INKBRIDGE_MIGRATION_CREDENTIALS);delete process.env.INKBRIDGE_MIGRATION_CREDENTIALS;
  await require('../../src/main/share-credentials.cjs').createShareCredentials({filename:config,safeStorage}).write(value);console.log(JSON.stringify({migrated:true,encrypted:true}));app.quit();return;
 }
 try{await fs.access(config);throw Error('Device configuration already exists; use pairing or explicit credential rotation');}catch(e){if(e.code!=='ENOENT')throw e;}
 const token=crypto.randomBytes(48).toString('base64url');
 await require('../../src/main/share-credentials.cjs').createShareCredentials({filename:config,safeStorage}).write({baseUrl,token,readerBuild:'inkbridge-reader-v1'});
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,crypto.createHash('sha256').update(token).digest('hex'),{flag:'wx'});
 console.log(JSON.stringify({configured:true,encrypted:true,profile,bootstrapHashFile:output}));app.quit();
}).catch(error=>{console.error(error.message);app.exit(1);});
