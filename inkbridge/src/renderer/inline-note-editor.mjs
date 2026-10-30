import {noteDocument,projectDocument,DEFAULT_TYPOGRAPHY} from '../core/rich-document.mjs';

// One overlay session, independent of persistence batching and Canvas recording.
export class InlineNoteEditor {
  constructor({host,element,engine,model,createEditor,save,change,geometry,onError,onViewChange}){
    Object.assign(this,{host,element,engine,model,createEditor,save,change,geometry,onError,onViewChange});this.current=null;this.sequence=0;
  }
  align(){
    const session=this.current;if(!session)return;const item=this.model.instances.get(session.instanceId),view=this.engine.view;
    Object.assign(this.host.style,{left:`${view.x+item.x*view.zoom}px`,top:`${view.y+item.y*view.zoom}px`,width:`${item.width}px`,height:`${item.height}px`,transform:`scale(${view.zoom})`});
  }
  reflow(){
    if(!this.current)return;
    const item=this.model.instances.get(this.current.instanceId),content=this.model.contents.get(item.contentId),bounds=this.engine.measureNote(content,item.width);
    const children=[...this.element.children];
    for(let index=0;index<children.length;index++){
      const box=bounds.layout.blocks[index];if(!box)continue;const style=box.typography;
      Object.assign(children[index].style,{fontSize:`${style.fontSize}px`,fontWeight:String(style.weight),lineHeight:String(style.lineHeight),color:style.weight>400?'#253c32':'#6d786e',
        marginTop:`${box.gap}px`,marginBottom:'0',minHeight:`${box.height}px`,padding:'0'});
    }
    // This root has intrinsic height, not a percentage of the card. Reading its
    // intrinsic box cannot create the previous card-height feedback loop.
    const domHeight=this.element.getBoundingClientRect().height/this.engine.view.zoom;
    this.geometry(item,Math.max(bounds.height,Math.ceil(domHeight+DEFAULT_TYPOGRAPHY.padding*2+DEFAULT_TYPOGRAPHY.topPadding)));
    this.element.scrollTop=0;this.align();
  }
  async flush(){if(this.current){await this.current.controller.flush();this.reflow();}}
  async open(instanceId,point){
    const sequence=++this.sequence;
    if(this.current?.instanceId===instanceId){await this.current.controller.focus(point);return;}
    await this.close();if(sequence!==this.sequence)return;
    const item=this.model.instances.get(instanceId),content=item&&this.model.contents.get(item.contentId);if(content?.kind!=='text')return;
    const unknown=projectDocument(content).unknownTypes;
    if(unknown.length)throw new Error(`這張卡片包含尚未支援的內容節點：${unknown.join('、')}。原始內容已保留，暫不開啟編輯。`);
    // Parse before replacing the overlay: unsupported/invalid AST must not be
    // silently cleared. Lexical errors leave the saved source document intact.
    this.host.hidden=false;
    let controller;
    try{
      controller=this.createEditor({element:this.element,document:noteDocument(content),onError:error=>{throw error;},
        onChange:value=>{if(this.current?.controller!==controller)return;this.change(content.id,value);this.reflow();},
        onSelection:rect=>this.ensureCaretVisible(rect)});
    }catch(error){this.host.hidden=true;throw error;}
    this.current={instanceId,contentId:content.id,controller};this.engine.editingId=instanceId;this.engine.selectedId=instanceId;
    this.align();this.reflow();this.engine.invalidate();await controller.focus(point);
  }
  async close(){
    const current=this.current;if(!current)return;if(current.closing)return current.closing;
    const task=(async()=>{await this.save();if(this.current!==current)return;current.controller.dispose();this.current=null;this.host.hidden=true;this.engine.editingId=null;this.engine.invalidate();})();
    current.closing=task;try{await task;}finally{if(current.closing===task)current.closing=null;}
  }
  cancelPendingOpen(){this.sequence++;}
  ensureCaretVisible(rect){
    // Bounded REA did not establish FlexNote's general auto-pan policy. This
    // explicit InkBridge fallback moves the camera, never a hidden DOM scroller.
    if(!this.current||!rect?.height)return;
    const viewport=this.engine.canvas.getBoundingClientRect(),margin=20;
    const dy=rect.bottom>viewport.bottom-margin?viewport.bottom-margin-rect.bottom:rect.top<viewport.top+margin?viewport.top+margin-rect.top:0;
    if(dy){this.engine.view={...this.engine.view,y:this.engine.view.y+dy};this.align();this.engine.invalidate();this.onViewChange?.();}
  }
  setEditable(value){this.current?.controller.setEditable(value);}
  dispose(){this.sequence++;this.current?.controller.dispose();this.current=null;}
}
