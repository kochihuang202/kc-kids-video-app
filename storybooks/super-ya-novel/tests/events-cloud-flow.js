async(sessionPage)=>{
 const origin=new URL(sessionPage.url()).origin;if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Local isolated D1 only');
 const browser=sessionPage.context().browser(),context=await browser.newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const seed=await context.request.post(origin+'/api/progress/super-ya/whisper',{data:{patch:{chapter:4,started:true,finished:true,readThrough:{4:9}}},headers:{Origin:origin}});check(seed.ok(),'seed archived old document only in local D1');
 const snapshot=await(await context.request.get(origin+'/api/progress')).json(),old=snapshot.documents['super-ya:whisper'];
 await page.goto(origin+'/?book=super-ya&mode=whisper');await page.locator('.toc-list').waitFor();
 await page.locator('.toc-list button').last().click();await page.locator('.prose').waitFor();
 let saved=false;for(let i=0;i<100;i++){const docs=(await(await context.request.get(origin+'/api/progress')).json()).documents;if(docs['super-ya-events:whisper']?.state.chapter===39){saved=true;break;}await page.waitForTimeout(100);}check(saved,'fortieth piece reaches actual local D1');
 const fresh=await browser.newContext({viewport:{width:820,height:1180}}),other=await fresh.newPage();await other.goto(origin+'/?book=super-ya');await other.locator('.whisper-mode .mode-primary').click();await other.locator('[data-action=start]').click();await other.locator('.prose').waitFor();
 check(new URL(other.url()).searchParams.get('chapter')==='39','fresh browser resumes fortieth piece from cloud');
 const invalid=await context.request.post(origin+'/api/progress/super-ya-events/whisper',{data:{patch:{chapter:40}},headers:{Origin:origin}});check(invalid.status()===400,'out-of-range forty-first index rejected');
 const after=await(await context.request.get(origin+'/api/progress')).json();check(JSON.stringify(after.documents['super-ya:whisper'])===JSON.stringify(old),'old cloud document revision, time and completion remain untouched');
 await context.close();await fresh.close();return {passed:checks.length,checks};
}
