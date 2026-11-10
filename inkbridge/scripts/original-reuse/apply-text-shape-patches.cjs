const fs=require('fs'),path=require('path'),ts=require('typescript'),crypto=require('crypto');
module.exports=({root,changes})=>{const file=path.join(root,'source-modules/module-48626.cjs'),before=fs.readFileSync(file,'utf8');let after=before;
if(!before.includes('data-inkbridge-tool": "text"')){const ast=ts.createSourceFile(file,before,99,true,ts.ScriptKind.JS),edits=[];
function visit(node){if(ts.isCallExpression(node)&&node.arguments[0]?.getText(ast)==='nK'){const props=node.arguments[1],key=props?.properties?.find(p=>p.name?.getText(ast)==='buttonId')?.initializer?.text;if(['text','shape'].includes(key))edits.push({start:node.getStart(ast),end:node.end,text:'(0,i.jsx)("span",{"data-inkbridge-tool": "'+key+'",children:'+node.getText(ast)+'})'});}ts.forEachChild(node,visit);}visit(ast);if(!edits.length)throw Error('Native text/shape tool anchors missing');for(const e of edits.sort((a,b)=>b.start-a.start))after=after.slice(0,e.start)+e.text+after.slice(e.end);}
if(!after.includes('"data-inkbridge-creation-options"'))after=after.replaceAll('className: nL, children:','className: nL, "data-inkbridge-creation-options": true, children:');
if(ts.createSourceFile(file,after,99,true,ts.ScriptKind.JS).parseDiagnostics.length)throw Error('Native tools patch syntax');
if(after!==before)fs.writeFileSync(file,after);const hash=s=>crypto.createHash('sha256').update(s).digest('hex');changes.push({id:'48626',description:'Expose complete native text and shape creation controls and menus',beforeSha256:hash(before),afterSha256:hash(after)});
};
