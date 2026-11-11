// Owned SQLite graph -> native 67259 share DTO boundary. Rendering stays native.
export function makePayload(publication,boardId){
 const g=publication.graph,board=g.boards.find(b=>b.id===boardId);if(!board)throw Error('此白板不在分享包中');
 const metadata=new Map(g.cardMetadata.map(c=>[c.id,c])),contents=new Map(g.contents.map(c=>[c.id,c]));
 const noteCards=[],mediaCards=[],pdfCards=[],noteCardInstances=[],mediaCardInstances=[],pdfCardInstances=[];
 for(const row of g.instances.filter(i=>i.boardId===boardId)){
  const c=contents.get(row.contentId),meta=metadata.get(c.id)||{},item={...meta,id:c.id,title:c.title,content:c.document,propertiesConfig:[],insights:[],isTrashed:false};
  const instance={...row.attributes,id:row.id,objectId:c.id,whiteboardId:boardId,x:row.x,y:row.y,width:row.width,height:row.height,parentId:row.parentId||'',isAutoHeight:false};
  if(c.kind==='text'){item.type='NoteCard';noteCards.push(item);noteCardInstances.push(instance);}
  else if(c.kind==='image'){item.type='image';mediaCards.push(item);mediaCardInstances.push(instance);}
  else if(c.kind==='pdf'){item.type='PDFCard';pdfCards.push(item);pdfCardInstances.push(instance);}
  else throw Error('尚未支援分享的卡片種類：'+c.kind);
 }
 const boardRecord=b=>({...b.attributes,id:b.id,name:b.title,title:b.title,shareId:b.isUnshared?null:b.id,isUnshared:!!b.isUnshared,...(b.attributes?.inkbridgePreviewFileId?{backgroundImage:'flexnote://file/'+b.attributes.inkbridgePreviewFileId}:{})});
 const unsharedBoards=[...new Set(g.whiteboardInstances.filter(r=>r.isUnshared).map(r=>r.whiteboardId))].map(id=>({id,title:'未分享',isUnshared:true,attributes:{}}));
 const scoped=name=>(g[name]||[]).filter(r=>(r.whiteboardId||r.boardId)===boardId);
 const empty=()=>({highlights:[],highlightInstances:[],relatedMindmaps:[],relatedPdfCards:[],relatedMediaCards:[]});
 const nestedShareMap=Object.fromEntries(publication.boardIds.map(id=>[id,id]));
 return {name:board.title,nestedShareMap,payload:{
  selfWhiteboard:boardRecord(board),nestedShareMap,
  cardResp:{noteCards,noteCardInstances,relatedCards:[],relatedMindmaps:[],relatedPdfCards:[],relatedMediaCards:[],relatedHighlights:[]},
  edgeResp:{data:scoped('connections')},sections:scoped('sections'),textElements:scoped('textElements'),drawingStrokes:scoped('drawingStrokes'),
  mindmaps:g.mindmaps.map(m=>({...m,nodes:g.mindmapNodes.filter(n=>n.mindMapId===m.id)})),mindmapInstances:scoped('mindmapInstances'),
  pdfCards,pdfCardInstances,pdfFiles:g.files,mediaCards,mediaCardInstances,
  highlightResp:{...empty(),relatedCards:[],pdfCardsFromHighlight:[]},videoHighlightResp:{...empty(),videoCardsFromHighlight:[]},audioHighlightResp:{...empty(),audioCardsFromHighlight:[]},noteHighlightResp:{...empty(),noteCardsFromHighlight:[]},
  whiteboardResp:{whiteboards:[...g.boards,...unsharedBoards].map(boardRecord),whiteboardInstances:g.whiteboardInstances.filter(r=>r.containerId===boardId)},
  fileInstances:{data:[]},websiteCardResp:{websiteCards:[],websiteInstances:[]},dailyNoteInstances:[]
 }};
}
