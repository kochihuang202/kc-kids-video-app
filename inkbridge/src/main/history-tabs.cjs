'use strict';
// SQLite transport for the original1.1.65 historyTabs service contract.
const crypto=require('node:crypto');
const fields=['id','tabGroupId','parentTabId','type','sourceId','subTabIds','title','config','createdBy','createdTime','lastEditedTime','spaceId','icon','color','order'];
const historyMethods=new Set(['getHistoryTabs','createHistoryTab','touchHistoryTab','deleteHistoryTab','updateHistoryTab','updateHistoryTabsOrder']);
function historyTabs(db,method,payload){
 if(!historyMethods.has(method))throw Error('Unsupported history service');
 if(Buffer.byteLength(JSON.stringify(payload??null))>1024*1024)throw Error('History request too large');
 db.exec('CREATE TABLE IF NOT EXISTS historyTabs(id TEXT PRIMARY KEY,tabGroupId TEXT,parentTabId TEXT,type TEXT,sourceId TEXT,subTabIds TEXT,title TEXT,config TEXT,createdBy TEXT,createdTime TEXT,lastEditedTime TEXT,spaceId TEXT,icon TEXT,color TEXT,"order" INTEGER DEFAULT 0)');
 const decode=row=>row?{...row,subTabIds:JSON.parse(row.subTabIds||'[]'),config:JSON.parse(row.config||'{}')}:undefined;
 const id=value=>{if(typeof value!=='string'||!value||value.length>128)throw Error('Invalid history ID');return value;};
 const get=value=>db.prepare('SELECT * FROM historyTabs WHERE id=?').get(id(value));
 const update=(key,changes)=>{const entries=Object.entries(changes).filter(([key])=>fields.includes(key)&&key!=='id');if(entries.length)db.prepare('UPDATE historyTabs SET '+entries.map(([key])=>'"'+key+'"=?').join(',')+' WHERE id=?').run(...entries.map(([key,value])=>key==='config'||key==='subTabIds'?typeof value==='string'?value:JSON.stringify(value):value),id(key));};
 db.exec('BEGIN IMMEDIATE');
 try{
 let result;const now=new Date().toISOString();
 if(method==='getHistoryTabs')result={success:true,data:db.prepare('SELECT * FROM historyTabs ORDER BY "order" ASC').all().map(decode)};
 else if(method==='createHistoryTab'){
  id(payload?.sourceId);const group=String(payload.tabGroupId||'default');
  const existing=db.prepare('SELECT * FROM historyTabs WHERE sourceId=? AND tabGroupId=?').get(payload.sourceId,group);
  if(existing){update(existing.id,{lastEditedTime:now});result={success:true,tab:decode(get(existing.id))};}
  else{
   let deletedTabId=null;
   // Original service:30 tabs, evict least recently touched; never board data.
   if(db.prepare('SELECT count(*) AS total FROM historyTabs').get().total>=30){deletedTabId=db.prepare('SELECT id FROM historyTabs ORDER BY lastEditedTime ASC LIMIT 1').get().id;db.prepare('DELETE FROM historyTabs WHERE id=?').run(deletedTabId);}
   const order=db.prepare('SELECT max("order") AS value FROM historyTabs').get().value+1||0;
   const row={...payload,id:id(payload.id||crypto.randomUUID()),tabGroupId:group,createdTime:payload.createdTime||now,lastEditedTime:payload.lastEditedTime||now,order};
   const values=fields.map(key=>key==='config'||key==='subTabIds'?JSON.stringify(row[key]??(key==='config'?{}:[])):row[key]??null);
   db.prepare('INSERT INTO historyTabs('+fields.map(key=>'"'+key+'"').join(',')+') VALUES('+fields.map(()=>'?').join(',')+')').run(...values);
   result={success:true,tab:decode(get(row.id)),deletedTabId};
  }
 }else if(method==='deleteHistoryTab'){db.prepare('DELETE FROM historyTabs WHERE id=?').run(id(payload));result={success:true};}
 else if(method==='touchHistoryTab'){update(id(payload),{lastEditedTime:now});result={success:true};}
 else if(method==='updateHistoryTab'){if(!get(payload?.id))throw Error('History tab not found');update(payload.id,{...payload,lastEditedTime:now});result={success:true,tab:decode(get(payload.id))};}
 else if(method==='updateHistoryTabsOrder'){if(!Array.isArray(payload)||payload.length>30)throw Error('Invalid history order');for(const item of payload){if(!Number.isSafeInteger(item.order))throw Error('Invalid history order');update(id(item.id),{order:item.order});}result={success:true};}
 db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={historyTabs,historyMethods};
