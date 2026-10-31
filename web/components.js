/** Local, block-backed components. No eval, runtime network dependency or hidden data store. */
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const children = block => block.children || [];

export function componentKind(text) {
  const m=String(text).trim().match(/^\{\{(?:\[\[)?(table|kanban|calc|slider|word-count)(?:\]\])?(?::([\s\S]*))?\}\}$/i);
  return m ? {kind:m[1].toLowerCase(),argument:(m[2]||'').trim()} : null;
}

/** Each row starts at a child; the first-child chain holds subsequent columns. */
export function tableRows(block) {
  return children(block).map(row=>{const cells=[],seen=new Set();let cell=row;
    while(cell&&!seen.has(cell.id)&&cells.length<100){cells.push(cell);seen.add(cell.id);cell=children(cell)[0];}
    return cells;
  });
}
export function tableWidth(block) {return Math.max(1,...tableRows(block).map(row=>row.length));}
export function tableCell(block,rowIndex,columnIndex,newBlock) {
  if(!Number.isInteger(rowIndex)||!Number.isInteger(columnIndex)||rowIndex<0||columnIndex<0||rowIndex>=1000||columnIndex>=100)throw Error('Tabela limitada a 1.000 linhas e 100 colunas.');
  while(block.children.length<=rowIndex)block.children.push(newBlock());
  let cell=block.children[rowIndex];
  for(let column=0;column<columnIndex;column++){if(!cell.children.length)cell.children.push(newBlock());cell=cell.children[0];}
  return cell;
}
export function addTableRow(block,newBlock,index=block.children.length) {
  const width=tableWidth(block);if(block.children.length>=1000)throw Error('Máximo de 1.000 linhas nesta visualização.');
  const row=newBlock();let cell=row;for(let i=1;i<width;i++){const next=newBlock();cell.children.push(next);cell=next;}
  block.children.splice(Math.max(0,Math.min(index,block.children.length)),0,row);return row;
}
export function addTableColumn(block,newBlock) {
  const width=tableWidth(block);if(width>=100)throw Error('Máximo de 100 colunas nesta visualização.');
  if(!block.children.length)block.children.push(newBlock());
  for(let row=0;row<block.children.length;row++)tableCell(block,row,width,newBlock);
}
export function deleteTableColumn(block,column,newBlock) {
  if(!Number.isInteger(column)||column<0)throw Error('Coluna inválida.');
  for(let row=0;row<block.children.length;row++){
    const cells=tableRows(block)[row],target=cells[column];if(!target)continue;
    const next=target.children[0],branches=target.children.slice(1);
    if(column===0){
      if(next){next.children.push(...branches);block.children[row]=next;}
      else {const blank=newBlock();blank.children.push(...branches);block.children[row]=blank;}
    }else {const parent=cells[column-1];parent.children.splice(0,1,...(next?[next]:[]),...branches);}
  }
}
function sortable(value) {
  const raw=value.trim(),clean=raw.replace(/[$€£R%\s]/g,'');
  if(/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(clean))return {type:0,value:Number(clean.replace(/,/g,''))};
  if(/^-?\d+,\d{1,2}$/.test(clean))return {type:0,value:Number(clean.replace(',','.'))};
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const parsed=Date.parse(raw);if(Number.isFinite(parsed))return {type:1,value:parsed};}
  return {type:2,value:raw};
}
export function sortTable(block,column,direction=1) {
  if(!Number.isInteger(column)||column<0||![-1,1].includes(direction))throw Error('Ordenação inválida.');
  if(block.children.length<3)return;
  const values=new Map(tableRows(block).map(cells=>[cells[0].id,sortable(cells[column]?.text||'')]));
  const header=block.children[0],rows=block.children.slice(1);
  rows.sort((a,b)=>{const left=values.get(a.id),right=values.get(b.id);return direction*(left.type!==right.type?left.type-right.type:left.type===2?left.value.localeCompare(right.value,undefined,{numeric:true,sensitivity:'base'}):left.value-right.value);});
  block.children.splice(0,block.children.length,header,...rows);
}
export function pasteTable(block,startRow,startColumn,text,newBlock) {
  const rows=String(text).replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(row=>row.split('\t'));
  if(startRow+rows.length>1000||startColumn+Math.max(...rows.map(r=>r.length))>100)throw Error('A colagem excede o limite de 1.000 linhas ou 100 colunas.');
  rows.forEach((row,r)=>row.forEach((text,c)=>tableCell(block,startRow+r,startColumn+c,newBlock).text=text));
}
export function moveKanbanCard(block,cardId,columnId) {
  const source=block.children.find(column=>column.children.some(card=>card.id===cardId));
  const destination=block.children.find(column=>column.id===columnId);
  if(!source||!destination)throw Error('Cartão ou coluna não encontrado.');
  if(source===destination)return false;
  const index=source.children.findIndex(card=>card.id===cardId),[card]=source.children.splice(index,1);destination.children.push(card);return true;
}

