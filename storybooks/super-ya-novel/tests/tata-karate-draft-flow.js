async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),origin=new URL(sessionPage.url()).origin,checks=[],requests=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.url());});
 const plain=loc=>loc.evaluate(e=>{const copy=e.cloneNode(true);copy.querySelectorAll('rt').forEach(r=>r.remove());return copy.textContent;});
 for(const [id,count]of [['tata',28],['karate',32]]){
  await page.goto(origin+'/?book='+id+'&preview=1');await page.locator('.mode-card').first().waitFor();
  await page.locator('.whisper-mode .mode-primary').click();await page.locator('.toc-list').waitFor();check(await page.locator('.toc-list li').count()===count,id+' complete contents open from episode cover');
  const story=await(await context.request.get(origin+'/books/'+id+'-events/story.json')).json();
  for(const index of [0,Math.floor(count/2),count-1]){
   if(!await page.locator('.contents-page .toc-list').count()){await page.locator('.mode-toc-link').click();await page.locator('.contents-page .toc-list').waitFor();}
   await page.locator('.toc-list button').nth(index).click();await page.locator('.prose').waitFor();
   check(await plain(page.locator('#chapter-title'))===story.chapters[index].title,id+' selected piece '+(index+1));
   const body=await page.locator('.source-block').evaluateAll(ns=>ns.map(e=>{const copy=e.cloneNode(true);copy.querySelectorAll('rt').forEach(r=>r.remove());return copy.textContent;}));
   check(JSON.stringify(body)===JSON.stringify(story.chapters[index].blocks.map(b=>b.text)),id+' complete source and distinct guide paragraphs '+(index+1));
  }
  await page.reload();await page.locator('.prose').waitFor();check(new URL(page.url()).searchParams.get('chapter')===String(count-1),id+' last piece survives reload');
  await page.goto(origin+'/?book='+id+'&chapter=0&preview=1');await page.locator('.prose').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'output/playwright/'+id+'-new-whisper.png'});
  await page.locator('.preferences summary').click();const toggle=page.locator('[data-action=bopo]');if(await toggle.getAttribute('aria-pressed')==='true')await toggle.click();await page.keyboard.press('Escape');
  await page.locator('[data-action=next]').click();check(await page.locator('body.no-bopo').count()===1,id+' annotation preference survives chapter change');
 }
 check(requests.length===0,'trial reads and writes no formal progress API');await context.close();return {passed:checks.length,checks};
}
