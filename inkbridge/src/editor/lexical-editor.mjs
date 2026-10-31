import {createEditor,$getRoot,$createParagraphNode,$createTextNode,$createRangeSelection,$setSelection,$getNearestNodeFromDOMNode,$isTextNode,SKIP_SCROLL_INTO_VIEW_TAG,FORMAT_TEXT_COMMAND,UNDO_COMMAND,REDO_COMMAND} from 'lexical';
import {registerRichText,HeadingNode,QuoteNode} from '@lexical/rich-text';
import {registerHistory,createEmptyHistoryState} from '@lexical/history';
import {ListNode,ListItemNode,registerList,registerCheckList,INSERT_UNORDERED_LIST_COMMAND,INSERT_ORDERED_LIST_COMMAND,INSERT_CHECK_LIST_COMMAND} from '@lexical/list';
import {CodeNode,CodeHighlightNode,$createCodeNode} from '@lexical/code';
import {registerCodeHighlighting} from '@lexical/code-prism';
import {LinkNode,AutoLinkNode} from '@lexical/link';
import {TableNode,TableRowNode,TableCellNode,registerTablePlugin,registerTableSelectionObserver,INSERT_TABLE_COMMAND} from '@lexical/table';
import {$setBlocksType} from '@lexical/selection';
import {$getSelection,$isRangeSelection} from 'lexical';
import {$createHeadingNode,$createQuoteNode} from '@lexical/rich-text';
import {PASTE_COMMAND,COMMAND_PRIORITY_HIGH} from 'lexical';
import {SUPPORTED_NODE_TYPES} from '../core/rich-document.mjs';
import {serializeEditorState} from '../core/editor-state.mjs';

