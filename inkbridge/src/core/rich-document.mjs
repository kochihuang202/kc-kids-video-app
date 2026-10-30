// Shared, renderer-independent document semantics. The serialized AST remains
// authoritative; projection never discards or rewrites unsupported node data.
export const DEFAULT_TYPOGRAPHY=Object.freeze({fontSize:14,lineHeight:1.6,padding:48,topPadding:2,minHeight:200});

const supportedTypes=new Set(['root','paragraph','heading','quote','text','linebreak','tab']);
const blockTypes=new Set(['paragraph','heading','quote','code','list','listitem','table','tablerow','tablecell','table-row','table-cell']);
const clone=value=>structuredClone(value);
const textNode=text=>({type:'text',version:1,text,format:0,style:'',detail:0,mode:'normal'});
const paragraph=text=>({type:'paragraph',version:1,children:text?[textNode(text)]:[],direction:null,format:'',indent:0});
const heading=text=>({...paragraph(text),type:'heading',tag:'h1'});
const root=children=>({root:{type:'root',version:1,children,direction:null,format:'',indent:0}});

function validateDocument(document){
  if(!document||typeof document!=='object'||Array.isArray(document)||!document.root||
    document.root.type!=='root'||!Array.isArray(document.root.children)){
    throw new TypeError('Invalid rich document root; refusing to replace existing document');
  }
  return document;
}

function addRun(runs,text,node={}){
  runs.push({text,format:Number.isInteger(node.format)?node.format:0,style:typeof node.style==='string'?node.style:''});
}

function inlineRuns(node,runs,unknownTypes){
  if(!node||typeof node!=='object')return;
  const type=typeof node.type==='string'?node.type:'unknown';
  if(!supportedTypes.has(type))unknownTypes?.add(type);
  if(type==='linebreak'){addRun(runs,'\n');return;}
  if(type==='tab'){addRun(runs,'\t',node);return;}
  if(typeof node.text==='string'){addRun(runs,node.text,node);return;}
  if(!Array.isArray(node.children))return;
  for(let index=0;index<node.children.length;index++){
    const child=node.children[index],previous=node.children[index-1];
    // Retain boundaries within unsupported nested structures (e.g. list items)
    // without pretending their bullets, tables or controls are implemented.
    if(index>0&&(blockTypes.has(child?.type)||blockTypes.has(previous?.type)))addRun(runs,'\n');
    inlineRuns(child,runs,unknownTypes);
  }
}

function blockText(node){
  const runs=[];inlineRuns(node,runs);return runs.map(run=>run.text).join('');
}

/** Derive metadata only; do not mutate, flatten or replace the source AST. */
export function deriveTitle(document,max=60){
  validateDocument(document);
  if(max!==Infinity&&(!Number.isSafeInteger(max)||max<0))throw new RangeError('max must be a nonnegative safe integer or Infinity');
  for(const block of document.root.children){
    const readable=blockText(block).trim();
    if(readable)return max===Infinity?readable:Array.from(readable).slice(0,max).join('');
  }
  return '';
}

/**
 * Adapt earlier InkBridge title/body records to a single editable AST.
 * Existing serialized children and extension attributes are deeply preserved.
 */
export function noteDocument(content={}){
  let document;
  if(content.document!=null)document=clone(validateDocument(content.document));
  else{
    const body=typeof content.body==='string'?content.body:'';
    document=root(body.split('\n').map(line=>paragraph(line)));
  }
  const title=typeof content.title==='string'?content.title.trim():'';
  if(title){
    const full=deriveTitle(document,Infinity),short=deriveTitle(document);
    if(title!==full&&title!==short)document.root.children.unshift(heading(title));
  }
  return document;
}

/**
 * Project only readable runs for layout. Unknown nodes remain in `document`
 * and are reported explicitly; this is not a rich-node feature support claim.
 */
export function projectDocument(content={}){
  const document=noteDocument(content),unknownTypes=new Set();
  const blocks=document.root.children.map(node=>{
    const runs=[];inlineRuns(node,runs,unknownTypes);
    return {type:node?.type||'unknown',tag:typeof node?.tag==='string'?node.tag:null,
      format:node?.format??'',indent:node?.indent??0,runs};
  });
  return {document,blocks,text:blocks.map(block=>block.runs.map(run=>run.text).join('')).join('\n'),unknownTypes:[...unknownTypes].sort()};
}
