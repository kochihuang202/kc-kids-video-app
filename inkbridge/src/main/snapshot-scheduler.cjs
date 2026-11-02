function startSnapshotScheduler({ready,save,onError,setTimer=setInterval,clearTimer=clearInterval}){
  let running=false;
  const tick=async()=>{if(running||!ready())return;running=true;try{await save();}catch(error){onError(error);}finally{running=false;}};
  const timer=setTimer(tick,10*60*1000);timer.unref?.();
  return ()=>clearTimer(timer);
}
module.exports={startSnapshotScheduler};
