import {screenToWorld,worldToScreen,zoomAt,visibleBounds,lodFor,intersects,clamp} from './geometry.mjs';
import {createScene} from './model.mjs';
import {SkiaResources} from './skia-resources.mjs';
import {NoteLayout} from './note-layout.mjs';
import {DEFAULT_TYPOGRAPHY} from './rich-document.mjs';

export class CanvasEngine {
  constructor(K,canvas,fontManager,onChange){
    this.K=K;this.canvas=canvas;this.fontManager=fontManager;
    this.fontFamilies=[];
    for(let i=0;i<fontManager.countFamilies();i++)this.fontFamilies.push(fontManager.getFamilyName(i));
    this.family=this.fontFamilies[0]||'sans-serif';
    this.onChange=onChange;this.model=createScene();this.view={x:70,y:100,zoom:1};
    this.selectedId=null;this.editingId=null;this.tool='select';this.space=false;this.gesture=null;this.cache=new Map();
    this.resources=new SkiaResources();this.resources.own(fontManager,'FontManager');
    this.noteLayout=new NoteLayout(this);
    this.paint=this.resources.own(new K.Paint(),'Paint');this.paint.setAntiAlias(true);this.colors=new Map();this.frame=0;
    // Experimental deferral is deliberately OFF: measured worse on the baseline machine.
    this.lastPictures=new Map();this.deferPictures=false;this.recordBudgetMs=4;this.interaction=null;
    // Two LOD working sets for the supported 500-card scene, still a hard bound.
    this.cacheLimit=1024;
    this.stats={backend:'CanvasKit WebGL',visible:0,total:6,lod:'high',cacheHits:0,cacheBuilds:0,cpuMs:0,frames:0};
    this.abort=new AbortController();const options={signal:this.abort.signal};
    canvas.addEventListener('pointerdown',event=>this.pointerDown(event),options);
    canvas.addEventListener('pointermove',event=>this.pointerMove(event),options);
    canvas.addEventListener('pointerup',event=>this.pointerUp(event),options);
    canvas.addEventListener('pointercancel',event=>this.pointerUp(event),options);
    canvas.addEventListener('lostpointercapture',()=>{this.gesture=null;canvas.classList.remove('grabbing');},options);
    canvas.addEventListener('contextmenu',event=>event.preventDefault(),options);
    canvas.addEventListener('wheel',event=>{
      event.preventDefault();if(this.benchmarking)return;
      this.beginInteraction('zoom');clearTimeout(this.zoomEndTimer);this.zoomEndTimer=setTimeout(()=>this.endInteraction(),160);
      this.view=zoomAt(this.view,this.point(event),this.view.zoom*Math.exp(-event.deltaY*.0015));this.invalidate();
    },{...options,passive:false});
    window.addEventListener('keydown',event=>{
      if(/INPUT|TEXTAREA/.test(event.target.tagName)||event.target.isContentEditable)return;
      if(event.code==='Space'){event.preventDefault();this.space=true;canvas.classList.add('pan');}
      if(event.key==='Delete'&&this.selectedId&&!this.benchmarking&&!this.readOnly){const id=this.selectedId;this.model.remove(id);this.selectedId=null;this.onMutation?.({kind:'delete',id});this.invalidate();}
      if(event.key==='Escape'){this.selectedId=null;this.invalidate();}
    },options);
    window.addEventListener('keyup',event=>{if(event.code==='Space'){this.space=false;canvas.classList.toggle('pan',this.tool==='pan');}},options);
    window.addEventListener('blur',()=>{this.space=false;this.gesture=null;canvas.classList.remove('grabbing');},options);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    try{this.resize();}catch(error){this.dispose();throw error;}
  }
  color(hex,alpha=1){const key=hex+alpha;if(!this.colors.has(key))this.colors.set(key,this.K.Color(parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),alpha));return this.colors.get(key);}
  point(event){const r=this.canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  pointerDown(event){
    if(this.benchmarking||this.readOnly||![0,1].includes(event.button))return;
    event.preventDefault();this.canvas.focus();const point=this.point(event);
    if(event.button===1||this.space||this.tool==='pan')this.gesture={kind:'pan',point,view:{...this.view}};
    else{
      const world=screenToWorld(point,this.view),hit=this.model.hit(world);this.selectedId=hit?.id||null;
      this.gesture=hit?{kind:'drag',id:hit.id,point:world,x:hit.x,y:hit.y,screen:point}:null;
    }
    if(this.gesture){this.canvas.setPointerCapture(event.pointerId);this.canvas.classList.add('grabbing');}this.invalidate();
  }
  pointerMove(event){
    if(!this.gesture||this.benchmarking||this.readOnly)return;const gesture=this.gesture,point=this.point(event);
    if(gesture.kind==='pan')this.view={...this.view,x:gesture.view.x+point.x-gesture.point.x,y:gesture.view.y+point.y-gesture.point.y};
    else{const world=screenToWorld(point,this.view);this.model.move(gesture.id,gesture.x+world.x-gesture.point.x,gesture.y+world.y-gesture.point.y);}
    this.invalidate();
  }
  pointerUp(event){
    const gesture=this.gesture;this.gesture=null;this.canvas.classList.remove('grabbing');
    if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    if(gesture?.kind==='drag'){
      const point=this.point(event),distance=Math.hypot(point.x-gesture.screen.x,point.y-gesture.screen.y);
      if(distance<4)this.onEditRequest?.(gesture.id,{x:event.clientX,y:event.clientY});else this.onMutation?.({kind:'move',id:gesture.id});
    }else if(gesture?.kind==='pan')this.onMutation?.({kind:'view'});
  }
  setTool(tool){this.tool=tool;this.canvas.classList.toggle('pan',tool==='pan');}
  beginInteraction(kind){this.interaction=kind;}
  endInteraction(){this.interaction=null;this.onMutation?.({kind:'view'});this.invalidate();}
  resize(){
    if(this.disposed)return;
    const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    this.width=rect.width;this.height=rect.height;this.dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.round(this.width*this.dpr),height=Math.round(this.height*this.dpr);
    if(this.surface&&this.canvas.width===width&&this.canvas.height===height)return;
    this.resources.release(this.surface);this.surface=null;this.canvas.width=width;this.canvas.height=height;
    if(!this.glHandle){
      this.glHandle=this.K.GetWebGLContext(this.canvas,{alpha:0});if(!this.glHandle)throw Error('WebGL context unavailable');
      this.grContext=this.resources.own(this.K.MakeWebGLContext(this.glHandle),'GrDirectContext');
    }
    this.surface=this.resources.own(this.K.MakeOnScreenGLSurface(this.grContext,width,height,this.K.ColorSpace.SRGB),'Surface');
    if(!this.surface)throw Error('CanvasKit WebGL surface unavailable; no silent Canvas2D fallback');
    const gl=this.canvas.getContext('webgl2')||this.canvas.getContext('webgl');const debug=gl?.getExtension('WEBGL_debug_renderer_info');
    this.webgl={version:gl?.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable'};this.invalidate();
  }
  invalidate(){if(!this.frame&&!this.benchmarking)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  rectangle(canvas,x,y,w,h,fill,radius=0){this.paint.setStyle(this.K.PaintStyle.Fill);this.paint.setColor(fill);canvas.drawRRect(this.K.RRectXY(this.K.XYWHRect(x,y,w,h),radius,radius),this.paint);}
  paragraph(canvas,text,x,y,width,size,color,maxLines=3,bold=false){
    if(this.profile)this.profile.paragraphs++;
    const weight=bold?(this.K.FontWeight?.Bold||600):(this.K.FontWeight?.Normal||400);
    const style=new this.K.ParagraphStyle({maxLines,ellipsis:'…',textStyle:{color,fontSize:size,fontFamilies:this.fontFamilies,fontStyle:{weight}}});
    let builder,paragraph;
    try{
      builder=this.resources.own(this.K.ParagraphBuilder.Make(style,this.fontManager),'ParagraphBuilder');
      builder.addText(text);paragraph=this.resources.own(builder.build(),'Paragraph');
      if(this.failNextLayout){this.failNextLayout=false;throw Error('Injected paragraph layout failure');}
      paragraph.layout(width);canvas.drawParagraph(paragraph,x,y);
    }finally{this.resources.release(paragraph);this.resources.release(builder);}
  }
  richParagraph(canvas,content,x,y,width,maxLines){
    return this.noteLayout.layout(content,width,{maxLines,draw:(paragraph,box)=>canvas.drawParagraph(paragraph,x,y+box.top)});
  }
  measureText(content,width){return this.noteLayout.layout(content,width).height;}
  measureNote(content,width){return this.noteLayout.bounds(content,width);}
  picture(instance,lod){
    const content=this.model.contents.get(instance.contentId),key=`${content.id}|${content.revision}|${instance.width}|${instance.height}|${lod}`;
    if(this.cache.has(key)){const item=this.cache.get(key);this.cache.delete(key);this.cache.set(key,item);this.stats.cacheHits++;return item.picture;}
    const prefix=`${content.id}|${content.revision}|${instance.width}|${instance.height}`;
    const previous=this.cache.get(this.lastPictures.get(prefix));
    if(this.deferPictures&&this.interaction==='zoom'){
      this.profile.deferred++;return previous?.picture||null;
    }
    if(this.deferPictures&&this.profile.misses>=2&&this.profile.recordMs>=this.recordBudgetMs){this.profile.pending++;return previous?.picture||null;}
    const recordingStarted=performance.now();
    // Geometry belongs to document mutations, never to picture replay or LOD.
    const {K}=this,w=instance.width,h=instance.height;
    const recorder=this.resources.own(new K.PictureRecorder(),'PictureRecorder');
    let picture;
    try{
      const canvas=recorder.beginRecording(K.XYWHRect(-3,-3,w+6,h+10));
      const tones={sage:['#dce8dc','#557565'],sand:['#eee4cf','#a17c40'],rose:['#efdfda','#a36a60'],blue:['#dfe7ed','#587b91']};
      const tone=tones[content.tone]||tones.sage;
      canvas.save();
      canvas.clipRRect(K.RRectXY(K.XYWHRect(0,0,w,h),12,12),K.ClipOp.Intersect,true);
      this.rectangle(canvas,0,4,w,h,this.color('#23362d',.06),12);
      this.rectangle(canvas,0,0,w,h,this.color('#fffefb'),12);
      this.rectangle(canvas,0,0,w,7,this.color(tone[0]),5);
      if(lod!=='skeleton'){
        if(content.kind==='image'||lod==='low')this.paragraph(canvas,content.title,18,21,w-36,lod==='low'?21:18,this.color('#253c32'),lod==='low'?2:1,true);
        if(lod==='high'||lod==='medium'){
          if(content.kind==='image'){
            canvas.save();canvas.clipRRect(K.RRectXY(K.XYWHRect(18,57,w-36,78),6,6),K.ClipOp.Intersect,true);
            this.rectangle(canvas,18,57,w-36,78,this.color(tone[0]),6);
            this.paint.setColor(this.color('#bed0c4'));canvas.drawOval(K.XYWHRect(30,83,110,82),this.paint);
            this.paint.setColor(this.color('#8dac9c'));canvas.drawOval(K.XYWHRect(106,91,140,68),this.paint);
            this.paint.setColor(this.color('#fff3cf'));canvas.drawCircle(199,78,12,this.paint);
            canvas.restore();
          }else{
            this.richParagraph(canvas,content,DEFAULT_TYPOGRAPHY.padding,DEFAULT_TYPOGRAPHY.padding+DEFAULT_TYPOGRAPHY.topPadding,w-DEFAULT_TYPOGRAPHY.padding*2,lod==='high'?9999:3);
          }
          if(content.kind==='image')this.paragraph(canvas,'CANVASKIT · VECTOR',18,h-25,w-36,9.5,this.color(tone[1]),1);
        }
      }else{
        this.rectangle(canvas,20,29,w*.65,17,this.color(tone[0]),5);
        this.rectangle(canvas,20,67,w*.78,9,this.color('#eeeFE9'),4);
        this.rectangle(canvas,20,88,w*.56,9,this.color('#eeeFE9'),4);
      }
      canvas.restore();
      picture=this.resources.own(recorder.finishRecordingAsPicture(),'Picture');
    }finally{this.resources.release(recorder);}
    this.stats.cacheBuilds++;
    if(this.profile){this.profile.recordMs+=performance.now()-recordingStarted;this.profile.misses++;}
    this.cache.set(key,{picture,contentId:content.id});
    this.lastPictures.set(prefix,key);
    while(this.cache.size>this.cacheLimit){const oldest=this.cache.keys().next().value;this.resources.release(this.cache.get(oldest).picture);this.cache.delete(oldest);}
    // Keep only keys for live cache entries: content edits cannot accumulate a JS index.
    if(this.lastPictures.size>this.cacheLimit*2)for(const [id,cacheKey]of this.lastPictures)if(!this.cache.has(cacheKey))this.lastPictures.delete(id);
    return picture;
  }
  draw(){
    if(!this.surface||this.disposed)return;const start=performance.now(),{K}=this,canvas=this.surface.getCanvas();
    this.profile={recordMs:0,queryMs:0,flushMs:0,paragraphs:0,misses:0,deferred:0,pending:0};
    canvas.clear(this.color('#f4f3ee'));canvas.save();canvas.scale(this.dpr,this.dpr);
    const step=(this.view.zoom<.35?128:32)*this.view.zoom,points=[];
    for(let y=((this.view.y%step)+step)%step;y<this.height;y+=step)
      for(let x=((this.view.x%step)+step)%step;x<this.width;x+=step)points.push(x,y);
    this.paint.setColor(this.color('#c7cec3',.8));this.paint.setStrokeWidth(1.5);canvas.drawPoints(K.PointMode.Points,Float32Array.from(points),this.paint);
    canvas.translate(this.view.x,this.view.y);canvas.scale(this.view.zoom,this.view.zoom);
    const viewport=visibleBounds(this.view,this.width,this.height,0),query=visibleBounds(this.view,this.width,this.height,80);
    const queryStarted=performance.now();
    // The DOM text of the editing note is above the canvas. Paint its paper in
    // the same active layer, without changing the persisted document z-order.
    const instances=this.model.index.query(query).map(id=>this.model.instances.get(id)).filter(i=>i.boardId===this.model.boardId)
      .sort((a,b)=>Number(a.id===this.editingId)-Number(b.id===this.editingId)||a.z-b.z);
    this.profile.queryMs=performance.now()-queryStarted;
    for(const instance of instances){
      canvas.save();canvas.translate(instance.x,instance.y);
      if(this.editingId&&String(this.editingId)===String(instance.id)){
        const content=this.model.contents.get(instance.contentId);
        const tones={sage:['#dce8dc','#557565'],sand:['#eee4cf','#a17c40'],rose:['#efdfda','#a36a60'],blue:['#dfe7ed','#587b91']};
        const tone=tones[content?.tone]||tones.sage,w=instance.width,h=instance.height;
        this.rectangle(canvas,0,4,w,h,this.color('#23362d',.06),12);
        this.rectangle(canvas,0,0,w,h,this.color('#fffefb'),12);
        this.rectangle(canvas,0,0,w,7,this.color(tone[0]),5);
      }else{
        const picture=this.picture(instance,lodFor(instance.width,this.view.zoom));
        if(picture)canvas.drawPicture(picture);else this.rectangle(canvas,0,0,instance.width,instance.height,this.color('#e4e9de'),12);
      }
      canvas.restore();
    }
    const selected=this.model.instances.get(this.selectedId);
    if(selected&&(!this.editingId||String(this.editingId)!==String(selected.id))){
      this.paint.setStyle(K.PaintStyle.Stroke);this.paint.setStrokeWidth(2/this.view.zoom);this.paint.setColor(this.color('#397e65'));
      canvas.drawRRect(K.RRectXY(K.XYWHRect(selected.x-4,selected.y-4,selected.width+8,selected.height+8),15,15),this.paint);this.paint.setStyle(K.PaintStyle.Fill);
    }
    canvas.restore();const flushStarted=performance.now();this.surface.flush();this.profile.flushMs=performance.now()-flushStarted;this.stats={...this.stats,profile:{...this.profile},visible:instances.filter(i=>intersects(i,viewport)).length,
      queried:instances.length,total:this.model.instances.size,lod:lodFor(260,this.view.zoom),cacheSize:this.cache.size,cacheLimit:this.cacheLimit,cpuMs:performance.now()-start,frames:this.stats.frames+1};
    this.onChange?.(this.inspect());
    if(this.profile.pending&&!this.interaction)this.invalidate();
  }
  clearCache(){for(const item of this.cache.values())this.resources.release(item.picture);this.cache.clear();this.lastPictures.clear();}
  setScene(model){this.clearCache();this.model=model;this.selectedId=null;this.invalidate();}
  addCard(title,body,point){
    const world=point||screenToWorld({x:this.width/2-130*this.view.zoom,y:this.height/2-89*this.view.zoom},this.view);
    const content=this.model.addContent({title,body});const instance=this.model.addInstance(content.id,world.x,world.y);this.selectedId=instance.id;this.invalidate();return instance;
  }
  fit(){
    const instances=[...this.model.instances.values()];if(!instances.length)return;
    const minX=Math.min(...instances.map(i=>i.x)),minY=Math.min(...instances.map(i=>i.y));
    const maxX=Math.max(...instances.map(i=>i.x+i.width)),maxY=Math.max(...instances.map(i=>i.y+i.height));
    const zoom=clamp(Math.min((this.width-120)/(maxX-minX),(this.height-120)/(maxY-minY)),.1,1.2);
    this.view={zoom,x:(this.width-(maxX-minX)*zoom)/2-minX*zoom,y:(this.height-(maxY-minY)*zoom)/2-minY*zoom};this.invalidate();
  }
  inspect(){return {view:{...this.view},selectedId:this.selectedId,stats:{...this.stats},width:this.width,height:this.height,dpr:this.dpr,
    instances:[...this.model.instances.values()].map(i=>({...i})),contents:[...this.model.contents.values()].map(c=>({...c}))};}
  resourceState(){return {...this.resources.snapshot(),glContexts:this.glHandle?1:0,wasmCapacityBytes:this.K.HEAPU8.length,cacheSize:this.cache.size,cacheLimit:this.cacheLimit,
    gpuCacheBytes:this.disposed?0:this.grContext?.getResourceCacheUsageBytes()};}
  dispose(){
    if(this.disposed)return this.resourceState();this.disposed=true;clearTimeout(this.zoomEndTimer);
    if(this.frame)cancelAnimationFrame(this.frame);this.abort.abort();this.resizeObserver?.disconnect();this.clearCache();
    this.resources.release(this.surface);this.resources.release(this.grContext);
    if(this.glHandle){this.K.deleteContext(this.glHandle);this.glHandle=null;}
    this.resources.releaseAll();return this.resourceState();
  }
}
export {worldToScreen};
