// Os grupos usam <details> nativo: continuam acessíveis sem este complemento.
export function setupWorkspaceUI(root=document) {
  const openMenus=()=>[...root.querySelectorAll('details[data-workspace-menu][open]')];
  const click=event=>{
    const menu=event.target.closest?.('details[data-workspace-menu]');
    for(const other of openMenus())if(other!==menu)other.open=false;
    // Não cancelar nem mover o foco: o botão pode abrir uma janela ou editor.
    if(menu&&event.target.closest('button,a[href]'))menu.open=false;
  };
  const key=event=>{
    if(event.key!=='Escape')return;
    const menu=event.target.closest?.('details[data-workspace-menu][open]');
    if(!menu)return;
    event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus();
  };
  root.addEventListener('click',click);
  root.addEventListener('keydown',key,true);
  return ()=>{root.removeEventListener('click',click);root.removeEventListener('keydown',key,true);};
}

if(typeof document!=='undefined')setupWorkspaceUI();
