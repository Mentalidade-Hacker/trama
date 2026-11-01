// Only typed delimiters are paired. Pasted/imported notes remain verbatim.
export function pairTypedLink(editor,event) {
  if(event.isComposing||event.inputType!=='insertText'||!['[','('].includes(event.data))return false;
  const {value,selectionStart:start,selectionEnd:end}=editor;
  if(start!==end)return false;
  const open=event.data.repeat(2),close=event.data==='['?']]':'))';
  if(value.slice(start-2,start)!==open||value.slice(start,start+2)===close)return false;
  editor.setRangeText(close,start,start,'start');
  return true;
}

export function stepOverLinkClose(editor,event) {
  if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||![']',')'].includes(event.key))return false;
  const {value,selectionStart:start,selectionEnd:end}=editor;
  if(start!==end||value[start]!==event.key)return false;
  const before=value.slice(0,start),close=event.key.repeat(2),open=event.key===']'?'[[':'((';
  if(before.lastIndexOf(open)<=before.lastIndexOf(close))return false;
  editor.setSelectionRange(start+1,start+1);
  return true;
}

// Completing a title halfway through an existing link replaces its whole title.
export function linkCompletionEnd(value,end,close) {
  const tail=value.slice(end),at=tail.indexOf(close);
  return at>=0&&!/[\[\]()\r\n]/.test(tail.slice(0,at))?end+at+close.length:end;
}
