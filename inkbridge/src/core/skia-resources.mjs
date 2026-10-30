// Only objects we own: canvases borrowed from Surface/Recorder are not owned.
export class SkiaResources {
  constructor(){this.live=new Map();this.created={};this.deleted={};this.errors=[];}
  own(object,type){if(!object)throw Error(`CanvasKit could not create ${type}`);this.live.set(object,type);this.created[type]=(this.created[type]||0)+1;return object;}
  release(object){if(!object||!this.live.has(object))return;const type=this.live.get(object);object.delete();this.live.delete(object);this.deleted[type]=(this.deleted[type]||0)+1;}
  snapshot(){const live={};for(const type of this.live.values())live[type]=(live[type]||0)+1;return {live,created:{...this.created},deleted:{...this.deleted},errors:[...this.errors]};}
  releaseAll(){for(const object of [...this.live.keys()])try{this.release(object);}catch(error){this.errors.push(error.message);}}
}
