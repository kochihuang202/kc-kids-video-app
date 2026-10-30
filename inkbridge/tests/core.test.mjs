import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldToScreen,screenToWorld,zoomAt,visibleBounds,intersects,lodFor} from '../src/core/geometry.mjs';
import {SpatialIndex} from '../src/core/spatial-index.mjs';
import {BoardModel,createScene} from '../src/core/model.mjs';

test('drag and anchored zoom preserve world coordinates across negative positions and scales',()=>{
  for(const zoom of [.1,.3,1,2.5]){
    const view={x:217,y:-85,zoom}; const world={x:-1245,y:352};
    const point=worldToScreen(world,view); const actual=screenToWorld(point,view);
    assert.ok(Math.abs(actual.x-world.x)<1e-8 && Math.abs(actual.y-world.y)<1e-8);
    const changed=zoomAt(view,point,zoom*1.4);
    const anchored=screenToWorld(point,changed);
    assert.ok(Math.abs(anchored.x-world.x)<1e-8 && Math.abs(anchored.y-world.y)<1e-8);
  }
});
test('index updates exclude the old location and include a moved card once at negative cell boundaries',()=>{
  const index=new SpatialIndex(256);const card={id:'a',x:-256,y:-256,width:300,height:150};
  index.upsert(card);assert.deepEqual(index.query({x:-300,y:-300,width:700,height:700}),['a']);
  index.upsert({...card,x:5000});assert.equal(index.query({x:-300,y:-300,width:700,height:700}).length,0);
  assert.deepEqual(index.query({x:4999,y:-256,width:2,height:1}),['a']);
  index.remove('a');assert.equal(index.query({x:4999,y:-256,width:2,height:1}).length,0);
});
test('viewport query matches a brute-force oracle while dragging and zooming a 500-card scene',()=>{
  const model=createScene(500);
  for(let step=0;step<12;step++){
    const instance=model.instances.get('instance-0');model.move(instance.id,instance.x+31,instance.y-19);
    const bounds=visibleBounds({x:step*-290,y:step*25,zoom:.2+step*.1},1200,800,0);
    const expected=[...model.instances.values()].filter(x=>intersects(x,bounds)).map(x=>x.id).sort();
    assert.deepEqual(model.index.query(bounds).sort(),expected);
  }
});
test('shared content and independent board instances survive content updates and independent movement',()=>{
  const model=new BoardModel();const content=model.addContent({title:'Shared',body:'one'});
  const a=model.addInstance(content.id,0,0,'board-a');const b=model.addInstance(content.id,400,500,'board-b');
  model.updateContent(content.id,{body:'two'});model.move(a.id,12,20);
  assert.equal(model.contents.get(b.contentId).body,'two');assert.equal(b.x,400);assert.equal(b.y,500);
  assert.equal(model.contents.get(content.id).revision,2);
});
test('LOD depends on projected size and all four detail levels remain reachable',()=>{
  assert.deepEqual([.15,.3,.55,1].map(z=>lodFor(260,z)),['skeleton','low','medium','high']);
});
