import {DEFAULT_TYPOGRAPHY,projectDocument} from './rich-document.mjs';

// InkBridge adapter for public Lexical AST. Source-bound measurements and
// remaining original-editor parity gaps: docs/EDITOR_SOURCE_CONFIRMATION.md.
export function blockTypography(block){
  const base=DEFAULT_TYPOGRAPHY.fontSize;
  const heading={h1:[2,600,1.1],h2:[1.5,700,1],h3:[1.2,600,.9],h4:[1.1,600,.8],h5:[1,600,.7],h6:[.9,600,.6]}[block.tag];
  if(heading){const size=base*heading[0];return {fontSize:size,weight:heading[1],lineHeight:1.58,top:size*heading[2],bottom:size*.25};}
  return {fontSize:base,weight:400,lineHeight:block.type==='code'?1.775:DEFAULT_TYPOGRAPHY.lineHeight,top:block.type==='code'?12:4,bottom:block.type==='code'?8:4};
}
const tokens={keyword:'#a626a4',string:'#50834a',comment:'#6a737d',function:'#4078b8',number:'#986801',operator:'#986801'};
function inlineStyle(value){
  const result={};for(const declaration of (value||'').split(';')){const colon=declaration.indexOf(':');if(colon>=0)result[declaration.slice(0,colon).trim().toLowerCase()]=declaration.slice(colon+1).trim();}return result;
}
export class NoteLayout {
  constructor(engine){this.engine=engine;}
  layout(content,width,{maxLines=9999,draw,decorate}={}){
    const projection=projectDocument(content),operations=[],retained=[];let remaining=maxLines;
    const visit=(nodes,available,x=0,top=0,context={})=>{
      let y=0,previousBottom=0;const boxes=[];
      for(const node of nodes){
        if(remaining<=0)break;
        const typography=blockTypography(node),gap=boxes.length?Math.max(previousBottom,typography.top):0;y+=gap;
        let box={type:node.type,text:node.runs.map(run=>run.text).join(''),left:x,top:top+y,gap,typography,lines:[]};
        if(node.type==='list'){
          const items=[];let itemY=0;
          for(let index=0;index<node.children.length;index++){
            const item=node.children[index],nested=item.children.filter(child=>child.type==='list');
            const marker=node.listType==='number'?`${(node.start||1)+index}.`:node.listType==='check'?(item.checked?'☑':'☐'):'•';
            const lines=item.inline.length?[{...item,type:'paragraph',runs:item.inline,children:[]}]:item.children.filter(child=>child.type!=='list');
            if(!lines.length&&!nested.length)lines.push({...item,type:'paragraph',runs:[],children:[]});
            const child=visit(lines,Math.max(1,available-24),x+24,top+y+itemY,{...context,checked:node.listType==='check'&&item.checked});
            if(lines.length){const markerNode={type:'paragraph',runs:[{text:marker,format:0,style:''}]},markerBox={...box,left:x,top:top+y+itemY,height:22.4};
              const measured=this.paragraph(markerNode,24,typography,context,maxLines,!!draw);if(measured.paragraph)retained.push(measured.paragraph);operations.push({kind:'text',paragraph:measured.paragraph,box:markerBox});}
            const sub=visit(nested,Math.max(1,available-24),x+24,top+y+itemY+child.height,context);
            const height=child.height+sub.height;items.push({top:itemY,height,children:child.blocks,nested:sub.blocks});itemY+=height+4;
          }
          box={...box,height:Math.max(22.4,itemY?itemY-4:0),items};
        }else if(node.type==='table'){
          const rows=node.children,occupied=[],cells=[];let count=0;
          for(let r=0;r<rows.length;r++){
            occupied[r]??=[];let c=0;
            for(const cell of rows[r].children){while(occupied[r][c])c++;const colSpan=Math.max(1,cell.colSpan),rowSpan=Math.min(rows.length-r,Math.max(1,cell.rowSpan));
              for(let dr=0;dr<rowSpan;dr++){occupied[r+dr]??=[];for(let dc=0;dc<colSpan;dc++)occupied[r+dr][c+dc]=true;}
              cells.push({node:cell,row:r,col:c,colSpan,rowSpan});c+=colSpan;count=Math.max(count,c);
            }
          }
          count=Math.max(1,count);let widths=Array.from({length:count},(_,i)=>Math.max(1,node.colWidths?.[i]||available/count));
          const sum=widths.reduce((a,b)=>a+b,0);if(sum>available)widths=widths.map(w=>w*available/sum);
          const heights=rows.map(()=>Math.round(typography.fontSize*1.6)+16),pending=[];
          for(const cell of cells){
            const cellWidth=widths.slice(cell.col,cell.col+cell.colSpan).reduce((a,b)=>a+b,0),start=operations.length;
            const child=visit(cell.node.children.length?cell.node.children:[{...cell.node,type:'paragraph'}],Math.max(1,cellWidth-24),0,0,{...context,table:true,header:!!cell.node.headerState});
            pending.push({...cell,cellWidth,child,ops:operations.splice(start)});
            if(cell.rowSpan===1)heights[cell.row]=Math.max(heights[cell.row],child.height+16);
          }
          for(const cell of pending){const span=heights.slice(cell.row,cell.row+cell.rowSpan).reduce((a,b)=>a+b,0);if(span<cell.child.height+16)heights[cell.row+cell.rowSpan-1]+=cell.child.height+16-span;}
          const geometry=[];
          for(const cell of pending){
            const left=x+widths.slice(0,cell.col).reduce((a,b)=>a+b,0),cellTop=top+y+heights.slice(0,cell.row).reduce((a,b)=>a+b,0),height=heights.slice(cell.row,cell.row+cell.rowSpan).reduce((a,b)=>a+b,0);
            const rect={left,top:cellTop,width:cell.cellWidth,height,header:!!cell.node.headerState,background:cell.node.backgroundColor};geometry.push({...rect,row:cell.row,col:cell.col,colSpan:cell.colSpan,rowSpan:cell.rowSpan});
            operations.push({kind:'cell',box:rect});
            for(const operation of cell.ops){operation.box={...operation.box,left:operation.box.left+left+12,top:operation.box.top+cellTop+8};operations.push(operation);}
          }
          box={...box,height:heights.reduce((a,b)=>a+b,0),cells:geometry,colWidths:widths,rowHeights:heights};
        }else{
          const inset=node.type==='quote'?20:node.type==='code'?12:0;
          const textBox={...box,left:x+inset,top:box.top+(node.type==='code'?8:0)};
          const measured=this.paragraph(node,Math.max(1,available-inset-(node.type==='code'?12:0)),typography,context,remaining,!!draw);
          remaining-=Math.max(1,measured.lines.length);
          if(measured.paragraph)retained.push(measured.paragraph);textBox.height=measured.height;textBox.lines=measured.lines;
          box={...box,height:measured.height+(node.type==='code'?16:0),lines:measured.lines};
          if(node.type==='code'||node.type==='quote')operations.push({kind:node.type,box:{...box,width:available}});
          operations.push({kind:'text',paragraph:measured.paragraph,box:textBox});
        }
        boxes.push(box);y+=box.height;previousBottom=typography.bottom;
      }
      return {blocks:boxes,height:y};
    };
    try{
      const layout=visit(projection.blocks,Math.max(1,width));
      if(draw||decorate)for(const operation of operations){if(operation.kind==='text'){if(draw)draw(operation.paragraph,operation.box);}else decorate?.(operation.kind,operation.box);}
      return {...layout,text:projection.text,unknownTypes:projection.unknownTypes};
    }finally{for(const paragraph of retained)this.engine.resources.release(paragraph);}
  }
  paragraph(block,width,typography,context,maxLines,retain){
    const {K,fontManager,fontFamilies,resources}=this.engine;
    const mono=this.engine.monoFamilies?.length?this.engine.monoFamilies:fontFamilies;
    const textStyle={fontFamilies:block.type==='code'?mono:fontFamilies,fontSize:typography.fontSize,letterSpacing:typography.fontSize*.001,heightMultiplier:typography.lineHeight,halfLeading:true,
      color:this.engine.color(block.type==='quote'?'#65676b':'#6d786e'),fontStyle:{weight:context.header?600:typography.weight}};
    const style=new K.ParagraphStyle({maxLines,ellipsis:'…',applyRoundingHack:false,textStyle,
      strutStyle:{strutEnabled:true,fontFamilies:textStyle.fontFamilies,fontSize:typography.fontSize,heightMultiplier:typography.lineHeight,halfLeading:true,forceStrutHeight:false}});
    let builder,paragraph,success=false;
    try{
      builder=resources.own(K.ParagraphBuilder.Make(style,fontManager),'ParagraphBuilder');if(this.engine.profile)this.engine.profile.paragraphs++;
      for(const run of block.runs){
        const css=inlineStyle(run.style),bold=(run.format&1)!==0,italic=(run.format&2)!==0,underline=(run.format&8)!==0,strike=(run.format&4)!==0||context.checked,code=(run.format&16)!==0;
        const size=/^\d+(\.\d+)?px$/.test(css['font-size']||'')?Math.max(1,Math.min(300,parseFloat(css['font-size']))):typography.fontSize;
        const color=css.color||tokens[run.highlightType]||(code?'#f31260':run.url?'#2563eb':context.checked?'#8c9290':bold||typography.weight>400?'#253c32':block.type==='quote'?'#65676b':'#6d786e');
        builder.pushStyle(new K.TextStyle({...textStyle,fontSize:size,fontFamilies:code?mono:textStyle.fontFamilies,color:K.parseColorString(color),
          ...(css['background-color']?{backgroundColor:K.parseColorString(css['background-color'])}:{}),
          fontStyle:{weight:bold?(context.table?600:700):context.header?600:typography.weight,slant:italic?K.FontSlant.Italic:K.FontSlant.Upright},
          decoration:(underline||run.url?K.UnderlineDecoration:0)|(strike?K.LineThroughDecoration:0)}));
        builder.addText(run.text);builder.pop();
      }
      paragraph=resources.own(builder.build(),'Paragraph');if(this.engine.failNextLayout){this.engine.failNextLayout=false;throw Error('Injected paragraph layout failure');}
      paragraph.layout(Math.max(1,width));const lines=paragraph.getLineMetrics();success=true;
      return {height:Math.max(paragraph.getHeight(),typography.fontSize*typography.lineHeight),lines:lines.map(line=>({baseline:line.baseline,left:line.left,width:line.width,height:line.height})),paragraph:retain?paragraph:null};
    }finally{if(!success||!retain)resources.release(paragraph);resources.release(builder);}
  }
  bounds(content,width){const layout=this.layout(content,width-DEFAULT_TYPOGRAPHY.padding*2);return {layout,height:Math.max(DEFAULT_TYPOGRAPHY.minHeight,Math.ceil(layout.height+DEFAULT_TYPOGRAPHY.padding*2+DEFAULT_TYPOGRAPHY.topPadding))};}
}
