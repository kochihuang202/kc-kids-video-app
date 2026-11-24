// Static selected-factory preparation; original code remains private and is never executed here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript'),asar=require('@electron/asar');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const artifactSha256='55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b';
const root=path.resolve(__dirname,'../../private-original-editor');
const defaultSeeds=['23997','55411','37055','72930','42142'];
function prepareDiaryTodos(archive,{folder='diary-todo-source',seeds=defaultSeeds}={}){
 if(!['diary-todo-source','tag-source'].includes(folder))throw Error('Unreviewed source folder');
 const out=path.join(root,folder);
 if(hash(fs.readFileSync(archive))!==artifactSha256)throw Error('Diary/todo artifact identity differs; inspect the new version before preparing');
 const read=name=>asar.extractFile(archive,name.split('/').join(path.sep));
 if(JSON.parse(read('package.json')).version!=='1.1.70')throw Error('Expected FlexNote 1.1.70');
 const members=asar.listPackage(archive).map(name=>name.replaceAll('\\','/').replace(/^\//,'')),sources=members.filter(name=>name.startsWith('app/_next/static/chunks/')&&name.endsWith('.js'));
 sources.sort((a,b)=>(/pages\/_app-/.test(a)?0:1)-(/pages\/_app-/.test(b)?0:1)||a.localeCompare(b));
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'modules.json'),'utf8')).modules,queue=[...seeds],records={},textCache=new Map(),parsed=new Map(),printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
 function locate(id){
  for(const member of sources){let source=textCache.get(member);if(source===undefined){source=read(member).toString('utf8');textCache.set(member,source);}if(!new RegExp('(?:[,{}])'+id+':').test(source))continue;
   let map=parsed.get(member);if(!map){const ast=ts.createSourceFile(member,source,99,true);if(ast.parseDiagnostics.length)throw Error('Invalid source syntax: '+member);map=new Map();function visit(node){if(ts.isPropertyAssignment(node)&&/^\d+$/.test(node.name.getText(ast))&&(ts.isFunctionExpression(node.initializer)||ts.isArrowFunction(node.initializer))){map.set(node.name.getText(ast),{factory:node.initializer,ast});return;}ts.forEachChild(node,visit);}visit(ast);parsed.set(member,map);}
   const entry=map.get(id);if(entry)return {...entry,member,source};
  }throw Error('Missing diary/todo dependency '+id);
 }
 fs.mkdirSync(out,{recursive:true});const previous=fs.existsSync(path.join(out,'receipt.json'))?JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8')):null;
 while(queue.length){const id=queue.shift();if(records[id])continue;const {factory,ast,member,source}=locate(id),name=factory.parameters[2]?.name.getText(ast),deps=new Set();function dep(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===name&&node.arguments.length===1&&ts.isNumericLiteral(node.arguments[0]))deps.add(String(Number(node.arguments[0].getText(ast))));ts.forEachChild(node,dep);}dep(factory.body);
  const raw=factory.getText(ast),formatted='// Original FlexNote 1.1.70 factory '+id+' SHA-256 '+hash(raw)+'\nmodule.exports = '+printer.printNode(ts.EmitHint.Expression,factory,ast)+';\n',filename=`module-${id}.cjs`,target=path.join(out,filename);
  // Preparation is idempotent and never silently discards a reviewed private integration patch.
  if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==hash(formatted)&&previous?.modules[id]?.formattedSha256!==hash(formatted))throw Error('Unrecognized modified diary/todo factory '+id);
  if(!fs.existsSync(target))fs.writeFileSync(target,formatted);
  const chunkIds=[];function chunks(node){if(ts.isCallExpression(node)&&node.expression.getText(ast).includes('webpackChunk_N_E')&&node.arguments[0]&&ts.isArrayLiteralExpression(node.arguments[0])&&node.pos<=factory.pos&&node.end>=factory.end){const ids=node.arguments[0].elements[0];if(ts.isArrayLiteralExpression(ids))for(const value of ids.elements)if(ts.isNumericLiteral(value))chunkIds.push(Number(value.text));}ts.forEachChild(node,chunks);}chunks(ast);
  records[id]={filename,member,sourceSha256:hash(source),factorySha256:hash(raw),formattedSha256:hash(formatted),requires:[...deps],chunkIds};
  for(const next of deps)if((!baseline[next]||baseline[next].editableSource?.startsWith(folder+'/'))&&!records[next])queue.push(next);
 }
 const receipt={version:'1.1.70',artifactSha256,seeds,modules:records,execution:'inert syntax only; original bootstrap withheld',dependencyPolicy:'Selected complete parent factories plus dependencies absent from the existing private registry. Shared dependencies require explicit compatibility review before replacement.'};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));return {out,modules:Object.keys(records),sourceFiles:parsed.size};
}
if(require.main===module){try{console.log(JSON.stringify(prepareDiaryTodos(process.argv[2]||path.join(process.env.LOCALAPPDATA,'Programs/flexnote/resources/app.asar'))));}catch(error){console.error(error);process.exitCode=1;}}
module.exports={prepareDiaryTodos};
