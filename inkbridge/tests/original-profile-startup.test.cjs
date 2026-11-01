const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
test('invalid isolated profile exits before creating files instead of leaving an uncaught-error modal',()=>{
  const profile=path.join(os.tmpdir(),'inkbridge-rejected-'+crypto.randomUUID());
  const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:profile};
  delete env.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(require('electron'),[path.resolve(__dirname,'../scripts/original-reuse/host.cjs')],{env,encoding:'utf8',timeout:10000,windowsHide:true});
  assert.ifError(result.error);
  assert.equal(result.status,1);
  assert.match(result.stderr,/Probe profile must be inside/);
  assert(!fs.existsSync(profile),'rejected profile must not create a database or Electron profile');
});
