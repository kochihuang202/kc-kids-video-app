const {createReadStream}=require('node:fs'),{Readable}=require('node:stream');
// Protocol responses preserve bounded memory and PDF.js byte-range loading.
async function attachmentResponse(request,attachments){
 try{
  const file=await attachments.resolveUrl(request.url),headers={'Content-Type':file.ext==='.pdf'?'application/pdf':'image/'+file.ext.slice(1),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','ETag':'"'+file.sha256+'"','X-Content-Type-Options':'nosniff'};
  if(file.ext==='.jpg')headers['Content-Type']='image/jpeg';
  let start=0,end=file.size-1,status=200;const range=request.headers.get('range'),ifRange=request.headers.get('if-range');
  if(range&&(!ifRange||ifRange===headers.ETag)){
   const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+file.size}});
   if(!m[1])start=Math.max(0,file.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=file.size)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+file.size}});
   status=206;headers['Content-Range']=`bytes ${start}-${end}/${file.size}`;
  }
  headers['Content-Length']=String(end-start+1);
  return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file.filePath,{start,end,highWaterMark:64*1024})),{status,headers});
 }catch{return new Response('Not found',{status:404});}
}
module.exports={attachmentResponse};
