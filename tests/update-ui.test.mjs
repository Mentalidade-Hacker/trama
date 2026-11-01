import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUpdateReleaseURL,normalizeUpdateStatus,updatePresentation,updateStatusHTML,closeStatusHTML,setupUpdates} from '../web/update-ui.js';

const status=(changes={})=>({currentVersion:'0.10',availableVersion:'0.10.1',automatic:true,state:'current',message:'',downloadedBytes:0,totalBytes:0,releaseUrl:'https://github.com/Mentalidade-Hacker/trama/releases/tag/v0.10.1',checkedAt:'2026-11-01T12:00:00Z',canClose:false,...changes});
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('release links only target stable versions from the official repository',()=>{
  for(const url of ['https://github.com/Mentalidade-Hacker/trama/releases/tag/v0.10','https://github.com/Mentalidade-Hacker/trama/releases/tag/v0.10.1','https://github.com/Mentalidade-Hacker/trama/releases/latest'])assert.equal(safeUpdateReleaseURL(url),url);
  for(const url of ['javascript:alert(1)','https://other.example/Mentalidade-Hacker/trama/releases/latest','https://github.com/other/trama/releases/latest','https://github.com/Mentalidade-Hacker/trama/releases/tag/v0.10-beta','http://github.com/Mentalidade-Hacker/trama/releases/latest','https://user:secret@github.com/Mentalidade-Hacker/trama/releases/latest','https://github.com:444/Mentalidade-Hacker/trama/releases/latest','https://github.com/Mentalidade-Hacker/trama/releases/latest?redirect=evil','/api/app/close'])assert.equal(safeUpdateReleaseURL(url),null,url);
});

test('status normalization rejects malformed state and sanitizes optional display values',()=>{
  assert.throws(()=>normalizeUpdateStatus(status({state:'fake'})));assert.throws(()=>normalizeUpdateStatus(status({automatic:'true'})));
  const value=normalizeUpdateStatus(status({currentVersion:'<script>',availableVersion:null,downloadedBytes:-1,totalBytes:Infinity,checkedAt:'broken',releaseUrl:'javascript:alert(1)',canClose:'true'}));
  assert.equal(value.currentVersion,'—');assert.equal(value.availableVersion,'—');assert.equal(value.downloadedBytes,0);assert.equal(value.totalBytes,0);assert.equal(value.checkedAt,null);assert.equal(value.releaseUrl,null);assert.equal(value.canClose,false);
});

test('download progress is bounded and missing total remains indeterminate',()=>{
  const known=updateStatusHTML(normalizeUpdateStatus(status({state:'downloading',downloadedBytes:200,totalBytes:100})));
  assert.match(known,/max="100" value="100"/);
  const unknown=updateStatusHTML(normalizeUpdateStatus(status({state:'downloading',downloadedBytes:1200,totalBytes:0})));
  assert.match(unknown,/<progress aria-label="Download da atualização"><\/progress>/);assert.match(unknown,/total ainda não informado/);
  assert.equal(updatePresentation(null).state,'checking');assert.equal(updatePresentation(normalizeUpdateStatus(status({state:'ready'})),'Offline').state,'error');
});

test('ready status distinguishes server shutdown from closing the browser tab',()=>{
  const ready=updateStatusHTML(normalizeUpdateStatus(status({state:'ready',message:'<img src=x onerror=alert(1)>'})));
  assert.ok(!ready.includes('<img'));assert.match(ready,/Ctrl\+C/);assert.match(ready,/Fechar só a aba do navegador não encerra/);
  const desktop=updateStatusHTML(normalizeUpdateStatus(status({state:'ready',canClose:true})));
  assert.match(desktop,/Salvar e encerrar Trama/);assert.ok(!desktop.includes('Ctrl+C'));
});

test('an installed version is not presented as up to date before its first check',()=>{
  const item=updatePresentation(normalizeUpdateStatus(status({state:'current',checkedAt:null})));
  assert.equal(item.label,'Atualizações do Trama');assert.match(item.message,/segundo plano/);assert.ok(!item.message.includes('mais recente'));
});

