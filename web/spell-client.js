let worker=null,sequence=0;
const pending=new Map();
function resetWorker(message){const old=worker;worker=null;old?.terminate();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(message));}pending.clear();}
export function spellingRequest(payload) {
  if(!worker){
    worker=new Worker('/spell-worker.js',{type:'module'});
    worker.onmessage=event=>{const result=event.data,item=pending.get(result.id);if(!item)return;pending.delete(result.id);clearTimeout(item.timer);result.error?item.reject(Error(result.error)):item.resolve(result);};
    worker.onerror=()=>resetWorker('Não foi possível carregar os dicionários locais. Confira os arquivos do aplicativo.');
  }
  return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>resetWorker('O dicionário local demorou a responder. Tente novamente.'),30000);pending.set(id,{resolve,reject,timer});worker.postMessage({...payload,id});});
}
