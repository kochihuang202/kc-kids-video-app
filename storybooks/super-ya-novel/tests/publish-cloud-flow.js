async(sessionPage)=>{
 const origin=new URL(sessionPage.url()).origin;if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('This test writes only to an isolated local database');
 const browser=sessionPage.context().browser(),context=await browser.newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[];const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await page.goto(origin+'/?book=tata&mode=practice');await page.locator('.scene-card').nth(3).click();await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();
 for(let i=0;i<4;i++)await page.locator('[data-p="next"]').click();
 await page.waitForFunction(async()=>{const d=(await(await fetch('/api/progress')).json()).documents;return d['tata:practice']?.state.positions?.['s4:story']===4;});check(true,'fourth index reaches the actual local D1 database');
 const second=await browser.newContext({viewport:{width:820,height:1180}}),other=await second.newPage();await other.goto(origin+'/?book=tata');await other.getByRole('link',{name:'接著讀閱讀理解',exact:true}).click();
 const definition=(await(await context.request.get(origin+'/practice.json')).json()).tata.scenes[3].questions.story[4];
 await other.locator('.question-title').waitFor();const text=await other.locator('.question-title').evaluate(e=>{const c=e.cloneNode(true);c.querySelectorAll('rt').forEach(n=>n.remove());return c.textContent;});check(text===definition.q,'fresh browser resumes the fifth question from cloud');
 await other.locator('.answer-choice').nth(definition.correct).click();await other.locator('[data-p="next"]').click();
 await other.waitForFunction(async()=>{const d=(await(await fetch('/api/progress')).json()).documents;return d['tata:practice']?.state.positions?.['s4:story']===5&&d['tata:practice']?.state.attempts?.['s4:story:4']?.correct===true;});check(true,'completed fifth question and answer persist together');
 await other.reload();await other.locator('#own-note').waitFor();check(true,'reload retains completed five-question unit');
 for(const [id,key,last]of [['karate','s1:story',4],['super-ya-revisit','s6:story',5]]){
  const r=await context.request.post(origin+'/api/progress/'+id+'/practice',{data:{patch:{positions:{[key]:last}}},headers:{Origin:origin}});check(r.ok(),id+' accepts its own completion boundary');
 }
 const invalid=await context.request.post(origin+'/api/progress/super-ya/practice',{data:{patch:{positions:{'s1:story':4}}},headers:{Origin:origin}});check(invalid.status()===400,'original three-question unit still rejects out-of-range position');
 await context.close();await second.close();return {passed:checks.length,checks};
}
