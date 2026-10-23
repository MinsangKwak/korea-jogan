'use strict';
// 방문·행동 측정(GoatCounter·GA4)

// 방문·행동 측정. jg-goatcounter·jg-ga4가 비어 있으면 그 도구로는 아무것도 보내지 않는다
// GoatCounter는 쿠키를 쓰지 않고 개인을 식별하지 않는다. GA4는 쿠키(_ga)를 쓴다
const metaContent = (name) => (document.querySelector('meta[name="' + name + '"]') || {}).content || '';
const GC = metaContent('jg-goatcounter');
const GA = /^G-[A-Z0-9]+$/.test(metaContent('jg-ga4')) ? metaContent('jg-ga4') : '';
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
