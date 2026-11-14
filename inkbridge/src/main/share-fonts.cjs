// Per-publication font subsets (user decision 2026-11-14). The reader's canvas loads every
// built-in font before it draws (original 65857 font manager); the CJK and colour-emoji fonts
// are ~21 MiB of a first visit. A publication ships subsets of those two that hold only the
// characters it can draw: its own graph text plus the reader's interface strings.
// HarfBuzz hb-subset (harfbuzzjs, MIT) does the subsetting; layout tables are kept for the
// retained glyphs. No original FlexNote source exists for this; it is InkBridge's own step.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const SUBSET_FONTS=[{file:'SourceHanSansSC-Regular.otf',extension:'otf',contentType:'font/otf',ranges:'text'},{file:'NotoColorEmoji-Regular.ttf',extension:'ttf',contentType:'font/ttf',ranges:'emoji'}];
// Text font always keeps printable ASCII, Latin-1, general punctuation, arrows, enclosed
// numbers, shapes, CJK symbols and full-width forms. The emoji font keeps only what the text
// uses, plus the joiners of emoji sequences (ZWJ, variation selector 16, keycap); a sequence's
// glyph is retained when all of its parts are present.
const RANGES={text:[[0x20,0x7e],[0xa0,0xff],[0x2000,0x206f],[0x20a0,0x20bf],[0x2190,0x21ff],[0x2460,0x24ff],[0x25a0,0x25ff],[0x3000,0x303f],[0xff00,0xffef]],emoji:[[0x200d,0x200d],[0xfe0f,0xfe0f],[0x20e3,0x20e3]]};
let engine;
async function load(){
 if(engine)return engine;
 const wasm=await fs.readFile(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'));
 const {instance}=await WebAssembly.instantiate(wasm,{});instance.exports._initialize?.();
 return engine=instance.exports;
}
function codepoints(texts,ranges='text'){const set=new Set();for(const text of texts)for(const c of String(text||''))set.add(c.codePointAt(0));for(const [a,b]of RANGES[ranges])for(let c=a;c<=b;c++)set.add(c);return set;}
async function subsetFont(bytes,points){
 const hb=await load();
 const pointer=hb.malloc(bytes.byteLength);new Uint8Array(hb.memory.buffer).set(bytes,pointer);
 const blob=hb.hb_blob_create(pointer,bytes.byteLength,2,0,0),face=hb.hb_face_create(blob,0);hb.hb_blob_destroy(blob);
 const input=hb.hb_subset_input_create_or_fail();if(!input){hb.hb_face_destroy(face);hb.free(pointer);throw Error('字型精簡初始化失敗');}
 const unicodes=hb.hb_subset_input_unicode_set(input);for(const c of points)hb.hb_set_add(unicodes,c);
 const result=hb.hb_subset_or_fail(face,input);hb.hb_subset_input_destroy(input);
 if(!result){hb.hb_face_destroy(face);hb.free(pointer);throw Error('字型精簡失敗');}
 const out=hb.hb_face_reference_blob(result),offset=hb.hb_blob_get_data(out,0),length=hb.hb_blob_get_length(out);
 const copy=Buffer.from(new Uint8Array(hb.memory.buffer,offset,length));
 hb.hb_blob_destroy(out);hb.hb_face_destroy(result);hb.hb_face_destroy(face);hb.free(pointer);
 if(!length)throw Error('字型精簡結果為空');return copy;
}
// Writes the subsets into <stage>/assets and returns share.json `fonts` records:
// {file (the reader's font file name), path, sha256, size, contentType}.
async function writeShareFonts({fontsDirectory,stage,texts}){
 const records=[];
 for(const font of SUBSET_FONTS){
  const source=await fs.readFile(path.join(fontsDirectory,font.file)),bytes=await subsetFont(source,codepoints(texts,font.ranges));
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),relative='assets/font-'+sha256+'.'+font.extension;
  await fs.writeFile(path.join(stage,relative),bytes);
  records.push({file:font.file,path:relative,sha256,size:bytes.length,contentType:font.contentType,sourceSize:source.length});
 }
 return records;
}
module.exports={writeShareFonts,subsetFont,codepoints,SUBSET_FONTS};
