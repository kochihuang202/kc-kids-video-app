async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext(),page=await context.newPage();let held,requests=0;const checks=[];
 const check=(v,m)=>{if(!v)throw new Error(m);checks.push(m);};
 await context.request.post('http://127.0.0.1:4178/api/progress/kiki/whisper',{data:{patch:{size:1,chapter:1,started:true}}});
 await page.goto('http://127.0.0.1:4178/?book=kiki');await page.locator('[data-action="start"]').click();
 await page.route('**/api/progress/**',route=>{requests++;if(requests===1)held=route;else route.abort();});
 await page.locator('.preferences summary').click();await page.getByRole('button',{name:'標準',exact:true}).click();
 await page.waitForTimeout(950);
 check(!!held,'a real save request is held before acknowledgement');
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('reading-pending:kiki:whisper')).size===0),'in-flight changes remain durable until server acknowledgement');
 await page.reload();await page.locator('.prose').waitFor();await page.waitForTimeout(300);
 check(await page.locator('[data-size="0"]').getAttribute('aria-pressed')==='true','reload restores pending settings instead of stale cloud settings');
 try{await held.abort();}catch{}
 await page.unroute('**/api/progress/**');await page.evaluate(()=>dispatchEvent(new Event('online')));
 await page.waitForFunction(async()=>{const data=await(await fetch('/api/progress')).json();return data.documents['kiki:whisper']?.state.size===0;});
 check(true,'reload recovery eventually reaches the cloud');await context.close();return {passed:checks.length,checks};
}
