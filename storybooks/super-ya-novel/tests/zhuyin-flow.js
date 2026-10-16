async sessionPage=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',r=>r.abort());const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 for(const route of ['?book=kiki','?book=kiki&mode=whisper','?book=kiki&chapter=1','?book=kiki&mode=practice&scene=1']){
  await page.goto('http://127.0.0.1:4178/'+route);await page.locator('ruby').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.locator('ruby h-zhuyin[length="3"]').evaluateAll(ns=>ns.filter(n=>n.closest('.prose,.practice-passage,.resume-panel,.mode-card')).map(el=>{
   const node=el.querySelector('h-yin').firstChild,rb=el.closest('ruby').querySelector('rb'),base=rb.getBoundingClientRect(),font=parseFloat(getComputedStyle(rb).fontSize);
   const rects=[...node.textContent].map((_,i)=>{const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);return r.getBoundingClientRect();});
   return rects[0].left>=base.right-1&&Math.abs(rects[0].top-base.top)<=font*.2&&Math.abs(rects[2].bottom-base.bottom)<=font*.2&&rects.every(r=>Math.abs(r.left-rects[0].left)<1)&&rects[0].top<rects[1].top&&rects[1].top<rects[2].top;
  }));
  check(geometry.length>0&&geometry.every(Boolean),'three-symbol annotations align with base glyphs '+route);
 }
 for(const [width,height]of [[820,1180],[1180,820],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=1');await page.locator('.prose').waitFor();
  await page.locator('.preferences summary').click();await page.locator('[data-size="2"]').click();await page.keyboard.press('Escape');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'largest annotated reader fits '+width);
  check(await page.locator('.prose h-zhuyin').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=13)),'large-size phonetic columns remain readable '+width);
 }
 await context.close();return {passed:checks.length,checks};
}
