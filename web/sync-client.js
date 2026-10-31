// Revision polling and edit leases are independent of the DOM so that a slow
// response can never replace text written while the request was in flight.
export function createSyncClient(options) {
  const now=options.now||Date.now, idleMs=options.idleMs??1500;
  const client=options.client||globalThis.crypto?.randomUUID?.()||`browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let touchedAt=-Infinity, activityVersion=0, epoch=0, stopped=false, polling=false, timer=null;
  let sending=false, pendingActivity=null, lastBusy=null, lastSent=-Infinity;
  const state=()=>options.getState();
  const busy=()=>{const s=state();return s.ready===false||s.dirty||s.saving||s.conflict||now()-touchedAt<idleMs;};
  async function drainActivity() {
    if(sending)return;
    sending=true;
    try {while(pendingActivity!==null&&!stopped){const value=pendingActivity;pendingActivity=null;
      try {await options.sendActivity?.({client,busy:value});}catch(error){options.onActivityError?.(error);}
    }} finally {sending=false;}
  }
  function activity(force=false) {
    if(stopped)return;
    const value=!!busy();
    if(force||value!==lastBusy||(value&&now()-lastSent>=1900)) {
      lastBusy=value;lastSent=now();pendingActivity=value;void drainActivity();
    }
  }
  function touch(){touchedAt=now();activityVersion++;activity();}
  function guard(snapshot,version,startEpoch) {
    const s=state();return !stopped&&epoch===startEpoch&&!busy()&&activityVersion===version&&s.revision===snapshot.revision&&s.generation===snapshot.generation;
  }
  async function poll() {
    activity();if(stopped||polling||state().ready===false)return false;
    polling=true;const snapshot={...state()},version=activityVersion,startEpoch=epoch;
    try {
      const remote=await options.fetchRevision();
      if(!Number.isSafeInteger(remote.revision)||remote.revision<0)throw Error('Revisão inválida recebida do servidor.');
      if(remote.revision===snapshot.revision||!guard(snapshot,version,startEpoch))return false;
      const incoming=await options.fetchState();
      if(!Number.isSafeInteger(incoming.revision)||incoming.revision<remote.revision)throw Error('A versão recebida ficou desatualizada.');
      if(!guard(snapshot,version,startEpoch))return false;
      // applyRemote must commit synchronously, with its own generation check.
      const applied=options.applyRemote(incoming,snapshot)!==false;
      if(applied)options.onRefresh?.(incoming);
      return applied;
    } catch(error){if(!stopped)options.onError?.(error);return false;}
    finally {polling=false;activity();}
  }
  function start(){if(timer)return;stopped=false;activity(true);timer=setInterval(()=>void poll(),options.intervalMs??2000);void poll();}
  function stop(){stopped=true;epoch++;clearInterval(timer);timer=null;pendingActivity=null;}
  return {client,touch,activity,poll,start,stop,busy};
}
