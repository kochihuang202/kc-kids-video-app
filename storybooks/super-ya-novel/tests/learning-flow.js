async(sessionPage)=>{
 const browser=sessionPage.context().browser(),context=await browser.newContext({viewport:{width:1180,height:820}}),page=await context.newPage(),checks=[],errors=[];
 const check=(v,m)=>{if(!v)throw new Error(m);checks.push(m);};
 const pause=()=>page.waitForTimeout(180);
 const plain=locator=>locator.evaluate(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('rt').forEach(n=>n.remove());return copy.textContent;});
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{
  window.testSpeech=[];window.testCanceled=0;
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'zh-TW',name:'Test Taiwan'}],addEventListener(){},cancel(){window.testCanceled++;},speak(u){window.testSpeech.push({text:u.text,lang:u.lang,rate:u.rate,voice:u.voice?.lang});u.onstart?.();}}});
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 });
 await page.goto('http://127.0.0.1:4178/');await page.locator('.bookshelf').waitFor();
 await page.locator('.book-card[href="?book=kiki"]').click();
 await page.locator('.mode-card').first().waitFor();
 check(await page.locator('.mode-card').count()===2,'each episode exposes comprehension and complete-whisper entries');
 await page.locator('.mode-card[href*="mode=practice"]').click();await page.locator('.scene-card').first().waitFor();
 const all=await page.evaluate(async()=>(await fetch('practice.json')).json());
 check(await page.locator('.scene-card').count()===9,'Kiki has all nine comprehension scenes');
 await page.locator('.scene-card').first().click();
 await page.locator('.practice-text [data-word="珍惜"]').first().click();
 check(await page.locator('#word-dialog .word-bopo').textContent()==='ㄓㄣ ㄒㄧˊ','practice word help supplies reviewed Taiwan phonetics');
 check((await plain(page.locator('.word-meaning'))).includes('重視'),'word help supplies a child-readable meaning');
 await page.getByRole('button',{name:'聽這個詞',exact:true}).click();
 check(await page.evaluate(()=>testSpeech.at(-1).text==='珍惜'&&testSpeech.at(-1).lang==='zh-TW'&&testSpeech.at(-1).voice==='zh-TW'),'word speech uses Taiwan device voice preference');
 await page.getByRole('button',{name:'回去繼續讀',exact:true}).click();
 await page.locator('[data-p="speak-one"]').first().click();
 check(await page.locator('.practice-text.speaking').count()===1,'device paragraph speech highlights its source paragraph');
 await page.locator('#speech-status button').click();check(await page.locator('.speaking').count()===0,'stop cancels speech and clears highlighting');
 let completed=0;
 for(const book of ['kiki','super-ya']){
  for(let scene=0;scene<all[book].scenes.length;scene++){
   await page.goto(`http://127.0.0.1:4178/?book=${book}&mode=practice`);await page.locator('.scene-card').nth(scene).click();
   for(const level of ['story','extra']){
    if(level==='extra')await page.locator('[data-p="extra"]').first().click();
    await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();
    const qs=all[book].scenes[scene].questions[level];
    for(let q=0;q<qs.length;q++){
     const definition=qs[q];
     if(book==='kiki'&&scene===0&&level==='story'&&q===0){
      await page.locator('.answer-choice').nth((definition.correct+1)%3).click();
      check(await page.locator('.feedback:not(.good)').count()===1,'incorrect answer invites rereading rather than marking completion');
      for(let i=0;i<3;i++)await page.getByRole('button',{name:'再給我一點提示',exact:true}).click();
      await page.getByRole('button',{name:'帶我看看這段',exact:true}).click();
      check(await page.locator('.proof').count()>0,'layered hints link back to the original evidence');
     }
     if(book==='super-ya'&&scene===0&&level==='extra'&&q===0)await page.getByRole('button',{name:'我想先看說明',exact:true}).click();
     else await page.locator('.answer-choice').nth(definition.correct).click();
     completed++;check(await page.locator('.feedback.good').count()===1,`${book} scene ${scene+1} ${level} question ${q+1} resolves from authored evidence`);
     await page.getByRole('button',{name:'下一題',exact:true}).click();
    }
    check(await page.locator('#own-note').count()===1,`${book} scene ${scene+1} ${level} keeps free expression separate from grading`);
    if(book==='kiki'&&scene===0&&level==='story')await page.locator('#own-note').fill('我覺得可以先聽清楚，再一起想辦法。');
   }
  }
 }
 check(completed===70,'all 70 comprehension tasks across both episodes are operable');
 await page.waitForTimeout(1200);
 const snapshot=await page.evaluate(async()=>(await(await fetch('/api/progress')).json()).documents);
 check(snapshot['kiki:practice'].state.attempts['s1:story:0'].tries===2&&snapshot['kiki:practice'].state.attempts['s1:story:0'].hints===3,'cloud retains wrong attempts and actual hint usage');
 check(snapshot['super-ya:practice'].state.attempts['s1:extra:0'].revealed===true,'cloud distinguishes explanation viewing from independent answers');
 check(snapshot['kiki:practice'].state.notes['s1:story'].includes('聽清楚'),'child reflection persists online without automated grading');
 await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=1');await page.locator('.guide-passage').waitFor();
 const word=page.locator('.guide-passage [data-word="重視"]').first();await word.click();
 check(await page.locator('#word-dialog .word-bopo').textContent()==='ㄓㄨㄥˋ ㄕˋ','complete time-whisper sections also offer word help');
 await page.getByRole('button',{name:'回去繼續讀',exact:true}).click();
 await page.locator('.preferences summary').click();await page.getByRole('button',{name:'特大',exact:true}).click();await page.keyboard.press('Escape');
 await page.locator('.source-block[data-block="12"]').evaluate(el=>scrollTo(0,scrollY+el.getBoundingClientRect().top-130));await page.waitForTimeout(1200);
 await page.waitForFunction(async()=>{const s=(await(await fetch('/api/progress')).json()).documents['kiki:whisper']?.state;return s?.chapter===1&&s?.size===2&&s?.anchors?.[1];});
 const second=await browser.newContext({viewport:{width:820,height:1180}}),other=await second.newPage();
 await other.goto('http://127.0.0.1:4178/?book=kiki');await other.locator('[data-action="start"]').click();await other.waitForTimeout(300);
 check(await other.locator('#chapter-title').evaluate(el=>el.textContent.includes('梅')&&el.textContent.includes('婆')),'a fresh device resumes the cloud chapter without child identification');
 check(await other.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','a fresh device restores cloud reading preferences');
 await other.goto('http://127.0.0.1:4178/?view=parent');await other.locator('.parent-book').first().waitFor();
 check(await other.locator('.parent-book').count()===2,'parents see both episodes in one cloud progress page');
 check(await other.locator('.progress-table tbody tr').count()===14,'parent progress covers every comprehension scene');
 check((await plain(other.locator('.parent-main'))).includes('不是成績單'),'parent view states that progress is not an ability score');
 check((await plain(other.locator('.parent-book').last())).includes('位置，不代表已經理解'),'reading positions are explicitly distinct from understanding');
 check(await other.locator('.parent-notes').count()===1,'parents can inspect the child reflection saved online');
 for(const [width,height,label]of [[1180,820,'landscape'],[820,1180,'portrait'],[390,844,'mobile']]){
  await other.setViewportSize({width,height});await pause();check(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' parent page has no horizontal page overflow');
  await other.screenshot({path:'output/playwright/parents-'+label+'.png',fullPage:true});
 }
 await other.goto('http://127.0.0.1:4178/?book=kiki&mode=practice');await other.locator('.scene-card').first().click();await other.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();
 check(await other.locator('.answer-choice').count()===0,'another device restores the completed question position');
 await other.locator('[data-p="restart"]').click();
 for(const [width,height,label]of [[1180,820,'landscape'],[820,1180,'portrait'],[390,844,'mobile']]){
  await other.setViewportSize({width,height});await pause();check(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' practice reading and evidence choices fit viewport');
  await other.screenshot({path:'output/playwright/practice-'+label+'.png',fullPage:true});
 }
 await second.close();
 await page.route('**/api/progress/**',route=>route.abort());
 await page.locator('.preferences summary').click();await page.getByRole('button',{name:'大字',exact:true}).click();await page.waitForTimeout(1100);
 check((await page.locator('[data-sync-status]').first().textContent()).includes('暫存'),'offline writes remain queued instead of claiming cloud success');
 await page.unroute('**/api/progress/**');await page.evaluate(()=>dispatchEvent(new Event('online')));
 await page.waitForFunction(async()=>{const s=(await(await fetch('/api/progress')).json()).documents['kiki:whisper']?.state;return s?.size===1;});
 check((await page.locator('[data-sync-status]').first().textContent()).includes('已存到網路'),'reconnection automatically flushes pending progress');
 const wrongOrigin=await context.request.post('http://127.0.0.1:4178/api/progress/kiki/whisper',{headers:{Origin:'https://another.example'},data:{patch:{chapter:0}}});
 check(wrongOrigin.status()===403,'cross-origin progress mutations are rejected');
 const invalid=await context.request.post('http://127.0.0.1:4178/api/progress/kiki/whisper',{data:{patch:{chapter:99}}});check(invalid.status()===400,'invalid progress is rejected');
 await Promise.all([context.request.post('http://127.0.0.1:4178/api/progress/kiki/whisper',{data:{patch:{readThrough:{0:21}}}}),context.request.post('http://127.0.0.1:4178/api/progress/kiki/whisper',{data:{patch:{readThrough:{2:15}}}})]);
 const merged=(await(await context.request.get('http://127.0.0.1:4178/api/progress')).json()).documents['kiki:whisper'].state;
 check(merged.readThrough[0]>=21&&merged.readThrough[2]>=15,'simultaneous saves preserve independent chapter progress');
 check(errors.length===0,'no unhandled errors across tools, practice and cloud sync');
 await context.close();return {passed:checks.length,checks};
}
