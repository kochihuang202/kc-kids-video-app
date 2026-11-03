import {cardMaxHeight} from '/inkbridge-core/card-height.mjs';
export function installCardHeightSettings(dialog){
 const section=dialog.querySelector('#settings-panel-editor');
 section.querySelector('.settings-empty').outerHTML=`<div class="settings-card"><h3>卡片高度</h3><p>新卡片會隨內容增高，到達上限後改為卡片內捲動。手動調整的卡片保持原尺寸；「自動高度」可以展開全文。</p><label for="card-max-height">新卡片高度上限（白板 100% 時的像素）</label><input id="card-max-height" type="number" min="160" max="10000" step="1"><p id="card-height-preview"></p><div class="settings-actions"><button id="save-card-max-height">保存高度設定</button></div><div id="card-height-visual" style="width:104px;border:1px solid #d4d4d8;border-radius:8px;background:white;display:grid;place-items:center;font-size:11px;color:#71717a">卡片比例</div></div>`;
 const input=section.querySelector('input'),preview=section.querySelector('#card-height-preview'),visual=section.querySelector('#card-height-visual');
 const paint=()=>{const height=Number(input.value);preview.textContent=`以預設寬度 520 為例，高度上限 ${height}；原有手動尺寸不變。`;visual.style.height=Math.min(400,height/5)+'px';};
 const read=async()=>{const device=await window.inkbridge.sync({method:'deviceRead'});input.value=cardMaxHeight(device.editorPreferences?.cardMaxHeight);paint();};read().catch(console.error);input.addEventListener('input',paint);
 section.querySelector('button').onclick=async()=>{const value=Number(input.value);if(!input.reportValidity()||cardMaxHeight(value)!==value)return;try{await window.inkbridge.sync({method:'deviceWrite',key:'editorPreferences',value:{cardMaxHeight:value}});window.dispatchEvent(new CustomEvent('inkbridge:card-height-preference',{detail:value}));document.querySelector('#storage-settings-status').textContent='已保存卡片高度設定；新卡片與「重設高度」會採用此上限。';}catch(error){document.querySelector('#storage-settings-status').textContent=error.message;}};
 return {read};
}
