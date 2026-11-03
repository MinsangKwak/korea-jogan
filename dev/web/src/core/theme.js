'use strict';
// 첫 화면의 모드에 선택·저장·기기 변경 동작을 연결한다
(function () {
  const key = 'jogan-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = (value) => ['system', 'light', 'dark'].includes(value) ? value : 'system';
  const read = () => { try { return valid(localStorage.getItem(key)); } catch { return 'system'; } };
  let mode = read();
  const apply = () => {
    const resolved = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = mode;
    root.dataset.colorMode = resolved;
    root.style.colorScheme = resolved;
    document.querySelectorAll('[data-theme-select]').forEach((select) => { select.value = mode; });
    const meta = document.querySelector('meta[name="theme-color"]');
    const background = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (meta && background) meta.content = background;
  };
  apply();
  const bind = () => {
    document.querySelectorAll('[data-theme-select]').forEach((select) => {
      select.disabled = false;
      select.addEventListener('change', () => {
        mode = valid(select.value);
        try { if (mode === 'system') localStorage.removeItem(key); else localStorage.setItem(key, mode); } catch {}
        apply();
      });
    });
    apply();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
  system.addEventListener('change', () => { if (mode === 'system') apply(); });
  window.addEventListener('storage', (event) => { if (event.key === key || event.key === null) { mode = read(); apply(); } });
})();
