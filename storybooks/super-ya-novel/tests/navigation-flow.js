async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],errors=[];
 await context.route('**/api/**',route=>route.abort());page.on('pageerror',e=>errors.push(e.message));
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};const query=()=>new URL(page.url()).searchParams;
 const count=async selector=>page.locator(selector).evaluateAll(nodes=>nodes.reduce((n,el)=>{const c=el.cloneNode(true);c.querySelectorAll('rt').forEach(r=>r.remove());return n+(c.textContent.match(/[\p{L}\p{N}]/gu)||[]).length;},0));
 for(const book of ['kiki','super-ya']){
  await page.goto('http://127.0.0.1:4178/?book='+book);await page.locator('[data-action="start"]').click();await page.locator('.prose').waitFor();
  check(query().get('chapter')==='0',book+' start route identifies actual chapter');
  if(book==='kiki')check(await page.locator('.guide-explainer').count()===0,'requested guide hint is removed');
  check(Number(await page.locator('[data-page-word-count]').getAttribute('data-page-word-count'))===await count('.source-block'),book+' page count contains only source text');
  await page.locator('[data-action="next"]').click();check(query().get('chapter')==='1',book+' next chapter updates route');
  await page.reload();await page.locator('.prose').waitFor();check(query().get('chapter')==='1',book+' reload stays in chapter');
  await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('#book-title').waitFor();check(!query().has('chapter'),book+' cover route removes chapter');
  await page.goBack();await page.locator('.prose').waitFor();check(query().get('chapter')==='1',book+' browser back restores reading view');
  await page.goForward();await page.locator('#book-title').waitFor();check(!query().has('chapter'),book+' browser Forward returns cover');
  await page.locator('.mode-card a[href$="mode=practice"]').click();await page.locator('.scene-card').nth(2).click();
  check(query().get('scene')==='2',book+' scene selection updates route');
  check(Number(await page.locator('[data-page-word-count]').getAttribute('data-page-word-count'))===await count('.practice-text'),book+' practice count excludes controls and questions');
  await page.locator('[data-p=begin]').click();await page.reload();await page.locator('.practice-panel').waitFor();check(true,book+' reload preserves exercise phase');
  await page.locator('.mode-toc-link').click();check(!query().has('scene'),book+' all scenes clears deep link');await page.reload();await page.locator('.scene-card').first().waitFor();
  check(await page.locator('.practice-paper').count()===0,book+' reload stays list');
  await page.locator('.scene-card').nth(1).click();await page.goBack();await page.locator('.scene-card').first().waitFor();await page.goForward();await page.locator('.practice-paper').waitFor();check(query().get('scene')==='1',book+' back and forward follow active unit');
  await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('[data-action=start]').click();await page.locator('.prose').waitFor();check(query().get('chapter')==='1',book+' modes keep independent positions');
 }
 check(errors.length===0,'navigation and counts have no uncaught errors');await context.close();return {passed:checks.length,checks};
}
