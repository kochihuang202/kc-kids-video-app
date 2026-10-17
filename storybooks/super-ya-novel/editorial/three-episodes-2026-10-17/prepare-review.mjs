import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateSubmission} from '../../scripts/validate-content.mjs';
const here=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(here,'../..');
const read=p=>JSON.parse(readFileSync(p,'utf8')),save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const extras=read(path.join(here,'extra-questions.json'));
const sharedGlossary=read(path.join(root,'content/glossary.json'));
const terms={
 '護城河':['ㄏㄨˋ ㄔㄥˊ ㄏㄜˊ','圍在城堡外面的水道。故事裡是沙堡旁挖出的水道。'],
 '寄居蟹':['ㄐㄧˋ ㄐㄩ ㄒㄧㄝˋ','會住進空貝殼、用殼保護柔軟身體的小動物。'],
 '牽掛':['ㄑㄧㄢ ㄍㄨㄚˋ','心裡一直記著，很在意。'],
 '錯覺':['ㄘㄨㄛˋ ㄐㄩㄝˊ','覺得看見或聽見了，卻可能和實際情況不同。'],
 '盼望':['ㄆㄢˋ ㄨㄤˋ','很希望一件事發生。'],
 '推測':['ㄊㄨㄟ ㄘㄜˋ','根據一些線索想可能的情況，還不是完全確定。'],
 '擅長':['ㄕㄢˋ ㄔㄤˊ','在某件事上比較拿手。'],
 '對打':['ㄉㄨㄟˋ ㄉㄚˇ','兩個人按照練習或比賽規則，互相進攻和防守。'],
 '道館':['ㄉㄠˋ ㄍㄨㄢˇ','故事裡指學習、練習空手道的地方。'],
 '諧星':['ㄒㄧㄝˊ ㄒㄧㄥ','以表演逗大家笑的藝人。'],
 '退縮':['ㄊㄨㄟˋ ㄙㄨㄛ','遇到困難或害怕時，不敢繼續往前。'],
 '預測':['ㄩˋ ㄘㄜˋ','事情還沒發生前，先推想可能的結果。'],
 '程式':['ㄔㄥˊ ㄕˋ','事先寫好的指令，讓機器依照安排做事。'],
 '操控':['ㄘㄠ ㄎㄨㄥˋ','操作裝置，讓機器依指令動作。'],
 '追究':['ㄓㄨㄟ ㄐㄧㄡˋ','繼續查問事情的原因，以及誰需要負責。'],
 '體諒':['ㄊㄧˇ ㄌㄧㄤˋ','試著理解別人的情況和困難。'],
 '推責':['ㄊㄨㄟ ㄗㄜˊ','急著把需要負責的事推到別人身上。']
};
const phraseSounds={
 '長大':{0:'ㄓㄤˇ'},'長得':{0:'ㄓㄤˇ'},'很長':{1:'ㄔㄤˊ'},
 '處理':{0:'ㄔㄨˇ'},'相處':{1:'ㄔㄨˇ'},'行程':{0:'ㄒㄧㄥˊ'},'行駛':{0:'ㄒㄧㄥˊ'},
 '覺得':{0:'ㄐㄩㄝˊ'},'覺察':{0:'ㄐㄩㄝˊ'},'錯覺':{1:'ㄐㄩㄝˊ'},
 '得到':{0:'ㄉㄜˊ'},'得先':{0:'ㄉㄟˇ'},'得看看':{0:'ㄉㄟˇ'},'得繼續':{0:'ㄉㄟˇ'},
 '重新':{0:'ㄔㄨㄥˊ'},'重逢':{0:'ㄔㄨㄥˊ'},'重讀':{0:'ㄔㄨㄥˊ'},'重要':{0:'ㄓㄨㄥˋ'},
 '比劃':{1:'ㄏㄨㄚˋ'},'諧星':{0:'ㄒㄧㄝˊ'},'害怕':{0:'ㄏㄞˋ'},'不服氣':{1:'ㄈㄨˊ'},
 '期待':{1:'ㄉㄞˋ'},'等一等':{0:'ㄉㄥˇ',2:'ㄉㄥˇ'},'地面':{0:'ㄉㄧˋ'},'目的地':{2:'ㄉㄧˋ'},
 '地方':{0:'ㄉㄧˋ'},'地上':{0:'ㄉㄧˋ'},'地點':{0:'ㄉㄧˋ'},'地球':{0:'ㄉㄧˋ'},
 '看得':{0:'ㄎㄢˋ'},'調解':{0:'ㄊㄧㄠˊ'},'臺灣':{0:'ㄊㄞˊ'},'角色':{0:'ㄐㄩㄝˊ'},
 '轉向':{0:'ㄓㄨㄢˇ'},'轉變':{0:'ㄓㄨㄢˇ'},'放假':{1:'ㄐㄧㄚˋ'},'假期':{0:'ㄐㄧㄚˋ'}
};
function choice(a){const [q,options,correct,evidence,h1,h2,why]=a;return {type:'choice',skill:'讀懂故事與根據',q,options,correct,evidence,hints:[h1,h2],why};}
const summaries=[];
for(const [order,id]of ['tata','karate','super-ya-review'].entries()){
 const dir=path.join(here,id),analysis=read(path.join(dir,'analysis.json'));
 const manuscript=readFileSync(path.join(dir,'whisper.txt'),'utf8').replace(/\r\n/g,'\n').trim();
 const chunks=manuscript.split(/\n\n(?=第[一二三四五六七八九十]+篇｜)/u);
 const chapters=chunks.map((chunk,i)=>{
  const lines=chunk.split('\n').map(s=>s.trim()).filter(Boolean),title=lines.shift();
  const cut=lines.indexOf('【現在的悄悄話】');if(lines[0]!=='【那一天】'||cut<2||lines.filter(s=>s==='【那一天】').length!==1)throw Error('Missing complete story/reflection: '+title);
  const blocks=[{type:'heading',text:'那一天'},...lines.slice(1,cut).map(text=>({type:'paragraph',text})),{type:'heading',text:'巧虎的時光悄悄話'},...lines.slice(cut+1).map(text=>({type:'paragraph',text}))];
  const guideStart=cut;
  return {id:`${id}-${i+1}`,title,blocks,presentation:{guideRanges:[[guideStart,blocks.length-1]],pictures:[],emphasis:{},events:[{label:title.split('｜')[1],block:1},{label:'再聽聽現在的巧虎',block:guideStart+1}]}};
 });
 if(chapters.length!==(id==='super-ya-review'?7:6))throw Error('Unexpected chapter count: '+id);
 const input=read(path.join(dir,'practice-source.json'));
 const scenes=input.map((s,i)=>{
  const [q,correct,h1,h2]=s.q2;
  const evidence={type:'evidence',skill:'找支持想法的原文',q,correct,evidence:[correct],hints:[h1,h2],why:`第${correct+1}段寫道：「${s.story[correct]}」這一段直接支持題目要找的意思。`};
  return {id:`s${i+1}`,title:s.title,subtitle:'先讀故事，再回原文找線索。',story:s.story,reflection:'可以用自己的話記下這一篇想到的事；也可以先不寫，接著讀。',evidenceReview:'逐題對照本單元原文；找原文題指向能直接支持題意的段落，未知勝負、人物動機不作既定事實。',questions:{story:[choice(s.q1),evidence,choice(s.q3),...(extras[id]?.[i]||[]).map(choice)]}};
 });
 const allText=JSON.stringify({chapters,scenes});
 const glossary=Object.fromEntries(Object.entries(terms).filter(([w])=>allText.includes(w)&&!sharedGlossary[w]).map(([w,[bopo,meaning]])=>[w,{bopo,meaning}]));
 const title=analysis.title,idBook=id==='super-ya-review'?'super-ya-revisit':id;
 const bundle={
  book:{id:idBook,title,number:String(order+3).padStart(2,'0'),subtitle:analysis.theme+'。先讀故事，再一起想。',detail:`完整初稿：${chapters.length}篇悄悄話、${scenes.length}單元理解。`,data:`books/${idBook}/story.json`,image:`assets/draft-${id}.jpg`,coverImage:`assets/draft-${id}.jpg`,imageAlt:`${title}的本集畫面`,storageKey:`shimajiro-novel:${idBook}:v1`},
  source:{original:'original.md',events:analysis.findings.map(([time,basis,event])=>({time,event,quote:'本列為情節整理，非逐字引用。原文見 original.md。',status:'明示；'+basis,turningPoint:true,expectation:'依正文描述，未補定未知內心。',result:event})),uncertainties:analysis.limits},
  editorial:{sourceReview:'完整初稿依原始逐字稿、已列影片片段及琪琪寫法完成；排除預告。小雅代詞另依台灣巧連智官方本集介紹使用「他」：https://www.youtube.com/watch?v=9prBOQklZ84 。YA 保留等待三天而不編技術原因；角色不明處用朋友。所有客觀題逐一對照本文所提供的段落。',phoneticReview:'預覽使用既有 Han.css 與語境注音，新增長大、處理、行程、得到、重新、角色等語境修正。關鍵詞讀音已整理；全篇注音仍屬待逐字人工覆校的初稿，不聲稱已完成全書人工注音校對。',glossaryReview:'保留既有詞語提示，新增正文出現的護城河、道館、諧星、操控等詞之臺灣注音與兒童詞義；未出現的詞不匯入。',unresolvedCritical:[],reviewStatus:'全文與題組完整初稿，供使用者一次確認，未上架。'},
  manuscript,
  story:{title,subtitle:'巧虎的時光悄悄話',edition:'complete-draft-2026-10-17',welcome:'先回到那一天，再一起慢慢想。',note:'',chapters},
  practice:{title,scenes},
  ui:{bookLabel:`${chapters.length}篇故事回看，一起慢慢想`,guideTag:'巧虎的時光悄悄話',storyTag:'先回到那一天，再聽巧虎的悄悄話。',guideHint:'',pictureCaption:'本集故事畫面',mapTitle:'一起回想這一篇',mapHint:'可以點文字，回去看看當時的故事。',mapEmpty:'往下讀，讀過的事情會慢慢出現在這裡。',previous:'上一篇',next:'繼續下一篇',reread:'從第一篇重讀'},
  glossary,readings:{characters:{},phrases:Object.fromEntries(Object.entries(phraseSounds).filter(([phrase])=>allText.includes(phrase)))}
 };
 validateSubmission(bundle);save(path.join(dir,'submission.json'),bundle);
 const review=[title+'｜完整初稿：時光悄悄話＋閱讀理解', '供成人一起校稿；以下含答案、提示與解析。', '', '＝＝＝＝時光悄悄話＝＝＝＝', manuscript, '', '＝＝＝＝閱讀理解與題解＝＝＝＝'];
 for(const [i,s]of scenes.entries()){
  review.push('',`第${i+1}單元｜${s.title}`,...s.story.map((t,n)=>`第${n+1}段　${t}`));
  for(const [n,q]of s.questions.story.entries())review.push('',`第${n+1}題　${q.q}`,...(q.type==='choice'?q.options.map((t,k)=>`（${k+1}）${t}`):['請從文章各段選擇。']),`答案：${q.type==='evidence'?'第'+(q.correct+1)+'段':q.options[q.correct]}`,`根據：第${q.evidence.map(e=>e+1).join('、')}段`,`提示一：${q.hints[0]}`,`提示二：${q.hints[1]}`,`解析：${q.why}`);
 }
 writeFileSync(path.join(dir,'review.txt'),review.join('\n\n')+'\n');
 const proseCount=chapters.map(c=>({title:c.title,characters:(c.blocks.filter(b=>b.type==='paragraph').map(b=>b.text).join('').match(/[\p{Script=Han}\p{N}]/gu)||[]).length}));
 summaries.push({id:idBook,title,whisperParts:chapters.length,whisperCharacters:proseCount.reduce((n,c)=>n+c.characters,0),chapters:proseCount,practiceUnits:scenes.length,questions:scenes.map(s=>s.questions.story.length),totalQuestions:scenes.reduce((n,s)=>n+s.questions.story.length,0),practiceCharacters:(scenes.flatMap(s=>s.story).join('').match(/[\p{Script=Han}\p{N}]/gu)||[]).length,newTerms:Object.keys(glossary)});
 const run=spawnSync(process.execPath,[path.join(root,'scripts/import-episode.mjs'),path.join(dir,'submission.json'),'--preview'],{cwd:root,stdio:'inherit'});if(run.status)process.exit(run.status);
}
// Combine the three isolated imports into a single review build, preserving originals.
const combined=path.join(root,'output/drafts/three-episodes'),content=path.join(combined,'content');mkdirSync(combined,{recursive:true});cpSync(path.join(root,'content'),content,{recursive:true});
const library=read(path.join(content,'library.json')),practice=read(path.join(content,'practice.json')),glossary=read(path.join(content,'glossary.json')),readings=read(path.join(content,'readings-overrides.json'));
for(const summary of summaries){
 const staged=path.join(root,'output/drafts',summary.id,'content'),b=read(path.join(staged,'library.json')).books.find(b=>b.id===summary.id);
 library.books.push(b);cpSync(path.join(staged,'books',summary.id),path.join(content,'books',summary.id),{recursive:true});practice[summary.id]=read(path.join(staged,'practice.json'))[summary.id];
 Object.assign(glossary,read(path.join(staged,'glossary.json')));Object.assign(readings.phrases,read(path.join(staged,'readings-overrides.json')).phrases);
}
save(path.join(content,'library.json'),library);save(path.join(content,'practice.json'),practice);save(path.join(content,'glossary.json'),glossary);save(path.join(content,'readings-overrides.json'),readings);
const build=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,READER_CONTENT:content,READER_DIST:path.join(combined,'dist'),READER_PREVIEW:'1'}});if(build.status)process.exit(build.status);
for(const id of ['tata','karate','super-ya-review'])cpSync(path.join(here,id,'cover.jpg'),path.join(combined,'dist/assets',`draft-${id}.jpg`));
save(path.join(here,'delivery-summary.json'),summaries);
console.log(JSON.stringify(summaries.map(({chapters,...summary})=>summary),null,2));
