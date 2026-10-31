// Extract original webpack factories as complete functions, retaining hashes.
// No target factory or bootstrap is evaluated by this preparation step.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript');
const root=path.resolve(__dirname,'../../private-original-editor'),vendor=path.join(root,'vendor/app/_next/static/chunks');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(file.endsWith('.js'))files.push(file);}}walk(vendor);
const priority=file=>/pages[\\/]_app-/.test(file)?0:/framework-/.test(file)?1:/[\\/]main-/.test(file)?2:/[\\/]95422\./.test(file)?3:4;
files.sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b));
const modules=new Map(),chunks=[],conflicts=[];
for(const file of files){
  if(path.basename(file).startsWith('webpack-'))continue;
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(ast.parseDiagnostics.length)throw Error('Parse diagnostics: '+file);
  function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='push'&&node.expression.expression.getText(ast).includes('webpackChunk_N_E')){
      const argument=node.arguments[0];if(!argument||!ts.isArrayLiteralExpression(argument))return;
      const ids=argument.elements[0],map=argument.elements[1];if(!ids||!map||!ts.isArrayLiteralExpression(ids)||!ts.isObjectLiteralExpression(map))return;
      const chunkIds=ids.elements.map(id=>Number(id.getText(ast))),found=[];
      for(const entry of map.properties){
        if(!ts.isPropertyAssignment(entry)||!/^\d+$/.test(entry.name.text||'')||!ts.isFunctionExpression(entry.initializer)&&!ts.isArrowFunction(entry.initializer))throw Error('Nonstandard webpack factory');
        const id=entry.name.text,start=entry.initializer.getStart(ast),end=entry.initializer.end,factory=source.slice(start,end),hash=sha(factory);
        if(modules.has(id)&&modules.get(id).sha256!==hash){conflicts.push({id,file:path.relative(root,file),previous:modules.get(id).file});continue;}
        const requireName=entry.initializer.parameters[2]?.name.getText(ast),requires=new Set();
        function deps(child,shadowed=false){
          if(ts.isFunctionLike(child)&&(child.name?.getText(ast)===requireName||child.parameters.some(param=>param.name.getText(ast)===requireName)))shadowed=true;
          if(!shadowed&&ts.isCallExpression(child)&&ts.isIdentifier(child.expression)&&child.expression.text===requireName&&child.arguments.length===1&&ts.isNumericLiteral(child.arguments[0]))requires.add(child.arguments[0].text);
          ts.forEachChild(child,nested=>deps(nested,shadowed));
        }deps(entry.initializer.body);
        const record={id,file:path.relative(root,file).replaceAll('\\','/'),start,end,sha256:hash,bytes:Buffer.byteLength(factory),requires:[...requires],factory};modules.set(id,record);found.push(id);
      }
      chunks.push({file:path.relative(root,file).replaceAll('\\','/'),chunkIds,moduleIds:found,bootstrapWithheld:argument.elements.length>2});return;
    }
    ts.forEachChild(node,visit);
  }visit(ast);
}
const runtimeFile=files.find(file=>path.basename(file).startsWith('webpack-'));if(!runtimeFile)throw Error('No original webpack runtime');
const runtime=fs.readFileSync(runtimeFile,'utf8'),match=/([\w$]+)\.m=([\w$]+),/.exec(runtime);if(!match)throw Error('Runtime exposure anchor not found');
const exposed=runtime.replace(match[0],`globalThis.__originalRequire=${match[1]},${match[0]}`);
fs.writeFileSync(path.join(root,'runtime.js'),exposed);
const originalMap=Object.fromEntries([...modules].map(([id,record])=>[id,{...record,factory:undefined}]));
// Recover whole factories to readable, editable source files. Future builds
// consume these files, so local changes are not lost to extraction/repacking.
const sources=path.join(root,'source-modules');fs.mkdirSync(sources,{recursive:true});
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed,removeComments:false}),baselineFile=path.join(root,'source-baseline.json');
const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile,'utf8')):{};
for(const [id,record]of modules){
  const file=path.join(sources,`module-${id}.cjs`);
  if(!fs.existsSync(file)){
    const wrapper=ts.createSourceFile(id+'.js','module.exports = '+record.factory+';',ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const factory=wrapper.statements[0].expression.right;
    const readable='// Original webpack module '+id+'; original factory SHA-256 '+record.sha256+'\nmodule.exports = '+printer.printNode(ts.EmitHint.Expression,factory,wrapper)+';\n';
    fs.writeFileSync(file,readable);baseline[id]=sha(readable);
  }
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const statement=ast.statements[0],expression=statement?.expression;
  if(ast.parseDiagnostics.length||!expression||!ts.isBinaryExpression(expression)||expression.left.getText(ast)!=='module.exports'||!ts.isFunctionExpression(expression.right)&&!ts.isArrowFunction(expression.right))throw Error('Invalid editable original factory: '+file);
  record.factory=source.slice(expression.right.getStart(ast),expression.right.end);
  originalMap[id].editableSource=path.relative(root,file).replaceAll('\\','/');originalMap[id].editableSha256=sha(source);originalMap[id].locallyModified=baseline[id]!==sha(source);
}
fs.writeFileSync(baselineFile,JSON.stringify(baseline,null,2));
const registrations=[`self.webpackChunk_N_E.push([${JSON.stringify([...new Set(chunks.flatMap(chunk=>chunk.chunkIds))])},{${[...modules].map(([id,record])=>`${id}:${record.factory}`).join(',')}}]);`];
fs.writeFileSync(path.join(root,'register-original.js'),registrations.join('\n'));
fs.writeFileSync(path.join(root,'modules.json'),JSON.stringify({modules:originalMap,chunks,duplicateVariants:conflicts,selectionOrder:'original _app, framework, main, editor, remaining chunks; differing duplicate variants retained in source copy and listed here; equivalence not assumed',runtime:{file:path.relative(root,runtimeFile),originalSha256:sha(runtime),privateCopySha256:sha(exposed),change:'expose original require; no module logic changed'},note:'Original startup callbacks withheld; factories unchanged. Dynamic require edges and duplicate variants require runtime verification.'},null,2));
for(const seed of ['73866','55927','71560']){
  const visited=new Set(),missing=new Set();function follow(id){if(visited.has(id))return;visited.add(id);const module=modules.get(id);if(!module){missing.add(id);return;}for(const dep of module.requires)follow(dep);}follow(seed);
  console.log(JSON.stringify({seed,staticClosure:visited.size,missing:[...missing],bytes:[...visited].reduce((sum,id)=>sum+(modules.get(id)?.bytes||0),0)}));
}
console.log(JSON.stringify({modules:modules.size,chunks:chunks.length,privateRoot:root,withheldBootstrapCallbacks:chunks.filter(chunk=>chunk.bootstrapWithheld).length,duplicateVariants:conflicts.length}));
