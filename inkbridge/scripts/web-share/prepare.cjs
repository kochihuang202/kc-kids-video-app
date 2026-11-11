// Build a browser-only variant of the complete existing native viewer. Originals
// stay private; publishing preparation does not execute any vendor bootstrap.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'../../private-original-editor'),out=path.join(root,'web-runtime'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const identities={92570:'346bdc98968dd0a1b2467a4c7d1f8258f9ba12764cadfcdd5d815ee173590a55',48626:'4e77403d2a30f02126c6ec8afd3c0c9b6fe79f3d77df9d59988bb3cc371fc7de',64744:'1d8f82892a4f9f855a3debae02119c0927a5b8d566b86758607bdfde9aac42d8',96895:'81850a2d1f98fef034dec9f2ffbbeec44abaa89ee11feeb906e47a26b887267a',69666:'f04b9d094070dfa527658ef73b70f050fa415be1ca5bf9a4f941c3650139fbac'};
function prepare(){
 const index=JSON.parse(fs.readFileSync(path.join(root,'modules.json'))),modules=index.modules,files=[],parts=[];fs.mkdirSync(out,{recursive:true});
 function replace(source,from,to){if(source.split(from).length!==2)throw Error('Native web anchor not unique: '+from.slice(0,90));return source.replace(from,to);}
 let batch=[],bytes=0,part=0;
 function flush(){if(!batch.length)return;const name=`factories-${String(part++).padStart(3,'0')}.js`,source='self.webpackChunk_N_E.push([['+JSON.stringify('inkbridge-web-'+part)+'],{'+batch.join(',')+'}]);';fs.writeFileSync(path.join(out,name),source);files.push(name);batch=[];bytes=0;}
 for(const [id,meta]of Object.entries(modules)){
  if(identities[id]&&meta.sha256!==identities[id])throw Error('Recheck changed native viewer source: '+id);
  let source=fs.readFileSync(path.join(root,meta.editableSource),'utf8');if(sha(source)!==meta.editableSha256)throw Error('Collect latest native sources first: '+id);
  if(id==='92570'){
   if(!source.includes('original factory SHA-256 346bdc98968dd0a1b2467a4c7d1f8258f9ba12764cadfcdd5d815ee173590a55'))throw Error('Native viewer identity changed');
   source=replace(source,'U = B.Ls.replace(/\\/$/, "")','U = ""');
   source=replace(source,'(0, l.jsx)(ei, {})','null');
   source=source.replaceAll('https://myflexnote.com/','./').replaceAll('https://wiki.myflexnote.com/','./').replaceAll('/images/share-logo.png','./inkbridge.svg').replaceAll('"FlexNote"','"InkBridge"');
  }
  if(id==='64744')source=replace(source,'{ dsn: "https://e1e6312798ab0f197e1a2ccddb7f8f56@o186219.ingest.us.sentry.io/4509735875510272", sendDefaultPii: !0 }','{ enabled: !1, defaultIntegrations: [], sendDefaultPii: !1 }');
  // Native thumbnail fallback is a desktop file named after the board ID.
  // Missing thumbnails use the native placeholder, never a custom protocol.
  if(id==='69666')source=replace(source,'"pattern" === r && s ? a(s, n) : i;', '"pattern" === r && s ? a(s, n) : i.startsWith("flexnote:") ? "" : i;');
  if(id==='48626'){
   source=replace(source,'let t = String(e.data.objectId), n = null !== (r = null !== (i = e.data.title)', 'if(globalThis.__inkbridgeUnsharedBoards?.has(String(e.data.objectId))){a();return;} let t = String(e.data.objectId), n = null !== (r = null !== (i = e.data.title)');
   source=replace(source,'t5 = (0, r.useCallback)(async (e) => { tP();','t5 = (0, r.useCallback)(async (e) => { if (_) return; tP();');
   source=replace(source,'enableShortcuts: !0, historyScopeId: eF','enableShortcuts: !_, historyScopeId: eF');
   source=replace(source,'onEdgesDelete: nl,','onEdgesDelete: _ ? void 0 : nl,');
   source=replace(source,'onDrop: ez,','onDrop: _ ? void 0 : ez,');
  }
  // The native reader uses the same packaged PDF.js version as the desktop.
  if(id==='33158'){
   if(meta.sha256!=='3e3d5e69bd8d91e014731f96ae58b5dcf1ad7184632933241f563c3d28e8500b')throw Error('Recheck changed native image resolution source');
   // Keep the native bucket cache, visible-load queue, worker decoding and
   // invalidation. Only choose the bytes for an already-requested resolution.
   source=replace(source,'let o = i ? await this.loadSvgImageElement(t, n) : await this.loadImageElement(t);','let o = i ? await this.loadSvgImageElement(t, n) : await this.loadImageElement(globalThis.__inkbridgeWebImageSource?.(t,n)||t);');
   source=replace(source,'this.naturalSizes.set(t, { width: o.naturalWidth, height: o.naturalHeight });','this.naturalSizes.set(t, globalThis.__inkbridgeWebImageDimensions?.get(t)||{ width: o.naturalWidth, height: o.naturalHeight });');
  }
  if(id==='96895'){
   source=source.replaceAll('https://unpkg.com/pdfjs-dist@4.4.168/','/pdfjs/');
   source=replace(source,'"/pdfjs/build/pdf.worker.min.mjs"','new URL("pdfjs/build/pdf.worker.min.mjs",globalThis.__inkbridgeWebBase).href');
   source=replace(source,'"/pdfjs/cmaps/"','new URL("pdfjs/cmaps/",globalThis.__inkbridgeWebBase).href');
   // PDF.js4.4.168 supports bounded range loading. For remote R2 documents,
   // disable automatic full-file prefetch instead of downloading512MiB while
   // the user reads one page. Keep the native loader/worker/render lifecycle.
   source=replace(source,'let r = { ...this.props, ownerDocument: e,','let r = { ...this.props, disableAutoFetch: true, disableStream: true, rangeChunkSize: 1024*1024, ownerDocument: e,');
   source=replace(source,'(0, eU.KD)("updateTotalPages", { id: this.props.id, totalPages: e._pdfInfo.numPages });','window.ipc && (0, eU.KD)("updateTotalPages", { id: this.props.id, totalPages: e._pdfInfo.numPages });');
   for(const method of ['updatePdfCardCurrentPage','updatePdfCardViewPrefs'])source=replace(source,'(0, eU.KD)("'+method+'",','window.ipc && (0, eU.KD)("'+method+'",');
   source=replace(source,'}, eY = async function (e, t) {','}, eY = async function (e, t) { if (!window.ipc) return;');
   source=replace(source,'this.capturePagePreview = async (e) => { if (!this.props.fitToContainer','this.capturePagePreview = async (e) => { if (!window.ipc || !this.props.fitToContainer');
  }
  const ast=ts.createSourceFile(id,source,99,true),factory=ast.statements[0]?.expression?.right;if(ast.parseDiagnostics.length||!factory)throw Error('Invalid web factory '+id);
  const text=id+':'+factory.getText(ast),size=Buffer.byteLength(text);if(size>4*1024*1024)throw Error('Single web factory exceeds chunk budget');if(bytes+size>4*1024*1024)flush();batch.push(text);bytes+=size;
 }
 flush();const chunks=[...new Set(index.chunks.flatMap(c=>c.chunkIds))];const complete='self.webpackChunk_N_E.push(['+JSON.stringify(chunks)+',{}]);';fs.writeFileSync(path.join(out,'ready.js'),complete);files.push('ready.js');
 fs.copyFileSync(path.join(root,'runtime.js'),path.join(out,'runtime.js'));
 const locale=JSON.parse(fs.readFileSync(path.join(root,'vendor/app/_next/data/LOq0EGi9XWnc3BD21aEGY/zh-TW/board.json')));
 const extra=JSON.parse(fs.readFileSync(path.join(root,'content-block-source/locales.json')));for(const [lang,data]of Object.entries(extra))if(locale.pageProps?._nextI18Next?.initialI18nStore[lang]?.common)Object.assign(locale.pageProps._nextI18Next.initialI18nStore[lang].common.lexical,data.lexical);
 fs.writeFileSync(path.join(out,'locale.json'),JSON.stringify(locale));
 const result={format:'inkbridge-web-runtime',version:1,files:['runtime.js',...files,'locale.json'],sources:Object.keys(modules).length,viewerSourceSha256:modules['92570'].sha256};fs.writeFileSync(path.join(out,'runtime-manifest.json'),JSON.stringify(result,null,2));return result;
}
if(require.main===module){try{console.log(JSON.stringify(prepare()));}catch(e){console.error(e);process.exitCode=1;}}module.exports={prepare};