export function createRichEditor({element,document:initialDocument,text='',onChange,onError,onSelection=()=>{},onNotice=()=>{}}){
  const editor=createEditor({namespace:'InkBridge',nodes:[HeadingNode,QuoteNode,ListNode,ListItemNode,CodeNode,CodeHighlightNode,LinkNode,AutoLinkNode,TableNode,TableRowNode,TableCellNode],
    theme:{paragraph:'editor-paragraph',heading:Object.fromEntries([1,2,3,4,5,6].map(n=>[`h${n}`,`editor-h${n}`])),quote:'editor-quote',
      list:{ul:'editor-ul',ol:'editor-ol',listitem:'editor-listitem',listitemChecked:'editor-checked',listitemUnchecked:'editor-unchecked',nested:{listitem:'editor-nested-listitem'}},
      code:'editor-code',codeHighlight:{keyword:'token-keyword',string:'token-string',comment:'token-comment',function:'token-function',number:'token-number',operator:'token-operator'},
      link:'editor-link',table:'editor-table',tableCell:'editor-cell',tableCellHeader:'editor-cell-header',tableSelection:'editor-table-selection',
      text:{bold:'editor-bold',italic:'editor-italic',underline:'editor-underline',strikethrough:'editor-strike',code:'editor-inline-code',underlineStrikethrough:'editor-underline-strike'}},onError});
  // Validate persisted AST before binding DOM listeners to the shared root.
  const parsed=initialDocument?editor.parseEditorState(JSON.stringify(initialDocument)):null;
  const unregisterRich=registerRichText(editor),unregisterHistory=registerHistory(editor,createEmptyHistoryState(),300);
  const unregisterNodes=[registerList(editor),registerCheckList(editor),registerCodeHighlighting(editor),registerTablePlugin(editor),registerTableSelectionObserver(editor,true)];
  // Protect known unsupported rich input BEFORE an HTML importer can flatten
  // it. This supplements, rather than replaces, the persisted-AST preflight.
  const unregisterPaste=editor.registerCommand(PASTE_COMMAND,event=>{
    const data=event?.clipboardData;if(!data)return false;const unknown=new Set();let internal=false;
    try{const payload=JSON.parse(data.getData('application/x-lexical-editor'));if(payload?.namespace==='InkBridge'&&Array.isArray(payload.nodes)){
      internal=true;const visit=node=>{if(!SUPPORTED_NODE_TYPES.includes(node.type))unknown.add(node.type);for(const child of node.children||[])visit(child);};payload.nodes.forEach(visit);
    }}catch{/* No matching internal rich MIME; public Lexical handles HTML/plain. */}
    const html=data.getData('text/html');
    if(html&&!internal){const dom=new DOMParser().parseFromString(html,'text/html');
      for(const node of dom.querySelectorAll('img,video,audio,iframe,svg,math,details,summary,[data-callout-type],[data-lexical-equation],[data-lexical-mention-name],[data-lexical-poll-question],[data-lexical-time-timestamp],[data-lexical-collapsible-content]'))unknown.add(node.tagName.toLowerCase());
    }
    if(!unknown.size){onNotice('');return false;}
    event.preventDefault();onNotice(`尚未貼入：內容包含待整合的節點（${[...unknown].join('、')}）。原筆記及剪貼簿保持完整。`);return true;
  },COMMAND_PRIORITY_HIGH);
  editor.setRootElement(element);
  if(parsed)editor.setEditorState(parsed);
  else editor.update(()=>{const root=$getRoot();root.clear();for(const line of text.split('\n'))root.append($createParagraphNode().append($createTextNode(line)));},{discrete:true});
  editor.update(()=>{},{discrete:true,tag:SKIP_SCROLL_INTO_VIEW_TAG});
  let last='',composing=false,disposed=false,selectionFrame=0;const waiters=new Set();
  const snapshot=()=>{const state=editor.getEditorState();return {document:serializeEditorState(state),body:state.read(()=>$getRoot().getTextContent())};};
  const publish=()=>{const value=snapshot(),serialized=JSON.stringify(value.document);if(serialized!==last){last=serialized;onChange(value);}return value;};
  last=JSON.stringify(snapshot().document);
  const selectionChanged=()=>{
    if(selectionFrame||disposed)return;
    selectionFrame=requestAnimationFrame(()=>{selectionFrame=0;if(disposed)return;const selection=window.getSelection();if(!selection?.rangeCount||!element.contains(selection.anchorNode))return;onSelection(selection.getRangeAt(0).getBoundingClientRect());});
  };
  const unregisterUpdate=editor.registerUpdateListener(({dirtyElements,dirtyLeaves})=>{if(disposed)return;if(dirtyElements.size||dirtyLeaves.size)publish();selectionChanged();});
  document.addEventListener('selectionchange',selectionChanged);
  const start=()=>{composing=true;};
  const end=()=>{composing=false;queueMicrotask(()=>{for(const resolve of waiters)resolve();waiters.clear();});};
  element.addEventListener('compositionstart',start);element.addEventListener('compositionend',end);
  return {
    async focus(point){
      if(disposed)return;
      if(!point){editor.focus(undefined,{defaultSelection:'rootEnd'});return;}
      await new Promise(resolve=>requestAnimationFrame(resolve));if(disposed)return;
      element.focus({preventScroll:true});
      const bounds=element.getBoundingClientRect(),x=Math.max(bounds.left+.5,Math.min(point.x,bounds.right-.5)),y=Math.max(bounds.top+.5,Math.min(point.y,bounds.bottom-.5));
      let range=document.caretRangeFromPoint?.(x,y);
      if(!range){const caret=document.caretPositionFromPoint?.(x,y);if(caret){range=document.createRange();range.setStart(caret.offsetNode,caret.offset);range.collapse(true);}}
      if(!range||!element.contains(range.startContainer)){editor.focus(undefined,{defaultSelection:'rootEnd'});return;}
      editor.update(()=>{const selection=$createRangeSelection();selection.applyDOMRange(range);const node=$getNearestNodeFromDOMNode(range.startContainer);
        if($isTextNode(node)){selection.format=node.getFormat();selection.style=node.getStyle();}$setSelection(selection);},{discrete:true,tag:SKIP_SCROLL_INTO_VIEW_TAG});
    },
    format:type=>editor.dispatchCommand(FORMAT_TEXT_COMMAND,type),undo:()=>editor.dispatchCommand(UNDO_COMMAND),redo:()=>editor.dispatchCommand(REDO_COMMAND),
    block:type=>{
      const command={bullet:INSERT_UNORDERED_LIST_COMMAND,number:INSERT_ORDERED_LIST_COMMAND,check:INSERT_CHECK_LIST_COMMAND}[type];
      if(command){editor.dispatchCommand(command,undefined);return;}
      editor.update(()=>{const selection=$getSelection();if($isRangeSelection(selection))$setBlocksType(selection,()=>/^h[1-6]$/.test(type)?$createHeadingNode(type):type==='quote'?$createQuoteNode():type==='code'?$createCodeNode('javascript'):$createParagraphNode());},{discrete:true});
    },
    insertTable:()=>editor.dispatchCommand(INSERT_TABLE_COMMAND,{rows:'3',columns:'2',includeHeaders:true}),
    setEditable:value=>editor.setEditable(value),
    isComposing:()=>composing||editor.isComposing(),snapshot,
    async flush(){
      if(disposed)throw Error('Editor is closed');
      if(composing||editor.isComposing())await new Promise(resolve=>waiters.add(resolve));
      if(disposed)throw Error('Editor closed before composition finished');
      // Public Lexical discrete update commits pending editor state; no sleep.
      editor.update(()=>{}, {discrete:true,tag:SKIP_SCROLL_INTO_VIEW_TAG});return publish();
    },
    dispose(){disposed=true;cancelAnimationFrame(selectionFrame);document.removeEventListener('selectionchange',selectionChanged);unregisterUpdate();unregisterPaste();for(const unregister of unregisterNodes.reverse())unregister();unregisterHistory();unregisterRich();element.removeEventListener('compositionstart',start);element.removeEventListener('compositionend',end);editor.setRootElement(null);for(const resolve of waiters)resolve();waiters.clear();}
  };
}
