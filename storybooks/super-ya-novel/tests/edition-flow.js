async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],errors=[];
 await context.route('**/api/**',r=>r.abort());page.on('pageerror',e=>errors.push(e.message));
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const hold=async(ms=3100,move=false)=>{const b=page.locator('[data-parent-hold]');await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();await page.mouse.move(r.x+20,r.y+20);await page.mouse.down();if(move)await page.mouse.move(r.x+r.width+12,r.y+20);await page.waitForTimeout(ms);await page.mouse.up();};
 for(const [width,height]of [[820,1180],[1180,820],[390,844]]){
  await page.setViewportSize({width,height});let positions;
  for(const route of ['/','/?book=kiki','/?book=kiki&mode=whisper','/?book=kiki&chapter=2','/?book=kiki&mode=practice','/?book=kiki&mode=practice&scene=1']){
   await page.goto('http://127.0.0.1:4178'+route);await page.locator('.child-header').waitFor();
   const rects=await page.locator('.child-nav').evaluate(n=>[...n.children].map(el=>({x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width})));
   if(!positions)positions=rects;check(rects.every((r,i)=>Math.abs(r.x+r.width/2-positions[i].x-positions[i].width/2)<2),width+' navigation slots fixed '+route);
   check(await page.locator('.child-nav a[aria-label="回到書架"]').getAttribute('href')==='/','root always literal /');
   check(await page.locator('a[href*="view=parent"],.practice-shortcut,.whisper-shortcut,.full-whisper,.level-tabs').count()===0,'no child parent shortcut / direct mode switch '+route);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+width+' '+route);
   if(route.includes('chapter=')||route.includes('scene=')){
    const opposite=route.includes('chapter=')?'a[href*="mode=practice"]':'a[href*="chapter="]';check(await page.locator(opposite).count()===0,'reader and drawer cannot switch modes directly');
   }
  }
 }
 await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=1');await page.locator('.prose').waitFor();
 const original=await page.locator('.source-block').allTextContents();
 await page.locator('.preferences summary').click();await page.locator('[data-action=bopo]').click();await page.keyboard.press('Escape');
 await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.mode-card').first().waitFor();
 await page.locator('.practice-mode .mode-primary').click();await page.locator('[data-p="resume"]').click();await page.locator('.practice-paper').waitFor();check(await page.locator('body.no-bopo').count()===1,'bopo off persists across modes');
 await page.reload();await page.locator('.practice-paper').waitFor();check(await page.locator('body.no-bopo').count()===1,'bopo off survives reload');
 await page.goto('http://127.0.0.1:4178/?book=kiki&mode=practice&scene=2&level=extra');await page.locator('.practice-paper').waitFor();check(!page.url().includes('level=extra')&&page.url().includes('scene=2'),'legacy extra link returns same comprehension unit');
 await page.locator('[data-p=begin]').click();await page.reload();await page.locator('.practice-panel').waitFor();check(true,'exercise phase survives reload');
 await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=1');await page.locator('.prose').waitFor();
 await page.locator('.source-block[data-block="8"]').evaluate(el=>scrollTo(0,scrollY+el.getBoundingClientRect().top-140));await page.waitForTimeout(250);const y=await page.evaluate(()=>scrollY);
 await page.locator('.preferences summary').click();await hold(400);check(await page.locator('.parent-book,.parent-gate').count()===0,'early hold release cancels');await hold(3100,true);check(await page.locator('.parent-book,.parent-gate').count()===0,'moving off cancels');
 await hold();await page.locator('.parent-main').waitFor();check(await page.locator('.child-header').count()===0,'parent mode replaces child view');
 await page.locator('a[aria-label="回孩子模式"]').click();await page.locator('.prose').waitFor();await page.waitForTimeout(300);check(Math.abs(await page.evaluate(()=>scrollY)-y)<60,'return child restores exact reading position');
 check(JSON.stringify(await page.locator('.source-block').allTextContents())===JSON.stringify(original),'Kiki full prose remains unchanged');
 await page.goto('http://127.0.0.1:4178/?view=parent');await page.locator('.parent-gate').waitFor();check(await page.locator('.parent-main,.parent-book').count()===0,'direct parent URL exposes no progress');
 await hold();await page.locator('.parent-main').waitFor();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.locator('.parent-gate').waitFor();check(await page.locator('.parent-main,.parent-book').count()===0,'background immediately locks and removes parent DOM');
 await page.reload();await page.locator('.parent-gate').waitFor();check(true,'reload cannot reuse parent unlock');
 check(!errors.length,'no unhandled edition errors: '+errors.join(';'));await context.close();return {passed:checks.length,checks};
}

