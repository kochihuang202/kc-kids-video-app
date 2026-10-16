async(sessionPage)=>{
 const browser=sessionPage.context().browser(),context=await browser.newContext({viewport:{width:820,height:1180}}),page=await context.newPage();
 const checks=[],errors=[];const check=(v,m)=>{if(!v)throw new Error(m);checks.push(m);};
 const wait=()=>page.waitForTimeout(280);
 const plain=loc=>loc.evaluate(el=>{const n=el.cloneNode(true);n.querySelectorAll('rt').forEach(r=>r.remove());return n.textContent;});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('shimajiro-novel:v2'))localStorage.setItem('shimajiro-novel:v2',JSON.stringify({chapter:2,started:true,bopo:true,size:1,positions:{2:2500}}));});
 await page.goto('http://127.0.0.1:4178/');await page.locator('.bookshelf').waitFor();
 check(await page.locator('.book-card').count()===2,'shelf offers both books');
 check(await page.locator('.book-card').evaluateAll(nodes=>nodes.every(n=>n.href.includes('?book=')&&n.querySelector('img').complete)),'both book links and cover images work');
 for(const [width,height,label]of [[820,1180,'portrait'],[1180,820,'landscape'],[390,844,'mobile']]){
  await page.setViewportSize({width,height});await wait();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' shelf has no horizontal overflow');
  await page.screenshot({path:'output/playwright/library-'+label+'.png',fullPage:true});
 }
 await page.setViewportSize({width:820,height:1180});
 await page.locator('.book-card[href="?book=kiki"]').focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'一起讀故事',exact:true}).click();await wait();
 const story=await page.evaluate(async()=>(await fetch('books/kiki/story.json')).json());
 check(story.chapters.length===9,'new book includes eight situations and the epilogue');
 check(await plain(page.locator('#chapter-title'))===story.chapters[0].title,'new book starts at its own first situation');
 check(await page.locator('[data-size="0"]').getAttribute('aria-pressed')==='true','new book does not inherit the other book font or chapter');
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-novel:v2')).chapter===2),'opening Kiki does not overwrite SUPER YA progress');
 for(let i=0;i<story.chapters.length;i++){
  if(i){await page.getByRole('button',{name:'繼續下一篇',exact:true}).click();await wait();}
  const c=story.chapters[i];
  check(await plain(page.locator('#chapter-title'))===c.title,`Kiki part ${i+1} opens in order`);
  const actual=await page.locator('.source-block').evaluateAll(nodes=>nodes.map(el=>{const n=el.cloneNode(true);n.querySelectorAll('rt').forEach(r=>r.remove());return n.textContent;}));
  check(JSON.stringify(actual)===JSON.stringify(c.blocks.map(b=>b.text.replace(/\*\*/g,''))),`Kiki part ${i+1} retains every paragraph and heading`);
  check(await page.locator('.guide-passage').count()===1,`Kiki part ${i+1} distinguishes the time-whisper section`);
  check(await page.locator('.guide-passage .source-block').count()===c.presentation.guideRanges[0][1]-c.presentation.guideRanges[0][0]+1,`Kiki part ${i+1} labels all guide paragraphs`);
  check(await page.locator('.chapter-art,.story-picture,.chat,[data-choice]').count()===0,`Kiki part ${i+1} has no unrelated episode stills or extra chat`);
  check(await page.locator('.prose rt').count()>100,`Kiki part ${i+1} includes phonetics`);
  const known=await page.locator('#story-map .map-card').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.block)));
  const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-novel:kiki:v1')));
  check(known.every(b=>b<=(progress.readThrough[i]??-1)),`Kiki part ${i+1} map contains only reached events`);
  await page.locator('.source-block').last().scrollIntoViewIfNeeded();await wait();
  await page.locator('#story-map summary').click();await wait();
  check(await page.locator('#story-map .map-card').count()===c.presentation.events.length,`Kiki part ${i+1} complete recap is available`);
 }
 await page.getByRole('button',{name:'讀完了，回到封面',exact:true}).click();
 check(await page.locator('.resume-map').count()===1,'Kiki has its own resume recap');
 await page.getByRole('button',{name:'接著讀・'+story.chapters[8].title,exact:true}).click();await wait();
 await page.getByRole('button',{name:'故事目錄',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:story.chapters[3].title,exact:true}).click();await wait();
 await page.locator('[data-block="10"]').evaluate(el=>scrollTo(0,scrollY+el.getBoundingClientRect().top-130));await wait();
 await page.locator('.preferences summary').click();await page.getByRole('button',{name:'特大',exact:true}).click();await wait();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'注音：開',exact:true}).click();await wait();
 await page.getByRole('button',{name:'回到封面',exact:true}).click();
 const stored=await page.evaluate(()=>localStorage.getItem('shimajiro-novel:kiki:v1'));
 await page.locator('.book-links a[href="?book=super-ya"]').click();
 await page.locator('[data-action="start"]').click();await wait();
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-novel:v2')).chapter===2),'switching back preserves the original SUPER YA chapter');
 check(await page.locator('[data-size="1"]').getAttribute('aria-pressed')==='true','SUPER YA keeps its own font size');
 check(await page.locator('#bopo-toggle').getAttribute('aria-pressed')==='true','SUPER YA keeps its own annotation preference');
 check(await page.evaluate(()=>localStorage.getItem('shimajiro-novel:kiki:v1'))===stored,'reading SUPER YA does not mutate Kiki saved progress');
 await page.getByRole('button',{name:'回到封面',exact:true}).click();await page.locator('.book-links a[href="?book=kiki"]').click();
 await page.locator('[data-action="start"]').click();await wait();
 check(await plain(page.locator('#chapter-title'))===story.chapters[3].title,'switching back to Kiki resumes the correct situation');
 check(await page.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','Kiki independently restores largest font');
 check(await page.locator('#bopo-toggle').getAttribute('aria-pressed')==='false','Kiki independently restores hidden phonetics');
 const saved=JSON.parse(stored),a=saved.anchors[3];
 check(await page.locator(`[data-block="${a.block}"]`).evaluate((el,offset)=>Math.abs(el.getBoundingClientRect().top-document.querySelector('.reader-header').getBoundingClientRect().bottom-offset)<8,a.offset),'Kiki restores the saved paragraph anchor');
 await page.getByRole('button',{name:'注音：關',exact:true}).click();await wait();
 for(const [width,height,label]of [[820,1180,'portrait'],[1180,820,'landscape'],[390,844,'mobile']]){
  await page.setViewportSize({width,height});await wait();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' Kiki largest font has no horizontal overflow');
  check(!await page.locator('.prose ruby').evaluateAll(nodes=>nodes.some(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1);})),label+' Kiki annotations remain inside viewport');
  await page.screenshot({path:'output/playwright/kiki-'+label+'.png'});
 }
 await page.reload();await page.locator('[data-action="start"]').click();await wait();
 check(await plain(page.locator('#chapter-title'))===story.chapters[3].title,'direct Kiki link reload preserves independent resume');
 await page.goto('http://127.0.0.1:4178/?book=unknown');check(await page.locator('.book-card').count()===2,'unknown book link safely returns to shelf');
 const blockedContext=await browser.newContext({viewport:{width:820,height:1180}}),blocked=await blockedContext.newPage();
 await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}}));
 await blocked.goto('http://127.0.0.1:4178/');await blocked.locator('.book-card[href="?book=kiki"]').click();await blocked.locator('[data-action="start"]').click();
 check(await blocked.locator('#storage-note').isVisible(),'Kiki remains available when storage is blocked');
 for(let i=0;i<8;i++)await blocked.getByRole('button',{name:'繼續下一篇',exact:true}).click();
 await blocked.getByRole('button',{name:'讀完了，回到封面',exact:true}).click();
 check(await blocked.getByRole('button',{name:'從第一篇重讀',exact:true}).isVisible(),'all nine Kiki parts work without storage');
 await blockedContext.close();check(errors.length===0,'no unhandled errors in the two-book flow');await context.close();
 return {passed:checks.length,checks};
}
