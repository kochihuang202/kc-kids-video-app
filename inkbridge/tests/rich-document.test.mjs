import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_TYPOGRAPHY,noteDocument,deriveTitle,projectDocument} from '../src/core/rich-document.mjs';
import {createEditor,$getRoot} from 'lexical';
import {HeadingNode,QuoteNode} from '@lexical/rich-text';
import {serializeEditorState} from '../src/core/editor-state.mjs';

const text=(value,format=0,style='')=>({type:'text',version:1,text:value,format,style,detail:0,mode:'normal'});
const paragraph=(...children)=>({type:'paragraph',version:1,children,direction:null,format:'',indent:0});
const doc=(...children)=>({root:{type:'root',version:1,children,direction:null,format:'',indent:0}});

test('legacy title migration preserves the body, empty lines and is idempotent across JSON reload',()=>{
  const content={title:'獨立標題',body:'\n第一段\n\n最後一段\n'};
  const first=noteDocument(content);
  assert.equal(first.root.children[0].type,'heading');assert.equal(first.root.children[0].tag,'h1');
  assert.deepEqual(first.root.children.slice(1).map(p=>p.children.map(n=>n.text).join('')),['','第一段','','最後一段','']);
  const reloaded=JSON.parse(JSON.stringify(first));
  assert.deepEqual(noteDocument({...content,document:reloaded}),first);
  assert.equal(projectDocument({...content,document:reloaded}).text,'獨立標題\n\n第一段\n\n最後一段\n');
  assert.deepEqual(content,{title:'獨立標題',body:'\n第一段\n\n最後一段\n'});
});

test('matching first paragraph or long heading never receives a duplicate legacy title',()=>{
  const body='第一段\n第二段';const plain=noteDocument({title:'第一段',body});
  assert.equal(plain.root.children.length,2);assert.equal(plain.root.children[0].type,'paragraph');
  const longTitle='龍'.repeat(75);const initial=noteDocument({title:longTitle,body:'正文'});
  assert.equal(deriveTitle(initial),'龍'.repeat(60));
  assert.deepEqual(noteDocument({title:longTitle,body:'正文',document:initial}),initial);
  assert.deepEqual(noteDocument({title:deriveTitle(initial),document:initial}),initial);
});

test('legacy adaptation parses in public Lexical and remains idempotent after its serialized reload',()=>{
  const initial=noteDocument({title:'既有標題龍',body:'\n第一段\n\n最後一段\n'});
  const editor=createEditor({namespace:'rich-document-roundtrip',nodes:[HeadingNode,QuoteNode],onError:error=>{throw error;}});
  const state=editor.parseEditorState(JSON.stringify(initial)),serialized=serializeEditorState(state);
  assert.equal(state.read(()=>$getRoot().getChildrenSize()),6);
  assert.equal(deriveTitle(serialized),'既有標題龍');
  assert.deepEqual(noteDocument({title:deriveTitle(serialized),document:serialized}),serialized);
  assert.equal(projectDocument({document:serialized}).text,'既有標題龍\n\n第一段\n\n最後一段\n');
});

test('projection preserves soft linebreaks, tabs and leading/trailing/empty blocks',()=>{
  const document=doc(paragraph(),paragraph(text('Alpha'),{type:'linebreak',version:1},text('Beta'),{type:'tab',version:1}),paragraph(),paragraph(text('Gamma')),paragraph());
  const projection=projectDocument({title:'',document});
  assert.equal(projection.text,'\nAlpha\nBeta\t\n\nGamma\n');
  assert.equal(projection.blocks.length,5);assert.equal(projection.blocks[1].runs.map(r=>r.text).join(''),'Alpha\nBeta\t');
  assert.deepEqual(projection.unknownTypes,[]);
});

test('normalization deeply preserves existing AST attributes, formats and metadata without mutation',()=>{
  const document=doc(paragraph(text('中文👩‍👧龍',3,'color: #123456;'),{type:'linebreak',version:1}));
  document.root.custom={nested:['keep']};document.root.children[0].textFormat=1;
  const before=structuredClone(document),normalized=noteDocument({title:'中文👩‍👧龍',document});
  assert.deepEqual(normalized,document);normalized.root.custom.nested.push('new');
  assert.deepEqual(document,before);
  const projection=projectDocument({document});
  assert.deepEqual(projection.blocks[0].runs[0],{text:'中文👩‍👧龍',format:3,style:'color: #123456;'});
});

test('nested inline text and unsupported block structures retain text with explicit unknown types',()=>{
  const document=doc(paragraph(text('請看'),{type:'link',version:1,url:'https://example.invalid',children:[text('連結',1)]}),
    {type:'list',version:1,listType:'bullet',children:[{type:'listitem',version:1,children:[text('項目一')]},{type:'listitem',version:1,children:[text('項目二')]}]},
    {type:'future-widget',version:7,children:[text('未知節點文字')]});
  const projection=projectDocument({document});
  assert.equal(projection.text,'請看連結\n項目一\n項目二\n未知節點文字');
  assert.deepEqual(projection.unknownTypes,['future-widget','link','list','listitem']);
  assert.equal(projection.blocks[1].type,'list');
  assert.deepEqual(projection.document,document);
});

test('title derives from first nonempty readable block and truncates Unicode code points safely',()=>{
  const document=doc(paragraph(),paragraph(text('  ')),paragraph(text('🚀龍👩‍👧正文')));
  assert.equal(deriveTitle(document,2),'🚀龍');assert.equal(deriveTitle(document,0),'');
  assert.equal(deriveTitle(doc(paragraph(text('第一行'),{type:'linebreak',version:1},text('第二行'),{type:'tab',version:1},text('後方')))),'第一行\n第二行\t後方');
  assert.equal(deriveTitle(doc()),'');
  assert.throws(()=>deriveTitle(document,-1),/max/);
});

test('malformed existing documents are rejected rather than replaced with plain text',()=>{
  assert.throws(()=>noteDocument({title:'保留',body:'fallback',document:{root:{type:'root',children:'invalid'}}}),/document/);
  assert.throws(()=>noteDocument({document:{root:{type:'paragraph',children:[]}}}),/document/);
});

test('shared note-card defaults are immutable and contain no renderer-specific measurements',()=>{
  assert.deepEqual(DEFAULT_TYPOGRAPHY,{fontSize:14,lineHeight:1.6,padding:48,topPadding:2,minHeight:200});
  assert.ok(Object.isFrozen(DEFAULT_TYPOGRAPHY));
});
