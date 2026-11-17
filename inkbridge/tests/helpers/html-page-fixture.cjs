const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function(root){
 await fs.mkdir(path.join(root,'assets'),{recursive:true});
 const entry=path.join(root,'測試 網頁.html');
 await fs.writeFile(entry,'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/style.css"></head><body><h1 id="heading">HTML 完整呈現</h1><img id="picture" src="assets/image.svg"><button id="increment">計數 0</button><input id="typed" placeholder="可輸入"><script>document.documentElement.dataset.inlineReady="yes";</script><script type="module" src="assets/app.mjs"></script></body></html>');
 await fs.writeFile(path.join(root,'assets/style.css'),'@import "nested.css";@import "EMPTY.CSS";@font-face{font-family:fixture;src:url("font.ttf")}body{font-family:fixture;background:rgb(20,80,130);color:white}h1{font-size:32px}button{font-size:24px}');
 await fs.writeFile(path.join(root,'assets/EMPTY.CSS'),'');
 await fs.writeFile(path.join(root,'assets/nested.css'),'img{width:80px;height:60px}');
 await fs.copyFile(path.resolve(__dirname,'../../private-original-editor/vendor/app/fonts/NotoSans-Regular.ttf'),path.join(root,'assets/font.ttf'));
 await fs.writeFile(path.join(root,'assets/image.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="lime"/></svg>');
 await fs.writeFile(path.join(root,'assets/app.mjs'),'import {next} from "./helper.mjs";let count=0;document.querySelector("#increment").onclick=()=>{document.querySelector("#increment").textContent="計數 "+(count=next(count))};document.documentElement.dataset.moduleReady="yes";');
 await fs.writeFile(path.join(root,'assets/helper.mjs'),'export const next=value=>value+1;');
 return entry;
};
