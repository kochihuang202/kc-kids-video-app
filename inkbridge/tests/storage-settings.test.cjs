const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStorageSettings}=require('../src/main/storage-settings.cjs');
test('machine settings validate separate folders, retain prior config on failure and never migrate data',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-storage-settings-'));
  try {
    const local=path.join(root,'local'),app=path.join(root,'app'),exchange=path.join(root,'exchange');
    [local,app,exchange].forEach(p=>fs.mkdirSync(p));fs.mkdirSync(path.join(exchange,'snapshots'));
    const filename=path.join(local,'settings.json'),store=createStorageSettings({filename,localDirectory:local,applicationDirectory:app});
    assert.equal(store.read().exchangeDirectory,'');
    assert.deepEqual(store.check(exchange).directories,['snapshots']);
    store.save(exchange);assert.equal(store.read().exchangeDirectory,fs.realpathSync(exchange));
    const original=fs.readFileSync(filename,'utf8');
    for(const bad of [local,app,root,path.parse(root).root,'relative',path.join(root,'missing')]) assert.throws(()=>store.save(bad));
    assert.equal(fs.readFileSync(filename,'utf8'),original);
    assert.deepEqual(fs.readdirSync(exchange),['snapshots']);
    fs.writeFileSync(filename,'broken');assert.throws(()=>store.read());
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
