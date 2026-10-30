import {intersects} from './geometry.mjs';
export class SpatialIndex {
  constructor(cellSize=512){this.cellSize=cellSize;this.cells=new Map();this.entries=new Map();}
  keys(rect){
    const keys=[];const size=this.cellSize;
    for(let y=Math.floor(rect.y/size);y<=Math.floor((rect.y+rect.height)/size);y++)
      for(let x=Math.floor(rect.x/size);x<=Math.floor((rect.x+rect.width)/size);x++)keys.push(`${x}:${y}`);
    return keys;
  }
  upsert(rect){
    this.remove(rect.id);const entry={...rect,keys:this.keys(rect)};this.entries.set(rect.id,entry);
    for(const key of entry.keys){if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(rect.id);}
  }
  remove(id){
    const old=this.entries.get(id);if(!old)return;
    for(const key of old.keys){const cell=this.cells.get(key);cell.delete(id);if(!cell.size)this.cells.delete(key);}
    this.entries.delete(id);
  }
  query(bounds){
    const found=new Set();
    for(const key of this.keys(bounds))for(const id of this.cells.get(key)||[])
      if(!found.has(id)&&intersects(this.entries.get(id),bounds))found.add(id);
    return [...found];
  }
}
