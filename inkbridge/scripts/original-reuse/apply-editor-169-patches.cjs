// Backport the verified 1.1.69 scheduling/teardown contracts, retaining the
// existing complete 1.1.65 components and all InkBridge persistence bridges.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const identities={34883:'73c4a523c460a014c06bcfed06e3c6fdfc8d84bc901d849b53f2441842e98195',10764:'ecd98c43416144f5f4d7b1e81b19649f3c0f5a1c4af82f31383ee2c8aec9bff6'};
const references={34883:'a5caadd1130fdebd4b33b8e977cf652d21be3d937556a2c9e68bc64951d66d69',10764:'d344f528171adaa879a5db7f56541fc0b78d6ab13c7959b8937f435e79d27553'};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function applyEditor169Patches({root,changes}){
  function edit(id,transform){
    const file=path.join(root,'source-modules',`module-${id}.cjs`),before=fs.readFileSync(file,'utf8');
    if(!before.includes('original factory SHA-256 '+identities[id]))throw Error('Editor backport source identity changed: '+id);
    const after=transform(before);if(ts.createSourceFile(file,after,99,true).parseDiagnostics.length)throw Error('Invalid editor backport: '+id);
    if(after!==before){const backup=file+'.before-editor-169';if(!fs.existsSync(backup))fs.writeFileSync(backup,before);fs.writeFileSync(file,after);}
    changes.push({id,description:'Backport verified FlexNote 1.1.69 editor scheduling / independent resource cleanup',sourceFactorySha256:identities[id],referenceFactorySha256:references[id],beforeSha256:hash(before),afterSha256:hash(after)});
  }
  edit(34883,source=>{
    if(source.includes('inkbridgeMindmapImmediate'))return source;
    const anchor='F.current = !0; let t = Date.now();',replacement='F.current = !0; if ("MindmapNode" === E) { z.current(L.current, B.current); return; } let t = Date.now();';
    if(source.split(anchor).length!==2)throw Error('Native Flow change boundary is not unique');
    const after=source.replace(anchor,replacement),ast=ts.createSourceFile('flow.js',after,99,true);let callbacks=[];
    function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='(0, r.useCallback)'&&n.arguments[0]?.getText(ast).includes(replacement))callbacks.push(n);ts.forEachChild(n,visit);}visit(ast);
    if(callbacks.length!==1||callbacks[0].arguments[1]?.getText(ast)!=='[]')throw Error('Native Flow dependency boundary changed');
    const deps=callbacks[0].arguments[1];return after.slice(0,deps.getStart(ast))+'[E] /* inkbridgeMindmapImmediate: FlexNote 1.1.69 */'+after.slice(deps.end);
  });
  edit(10764,source=>{
    if(source.includes('function inkbridgeReleaseCanvasResource('))return source;
    const ast=ts.createSourceFile('canvas.js',source,99,true);let candidates=[];
    function visit(n){if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.getText(ast).includes('setEditingNode(null)')&&n.body.getText(ast).includes('connectionRenderer.delete()')&&n.body.getText(ast).length<7000)candidates.push(n);ts.forEachChild(n,visit);}visit(ast);
    candidates=candidates.filter(n=>!candidates.some(child=>child!==n&&child.pos>n.pos&&child.end<n.end));
    if(candidates.length!==1)throw Error('Native Canvas cleanup is not unique');const cleanup=candidates[0],calls=[];
    function find(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['delete','clear'].includes(n.expression.name.text)&&n.arguments.length===0)calls.push(n);ts.forEachChild(n,find);}find(cleanup.body);
    if(calls.length!==16)throw Error('Native owned resource list changed: '+calls.length);
    let after=source;for(const call of calls.sort((a,b)=>b.pos-a.pos))after=after.slice(0,call.getStart(ast))+'inkbridgeReleaseCanvasResource(() => '+call.getText(ast)+')'+after.slice(call.end);
    const offset=cleanup.body.getStart(ast)+1;
    // Preserve lifecycle flags, timer cancellation, release order, surface
    // disposal and host callback. Exactly the sixteen native releases get guards.
    return after.slice(0,offset)+' function inkbridgeReleaseCanvasResource(release) { try { release(); } catch (error) { console.warn("[MyCanvasKit] failed to release canvas resource", error); } } '+after.slice(offset);
  });
}
module.exports=applyEditor169Patches;
