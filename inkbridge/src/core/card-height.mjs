// World-coordinate pixels; independent of camera zoom. Only explicitly managed
// placements follow this policy. Existing and manually sized cards are untouched.
export const DEFAULT_CARD_MAX_HEIGHT=832;
export function cardMaxHeight(value){return Number.isInteger(value)&&value>=160&&value<=10000?value:DEFAULT_CARD_MAX_HEIGHT;}
export function fitCardHeight(node,engine,context,limit){
 if(node.type!=='NoteCard'||!node.data?.inkbridgeManagedHeight||node.data.isFolded)return node;
 const natural={...node,height:undefined,isFixedHeight:false,data:{...node.data,height:undefined,isAutoHeight:true,lastEditedTime:'inkbridge-measure:'+engine.getContentIdentity(node.data.content)}};
 const height=Math.min(cardMaxHeight(limit),Math.max(80,Math.ceil(engine.getNodeBounds(natural,context).height)));
 return {...node,height,isFixedHeight:true,data:{...node.data,height,isAutoHeight:false}};
}
