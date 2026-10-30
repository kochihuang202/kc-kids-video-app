import {DEFAULT_TYPOGRAPHY,projectDocument} from './rich-document.mjs';

// Original NoteCard Skia block rules, independently implemented. DOM consumes
// these measured boxes too; the original DOM's separate tuning is not assumed equal.
export function blockTypography(block){
  const base=DEFAULT_TYPOGRAPHY.fontSize;
  const heading={h1:[2,600,1.1],h2:[1.5,700,1],h3:[1.2,600,.9]}[block.tag];
  if(heading){const size=base*heading[0];return {fontSize:size,weight:heading[1],lineHeight:1.58,top:size*heading[2],bottom:size*.25};}
  return {fontSize:base,weight:400,lineHeight:DEFAULT_TYPOGRAPHY.lineHeight,top:4,bottom:4};
}

export class NoteLayout {
  constructor(engine){this.engine=engine;}
  layout(content,width,{maxLines=9999,draw}={}){
    const {K,fontManager,fontFamilies,resources}=this.engine,projection=projectDocument(content),blocks=[];
    let y=0,previousBottom=0,remaining=maxLines;
    for(const block of projection.blocks){
      if(remaining<=0)break;
      const typography=blockTypography(block),gap=blocks.length?Math.max(previousBottom,typography.top):0;y+=gap;
      const textStyle={fontFamilies,fontSize:typography.fontSize,letterSpacing:typography.fontSize*.001,heightMultiplier:typography.lineHeight,halfLeading:true,
        color:this.engine.color('#6d786e'),fontStyle:{weight:typography.weight}};
      const style=new K.ParagraphStyle({maxLines:remaining,ellipsis:'…',applyRoundingHack:false,textStyle,
        strutStyle:{strutEnabled:true,fontFamilies,fontSize:typography.fontSize,heightMultiplier:typography.lineHeight,halfLeading:true,forceStrutHeight:false}});
      let builder,paragraph;
      try{
        builder=resources.own(K.ParagraphBuilder.Make(style,fontManager),'ParagraphBuilder');
        if(this.engine.profile)this.engine.profile.paragraphs++;
        for(const run of block.runs){
          const bold=(run.format&1)!==0,italic=(run.format&2)!==0,underline=(run.format&8)!==0,strike=(run.format&4)!==0;
          builder.pushStyle(new K.TextStyle({...textStyle,color:this.engine.color(bold||typography.weight>400?'#253c32':'#6d786e'),
            fontStyle:{weight:bold?700:typography.weight,slant:italic?K.FontSlant.Italic:K.FontSlant.Upright},
            decoration:(underline?K.UnderlineDecoration:0)|(strike?K.LineThroughDecoration:0)}));
          builder.addText(run.text);builder.pop();
        }
        paragraph=resources.own(builder.build(),'Paragraph');
        if(this.engine.failNextLayout){this.engine.failNextLayout=false;throw Error('Injected paragraph layout failure');}
        paragraph.layout(Math.max(1,width));
        const lines=paragraph.getLineMetrics(),height=Math.max(paragraph.getHeight(),typography.fontSize*typography.lineHeight);
        const box={text:block.runs.map(run=>run.text).join(''),top:y,height,gap,typography,lines:lines.map(line=>({baseline:line.baseline,left:line.left,width:line.width,height:line.height}))};
        blocks.push(box);draw?.(paragraph,box);y+=height;previousBottom=typography.bottom;remaining-=Math.max(1,lines.length);
      }finally{resources.release(paragraph);resources.release(builder);}
    }
    return {text:projection.text,blocks,height:y,unknownTypes:projection.unknownTypes};
  }
  bounds(content,width){const layout=this.layout(content,width-DEFAULT_TYPOGRAPHY.padding*2);return {layout,height:Math.max(DEFAULT_TYPOGRAPHY.minHeight,Math.ceil(layout.height+DEFAULT_TYPOGRAPHY.padding*2+DEFAULT_TYPOGRAPHY.topPadding))};}
}
