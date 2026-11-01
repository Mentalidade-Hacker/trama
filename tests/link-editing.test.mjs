import test from 'node:test';
import assert from 'node:assert/strict';
import {pairTypedLink,stepOverLinkClose,linkCompletionEnd} from '../web/link-editing.js';
function editor(value,start=value.length,end=start){return {value,selectionStart:start,selectionEnd:end,
  setRangeText(text,a,b){this.value=this.value.slice(0,a)+text+this.value.slice(b);this.selectionStart=this.selectionEnd=a;},
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};}
const typed=data=>({inputType:'insertText',data});
test('second typed bracket creates a closed page link with cursor inside',()=>{
  const el=editor('Texto [[ restante',8);assert.equal(pairTypedLink(el,typed('[')),true);
  assert.equal(el.value,'Texto [[]] restante');assert.equal(el.selectionStart,8);assert.equal(el.selectionEnd,8);
});
test('existing closing pair, single brackets and pasted markup stay unchanged',()=>{
  for(const [value,start,event] of [['[',1,typed('[')],['[[]]',2,typed('[')],['[[',2,{inputType:'insertFromPaste',data:'[['}],['[[',2,{...typed('['),isComposing:true}]]){
    const el=editor(value,start);assert.equal(pairTypedLink(el,event),false);assert.equal(el.value,value);
  }
});
test('block references are paired without changing surrounding text or Unicode cursor offsets',()=>{
  const el=editor('📝 ((');assert.equal(pairTypedLink(el,typed('(')),true);assert.equal(el.value,'📝 (())');assert.equal(el.selectionStart,5);
});
test('typing closing brackets moves across both existing closers without duplication',()=>{
  const el=editor('[[Página]] depois',8);
  assert.equal(stepOverLinkClose(el,{key:']'}),true);assert.equal(el.selectionStart,9);
  assert.equal(stepOverLinkClose(el,{key:']'}),true);assert.equal(el.selectionStart,10);
  assert.equal(stepOverLinkClose(el,{key:']'}),false);assert.equal(el.value,'[[Página]] depois');
});
test('literal closers, selections, IME and keyboard shortcuts retain normal behavior',()=>{
  for(const [value,start,end,event] of [['[a]',2,2,{key:']'}],['[[a]]',3,4,{key:']'}],['[[a]]',3,3,{key:']',ctrlKey:true}],['[[a]]',3,3,{key:']',isComposing:true}],['text)',4,4,{key:')'}]]){
    const el=editor(value,start,end);assert.equal(stepOverLinkClose(el,event),false);assert.equal(el.selectionStart,start);
  }
});
test('accepting a suggestion replaces existing title suffix and consumes its closing pair once',()=>{
  for(const [text,end,close,expected] of [['[[P]] depois',3,']]',5],['[[Pagina]] depois',3,']]',10],['((block-id)) depois',3,'))',12],['[[P novo bloco',3,']]',3],['[[P\nOutra]]',3,']]',3],['[[P [[Outra]]',3,']]',3]]){
    assert.equal(linkCompletionEnd(text,end,close),expected);
  }
  const value='antes [[Pagina]] depois',start=6,end=9;
  assert.equal(value.slice(0,start)+'[[Página]]'+value.slice(linkCompletionEnd(value,end,']]')),'antes [[Página]] depois');
});
