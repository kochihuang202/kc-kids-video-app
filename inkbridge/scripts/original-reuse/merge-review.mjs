// One resumable review panel. Text from either computer is rendered as text,
// never injected HTML; decisions remain in the main-process durable draft.
let opened = null;
import {publishThisComputer} from './authoritative-local.mjs';
const time = v => v ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v)) : '';
export function openMergeReview() {
    if (opened)
        return opened;
    opened = review().finally(() => opened = null);
    return opened;
}
async function review() {
    const dialog = document.createElement('dialog');
    dialog.id = 'sync-merge-dialog';
    dialog.innerHTML = `<style>
 #sync-merge-dialog{border:1px solid #e4e4e7;border-radius:16px;padding:0;width:min(820px,94vw);max-height:88vh;color:#27272a;background:#fff;box-shadow:0 16px 64px #0002;font:14px system-ui,sans-serif}
 #sync-merge-dialog::backdrop{background:#0004}#sync-merge-dialog header{padding:24px 28px 16px;border-bottom:1px solid #eee}#sync-merge-dialog h2{font-size:20px;font-weight:600;margin:0 0 8px}#sync-merge-dialog p{margin:4px 0;color:#71717a;line-height:1.6}
 #sync-merge-dialog main{padding:20px 28px;overflow:auto;max-height:55vh}#sync-merge-dialog .merge-step{font-size:12px;color:#71717a;margin-bottom:12px}#sync-merge-dialog h3{margin:8px 0;font-size:16px}#sync-merge-dialog .merge-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}#sync-merge-dialog .merge-option{border:1px solid #e4e4e7;border-radius:12px;padding:16px;min-width:0}#sync-merge-dialog .merge-option[data-selected=true]{border-color:#2563eb;box-shadow:0 0 0 1px #2563eb;background:#eff6ff}#sync-merge-dialog pre{font:13px/1.7 system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-height:26vh;overflow:auto;margin:12px 0;min-height:60px;background:#f5f5f7;color:#27272a;padding:12px;border-radius:8px}#sync-merge-dialog .merge-computer{font-size:12px;color:#71717a;margin-top:4px}
 #sync-merge-dialog button{border:1px solid #e4e4e7;border-radius:8px;background:#fff;color:#3f3f46;padding:8px 13px;cursor:pointer;font:inherit}#sync-merge-dialog button:disabled{opacity:.45;cursor:default}#sync-merge-dialog button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}#sync-merge-dialog .primary{background:#27272a;color:white;border-color:#27272a}#sync-merge-dialog footer{padding:16px 28px;border-top:1px solid #eee;display:flex;gap:8px;align-items:center}#sync-merge-dialog #merge-status{flex:1;font-size:12px;color:#71717a}#sync-merge-dialog select{max-width:100%;border:1px solid #e4e4e7;border-radius:8px;padding:6px;background:white;color:#3f3f46;font:inherit}#sync-merge-dialog .merge-warning{color:#b45309}
 @media(max-width:580px){#sync-merge-dialog .merge-columns{grid-template-columns:1fr}#sync-merge-dialog main{padding:16px}#sync-merge-dialog header,#sync-merge-dialog footer{padding:16px}}
 </style><header><h2>處理同步衝突</h2><p>不重疊的修改會一起保留。請逐項選擇，完成後才套用合併結果。</p></header><main><div class="merge-step" id="merge-step"></div><select id="merge-jump" aria-label="選擇衝突項目"></select><h3 id="merge-title"></h3><p id="merge-reason"></p><div class="merge-columns"><section class="merge-option" id="merge-local"><strong>這台電腦</strong><div class="merge-computer" id="merge-local-info"></div><pre id="merge-local-preview"></pre><button id="merge-use-local">使用這台的修改</button></section><section class="merge-option" id="merge-remote"><strong>另一台電腦</strong><div class="merge-computer" id="merge-remote-info"></div><pre id="merge-remote-preview"></pre><button id="merge-use-remote">使用另一台的修改</button></section></div><p style="font-size:12px;margin-top:12px">此處為內容預覽；合併前已備份兩邊內容，備份依既有規則管理。選擇會自動記住，中途關閉可以繼續。</p></main><footer><span id="merge-status" role="status" aria-live="polite"></span><button id="merge-later">稍後處理</button><button id="merge-prev">上一項</button><button id="merge-next">下一項</button><button class="primary" id="merge-finish">完成合併</button></footer>`;
    const authorityButton=document.createElement('button');authorityButton.id='merge-authoritative-local';authorityButton.textContent='整份以這台為準';authorityButton.title='以這台目前工作區的完整內容為準；其他電腦會先備份尚未同步的修改，再對齊';dialog.querySelector('footer').insertBefore(authorityButton,dialog.querySelector('#merge-later'));
    document.body.append(dialog);
    const $ = id => dialog.querySelector('#' + id);
    let model = null, index = 0, busy = false, feedback = '', resolveDone;
    const done = new Promise(resolve => resolveDone = resolve);
    const text = (id, value) => $(id).textContent = value || '';
    function close(result) { dialog.close(); dialog.remove(); resolveDone(result); }
    function paint() {
        if (!model)
            return;
        const conflicts = model.conflicts || [];
        index = Math.max(0, Math.min(index, conflicts.length - 1));
        const current = conflicts[index];
        $('merge-jump').replaceChildren(...conflicts.map((c, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `${c.choice ? '✓ ' : ''}${i + 1}. ${c.board ? c.board + ' ／ ' : ''}${c.title} · ${c.field}`; return o; }));
        $('merge-jump').value = String(index);
        text('merge-step', `第 ${index + 1}／${conflicts.length} 項 · 尚有 ${model.remaining} 項待選擇`);
        text('merge-title', current ? [current.board, current.title, current.field].filter(Boolean).join(' ／ ') : '沒有待處理的衝突');
        text('merge-reason', current?.reason);
        for (const side of ['local', 'remote']) {
            text('merge-' + side + '-info', [model[side]?.computer, time(model[side]?.time)].filter(Boolean).join(' · '));
            text('merge-' + side + '-preview', current?.[side]);
            $('merge-' + side).dataset.selected = String(current?.choice === side);
        }
        for (const b of dialog.querySelectorAll('button,select'))
            b.disabled = busy;
        $('merge-prev').disabled = busy || index === 0;
        $('merge-next').disabled = busy || index >= conflicts.length - 1;
        $('merge-finish').disabled = busy || model.remaining > 0;
        text('merge-status', busy ? '正在安全保存與確認…' : feedback || (model.remaining ? '選擇已自動保留' : '已選好，可以完成合併'));
    }
    async function run(action) { if (busy)
        return; busy = true; feedback = ''; paint(); try {
        await action();
    }
    catch (error) {
        if (dialog.isConnected) {
            feedback = error.message;
            $('merge-status').classList.add('merge-warning');
        }
    }
    finally {
        busy = false;
        if (dialog.isConnected) {
            paint();
        }
    } }
    for (const side of ['local', 'remote'])
        $('merge-use-' + side).onclick = () => run(async () => { model = await window.inkbridge.sync({ method: 'mergeChoice', sessionId: model.sessionId, conflictId: model.conflicts[index].id, choice: side }); index = Math.min(index + 1, model.conflicts.length - 1); });
    $('merge-prev').onclick = () => { index--; paint(); };
    $('merge-next').onclick = () => { index++; paint(); };
    $('merge-jump').onchange = e => { index = Number(e.target.value); paint(); };
    $('merge-later').onclick = () => close({ later: true });
    dialog.addEventListener('cancel', e => { e.preventDefault(); if (!busy)
        close({ later: true }); });
    $('merge-authoritative-local').onclick=()=>run(async()=>close(await publishThisComputer()));
    $('merge-finish').onclick = () => run(async () => { const result = await window.inkbridge.sync({ method: 'mergeFinish', sessionId: model.sessionId }); if (result.kind === 'ready') {
        window.dispatchEvent(new Event('inkbridge:merge-completed'));
        close(result);
    }
    else {
        model = result;
        index = 0;
        feedback = '內容有新修改，請確認更新後的項目';
    } });
    try {
        model = await window.inkbridge.sync({ method: 'mergeReview' });
        if (model?.kind === 'ready') {
            window.dispatchEvent(new Event('inkbridge:merge-completed'));
            close(model);
            return done;
        }
        if (model?.kind !== 'merge-conflicts')
            throw Error(model?.error || '目前無法取得合併項目');
        paint();
        dialog.showModal();
    }
    catch (error) {
        dialog.remove();
        resolveDone({ error: error.message });
        throw error;
    }
    return done;
}
