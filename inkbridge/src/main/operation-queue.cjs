function createOperationQueue(){let tail=Promise.resolve(),active=null;return {get active(){return active;},run(name,action){const result=tail.catch(()=>{}).then(async()=>{active=name;try{return await action();}finally{active=null;}});tail=result;return result;},settle:()=>tail.catch(()=>{})};}
module.exports={createOperationQueue};
