import {createScene} from './model.mjs';
import {zoomAt} from './geometry.mjs';
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};};
export async function runBenchmark(engine,progress=()=>{},samples=60){
  const runtime=await window.inkbridge.info();
  const saved={model:engine.model,view:{...engine.view},selectedId:engine.selectedId};
  const results=[];engine.benchmarking=true;if(engine.frame){cancelAnimationFrame(engine.frame);engine.frame=0;}
  try{
    for(const count of [100,300,500])for(const scale of [.2,.5,1]){
      engine.setScene(createScene(count));engine.view={x:60,y:80,zoom:scale};
      for(let n=0;n<12;n++){await frame();engine.draw();}
      for(const action of ['pan','zoom','select','drag']){
        progress({count,scale,action});const cpu=[],interval=[];let last=await frame();const base={...engine.view};
        const item=engine.model.instances.get('instance-0'),initial={x:item.x,y:item.y};
        for(let n=0;n<samples;n++){
          const now=await frame();interval.push(now-last);last=now;const t=n/Math.max(samples-1,1);
          if(action==='pan')engine.view={...base,x:base.x+Math.sin(t*Math.PI*2)*260,y:base.y+Math.cos(t*Math.PI*2)*90};
          if(action==='zoom')engine.view=zoomAt(base,{x:engine.width/2,y:engine.height/2},scale*(1+Math.sin(t*Math.PI*2)*.2));
          if(action==='select')engine.selectedId=`instance-${n%count}`;
          if(action==='drag'){engine.selectedId=item.id;engine.model.move(item.id,initial.x+t*180,initial.y+Math.sin(t*Math.PI)*80);}
          engine.draw();cpu.push(engine.stats.cpuMs);
        }
        const memory=(await window.inkbridge.info()).memory;
        results.push({count,scale,action,viewport:{width:engine.width,height:engine.height,dpr:engine.dpr},
          cpuSubmitMs:summarize(cpu),frameIntervalMs:summarize(interval),observedFps:1000/(interval.reduce((a,b)=>a+b,0)/interval.length),
          framesOver33ms:interval.filter(x=>x>33.34).length,visible:engine.stats.visible,queried:engine.stats.queried,cacheSize:engine.cache.size,memory});
        engine.view=base;engine.model.move(item.id,initial.x,initial.y);
      }
    }
    return {product:'InkBridge',version:runtime.version,date:new Date().toISOString(),backend:engine.stats.backend,
      scene:'deterministic text and procedural vector cards; no imported image/PDF',sampleType:'requestAnimationFrame interval and CPU+submission; not GPU completion',
      environment:{hardware:runtime.hardware,gpuFeatures:runtime.gpu,gpuInfo:runtime.gpuInfo,webgl:engine.webgl,electron:runtime.versions.electron,chromium:runtime.versions.chrome,fontFamily:engine.family,memoryUnit:'KiB; Electron app metrics, not only JS heap'},results};
  }finally{engine.setScene(saved.model);engine.view=saved.view;engine.selectedId=saved.selectedId;engine.benchmarking=false;engine.invalidate();}
}
