async(sessionPage)=>{
 const origin='https://shimajiro-reading.ji3cp31p4.workers.dev',context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],errors=[];let blockedWrites=0;
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};page.on('pageerror',e=>errors.push(e.message));
 // Never run training writes against a child's production records.
 await context.route('**/api/progress/**',route=>{if(route.request().method()==='POST'){blockedWrites++;return route.abort();}return route.continue();});
 const release=await(await context.request.get(origin+'/release.json')).json(),health=await(await context.request.get(origin+'/api/health')).json();check(release.id===health.version,'served assets and Worker have same release '+release.id);
 await page.goto(origin+'/');await page.locator('.bookshelf').waitFor();check(await page.locator('.book-card').count()===5,'production root preserves both originals and adds three approved books');
 for(const id of ['kiki','super-ya','tata','karate','super-ya-revisit']){
  await page.goto(origin+'/?book='+id);await page.locator('.mode-card').first().waitFor();check(await page.locator('.mode-card').count()===2,id+' neutral cover has two modes');
  for(const route of ['&mode=whisper','&chapter=0','&mode=practice','&mode=practice&scene=0']){
   await page.goto(origin+'/?book='+id+route);await page.locator('.child-header').waitFor();
   check(await page.locator('.child-nav a[aria-label="回到書架"]').getAttribute('href')==='/',id+route+' returns to root');
   check(await page.locator('a[href*="view=parent"],.mode-switch,.level-tabs,.practice-shortcut,.whisper-shortcut').count()===0,id+route+' has no retired shortcuts');
  }
 }
 await page.goto(origin+'/?view=parent');await page.locator('.parent-gate').waitFor();check(await page.locator('.parent-book').count()===0,'production old parent URL is gated');
 await page.locator('[data-parent-hold]').focus();await page.keyboard.down('Space');await page.waitForTimeout(3100);await page.keyboard.up('Space');await page.waitForFunction(id=>document.querySelector('#release-info')?.textContent.includes(id),release.id);check((await page.locator('#release-info').textContent()).includes(release.id),'parent mode reports deployed version');
 await page.screenshot({path:'output/playwright/production-parent-version.png'});
 check(!errors.length,'production has no unhandled errors');await context.close();return {passed:checks.length,version:release.id,productionWritesPrevented:blockedWrites,checks};
}
