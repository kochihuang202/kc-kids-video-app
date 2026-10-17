import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const fail=message=>{throw new Error(message);};
export function validateBook({book,story,practice,existing=false}){
 if(!/^[a-z][a-z0-9-]{1,47}$/.test(book?.id||''))fail('作品識別碼須為穩定英數小寫');
 for(const file of [book.data,book.ui].filter(Boolean))if(!/^(?:books\/[a-z0-9-]+\/)?[a-z0-9-]+\.json$/.test(file))fail('不安全的作品路徑');
 if(book.practiceSource&&!/^books\/[a-z0-9-]+$/.test(book.practiceSource))fail('不安全的理解來源路徑');
 if(!story?.title||!story.chapters?.length||!practice?.scenes?.length)fail('兩種模式都需要完整內容');
 if(story.chapters.length>100||practice.scenes.length>100)fail('作品單元數超出上限');
 if(new Set(story.chapters.map(c=>c.id)).size!==story.chapters.length)fail('篇章識別碼重複');
 for(const c of story.chapters){
  if(!c.title||!c.blocks?.length||c.blocks.some(b=>!['heading','paragraph'].includes(b.type)||!b.text?.trim()))fail('悄悄話正文不完整');
  if(!c.presentation||!Array.isArray(c.presentation.guideRanges)||!Array.isArray(c.presentation.events)||!Array.isArray(c.presentation.pictures))fail('缺少陪讀區段與排版資料');
  for(const [start,end]of c.presentation.guideRanges)if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=c.blocks.length)fail('陪讀區段超出正文');
 }
 for(const [i,s]of practice.scenes.entries()){
  if(s.id!==`s${i+1}`||!s.title||!s.story?.length||s.story.some(t=>typeof t!=='string'||!t.trim()))fail('理解單元須有固定順序識別碼與獨立文章');
  const qs=s.questions?.story;if(!Array.isArray(qs)||qs.length<2)fail('每個理解單元須有理解題與原文根據題；題數依學習目標安排');
  for(const q of qs){
   if(!q.q||!q.why||q.hints?.length!==2||q.hints.some(h=>!h?.trim())||!q.evidence?.length)fail('題目缺少兩層提示、答案根據或解析');
   if(q.evidence.some(e=>!Number.isInteger(e)||e<0||e>=s.story.length))fail('答案根據超出文章');
   if(!['choice','evidence'].includes(q.type))fail('未知題型');
   const n=q.type==='choice'?q.options?.length:s.story.length;
   if(!n||!Number.isInteger(q.correct)||q.correct<0||q.correct>=n)fail('正確答案超出選項');
   if(q.type==='evidence'&&!q.evidence.includes(q.correct))fail('找原文題答案必須是原文根據');
  }
  if(!existing&&(qs[1].type!=='evidence'||!s.evidenceReview))fail('新稿須將第二題設為原文根據題，並附人工核對摘要');
 }
 return {whisper:story.chapters.length,practice:practice.scenes.length};
}
export function validateSubmission(bundle){
 const counts=validateBook(bundle);
 if(!bundle.source?.original||!bundle.source.events?.length||!Array.isArray(bundle.source.uncertainties))fail('缺少原稿、事件表或不確定事項');
 if(!bundle.editorial?.sourceReview||!bundle.editorial?.phoneticReview||!bundle.editorial?.glossaryReview)fail('缺少原稿、注音或詞義校對摘要');
 if(!bundle.manuscript?.trim())fail('缺少完整悄悄話稿');
 for(const [word,item]of Object.entries(bundle.glossary||{}))if(!word.trim()||!item.meaning?.trim()||!/^([˙]?[ㄅ-ㄩ]+[ˊˇˋ]?)( [˙]?[ㄅ-ㄩ]+[ˊˇˋ]?)*$/.test(item.bopo||''))fail('困難詞語需要臺灣注音與詞義');
 return counts;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const bundle=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(validateSubmission(bundle));
}
