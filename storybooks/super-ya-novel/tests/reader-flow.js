async (sessionPage) => {
  const context = await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}});
  const page = await context.newPage();
  const checks = [];
  const check = (value, message) => { if (!value) throw new Error(message); checks.push(message); };
  const plain = locator => locator.evaluate(el => { const clone = el.cloneNode(true); clone.querySelectorAll('rt').forEach(rt => rt.remove()); return clone.textContent; });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4178/');
  await page.setViewportSize({width:820,height:1180});
  await page.getByRole('button',{name:'一起讀故事',exact:true}).click();
  await page.locator('.prose').waitFor();
  check(await page.locator('.prose p').count()===8,'chapter has continuous novel paragraphs');
  check(await page.locator('.prose rt').count()>600,'story phonetics enabled by default');
  await page.getByRole('button',{name:'上一章',exact:true}).isDisabled().then(v=>check(v,'first chapter previous button disabled'));
  const story=await page.evaluate(async()=> (await fetch('story.json')).json());
  for(let chapter=0;chapter<8;chapter++){
    if(chapter){await page.getByRole('button',{name:'繼續下一章',exact:true}).click();}
    check((await plain(page.locator('#chapter-title')))===story.chapters[chapter].title,`chapter ${chapter+1} opens in order`);
    for(let branch=0;branch<4;branch++){
      await page.locator(`[data-choice="${branch}"]`).click();
      check(await page.locator(`[data-choice="${branch}"]`).getAttribute('aria-pressed')==='true',`chapter ${chapter+1} choice ${branch+1} selected`);
      const text=await plain(page.locator('#reply p'));
      const expected=branch===3?story.chapters[chapter].chat.unsure:story.chapters[chapter].chat.choices[branch].reply;
      check(text===expected,`chapter ${chapter+1} choice ${branch+1} receives its own response`);
    }
    if(chapter===5){await page.locator('#chat').screenshot({path:'output/playwright/conversation.png'});}
  }
  await page.getByRole('button',{name:'先繼續讀故事',exact:true}).click();
  check(await page.getByRole('button',{name:'讀完了，回到封面',exact:true}).evaluate(el=>document.activeElement===el),'conversation skip reaches story continuation');
  await page.getByRole('button',{name:'讀完了，回到封面',exact:true}).click();
  await page.getByRole('button',{name:'從第一章重讀',exact:true}).click();
  await page.locator('#paragraph-2').evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-190));
  const before=await page.locator('#paragraph-2').evaluate(el=>el.getBoundingClientRect().top);
  await page.getByRole('button',{name:'特大',exact:true}).click();
  await page.waitForTimeout(100);
  const after=await page.locator('#paragraph-2').evaluate(el=>el.getBoundingClientRect().top);
  check(Math.abs(after-before)<6,'changing font keeps the current paragraph anchored');
  check(await page.locator('.prose').evaluate(el=>getComputedStyle(el).fontSize)==='34px','large font applied');
  await page.getByRole('button',{name:'注音：開',exact:true}).click();
  check(await page.locator('.prose rt').first().isHidden(),'phonetics can be hidden');
  await page.getByRole('button',{name:'注音：關',exact:true}).click();
  for(const [width,height,label] of [[820,1180,'portrait'],[1180,820,'landscape'],[390,844,'mobile']]){
    await page.setViewportSize({width,height});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label} has no horizontal page overflow at largest font`);
    const overflow=await page.locator('.prose ruby').evaluateAll(nodes=>nodes.some(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1);}));
    check(!overflow,`${label} phonetics stay within the viewport`);
    await page.locator('#chapter-title').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/playwright/reader-${label}-large.png`});
  }
  await page.setViewportSize({width:820,height:1180});
  await page.getByRole('button',{name:'故事目錄',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'婷婷說的話',exact:true}).click();
  check((await plain(page.locator('#chapter-title')))===story.chapters[5].title,'table of contents opens a selected chapter');
  check(await page.locator('[data-choice="3"]').getAttribute('aria-pressed')==='true','earlier conversation choice persists when returning');
  await page.evaluate(()=>window.scrollTo(0,1250));await page.waitForTimeout(300);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-novel:v1')));
  check(saved.chapter===5&&saved.positions[5]>1200&&saved.size===2&&saved.bopo,'chapter, position and settings saved');
  await page.reload();
  await page.getByRole('button',{name:'接著讀・婷婷說的話',exact:true}).click();
  await page.waitForTimeout(100);
  check(await page.evaluate(()=>Math.abs(scrollY-1250)<8),'reopening resumes the saved reading position');
  check(await page.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','reading settings survive reopening');
  const isolated=await page.context().browser().newContext({viewport:{width:820,height:1180}});
  const blocked=await isolated.newPage();
  await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}});});
  await blocked.goto('http://127.0.0.1:4178/');
  await blocked.getByRole('button',{name:'一起讀故事',exact:true}).click();
  await blocked.getByRole('button',{name:'我還沒想好',exact:true}).click();
  check(await blocked.locator('#reply').isVisible(),'conversation works without browser storage');
  for(let i=0;i<7;i++)await blocked.getByRole('button',{name:'繼續下一章',exact:true}).click();
  await blocked.getByRole('button',{name:'讀完了，回到封面',exact:true}).click();
  check(await blocked.getByRole('button',{name:'從第一章重讀',exact:true}).isVisible(),'whole book remains readable when storage is blocked');
  await isolated.close();
  check(errors.length===0,`no uncaught browser errors (${errors.length})`);
  await context.close();
  return {passed:checks.length,checks};
}
