async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};let blockedWrites=0;
 await context.route('**/api/progress/**',r=>{if(r.request().method()==='POST'){blockedWrites++;return r.abort();}return r.continue();});
 const origin='https://shimajiro-reading.ji3cp31p4.workers.dev';
 await page.goto(origin+'/');await page.locator('.bookshelf').waitFor();check(await page.locator('.book-card').count()===4,'formal root has one SUPER YA');
 await page.locator('.book-card[href="?book=super-ya"]').click();await page.locator('.whisper-mode .mode-primary').click();await page.locator('.toc-list').waitFor();check(await page.locator('.toc-list li').count()===40,'formal first entry opens forty-piece contents');
 await page.screenshot({path:'output/playwright/super-ya-40-online-contents.png',fullPage:true});
 await page.locator('.toc-list button').last().click();await page.locator('.prose').waitFor();check(new URL(page.url()).searchParams.get('chapter')==='39','formal fortieth piece opens');
 check(await page.locator('.guide-passage').count()===2,'formal prose and companion sharing are separated');
 await page.screenshot({path:'output/playwright/super-ya-40-online-reader.png'});
 await page.goto('https://shimajiro-reading-trial.ji3cp31p4.workers.dev/?book=super-ya-revisit&preview=1');await page.locator('.mode-card').first().waitFor();check(new URL(page.url()).searchParams.get('book')==='super-ya','existing trial link reaches current first entry');
 await page.locator('.whisper-mode .mode-primary').click();await page.locator('.toc-list').waitFor();check(await page.locator('.toc-list li').count()===40,'existing trial link also has forty pieces');
 await context.close();return {passed:checks.length,checks,productionWritesBlocked:blockedWrites};
}
