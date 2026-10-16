async sessionPage=>{
 const c=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await c.newPage(),checks=[];
 await c.route('**/api/**',r=>r.abort());const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await page.goto('http://127.0.0.1:4178/?book=kiki');await page.locator('.mode-card').first().waitFor();
 const sizes=await page.locator('.mode-card .mode-primary').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 check(sizes.length===2&&Math.abs(sizes[0].width-sizes[1].width)<2&&Math.abs(sizes[0].height-sizes[1].height)<2,'both cover primary actions have identical dimensions');
 check(await page.getByText(/依使用者提供|非官方作品|依逐字稿改寫/).count()===0,'production notes absent from cover');
 await page.locator('.mode-card a[href$="mode=whisper"]').click();await page.locator('.resume-panel').waitFor();
 check(await page.locator('.resume-panel ruby').evaluateAll(ns=>ns.every(n=>{const ruby=n.getBoundingClientRect(),rt=n.querySelector('rt')?.getBoundingClientRect();return !rt||rt.height<=Math.max(32,parseFloat(getComputedStyle(n).fontSize)*1.8);})),'resume card annotations stay attached to their own characters');
 await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.mode-card').first().waitFor();
 await page.locator('.mode-card a[href$="mode=practice"]').click();await page.locator('.scene-card').first().waitFor();
 check(await page.locator('.resume-panel').count()===1,'continue reading appears above contents');
 await page.locator('.scene-card').first().click();await page.locator('[data-p=begin]').click();
 await page.locator('[data-p=reveal]').click();
 check(await page.locator('.answer-choice:disabled').evaluateAll(ns=>ns.every(n=>Number(getComputedStyle(n).opacity)===1)),'locked answers remain fully readable');
 check(await page.locator('.answer-choice.correct .answer-state').count()===1,'explanation identifies correct answer with text');
 await page.locator('.mode-toc-link').click();await page.locator('.scene-card').first().waitFor();check(new URL(page.url()).searchParams.get('mode')==='practice','practice header returns to own contents');
 await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=1');await page.locator('.prose').waitFor();await page.locator('.mode-toc-link').click();await page.locator('main .toc-list').waitFor();check(new URL(page.url()).searchParams.get('mode')==='whisper','whisper header returns to own contents');
 await page.goto('http://127.0.0.1:4178/?book=kiki&mode=practice&scene=8');await page.locator('[data-p=begin]').click();for(let i=0;i<3;i++)await page.locator('[data-p=next]').click();
 check(await page.locator('[data-p=next-scene]').getAttribute('aria-label')==='回單元目錄','final scene uses a real destination label');await page.locator('[data-p=next-scene]').click();await page.locator('.scene-card').first().waitFor();check(true,'last unit returns to contents');
 for(const [width,height]of [[820,1180],[1180,820],[390,844]]){await page.setViewportSize({width,height});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'contents fits '+width);}
 await c.close();return {passed:checks.length,checks};
}

