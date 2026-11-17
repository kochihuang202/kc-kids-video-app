// Register the original page editors with InkBridge's existing commit/IME barrier.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../../private-original-editor/diary-todo-source');
{
 const file=path.join(root,'module-23997.cjs'),source=fs.readFileSync(file,'utf8'),before='let a = await (0, d.KD)("getNoteCardById", e); if (a && a.noteCard)',after='let a = { noteCard: await (0, d.KD)("getNoteCardById", e) }; /* inkbridgeTodoNoteContract */ if (a && a.noteCard)';
 if(!source.includes(after)){if(source.split(before).length!==2)throw Error('Todo source record contract changed');fs.writeFileSync(file,source.replace(before,after));}
 const current=fs.readFileSync(file,'utf8'),record='return { ...a.noteCard, content: e };',document='return e; /* inkbridgeTodoEditorDocumentContract */';
 if(!current.includes(document)){if(current.split(record).length!==2)throw Error('Todo editor document contract changed');fs.writeFileSync(file,current.replace(record,document));}
}
for(const id of ['55411','23997']){
 const file=path.join(root,`module-${id}.cjs`),source=fs.readFileSync(file,'utf8');
 if(source.includes('inkbridgeDiaryEditorAck'))continue;
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
 function visit(node){
  if(ts.isObjectLiteralExpression(node)){
   const props=new Map(node.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.getText(ast),p]));
   if(props.has('editorBlocks')&&props.has('cardId')&&props.has('cardType')&&props.get('cardType').initializer.getText(ast).includes('DailyNote')){
    if(props.has('onEditorReady'))throw Error('Unexpected original editor ACK contract');
    const cardId=props.get('cardId').initializer.getText(ast);
    edits.push({at:node.getStart(ast)+1,text:` onEditorReady: editor => globalThis.__inkbridgeRegisterSidebarEditor?.(${cardId},editor), /* inkbridgeDiaryEditorAck */ `});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);if(!edits.length)throw Error('Missing diary editor seam '+id);
 let after=source;for(const e of edits.sort((a,b)=>b.at-a.at))after=after.slice(0,e.at)+e.text+after.slice(e.at);
 fs.writeFileSync(file,after);console.log(JSON.stringify({module:id,editors:edits.length}));
}
