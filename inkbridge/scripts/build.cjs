const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../src/editor/lexical-editor.mjs')],bundle:true,format:'esm',platform:'browser',target:'chrome156',
  outfile:path.resolve(__dirname,'../build/editor.mjs'),legalComments:'eof',sourcemap:true,define:{'process.env.NODE_ENV':'"production"'}});
