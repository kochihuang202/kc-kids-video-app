// Native14153/99665 use parent-relative database positions; Canvas10764 uses
// absolute world positions. Keep this conversion solely at the SQLite boundary.
export function sectionWorldPosition(id, sections, seen = new Set()) {
    if (!id) return {x:0,y:0};
    if (seen.has(id)) throw Error('Cyclic group hierarchy');
    const section=sections.get(id);if(!section)throw Error('Group parent is missing');
    seen.add(id);const parent=sectionWorldPosition(section.parentId,sections,seen);
    return {x:parent.x+section.x,y:parent.y+section.y};
}
export function projectGroupedNode(node, sections) {
    // Older builds could persist child offsets without ever saving their group.
    // Keep those stored values untouched and render a recoverable ungrouped card;
    // the lost container origin cannot be reconstructed from offsets alone.
    if(node.parentId&&!sections.has(node.parentId))return {...node,parentId:'',data:{...node.data,parentId:''}};
    const parent=sectionWorldPosition(node.parentId,sections);
    return {...node,position:{x:node.position.x+parent.x,y:node.position.y+parent.y}};
}
export function createOriginalSections({graph,navigate,coordinator,instances,store,toNode,getBoardId,convertSection,catalogOperation}) {
    const sections=new Map((graph.sections||[]).map(row=>[row.id,row]));
    const scene=()=>[...sections.values()].filter(row=>row.whiteboardId===getBoardId()).sort((a,b)=>depth(a)-depth(b)).map(row=>projectGroupedNode(convertSection(row),sections)).concat([...instances.values()].filter(row=>row.boardId===getBoardId()).map(toNode));
    function depth(row){let count=0,seen=new Set([row.id]);while(row.parentId){if(seen.has(row.parentId))throw Error('Cyclic group hierarchy');seen.add(row.parentId);row=sections.get(row.parentId);if(!row)throw Error('Group parent is missing');count++;}return count;}
    const hydrate=()=>store.getState().setNodes(scene());
    const has=name=>['createSection','updateSection','batchUpdateSections','batchDeleteSections'].includes(name);
    const call=(name,payload)=>navigate(async()=>{
        await coordinator.flush();
        if(name==='batchDeleteSections'){
            if(!Array.isArray(payload)||payload.some(id=>!sections.has(id)))throw Error('Group is missing');
            const removed=new Set(payload),pending=new Map(sections),changed=new Map();
            function survivingParent(id){while(removed.has(id))id=sections.get(id)?.parentId||'';return id;}
            for(const [id,item]of instances){if(!removed.has(item.attributes?.parentId))continue;const node=toNode(item),parentId=survivingParent(item.attributes.parentId),parent=sectionWorldPosition(parentId,sections);changed.set(id,{...item,x:node.position.x-parent.x,y:node.position.y-parent.y,attributes:{...item.attributes,parentId}});}
            for(const [id,row]of sections){if(removed.has(id))pending.delete(id);else if(removed.has(row.parentId)){const world=sectionWorldPosition(id,sections),parentId=survivingParent(row.parentId),parent=sectionWorldPosition(parentId,sections);pending.set(id,{...row,parentId,x:world.x-parent.x,y:world.y-parent.y});}}
            for(const [id,row]of pending)if(JSON.stringify(row)!==JSON.stringify(sections.get(id)))coordinator.stage(catalogOperation('section',row));
            for(const row of changed.values()){coordinator.stage({type:'putInstance',data:row});coordinator.stage(catalogOperation('instance',row.attributes));}
            // Remove deepest children first after reparenting remaining members.
            for(const id of [...removed].sort((a,b)=>depth(sections.get(b))-depth(sections.get(a))))coordinator.stage({type:'deleteCatalog',kind:'section',id});
            await coordinator.flush();sections.clear();for(const [id,row]of pending)sections.set(id,row);for(const [id,row]of changed)instances.set(id,row);hydrate();return {success:true};
        }
        const pending=new Map(sections),changedInstances=new Map(),rows=name==='createSection'?payload:name==='updateSection'?[payload]:payload;
        if(!Array.isArray(rows))throw Error('Invalid group update');
        for(const row of rows){const old=pending.get(row.id);if(name!=='createSection'&&!old)throw Error('Group is missing');pending.set(row.id,name==='createSection'?{...row}:{...old,...row.updates});}
        for(const row of pending.values()){sectionWorldPosition(row.id,pending);if(row.whiteboardId!==getBoardId()&&rows.some(r=>r.id===row.id))throw Error('Group belongs to another board');}
        if(name==='createSection'){
            // Native14153 has already assigned parents in the scene before calling
            // createSection, then sends relative child updates separately. Commit
            // the container and memberships together so a crash cannot orphan them.
            const created=new Set(rows.map(r=>r.id));
            for(const node of store.getState().nodes){if(!created.has(node.parentId))continue;const parent=sectionWorldPosition(node.parentId,pending);
                if(instances.has(node.id)){const item=instances.get(node.id),next={...item,x:node.position.x-parent.x,y:node.position.y-parent.y,attributes:{...item.attributes,id:node.id,parentId:node.parentId}};changedInstances.set(node.id,next);}
                else if(pending.has(node.id)&&!created.has(node.id))pending.set(node.id,{...pending.get(node.id),parentId:node.parentId,x:node.position.x-parent.x,y:node.position.y-parent.y});
            }
        }
        // Prevalidate the entire proposed hierarchy before staging any writes.
        for(const row of pending.values())sectionWorldPosition(row.id,pending);
        for(const [id,row]of [...pending].sort((a,b)=>{const height=id=>{let count=0;while(pending.get(id)?.parentId){count++;id=pending.get(id).parentId;}return count;};return height(a[0])-height(b[0]);}))if(JSON.stringify(sections.get(id))!==JSON.stringify(row))coordinator.stage(catalogOperation('section',row));
        for(const next of changedInstances.values()){coordinator.stage({type:'putInstance',data:next});coordinator.stage(catalogOperation('instance',next.attributes));}
        try{await coordinator.flush();}catch(error){hydrate();throw error;}
        sections.clear();for(const [id,row]of pending)sections.set(id,row);for(const [id,row]of changedInstances)instances.set(id,row);hydrate();return {success:true};
    });
    return {sections,has,call,scene,hydrate};
}
