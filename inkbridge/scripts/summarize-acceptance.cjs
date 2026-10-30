// Compact summaries of the raw reports; never replaces per-frame evidence.
const fs=require('node:fs'),path=require('node:path');
const round=n=>Number(n.toFixed(2)),range=values=>[round(Math.min(...values)),round(Math.max(...values))];
for(const label of process.argv.slice(2)){
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/benchmarks/m1-integration',label+'.json')));
  if(report.samples){
    const memory=report.samples.map(s=>s.runtime.memory.find(p=>p.type==='Tab')?.privateBytes/1024);
    console.log(JSON.stringify({label,seconds:report.completedSeconds,samples:report.samples.length,rendererPrivateMiB:range(memory),firstMiB:round(memory[0]),lastMiB:round(memory.at(-1)),
      wasmCapacityMiB:[...new Set(report.samples.map(s=>s.resources.wasmCapacityBytes/1048576))],disposed:report.disposed}));continue;
  }
  const groups=[];
  for(const count of [...new Set(report.results.map(r=>r.count))])for(const size of [...new Set(report.results.map(r=>r.size))]){
    const rows=report.results.filter(r=>r.count===count&&r.size===size);if(!rows.length)continue;
    const memory=rows.flatMap(r=>r.memory.filter(p=>p.type==='Tab').map(p=>p.privateBytes/1024));
    const cpu=rows.flatMap(r=>(r.cpuUsage||[]).filter(p=>p.type==='Tab').map(p=>p.percentCPUUsage));
    groups.push({count,size,cases:rows.length,frameP95:range(rows.map(r=>r.frame.p95)),frameP99:range(rows.map(r=>r.frame.p99)),fps:range(rows.map(r=>r.fps)),drawP95:range(rows.map(r=>r.cpu.p95)),
      drawP99:range(rows.map(r=>r.cpu.p99)),rendererPrivateMiB:range(memory),electronCPUPercent:cpu.length?range(cpu):null,geometryChanged:rows.some(r=>r.geometryChanged)});
  }
  const dense=report.results.filter(r=>r.count===500&&r.size==='dense'&&r.scale===.5).map(r=>({action:r.action,cpu:r.cpu,frame:r.frame,fps:round(r.fps),misses:r.misses,paragraphs:r.paragraphs,cache:r.cacheSize}));
  console.log(JSON.stringify({label,cases:report.results.length,hardware:report.hardware,webgl:report.webgl,groups,dense}));
}
