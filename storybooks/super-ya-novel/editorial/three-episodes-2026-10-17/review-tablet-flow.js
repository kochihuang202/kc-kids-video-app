async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180},hasTouch:true,isMobile:true,deviceScaleFactor:2}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',r=>r.abort());const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 for(const id of ['tata','karate','super-ya-revisit']){
  await page.goto('http://127.0.0.1:4185/?book='+id+'&chapter=0');await page.locator('.prose').waitFor();
  await page.locator('.preferences summary').tap();await page.getByRole('button',{name:'特大',exact:true}).tap();await page.getByRole('button',{name:'完成設定',exact:true}).tap();
  for(const [width,height]of [[820,1180],[1180,820]]){await page.setViewportSize({width,height});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' large text fits '+width);}
 }
 const all=await(await context.request.get('http://127.0.0.1:4185/practice.json')).json(),q=all['super-ya-revisit'].scenes[5].questions.story[4];
 await page.goto('http://127.0.0.1:4185/?book=super-ya-revisit&mode=practice');await page.locator('.scene-card').nth(5).tap();await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).tap();
 for(let i=0;i<4;i++)await page.locator('[data-p="next"]').tap();
 await page.reload();await page.locator('.question-title').waitFor();
 const stem=await page.locator('.question-title').evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('rt').forEach(r=>r.remove());return c.textContent;});check(stem===q.q,'fifth question resumes after reload');
 await page.locator('.answer-choice').nth(q.correct).tap();check(await page.locator('.feedback.good').isVisible(),'revised fifth question resolves on WebKit');
 await page.screenshot({path:'output/playwright/draft-webkit-fifth-question.png'});await page.locator('[data-p="next"]').tap();check(await page.locator('#own-note').count()===1,'five-question unit completes at real end');
 await context.close();return {passed:checks.length,checks};
}
