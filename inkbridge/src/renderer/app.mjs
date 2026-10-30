import {CanvasEngine} from '../core/canvas-engine.mjs';
import {createScene} from '../core/model.mjs';
import {zoomAt,screenToWorld} from '../core/geometry.mjs';
import {runBenchmark} from '../core/benchmark.mjs';
import {acceptanceLab} from '../core/acceptance-lab.mjs';
const $=selector=>document.querySelector(selector);
let engine,report,addPoint=null,lastStatus=0;
function update(snapshot){
  const now=performance.now();if(now-lastStatus<80&&!engine?.benchmarking)return;lastStatus=now;
  const {stats,view}=snapshot;$('#card-count').textContent=stats.total;$('#sidebar-count').textContent=stats.total;
  $('#visible-count').textContent=stats.visible;$('#lod').textContent=stats.lod;$('#zoom-reset').textContent=`${Math.round(view.zoom*100)}%`;
  $('#render-stat').textContent=`${stats.cpuMs.toFixed(2)} ms CPU＋提交 · ${stats.cacheSize} pictures`;
  const item=snapshot.instances.find(i=>i.id===snapshot.selectedId),content=item&&snapshot.contents.find(c=>c.id===item.contentId);
  const inspector=$('#inspector');inspector.replaceChildren();
  if(item){const title=document.createElement('strong');title.textContent=content.title;inspector.append(title,document.createTextNode(`X ${Math.round(item.x)}　Y ${Math.round(item.y)}`));}
  else inspector.textContent='選取卡片，查看位置。';
}
async function initialize(){
  const info=await window.inkbridge.info();
  const K=await window.CanvasKitInit({locateFile:file=>`inkbridge://app/vendor/${file}`});
  const font=await fetch('inkbridge://app/fonts/ui').then(response=>{if(!response.ok)throw Error('無法載入系統字型');return response.arrayBuffer();});
  const manager=K.FontMgr.FromData(font);if(!manager||!manager.countFamilies())throw Error('CanvasKit 無法解析系統字型');
  engine=new CanvasEngine(K,$('#board'),manager,update);engine.draw();$('#loading').hidden=true;
  $('#add-card').addEventListener('click',()=>openCard());
  $('#board').addEventListener('dblclick',event=>{if(!engine.benchmarking&&!engine.model.hit(screenToWorld(engine.point(event),engine.view)))openCard(screenToWorld(engine.point(event),engine.view));});
  $('#cancel-card').addEventListener('click',()=>$('#new-card-dialog').close());
  $('#new-card-form').addEventListener('submit',event=>{event.preventDefault();engine.addCard($('#card-title').value.trim()||'新卡片',$('#card-body').value,addPoint);$('#new-card-dialog').close();});
  for(const tool of ['select','pan'])$(`#${tool}-tool`).addEventListener('click',()=>{engine.setTool(tool);for(const id of ['select','pan'])$(`#${id}-tool`).classList.toggle('active',id===tool);});
  $('#fit').addEventListener('click',()=>engine.fit());
  for(const [id,factor]of [['zoom-out',1/1.2],['zoom-in',1.2],['zoom-reset',null]])$(`#${id}`).addEventListener('click',()=>{
    engine.view=zoomAt(engine.view,{x:engine.width/2,y:engine.height/2},factor?engine.view.zoom*factor:1);engine.invalidate();
  });
  for(const button of document.querySelectorAll('[data-scene]'))button.addEventListener('click',()=>{engine.setScene(createScene(Number(button.dataset.scene)));engine.view={x:70,y:100,zoom:1};engine.invalidate();});
  $('#benchmark').addEventListener('click',async()=>{
    for(const button of document.querySelectorAll('button'))button.disabled=true;
    try{report=await runBenchmark(engine,({count,scale,action})=>{$('#benchmark-status').textContent=`${count} 張 · ${Math.round(scale*100)}% · ${action}`;});
      $('#benchmark-status').textContent=`完成 ${report.results.length} 組測試；可匯出逐組 frame time、p95 與記憶體。`;$('#download-report').hidden=false;
    }catch(error){$('#benchmark-status').textContent=`測試失敗：${error.message}`;}
    finally{for(const button of document.querySelectorAll('button'))button.disabled=false;}
  });
  $('#download-report').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='inkbridge-benchmark.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  if(info.isTest)window.__inkbridgeTest={inspect:()=>engine.inspect(),runBenchmark:(samples)=>runBenchmark(engine,()=>{},samples),lab:options=>acceptanceLab(engine,options),
    resources:()=>engine.resourceState(),dispose:()=>engine.dispose(),setDefer:enabled=>{engine.deferPictures=enabled;},
    probeFailure:()=>{const item=engine.model.instances.values().next().value,content=engine.model.contents.get(item.contentId),before=engine.resourceState(),policy=engine.deferPictures;content.revision++;engine.failNextLayout=true;engine.deferPictures=false;let error;
      try{engine.picture(item,'high');}catch(e){error=e.message;}finally{content.revision--;engine.failNextLayout=false;engine.deferPictures=policy;}
      return {before,after:engine.resourceState(),error};},getReport:()=>report,info,ready:true};
  window.addEventListener('beforeunload',()=>engine.dispose(),{once:true});
}
function openCard(point=null){addPoint=point;$('#new-card-form').reset();$('#new-card-dialog').showModal();$('#card-title').focus();}
initialize().catch(error=>{$('#loading').textContent=`白板無法啟動\n${error.message}`;window.__inkbridgeFailure=error.stack;console.error(error);});
