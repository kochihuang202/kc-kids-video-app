function snapshotOrder(a,b){
 const time=r=>{const t=Date.parse(r.manifest?.createdAt);return Number.isFinite(t)?t:-Infinity;};
 const x=time(a),y=time(b);return x===y?String(a.snapshotId).localeCompare(String(b.snapshotId)):x>y?-1:1;
}
module.exports={snapshotOrder};
