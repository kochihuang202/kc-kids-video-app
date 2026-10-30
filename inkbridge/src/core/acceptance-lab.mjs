import {createScene} from './model.mjs';
import {zoomAt} from './geometry.mjs';
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export function distribution(values){const sorted=[...values].sort((a,b)=>a-b);const at=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];return {samples:sorted.length,min:sorted[0],median:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)};}
export async function acceptanceLab(engine,{samples=90,counts=[100,300,500],scales=[.2,.5,1],sizes=['uniform'],actions=['pan','zoom','select','drag']}={}){
  const saved={model:engine.model,view:{...engine.view},selectedId:engine.selectedId};
  const report={time:new Date().toISOString(),kind:'real Electron RAF + instrumented draw; not GPU completion',results:[]};
  const runtime=await window.inkbridge.info();report.hardware=runtime.hardware;report.webgl=engine.webgl;
  engine.benchmarking=true;if(engine.frame){cancelAnimationFrame(engine.frame);engine.frame=0;}
  try{
    for(const count of counts)for(const size of sizes)for(const scale of scales){
      const model=createScene(count);
      if(size==='varied')for(const [n,item]of [...model.instances.values()].entries()){
        Object.assign(item,{width:n%7===0?850:160+(n%4)*80,height:n%7===0?600:120+(n%3)*60});model.index.upsert(item);
      }
      if(size==='dense')for(const [n,item]of [...model.instances.values()].entries()){
        Object.assign(item,{x:(n%20)*120,y:Math.floor(n/20)*90});model.index.upsert(item);
      }
      engine.setScene(model);engine.view={x:60,y:80,zoom:scale};
      for(let n=0;n<15;n++){await frame();engine.draw();}
      for(const action of actions){
        const cpu=[],interval=[],query=[],record=[],flush=[],paragraphs=[],misses=[];let last=await frame();
        const before=await window.inkbridge.info(),base={...engine.view},item=model.instances.get('instance-0'),initial={x:item.x,y:item.y};
        engine.beginInteraction?.(action);
        for(let n=0;n<samples;n++){
          const time=await frame();interval.push(time-last);last=time;const t=n/Math.max(samples-1,1);
          if(action==='pan')engine.view={...base,x:base.x+Math.sin(t*Math.PI*4)*650,y:base.y+Math.cos(t*Math.PI*4)*200};
          if(action==='zoom')engine.view=zoomAt(base,{x:engine.width/2,y:engine.height/2},scale*(1+Math.sin(t*Math.PI*4)*.28));
          if(action==='select')engine.selectedId=`instance-${n%count}`;
          if(action==='drag'){engine.selectedId=item.id;model.move(item.id,initial.x+t*300,initial.y+Math.sin(t*Math.PI*2)*100);}
          engine.draw();cpu.push(engine.stats.cpuMs);query.push(engine.stats.profile?.queryMs||0);record.push(engine.stats.profile?.recordMs||0);
          flush.push(engine.stats.profile?.flushMs||0);paragraphs.push(engine.stats.profile?.paragraphs||0);misses.push(engine.stats.profile?.misses||0);
        }
        engine.endInteraction?.();
        const settle=[];for(let n=0;n<15;n++){await frame();engine.draw();settle.push(engine.stats.cpuMs);}
        const after=await window.inkbridge.info();report.results.push({count,size,scale,action,cpu:distribution(cpu),frame:distribution(interval),
          query:distribution(query),record:distribution(record),flush:distribution(flush),paragraphs:paragraphs.reduce((a,b)=>a+b,0),misses:misses.reduce((a,b)=>a+b,0),
          settle:distribution(settle),fps:1000/(interval.reduce((a,b)=>a+b,0)/interval.length),memory:after.memory,cpuUsage:after.cpu,
          memoryBefore:before.memory,visible:engine.stats.visible,cacheSize:engine.cache.size,raw:{cpu,interval,query,record,flush,paragraphs,misses}});
        engine.view=base;model.move(item.id,initial.x,initial.y);
      }
    }
    return report;
  }finally{engine.setScene(saved.model);engine.view=saved.view;engine.selectedId=saved.selectedId;engine.benchmarking=false;engine.invalidate();}
}
