import {createEditor,$getRoot,$createParagraphNode,$createTextNode,$createRangeSelection,$setSelection,$getNearestNodeFromDOMNode,$isTextNode,SKIP_SCROLL_INTO_VIEW_TAG,FORMAT_TEXT_COMMAND,UNDO_COMMAND,REDO_COMMAND} from 'lexical';
import {registerRichText,HeadingNode,QuoteNode} from '@lexical/rich-text';
import {registerHistory,createEmptyHistoryState} from '@lexical/history';
import {serializeEditorState} from '../core/editor-state.mjs';

export function createRichEditor({element,document:initialDocument,text='',onChange,onError,onSelection=()=>{}}){
  const editor=createEditor({namespace:'InkBridge',nodes:[HeadingNode,QuoteNode],
    theme:{paragraph:'editor-paragraph',heading:{h1:'editor-h1',h2:'editor-h2',h3:'editor-h3'},quote:'editor-quote',text:{bold:'editor-bold',italic:'editor-italic',underline:'editor-underline',strikethrough:'editor-strike'}},onError});
  // Validate persisted AST before binding DOM listeners to the shared root.
  const parsed=initialDocument?editor.parseEditorState(JSON.stringify(initialDocument)):null;
  const unregisterRich=registerRichText(editor),unregisterHistory=registerHistory(editor,createEmptyHistoryState(),300);
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
    setEditable:value=>editor.setEditable(value),
    isComposing:()=>composing||editor.isComposing(),snapshot,
    async flush(){
      if(disposed)throw Error('Editor is closed');
      if(composing||editor.isComposing())await new Promise(resolve=>waiters.add(resolve));
      if(disposed)throw Error('Editor closed before composition finished');
      // Public Lexical discrete update commits pending editor state; no sleep.
      editor.update(()=>{}, {discrete:true,tag:SKIP_SCROLL_INTO_VIEW_TAG});return publish();
    },
    dispose(){disposed=true;cancelAnimationFrame(selectionFrame);document.removeEventListener('selectionchange',selectionChanged);unregisterUpdate();unregisterHistory();unregisterRich();element.removeEventListener('compositionstart',start);element.removeEventListener('compositionend',end);editor.setRootElement(null);for(const resolve of waiters)resolve();waiters.clear();}
  };
}
