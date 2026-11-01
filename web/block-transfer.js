import {findBlock,newBlock} from './core.js';

/** Ctrl/Cmd-drag reuses a block by reference; ordinary drag moves the original. */
export function transferBlock(data,sourceId,targetId,{reference=false,asChild=false}={}) {
  const source=findBlock(data,sourceId),target=findBlock(data,targetId);
  if(!source||!target)throw Error('O bloco não está mais disponível.');
  if(sourceId===targetId)throw Error('Escolha outro bloco como destino.');
  const contains=block=>block.id===targetId||block.children.some(contains);
  if(!reference&&contains(source.block))throw Error('Um bloco não pode ser movido para dentro de si mesmo.');
  const height=block=>{let max=0;for(const child of block.children)max=Math.max(max,1+height(child));return max;};
  if(target.depth+(asChild?1:0)+(reference?0:height(source.block))>=100)throw Error('O limite é de 100 níveis de blocos.');
  const inserted=reference?newBlock(`((${sourceId}))`):source.block;
  if(!reference)source.siblings.splice(source.index,1);
  const destination=findBlock(data,targetId);
  if(asChild){destination.block.children.push(inserted);destination.block.collapsed=false;}
  else destination.siblings.splice(destination.index+1,0,inserted);
  if(!source.page.blocks.length)source.page.blocks.push(newBlock());
  return {blockId:inserted.id,pageIds:reference?[destination.page.id]:[...new Set([source.page.id,destination.page.id])]};
}
