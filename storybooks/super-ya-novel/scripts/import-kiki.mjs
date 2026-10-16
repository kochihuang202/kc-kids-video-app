import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),folder=path.join(root,'content/books/kiki');
mkdirSync(folder,{recursive:true});
const target=path.join(folder,'source.md'),input=process.argv[2]?path.resolve(process.argv[2]):target;
const bytes=readFileSync(input);if(input!==target)copyFileSync(input,target);
const raw=bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
const sections=raw.split(/\n(?=# (?:第[一二三四五六七八]篇|尾聲)｜)/),preamble=sections.shift().trim();
const events=[
 ['花瓶打破了','爸爸提醒注意周圍','巧虎告訴朋友'],
 ['梅婆婆安慰巧虎','琪琪擔心爸爸不重視她','話還沒有說清楚'],
 ['琪琪還是不放心','朋友一起想辦法','琪琪決定試試看'],
 ['琪琪幫忙整理花草','一朵花折斷了','爸爸先看看琪琪的手'],
 ['巧虎想起包包上的塗鴉','琪琪畫了泥巴畫','爸爸竟然想珍藏'],
 ['朋友想到弄髒衣服','琪琪不喜歡泥巴，卻還是試了','爸爸鼓勵她玩耍'],
 ['大家一起踢足球','球滾向馬路，琪琪追出去','爸爸立刻叫住琪琪'],
 ['爸爸提醒琪琪，也向她道歉','琪琪問爸爸是不是罵她了','琪琪笑了','巧虎和桃樂比解釋原因','爸爸說出心裡的愛'],
 ['梅婆婆提醒大家回家','桃樂比開了個玩笑','大家笑了']
];
const phrases=['不是故意','同一個人說的兩句話','真正需要什麼','先做什麼','可不可以拿來畫','自己其實也有喜歡和不喜歡','沒有受傷','琪琪不用特地做錯事','先多問一句'];
const chapters=sections.map((section,i)=>{
 section=section.trim().replace(/\n\n---$/,'').trim();
 const split=section.indexOf('\n\n'),heading=section.slice(0,split),body=section.slice(split+2);
 const blocks=body.split(/\n\s*\n/).map(text=>text.startsWith('## ')?{type:'heading',text:text.slice(3)}:{type:'paragraph',text});
 const guide=blocks.findIndex(b=>b.type==='heading'&&b.text.startsWith('巧虎的時光悄悄話'));
 if(guide<1)throw new Error(`Missing guide section ${i+1}`);
 const emphasisIndex=blocks.findIndex((b,j)=>j>guide&&b.text.includes(phrases[i]));
 const presentation={guideRanges:[[guide+1,blocks.length-1]],emphasis:emphasisIndex>=0?{[emphasisIndex]:[phrases[i]]}:{},pictures:[],events:events[i].map((label,j)=>({block:j+1,label}))};
 return {id:`kiki-${i+1}`,title:heading.replace(/^# /,''),source:{heading},blocks,paragraphs:blocks.filter(b=>b.type==='paragraph').map(b=>b.text),presentation};
});
if(chapters.length!==9)throw new Error('Expected eight situations and an epilogue.');
const story={title:'琪琪被罵了',subtitle:'巧虎的時光悄悄話',edition:'kiki-complete-v1',welcome:'一起回到琪琪的那一天，也聽聽現在的巧虎怎麼想。',note:'依使用者提供的《琪琪被罵了》完整延伸導讀原稿製作；非官方作品，並非動畫逐字對白。',source:{file:path.basename(input),sha256:createHash('sha256').update(bytes).digest('hex'),preamble},chapters};
writeFileSync(path.join(folder,'story.json'),JSON.stringify(story,null,2)+'\n');
console.log(JSON.stringify({chapters:chapters.length,paragraphs:chapters.reduce((n,c)=>n+c.paragraphs.length,0),characters:chapters.flatMap(c=>c.blocks).map(b=>b.text).join('').match(/\p{Script=Han}/gu).length}));
