// One renderer writer. A timer schedules work; only SQLite's ACK means saved.
export class PersistenceCoordinator {
  constructor({commit,revision=0,beforeFlush=async()=>{},onStatus=()=>{},autoDelay=300}){
    this.commit=commit;this.revision=revision;this.beforeFlush=beforeFlush;this.onStatus=onStatus;this.autoDelay=autoDelay;
    this.pending=new Map();this.inflight=null;this.timer=null;this.lastAck=null;this.error=null;
    this.flushTail=Promise.resolve();
  }
  key(op){return `${op.type==='deleteInstance'?'putInstance':op.type==='deleteCatalog'?'putCatalog':op.type}${op.type==='putCatalog'||op.type==='deleteCatalog'?':'+op.kind:''}:${op.id||op.data.id}`;}
  stage(op){
    this.pending.set(this.key(op),structuredClone(op));this.error=null;this.status();
    clearTimeout(this.timer);this.timer=setTimeout(()=>{this.flush().catch(()=>{});},this.autoDelay);
  }
  status(){this.onStatus({dirty:this.pending.size>0,saving:!!this.inflight,revision:this.revision,error:this.error});}
  flush(){
    clearTimeout(this.timer);this.timer=null;
    // Serialize complete flush operations, not just individual transactions.
    // A second caller must not return the previous ACK while the first drains
    // a newer batch. A failed request does not poison a later explicit retry.
    const task=this.flushTail.catch(()=>{}).then(()=>this.flushPending());
    this.flushTail=task;return task;
  }
  // Rejected explicit commands must not enter the autosave retry queue.
  commitBatch(operations, baseRevision){
    const task=this.flushTail.catch(()=>{}).then(async()=>{
      await this.flushPending();
      if(this.revision!==baseRevision)throw Error('工作區已變更，請重新操作');
      const request={requestId:crypto.randomUUID(),baseRevision,operations};
      this.inflight=this.commit(request);this.status();
      try{return this.accept(await this.inflight,request);}
      finally{this.inflight=null;this.status();}
    });
    this.flushTail=task;
    return task;
  }
  accept(ack,request){
    if(ack.requestId!==request.requestId||!Number.isSafeInteger(ack.revision)||ack.revision<this.revision)throw Error('Invalid commit acknowledgement');
    this.revision=ack.revision;this.lastAck=ack;this.error=null;
    return ack;
  }
  async flushPending(){
    await this.beforeFlush();
    if(this.inflight)await this.inflight;
    while(this.pending.size){
      const batch=this.pending;this.pending=new Map();const request={requestId:crypto.randomUUID(),baseRevision:this.revision,operations:[...batch.values()]};
      this.inflight=this.commit(request);this.status();
      try{
        this.accept(await this.inflight,request);
      }catch(error){
        for(const [key,op]of batch)if(!this.pending.has(key))this.pending.set(key,op);
        this.error=error.message;throw error;
      }finally{this.inflight=null;this.status();}
    }
    return this.lastAck||{revision:this.revision,changed:false};
  }
  dispose(){clearTimeout(this.timer);}
}
