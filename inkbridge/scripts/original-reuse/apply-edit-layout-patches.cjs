// FlexNote 1.1.70: checklist selector exclusion and editing-only canvas stroke.
// Keep the existing renderer, paint lifecycle and shared selection colours.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function({root,changes=[]}){
  const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
  function patch(file,anchor,replacement,id){
    const before=fs.readFileSync(file,'utf8');if(before.includes(replacement))return;
    if(before.split(anchor).length!==2)throw Error('Edit layout source anchor changed: '+id);
    const after=before.replace(anchor,replacement);
    if(!fs.existsSync(file+'.before-edit-layout'))fs.writeFileSync(file+'.before-edit-layout',before);
    fs.writeFileSync(file,after);changes.push({id,description:'Native 1.1.70 editing layout',beforeSha256:sha(before),afterSha256:sha(after)});
  }
  patch(path.join(root,'vendor/app/_next/static/css/0a3dd850c67b254e.css'),
    'body\r\n.canvas-lexical-editor-container\r\n.ContentEditable__root .PlaygroundEditorTheme__ul{',
    'body\r\n.canvas-lexical-editor-container\r\n.ContentEditable__root .PlaygroundEditorTheme__ul:not(.PlaygroundEditorTheme__checklist){','checklist-css');
  patch(path.join(root,'source-modules/module-74137.cjs'),
    '} if (M) {',
    '} if (null != n.editingNodeId && String(n.editingNodeId) === String(t.id))\n'+
    '            this.strokePaint.setPathEffect(null), this.strokePaint.setColor((0, r.uQ)(w, D ? "#ffffff" : "#000000")), this.strokePaint.setStrokeWidth(p.g1 / H), k.drawRRect($, this.strokePaint);\n'+
    '        else if (M) {','74137');
};