/** Finite arithmetic only; exponentiation is right-associative. */
export function calculate(expression) {
  if(typeof expression!=='string'||expression.length>2000)throw Error('Expressão inválida ou grande demais.');
  const tokens=[];let at=0;
  while(at<expression.length){if(/\s/.test(expression[at])){at++;continue;}
    const m=expression.slice(at).match(/^(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[()+\-*/%^])/);
    if(!m)throw Error('Use apenas números, parênteses e os operadores + − * / % ^.');tokens.push(m[0]);at+=m[0].length;
  }
  let index=0,depth=0;
  const checked=value=>{if(!Number.isFinite(value))throw Error('Resultado indefinido ou fora do limite numérico.');return value;};
  function atom(){if(++depth>80)throw Error('Expressão profunda demais.');let value;
    if(tokens[index]==='('){index++;value=sum();if(tokens[index++]!==')')throw Error('Feche os parênteses.');}
    else{const token=tokens[index++];if(token===undefined||!/^(?:\d|\.)/.test(token))throw Error('Número esperado.');value=Number(token);}
    depth--;return checked(value);
  }
  function unary(){if(tokens[index]==='+'){index++;return unary();}if(tokens[index]==='-'){index++;return -unary();}return power();}
  function power(){const left=atom();if(tokens[index]==='^'){index++;return checked(left**unary());}return left;}
  function product(){let value=unary();while(['*','/','%'].includes(tokens[index])){const op=tokens[index++],right=unary();value=checked(op==='*'?value*right:op==='/'?value/right:value%right);}return value;}
  function sum(){let value=product();while(['+','-'].includes(tokens[index])){const op=tokens[index++],right=product();value=checked(op==='+'?value+right:value-right);}return value;}
  const result=sum();if(index!==tokens.length)throw Error('Expressão incompleta.');return result;
}
export function sliderValues(argument) {
  const values=argument?argument.split(/[ ,]+/).map(Number):[0,100,50];
  if(values.length<2||values.length>4||values.some(n=>!Number.isFinite(n)))throw Error('Use {{slider: mínimo máximo valor passo}}.');
  const [min,max,value=min,step=1]=values;if(max<=min||step<=0)throw Error('O máximo precisa ser maior que o mínimo e o passo precisa ser positivo.');
  return {min,max,value:Math.max(min,Math.min(value,max)),step};
}
export function countWords(block) {
  const all=[];const visit=b=>{all.push(b.text);b.children.forEach(visit);};block.children.forEach(visit);
  return all.join(' ').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length||0;
}

