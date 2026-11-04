'use strict';
// 같은 읽기 설정을 첫 화면, 메뉴, 기록 페이지에 적용한다
(function () {
  const themeKey = 'jogan-theme';
  const bigKey = 'jg_big';
  const root = document.documentElement;
  const valid = (value) => value === 'dark' ? 'dark' : 'light';
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  };
  let mode = valid(read(themeKey));
  let big = read(bigKey) === '1';
  const setSwitch = (button, state, on) => {
    button.setAttribute('aria-checked', String(on));
    const label = button.querySelector(state);
    if (label) label.textContent = on ? '켬' : '끔';
  };
  const applyTheme = () => {
    root.dataset.theme = mode;
    root.dataset.colorMode = mode;
    root.style.colorScheme = mode;
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => setSwitch(button, '[data-theme-state]', mode === 'dark'));
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
    write(themeKey, mode === 'dark' ? 'dark' : null);
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
    connect('[data-theme-toggle]', 'click', () => setMode(mode === 'dark' ? 'light' : 'dark'));
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
  window.addEventListener('storage', (event) => {
    if (event.key === themeKey || event.key === null) { mode = valid(read(themeKey)); applyTheme(); }
    if (event.key === bigKey || event.key === null) { big = read(bigKey) === '1'; applyBig(); }
  });
})();
