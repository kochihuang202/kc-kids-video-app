const fs=require('node:fs');const path=require('node:path');
const file=process.argv[2]||path.resolve(__dirname,'../artifacts/benchmark.json');
const report=JSON.parse(fs.readFileSync(file,'utf8'));
console.log(JSON.stringify(report.environment,null,2));
for(const count of [100,300,500]){
 const rows=report.results.filter(row=>row.count===count);
 const range=read=>[Math.min(...rows.map(read)),Math.max(...rows.map(read))].map(n=>Number(n.toFixed(2)));
 console.log(JSON.stringify({count,groups:rows.length,samples:rows.reduce((n,row)=>n+row.cpuSubmitMs.samples,0),
  cpuMedianMs:range(r=>r.cpuSubmitMs.median),cpuP95Ms:range(r=>r.cpuSubmitMs.p95),frameP95Ms:range(r=>r.frameIntervalMs.p95),
  observedFps:range(r=>r.observedFps),visible:range(r=>r.visible),
  rendererPrivateMiB:range(r=>(r.memory.find(p=>p.type==='Tab')?.privateBytes||0)/1024),
  gpuPrivateMiB:range(r=>(r.memory.find(p=>p.type==='GPU')?.privateBytes||0)/1024)}));
}
