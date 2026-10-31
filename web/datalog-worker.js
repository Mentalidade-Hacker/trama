/* Queries run off the editor thread and can be stopped by the caller. */
importScripts('/vendor/datascript/datascript.js');
self.onmessage=async event=>{
  try {const {runDatalog}=await import('./datalog.js');const result=runDatalog(event.data.data,event.data.query);self.postMessage({rows:result.rows});}
  catch(error){self.postMessage({error:error.message||String(error)});}
};
