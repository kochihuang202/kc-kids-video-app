import {readFileSync,writeFileSync} from 'node:fs';
const story=JSON.parse(readFileSync(new URL('../../content/books/super-ya-events/story.json',import.meta.url))),readings=JSON.parse(readFileSync(new URL('../../dist/readings.json',import.meta.url)));
const lines=[],contexts={};
for(const chapter of story.chapters){
 lines.push('# '+chapter.title);
 for(const text of [chapter.title,...chapter.blocks.map(b=>b.text)]){
  const chars=Array.from(text),sounds=readings[text];
  if(!sounds||sounds.length!==chars.length||chars.some((ch,i)=>/\p{Script=Han}/u.test(ch)&&!sounds[i]))throw Error('缺少注音：'+text);
  lines.push(chars.map((ch,i)=>sounds[i]?`${ch}(${sounds[i]})`:ch).join(''));
  chars.forEach((ch,i)=>{if('得重便好當長行教只著處間說了難背空看沒樂還子發'.includes(ch)){const sample=chars.slice(Math.max(0,i-3),i+5).join('')+' ['+sounds[i]+']';(contexts[ch]||=new Set()).add(sample);}});
 }
}
writeFileSync(new URL('./注音校對.txt',import.meta.url),lines.join('\n\n')+'\n');
writeFileSync(new URL('./多音字校對.json',import.meta.url),JSON.stringify(Object.fromEntries(Object.entries(contexts).map(([ch,s])=>[ch,[...s]])),null,2)+'\n');
for(const ch of process.argv.slice(2))console.log(ch,JSON.stringify([...contexts[ch]||[]]));
