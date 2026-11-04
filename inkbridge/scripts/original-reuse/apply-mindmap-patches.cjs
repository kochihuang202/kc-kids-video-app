// Extract the complete same-version private parent callbacks. This build tool
// contains no copied callback implementation and never evaluates the vendor app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const ORIGINAL_FACTORY_SHA256='4e77403d2a30f02126c6ec8afd3c0c9b6fe79f3d77df9d59988bb3cc371fc7de';
const HOOK='inkbridgeUseMindmapActions';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function applyMindmapPatches({root,changes=[]}){
 const file=path.join(root,'source-modules/module-48626.cjs'),before=fs.readFileSync(file,'utf8');
 if(!before.includes('original factory SHA-256 '+ORIGINAL_FACTORY_SHA256))throw Error('Mindmap source identity changed; recheck native parent contracts');
 const ast=ts.createSourceFile(file,before,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),callbacks=new Map();let existingHook;
 function visit(node,insideOwnHook=false){
  if(ts.isFunctionDeclaration(node)&&node.name?.text===HOOK){existingHook=node;return;}
  if(!insideOwnHook&&ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['tJ','tG','tZ'].includes(node.name.text)&&node.initializer){
   const text=node.initializer.getText(ast),expected={tJ:'"addMindMapNode"',tG:'"batchUpdateMindMapNodes"',tZ:'"updateMindmapGroup"'}[node.name.text];
   if(text.startsWith('(0, r.useCallback)')&&text.includes(expected)){
    if(callbacks.has(node.name.text))throw Error('Ambiguous native mindmap callback '+node.name.text);
    callbacks.set(node.name.text,text);
   }
  }
  ts.forEachChild(node,child=>visit(child,insideOwnHook));
 }
 visit(ast);
 for(const name of ['tJ','tG','tZ'])if(!callbacks.has(name))throw Error('Native mindmap parent callback not found: '+name);
 const hook=`function ${HOOK}({mindmaps=[],theme="light",pushUndoSnapshot,dispatch}) {
        if (typeof dispatch !== "function") throw Error("Mindmap dispatch is required");
        const eo=dispatch, ew={mindmaps}, th=theme, eT=(0,r.useRef)(ew);
        eT.current=ew;
        const eK=s.gt.getState().setNodes, eY=s.gt.getState().setConnections,
            tP=(0,r.useCallback)((...args)=>pushUndoSnapshot?.(...args),[pushUndoSnapshot]);
        const tJ=${callbacks.get('tJ')}, tG=${callbacks.get('tG')}, tZ=${callbacks.get('tZ')};
        return {onMindmapAddChild:tJ,onMindmapNodeReorder:tG,onMindmapGroupTitleEdit:tZ};
    }`;
 let after=existingHook?before.slice(0,existingHook.getStart(ast))+hook+before.slice(existingHook.end):before.replace('    "use strict";','    "use strict";\n    '+hook);
 const entry='InkBridgeUseMindmapActions: function () { return '+HOOK+'; }, ';
 const exportAnchor='CANVASKIT_FOCUS_NODE_EVENT: function () { return iR; },';
 if(!after.includes(entry)){
  if(after.split(exportAnchor).length!==2)throw Error('Native mindmap export anchor changed');
  after=after.replace(exportAnchor,entry+exportAnchor);
 }
 // Catch extraction/binding syntax errors before changing the private registry.
 const parsed=ts.createSourceFile(file,after,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(parsed.parseDiagnostics.length)throw Error('Extracted mindmap hook has invalid syntax');
 if(after!==before){const backup=file+'.before-inkbridge';if(!fs.existsSync(backup))fs.writeFileSync(backup,before);fs.writeFileSync(file,after);}
 changes.push({id:'48626',description:'Expose complete native mindmap add-child/reorder/group-title callbacks with explicit host bindings',sourceFactorySha256:ORIGINAL_FACTORY_SHA256,status:after===before?'already applied':'applied',beforeSha256:hash(before),afterSha256:hash(after),callbackBytes:Object.fromEntries([...callbacks].map(([name,text])=>[name,Buffer.byteLength(text)]))});
 return {file,changed:after!==before,exportName:'InkBridgeUseMindmapActions'};
}
module.exports={applyMindmapPatches};
