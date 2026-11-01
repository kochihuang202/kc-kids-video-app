// SQLite/write-boundary adaptation. All creation/selection/layout UI and the
// add-to-whiteboard placement algorithm remain original modules 31167/94700.
export function createOriginalNoteWriter({ navigate, coordinator, load, contents, instances, putContent, acceptContentDocument, replaceContentDocument, catalogOperation, store, toNode, getBoardId }) {
    return (method, payload) => navigate(async () => {
        await coordinator.flush();
        const stageVersion=(noteCardId,snapshot)=>coordinator.stage(catalogOperation('content-version',{id:crypto.randomUUID(),noteCardId,title:snapshot.title||'',content:snapshot.content,createdTime:new Date().toISOString()}));
        if(method==='restoreNoteCardContentVersion'){
            const graph=await load(),version=(graph.contentVersions||[]).find(row=>row.id===payload.versionId&&row.noteCardId===payload.noteCardId),current=contents.get(payload.noteCardId);
            if(!version)return {success:false,error:'version_not_found'};
            if(!current)return {success:false,error:'card_not_found'};
            stageVersion(current.id,{title:current.title,content:JSON.stringify(current.document)});
            replaceContentDocument(current.id,JSON.parse(version.content));stageVersion(current.id,version);await coordinator.flush();
            const restored=contents.get(current.id);return {success:true,noteCard:{id:restored.id,title:restored.title,content:restored.document,type:'NoteCard'}};
        }
        if (method === 'registerFiles') {
            if (!Array.isArray(payload.files)) throw Error('Invalid file registration');
            for (const file of payload.files) coordinator.stage(catalogOperation('file', file));
            await coordinator.flush();
            return {success:true};
        }
        if (method === 'batchCreateNoteCards') {
            if(!Array.isArray(payload)||payload.some(note=>!note?.id||contents.has(note.id)))throw Error('卡片ID已存在或批次格式錯誤');
            for(const note of payload){
                const document=typeof note.content==='string'?JSON.parse(note.content):note.content;
                putContent({id:note.id,title:note.title,document,kind:'text',tone:'sage'});
                coordinator.stage(catalogOperation('card',{...note,content:undefined,id:note.id,isTrashed:false}));
            }
            await coordinator.flush();return {success:true,relatedCards:payload.map(note=>({...note,content:typeof note.content==='string'?JSON.parse(note.content):note.content}))};
        }
        if (method === 'batchInsertCardInstances'||method==='batchCreateNoteCardInstances'||method==='addNoteCardInstance') {
            const nativeRows=method==='batchInsertCardInstances'?payload.instances:(Array.isArray(payload)?payload:[payload]).map(row=>({...row,__type:'NoteCard'}));
            if (!Array.isArray(nativeRows) || nativeRows.some(row => row.__type !== 'NoteCard' || !contents.has(row.objectId)))
                throw Error('含有尚未接入的卡片類型，未變更資料');
            const rows = nativeRows.map((row, index) => ({ id: row.id, contentId: row.objectId, boardId: row.whiteboardId, x: row.x, y: row.y, width: row.width || 520, height: row.height || 480, z: instances.size + index }));
            for (let i = 0; i < rows.length; i++) {
                coordinator.stage({ type: 'putInstance', data: rows[i] });
                coordinator.stage(catalogOperation('instance', nativeRows[i]));
            }
            await coordinator.flush();
            for (const row of rows)
                instances.set(row.id, { ...row, attributes: nativeRows.find(native => native.id === row.id) });
            store.getState().setNodes([...instances.values()].filter(row => row.boardId === getBoardId()).map(toNode));
            return { success: true };
        }
        if (method === 'batchDeleteCardsByType' || method === 'restoreNoteCard') {
            const targets = method === 'restoreNoteCard' ? [{ objectId: payload.id, objectType: 'NoteCard' }] : payload;
            if (!Array.isArray(targets) || targets.some(row => row.objectType !== 'NoteCard' || !contents.has(row.objectId)))
                throw Error('這批卡片含有尚未接入的類型，未變更資料');
            const graph = await load(), ids = new Set(targets.map(row => row.objectId));
            for (const id of ids)
                coordinator.stage(catalogOperation('card', { ...(graph.cardMetadata || []).find(row => row.id === id), id, isTrashed: method !== 'restoreNoteCard', lastEditedTime: new Date().toISOString() }));
            const removed = method === 'batchDeleteCardsByType' ? [...instances.values()].filter(row => ids.has(row.contentId)) : [];
            for (const row of removed)
                coordinator.stage({ type: 'deleteInstance', id: row.id });
            await coordinator.flush();
            for (const row of removed)
                instances.delete(row.id);
            if (removed.length)
                store.getState().setNodes(nodes => nodes.filter(node => !ids.has(node.data.objectId)));
            return { success: true };
        }
        if (method === 'addNoteCard') {
            const note = payload.noteCard || payload;
            if (contents.has(note.id))
                throw Error('卡片ID已存在');
            const document = typeof note.content === 'string' ? JSON.parse(note.content) : note.content;
            putContent({ id: note.id, title: note.title, document, kind: 'text', tone: 'sage' });
            coordinator.stage(catalogOperation('card', { id: note.id, createdTime: note.createdTime, lastEditedTime: note.lastEditedTime, isTrashed: false, propertiesConfig: note.propertiesConfig || [] }));
            await coordinator.flush();
            return { success: true };
        }
        if (method === 'addMediaCard') {
            const cards = Array.isArray(payload) ? payload : [payload];
            for (const card of cards) {
                const content = { ...card, id: card.id, title: card.title || 'Image', body: '', kind: 'image', tone: 'sage', document: null };
                putContent(content);
                coordinator.stage(catalogOperation('card', { ...card, id: card.id, type: 'MediaCard', createdTime: card.createdTime, lastEditedTime: card.lastEditedTime, isTrashed: false }));
            }
            await coordinator.flush();
            return { success: true, mediaCards: cards };
        }
        if (method === 'addMediaCardInstance') {
            const items = Array.isArray(payload) ? payload : [payload];
            const pendingInstances=[];
            for (const item of items) {
                const instanceRow = {
                    id: item.id,
                    contentId: item.objectId,
                    boardId: item.whiteboardId,
                    x: item.x,
                    y: item.y,
                    width: item.width || 400,
                    height: item.height || 300,
                    z: instances.size
                };
                coordinator.stage({ type: 'putInstance', data: instanceRow });
                coordinator.stage(catalogOperation('instance', { ...item, type: 'MediaCard' }));
                pendingInstances.push([item.id, { ...instanceRow, attributes: { ...item, type: 'MediaCard' } }]);
            }
            await coordinator.flush();
            for(const [id,row]of pendingInstances)instances.set(id,row);
            store.getState().setNodes([...instances.values()].filter(row => row.boardId === getBoardId()).map(toNode));
            return { success: true };
        }
        if (method === 'updateNoteCardInstance' || method === 'batchUpdateCardInstances' || method === 'batchUpdateMediaCardInstances') {
            const items = method === 'updateNoteCardInstance' ? [{ id: payload.id, updates: payload.updates }] : payload;
            if (!Array.isArray(items) || items.some(item=>!item || !item.updates || typeof item.updates!=='object' || !instances.has(item.id))) throw Error('卡片實例不存在或更新格式錯誤');
            const changed = new Map();
            for (const item of items) {
                const existing = changed.get(item.id) || instances.get(item.id);
                const nextAttributes = { ...existing.attributes, ...item.updates, id: item.id };
                const next = {...existing,attributes:nextAttributes};
                for(const key of ['x','y','width','height'])if(item.updates[key]!==undefined)next[key]=item.updates[key];
                coordinator.stage({type:'putInstance',data:next});
                coordinator.stage(catalogOperation('instance', nextAttributes));
                changed.set(item.id,next);
            }
            await coordinator.flush();
            for(const [id,next] of changed)instances.set(id,next);
            store.getState().setNodes(nodes => nodes.map(node => {
                const next=changed.get(node.id);if(!next)return node;
                const updated={...node,position:{x:next.x,y:next.y},width:next.width,draggable:!next.attributes.isPinned,data:{...node.data,...next.attributes}};
                if(next.attributes.isAutoHeight===true||next.attributes.isFolded)updated.height=undefined;
                else if(next.attributes.isAutoHeight===false)updated.height=next.height;
                return updated;
            }));
            return { success: true };
        }
        if (method === 'deleteNoteCardInstance'||method==='batchDeleteNoteCardInstances') {
            const ids=method==='batchDeleteNoteCardInstances'?payload:[typeof payload==='string'?payload:payload.id];
            if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('Invalid instance deletion');
            for(const id of ids)coordinator.stage({ type: 'deleteInstance', id });
            await coordinator.flush();
            for(const id of ids)instances.delete(id);
            store.getState().setNodes(nodes => nodes.filter(node => !ids.includes(node.id)));
            return { success: true };
        }
        const id = payload.id || payload.objectId;
        if (!contents.has(id))
            throw Error('卡片不存在');
        if (method === 'updateNoteCard') {
            if(typeof payload.contentVersionSnapshot?.content==='string')stageVersion(id,payload.contentVersionSnapshot);
            const updates = payload.updates || payload || {};
            const rawDoc = updates.content || updates.document || payload.document || payload.content;
            const document = typeof rawDoc === 'string' ? JSON.parse(rawDoc) : rawDoc;
            if (document)
                acceptContentDocument(id, document, updates.body || payload.body);
            const metadata = { ...((await load()).cardMetadata || []).find(row => row.id === id), ...updates, id };
            delete metadata.content;
            delete metadata.document;
            delete metadata.title;
            delete metadata.body;
            coordinator.stage(catalogOperation('card', metadata));
        }
        else if (method === 'upsertCardRemark')
            coordinator.stage(catalogOperation('remark', { id, objectType: payload.objectType, content: payload.content }));
        else
            throw Error('尚未接入此卡片寫入：' + method);
        await coordinator.flush();
        return { success: true };
    });
}