function browser(t,handler,context={},search='') {
  const old=new Map(),listeners=new Map(),windowListeners=new Map(),requests=[],created=[];
  const override=(key,value)=>{old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
  const document={hidden:false,activeElement:null,body:{append(){}},addEventListener:(name,fn)=>listeners.set(name,fn)};
  const matches=(node,selector)=>selector.startsWith('#')?node.attributes.id===selector.slice(1):/^\[([^\]]+)\]$/.test(selector)&&Object.hasOwn(node.attributes,selector.slice(1,-1));
  class Element {
    constructor(attributes={}){this.attributes=attributes;this.children=[];this.listeners=new Map();this.open=false;this.disabled=false;this.checked=false;this.hidden=false;this.dataset={};this.textContent='';this.classList={toggle(){}};}
    set innerHTML(value){this.html=value;this.children=[];for(const match of value.matchAll(/<(?:button|input|div|span|a|h2|p|dd|section)\b([^>]*)>/g)){
      const attrs={};for(const attr of match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[attr[1]]=attr[2]??'';this.children.push(new Element(attrs));
    }}
    get innerHTML(){return this.html||'';}
    descendants(){return this.children.flatMap(child=>[child,...child.descendants()]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    querySelectorAll(selector){return this.descendants().filter(node=>matches(node,selector));}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(name,fn){this.listeners.set(name,fn);}
    showModal(){this.open=true;}
    close(){this.open=false;this.listeners.get('close')?.();}
    focus(){document.activeElement=this;}
  }
  const indicator=new Element({'data-update-indicator':'','data-update-open':''});indicator.children=[new Element({'data-update-label':''})];
  document.createElement=()=>{const element=new Element();created.push(element);return element;};document.querySelectorAll=selector=>matches(indicator,selector)?[indicator]:[];
  override('document',document);override('window',{location:{search},addEventListener:(name,fn)=>windowListeners.set(name,fn)});
  override('fetch',(path,options={})=>{
    const request={path,body:options.body?JSON.parse(options.body):undefined};requests.push(request);
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(new DOMException('Aborted','AbortError'));options.signal?.addEventListener('abort',abort,{once:true});
      Promise.resolve().then(()=>handler(request,requests)).then(value=>{options.signal?.removeEventListener('abort',abort);resolve({ok:value?.ok!==false,json:async()=>value?.json??value});},reject);
    });
  });
  const ctx={finishEditing(){},flushDrafts:async()=>true,flush:async()=>true,localState:()=>({ready:true,dirty:false}),revision:5,updateClientId:'browser-client',...context};
  const ui=setupUpdates(ctx),get=selector=>ui.dialog.querySelector(selector);
  t.after(()=>{ui.stop();for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {ui,get,ctx,indicator,document,listeners,windowListeners,requests,created};
}

test('initial checks stay discreet and development controls cannot submit update requests',async t=>{
  const b=browser(t,()=>status({state:'development',automatic:false}));await settle();
  assert.equal(b.ui.dialog.open,false);assert.equal(b.requests.length,1);assert.equal(b.requests[0].path,'/api/update/status');
  b.ui.open();await settle();assert.equal(b.get('[data-update-check]').disabled,true);assert.equal(b.get('[data-update-automatic]').disabled,true);
  b.get('[data-update-check]').onclick();b.get('[data-update-automatic]').onchange({target:{checked:true}});await settle();
  assert.ok(b.requests.every(item=>item.body===undefined));assert.match(b.get('[data-update-status]').innerHTML,/desenvolvimento/);
});

test('settings serialize mutations, preserve requested toggle during a pending save and reject stale GET',async t=>{
  const late=deferred(),saving=deferred();let reads=0;
  const b=browser(t,request=>request.path.endsWith('/settings')?saving.promise:++reads===1?status():late.promise);await settle();
  b.ui.open();await settle();
  const toggle=b.get('[data-update-automatic]');toggle.checked=false;toggle.onchange({target:toggle});await settle();
  assert.equal(toggle.disabled,true);assert.equal(toggle.checked,false);
  toggle.onchange({target:{checked:true}});await settle();assert.equal(b.requests.filter(item=>item.path.endsWith('/settings')).length,1);
  saving.resolve(status({state:'disabled',automatic:false}));await settle();late.resolve(status({automatic:true}));await settle();
  assert.equal(toggle.checked,false);assert.equal(toggle.disabled,false);assert.match(b.get('[data-update-feedback]').textContent,/pacote já pronto/);
  assert.deepEqual(b.requests.find(item=>item.path.endsWith('/settings')).body,{automatic:false});
});

test('manual verification can prepare a package while automatic downloads are disabled',async t=>{
  const b=browser(t,request=>request.path.endsWith('/check')?status({state:'downloading',automatic:false,downloadedBytes:5,totalBytes:10}):status({state:'disabled',automatic:false}));await settle();b.ui.open();await settle();
  b.get('[data-update-check]').onclick();await settle();
  assert.deepEqual(b.requests.find(item=>item.path.endsWith('/check')).body,{});assert.equal(b.get('[data-update-automatic]').checked,false);assert.match(b.get('[data-update-status]').innerHTML,/value="5"/);assert.equal(b.ui.dialog.open,true);
});

test('initial connection failure offers a local retry instead of disabling all controls',async t=>{
  let failure=true;const b=browser(t,()=>{if(failure)throw Error('Servidor indisponível');return status();});await settle();b.ui.open();await settle();
  assert.equal(b.get('[data-update-check]').disabled,false);failure=false;b.get('[data-update-check]').onclick();await settle();
  assert.match(b.get('[data-update-status]').innerHTML,/Trama atualizado/);assert.ok(b.requests.every(item=>item.path==='/api/update/status'));
});

test('failed setting persistence restores confirmed checkbox and never announces success',async t=>{
  const b=browser(t,request=>request.path.endsWith('/settings')?{ok:false,json:{error:'Sem permissão para salvar.'}}:status());await settle();b.ui.open();await settle();
  const toggle=b.get('[data-update-automatic]');toggle.checked=false;toggle.onchange({target:toggle});await settle();
  assert.equal(toggle.checked,true);assert.match(b.get('[data-update-feedback]').textContent,/Sem permissão/);assert.ok(!b.get('[data-update-feedback]').textContent.includes('Preferência salva'));
});

test('unsaved drafts or notes prevent shutdown requests and keep the panel open',async t=>{
  let draftsOK=false,notesOK=true;
  const b=browser(t,()=>status({state:'ready',canClose:true}),{flushDrafts:async()=>draftsOK,flush:async()=>notesOK});await settle();b.ui.open();await settle();
  b.get('[data-update-exit]').onclick();await settle();assert.match(b.get('[data-update-feedback]').textContent,/rascunhos/);
  draftsOK=true;notesOK=false;b.get('[data-update-exit]').onclick();await settle();assert.match(b.get('[data-update-feedback]').textContent,/notas ainda não salvas/);
  assert.ok(!b.requests.some(item=>item.path==='/api/app/close'));assert.equal(b.ui.dialog.open,true);assert.equal(b.get('[data-update-close]').disabled,false);
});

test('server refusal to close cannot be mistaken for a stopped application',async t=>{
  const b=browser(t,request=>request.path==='/api/app/close'?{ok:false,json:{error:'Outra janela está editando.'}}:status({state:'ready',canClose:true}));await settle();b.ui.open();await settle();
  b.get('[data-update-exit]').onclick();await settle();assert.match(b.get('[data-update-feedback]').textContent,/Outra janela/);
  assert.ok(!b.ui.dialog.innerHTML.includes('<h2 id="update-title" tabindex="-1">Trama encerrado'));
  assert.equal(b.get('[data-update-exit]').disabled,false);assert.deepEqual(b.requests.find(item=>item.path==='/api/app/close').body,{revision:5,client:'browser-client'});
});

test('confirmed safe shutdown keeps a modal receipt, stops polling and never reloads the page',async t=>{
  const closed=deferred(),order=[];
  const b=browser(t,request=>request.path==='/api/app/close'?(order.push('close'),closed.promise):status({state:'ready',canClose:true}),{finishEditing(){order.push('finish');},flushDrafts:async()=>{order.push('drafts');return true;},flush:async()=>{order.push('notes');return true;}});
  await settle();b.ui.open();await settle();b.get('[data-update-exit]').onclick();await settle();
  assert.deepEqual(order,['finish','drafts','notes','close']);assert.equal(b.get('[data-update-close]').disabled,true);
  let prevented=false;b.ui.dialog.listeners.get('cancel')({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  closed.resolve({ok:true});await settle();assert.match(b.ui.dialog.innerHTML,/Trama encerrado/);assert.match(b.ui.dialog.innerHTML,/Recarregar esta página não inicia/);assert.equal(b.ui.dialog.open,true);
  const count=b.requests.length;await b.ui.refresh();b.ui.start();await settle();assert.equal(b.requests.length,count);
  assert.equal(b.get('[data-update-close]'),null);assert.equal(b.document.activeElement,b.get('#update-title'));
});

test('without managed launcher the panel only saves and explains the terminal restart',async t=>{
  let saved=0;const b=browser(t,()=>status({state:'ready',canClose:false}),{flush:async()=>{saved++;return true;}});await settle();b.ui.open();await settle();
  assert.equal(b.get('[data-update-exit]').hidden,true);assert.equal(b.get('[data-update-save]').hidden,false);b.get('[data-update-save]').onclick();await settle();
  assert.equal(saved,1);assert.match(b.get('[data-update-feedback]').textContent,/Ctrl\+C/);assert.ok(!b.requests.some(item=>item.path==='/api/app/close'));
});

test('normal exit is available without an update and saves before closing',async t=>{
  const order=[];
  const b=browser(t,request=>request.path==='/api/app/close'?(order.push('close'),{ok:true}):status({state:'current',canClose:true}),{flushDrafts:async()=>{order.push('drafts');return true;},flush:async()=>{order.push('notes');return true;}});
  await settle();b.ui.openExit();await settle();
  assert.equal(b.ui.dialog.dataset.exitOnly,'true');assert.equal(b.get('[data-update-exit]').hidden,false);
  assert.match(b.get('[data-update-status]').innerHTML,/outras janelas/);
  b.get('[data-update-exit]').onclick();await settle();
  assert.deepEqual(order,['drafts','notes','close']);assert.match(b.ui.dialog.innerHTML,/quando quiser continuar/);
  assert.ok(!b.ui.dialog.innerHTML.includes('aplicar a atualização'));
});

test('tray close URL opens confirmation only and never automatically shuts down',async t=>{
  const b=browser(t,()=>status({state:'disabled',canClose:true}),{},'?trama-action=close');await settle();
  assert.equal(b.ui.dialog.open,true);assert.equal(b.ui.dialog.dataset.exitOnly,'true');
  assert.ok(!b.requests.some(item=>item.path==='/api/app/close'));
  b.get('[data-update-close]').onclick();assert.equal(b.ui.dialog.open,false);
});

test('ordinary exit refuses an unsaved draft and retains cancellation',async t=>{
  const b=browser(t,()=>status({state:'error',canClose:true}),{flushDrafts:async()=>false});await settle();
  b.ui.openExit();await settle();b.get('[data-update-exit]').onclick();await settle();
  assert.match(b.get('[data-update-feedback]').textContent,/rascunhos/);assert.equal(b.get('[data-update-close]').disabled,false);
  assert.ok(!b.requests.some(item=>item.path==='/api/app/close'));
});

test('normal exit notice escapes errors and only promises a pending update when ready',()=>{
  const current=closeStatusHTML(status({canClose:true}),'<script>bad</script>');
  assert.ok(!current.includes('<script>'));assert.ok(!current.includes('atualização já baixada'));
  assert.match(closeStatusHTML(status({state:'ready',canClose:true})),/atualização já baixada/);
});
