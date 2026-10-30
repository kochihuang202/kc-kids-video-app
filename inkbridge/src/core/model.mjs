import {SpatialIndex} from './spatial-index.mjs';
export class BoardModel {
  constructor(){this.contents=new Map();this.instances=new Map();this.index=new SpatialIndex();this.boardId='board-main';this.revision=0;}
  addContent(data={},id=crypto.randomUUID()){
    const content={id,title:'新卡片',body:'把想法放在這裡。',tone:'sage',kind:'text',revision:1,...data};
    this.contents.set(id,content);this.revision++;return content;
  }
  addInstance(contentId,x,y,boardId=this.boardId,id=crypto.randomUUID()){
    if(!this.contents.has(contentId))throw Error('Missing content');
    const instance={id,contentId,boardId,x,y,width:260,height:178,z:this.instances.size};
    this.instances.set(id,instance);this.index.upsert(instance);this.revision++;return instance;
  }
  move(id,x,y){const instance=this.instances.get(id);if(!instance)return;Object.assign(instance,{x,y});this.index.upsert(instance);this.revision++;}
  updateContent(id,changes){const content=this.contents.get(id);Object.assign(content,changes,{revision:content.revision+1});this.revision++;}
  remove(id){this.instances.delete(id);this.index.remove(id);this.revision++;}
  hit(point){return this.index.query({...point,width:0,height:0}).map(id=>this.instances.get(id)).filter(i=>i.boardId===this.boardId).sort((a,b)=>b.z-a.z)[0]||null;}
}
const examples=[
  ['從一個想法開始','這是我們自己的無限白板。\n把零散靈感放下，再慢慢連起來。','sage','text'],
  ['留一點空白','空格＋拖曳可以平移。\n滾輪縮放，游標下的內容會留在原位。','sand','text'],
  ['讓想法流動','拖曳卡片，找到舒服的位置。\n雙擊空白處可以新增一張卡片。','rose','text'],
  ['A small landscape','程序化圖形 · CanvasKit\n這不是圖片或 PDF 匯入功能。','blue','image'],
  ['保持輕盈','離開可視範圍的卡片不繪製。\n縮遠時減少細節，靠近再看清楚。','sage','text'],
  ['InkBridge · 墨橋','獨立原始碼，獨立應用程式。\nM1 測試白板：內容暫存在記憶體。','sand','text']
];
export function createScene(count=6){
  const model=new BoardModel();const columns=count<=6?3:10;
  for(let i=0;i<count;i++){
    const item=examples[i%examples.length];
    const content=model.addContent({title:count<=6?item[0]:`${String(i+1).padStart(3,'0')} · ${item[0]}`,body:item[1],tone:item[2],kind:item[3]},`content-${i}`);
    model.addInstance(content.id,(i%columns)*310,Math.floor(i/columns)*230,model.boardId,`instance-${i}`);
  }
  return model;
}
