'use strict';
// 방문·행동 측정(GoatCounter·GA4)

// 방문·행동 측정. jg-goatcounter·jg-ga4가 비어 있으면 그 도구로는 아무것도 보내지 않는다
// GoatCounter는 쿠키를 쓰지 않고 개인을 식별하지 않는다. GA4는 쿠키(_ga)를 쓴다
const metaContent = (name) => (document.querySelector('meta[name="' + name + '"]') || {}).content || '';
// 자동화 브라우저(배포 검증·CI)와 운영자 브라우저는 방문으로 세지 않는다
// ?kj-internal=1 로 열면 그 브라우저를 내부로 표시하고, =0 이면 푼다. 관리자 화면을 연 브라우저도 내부로 표시한다
const INTERNAL_KEY = 'kj-internal';
function isInternal() {
  if (navigator.webdriver) return true;
  try {
    const flag = new URLSearchParams(location.search).get(INTERNAL_KEY);
    if (flag === '1') localStorage.setItem(INTERNAL_KEY, '1');
    if (flag === '0') localStorage.removeItem(INTERNAL_KEY);
    return localStorage.getItem(INTERNAL_KEY) === '1';
  } catch { return false; }
}
const INTERNAL = isInternal();
const GC = INTERNAL ? '' : metaContent('jg-goatcounter');
const GA = !INTERNAL && /^G-[A-Z0-9]+$/.test(metaContent('jg-ga4')) ? metaContent('jg-ga4') : '';
function addScript(src, data) {
  const sc = document.createElement('script');
  sc.async = true;
  sc.src = src;
  Object.assign(sc.dataset, data || {});
  document.head.append(sc);
}
function setupMetrics() {
  if (GC) addScript('https://gc.zgo.at/count.js', { goatcounter: GC });
  if (GA) {
    window.dataLayer = window.dataLayer || [];
    // gtag.js는 arguments 객체 그대로를 받는다
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // 첫 page_view는 호를 읽은 뒤 issue_date를 붙여 직접 보낸다
    window.gtag('config', GA, { send_page_view: false });
    addScript('https://www.googletagmanager.com/gtag/js?id=' + GA);
  }
}
// GA4 page_view. 어느 호를 열었는지(issue_date)와 지난 호인지(past)를 함께 남긴다
function trackView(date, past) {
  if (!GA) return;
  window.gtag('event', 'page_view', { page_title: document.title, page_location: location.href, issue_date: date || '', past: !!past });
}
// GA4 이벤트 이름은 영문·숫자·밑줄만 받는다. menu-open → menu_open
function track(name, title) {
  if (GC && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: title || name, event: true });
  if (GA) window.gtag('event', name.replace(/[^A-Za-z0-9_]/g, '_'), { label: title || '' });
}

// 원문과 검색어를 보내지 않고 읽기 준비 시간과 성공 여부만 측정한다
function trackLoad(ok, duration) {
  if (GA && window.gtag) window.gtag('event', ok ? 'app_ready' : 'app_load_error', { duration_ms: duration });
}

// 섹션 읽기 측정. 이벤트 이름에 섹션을 담아 GA4 맞춤 측정기준 없이도 관리자 화면에서 섹션별로 센다
// - section_<id>: 섹션을 읽은 사람. 메뉴로 들어오거나 화면 가운데에 3초 넘게 머물면 방문마다 한 번 보낸다
// - dwell_<id>: 섹션에 머문 시간(초)을 value로 보낸다. 탭을 숨기거나 떠날 때 모아서 보낸다
// 스크롤로 스쳐 지나간 섹션은 3초 문턱에서 걸러지고, 2분 넘게 아무 조작이 없으면 시간을 더하지 않는다
const READ_MS = 3000;
const IDLE_MS = 120000;
const sectionsRead = new Set();
function noteSection(id) {
  if (!GA || !window.gtag || !id || sectionsRead.has(id)) return;
  sectionsRead.add(id);
  window.gtag('event', 'section_' + id, { issue_date: D ? D.date : '' });
}
function trackSections() {
  if (!GA || !('IntersectionObserver' in window)) return;
  // spent는 아직 보내지 않은 시간, total은 이번 방문 전체 시간(3초 문턱 판단용). 단위는 ms
  const spent = {};
  const total = {};
  let current = '';
  let visible = !document.hidden;
  let since = performance.now();
  let active = since;
  let timer = 0;
  const settle = () => {
    const now = performance.now();
    const end = Math.min(now, active + IDLE_MS);
    if (current && visible && end > since) {
      spent[current] = (spent[current] || 0) + end - since;
      total[current] = (total[current] || 0) + end - since;
      if (total[current] >= READ_MS) noteSection(current);
    }
    since = now;
  };
  const enter = (id) => {
    settle();
    current = id;
    clearTimeout(timer);
    // 조작 없이 머물러도 3초가 지나면 읽은 것으로 센다
    if (id && !sectionsRead.has(id)) timer = setTimeout(settle, READ_MS + 50);
  };
  const flush = () => {
    for (const [id, ms] of Object.entries(spent)) {
      const seconds = Math.round(ms / 1000);
      if (!seconds) continue;
      spent[id] = 0;
      window.gtag('event', 'dwell_' + id, { value: seconds, issue_date: D ? D.date : '', transport_type: 'beacon' });
    }
  };
  // 화면 가운데 띠에 걸친 섹션을 지금 읽는 섹션으로 본다. 나간 섹션을 먼저 처리해 순서가 섞여도 맞게 바꾼다
  const observer = new IntersectionObserver((entries) => {
    entries.sort((a, b) => a.isIntersecting - b.isIntersecting).forEach((entry) => {
      if (entry.isIntersecting) enter(entry.target.id);
      else if (entry.target.id === current) enter('');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) observer.observe(el); });
  ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart'].forEach((type) => window.addEventListener(type, () => {
    settle();
    active = performance.now();
  }, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { settle(); visible = false; flush(); return; }
    visible = true;
    since = active = performance.now();
  });
  window.addEventListener('pagehide', () => { settle(); flush(); });
}
