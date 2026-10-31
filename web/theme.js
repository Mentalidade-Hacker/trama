/* Runs before stylesheets so a saved dark preference is applied on first paint. */
(() => {
  const key = 'trama-theme';
  const root = document.documentElement;
  const choices = new Set(['light', 'dark', 'system']);
  const normalize = value => choices.has(value) ? value : 'light';
  const read = () => { try { return normalize(localStorage.getItem(key)); } catch { return 'light'; } };
  let preference = read();
  const system = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  function apply() {
    const effective = preference === 'system' ? (system?.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = effective;
    root.dataset.themePreference = preference;
    root.style.colorScheme = effective;
    // Keep existing component selectors compatible with the new early theme.
    document.body?.classList.toggle('dark', effective === 'dark');
    document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = preference; });
    document.querySelectorAll('[data-theme-status]').forEach(status => {
      status.textContent = preference === 'system'
        ? `Seguindo o sistema · ${effective === 'dark' ? 'escuro' : 'claro'} agora`
        : `Tema ${effective === 'dark' ? 'escuro' : 'claro'} selecionado`;
    });
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  document.addEventListener('change', event => {
    if (!event.target.matches?.('[data-theme-select]')) return;
    preference = normalize(event.target.value);
    try { localStorage.setItem(key, preference); } catch {}
    apply();
  });
  const followSystem = () => { if (preference === 'system') apply(); };
  if (system?.addEventListener) system.addEventListener('change', followSystem);
  else system?.addListener?.(followSystem);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { preference = read(); apply(); }
  });
})();
