// SQLite DTO/service boundary for the complete FlexNote 1.1.70 tag collection
// parent (27677). The original page and property editors own presentation.
import { noteRecord, attachmentRecord, websiteRecord } from './original-catalog.mjs';
import { videoRecord } from './original-video.mjs';
import { diaryRecord } from './original-diary.mjs';
import { cardLinks } from './original-connections.mjs';
const names = new Set(['getTag', 'getTagCollectionByTagId', 'createCollection', 'updateCollection', 'getCollectionViewList', 'createCollectionView', 'updateCollectionView', 'deleteCollectionView', 'createProperty', 'getPropertyOverview', 'duplicateProperty', 'renamePropertyInCollection', 'updateProperty', 'deleteProperty', 'getPropertyByIds', 'updatePropertyValue', 'getTagPropertyList']);
const parse = (value, fallback) => typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
const clone = value => structuredClone(value);
const id = () => globalThis.crypto.randomUUID();
const collectionDTO = row => ({ ...row, viewIds: parse(row.viewIds, []), queryConfig: parse(row.queryConfig, {}), titlePropertyConfig: parse(row.titlePropertyConfig, {}) });
const viewDTO = row => ({ ...row, config: parse(row.config, {}), filterConfig: parse(row.filterConfig, {}), sortConfig: parse(row.sortConfig, {}), objectSort: parse(row.objectSort, []) });
const propertyDTO = row => ({ ...row, config: parse(row.config, {}) });
const stableJSON=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
function comparableView(row){
 const value=clone(row);
 if(Array.isArray(value.config?.tableProperties))value.config.tableProperties=value.config.tableProperties.map((column,index)=>{const next={...column};if(next.sortIndex===index)delete next.sortIndex;if(next.sort==null)delete next.sort;if(next.pinned==null)delete next.pinned;return next;});
 return value;
}
const arrays = { collection: 'collections', 'collection-view': 'collectionViews', property: 'properties', 'collection-property': 'collectionPropertyRelations', 'object-property': 'objectPropertyRelations' };
const notTrashed = row => row && !row.isTrashed;
function record(graph, cardId) {
    const content = graph.contents.find(row => row.id === cardId);
    if (content) {
        if (graph.quickNotes?.some(row => row.id === cardId)) {
            const row = diaryRecord(graph, content);
            return row ? { ...row, title: row.date, type: 'DailyNote' } : null;
        }
        return content.kind === 'text' ? noteRecord(graph, content) : content.kind === 'html' ? websiteRecord(graph, content) : content.kind === 'video' ? videoRecord(graph, content) : attachmentRecord(graph, content);
    }
    const board = graph.boards.find(row => row.id === cardId);
    if (board)
        return { ...board.attributes, id: board.id, name: board.title, title: board.title, type: 'Whiteboard' };
    const mindmap = graph.mindmaps?.find(row => row.id === cardId);
    if (mindmap)
        return { ...mindmap, type: 'Mindmap' };
    const highlight = graph.videoHighlights?.find(row => row.id === cardId);
    if (highlight) {
        const source = graph.cardMetadata?.find(row => row.fileId === highlight.sourceId);
        return { ...highlight, type: 'VideoHighlight', sourceVideo: source };
    }
    return null;
}
function collectionData(graph, tagId) {
    const tag = graph.tags?.find(row => row.id === tagId);
    if (!tag)
        throw Error('標籤不存在');
    const collection = (graph.collections || []).map(collectionDTO).find(row => row.queryConfig.type === 'tag' && row.queryConfig.id === tagId);
    if (!collection)
        throw Error('標籤集合不存在');
    const relations = (graph.collectionPropertyRelations || []).filter(row => row.collectionId === collection.id), propertyIds = new Set(relations.map(row => row.propertyId));
    const propertyList = (graph.properties || []).filter(row => propertyIds.has(row.id)).map(propertyDTO), propertyValueList = (graph.objectPropertyRelations || []).filter(row => propertyIds.has(row.propertyId));
    const cardTagList = (graph.cardTags || []).filter(row => row.tagId === tagId).map(row => ({ ...row }));
    const cardIds = new Set(cardTagList.map(row => row.cardId));
    for (const value of propertyValueList) {
        const property = propertyList.find(row => row.id === value.propertyId);
        if (property?.type === 'Relation' && value.value !== '')
            for (const target of parse(value.value, []))
                if (target?.objectId)
                    cardIds.add(target.objectId);
    }
    const records = [...cardIds].map(cardId => record(graph, cardId)).filter(notTrashed);
    const cardTagsByCardId = Object.create(null);
    for (const link of graph.cardTags || []) {
        if (!cardIds.has(link.cardId))
            continue;
        const t = graph.tags?.find(row => row.id === link.tagId);
        if (!t)
            continue;
        const key = link.blockId ? `${link.cardId}::${link.blockId}` : link.cardId;
        (cardTagsByCardId[key] ||= []).push({ id: t.id, name: t.name, color: t.color || 'default' });
    }
    if (propertyList.some(row => row.type === 'ReferenceCount'))
        for (const link of cardTagList)
            link.referenceData = cardLinks(graph, link.cardId);
    if (propertyList.some(row => row.type === 'AppearedInWhiteboards'))
        for (const link of cardTagList)
            link.appearedInWhiteboards = record(graph, link.cardId)?.apprearedInWhiteboards || [];
    const ofType = type => records.filter(row => row.type === type);
    return { collection, collectionViews: collection.viewIds.map(viewId => graph.collectionViews?.find(row => row.id === viewId && row.collectionId === collection.id)).filter(Boolean).map(viewDTO), propertyList, cardTagList, cardTagsByCardId, relatedNoteCardList: ofType('NoteCard'), relatedPdfCardList: ofType('PDFCard'), relatedHighlightCardList: ofType('Highlight'), relatedMediaCardList: records.filter(row => ['MediaCard', 'image', 'video', 'audio'].includes(row.type)), relatedMindmapCardList: ofType('Mindmap'), relatedWhiteboardCardList: ofType('Whiteboard'), relatedDailyNotesCardList: ofType('DailyNote'), relatedWebsiteCardList: ofType('WebsiteCard'), relatedVideoHighlightCardList: ofType('VideoHighlight'), relatedAudioHighlightCardList: ofType('AudioHighlight'), relatedNoteHighlightCardList: ofType('NoteHighlight'), propertyValueList };
}
function replaceProperty(config, oldId, newId) {
    const next = clone(config);
    if (Array.isArray(next.tableProperties))
        next.tableProperties = next.tableProperties.map(row => row.id === oldId ? { ...row, id: newId } : row);
    if (next.kanban?.columnBy === oldId)
        next.kanban.columnBy = newId;
    if (Array.isArray(next.databaseFilter?.rules))
        next.databaseFilter.rules = next.databaseFilter.rules.map(row => row.propertyId === oldId ? { ...row, propertyId: newId } : row);
    return next;
}
export function createOriginalTagCollections({ r, projectTags, navigate, coordinator, load, catalogOperation, now = () => new Date().toISOString() }) {
    const virtual = new Map();
    async function defaults(graph) {
        const bootstrap = [];
        if (projectTags) {
            const dto = await projectTags(graph), presentTags = new Set((graph.tags || []).map(row => row.id)), presentGroups = new Set((graph.tagGroups || []).map(row => row.id));
            graph.tags = dto.tagList.map(({ cards, ...row }) => row);
            graph.tagGroups = dto.tagGroups;
            for (const row of graph.tags)
                if (!presentTags.has(row.id))
                    bootstrap.push(catalogOperation('tag', row));
            for (const row of graph.tagGroups)
                if (!presentGroups.has(row.id))
                    bootstrap.push(catalogOperation('tag-group', row));
        }
        // Original initTagState makes each system tag's Table collection as well.
        // Old InkBridge releases omitted it. Reuse the native constructors, but
        // project stable dependency IDs until a real edit commits the whole batch.
        for (const tag of graph.tags || []) {
            if (graph.collections.some(row => { const query = parse(row.queryConfig, {}); return query.type === 'tag' && query.id === tag.id; }))
                continue;
            if (!r)
                continue;
            const key = graph.workspaceId + '|' + tag.id;
            if (!virtual.has(key)) {
                const hash = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map(byte => byte.toString(16).padStart(2, '0')).join(''), factory = r(19281).YH;
                const collectionId = 'tag-collection:' + hash, viewId = 'tag-view:' + hash, time = tag.createdTime || now();
                const view = { ...factory.newCollectionView({ name: 'Table', collectionId, type: 'table' }), id: viewId, createdTime: time, lastEditedTime: time, spaceId: graph.workspaceId };
                const collection = { ...factory.newCollection({ viewIds: [viewId], currentViewId: viewId, queryConfig: { id: tag.id, type: 'tag' }, titlePropertyConfig: { name: 'Name' } }), id: collectionId, createdTime: time, lastEditedTime: time, spaceId: graph.workspaceId };
                virtual.set(key, { collection, view });
            }
            const { collection, view } = clone(virtual.get(key));
            graph.collections.push(collection);
            graph.collectionViews.push(view);
            bootstrap.push(catalogOperation('collection', collection), catalogOperation('collection-view', view));
        }
        return bootstrap;
    }
    const call = (name, payload = {}) => navigate(async () => {
        if (!names.has(name))
            throw Error('Unsupported tag collection service: ' + name);
        await coordinator.flush();
        const graph = clone(await load()), pending = [];
        for (const field of Object.values(arrays))
            graph[field] ||= [];
        const bootstrap = await defaults(graph);
        const put = (kind, data) => { const rows = graph[arrays[kind]], index = rows.findIndex(row => row.id === data.id); if (index < 0)
            rows.push(data);
        else
            rows[index] = data; pending.push(catalogOperation(kind, data)); return data; };
        const remove = (kind, key) => { graph[arrays[kind]] = graph[arrays[kind]].filter(row => row.id !== key); pending.push({ type: 'deleteCatalog', kind, id: key }); };
        const requireRow = (kind, key) => { const row = graph[arrays[kind]].find(row => row.id === key); if (!row)
            throw Error('資料不存在: ' + kind); return row; };
        const change = (kind, key, updates) => { const old = requireRow(kind, key), next = { ...old, ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)), id: key }; const clean=value=>kind==='collection-view'?comparableView(value):value;if (stableJSON(clean(old)) === stableJSON(clean(next)))
            return old; return put(kind, { ...next, lastEditedTime: now() }); };
        const metadata = () => ({ id: id(), createdBy: '', createdTime: now(), lastEditedTime: now(), spaceId: graph.workspaceId });
        const propertyRelations = collectionId => graph.collectionPropertyRelations.filter(row => row.collectionId === collectionId);
        const attachProperty = (collectionId, propertyId, userId = '') => { requireRow('collection', collectionId); requireRow('property', propertyId); if (!graph.collectionPropertyRelations.some(row => row.collectionId === collectionId && row.propertyId === propertyId))
            put('collection-property', { ...metadata(), createdBy: userId, collectionId, propertyId }); };
        let result = { success: true };
        if (name === 'getTag')
            return { success: true, data: graph.tags?.find(row => row.id === (typeof payload === 'string' ? payload : payload.tagId)) || null };
        if (name === 'getTagCollectionByTagId')
            return { success: true, data: collectionData(graph, payload.tagId) };
        if (name === 'getCollectionViewList')
            return { success: true, data: graph.collectionViews.map(viewDTO) };
        if (name === 'getPropertyByIds')
            return { success: true, data: { properties: graph.properties.filter(row => payload.includes(row.id)).map(propertyDTO) } };
        if (name === 'getTagPropertyList') {
            const cardId = typeof payload === 'string' ? payload : payload.cardId, tags = new Set(typeof payload === 'string' ? (graph.cardTags || []).filter(row => row.cardId === cardId).map(row => row.tagId) : payload.tagIds || []), collections = graph.collections.map(collectionDTO).filter(row => tags.has(row.queryConfig.id)), ids = new Set(collections.flatMap(row => propertyRelations(row.id).map(link => link.propertyId)));
            return { success: true, data: { propertyList: graph.properties.filter(row => ids.has(row.id)).map(propertyDTO), propertyValues: graph.objectPropertyRelations.filter(row => row.objectId === cardId) } };
        }
        if (name === 'getPropertyOverview')
            return { success: true, data: graph.properties.map(propertyDTO).map(property => ({ ...property, options: Array.isArray(property.config.options) ? property.config.options.map(option => ({ id: String(option.id), name: String(option.name || ''), color: option.color || '' })) : [], usages: graph.collections.map(collectionDTO).filter(row => propertyRelations(row.id).some(link => link.propertyId === property.id)).map(collection => ({ tagId: collection.queryConfig.id, tagName: graph.tags?.find(tag => tag.id === collection.queryConfig.id)?.name || '', collectionId: collection.id, views: graph.collectionViews.filter(row => row.collectionId === collection.id).map(viewDTO).filter(view => view.config.tableProperties?.some(row => row.id === property.id) || view.config.kanban?.columnBy === property.id || view.config.databaseFilter?.rules?.some(row => row.propertyId === property.id)).map(view => ({ id: view.id, name: view.name || '', type: view.type || '' })) })).sort((a, b) => a.tagName.localeCompare(b.tagName, 'zh')) })).sort((a, b) => a.name.localeCompare(b.name, 'zh')) };
        if (name === 'createCollection') {
            if (graph.collections.some(row => row.id === payload.id))
                throw Error('集合已存在');
            put('collection', collectionDTO(payload));
        }
        else if (name === 'updateCollection') {
            const next = collectionDTO({ ...requireRow('collection', payload.id), ...payload });
            if (next.viewIds.some(viewId => !graph.collectionViews.some(row => row.id === viewId && row.collectionId === next.id)))
                throw Error('集合檢視不存在');
            if (next.currentViewId && !next.viewIds.includes(next.currentViewId) || next.defaultViewId && !next.viewIds.includes(next.defaultViewId))
                throw Error('集合檢視不屬於此集合');
            change('collection', next.id, next);
        }
        else if (name === 'updateCollectionView') {
            const next = viewDTO({ ...requireRow('collection-view', payload.id), ...payload });
            change('collection-view', next.id, next);
        }
        else if (name === 'createCollectionView') {
            const collection = collectionDTO(requireRow('collection', payload.collectionId)), view = viewDTO(payload);
            if (graph.collectionViews.some(row => row.id === view.id))
                throw Error('檢視已存在');
            if (view.type === 'kanban') {
                const attached = new Set(propertyRelations(collection.id).map(row => row.propertyId));
                let property = graph.properties.find(row => attached.has(row.id) && row.type === 'Select');
                if (!property) {
                    property = { ...metadata(), name: 'Status', type: 'Select', config: { options: [] }, createdBy: view.createdBy || '' };
                    put('property', property);
                    attachProperty(collection.id, property.id, view.createdBy);
                    for (const oldView of graph.collectionViews.filter(row => row.collectionId === collection.id).map(viewDTO))
                        change('collection-view', oldView.id, { config: { ...oldView.config, tableProperties: [...(oldView.config.tableProperties || []), { id: property.id, width: 120, shouldWrap: false }] } });
                }
                view.config.kanban = { columnBy: property.id, options: [{ id: 'none' }, ...(propertyDTO(property).config.options || []).map(option => ({ id: option.id }))] };
            }
            put('collection-view', view);
            const next = change('collection', collection.id, { viewIds: [...collection.viewIds, view.id] });
            result = { success: true, collection: collectionDTO(next), collectionView: view, propertyList: graph.properties.filter(row => propertyRelations(collection.id).some(link => link.propertyId === row.id)).map(propertyDTO) };
        }
        else if (name === 'deleteCollectionView') {
            const view = requireRow('collection-view', payload.collectionViewId), collection = collectionDTO(requireRow('collection', payload.collectionId));
            if (view.collectionId !== collection.id)
                throw Error('檢視不屬於此集合');
            const viewIds = collection.viewIds.filter(key => key !== view.id);
            if (!viewIds.length)
                throw Error('至少保留一個集合檢視');
            remove('collection-view', view.id);
            result = { success: true, collection: collectionDTO(change('collection', collection.id, { viewIds, currentViewId: collection.currentViewId === view.id ? viewIds[0] : collection.currentViewId, defaultViewId: collection.defaultViewId === view.id ? null : collection.defaultViewId })) };
        }
        else if (name === 'createProperty') {
            const property = propertyDTO(payload.property), exists = graph.properties.some(row => row.id === property.id);
            requireRow('collection', payload.collectionId);
            if (payload.usePrevious && !exists)
                throw Error('屬性不存在');
            if (!exists)
                put('property', property);
            attachProperty(payload.collectionId, property.id, payload.userId);
            if (payload.collectionViewId) {
                const view = viewDTO(requireRow('collection-view', payload.collectionViewId));
                if (view.collectionId !== payload.collectionId)
                    throw Error('檢視不屬於此集合');
                if (!view.config.tableProperties?.some(row => row.id === property.id))
                    change('collection-view', view.id, { config: { ...view.config, tableProperties: [...(view.config.tableProperties || []), { id: property.id, width: payload.width ?? 120, shouldWrap: false }] } });
            }
        }
        else if (name === 'duplicateProperty') {
            const source = propertyDTO(requireRow('property', payload.propertyId)), config = clone(source.config);
            if (['Select', 'MultiSelect'].includes(source.type) && Array.isArray(config.options))
                config.options = config.options.map(option => ({ ...option, id: id() }));
            const property = { ...source, ...metadata(), name: String(payload.name || source.name).trim(), config };
            put('property', property);
            result = { success: true, property };
        }
        else if (name === 'renamePropertyInCollection') {
            const source = propertyDTO(requireRow('property', payload.propertyId)), name = String(payload.name || '').trim();
            if (!name)
                throw Error('名稱不能為空');
            if (name === source.name)
                result = { success: true, forked: false, property: source };
            else if (!graph.collectionPropertyRelations.some(row => row.propertyId === source.id && row.collectionId !== payload.collectionId))
                result = { success: true, forked: false, property: change('property', source.id, { name }) };
            else {
                const collection = collectionDTO(requireRow('collection', payload.collectionId)), property = { ...source, ...metadata(), name };
                put('property', property);
                const ids = new Set((graph.cardTags || []).filter(row => row.tagId === collection.queryConfig.id).map(row => row.cardId));
                for (const value of [...graph.objectPropertyRelations])
                    if (value.propertyId === source.id && ids.has(value.objectId))
                        put('object-property', { ...value, ...metadata(), propertyId: property.id });
                const links = propertyRelations(collection.id).filter(row => row.propertyId === source.id);
                if (!links.length)
                    attachProperty(collection.id, property.id);
                else
                    for (const link of links)
                        change('collection-property', link.id, { propertyId: property.id });
                for (const row of graph.collectionViews.filter(row => row.collectionId === collection.id).map(viewDTO)) {
                    const filterConfig = { ...row.filterConfig };
                    if (Object.hasOwn(filterConfig, source.id)) {
                        filterConfig[property.id] = filterConfig[source.id];
                        delete filterConfig[source.id];
                    }
                    change('collection-view', row.id, { config: replaceProperty(row.config, source.id, property.id), filterConfig });
                }
                result = { success: true, forked: true, previousPropertyId: source.id, property };
            }
        }
        else if (name === 'updateProperty') {
            const property = propertyDTO({ ...requireRow('property', payload.id), ...payload });
            if (['Select', 'MultiSelect'].includes(property.type)) {
                const options = property.config.options || [], ids = new Set(options.map(option => option.id));
                for (const value of [...graph.objectPropertyRelations])
                    if (value.propertyId === property.id) {
                        const next = parse(value.value || '[]', []);
                        if (Array.isArray(next)) {
                            const filtered = next.filter(key => ids.has(key));
                            if (filtered.length !== next.length)
                                change('object-property', value.id, { value: JSON.stringify(filtered) });
                        }
                    }
                if (property.type === 'Select') {
                    const collections = new Set(graph.collectionPropertyRelations.filter(row => row.propertyId === property.id).map(row => row.collectionId));
                    for (const view of graph.collectionViews.filter(row => collections.has(row.collectionId) && row.type === 'kanban').map(viewDTO)) {
                        const previous = view.config.kanban?.options || [];
                        change('collection-view', view.id, { config: { ...view.config, kanban: { ...view.config.kanban, options: [...previous.filter(option => option.id === 'none' || ids.has(option.id)), ...options.filter(option => !previous.some(old => old.id === option.id))] } } });
                    }
                }
            }
            result = { success: true, property: propertyDTO(change('property', property.id, property)) };
        }
        else if (name === 'deleteProperty') {
            const propertyId = typeof payload === 'string' ? payload : payload.id;
            requireRow('property', propertyId);
            remove('property', propertyId);
            for (const [kind, field] of [['collection-property', 'collectionPropertyRelations'], ['object-property', 'objectPropertyRelations']])
                for (const link of [...graph[field]])
                    if (link.propertyId === propertyId)
                        remove(kind, link.id);
            for (const view of graph.collectionViews.map(viewDTO)) {
                const tableProperties = (view.config.tableProperties || []).filter(row => row.id !== propertyId), filterConfig = { ...view.filterConfig };
                delete filterConfig[propertyId];
                if (tableProperties.length !== (view.config.tableProperties || []).length || JSON.stringify(filterConfig) !== JSON.stringify(view.filterConfig))
                    change('collection-view', view.id, { config: { ...view.config, tableProperties }, filterConfig });
            }
        }
        else if (name === 'updatePropertyValue') {
            requireRow('property', payload.propertyId);
            if (!record(graph, payload.objectId))
                throw Error('卡片不存在');
            const value = typeof payload.value === 'string' ? payload.value : JSON.stringify(payload.value);
            if (value === undefined)
                throw Error('屬性值無效');
            const existing = graph.objectPropertyRelations.find(row => row.propertyId === payload.propertyId && row.objectId === payload.objectId);
            if (existing)
                change('object-property', existing.id, { value });
            else
                put('object-property', { ...metadata(), propertyId: payload.propertyId, objectId: payload.objectId, value });
        }
        // A rejected request never stages the first half of a related mutation.
        if (pending.length)
            for (const operation of [...bootstrap, ...pending])
                coordinator.stage(operation);
        await coordinator.flush();
        return result;
    });
    return { has: name => names.has(name), call };
}
