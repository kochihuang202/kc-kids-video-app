export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export const worldToScreen=(p,v)=>({x:p.x*v.zoom+v.x,y:p.y*v.zoom+v.y});
export const screenToWorld=(p,v)=>({x:(p.x-v.x)/v.zoom,y:(p.y-v.y)/v.zoom});
export function zoomAt(view,point,requested){
  const world=screenToWorld(point,view),zoom=clamp(requested,.1,3);
  return {zoom,x:point.x-world.x*zoom,y:point.y-world.y*zoom};
}
export function visibleBounds(view,width,height,margin=100){
  return {x:(-view.x-margin)/view.zoom,y:(-view.y-margin)/view.zoom,
    width:(width+margin*2)/view.zoom,height:(height+margin*2)/view.zoom};
}
export const intersects=(a,b)=>a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y;
// Projected card width determines readability; these are our own M1 thresholds.
export const lodFor=(width,zoom)=>width*zoom>=200?'high':width*zoom>=110?'medium':width*zoom>=65?'low':'skeleton';
