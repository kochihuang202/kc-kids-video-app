// Complete private native factories/plugins; only binding and format adapters
// live in Git. Keep the old Lexical singleton, editor lifecycle and save bridge.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function applyContentBlockPatches({root,changes}){
  const sourceRoot=path.join(root,'content-block-source'),receipt=JSON.parse(fs.readFileSync(path.join(sourceRoot,'receipt.json'))),baseline=JSON.parse(fs.readFileSync(path.join(root,'source-baseline.json')));
  if(receipt.version!=='1.1.69')throw Error('Content block source version mismatch');
  function read(id){const row=receipt.modules[id],source=fs.readFileSync(path.join(sourceRoot,row.filename),'utf8');if(sha(source)!==row.formattedSha256)throw Error('Private content source changed: '+id);return source;}
  const staged=[],extras={};
  function stage(id,source,{complete=false,extra=false}={}){
    const file=path.join(root,'source-modules',`module-${id}.cjs`),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
    if(ts.createSourceFile(file,source,99,true).parseDiagnostics.length)throw Error('Content port syntax: '+id);
    if(complete&&before!==source&&before!==null&&sha(before)!==baseline[id]&&before!==read(id))throw Error('Refuse to overwrite locally changed native component '+id);
    staged.push({id,file,before,source});if(extra)extras[id]={file:`source-modules/module-${id}.cjs`,sha256:sha(source),referenceFactorySha256:receipt.modules[id]?.factorySha256||receipt.modules[28988].factorySha256};
  }
  function replaceOnce(source,anchor,next){if(source.includes(next))return source;if(source.split(anchor).length!==2)throw Error('Content binding anchor changed: '+anchor.slice(0,90));return source.replace(anchor,next);}
  for(const id of [75098,27283,71560,18043,97287,48718])stage(id,read(id),{complete:true});
  // Verified native defect: both Lexical versions preserve a contained INPUT's
  // DOM focus. Relinquish that input before the existing Enter selection handoff.
  // Keep the original isComposing exclusion and the complete native handler.
  const calloutNode=replaceOnce(read(80944),'n.preventDefault(), e.update(() => {','n.preventDefault(), o.blur(), e.update(() => {');stage(80944,calloutNode,{complete:true});
  // Namespace the new panel type: original panel "tab" collides with Lexical's
  // existing literal TabNode. Existing notes must keep their exact tab nodes.
  let panels=read(94595);panels=replaceOnce(panels,'static getType() { return "tab"; }','static getType() { return "inkbridge-tab-panel"; }');
  panels=replaceOnce(panels,'type: "tab", version: 1','type: "inkbridge-tab-panel", version: 1');stage(94595,panels,{extra:true});
  let parser=read(55927);parser=replaceOnce(parser,'(null == e ? void 0 : e.type) === "tab"','(null == e ? void 0 : e.type) === "inkbridge-tab-panel"');stage(55927,parser,{complete:true});
  for(const id of [7957,95128])stage(id,read(id),{extra:true});
  const editorSource=read(28988),callout=require('./extract-callout-port.cjs')({editorSource,ts}),tabs=require('./extract-tabs-port.cjs')({editorSource,ts});
  stage(16900001,'// Generated complete native Callout plugin/option\nmodule.exports = '+callout.factory+';\n',{extra:true});
  stage(16900002,'// Generated complete native Tabs plugin/option\nmodule.exports = '+tabs.factory+';\n',{extra:true});
  let registry=fs.readFileSync(path.join(root,'source-modules/module-80636.cjs'),'utf8');
  registry=replaceOnce(registry,'O, F.OS];','O, F.OS, n(94595).L$, n(94595).Fe];');stage(80636,registry);
  let editor=fs.readFileSync(path.join(root,'source-modules/module-73866.cjs'),'utf8');
  if(!editor.includes('inkbridgeContentTabs')){
    editor=replaceOnce(editor,'    "use strict";','    "use strict";\n    const inkbridgeContentCallout=l(16900001), inkbridgeContentTabs=l(16900002); inkbridgeContentTabs.bindBlockLink(node=>{const id=nZ(node);nW(node,true);return id;});');
    const ast=ts.createSourceFile('editor.js',editor,99,true),edits=[];let options;
    function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='np')options=n;ts.forEachChild(n,visit);}visit(ast);if(!options)throw Error('Native shared insertion builder missing');
    function find(n){if(ts.isNewExpression(n)&&n.expression.getText(ast)==='nh'&&ts.isStringLiteral(n.arguments?.[0])){
      if(n.arguments[0].text==='Quote')edits.push({start:n.end,end:n.end,text:', inkbridgeContentCallout.createOption(e,l,nh)'});
      if(n.arguments[0].text==='Columns Layout')edits.push({start:n.getStart(ast),end:n.getStart(ast),text:'inkbridgeContentTabs.createOption(e,l,nh), '});
    }ts.forEachChild(n,find);}find(options);if(edits.length!==2)throw Error('Native insertion layout anchors changed');
    for(const edit of edits.sort((a,b)=>b.start-a.start))editor=editor.slice(0,edit.start)+edit.text+editor.slice(edit.end);
    editor=replaceOnce(editor,'(0, a.jsx)(ti, {}), (0, a.jsx)(l_, {})','(0, a.jsx)(ti, {}), (0, a.jsx)(inkbridgeContentTabs.Plugin, {cardId:S,cardType:X}), (0, a.jsx)(l_, {}), (0, a.jsx)(inkbridgeContentCallout.Plugin, {})');
  }
  stage(73866,editor);
  // Preflight every change before touching any recovered component.
  for(const row of staged){if(row.before!==row.source){if(row.before!==null&&!fs.existsSync(row.file+'.before-content-blocks'))fs.writeFileSync(row.file+'.before-content-blocks',row.before);fs.writeFileSync(row.file,row.source);}changes.push({id:row.id,description:'Complete native Tabs / Callout content integration',beforeSha256:row.before===null?null:sha(row.before),afterSha256:sha(row.source)});}
  fs.writeFileSync(path.join(root,'content-block-modules.json'),JSON.stringify(extras,null,2));
  const assets=path.join(root,'vendor/app/_next/static');fs.mkdirSync(path.join(assets,'css'),{recursive:true});
  fs.copyFileSync(path.join(sourceRoot,'content-blocks.css'),path.join(assets,'css/inkbridge-content-blocks.css'));
  fs.copyFileSync(path.join(sourceRoot,'locales.json'),path.join(assets,'inkbridge-content-block-locales.json'));
};
