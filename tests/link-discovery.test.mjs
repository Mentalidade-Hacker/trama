import test from 'node:test';
import assert from 'node:assert/strict';
import {pageSuggestions,blockSuggestions,incomingBlockCounts} from '../web/link-discovery.js';

const block=(id,text,children=[])=>({id,text,children,collapsed:false});
const page=(id,title,blocks=[])=>({id,title,created:'2026-11-01',updated:'2026-11-01',blocks});
const graph=(...pages)=>({version:1,pages});

test('pages rank normalized identity, accent search, prefix and contained matches',()=>{
  const data=graph(page('a','Minha ação'),page('b','Ação futura'),page('c','Ação'),page('d','acao'));
  const result=pageSuggestions(data,' ACAO ');
  assert.deepEqual(result.map(item=>item.value),['acao','Ação','Ação futura','Minha ação']);
  assert.ok(result.every(item=>item.kind==='page'));
  assert.deepEqual(pageSuggestions(data,'ac\u0327a\u0303o').map(item=>item.value),['Ação','acao','Ação futura','Minha ação']);
});

test('accent tolerant search never merges distinct page names or creates while typing',()=>{
  const data=graph(page('a','Ação')),before=JSON.stringify(data);
  const result=pageSuggestions(data,'acao');
  assert.deepEqual(result.map(item=>item.kind),['page','create']);
  assert.equal(result.at(-1).value,'acao');
  assert.equal(pageSuggestions(data,'AÇA\u0303O').some(item=>item.kind==='create'),false);
  assert.equal(JSON.stringify(data),before);
});

test('creation validates title boundaries, respects limit, and does not manufacture whitespace pages',()=>{
  const data=graph(page('a','Projeto antigo'),page('b','Projeto novo'));
  for(const query of ['','  ','\n','bad\nname','[[bad]]','bad\u0000name','x'.repeat(501)]) {
    assert.ok(pageSuggestions(data,query).every(item=>item.kind!=='create'),query);
  }
  assert.equal(pageSuggestions(data,'x'.repeat(500)).at(-1).kind,'create');
  assert.deepEqual(pageSuggestions(data,'Projeto',1).map(item=>item.kind),['create']);
  assert.equal(pageSuggestions(data,'Projeto',2).length,2);
  assert.equal(pageSuggestions(data,'Projeto',0).length,0);
});

test('page matching treats regex punctuation and namespace titles literally',()=>{
  const data=graph(page('a','C++ (A+B)/Plano'),page('b','Outra página'));
  assert.equal(pageSuggestions(data,'(a+b)').find(item=>item.kind==='page').value,'C++ (A+B)/Plano');
  assert.equal(pageSuggestions(data,'++').find(item=>item.kind==='page').value,'C++ (A+B)/Plano');
});

test('block ID references accept a copied reference or partial UID and return stable values',()=>{
  const data=graph(page('p','Notas',[block('uid-one','Uma ideia'),block('uid-two','Outra ideia')]));
  for(const query of ['uid-one','((uid-one))','((uid-one'])assert.equal(blockSuggestions(data,query)[0].value,'uid-one');
  assert.equal(blockSuggestions(data,'one')[0].value,'uid-one');
  assert.equal(blockSuggestions(data,'uid-', {excludeId:'uid-one'})[0].value,'uid-two');
  assert.deepEqual(blockSuggestions(data,'uid-', {limit:0}),[]);
});

test('search combines content, page and ancestor words and exposes useful breadcrumb',()=>{
  const child=block('child','Painéis no telhado'),parent=block('parent','Orçamento anual',[child]);
  const data=graph(page('p','Projeto solar',[parent]),page('other','Diversos',[block('exact','Projeto solar orçamento telhado')]));
  const results=blockSuggestions(data,'projeto solar orçamento telhado');
  assert.equal(results[0].value,'exact');
  const candidate=results.find(item=>item.value==='child');
  assert.equal(candidate.description,'Projeto solar › Orçamento anual');
  assert.match(candidate.label,/Painéis no telhado/);
  assert.equal(blockSuggestions(data,'[[Projeto solar]] telhado').some(item=>item.value==='child'),true);
  assert.equal(blockSuggestions(data,'inexistente telhado').length,0);
});

