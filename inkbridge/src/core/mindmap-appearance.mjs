export const MAP_STYLES=['branch','boxed','plain'];
export const MARKER_COLORS={red:'#ff5054',orange:'#ff9e35',yellow:'#e4bd00',green:'#18bc88',blue:'#4387f5',purple:'#8363d8',gray:'#9b9ba1'};
export const MARKER_GROUPS={tag:Object.keys(MARKER_COLORS),priority:['1','2','3','4','5','6','7'],task:['0','25','50','75','100'],flag:Object.keys(MARKER_COLORS),star:Object.keys(MARKER_COLORS),symbol:['book','idea','heart','check']};
export const SYMBOL_PATHS={flag:'M5 21V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0',star:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',book:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zm9 2v15',idea:'M8 17c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8zm1 3h6m-5 3h4',heart:'M12 21 3 12C-3 3 7-2 12 5c5-7 15-2 9 7z',check:'M4 12l5 5L21 5'};
export function validateMarkers(markers){if(!Array.isArray(markers)||markers.length>6||new Set(markers.map(m=>m.group)).size!==markers.length||markers.some(m=>!MARKER_GROUPS[m.group]?.includes(m.value)))throw Error('無效的節點標記');return markers;}
export function replaceMarker(markers,group,value){const next=(markers||[]).filter(m=>m.group!==group);if(value)next.push({group,value});return validateMarkers(next);}
export const markerInset=data=>(data?.inkbridgeMarkers?.length||0)*22;
export function nodeStyle(data,map){return data?.inkbridgeNodeStyle||data?.inkbridgeMapStyle||map?.inkbridgeStyle||'branch';}
export function installMindmapAppearance(r,K,fontMgr){
 const proto=r(53861).b.prototype,native={layout:proto.getLayout,measure:proto.measure,draw:proto.drawDefaultStyle,rich:proto.drawRichText};
 const paints=[],paths=new Map();let font;
 const paint=new K.Paint();paint.setAntiAlias(true);paint.setStrokeWidth(1.5);paints.push(paint);
 const mapOf=(data,ctx)=>ctx.getMindmap?.(data?.mindMapId),managed=data=>!data?.type||data.type==='Text';
 const lineColor=(data,theme='light')=>data?.edgeColor||data?.color?r(89676).tI(data.edgeColor||data.color,theme==='dark',{isRoot:!!data.isRoot}):'#ff9e2c';
 proto.getLayout=function(element,ctx){const layout=native.layout.call(this,element,ctx);if(element.data?.__inkbridgeTextOnly||!managed(element.data))return layout;return {...layout,width:layout.width+markerInset(element.data)};};
 proto.measure=function(data,ctx){if(!managed(data))return native.measure.call(this,data,ctx);const result=this.getLayout({id:data.id,type:'MindmapNode',width:data.width,data},ctx);return {width:result.width,height:result.height};};
 proto.drawRichText=function(canvas,element,ctx,options){const inset=managed(element.data)?markerInset(element.data):0;if(!inset)return native.rich.call(this,canvas,element,ctx,options);canvas.save();canvas.translate(inset,0);try{return native.rich.call(this,canvas,{...element,data:{...element.data,__inkbridgeTextOnly:true}},ctx,options);}finally{canvas.restore();}};
 function color(value,stroke=false){paint.setColor(r(89676).uQ(K,value));paint.setStyle(stroke?K.PaintStyle.Stroke:K.PaintStyle.Fill);}
 function path(shape){if(!paths.has(shape))paths.set(shape,K.Path.MakeFromSVGString(shape));return paths.get(shape);}
 function marker(canvas,marker,x,y){const col=MARKER_COLORS[marker.value]||'#18bc88',size=16,cx=x+8,cy=y+8;color(col);if(marker.group==='tag'){canvas.drawCircle(cx,cy,6.5,paint);return;}
  if(marker.group==='priority'){const colors=Object.values(MARKER_COLORS);color(colors[(Number(marker.value)-1)%colors.length]);canvas.drawCircle(cx,cy,8,paint);if(!font){const face=fontMgr.matchFamilyStyle(fontMgr.getFamilyName(0),{});font=new K.Font(face,12);face?.delete();}color('#fff');const width=font.getGlyphWidths(font.getGlyphIDs(marker.value)).reduce((a,b)=>a+b,0);canvas.drawText(marker.value,cx-width/2,cy+4.3,paint,font);return;}
  if(marker.group==='task'){color('#18bc88',true);canvas.drawCircle(cx,cy,7,paint);const fraction=Number(marker.value)/100;if(fraction>0&&fraction<1){const a=-Math.PI/2+fraction*Math.PI*2,shape=`M8 8L8 1A7 7 0 ${fraction>.5?1:0} 1 ${8+Math.cos(a)*7} ${8+Math.sin(a)*7}Z`;color('#18bc88');canvas.save();canvas.translate(x,y);canvas.drawPath(path(shape),paint);canvas.restore();}if(fraction===1){color('#18bc88');canvas.drawCircle(cx,cy,7,paint);canvas.save();canvas.translate(x,y);canvas.scale(size/24,size/24);color('#fff',true);canvas.drawPath(path(SYMBOL_PATHS.check),paint);canvas.restore();}return;}
  const shape=SYMBOL_PATHS[marker.group==='flag'?'flag':marker.group==='star'?'star':marker.value];if(!shape)return;canvas.save();canvas.translate(x,y);canvas.scale(size/24,size/24);color(marker.group==='symbol'?'#64748b':col,marker.group!=='star'&&marker.value!=='heart');canvas.drawPath(path(shape),paint);canvas.restore();
 }
 proto.drawDefaultStyle=function(canvas,element,ctx){if(!managed(element.data))return native.draw.call(this,canvas,element,ctx);const style=nodeStyle(element.data,mapOf(element.data,ctx)),root=!!element.data.isRoot;
  const data={...element.data,...style!=='boxed'?{borderStyle:root&&style==='branch'?'rounded':'none',color:element.data.color||'orange',edgeColor:element.data.edgeColor||element.data.color||'orange'}:{}};
  const shown={...element,data};native.draw.call(this,canvas,shown,ctx);const layout=this.getLayout(shown,ctx);
  if(style==='branch'&&!root){color(lineColor(element.data,ctx.theme),true);canvas.drawLine(element.x,element.y+layout.height-2,element.x+layout.width,element.y+layout.height-2,paint);}
  (data.inkbridgeMarkers||[]).forEach((m,index)=>marker(canvas,m,element.x+layout.padding+index*22,element.y+(layout.height-16)/2));
 };
 globalThis.__inkbridgeMindmapSpacing=data=>nodeStyle(data)==='boxed'?{gap:72,padding:12}:{gap:28,padding:0};
 globalThis.__inkbridgeMindmapLayout=(original,args,kind)=>{
  const ctx={CanvasKit:K,fontMgr,view:{scale:1},theme:'light',getMindmap:id=>r(63268).Z.getState().flow.mindmaps.find(map=>map.id===id)};
  const result=kind==='initial'?original(args[0],args[1],row=>r(66597).L.getDrawer('MindmapNode').measure(row,ctx)):original(args[0],args[1],args[2],args[3],row=>r(66597).L.getDrawer('MindmapNode').measure(row,ctx));
  const nodes=new Map(result.nodes.map(n=>[n.id,n]));
  result.nodes=result.nodes.map(n=>{if(n.type!=='MindmapNode'||!managed(n.data))return n;const style=nodeStyle(n.data,ctx.getMindmap(n.data.mindMapId)),map=ctx.getMindmap(n.data.mindMapId);return {...n,data:{...n.data,inkbridgeMapStyle:map?.inkbridgeStyle||n.data.inkbridgeMapStyle||'branch',...style!=='boxed'?{borderStyle:n.data.isRoot&&style==='branch'?'rounded':'none'}:{}}};});
  result.connections=result.connections.map(edge=>{const source=nodes.get(edge.source.nodeId),target=nodes.get(edge.target.nodeId);if(!target||nodeStyle(target.data,ctx.getMindmap(target.data.mindMapId))!=='branch')return edge;const anchor=(endpoint,node)=>node&&!node.data.isRoot&&managed(node.data)?{...endpoint,type:'fixed-relative',relativeOffset:{x:endpoint.side==='w'?0:1,y:(node.height-2)/node.height}}:endpoint;return {...edge,source:anchor(edge.source,source),target:anchor(edge.target,target),style:{...edge.style,color:lineColor(target.data,ctx.theme),strokeWidth:1.5}};});return result;
 };
 // The native overlay remains the editor. Shift its left edge over the marker
 // slots so its padding, caret and the rendered text start at the same point.
 globalThis.__inkbridgeMindmapEditorInset=node=>node?.type==='MindmapNode'&&managed(node.data)?markerInset(node.data):0;
 const dispose=()=>{for(const p of paints)p.delete();for(const p of paths.values())p?.delete();font?.delete();};window.addEventListener('beforeunload',dispose,{once:true});return {dispose};
}
