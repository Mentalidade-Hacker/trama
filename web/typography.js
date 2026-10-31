/* Apply the saved text size before the first paint, without changing note data. */
(() => {
  const key = 'trama-text-size';
  const root = document.documentElement;
  const normalize = value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 80 && number <= 200
      ? Math.round(number / 10) * 10 : 100;
  };
  const read = () => { try { return normalize(localStorage.getItem(key)); } catch { return 100; } };
  let size = read();

  function apply() {
    root.style.setProperty('--font-scale', String(size / 100));
    root.dataset.textSize = String(size);
    document.querySelectorAll('[data-text-size]').forEach(input => { input.value = String(size); });
    document.querySelectorAll('[data-text-size-value]').forEach(output => { output.textContent = `${size}%`; });
    document.querySelectorAll('[data-text-size-step]').forEach(button => {
      button.disabled = Number(button.dataset.textSizeStep) < 0 ? size <= 80 : size >= 200;
    });
    document.dispatchEvent(new Event('trama:typography'));
  }
  function set(value) {
    size = normalize(value);
    try { localStorage.setItem(key, String(size)); } catch {}
    apply();
  }
  apply();
  document.addEventListener('input', event => {
    if (event.target.matches?.('[data-text-size]')) set(event.target.value);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-text-size-step],[data-text-size-reset]');
    if (!button) return;
    if (button.hasAttribute('data-text-size-reset')) set(100);
    else set(size + Number(button.dataset.textSizeStep));
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { size = read(); apply(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    // Floating panels follow wrapped toolbars when the text size increases.
    const measure = () => {
      const header = document.querySelector('.topbar');
      const footer = document.querySelector('.workspace > footer');
      if (header) root.style.setProperty('--topbar-height', `${header.getBoundingClientRect().height}px`);
      if (footer) root.style.setProperty('--footer-height', `${footer.getBoundingClientRect().height}px`);
    };
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      document.querySelectorAll('.topbar,.workspace > footer').forEach(element => observer.observe(element));
    }
    measure();
  }, {once:true});
})();
