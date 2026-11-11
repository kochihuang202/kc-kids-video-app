const test=require('node:test'),assert=require('node:assert/strict'),{scopeWebShare}=require('../src/main/web-share-data.cjs');
const hash='a'.repeat(64),file={id:hash,name:'picture.png',type:'png',sha256:hash,size:1,filePath:`files/${hash}.png`,metadata:'{}'};
function fixture(){return {boards:['root','child','grand','private'].map(id=>({id,title:id,attributes:{}})),whiteboardInstances:[['root','child'],['child','grand'],['grand','root']].map(([containerId,whiteboardId],i)=>({id:'ref'+i,containerType:'whiteboard',containerId,whiteboardId})),contents:[{id:'n',kind:'text',document:{root:{type:'root',children:[{type:'tabs',activeTabId:'one',children:[{type:'inkbridge-tab-panel',tabId:'one',children:[{type:'callout',title:'keep',children:[{type:'image',src:'flexnote://file/'+hash}]}]}]}]}}},{id:'secret',kind:'text',document:{root:{type:'root',children:[]}}}],instances:[{id:'i',contentId:'n',boardId:'grand'},{id:'s',contentId:'secret',boardId:'private'}],files:[file],settings:{token:'NEVER_EXPORT'},contentVersions:[{content:'SECRET_HISTORY'}]};}
test('published nested closure terminates cycles, keeps complete AST and excludes unrelated/private data',()=>{const g=fixture(),s=scopeWebShare(g,'root');assert.deepEqual(s.boardIds,['root','child','grand']);assert.deepEqual(s.graph.contents[0].document,g.contents[0].document);assert.equal(s.files.length,1);assert(!JSON.stringify(s.graph).includes('secret'));assert(!JSON.stringify(s.graph).includes('NEVER_EXPORT'));assert(!JSON.stringify(s.graph).includes('SECRET_HISTORY'));assert(!JSON.stringify(s.graph).includes('filePath'));assert.equal(g.boards.length,4);});
test('missing nested boards and attachments fail before publication',()=>{const g=fixture();g.boards=g.boards.filter(b=>b.id!=='grand');assert.throws(()=>scopeWebShare(g,'root'),/子白板不存在/);const a=fixture();a.files=[];assert.throws(()=>scopeWebShare(a,'root'),/附件缺失/);});
test('unsafe attachment references and undownloaded image sources cannot become standalone shares',()=>{const g=fixture();g.contents[0].document.root.children=[{type:'image',src:'flexnote://file/../../private'}];assert.throws(()=>scopeWebShare(g,'root'),/格式不合法/);g.contents[0].document.root.children=[{type:'image',src:'https://example.com/private.png'}];assert.throws(()=>scopeWebShare(g,'root'),/未下載/);});
test('hidden metadata and trash do not leak through visible board/card records',()=>{const g=fixture();g.boards[0].attributes={color:'green',token:'SECRET_ACCOUNT',view:{x:45,y:22}};g.instances[0].attributes={color:'blue',secret:'SECRET_INSTANCE'};g.cardMetadata=[{id:'n',color:'red',privateNotes:'SECRET_CARD'}];const s=scopeWebShare(g,'root');assert(!JSON.stringify(s.graph).includes('SECRET_'));assert.equal(s.graph.boards[0].attributes.color,'green');assert.equal(s.graph.instances[0].attributes.color,'blue');assert(!('view' in s.graph.boards[0]));g.cardMetadata[0].isTrashed=true;assert.equal(scopeWebShare(g,'root').graph.contents.length,0);});
test('empty boards are valid and duplicate child placements do not duplicate board data',()=>{const g=fixture();g.whiteboardInstances.push({...g.whiteboardInstances[0],id:'duplicate'});assert.equal(scopeWebShare(g,'root').boardIds.length,3);assert.equal(scopeWebShare({boards:[{id:'empty',title:'空白'}]},'empty').graph.contents.length,0);});

test('explicit selection defaults to root and unselected children expose only generic geometry',()=>{
 const g=fixture();g.whiteboardInstances[0].name='PRIVATE_CHILD_NAME';g.whiteboardInstances[0].inkbridgePreviewFileId=hash;
 g.boards[0].attributes={inkbridgePreviewFileId:hash,backgroundImage:'flexnote://file/'+hash,color:'green'};
 const s=scopeWebShare(g,'root',{selectedBoardIds:[]});assert.deepEqual(s.boardIds,['root']);assert.equal(s.graph.contents.length,0);assert.equal(s.files.length,0);
 assert.deepEqual(s.graph.whiteboardInstances,[{id:'ref0',whiteboardId:'child',containerId:'root',containerType:'whiteboard',isUnshared:true,name:'未分享'}]);
 assert(!JSON.stringify(s).includes('PRIVATE_CHILD_NAME'));assert(!JSON.stringify(s).includes(hash));assert.equal(s.graph.boards[0].attributes.color,'green');
});
test('selecting a grandchild includes a finite ancestor path, and rejects unrelated identities',()=>{
 const g=fixture();assert.deepEqual(scopeWebShare(g,'root',{selectedBoardIds:['grand']}).boardIds,['root','child','grand']);
 assert.throws(()=>scopeWebShare(g,'root',{selectedBoardIds:['private']}),/不在分享範圍/);
 const {getShareTree,updateSelection}=require('../src/main/share-selection.cjs'),tree=getShareTree(g,'root');
 assert.deepEqual(updateSelection(tree,['root','child','grand'],'child',false),['root']);
 assert.deepEqual(updateSelection(tree,['root'],'grand',true),['root','child','grand']);
 assert.deepEqual(updateSelection(tree,['root'],'root',false),['root']);
});
test('generated preview is omitted but an actual user background remains in explicit shares',()=>{
 const g=fixture();g.boards[0].attributes={inkbridgePreviewFileId:'b'.repeat(64),backgroundImage:'flexnote://file/'+hash};
 const result=scopeWebShare(g,'root',{selectedBoardIds:['root']});assert.equal(result.files[0].id,hash);assert(!JSON.stringify(result).includes('b'.repeat(64)));
 g.boards[1].attributes={inkbridgePreviewFileId:'b'.repeat(64)};g.whiteboardInstances[0].backgroundImage='flexnote://file/'+'b'.repeat(64);
 const child=scopeWebShare(g,'root',{selectedBoardIds:['child']});assert(!JSON.stringify(child).includes('b'.repeat(64)));
});
