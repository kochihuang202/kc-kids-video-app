async(sessionPage)=>{
 const origin=new URL(sessionPage.url()).origin,isPreview=new URL(origin).port==='4185',context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],errors=[];let apiCalls=0,answers=0,parts=0;
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/api/**',r=>{apiCalls++;return r.abort();});
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const plain=loc=>loc.evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('rt').forEach(n=>n.remove());return c.textContent;});
 const library=await(await context.request.get(origin+'/library.json')).json(),all=await(await context.request.get(origin+'/practice.json')).json();
 for(const id of ['tata','karate','super-ya-revisit']){
  const book=library.books.find(b=>b.id===id),story=await(await context.request.get(origin+'/'+book.data)).json();
  await page.goto(origin+'/?book='+id);await page.locator('.mode-card').first().waitFor();
  check(await page.locator('meta[name="reading-preview"]').count()===(isPreview?1:0),id+' correct preview/production mode');
  check(await page.locator('.character-cover img').evaluate(i=>i.complete&&i.naturalWidth>0),id+' own episode cover loads');
  await page.screenshot({path:'output/playwright/draft-'+id+'-cover.png'});
  for(let i=0;i<story.chapters.length;i++){
   await page.goto(origin+'/?book='+id+'&chapter='+i);await page.locator('.prose').waitFor();
   const actual=await page.locator('.source-block').evaluateAll(nodes=>nodes.map(n=>{const c=n.cloneNode(true);c.querySelectorAll('rt').forEach(t=>t.remove());return c.textContent;}));
   check(JSON.stringify(actual)===JSON.stringify(story.chapters[i].blocks.map(b=>b.text.replace(/\*\*/g,''))),id+' full chapter '+(i+1)+' intact');
   check(await page.locator('.guide-passage').count()===1,id+' chapter '+(i+1)+' separates companion voice');parts++;
   if(i===0){await page.screenshot({path:'output/playwright/draft-'+id+'-reading.png'});const word=page.locator('[data-word]').first();if(await word.count()){await word.click();check(await page.locator('.word-bopo').isVisible(),id+' vocabulary has zhuyin');await page.getByRole('button',{name:'回去繼續讀',exact:true}).click();}}
  }
  for(let i=0;i<all[id].scenes.length;i++){
   await page.goto(origin+'/?book='+id+'&mode=practice');await page.locator('.scene-card').nth(i).click();
   const s=all[id].scenes[i];
   check(JSON.stringify(await page.locator('.practice-text').evaluateAll(ns=>ns.map(n=>{const c=n.cloneNode(true);c.querySelectorAll('rt').forEach(t=>t.remove());return c.textContent;})))===JSON.stringify(s.story),id+' passage '+(i+1)+' intact');
   await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();
   for(let j=0;j<s.questions.story.length;j++){
    const q=s.questions.story[j];check(await plain(page.locator('.question-title'))===q.q,id+' unit '+(i+1)+' authored question '+(j+1));
    if(i===0&&j===0){await page.getByRole('button',{name:'再給我一點提示',exact:true}).click();await page.getByRole('button',{name:'再給我一點提示',exact:true}).click();check(await page.locator('.hint-card').count()===2,id+' hint path available');}
    await page.locator('.answer-choice').nth(q.correct).click();check(await page.locator('.feedback.good').count()===1,id+' unit '+(i+1)+' question '+(j+1)+' resolves');answers++;
    if(j===s.questions.story.length-1&&s.questions.story.length===5)await page.screenshot({path:'output/playwright/draft-'+id+'-fifth-answer.png'});
    await page.getByRole('button',{name:'下一題',exact:true}).click();
   }
   check(await page.locator('#own-note').count()===1,id+' unit '+(i+1)+' completes after its actual question count');
  }
 }
 check(parts===19,'all 19 full chapters checked');check(answers===85,'all 85 questions including fourth/fifth are operable');if(isPreview)check(apiCalls===0,'preview never calls production progress APIs');check(errors.length===0,'no browser errors '+errors.join(';'));
 await context.close();return {passed:checks.length,parts,answers,apiCalls,checks};
}
