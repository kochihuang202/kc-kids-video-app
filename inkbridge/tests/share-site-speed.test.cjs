// Share page speed (user decision 2026-11-14) on a real local workerd/R2: per-publication font
// subsets are accepted, verified and served; reader builds named by content hash get immutable
// caching and /reader/current.json picks the build every share opens with. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {createShareClient}=require('../src/main/share-client.cjs');
const {subsetFont,codepoints}=require('../src/main/share-fonts.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fonts=path.resolve(__dirname,'../private-original-editor/vendor/app/fonts');
test('font subsets are small and keep the requested characters only',async()=>{
 const source=await fs.readFile(path.join(fonts,'SourceHanSansSC-Regular.otf'));
 const small=await subsetFont(source,codepoints(['麥當勞'])),large=await subsetFont(source,codepoints(['麥當勞'+'動物園出發要帶的物品'.repeat(3)]));
 assert(small.length<source.length/50,'subset is a small fraction of the full font');assert(large.length>small.length,'more characters, larger subset');
 assert.equal(hash(await subsetFont(source,codepoints(['麥當勞']))),hash(small),'deterministic');
 const emoji=await subsetFont(await fs.readFile(path.join(fonts,'NotoColorEmoji-Regular.ttf')),codepoints(['plain text'],'emoji'));assert(emoji.length<64*1024,'no emoji: tiny emoji font');
});
test('site accepts and serves publication fonts; versioned reader builds are cached forever',async()=>{
 const build='inkbridge-reader-0123456789ab';
 const assets=request=>{const p=new URL(request.url).pathname;if(p==='/reader/current.json')return new Response(JSON.stringify({build}),{headers:{'content-type':'application/json'}});if(p.endsWith('.js'))return new Response('// reader',{headers:{'content-type':'text/javascript','cache-control':'public, max-age=0, must-revalidate'}});return new Response('<!doctype html><html><head></head><body>reader</body></html>',{headers:{'content-type':'text/html'}});};
 const config={modules:true,scriptPath:path.resolve(__dirname,'../share-site/_worker.js'),compatibilityDate:'2026-08-28',r2Buckets:['SHARE_BUCKET'],bindings:{BOOTSTRAP_TOKEN_SHA256:hash('synthetic-bootstrap')},serviceBindings:{ASSETS:assets}};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config),dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-speed-'));
 const baseUrl='https://synthetic.test',client=createShareClient({baseUrl,token:'synthetic-bootstrap',jobDirectory:path.join(dir,'jobs'),fetch:(url,init)=>mf.dispatchFetch(url,init)});
 try{
  const folder=path.join(dir,'pkg');await fs.mkdir(path.join(folder,'assets'),{recursive:true});
  const font=await subsetFont(await fs.readFile(path.join(fonts,'SourceHanSansSC-Regular.otf')),codepoints(['根白板'])),fontPath='assets/font-'+hash(font)+'.otf';await fs.writeFile(path.join(folder,fontPath),font);
  const data={format:'inkbridge-web-share',version:1,rootBoardId:'root',boardIds:['root'],graph:{boards:[{id:'root'}]},attachments:[],fonts:[{file:'SourceHanSansSC-Regular.otf',path:fontPath,sha256:hash(font),size:font.length,contentType:'font/otf'}]},b=Buffer.from(JSON.stringify(data));
  await fs.writeFile(path.join(folder,'share.json'),b);
  const manifest={format:'inkbridge-share-package',version:1,rootBoardId:'root',readerBuild:'inkbridge-reader-v1',files:[{path:'share.json',size:b.length,sha256:hash(b),contentType:'application/json'},{path:fontPath,size:font.length,sha256:hash(font),contentType:'font/otf'}]};
  await fs.writeFile(path.join(folder,'package-manifest.json'),JSON.stringify(manifest));
  const published=await client.publish({workspaceId:'w',rootBoardId:'root',requestId:'one',expectedVersion:null,packageDirectory:folder});
  const prefix=baseUrl+'/s/'+published.publicationId+'/';
  const served=await mf.dispatchFetch(prefix+fontPath);assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'font/otf');assert.equal(hash(Buffer.from(await served.arrayBuffer())),hash(font));
  // The share page opens the current reader build, whatever build the package named.
  assert.match(await(await mf.dispatchFetch(prefix)).text(),new RegExp('<base href="/reader/'+build+'/">'));
  assert.equal((await mf.dispatchFetch(baseUrl+'/reader/'+build+'/factories-000.js')).headers.get('cache-control'),'public, max-age=31536000, immutable');
  assert.equal((await mf.dispatchFetch(baseUrl+'/reader/inkbridge-reader-v1/factories-000.js')).headers.get('cache-control'),'public, max-age=0, must-revalidate','the old fixed name is not cached forever');
  assert.notEqual((await mf.dispatchFetch(baseUrl+'/reader/current.json')).headers.get('cache-control'),'public, max-age=31536000, immutable');
  // Font files must be declared subsets with content-addressed names.
  const begin=files=>mf.dispatchFetch(baseUrl+'/api/uploads',{method:'POST',headers:{authorization:'Bearer synthetic-bootstrap','content-type':'application/json'},body:JSON.stringify({workspaceId:'w',rootBoardId:'root',requestId:'bad-'+files[1].path,expectedVersion:published.version,manifest:{...manifest,files}})});
  assert.equal((await begin([manifest.files[0],{...manifest.files[1],path:'assets/evil.otf'}])).status,400);
  assert.equal((await begin([manifest.files[0],{...manifest.files[1],contentType:'font/ttf'}])).status,400);
 }finally{await mf.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
