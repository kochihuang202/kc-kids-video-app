let batch=0,utterance;
const speakStatus=message=>{let el=document.querySelector('#speech-status');if(!el){el=document.createElement('p');el.id='speech-status';el.className='speech-status';el.setAttribute('role','status');document.body.append(el);}el.textContent=message;if(message.includes('正在')){const button=document.createElement('button');button.type='button';button.textContent='停止朗讀';button.onclick=()=>stopSpeech(true);el.append(button);}};
export function stopSpeech(announce=false){batch++;window.speechSynthesis?.cancel();utterance=null;document.querySelector('#speech-status')?.remove();document.querySelectorAll('.speaking').forEach(n=>n.classList.remove('speaking'));if(announce)speakStatus('朗讀已停止');}
export function speakParagraphs(items,rate=0.85){
 stopSpeech();if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){speakStatus('這個裝置目前沒有可用的語音朗讀，仍可照常閱讀。');return;}
 const id=batch;let index=0;
 const next=()=>{
  if(id!==batch||index>=items.length){if(id===batch){utterance=null;document.querySelector('#speech-status')?.remove();}return;}
  const item=items[index++],u=new SpeechSynthesisUtterance(item.text.replace(/\*\*/g,''));utterance=u;u.lang='zh-TW';u.rate=rate;u.pitch=1;
  const voices=window.speechSynthesis.getVoices(),voice=voices.find(v=>/^zh[-_]TW$/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));if(voice)u.voice=voice;
  u.onstart=()=>{if(id!==batch)return;speakStatus('正在使用裝置語音朗讀');if(item.element){item.element.classList.add('speaking');const r=item.element.getBoundingClientRect();if(r.top<70||r.bottom>innerHeight)item.element.scrollIntoView({block:'center',behavior:'smooth'});}};
  u.onend=()=>{item.element?.classList.remove('speaking');next();};
  u.onerror=event=>{item.element?.classList.remove('speaking');if(id!==batch)return;batch++;if(!['canceled','interrupted'].includes(event.error))speakStatus('目前無法使用裝置語音，請確認裝置有中文語音，也可以先自己閱讀。');};
  try{window.speechSynthesis.speak(u);}catch{speakStatus('目前無法使用裝置語音，仍可照常閱讀。');}
 };next();
}
window.addEventListener('pagehide',()=>stopSpeech());
// Some devices populate voices only after the voiceschanged event.
if('speechSynthesis'in window){window.speechSynthesis.getVoices();window.speechSynthesis.addEventListener?.('voiceschanged',()=>window.speechSynthesis.getVoices());}
export function showWord(word,glossary,ruby,rate){
 const entry=glossary[word];if(!entry)return;
 document.querySelector('#word-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='word-dialog';dialog.className='word-dialog';
 const title=document.createElement('h2');title.id='word-title';title.textContent=word;
 const bopo=document.createElement('p');bopo.className='word-bopo';bopo.textContent=entry.bopo;
 const meaning=document.createElement('p');meaning.className='word-meaning';meaning.innerHTML=ruby(entry.meaning);
 const listen=document.createElement('button');listen.type='button';listen.innerHTML=ruby('聽這個詞');listen.setAttribute('aria-label','聽這個詞');listen.onclick=()=>speakParagraphs([{text:word}],rate);
 const close=document.createElement('button');close.type='button';close.innerHTML=ruby('回去繼續讀');close.setAttribute('aria-label','回去繼續讀');close.onclick=()=>dialog.close();
 dialog.append(title,bopo,meaning,listen,close);dialog.setAttribute('aria-labelledby','word-title');document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
 dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
}
export function wordRanges(text,glossary){
 const chars=Array.from(text),words=Object.keys(glossary).sort((a,b)=>b.length-a.length),result=[];
 for(let i=0;i<chars.length;){const word=words.find(w=>chars.slice(i,i+Array.from(w).length).join('')===w);if(word){const end=i+Array.from(word).length;result.push({start:i,end,word});i=end;}else i++;}
 return result;
}
