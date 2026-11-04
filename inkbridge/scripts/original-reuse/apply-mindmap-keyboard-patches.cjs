const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
module.exports=function({root,changes}){
 const file=path.join(root,'source-modules/module-10764.cjs'),before=fs.readFileSync(file,'utf8');let after=before;
 if(!after.includes('globalThis.__inkbridgeMindmapNavigate')){
  const ast=ts.createSourceFile(file,after,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),matches=[];
  function visit(node){if(ts.isCallExpression(node)&&ts.isFunctionExpression(node.expression)&&node.expression.getText(ast).includes('let u = d.data.mindMapId'))matches.push(node);ts.forEachChild(node,visit);}visit(ast);
  if(matches.length!==1)throw Error('Native mindmap navigation anchor changed');
  const call=matches[0],text=call.getText(ast);
  after=after.slice(0,call.getStart(ast))+'(globalThis.__inkbridgeMindmapNavigate ? globalThis.__inkbridgeMindmapNavigate(i,r,s) : '+text+')'+after.slice(call.end);
 }
 const anchor='if (!(eN(_) || eN(T)';
 if(after.includes(anchor))after=after.replace(anchor,'if (!t.isComposing && t.keyCode !== 229 && !(eN(_) || eN(T)');
 const parsed=ts.createSourceFile(file,after,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(parsed.parseDiagnostics.length)throw Error('Mindmap keyboard patch syntax invalid');
 if(after!==before)fs.writeFileSync(file,after);
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 changes.push({id:'10764',description:'Use confirmed mindmap directional selection and preserve composing keyboard events',beforeSha256:hash(before),afterSha256:hash(after),status:after===before?'already applied':'applied'});
};
