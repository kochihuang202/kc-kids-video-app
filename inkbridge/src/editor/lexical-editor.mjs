import {createEditor,$getRoot,$createParagraphNode,$createTextNode,FORMAT_TEXT_COMMAND,UNDO_COMMAND,REDO_COMMAND} from 'lexical';
import {registerRichText,HeadingNode,QuoteNode} from '@lexical/rich-text';
import {registerHistory,createEmptyHistoryState} from '@lexical/history';
import {serializeEditorState} from '../core/editor-state.mjs';

export function createRichEditor({element,document:initialDocument,text='',onChange,onError}){
  const editor=createEditor({namespace:'InkBridge',nodes:[HeadingNode,QuoteNode],
    theme:{paragraph:'editor-paragraph',text:{bold:'editor-bold',italic:'editor-italic',underline:'editor-underline'}},onError});
  const unregisterRich=registerRichText(editor),unregisterHistory=registerHistory(editor,createEmptyHistoryState(),300);
  editor.setRootElement(element);
  if(initialDocument)editor.setEditorState(editor.parseEditorState(JSON.stringify(initialDocument)));
  else editor.update(()=>{const root=$getRoot();root.clear();for(const line of text.split('\n'))root.append($createParagraphNode().append($createTextNode(line)));},{discrete:true});
  let last='',composing=false,disposed=false;const waiters=new Set();
  const snapshot=()=>{const state=editor.getEditorState();return {document:serializeEditorState(state),body:state.read(()=>$getRoot().getTextContent())};};
  const publish=()=>{const value=snapshot(),serialized=JSON.stringify(value.document);if(serialized!==last){last=serialized;onChange(value);}return value;};
  last=JSON.stringify(snapshot().document);
  const unregisterUpdate=editor.registerUpdateListener(({dirtyElements,dirtyLeaves})=>{if(!disposed&&(dirtyElements.size||dirtyLeaves.size))publish();});
  const start=()=>{composing=true;};
  const end=()=>{composing=false;queueMicrotask(()=>{for(const resolve of waiters)resolve();waiters.clear();});};
  element.addEventListener('compositionstart',start);element.addEventListener('compositionend',end);
  return {
    focus:()=>editor.focus(),format:type=>editor.dispatchCommand(FORMAT_TEXT_COMMAND,type),undo:()=>editor.dispatchCommand(UNDO_COMMAND),redo:()=>editor.dispatchCommand(REDO_COMMAND),
    setEditable:value=>editor.setEditable(value),
    isComposing:()=>composing||editor.isComposing(),snapshot,
    async flush(){
      if(disposed)throw Error('Editor is closed');
      if(composing||editor.isComposing())await new Promise(resolve=>waiters.add(resolve));
      if(disposed)throw Error('Editor closed before composition finished');
      // Public Lexical discrete update commits pending editor state; no sleep.
      editor.update(()=>{}, {discrete:true});return publish();
    },
    dispose(){disposed=true;unregisterUpdate();unregisterHistory();unregisterRich();element.removeEventListener('compositionstart',start);element.removeEventListener('compositionend',end);editor.setRootElement(null);for(const resolve of waiters)resolve();waiters.clear();}
  };
}
