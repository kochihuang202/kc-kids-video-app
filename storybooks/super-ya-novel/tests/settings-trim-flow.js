async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:333,height:850}}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',route=>route.abort());
 await context.addInitScript(()=>{
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},cancel(){},speak(u){window.activeSpeech=u;u.onstart?.();}}});
 });
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 for(const route of ['/?book=kiki&chapter=0','/?book=kiki&mode=practice&scene=0']){
  await page.goto('http://127.0.0.1:4178'+route);await page.locator('.preferences summary').waitFor();
  await page.locator('.preferences summary').click();
  check(await page.locator('.drawer-progress,.drawer-nav').count()===0,'no duplicate tools/progress/contents: '+route);
  const heading=await page.locator('.drawer-heading h2').evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('rt').forEach(n=>n.remove());return c.textContent;});
  check(heading==='閱讀設定','settings has one clear heading');
  check(await page.locator('[data-parent-hold]').count()===1,'parent entry retained');
  check(await page.getByRole('button',{name:'注音：開',exact:true}).isVisible(),'annotation control readily visible');
  await page.screenshot({path:'output/playwright/settings-trim-'+(route.includes('practice')?'practice':'whisper')+'.png'});
  await page.keyboard.press('Escape');
  await page.locator('[data-action="speak-block"],[data-p="speak-one"]').first().click();
  check(await page.locator('#speech-status button').isVisible(),'active speech retains stop control');
  await page.evaluate(()=>window.activeSpeech.onend());
  check(await page.locator('#speech-status').count()===0,'completed speech leaves no status bubble');
  check(await page.locator('.speaking').count()===0,'completed speech removes highlighting');
 }
 await context.close();return {passed:checks.length,checks};
}