test('specific own content ranks above context-only matches and accented text is searchable',()=>{
  const data=graph(page('p','Conexão',[block('context','Texto genérico'),block('direct','Conexão'),block('prefix','Conexão importante')]));
  assert.deepEqual(blockSuggestions(data,'conexao').map(item=>item.value),['direct','prefix','context']);
  assert.equal(blockSuggestions(data,'CONEXA\u0303O')[0].value,'direct');
});

test('page-only matches put meaningful blocks ahead of empty placeholders',()=>{
  const data=graph(page('p','Projeto',[block('empty',''),block('useful','Um próximo passo')]));
  assert.deepEqual(blockSuggestions(data,'projeto').map(item=>item.value),['useful','empty']);
  assert.equal(blockSuggestions(data,'empty')[0].value,'empty');
});

test('active reference content is live and cyclic references remain bounded without mutation',()=>{
  const target=block('target','Ideia em português'),reference=block('reference','((target))');
  const data=graph(page('p','Notas',[target,reference,block('cycle-a','((cycle-b))'),block('cycle-b','((cycle-a))')]));
  const before=JSON.stringify(data);
  assert.match(blockSuggestions(data,'portugues').find(item=>item.value==='reference').label,/Ideia em português/);
  assert.equal(JSON.stringify(data),before);
  target.text='Texto atualizado';
  assert.equal(blockSuggestions(data,'portugues').length,0);
  assert.match(blockSuggestions(data,'atualizado').find(item=>item.value==='reference').label,/Texto atualizado/);
  assert.ok(blockSuggestions(data,'cycle').every(item=>item.label.length<500));
});

test('literal reference examples are searchable as literal text but never resolve as live prose',()=>{
  const data=graph(page('p','Notas',[block('target','Palavra exclusiva'),block('code','`((target))`'),block('url','https://example.test/((target))')]));
  assert.deepEqual(blockSuggestions(data,'exclusiva').map(item=>item.value),['target']);
  assert.ok(blockSuggestions(data,'target').some(item=>item.value==='code'));
});

test('incoming counts deduplicate source blocks and include aliases and embeds only when active',()=>{
  const data=graph(page('p','Notas',[
    block('target','Destino'),block('a','((target)) ((target)) {{embed: ((target))}}'),
    block('b','[rótulo](((target)))'),block('c','`((target))` $$((target))$$ https://example.test/((target))'),
    block('d','```\n((target))\n```'),block('e','((missing))'),block('self','((self))'),
  ]));
  const counts=incomingBlockCounts(data);
  assert.equal(counts.get('target'),2);
  assert.equal(counts.get('self'),1);
  assert.equal(counts.has('missing'),false);
  assert.equal(counts.has('a'),false);
});

test('long labels preserve surrogate pairs and plain strings remain unescaped for the UI',()=>{
  const text='a'.repeat(178)+'🙂 fim <script>literal</script>';
  const data=graph(page('p','Página <literal>',[block('long',text)]));
  const result=blockSuggestions(data,'fim')[0];
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result.label));
  assert.equal(result.description,'Página <literal>');
  assert.equal(result.value,'long');
});

test('repeated discovery keeps input graph unchanged and deterministic across calls',()=>{
  const data=graph(page('a','Beta',[block('1','Ideia'),block('2','Ideia')]),page('b','Alfa',[block('3','Ideia')]));
  const before=JSON.stringify(data),first=blockSuggestions(data,'ideia',{limit:2});
  assert.deepEqual(blockSuggestions(data,'ideia',{limit:2}),first);
  pageSuggestions(data,'Nova página');incomingBlockCounts(data);
  assert.equal(JSON.stringify(data),before);
});
