// Adapt only the server/account boundary of the complete private native panel.
// Recovered component bodies are deliberately never copied into this repository.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'../../private-original-editor');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function once(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('Sharing patch anchor changed: '+anchor.slice(0,80));return source.replace(anchor,replacement);}
function replaceInitializer(source,name,test,value){const ast=ts.createSourceFile('sharing.js',source,99,true),matches=[];function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name&&n.initializer&&test(n.initializer.getText(ast)))matches.push(n.initializer);ts.forEachChild(n,visit);}visit(ast);if(matches.length!==1)throw Error('Ambiguous sharing declaration '+name+': '+matches.length);const n=matches[0];return source.slice(0,n.getStart(ast))+value+source.slice(n.end);}
function prepareSharing(){
 const receipt={format:'inkbridge-native-sharing-patch',version:1,modules:{}};
 for(const id of ['46979','78178']){
  const filename=path.join(root,'source-modules',`module-${id}.cjs`),backup=filename+'.before-sharing',current=fs.readFileSync(filename,'utf8');
  if(!fs.existsSync(backup)){if(current.includes('InkBridgeSharePopover')||current.includes('__inkbridgeShareInvoke'))throw Error('Missing native sharing baseline');fs.writeFileSync(backup,current,{flag:'wx'});}
  let source=fs.readFileSync(backup,'utf8');
  const baselineSha=id==='78178'?'a7d5a7d9d909a87fff98165898750bf8cb862e1a4160b9d2c0756d33cb72b054':'8efb294a5968bb297efd0756684a8f8293e50d40d5845693708eecc2037ecb6b';
  if(sha(source)!==baselineSha)throw Error('Private sharing baseline hash mismatch: '+id);
  const expected=id==='78178'?'dc7fb9273b90a4801e5cb134f97ac9f16b7c4b8378e93b5b51c41380df6bea04':'cba922d999fccbb9b3df078b7b7e368262a6785adc15da51b67c2e2d978682f8';
  if(!source.includes('original factory SHA-256 '+expected))throw Error('Native sharing source identity changed: '+id);
  if(id==='46979'){
   source=once(source,'n.d(t, { z7:', 'n.d(t, { InkBridgeSharePopover: function () { return n2; }, z7:');
   source=once(source,'children: t.map(e => { let { key: t, label: n, icon: i } = e;', 'children: t.filter(e => e.key === "web").map(e => { let { key: t, label: n, icon: i } = e;');
   source=once(source,'"web" === g && c("share.web_desc")','"web" === g && "發布到自己的網站，持有連結即可觀看。只有按發布或更新才上傳；本機保存不會自動公開。"');
  }else{
   source=source.replaceAll('window.ipc.invoke(', 'globalThis.__inkbridgeShareInvoke(');
   const ast=ts.createSourceFile('share.js',source,99,true);let nested;function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='_')nested=n;ts.forEachChild(n,find);}find(ast);if(!nested)throw Error('Native nested-board function missing');
   source=source.slice(0,nested.getStart(ast))+'async function _(id) { return globalThis.__inkbridgeShareTreeRecords(id); }'+source.slice(nested.end);
   source=replaceInitializer(source,'j',s=>s.includes('selectedNestedIds'),'r.memo(function(props){ return i.jsx(globalThis.__inkbridgeShareTree, props); })');
   source=replaceInitializer(source,'P',s=>s.includes('hasAccess'),'r.memo(function(props){ return i.jsx(globalThis.__inkbridgeShareConnection, props); })');
   source=replaceInitializer(source,'R',s=>s.includes('usedBytes'),'r.memo(function(){ return null; })');
   source=replaceInitializer(source,'u',s=>s.startsWith('function (e) { let t = (0, g.v9)'),'globalThis.__inkbridgeUseShareAccess()');
   source=replaceInitializer(source,'ee',s=>s.includes('validate-share-payload'),'async () => []');
   source=replaceInitializer(source,'en',s=>s.includes('whiteboardId: t, payload: e'),'async () => [{whiteboardId:t}]');
   source=replaceInitializer(source,'et',s=>s.includes('publish target failed'),`async () => {
    const selected=[t,...A];Y({total:selected.length,currentId:t,completedIds:[],failedIds:[]});
    try { const receipt=await globalThis.__inkbridgeSharePublish({boardId:t,selectedBoardIds:selected});
     h(receipt.url); f(receipt.publicationId); g(receipt.enabled!==false); k(receipt.publishedAt); O(true);
     Y({total:selected.length,currentId:null,completedIds:selected,failedIds:[]});
     if(E)await E();if(P)await P();
    }catch(error){globalThis.__inkbridgeShareFailure(error);throw error;}
   }`);
   source=once(source,'W(e), q(e.filter(e => !e.isCurrent).map(e => e.id));','W(e), q(globalThis.__inkbridgeShareSelection(t, e));');
   source=once(source,'I(t.quotaBytes > 0 ? t.quotaBytes : 104857600)','I(t.quotaBytes || 0)');
   source=once(source,'isCreating: O, setIsCreating: F,','isCreating: O || globalThis.__inkbridgeShareBusy(t), setIsCreating: F,');
   source=once(source,'}; (0, r.useEffect)(() => { n && t && u && (Y(), V()); }, [n, t, u]);','}; (0, r.useEffect)(() => { const refresh = event => { if (event.detail === t) { Y(); V(); } }; window.addEventListener("inkbridge:share-refresh", refresh); return () => window.removeEventListener("inkbridge:share-refresh", refresh); }, [t]); (0, r.useEffect)(() => { n && t && u && (Y(), V()); }, [n, t, u]);');
   source=once(source,'children: [null, es && (0, i.jsx)(j,','children: [(0, i.jsx)(globalThis.__inkbridgeShareExtras, {boardId:t, selectedBoardIds:[t,...A], isPublishing:S}), es && (0, i.jsx)(j,');
   source=once(source,'children: [m, " ", d("share.settings.views"), " \\xb7 ", y ?', 'children: [y ?');
  }
  const check=ts.createSourceFile(id,source,99,true);if(check.parseDiagnostics.length)throw Error('Sharing patch syntax rejected: '+id);
  fs.writeFileSync(filename,source);receipt.modules[id]={referenceFactorySha256:expected,beforeSha256:sha(fs.readFileSync(backup)),afterSha256:sha(source)};
 }
 fs.writeFileSync(path.join(root,'sharing-patch-receipt.json'),JSON.stringify(receipt,null,2));return receipt;
}
if(require.main===module){console.log(JSON.stringify(prepareSharing()));}
module.exports={prepareSharing};
