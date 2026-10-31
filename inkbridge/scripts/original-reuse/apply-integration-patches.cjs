// Minimal, reversible visibility/callback patches; no editor/draw logic replaced.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../private-original-editor'),hash=value=>crypto.createHash('sha256').update(value).digest('hex'),changes=[];
function patch(id,anchor,replacement,description){
  const file=path.join(root,'source-modules',`module-${id}.cjs`),source=fs.readFileSync(file,'utf8');
  if(source.includes(replacement)){changes.push({id,description,status:'already applied',afterSha256:hash(source)});return;}
  if(source.split(anchor).length!==2)throw Error('Original integration anchor is not unique: '+id);
  const after=source.replace(anchor,replacement),backup=file+'.before-inkbridge';if(!fs.existsSync(backup))fs.writeFileSync(backup,source);
  fs.writeFileSync(file,after);changes.push({id,description,beforeSha256:hash(source),afterSha256:hash(after)});
}
patch('64744','default: function () { return oI; }','InkBridgeCanvasHostProvider: function () { return ov; }, default: function () { return oI; }','Expose the existing complete CanvasKit host provider');
patch('34883','id: u, onBlur: J, editorBlocks: n','id: u, onEditorReady: e.onEditorReady, onBlur: J, editorBlocks: n','Pass an existing optional Editor callback through the original flow wrapper');
patch('58850','let p = (e, t) => (0, o.d)()', 'let p = (e, t) => globalThis.__inkbridgeServices?.has(e) ? globalThis.__inkbridgeServices.call(e, t) : (0, o.d)()', 'Delegate explicitly supported original service calls to the real InkBridge data boundary');
patch('23733','Tabbar: function () { return e5; }','InkBridgeHistoryTabs: function () { return eR; }, Tabbar: function () { return e5; }','Expose the complete original history-tab strip without substituting its logic');
patch('41','n: function () { return iV; }','InkBridgeFlowOutline: function () { return nk; }, n: function () { return iV; }','Expose the complete original flow card-list/search component');
patch('64744','InkBridgeCanvasHostProvider: function () { return ov; },','InkBridgeCreateWhiteboard: function () { return rb; }, InkBridgeCanvasHostProvider: function () { return ov; },','Expose the complete original whiteboard creation dialog');
patch('36339','"flexnote://".concat(r.YH.spaceId','"inkbridge://".concat(r.YH.spaceId','Use the InkBridge scheme in the original link formatter; no OS registration changed');
patch('64744','InkBridgeCreateWhiteboard: function () { return rb; },','InkBridgeCreateFolder: function () { return rw; }, InkBridgeCreateWhiteboard: function () { return rb; },','Expose the existing complete original folder dialog');
patch('48626','CANVASKIT_FOCUS_NODE_EVENT: function () { return iR; },','InkBridgeCreationToolbar: function () { return nZ; }, InkBridgeBoardCaption: function () { return n0; }, InkBridgeUndoControls: function () { return iS; }, CANVASKIT_FOCUS_NODE_EVENT: function () { return iR; },','Expose original creation, caption and undo UI; host gates unconnected actions');
// Reuse the original navigation JSX intact without mounting its account,
// updater, cloud-sync and import lifecycle, explicitly excluded by the user.
const ts=require('typescript'),navigationFile=path.join(root,'source-modules/module-78507.cjs'),navigationSource=fs.readFileSync(navigationFile,'utf8'),navigationAst=ts.createSourceFile('78507.cjs',navigationSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let navigationCall;
function findNavigation(node){if(ts.isVariableDeclaration(node)&&node.name.getText(navigationAst)==='aE'){function visit(child){if(ts.isCallExpression(child)&&child.arguments[0]?.getText(navigationAst)==='m.n'&&child.getText(navigationAst).includes('eK.map'))navigationCall=child.getText(navigationAst);ts.forEachChild(child,visit);}visit(node.initializer);}else ts.forEachChild(node,findNavigation);}findNavigation(navigationAst);
if(!navigationCall)throw Error('Original sidebar navigation JSX not found');
const navigationUi=navigationCall.replace('return (0, a.jsx)(b.r, { title:', 'return (0, a.jsx)(b.r, { isDisabled: e.key !== "board", title:');
if(navigationUi===navigationCall)throw Error('Native navigation item gate anchor missing');
patch('78507','Tj: function () { return aE; },','InkBridgeSidebarNavigation: function () { return inkbridgeSidebarNavigation; }, Tj: function () { return aE; },','Expose original navigation UI separately from excluded account and cloud lifecycle');
const oldNavigation='    "use strict";\n    function inkbridgeSidebarNavigation({onNavigate}) { const {t:A}=(0,y.$G)("common"), n=(0,w.v9)(e=>e.ui.isPageMenuHorizontal), Q="board", eK=aN(A), z=onNavigate; return '+navigationUi+'; }';
const newNavigation='    "use strict";\n    function inkbridgeSidebarNavigation({onNavigate,horizontal,keys,enabledKeys=["board"]}) { const {t:A}=(0,y.$G)("common"), savedHorizontal=(0,w.v9)(e=>e.ui.isPageMenuHorizontal), n=horizontal ?? savedHorizontal, Q=horizontal ? "" : "board", eK=aN(A).filter(e=>!keys || keys.includes(e.key)), z=onNavigate; return '+navigationUi.replace('isDisabled: e.key !== "board"','isDisabled: !enabledKeys.includes(e.key)')+'; }';
if(fs.readFileSync(navigationFile,'utf8').includes(oldNavigation))patch('78507',oldNavigation,newNavigation,'Allow the same native navigation UI in compact header placement');else patch('78507','    "use strict";',newNavigation,'Reuse native navigation JSX in sidebar/header; pending routes disabled');
const flowSource=fs.readFileSync(path.join(root,'source-modules/module-48626.cjs'),'utf8'),flowAst=ts.createSourceFile('48626.cjs',flowSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let toolbarChildren;
function findToolbar(node){if(ts.isVariableDeclaration(node)&&node.name.getText(flowAst)==='nZ'&&node.initializer?.getText(flowAst).startsWith('(0, r.memo)')){const callback=node.initializer.arguments[0],ret=callback.body.statements.filter(ts.isReturnStatement).at(-1);let children=ret.expression.arguments[1].properties.find(p=>p.name?.getText(flowAst)==='children').initializer;if(ts.isConditionalExpression(children))children=children.whenFalse;toolbarChildren=children;}else ts.forEachChild(node,findToolbar);}findToolbar(flowAst);
if(!toolbarChildren||!ts.isArrayLiteralExpression(toolbarChildren))throw Error('Original creation toolbar children not found');
const fullToolbar=toolbarChildren.getText(flowAst),toolbarOnly='['+toolbarChildren.elements.slice(0,2).map(n=>n.getText(flowAst)).join(',')+']';
patch('48626','nZ = (0, r.memo)(() =>','nZ = (0, r.memo)(({inkbridgeUiOnly=false}={}) =>','Add explicit UI-only composition mode for the original toolbar');
patch('48626',fullToolbar,'inkbridgeUiOnly ? '+toolbarOnly+' : '+fullToolbar,'UI-only mode retains native toolbar panels without mounting unconnected PDF/web/file import dialogs');
fs.writeFileSync(path.join(root,'integration-patches.json'),JSON.stringify(changes,null,2));console.log(JSON.stringify(changes));
