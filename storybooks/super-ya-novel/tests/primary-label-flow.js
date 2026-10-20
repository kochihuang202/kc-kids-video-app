async sessionPage=>{
 const browser=sessionPage.context().browser(),context=await browser.newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',route=>route.abort());
 const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
 const colors=()=>page.locator('[data-p="next-scene"]').evaluate(button=>{
  const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(n=>Number(n)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const style=getComputedStyle(button),base=getComputedStyle(button.querySelector('rb')),annotation=getComputedStyle(button.querySelector('rt'));
  const contrast=color=>{const a=luminance(color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  return {textContrast:contrast(base.color),annotationContrast:contrast(annotation.color),color:base.color,background:style.backgroundColor};
 });
 await page.goto('http://127.0.0.1:4178/?book=kiki&mode=practice&scene=0');
 await page.locator('[data-p="begin"]').click();
 for(let i=0;i<3;i++)await page.locator('[data-p="next"]').click();
 await page.locator('#own-note').waitFor();await page.mouse.move(0,0);
 const normal=await colors();check(normal.textContrast>=4.5,'finished-unit Chinese label is readable before hovering: '+JSON.stringify(normal));
 check(normal.annotationContrast>=4.5,'finished-unit annotation is readable before hovering');
 await page.locator('[data-p="next-scene"]').hover();check((await colors()).textContrast>=4.5,'finished-unit Chinese label remains readable on hover');
 await page.mouse.move(0,0);await page.locator('[data-p="next-scene"]').focus();check((await colors()).textContrast>=4.5,'finished-unit Chinese label remains readable with keyboard focus');
 await page.screenshot({path:'output/playwright/primary-label-fixed.png'});
 await page.locator('[data-p="next-scene"]').click();await page.locator('.practice-paper').waitFor();check(new URL(page.url()).searchParams.get('scene')==='1','visible next-unit button opens the actual next unit');
 await context.close();return {passed:checks.length,checks};
}
