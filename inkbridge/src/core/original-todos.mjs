// SQLite boundary for FlexNote 1.1.70's complete todo page (23997).
// Source contracts: background getTodosFromNotes / updateTodoInNote and
// standalone todo IPC. UI filtering, grouping, sorting and editing stay native.
const clone = value => JSON.parse(JSON.stringify(value));
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const text = node => node?.type === 'text' ? node.text || '' : node?.type === 'list' ? '' : (node?.children || []).map(text).join('');

function checklistItems(document) {
  const result = [];
  function visit(node) {
    if (node?.type === 'list' && node.listType === 'check') {
      for (const [index, item] of (node.children || []).entries()) {
        if (item.type === 'listitem' && text(item).trim()) result.push({item, index, title: text(item).trim()});
      }
    }
    for (const child of node?.children || []) visit(child);
  }
  visit(document?.root);
  return result;
}

export function todosFromDocument(document, source) {
  return checklistItems(parse(document)).map(({item, index, title}, ordinal) => ({
    id: `${source.id}_todo_${ordinal}`, title, completed: !!item.checked,
    dueDate: item.dueDate || item.__dueDate || null, parentId: null, notes: null,
    sourceCardId: source.id, sourceCardTitle: source.title || '', sourceCardType: source.sourceCardType || 'note',
    ...(source.sourceCardDate ? {sourceCardDate: source.sourceCardDate} : {}),
    ...(source.sourceWhiteboardId ? {sourceWhiteboardId: source.sourceWhiteboardId} : {}),
    ...(source.sourceNoteTitle ? {sourceNoteTitle: source.sourceNoteTitle} : {}),
    ...(source.sourceNoteId ? {sourceNoteId: source.sourceNoteId} : {}),
    ...(source.sourceType ? {sourceType: source.sourceType} : {}),
    spaceId: source.spaceId, createdBy: source.createdBy,
    createdTime: source.createdTime, lastEditedTime: source.lastEditedTime,
    order: index, listItemIndex: index,
  }));
}

function sources(graph) {
  const result = [], metadata = new Map((graph.cardMetadata || []).map(row => [row.id, row]));
  const diaries = new Map((graph.quickNotes || []).map(row => [row.id, row]));
  for (const content of graph.contents || []) {
    if (content.kind !== 'text') continue;
    const meta = metadata.get(content.id) || {}, diary = diaries.get(content.id);
    if (meta.isTrashed || diary?.isTrashed) continue;
    result.push({id:content.id, title:diary?.date || content.title, ...meta, ...diary,
      sourceCardType:diary ? 'dailyNote' : 'note', ...(diary ? {sourceCardDate:diary.date} : {}), document:content.document});
  }
  for (const row of graph.textElements || []) {
    const board = (graph.boards || []).find(board => board.id === row.whiteboardId && !board.attributes?.isTrashed);
    if (!board || row.isTrashed) continue;
    result.push({...row, title:board.title || '', sourceCardType:'textElement', sourceWhiteboardId:row.whiteboardId, document:row.content});
  }
  for (const row of graph.noteHighlights || []) {
    if (!row.isTrashed && row.notes) result.push({...row, title:row.title || row.text || '', sourceCardType:'noteHighlight', sourceNoteId:row.sourceId, document:row.notes});
  }
  return result;
}

export function aggregateTodos(graph) {
  const found = [];
  for (const source of sources(graph)) {
    // Match the original aggregation boundary: malformed one note must not hide
    // the remaining tasks, and reads must never repair or rewrite its document.
    try { found.push(...todosFromDocument(source.document, source)); } catch { /* invalid source is left intact */ }
  }
  return [...found, ...(graph.todos || []).map(row => ({...row, completed:!!row.completed, sourceType:'standalone'}))];
}

const fields = ['id','title','completed','dueDate','parentId','notes','spaceId','createdBy','createdTime','lastEditedTime','order'];
function storedTodo(row) {
  if (!row || typeof row.id !== 'string' || !row.id || typeof row.title !== 'string' || !row.title.trim()) throw Error('Invalid todo');
  if (row.dueDate != null && (typeof row.dueDate !== 'string' || !Number.isFinite(Date.parse(row.dueDate)))) throw Error('Invalid todo date');
  if (row.parentId != null && typeof row.parentId !== 'string') throw Error('Invalid todo parent');
  if (row.notes != null && typeof row.notes !== 'string') throw Error('Invalid todo notes');
  if (row.order != null && !Number.isFinite(row.order)) throw Error('Invalid todo order');
  const result = Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key,row[key]]));
  return {...result, completed:!!row.completed, dueDate:row.dueDate || null, parentId:row.parentId || null, notes:row.notes ?? null, order:row.order ?? 0};
}