/** Render parsed TeX using the locally packaged KaTeX runtime. */
export function renderMath(latex,displayMode=false) {
  if(!globalThis.katex?.renderToString)return `<code class="trama-math-fallback">${escapeHTML(latex)}</code>`;
  try {return globalThis.katex.renderToString(latex,{displayMode,throwOnError:false,trust:false,strict:'warn',maxExpand:1000,maxSize:20,output:'htmlAndMathml'});}
  catch(error){return `<span class="component-error">${escapeHTML(error.message)}</span>`;}
}
function branchDetails(block,ctx){
  const branches=tableRows(block).flatMap(row=>row.flatMap(cell=>cell.children.slice(1)));
  if(!branches.length)return '';
  return `<details class="component-branches"><summary>${branches.length} ramificações adicionais (preservadas)</summary>${branches.map(b=>`<button type="button" data-component-edit="${ctx.escape(b.id)}">${ctx.escape(b.text||'(bloco vazio)')} ↗</button>`).join('')}</details>`;
}
function sourceOutline(block,ctx) {
  const list=(items,depth=0)=>depth>100?'':`<ul>${items.map(item=>`<li><button type="button" data-component-edit="${ctx.escape(item.id)}">${ctx.escape(item.text||'(bloco vazio)')} ↗</button>${item.children.length?list(item.children,depth+1):''}</li>`).join('')}</ul>`;
  return block.children.length?`<details class="component-originals"><summary>Blocos originais</summary>${list(block.children)}</details>`:'';
}
export function renderComponent(block,context={}) {
  const ctx={escape:escapeHTML,rich:escapeHTML,...context},parsed=componentKind(block.text);
  const id=ctx.escape(block.id),frame=(kind,body)=>`<section class="trama-component component-${kind}" data-component-owner="${id}">${body}${['table','kanban'].includes(kind)?sourceOutline(block,ctx):''}<button type="button" class="component-source" data-component-edit="${id}">Editar comando</button></section>`;
  const latex=block.text.trim().match(/^\$\$([\s\S]*?)\$\$$/);if(latex)return frame('math',renderMath(latex[1],true));
  if(!parsed)return null;
  try {
    if(parsed.kind==='table'){
      const rows=tableRows(block),width=tableWidth(block);
      return frame('table',`<div class="component-caption">TABELA <span>Primeira linha = cabeçalho · cole células de uma planilha</span></div><div class="component-table-scroll"><table><thead><tr><th></th>${Array.from({length:width},(_,c)=>`<th><span>${c+1}</span><button type="button" data-component-sort="${c}" data-direction="1" title="Ordenar crescente">↑</button><button type="button" data-component-sort="${c}" data-direction="-1" title="Ordenar decrescente">↓</button><button type="button" data-component-delete-column="${c}" title="Excluir coluna">×</button></th>`).join('')}</tr></thead><tbody>${rows.map((row,r)=>`<tr><th><span>${r+1}</span><button type="button" data-component-delete-row="${r}" title="Excluir linha">×</button></th>${Array.from({length:width},(_,c)=>`<td><textarea rows="1" maxlength="1000000" data-component-cell="${ctx.escape(row[c]?.id||'')}" data-row="${r}" data-column="${c}" aria-label="Linha ${r+1}, coluna ${c+1}" placeholder="${r===0?'Cabeçalho':'Célula'}">${ctx.escape(row[c]?.text||'')}</textarea>${row[c]?.text?`<div class="component-cell-preview">${ctx.rich(row[c].text,new Set([row[c].id]),row[c].id)}</div>`:''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="component-toolbar"><button type="button" data-component-add-row>+ Linha</button><button type="button" data-component-add-column>+ Coluna</button><button type="button" data-component-copy-table>Copiar TSV</button></div>${branchDetails(block,ctx)}`);
    }
    if(parsed.kind==='kanban')return frame('kanban',`<div class="component-caption">KANBAN <span>Colunas e cartões são blocos do seu grafo</span></div><div class="component-kanban-columns">${block.children.map(column=>`<div class="component-kanban-column" data-component-column="${ctx.escape(column.id)}"><input data-component-title="${ctx.escape(column.id)}" value="${ctx.escape(column.text)}" aria-label="Nome da coluna"><div class="component-kanban-cards">${column.children.map(card=>`<article class="component-kanban-card"><div>${ctx.rich(card.text,new Set([card.id]),card.id)}</div>${card.children.length?`<small>${card.children.length} blocos filhos</small>`:''}<div class="component-card-tools"><button type="button" data-component-edit="${ctx.escape(card.id)}">Editar</button><select data-component-move-card="${ctx.escape(card.id)}" aria-label="Mover cartão">${block.children.map(target=>`<option value="${ctx.escape(target.id)}" ${target.id===column.id?'selected':''}>${ctx.escape(target.text||'Coluna sem título')}</option>`).join('')}</select></div></article>`).join('')}</div><button type="button" data-component-add-card="${ctx.escape(column.id)}">+ Cartão</button></div>`).join('')}</div><div class="component-toolbar"><button type="button" data-component-add-column-kanban>+ Coluna</button></div>`);
    if(parsed.kind==='calc')return frame('calc',`<span class="component-caption">CALCULADORA</span><code>${ctx.escape(parsed.argument)}</code><strong>= ${ctx.escape(calculate(parsed.argument))}</strong>`);
    if(parsed.kind==='slider'){const values=sliderValues(parsed.argument);return frame('slider',`<span class="component-caption">VALOR</span><input data-component-slider type="range" min="${values.min}" max="${values.max}" step="${values.step}" value="${values.value}" aria-label="Valor do controle deslizante"><output>${values.value}</output>`);}
    if(parsed.kind==='word-count'){const ref=parsed.argument.match(/^\(\(([A-Za-z0-9_-]+)\)\)$/);let target=block;if(ref){const found=ctx.findBlock?.(ref[1]);target=found?.block||found;if(!target)throw Error('Bloco referenciado não encontrado.');}const count=ref?((target.text+' '+target.children.map(c=>c.text).join(' ')).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length||0):countWords(target);return frame('count',`<strong>${count}</strong><span>palavras ${ref?'no bloco referenciado e filhos diretos':'nos blocos filhos'}</span>`);}
  }catch(error){return frame(parsed.kind,`<div class="component-error">${ctx.escape(error.message)}</div>`);}
  return null;
}

const bindings=new WeakMap();
const ownedButtons='[data-component-edit],[data-component-copy-table],[data-component-add-row],[data-component-add-column],[data-component-sort],[data-component-delete-column],[data-component-delete-row],[data-component-add-column-kanban],[data-component-add-card]';
/** Bind once to a stable container; repeated calls update the live context. */
export function bindComponents(container,ctx) {
  if(bindings.has(container)){bindings.get(container).ctx=ctx;return;}
  const state={ctx};bindings.set(container,state);
  const get=target=>{const wrapper=target.closest('[data-component-owner]');if(!wrapper)return null;const context=state.ctx,entry=context.findBlock(wrapper.dataset.componentOwner);return entry?{wrapper,context,entry,block:entry.block||entry}:null;};
  const run=(target,operation)=>{const env=get(target);if(!env)return;try{env.context.checkpoint();operation(env);env.context.changed(env.entry.page?.id);env.context.render();}catch(error){env.context.toast(error.message);}};
  container.addEventListener('click',event=>{
    const target=event.target.closest?.('button');if(!target||!target.closest('[data-component-owner]')||!target.matches(ownedButtons))return;
    if(target.matches('[data-component-edit]')){event.stopPropagation();event.preventDefault();state.ctx.edit(target.dataset.componentEdit);return;}
    event.stopPropagation();event.preventDefault();
    if(target.hasAttribute('data-component-copy-table')){const env=get(target);const tsv=tableRows(env.block).map(row=>row.map(c=>c.text.replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');navigator.clipboard.writeText(tsv).then(()=>env.context.toast('Tabela copiada.')).catch(()=>env.context.toast('Não foi possível copiar. Use a exportação Markdown.'));return;}
    run(target,({block,context})=>{
      if(target.hasAttribute('data-component-add-row'))addTableRow(block,context.newBlock);
      if(target.hasAttribute('data-component-add-column'))addTableColumn(block,context.newBlock);
      if(target.hasAttribute('data-component-sort'))sortTable(block,Number(target.dataset.componentSort),Number(target.dataset.direction));
      if(target.hasAttribute('data-component-delete-column'))deleteTableColumn(block,Number(target.dataset.componentDeleteColumn),context.newBlock);
      if(target.hasAttribute('data-component-delete-row'))block.children.splice(Number(target.dataset.componentDeleteRow),1);
      if(target.hasAttribute('data-component-add-column-kanban'))block.children.push(context.newBlock('Nova coluna'));
      if(target.hasAttribute('data-component-add-card')){const column=block.children.find(c=>c.id===target.dataset.componentAddCard);column.children.push(context.newBlock('Novo cartão'));}
    });
  },true);
  container.addEventListener('focusin',event=>{if(event.target.matches?.('[data-component-cell],[data-component-title],[data-component-slider]'))state.ctx.checkpoint();},true);
  container.addEventListener('input',event=>{
    const target=event.target,env=get(target);if(!env)return;
    try{
      if(target.matches('[data-component-cell]')){const cell=tableCell(env.block,Number(target.dataset.row),Number(target.dataset.column),env.context.newBlock);cell.text=target.value;target.dataset.componentCell=cell.id;env.context.changed(env.entry.page?.id);}
      if(target.matches('[data-component-title]')){const column=env.block.children.find(c=>c.id===target.dataset.componentTitle);if(column){column.text=target.value;env.context.changed(env.entry.page?.id);}}
      if(target.matches('[data-component-slider]')){target.nextElementSibling.textContent=target.value;}
    }catch(error){env.context.toast(error.message);}
  },true);
  container.addEventListener('change',event=>{
    const target=event.target;if(!target.closest?.('[data-component-owner]'))return;
    if(target.matches('[data-component-move-card]'))run(target,({block})=>moveKanbanCard(block,target.dataset.componentMoveCard,target.value));
    if(target.matches('[data-component-slider]'))run(target,({block})=>{block.text=`{{slider: ${target.min} ${target.max} ${target.value} ${target.step}}}`;});
    if(target.matches('[data-component-cell]')){
      const env=get(target);if(!env)return;
      let preview=target.nextElementSibling;
      if(!preview?.classList.contains('component-cell-preview')){preview=target.ownerDocument.createElement('div');preview.className='component-cell-preview';target.insertAdjacentElement('afterend',preview);}
      const cellId=target.dataset.componentCell;
      preview.innerHTML=(env.context.rich||escapeHTML)(target.value,new Set([cellId]),cellId);
      preview.hidden=!target.value;
    }
  },true);
  container.addEventListener('keydown',event=>{
    if(!event.target.matches?.('[data-component-cell],[data-component-title]'))return;
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    event.stopPropagation();
    if(event.target.matches('[data-component-cell]')&&event.key==='Tab'){
      const env=get(event.target),cells=[...env.wrapper.querySelectorAll('[data-component-cell]')],index=cells.indexOf(event.target),next=cells[index+(event.shiftKey?-1:1)];if(next){event.preventDefault();next.focus();}
    }
  },true);
  container.addEventListener('paste',event=>{
    const target=event.target;if(!target.matches?.('[data-component-cell]'))return;
    const text=event.clipboardData?.getData('text/plain');if(!text?.includes('\t'))return;
    event.preventDefault();event.stopPropagation();run(target,({block,context})=>pasteTable(block,Number(target.dataset.row),Number(target.dataset.column),text,context.newBlock));
  },true);
  // Avoid triggering the surrounding outliner's click-to-edit on controls.
  container.addEventListener('click',event=>{if(event.target.matches?.('[data-component-cell],[data-component-title],[data-component-slider],[data-component-move-card]'))event.stopPropagation();},true);
}
