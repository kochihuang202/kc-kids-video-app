const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../private-original-editor/source-modules');

// Exercise the complete recovered Flow component's public callback contract.
// Hook/JSX doubles isolate scheduling; real Lexical/SQLite are tested separately.
function flowHarness(){
  let slots=[],cursor=0,now=1000,timers=new Map(),serial=0,exported;
  const react={useRef(value){const i=cursor++;return slots[i]??=( {current:value});},
    useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(){},useLayoutEffect(){}};
  const modules={24246:{jsx:(type,props)=>({type,props})},27378:react,2726:{F:()=>({resolvedTheme:'light'})},51245:{ZP:'Editor'},80109:{M:{Provider:'FontProvider'}},65857:{K5:()=>['Noto Sans'],fy:()=> 'Noto Sans'}};
  const req=id=>{assert(id in modules,'unexpected Flow dependency '+id);return modules[id];};req.d=(target,defs)=>{for(const [key,get]of Object.entries(defs))Object.defineProperty(target,key,{get});};
  const context={module:{exports:null},Date:{now:()=>now},setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'module-34883.cjs'),'utf8'),context);
  const target={};context.module.exports({},target,req);exported=target.R;
  return {render(props){cursor=0;const outer=exported({initialContent:'initial',nodeId:'topic',onCancel(){},...props});return outer.props.children.props.children.props;},advance(ms){now+=ms;},drain(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}},get pending(){return timers.size;}};
}
test('mindmap forwards every accepted content change without a trailing Flow timer',()=>{
  const h=flowHarness(),saved=[],p=h.render({nodeType:'MindmapNode',onSave:(value,id)=>saved.push([value,id])});
  p.onChange('first');h.advance(10);p.onChange('latest');
  assert.deepEqual(saved,[['first','topic'],['latest','topic']]);assert.equal(h.pending,0);
});
test('normal card retains throttling, latest trailing value and disabled guard',()=>{
  const h=flowHarness(),saved=[],props={nodeType:'NoteCard',onSave:v=>saved.push(v)};
  let p=h.render(props);p.onChange('first');h.advance(10);p.onChange('second');h.advance(10);p.onChange('latest');
  assert.deepEqual(saved,['first']);assert.equal(h.pending,1);h.drain();assert.deepEqual(saved,['first','latest']);
  p=h.render({...props,disabled:true});p.onChange('forbidden');assert.deepEqual(saved,['first','latest']);
});
test('Flow switches callback policy when node type changes without a remount',()=>{
  const h=flowHarness(),saved=[],props={onSave:v=>saved.push(v)};
  let p=h.render({...props,nodeType:'NoteCard'});p.onChange('card');h.advance(10);
  p=h.render({...props,nodeType:'MindmapNode'});p.onChange('map');assert.deepEqual(saved,['card','map']);assert.equal(h.pending,0);
});

function cleanupHarness(failAt){
  const source=fs.readFileSync(path.join(root,'module-10764.cjs'),'utf8'),ast=ts.createSourceFile('canvas.js',source,99,true);let candidates=[];
  function visit(n){if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.getText(ast).includes('setEditingNode(null)')&&n.body.getText(ast).includes('connectionRenderer.delete()')&&n.body.getText(ast).length<7000)candidates.push(n);ts.forEachChild(n,visit);}visit(ast);
  candidates=candidates.filter(n=>!candidates.some(child=>child!==n&&child.pos>n.pos&&child.end<n.end));
  assert.equal(candidates.length,1,'must find exactly the native Canvas cleanup');const text=candidates[0].getText(ast),called=[],warnings=[];
  const context={e:false,nw:{current:1},nx:{current:0},ny:{current:false},nb:{current:'surface'},nv:{current:'canvas'},console:{warn:(...args)=>warnings.push(args)},clearTimeout(){called.push('timer');},t(){called.push('host');}};
  const call=(label)=>()=>{called.push(label);if(label===failAt)throw Error('injected '+label);};
  function bind(expression,fn){const names=expression.split('.');let target=context;for(const key of names.slice(0,-1))target=target[key]??={};target[names.at(-1)]=fn;}
  for(const m of text.matchAll(/\b([\w]+(?:\.[\w]+)*\.(?:delete|clear))\(\)/g))bind(m[1],call(m[1]));
  // Retain the native state/surface teardown after the sixteen owned releases.
  const store=/([\w]+)\.gt\.getState\(\)/.exec(text)[1];context[store]??={};context[store].gt={getState:()=>({setEditingNode:call('editing'),setCanvasKit:call('store')})};
  for(const m of text.matchAll(/\(0, ([\w]+)\.([\w]+)\)\((nb\.current|null)\)/g))bind(m[1]+'.'+m[2],call(m[3]==='nb.current'?'surface':'global'));
  vm.runInNewContext('('+text+')()',context);
  return {called,warnings,context};
}
test('native Canvas cleanup continues after an owned WASM resource release throws',()=>{
  const result=cleanupHarness('G.delete');
  assert.equal(result.warnings.length,1);assert(result.called.includes('nc.l.delete'));assert(result.called.includes('C.L.clear'));
  assert(result.called.includes('surface'));assert(result.called.includes('store'));assert(result.called.includes('host'));
  assert.equal(result.context.nb.current,null);assert.equal(result.context.nv.current,null);
});
test('normal native Canvas cleanup releases each resource once in its original order',()=>{
  const {called,warnings}=cleanupHarness();assert.equal(warnings.length,0);
  const releases=called.filter(name=>/\.(delete|clear)$/.test(name));assert.equal(releases.length,16);assert.equal(new Set(releases).size,16);
  assert.equal(called.at(-1),'host');assert(called.indexOf('surface')>called.indexOf('C.L.clear'));
});
test('backport rebuild is idempotent and rejects another source identity',()=>{
  const os=require('node:os'),base=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-editor169-patch-')),sources=path.join(base,'source-modules');fs.mkdirSync(sources);
  const patch=require('../scripts/original-reuse/apply-editor-169-patches.cjs');
  try{
    for(const id of [34883,10764])fs.copyFileSync(path.join(root,`module-${id}.cjs.before-editor-169`),path.join(sources,`module-${id}.cjs`));
    const first=[];patch({root:base,changes:first});assert(first.every(c=>c.beforeSha256!==c.afterSha256));
    const second=[];patch({root:base,changes:second});assert(second.every(c=>c.beforeSha256===c.afterSha256));
    const file=path.join(sources,'module-34883.cjs');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('original factory SHA-256','unexpected factory SHA-256'));
    assert.throws(()=>patch({root:base,changes:[]}),/source identity changed/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
