// Fixed per-board share URLs (user decision 2026-11-14) on a real local workerd/R2.
// Every board's URL is the identity it would have as a publication root; it serves the latest
// enabled publication that still contains the board. Synthetic packages only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {createShareClient}=require('../src/main/share-client.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('every board keeps one URL: descendants through aliases, latest publication wins, disabled or removed falls back',async()=>{
 const config={modules:true,scriptPath:path.resolve(__dirname,'../share-site/_worker.js'),compatibilityDate:'2026-08-28',r2Buckets:['SHARE_BUCKET'],bindings:{BOOTSTRAP_TOKEN_SHA256:hash('synthetic-bootstrap')},serviceBindings:{ASSETS:()=>new Response('<!doctype html><html><head></head><body>reader</body></html>',{headers:{'content-type':'text/html'}})}};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config),dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-board-urls-'));
 const baseUrl='https://synthetic.test',dispatch=(url,init)=>mf.dispatchFetch(url,{redirect:'manual',...init});
 const client=createShareClient({baseUrl,token:'synthetic-bootstrap',jobDirectory:path.join(dir,'jobs'),fetch:(url,init)=>mf.dispatchFetch(url,init)});
 let n=0;
 async function publish(root,boards,expectedVersion=null){
  const folder=path.join(dir,'pkg-'+(++n));await fs.mkdir(folder);
  const data={format:'inkbridge-web-share',version:1,rootBoardId:root,boardIds:boards,graph:{boards:boards.map(id=>({id}))},attachments:[],nonce:n},b=Buffer.from(JSON.stringify(data));
  await fs.writeFile(path.join(folder,'share.json'),b);
  await fs.writeFile(path.join(folder,'package-manifest.json'),JSON.stringify({format:'inkbridge-share-package',version:1,rootBoardId:root,readerBuild:'test-native',files:[{path:'share.json',size:b.length,sha256:hash(b),contentType:'application/json'}]}));
  return client.publish({workspaceId:'w',rootBoardId:root,requestId:'r'+n,expectedVersion,packageDirectory:folder});
 }
 const open=async url=>{const r=await dispatch(url);return {status:r.status,location:r.headers.get('location')};};
 const servedBy=async url=>{const r=await dispatch(url+'share.json');return r.status===200?(await r.json()).publicationVersion:r.status;};
 try{
  // Root R with child A and grandchild G: one URL per board.
  const r1=await publish('R',['R','A','G']);
  assert.deepEqual(Object.keys(r1.boardUrls).sort(),['A','G','R']);
  const url={R:r1.boardUrls.R,A:r1.boardUrls.A,G:r1.boardUrls.G};
  assert.equal(new URL(url.R).pathname,'/s/'+r1.publicationId+'/','the root URL is the publication URL');
  assert.equal(new Set(Object.values(url)).size,3);
  assert.deepEqual(await open(url.R),{status:200,location:null},'root opens directly');
  const a=await open(url.A);assert.equal(a.status,302);assert.equal(a.location,new URL(url.A).pathname+'?shareId=A','child URL opens at the child');
  assert.equal((await open(url.A+'?shareId=A')).status,200);
  assert.equal(await servedBy(url.G),r1.version,'grandchild served by the root publication');
  assert.equal((await open(url.G+'?shareId=other')).status,404,'only published boards');
  assert.equal((await open(baseUrl+'/s/'+'0'.repeat(40)+'/')).status,404);
  // The child published as its own root: same URL, now its own publication.
  const a1=await publish('A',['A','G']);
  assert.equal(a1.boardUrls.A,url.A,'publishing the child as root keeps its URL');assert.equal(a1.boardUrls.G,url.G);
  assert.deepEqual(await open(url.A),{status:200,location:null});
  assert.equal(await servedBy(url.A),a1.version);assert.equal(await servedBy(url.G),a1.version,'latest publication containing the board wins');
  // Updating the root again: its copy is the latest for A and G.
  const r2=await publish('R',['R','A','G'],r1.version);
  assert.equal(r2.boardUrls.A,url.A);assert.equal(await servedBy(url.A),r2.version);assert.equal(await servedBy(url.G),r2.version);
  // Disabling the root's share: A falls back to its own publication; G (last aliased to R) has none of its own.
  const off=await client.setEnabled({publicationId:r2.publicationId,expectedVersion:r2.version,enabled:false});
  assert.equal(await servedBy(url.R),404);assert.equal(await servedBy(url.A),a1.version);assert.equal(await servedBy(url.G),404);
  const on=await client.setEnabled({publicationId:r2.publicationId,expectedVersion:off.version,enabled:true});
  assert.equal(await servedBy(url.G),on.version);
  // A board removed from the latest publication is no longer served through it.
  const r3=await publish('R',['R','A'],on.version);
  assert.equal(await servedBy(url.A),r3.version);assert.equal(await servedBy(url.G),404);
  assert.equal(r3.boardUrls.G,undefined);
 }finally{await mf.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
