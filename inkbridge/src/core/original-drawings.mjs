// InkBridge's SQLite boundary for the complete native Canvas10764 and
// StrokeToolbar49871. Pointer sampling, smoothing, hit-testing and UI stay native.
export function createOriginalDrawings({navigate,coordinator,load,store,catalogOperation,getBoardId}){
    const names=new Set(['getDrawingStrokesByWhiteboardId','createDrawingStroke','updateDrawingStroke','deleteDrawingStroke']);
    const pending=new Set();
    const copy=value=>JSON.parse(JSON.stringify(value));
    const visible=(graph,id=getBoardId())=>(graph.drawingStrokes||[]).filter(row=>row.whiteboardId===id&&!row.isDeleted).sort((a,b)=>(a.rank||0)-(b.rank||0));
    function validate(row,graph){
        if(!row||typeof row.id!=='string'||!graph.boards.some(board=>board.id===row.whiteboardId&&!board.attributes?.isTrashed))throw Error('筆跡白板不存在');
        if(!['pen','highlighter','smart_shape'].includes(row.tool)||typeof row.color!=='string'||!Number.isFinite(row.strokeWidth)||row.strokeWidth<=0||row.strokeWidth>1000)throw Error('筆跡樣式無效');
        if(row.pathData?.type!=='polyline'||!Array.isArray(row.pathData.points)||!row.pathData.points.length||row.pathData.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('筆跡路徑無效');
        for(const key of ['translateX','translateY','scaleX','scaleY','rank'])if(row[key]!=null&&!Number.isFinite(row[key]))throw Error('筆跡變換無效');
        if(row.parentId&&!(graph.sections||[]).some(section=>section.id===row.parentId&&section.whiteboardId===row.whiteboardId))throw Error('筆跡分組不存在');
    }
    function hydrate(graph){store.getState().setDrawingStrokes(visible(graph));}
    function call(name,payload){
        if(!names.has(name))return Promise.reject(Error('Unknown drawing operation'));
        // A Canvas hydration read must not call coordinator.flush(): native reads
        // can run during mounting and the editor's own flush/scene lifecycle.
        if(name==='getDrawingStrokesByWhiteboardId')return load().then(graph=>({success:true,strokes:visible(graph,typeof payload==='string'?payload:payload?.whiteboardId)}));
        const task=navigate(async()=>{
            await coordinator.flush();
            const graph=await load(),id=typeof payload==='string'?payload:payload?.id,previous=(graph.drawingStrokes||[]).find(row=>row.id===id);
            if(name==='deleteDrawingStroke'){
                if(previous)coordinator.stage({type:'deleteCatalog',kind:'drawing-stroke',id});
            }else{
                if(name==='updateDrawingStroke'&&!previous)throw Error('筆跡不存在');
                if(name==='createDrawingStroke'&&previous)throw Error('筆跡ID已存在');
                const row=copy(name==='createDrawingStroke'?payload:{...previous,...payload.updates,id});
                validate(row,graph);coordinator.stage(catalogOperation('drawing-stroke',row));
            }
            const ack=await coordinator.flush();
            // Native Canvas already applied the optimistic gesture. Replacing
            // its entire array here could erase a second stroke being drawn.
            return {success:true,id,revision:ack.revision};
        });
        pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
    }
    async function settle(){while(pending.size)await Promise.all([...pending]);}
    return {has:name=>names.has(name),call,hydrate,settle,visible};
}
