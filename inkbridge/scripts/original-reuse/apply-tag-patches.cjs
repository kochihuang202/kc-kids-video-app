// Keep the complete original tag page. Repair only descendant-search reachability.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
module.exports=({root,changes=[]})=>{
 const file=path.join(root,'tag-source/module-82138.cjs'),source=fs.readFileSync(file,'utf8');
 if(!source.includes('__inkbridgeFilterTagTree')){
 const ast=ts.createSourceFile(file,source,99,true);let body;
 function visit(node){if(ts.isArrowFunction(node)&&ts.isBlock(node.body)&&node.body.getText(ast).includes('if (!p.trim())')&&node.body.getText(ast).includes('tagGroups: m.map'))body=node.body;ts.forEachChild(node,visit);}
 visit(ast);if(!body)throw Error('Original tag search seam changed');
 fs.writeFileSync(file,source.slice(0,body.getStart(ast))+'{ return globalThis.__inkbridgeFilterTagTree(N,m,p); }'+source.slice(body.end));
 changes.push({id:'82138',description:'Preserve ancestors of matching descendant tags in the native search'});
 }
 // AI is explicitly outside this port's scope. Do not expose the native
 // auto-fill control whose account/server lifecycle is intentionally absent.
 const table=path.join(root,'tag-source/module-96414.cjs');if(!fs.existsSync(table))return;
 const input=fs.readFileSync(table,'utf8'),tree=ts.createSourceFile(table,input,99,true),edits=[];
 function ai(node){if(ts.isCallExpression(node)&&node.arguments[1]&&ts.isObjectLiteralExpression(node.arguments[1])){const content=node.arguments[1].properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)==='content');if(content?.initializer.getText(tree).includes('tagCollection.aiFillProps')){edits.push([node.getStart(tree),node.end]);return;}}ts.forEachChild(node,ai);}
 ai(tree);let output=input;for(const [start,end]of edits.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+'null /* inkbridgeNoTagAi */'+output.slice(end);if(edits.length)fs.writeFileSync(table,output);
};
if(require.main===module)module.exports({root:path.resolve(__dirname,'../../private-original-editor')});
