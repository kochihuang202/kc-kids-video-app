// Source-identity checked adapters; vendor implementations stay in private files.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),ts=require('typescript');
module.exports=({root,changes})=>{
 const identities={64744:'1d8f82892a4f9f855a3debae02119c0927a5b8d566b86758607bdfde9aac42d8',66963:'8dad4eb146cea875f519d0e4bb68bbfb70f9ad1e11277e733efaa82ec4767905',37883:'7d15abe38e29b3fbcf52e0e79fca21056b2dfe7e5dbc1a1983b31b0af3557d95',94700:'81cc8ef85f0c9237163c5057410082e2b81ed9bc4d0b4f8a208589309053a11c'};
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const edit=(id,fn)=>{const file=path.join(root,`source-modules/module-${id}.cjs`),before=fs.readFileSync(file,'utf8');if(!before.includes('original factory SHA-256 '+identities[id]))throw Error('Clipboard/history source changed: '+id);const after=fn(before);if(ts.createSourceFile(file,after,99,true).parseDiagnostics.length)throw Error('Invalid clipboard/history patch: '+id);if(after!==before)fs.writeFileSync(file,after);changes.push({id,description:'Bind native clipboard/history lifecycle to owned SQLite boundary',sourceFactorySha256:identities[id],beforeSha256:hash(before),afterSha256:hash(after)});};
 const replace=(s,a,b)=>{if(s.includes(b))return s;if(s.split(a).length!==2)throw Error('Clipboard/history anchor missing: '+a.slice(0,100));return s.replace(a,b);};
 edit(64744,s=>{
  const ast=ts.createSourceFile('64744',s,99,true);let callback;
  function visit(node){if(ts.isCallExpression(node)&&node.arguments[0]?.getText(ast)==='"mod+c"'&&node.arguments[1]?.getText(ast).includes('ne.mr'))callback=node.arguments[1].getText(ast);ts.forEachChild(node,visit);}visit(ast);
  if(!callback)throw Error('Complete native canvas copy callback missing');
  const hook=`function inkbridgeUseCanvasCopy(){const t=(0,f.T)(),{getNodes:u,getConnections:g}=(0,nD.tN)();(0,ix.y1)("mod+c",${callback});}`;
  if(!s.includes('function inkbridgeUseCanvasCopy()'))s=s.replace('    "use strict";','    "use strict";\n    '+hook);
  s=replace(s,'default: function () { return oI; }','InkBridgeUseCanvasCopy: function () { return inkbridgeUseCanvasCopy; }, default: function () { return oI; }');
  // The full native paste promise (including its scene projection) must precede
  // close, snapshot and undo. Capture before it changes any IDs or writes rows.
  s=replace(s,'_.current += 1, (0, ne.Su)(','_.current += 1, nD.gt.getState().pushUndoSnapshot(), await (globalThis.__inkbridgeTrackOperation || (task=>task()))(()=> (0, ne.Su)(');
  s=replace(s,'b(1 === a.length ? a[0].id : null); });','b(1 === a.length ? a[0].id : null); return globalThis.__inkbridgeAfterCanvasPaste?.(); }));');
  s=replace(s,'s.preventDefault(), await y.current(N, rV());','s.preventDefault(), nD.gt.getState().pushUndoSnapshot(), await y.current(N, rV());');
  s=replace(s,'if (!O && q.length > 0) {','if (!O && q.length > 0) { if(T) nD.gt.getState().pushUndoSnapshot();');
  return s;
 });
 edit(66963,s=>{
  s=replace(s,'Ox: function () { return p; }','Ox: function () { return inkbridgeSnapshot; }');
  if(!s.includes('function inkbridgeSnapshot('))s=s.replace('    "use strict";','    "use strict";\n    function inkbridgeSnapshot(...args){const value=p(...args);if(globalThis.__inkbridgeCaptureHistory)value.inkbridgeGraph=globalThis.__inkbridgeCaptureHistory();return value;}');
  return s;
 });
 edit(37883,s=>{
  for(const name of ['undo','redo'])s=replace(s,`let e = o.gt.getState().${name}(t);`,`if(globalThis.__inkbridgeRunHistory)return globalThis.__inkbridgeRunHistory("${name}",t); let e = o.gt.getState().${name}(t);`);
  return s;
 });
 edit(94700,s=>{
  s=replace(s,'AJ: function () { return U; }','AJ: function () { return inkbridgeDeleteNodes; }');
  if(!s.includes('function inkbridgeDeleteNodes('))s=s.replace('    "use strict";','    "use strict";\n    function inkbridgeDeleteNodes(...args){return (globalThis.__inkbridgeTrackOperation || (task=>task()))(()=>U(...args));}');
  s=replace(s,'Su: function () { return en; }','Su: function () { return inkbridgePasteNodes; }');
  if(!s.includes('function inkbridgePasteNodes('))s=s.replace('    "use strict";','    "use strict";\n    function inkbridgePasteNodes(...args){if(globalThis.__inkbridgePrepareCanvasPaste){const prepared=globalThis.__inkbridgePrepareCanvasPaste(args[0],args[1]);args[0]=prepared.nodes;args[1]=prepared.edges;}return en(...args);}');
  if(s.includes('const inkbridgePasteConnections='))return s;
  const ast=ts.createSourceFile('94700',s,99,true);let callback;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='en'&&node.initializer?.getText(ast).includes('batchCreateNoteCards'))callback=node.initializer;ts.forEachChild(node,visit);}visit(ast);
  if(!callback)throw Error('Native paste implementation missing');
  const before=callback.getText(ast),start=before.indexOf('A.length && (0, d.KD)("batchAddConnections"'),end=before.indexOf('; let R = I.filter',start);
  if(start<0||end<0)throw Error('Native paste connection ordering changed');
  let after=before.slice(0,start)+'const inkbridgePasteConnections=()=>'+before.slice(start,end)+before.slice(end);
  after=replace(after,'Promise.all(Y).then(e => {','Promise.all(Y).then(async e => { await inkbridgePasteConnections();');
  return s.slice(0,callback.getStart(ast))+after+s.slice(callback.end);
 });
 // The native keyboard Delete branch delegates to its parent without capturing
 // history. Unlike the original full parent, our callbacks are explicit ports.
 const file=path.join(root,'source-modules/module-10764.cjs'),before=fs.readFileSync(file,'utf8');
 if(!before.includes('original factory SHA-256 ecd98c43416144f5f4d7b1e81b19649f3c0f5a1c4af82f31383ee2c8aec9bff6'))throw Error('Native canvas source identity changed');
 const anchor='T = g.gt.getState().selectedNodeIds, E = g.gt.getState().selectedConnectionIds;';
 const after=replace(before,anchor,anchor+' if(T.size || E.size || g.gt.getState().selectedDrawingStrokeIds.size) null == eI || eI();');
 if(ts.createSourceFile(file,after,99,true).parseDiagnostics.length)throw Error('Native delete history patch syntax');
 if(after!==before)fs.writeFileSync(file,after);changes.push({id:10764,description:'Capture native keyboard deletion before node/edge/stroke parent callbacks',beforeSha256:hash(before),afterSha256:hash(after)});
};