export function createOriginalTodos({navigate, coordinator, load, catalogOperation, replaceContentDocument, writeSourceDocument}) {
  const reads = new Set(['getTodosFromNotes','getTodos','getTodo','getSubtasks']);
  const writes = new Set(['createTodo','updateTodo','deleteTodo','toggleTodo','updateTodosOrder','updateTodoInNote']);
  const put = row => coordinator.stage(catalogOperation('todo', storedTodo(row)));
  async function read(name, payload) {
    await coordinator.flush();
    const graph = await load(), list = graph.todos || [];
    if (name === 'getTodosFromNotes') return {success:true,data:aggregateTodos(graph)};
    if (name === 'getTodo') {const row = list.find(row => row.id === payload);return row ? {success:true,data:row} : {success:false,error:'Todo not found'};}
    return {success:true,data:list.filter(row => name !== 'getSubtasks' || row.parentId === payload).sort((a,b) => (a.order || 0) - (b.order || 0))};
  }
  function write(name, payload) {
    return navigate(async () => {
      await coordinator.flush();
      const graph = await load(), list = graph.todos || [], now = new Date().toISOString();
      if (name === 'updateTodoInNote') {
        const match = /^(.*)_todo_(\d+)$/.exec(payload?.todoId || '');
        if (!match || !Number.isSafeInteger(Number(match[2])) || typeof payload.completed !== 'boolean') throw Error('Invalid todoId format');
        const source = sources(graph).find(row => row.id === match[1]);
        if (!source) throw Error('Todo source not found');
        const document = clone(parse(source.document)), entry = checklistItems(document)[Number(match[2])];
        if (!entry) throw Error('Todo item not found in note');
        if (!!entry.item.checked === payload.completed) return {success:true,content:document};
        entry.item.checked = payload.completed;
        if (writeSourceDocument) await writeSourceDocument(source.sourceCardType, source.id, document);
        else if (source.sourceCardType === 'note' || source.sourceCardType === 'dailyNote') await replaceContentDocument(source.id, document);
        else throw Error('Todo source writer not connected');
        const diary=graph.quickNotes?.find(row=>row.id===source.id);
        if(diary)coordinator.stage(catalogOperation('quick-note',{...diary,lastEditedTime:now}));
        await coordinator.flush();
        return {success:true,content:document};
      }
      if (name === 'createTodo') {
        if (list.some(row => row.id === payload?.id)) throw Error('Todo already exists');
        if (payload?.parentId && !list.some(row => row.id === payload.parentId)) throw Error('Todo parent not found');
        put({...payload,createdTime:now,lastEditedTime:now});
      } else if (name === 'updateTodosOrder') {
        if (!Array.isArray(payload) || new Set(payload.map(row => row.id)).size !== payload.length) throw Error('Invalid todo order');
        const changes = payload.map((row,order) => {const existing=list.find(item => item.id === row.id);if(!existing)throw Error('Todo not found');return {...existing,order};});
        for (const row of changes) put(row);
      } else {
        const existing = list.find(row => row.id === payload?.id);
        if (!existing) throw Error('Todo not found');
        if (name === 'deleteTodo') {
          const removed = new Set([existing.id]);
          // Native UI permits a subtask; also keep imported deeper trees from
          // leaving orphan tasks when their parent is removed.
          for (let size = -1; size !== removed.size;) {size=removed.size;for(const row of list)if(removed.has(row.parentId))removed.add(row.id);}
          for (const id of removed) coordinator.stage({type:'deleteCatalog',kind:'todo',id});
        } else if (name === 'toggleTodo') put({...existing,completed:!existing.completed,lastEditedTime:now});
        else {
          if (payload.parentId === existing.id) throw Error('Invalid todo parent');
          if (payload.parentId && !list.some(row => row.id === payload.parentId)) throw Error('Todo parent not found');
          let parent = payload.parentId;
          const seen = new Set([existing.id]);
          while (parent) {if(seen.has(parent))throw Error('Cyclic todo parent');seen.add(parent);parent=list.find(row=>row.id===parent)?.parentId;}
          const next=storedTodo({...existing,...payload,lastEditedTime:now});
          const same=fields.filter(key=>key!=='lastEditedTime').every(key=>JSON.stringify(existing[key]??null)===JSON.stringify(next[key]??null));
          if (!same) put(next);
        }
      }
      await coordinator.flush();
      return name === 'toggleTodo' ? {success:true,completed:!list.find(row=>row.id===payload.id).completed} : {success:true};
    });
  }
  return {has:name=>reads.has(name)||writes.has(name),call:(name,payload)=>{
    if (reads.has(name)) return read(name,payload);
    if (writes.has(name)) return write(name,payload);
    throw Error('Unsupported todo service: '+name);
  }};
}
