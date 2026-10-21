async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),origin=new URL(sessionPage.url()).origin,checks=[],api=[],errors=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 const plain=loc=>loc.evaluate(e=>{const c=e.cloneNode(true);c.querySelectorAll('rt').forEach(n=>n.remove());return c.textContent;});
 const data=await(await context.request.get(origin+'/practice.json')).json();
 await page.goto(origin+'/?preview=1');await page.locator('.book-card').first().waitFor();check(await page.locator('.book-card').count()===6,'shelf retains the previous four books and adds only two');
 for(const [id,count,units,word,index]of [['dad-shampoo',26,6,'洗髮精',19],['secret-base',30,7,'望遠鏡',17]]){
  await page.locator('.book-card[href="?book='+id+'"]').click();await page.locator('.mode-card').first().waitFor();
  await page.locator('.whisper-mode .mode-primary').click();await page.locator('.contents-page .toc-list').waitFor();check(await page.locator('.contents-page .toc-list li').count()===count,id+' complete whisper contents');
  const catalog=await(await context.request.get(origin+'/library.json')).json(),book=catalog.books.find(b=>b.id===id),story=await(await context.request.get(origin+'/'+book.data)).json();
  for(const part of [0,index,count-1]){
   if(!await page.locator('.contents-page .toc-list').count()){await page.locator('.mode-toc-link').click();await page.locator('.contents-page .toc-list').waitFor();}
   await page.locator('.toc-list button').nth(part).click();await page.locator('.prose').waitFor();check(await plain(page.locator('#chapter-title'))===story.chapters[part].title,id+' piece '+(part+1)+' opens');
   const blocks=await page.locator('.source-block').evaluateAll(ns=>ns.map(e=>{const c=e.cloneNode(true);c.querySelectorAll('rt').forEach(n=>n.remove());return c.textContent;}));
   check(JSON.stringify(blocks)===JSON.stringify(story.chapters[part].blocks.map(b=>b.text)),id+' piece '+(part+1)+' source fidelity');
   if(part===index){await page.locator('[data-word="'+word+'"]').first().click();await page.locator('#word-dialog').waitFor();check(await page.locator('.word-bopo').textContent()===({'洗髮精':'ㄒㄧˇ ㄈㄚˇ ㄐㄧㄥ','望遠鏡':'ㄨㄤˋ ㄩㄢˇ ㄐㄧㄥˋ'}[word]),id+' new word hint opens with reviewed Taiwan pronunciation');await page.getByRole('button',{name:'回去繼續讀',exact:true}).click();}
  }
  await page.reload();await page.locator('.prose').waitFor();check(new URL(page.url()).searchParams.get('chapter')===String(count-1),id+' last piece resumes after reload');
  await page.locator('.preferences summary').click();const toggle=page.locator('[data-action=bopo]');if(await toggle.getAttribute('aria-pressed')==='true')await toggle.click();await page.keyboard.press('Escape');
  await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.practice-mode .mode-primary').click();await page.locator('.scene-card').first().waitFor();check(await page.locator('.scene-card').count()===units,id+' independent comprehension contents');
  await page.locator('.scene-card').first().click();await page.locator('[data-p=begin]').click();check(await page.locator('body.no-bopo').count()===1,id+' phonetics remain off across modes');
  for(const [i,q]of data[id].scenes[0].questions.story.entries()){
   await page.locator('.answer-choice').nth(q.correct).click();check(await page.locator('.feedback.good').count()===1,id+' first unit question '+(i+1)+' and explanation resolve');await page.getByRole('button',{name:'下一題',exact:true}).click();
  }
  check(await page.locator('#own-note').count()===1,id+' optional expression remains ungraded');
  await page.locator('.preferences summary').click();await page.locator('[data-p=bopo]').click();await page.keyboard.press('Escape');
  await page.goto(origin+'/?book='+id+'&chapter='+index+'&preview=1');await page.locator('.prose').waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'output/playwright/'+id+'-new-work.png'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' annotated text fits tablet viewport');
  await page.goto(origin+'/?preview=1');await page.locator('.book-card').first().waitFor();
 }
 check(api.length===0,'preview does not access formal progress API');check(errors.length===0,'no browser runtime errors');await context.close();return {passed:checks.length,checks};
}
