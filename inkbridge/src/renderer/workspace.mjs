import {CanvasEngine} from '../core/canvas-engine.mjs';
import {createScene,modelFromGraph} from '../core/model.mjs';
import {zoomAt,screenToWorld} from '../core/geometry.mjs';
import {runBenchmark} from '../core/benchmark.mjs';
import {acceptanceLab} from '../core/acceptance-lab.mjs';
import {PersistenceCoordinator} from '../core/persistence-coordinator.mjs';
import {createRichEditor} from './vendor/editor.mjs';
import {InlineNoteEditor} from './inline-note-editor.mjs';
import {deriveTitle} from '../core/rich-document.mjs';

const $=selector=>document.querySelector(selector);
let engine,coordinator,documentModel,noteEditor=null,report,addPoint=null,lastStatus=0,closing=false,closingRequest=null,testAckDelay=0;
const contentData=content=>({id:content.id,title:content.title,body:content.body,document:content.document||null,kind:content.kind,tone:content.tone});
function stageContent(id){coordinator.stage({type:'putContent',data:contentData(documentModel.contents.get(id))});}
function stageView(){if(engine.model===documentModel)coordinator.stage({type:'putBoard',data:{id:documentModel.boardId,title:'靈感白板',view:{...engine.view}}});}
function showStatus(state){
  const element=$('#persistence-status');element.textContent=state.error?`未保存：${state.error}`:state.saving?'正在提交 SQLite…':state.dirty?'有待保存內容':`已保存 · v${state.revision}`;
  element.classList.toggle('save-error',!!state.error);
}
function showError(error){$('#persistence-status').textContent=`未保存：${error.message}`;$('#persistence-status').classList.add('save-error');}
function alignEditor(){noteEditor?.align();}
function update(snapshot){
  alignEditor();const now=performance.now();if(now-lastStatus<80&&!engine?.benchmarking)return;lastStatus=now;
  const {stats,view}=snapshot;$('#card-count').textContent=stats.total;$('#sidebar-count').textContent=stats.total;
  $('#visible-count').textContent=stats.visible;$('#lod').textContent=stats.lod;$('#zoom-reset').textContent=`${Math.round(view.zoom*100)}%`;
  $('#render-stat').textContent=`${stats.cpuMs.toFixed(2)} ms CPU＋提交 · ${stats.cacheSize} pictures`;
  const item=snapshot.instances.find(i=>i.id===snapshot.selectedId),content=item&&snapshot.contents.find(c=>c.id===item.contentId),inspector=$('#inspector');inspector.replaceChildren();
  if(item){const title=document.createElement('strong');title.textContent=content.title;inspector.append(title,document.createTextNode(`X ${Math.round(item.x)}　Y ${Math.round(item.y)}`));}
  else inspector.textContent='點擊文字卡片以編輯。';
}
async function flush(){
  if(noteEditor?.current?.controller.isComposing())$('#persistence-status').textContent='等待中文組字完成…';
  return coordinator.flush();
}
function closeEditor(){return noteEditor?.close();}
function setGeometry(item,height){if(item.height===height)return;item.height=height;documentModel.index.upsert(item);coordinator.stage({type:'putInstance',data:{...item}});engine.invalidate();}
function resizeTextCard(item,content){if(item&&content.kind!=='image')setGeometry(item,engine.measureNote(content,item.width).height);}
function changedEditor(contentId,value){
  const content=documentModel.contents.get(contentId),title=deriveTitle(value.document);
  if(content.title===title&&content.body===value.body&&JSON.stringify(content.document)===JSON.stringify(value.document))return;
  documentModel.updateContent(content.id,{title,body:value.body,document:value.document});stageContent(content.id);engine.invalidate();
}
async function openEditor(instanceId,point){if(!closing&&engine.model===documentModel)await noteEditor.open(instanceId,point);}
async function initialize(){
  const info=await window.inkbridge.info(),graph=await window.inkbridge.load();
  coordinator=new PersistenceCoordinator({revision:graph.revision,commit:async request=>{
    const result=await window.inkbridge.commit(request);if(!result.ok)throw Object.assign(new Error(result.error.message),result.error);
    if(info.isTest&&testAckDelay)await new Promise(resolve=>setTimeout(resolve,testAckDelay));return result.ack;
  },beforeFlush:async()=>{await noteEditor?.flush();},onStatus:showStatus});
  documentModel=modelFromGraph(graph);
  if(graph.revision===0&&!graph.contents.length){
    documentModel=createScene();documentModel.contents.get('content-5').body='獨立原始碼，獨立應用程式。\n資料保存到 InkBridge 自己的 SQLite。';
    for(const content of documentModel.contents.values())stageContent(content.id);
    for(const instance of documentModel.instances.values())coordinator.stage({type:'putInstance',data:{...instance}});
    await coordinator.flush();
  }
  const K=await window.CanvasKitInit({locateFile:file=>`inkbridge://app/vendor/${file}`});
  const [font,boldFont,emojiFont]=await Promise.all([
    fetch('inkbridge://app/fonts/ui').then(response=>{if(!response.ok)throw Error('無法載入系統字型');return response.arrayBuffer();}),
    fetch('inkbridge://app/fonts/bold').then(response=>response.ok?response.arrayBuffer():null).catch(()=>null),
    fetch('inkbridge://app/fonts/emoji').then(response=>response.ok?response.arrayBuffer():null).catch(()=>null)
  ]);
  const fontBuffers=[font];
  if(boldFont&&boldFont.byteLength>0)fontBuffers.push(boldFont);
  if(emojiFont&&emojiFont.byteLength>0)fontBuffers.push(emojiFont);
  const manager=K.FontMgr.FromData(...fontBuffers);if(!manager||!manager.countFamilies())throw Error('CanvasKit 無法解析系統字型');
  engine=new CanvasEngine(K,$('#board'),manager,update);engine.setScene(documentModel);engine.view=graph.boards[0]?.view||{x:70,y:100,zoom:1};
  document.documentElement.style.setProperty('--note-font',engine.fontFamilies.map(name=>JSON.stringify(name)).join(','));
  noteEditor=new InlineNoteEditor({host:$('#card-editor'),element:$('#rich-editor'),engine,model:documentModel,createEditor:createRichEditor,save:flush,
    change:changedEditor,geometry:setGeometry,onError:showError,onViewChange:stageView});
  for(const item of documentModel.instances.values())resizeTextCard(item,documentModel.contents.get(item.contentId));
  await coordinator.flush();engine.draw();$('#loading').hidden=true;
  engine.onEditRequest=(id,point)=>openEditor(id,point).catch(showError);
  engine.onMutation=change=>{
    if(engine.model!==documentModel||closing)return;
    if(change.kind==='move'||change.kind==='resize')coordinator.stage({type:'putInstance',data:{...documentModel.instances.get(change.id)}});
    if(change.kind==='delete')coordinator.stage({type:'deleteInstance',id:change.id});
    if(change.kind==='view')stageView();
  };
  $('#add-card').addEventListener('click',()=>openCard());
  $('#board').addEventListener('dblclick',event=>{if(!engine.benchmarking&&!engine.model.hit(screenToWorld(engine.point(event),engine.view)))openCard(screenToWorld(engine.point(event),engine.view));});
  $('#board').addEventListener('pointerdown',()=>{noteEditor.cancelPendingOpen();if(noteEditor.current)closeEditor().catch(showError);});
  $('#cancel-card').addEventListener('click',()=>$('#new-card-dialog').close());
  $('#new-card-form').addEventListener('submit',event=>{
    event.preventDefault();const instance=engine.addCard($('#card-title').value.trim()||'新卡片',$('#card-body').value,addPoint);
    stageContent(instance.contentId);resizeTextCard(instance,documentModel.contents.get(instance.contentId));coordinator.stage({type:'putInstance',data:{...instance}});$('#new-card-dialog').close();flush().catch(showError);
  });
  const editorOverlay=$('#card-editor');
  for(const ev of ['mousedown','mouseup','mousemove','click','dblclick','pointerdown','pointermove','pointerup']){
    editorOverlay.addEventListener(ev,e=>e.stopPropagation());
  }
  for(const [id,format]of [['format-bold','bold'],['format-italic','italic'],['format-underline','underline']]){
    $(`#${id}`).addEventListener('mousedown',event=>event.preventDefault());$(`#${id}`).addEventListener('click',()=>noteEditor?.current?.controller.format(format));
  }
  for(const [id,action]of [['editor-undo','undo'],['editor-redo','redo']]){ $(`#${id}`).addEventListener('mousedown',event=>event.preventDefault());$(`#${id}`).addEventListener('click',()=>noteEditor?.current?.controller[action]()); }
  $('#editor-done')?.addEventListener('click',()=>closeEditor().catch(showError));$('#save-workspace').addEventListener('click',()=>flush().catch(showError));
  window.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();flush().catch(showError);}
    if(event.key==='Escape'&&noteEditor?.current&&!noteEditor.current.controller.isComposing()){event.preventDefault();event.stopPropagation();closeEditor().catch(showError);}
  },true);
  for(const tool of ['select','pan'])$(`#${tool}-tool`).addEventListener('click',()=>{engine.setTool(tool);for(const id of ['select','pan'])$(`#${id}-tool`).classList.toggle('active',id===tool);});
  $('#fit').addEventListener('click',()=>{engine.fit();stageView();});
  for(const [id,factor]of [['zoom-out',1/1.2],['zoom-in',1.2],['zoom-reset',null]])$(`#${id}`).addEventListener('click',()=>{
    engine.view=zoomAt(engine.view,{x:engine.width/2,y:engine.height/2},factor?engine.view.zoom*factor:1);engine.invalidate();stageView();
  });
  $('#return-workspace').addEventListener('click',()=>{engine.setScene(documentModel);$('#scratch-notice').hidden=true;});
  for(const button of document.querySelectorAll('[data-scene]'))button.addEventListener('click',async()=>{
    await closeEditor();engine.setScene(createScene(Number(button.dataset.scene)));engine.view={x:70,y:100,zoom:1};$('#scratch-notice').hidden=false;engine.invalidate();
  });
  $('#benchmark').addEventListener('click',async()=>{
    for(const button of document.querySelectorAll('button'))button.disabled=true;
    try{await closeEditor();report=await runBenchmark(engine,({count,scale,action})=>{$('#benchmark-status').textContent=`${count} 張 · ${Math.round(scale*100)}% · ${action}`;});
      $('#benchmark-status').textContent=`完成 ${report.results.length} 組測試；可匯出逐組 frame time、p95 與記憶體。`;$('#download-report').hidden=false;
    }catch(error){$('#benchmark-status').textContent=`測試失敗：${error.message}`;}
    finally{for(const button of document.querySelectorAll('button'))button.disabled=false;}
  });
  $('#download-report').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='inkbridge-benchmark.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  window.inkbridge.onCloseCancelled(request=>{
    if(closingRequest!==request.requestId)return;
    closingRequest=null;closing=false;engine.readOnly=false;noteEditor?.current?.controller.setEditable(true);showError(new Error(request.message));
  });
  window.inkbridge.onCloseRequested(async request=>{
    closing=true;closingRequest=request.requestId;noteEditor.cancelPendingOpen();engine.readOnly=true;
    try{
      if(noteEditor?.current){await noteEditor.current.controller.flush();if(closingRequest!==request.requestId)return;noteEditor?.current?.controller.setEditable(false);}
      await coordinator.flush();if(closingRequest!==request.requestId)return;
      window.inkbridge.closeResult({requestId:request.requestId,ok:true});
    }catch(error){
      if(closingRequest!==request.requestId)return;
      closing=false;engine.readOnly=false;noteEditor?.current?.controller.setEditable(true);showError(error);window.inkbridge.closeResult({requestId:request.requestId,ok:false,error:error.message});
    }
  });
  if(info.isTest)window.__inkbridgeTest={inspect:()=>engine.inspect(),flush,load:()=>window.inkbridge.load(),setAckDelay:ms=>{testAckDelay=ms;},persistence:()=>({revision:coordinator.revision,pending:coordinator.pending.size,saving:!!coordinator.inflight,error:coordinator.error}),
    captureText:id=>{const item=documentModel.instances.get(id);return engine.measureNote(documentModel.contents.get(item.contentId),item.width).layout;},
    pixelAtWorld:point=>{engine.draw();const gl=engine.canvas.getContext('webgl2')||engine.canvas.getContext('webgl'),pixel=new Uint8Array(4);
      gl.readPixels(Math.floor((engine.view.x+point.x*engine.view.zoom)*engine.dpr),engine.canvas.height-1-Math.floor((engine.view.y+point.y*engine.view.zoom)*engine.dpr),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];},
    setZoom:zoom=>{engine.view=zoomAt(engine.view,{x:engine.width/2,y:engine.height/2},zoom);engine.invalidate();stageView();},
    runBenchmark:samples=>runBenchmark(engine,()=>{},samples),lab:options=>acceptanceLab(engine,options),resources:()=>engine.resourceState(),dispose:()=>engine.dispose(),setDefer:enabled=>{engine.deferPictures=enabled;},
    probeFailure:()=>{const item=engine.model.instances.values().next().value,content=engine.model.contents.get(item.contentId),before=engine.resourceState(),policy=engine.deferPictures;content.revision++;engine.failNextLayout=true;engine.deferPictures=false;let error;
      try{engine.picture(item,'high');}catch(e){error=e.message;}finally{content.revision--;engine.failNextLayout=false;engine.deferPictures=policy;}return {before,after:engine.resourceState(),error};},getReport:()=>report,info,ready:true};
  window.inkbridge.ready();showStatus({revision:coordinator.revision});
  window.addEventListener('beforeunload',()=>{noteEditor?.dispose();coordinator.dispose();engine.dispose();},{once:true});
}
async function openCard(point=null){
  if(closing)return;await closeEditor();if(engine.model!==documentModel){engine.setScene(documentModel);$('#scratch-notice').hidden=true;}
  addPoint=point;$('#new-card-form').reset();$('#new-card-dialog').showModal();$('#card-title').focus();
}
initialize().catch(error=>{$('#loading').textContent=`白板無法啟動\n${error.message}`;window.__inkbridgeFailure=error.stack;console.error(error);});
