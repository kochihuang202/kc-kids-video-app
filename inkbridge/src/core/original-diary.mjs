// SQLite boundary for FlexNote 1.1.70 diary page 55411 and background quick-note
// services. Rich text stays in contents; date records share the normal snapshot.
import {emptyNote} from './original-catalog.mjs';
const names=new Set(['getQuickNotesList','getQuickNotesByDates','searchQuickNotes','getQuickNotesStats','getDailyNoteById','getQuickNoteById','upsertQuickNote','updateQuickNote','deleteQuickNote','batchUpsertQuickNotes']);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const dateKey=value=>{const key=value instanceof Date?localDay(value):String(value??'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||new Date(key+'T00:00:00Z').toISOString().slice(0,10)!==key)throw Error('日記日期無效');return key;};
const localDay=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dayNumber=key=>Date.parse(key+'T00:00:00Z')/86400000;
export function diaryRecord(graph,content){const meta=graph.quickNotes?.find(row=>row.id===content.id);return meta?{...meta,id:content.id,content:content.document,type:'DailyNote'}:null;}
export function diaryRecords(graph){return (graph.quickNotes||[]).filter(row=>!row.isTrashed).map(row=>{const content=graph.contents.find(content=>content.id===row.id);return content?diaryRecord(graph,content):null;}).filter(Boolean);}
const serialized=row=>({...row,content:JSON.stringify(row.content)});
const sameFields=(left,right)=>{const keys=new Set([...Object.keys(left),...Object.keys(right)]);return [...keys].every(key=>JSON.stringify(left[key])===JSON.stringify(right[key]));};
export function diaryStats(graph,today=localDay(new Date())){
 const rows=diaryRecords(graph).filter(row=>!emptyNote(row.content)),dates=[...new Set(rows.map(row=>row.date))].sort(),written=new Set(dates);
 let longest=0,run=0,previous=null;for(const date of dates){const value=dayNumber(date);run=previous!==null&&value===previous+1?run+1:1;longest=Math.max(longest,run);previous=value;}
 let current=0;for(let day=dayNumber(today);written.has(new Date(day*86400000).toISOString().slice(0,10));day--)current++;
 const counts=new Map(),ids=new Set(rows.map(row=>row.id));for(const link of graph.cardTags||[])if(ids.has(link.cardId)&&link.cardType==='DailyNote')counts.set(link.tagId,(counts.get(link.tagId)||0)+1);
 return {writtenDays:dates.length,calendarSpanDays:dates.length?dayNumber(today)-dayNumber(dates[0])+1:0,currentStreak:current,longestStreak:longest,writtenDates:dates,topTags:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,count])=>({id,name:graph.tags?.find(tag=>tag.id===id)?.name||id,count}))};
}
export function createOriginalDiary({navigate,coordinator,load,contents,putContent,acceptContentDocument,replaceContentDocument,catalogOperation,now=()=>new Date().toISOString()}){
 async function upsert(graph,date,input,external=false){
  date=dateKey(date);const previous=(graph.quickNotes||[]).find(row=>row.date===date),id=previous?.id||input.id||crypto.randomUUID(),old=contents.get(id)||graph.contents.find(row=>row.id===id),document=parse(input.content??old?.document);
  if(!document?.root)throw Error('日記內容無效');
  // Editor initialization is a read, including an untouched empty date.
  if(!previous&&emptyNote(document))return false;
  const {content:ignored,type:ignoredType,title:ignoredTitle,...fields}=input;
  const editable={...previous,...fields,id,date,isTrashed:false};delete editable.lastEditedTime;
  const oldComparable={...previous};delete oldComparable.lastEditedTime;
  if(old&&JSON.stringify(old.document)===JSON.stringify(document)&&sameFields(oldComparable,editable))return false;
  const stamp=now(),meta={createdTime:previous?.createdTime||input.createdTime||stamp,...editable,lastEditedTime:stamp};
  if(old){if(external&&replaceContentDocument)replaceContentDocument(id,document);else if(acceptContentDocument)acceptContentDocument(id,document);else putContent({...old,document});}
  else putContent({id,kind:'text',tone:'sage',title:date,document});
  coordinator.stage(catalogOperation('quick-note',meta));
  // Update the transaction-local graph so batch imports preserve date uniqueness.
  graph.quickNotes=(graph.quickNotes||[]).filter(row=>row.id!==id).concat(meta);
  const next=contents.get(id)||{...old,id,kind:'text',document};graph.contents=graph.contents.filter(row=>row.id!==id).concat(next);
  return true;
 }
 return {has:name=>names.has(name),call:(name,payload)=>navigate(async()=>{
  if(!names.has(name))throw Error('Unsupported diary service '+name);
  await coordinator.flush();const graph=await load(),rows=diaryRecords(graph);
  if(name==='getQuickNotesList'){const month=dateKey(payload?.date).slice(0,7);return rows.filter(row=>row.date.startsWith(month)).sort((a,b)=>String(b.lastEditedTime).localeCompare(String(a.lastEditedTime))).map(serialized);}
  if(name==='getQuickNotesByDates'){const dates=new Set(payload?.dates||[]);return rows.filter(row=>dates.has(row.date)).sort((a,b)=>a.date.localeCompare(b.date)).map(serialized);}
  if(name==='searchQuickNotes'){const term=String(payload?.keyword||'').trim().toLocaleLowerCase();return term?rows.filter(row=>JSON.stringify(row.content).toLocaleLowerCase().includes(term)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,200).map(serialized):[];}
  if(name==='getQuickNotesStats')return diaryStats(graph,localDay(new Date(now())));
  if(name==='getDailyNoteById'||name==='getQuickNoteById'){const id=typeof payload==='string'?payload:payload?.id,row=rows.find(row=>row.id===id);return name==='getDailyNoteById'?{success:!!row,data:row||null}:{success:!!row,quickNote:row||null,...(!row?{error:'QuickNote not found'}:{})};}
  if(name==='deleteQuickNote'){const row=(graph.quickNotes||[]).find(row=>row.date===dateKey(payload?.date));if(row&&!row.isTrashed){coordinator.stage(catalogOperation('quick-note',{...row,isTrashed:true,lastEditedTime:now()}));await coordinator.flush();}return true;}
  if(name==='upsertQuickNote')await upsert(graph,payload?.date,payload?.quickNote||{});
  if(name==='updateQuickNote'){const row=(graph.quickNotes||[]).find(row=>row.id===payload?.id);if(!row)throw Error('日記不存在');await upsert(graph,row.date,{...row,...payload.updates},true);}
  if(name==='batchUpsertQuickNotes'){if(!Array.isArray(payload))throw Error('日記匯入格式無效');for(const row of payload)await upsert(graph,row.date,row,true);}
  await coordinator.flush();return name==='batchUpsertQuickNotes'?{success:true}:true;
 })};
}
