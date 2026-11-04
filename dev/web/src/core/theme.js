'use strict';
// 같은 읽기 설정을 첫 화면, 메뉴, 기록 페이지에 적용한다
(function () {
  const themeKey = 'jogan-theme';
  const bigKey = 'jg_big';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = (value) => ['system', 'light', 'dark'].includes(value) ? value : 'system';
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  };
  let mode = valid(read(themeKey));
  let big = read(bigKey) === '1';
  const resolved = () => mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
  const setSwitch = (button, state, on) => {
    button.setAttribute('aria-checked', String(on));
    const label = button.querySelector(state);
    if (label) label.textContent = on ? '켬' : '끔';
  };
  const applyTheme = () => {
    const color = resolved();
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = mode;
    root.dataset.colorMode = color;
    root.style.colorScheme = color;
    document.querySelectorAll('[data-theme-select]').forEach((select) => { select.value = mode; });
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => setSwitch(button, '[data-theme-state]', color === 'dark'));
    document.querySelectorAll('[data-theme-system]').forEach((button) => {
      button.setAttribute('aria-pressed', String(mode === 'system'));
      const state = button.querySelector('[data-theme-system-state]');
      if (state) state.textContent = mode === 'system' ? '사용 중' : '';
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    const background = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (meta && background) meta.content = background;
  };
  const applyBig = () => {
    root.classList.toggle('big', big);
    document.querySelectorAll('[data-big-toggle]').forEach((button) => setSwitch(button, '[data-big-state]', big));
  };
  const setMode = (value) => {
    mode = valid(value);
    write(themeKey, mode === 'system' ? null : mode);
    applyTheme();
  };
  const connect = (selector, event, handler) => {
    document.querySelectorAll(selector).forEach((control) => {
      control.disabled = false;
      control.addEventListener(event, () => handler(control));
    });
  };
  applyTheme();
  applyBig();
  const bind = () => {
    connect('[data-theme-select]', 'change', (select) => setMode(select.value));
    connect('[data-theme-toggle]', 'click', () => setMode(resolved() === 'dark' ? 'light' : 'dark'));
    connect('[data-theme-system]', 'click', () => setMode('system'));
    connect('[data-big-toggle]', 'click', () => {
      big = !big;
      write(bigKey, big ? '1' : '0');
      applyBig();
    });
    applyTheme();
    applyBig();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
  system.addEventListener('change', () => { if (mode === 'system') applyTheme(); });
  window.addEventListener('storage', (event) => {
    if (event.key === themeKey || event.key === null) { mode = valid(read(themeKey)); applyTheme(); }
    if (event.key === bigKey || event.key === null) { big = read(bigKey) === '1'; applyBig(); }
  });
})();
