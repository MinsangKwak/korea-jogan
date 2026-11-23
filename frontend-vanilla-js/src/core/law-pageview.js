'use strict';

const production = 'https://korea-jogan.com';
const titles = new Map([
  ['/law/', '판례 자료실 | 대한민국 조간'],
  ['/law/calendar/', '입법 캘린더 · 법률면 | 대한민국 조간'],
]);

function countLawPage(event) {
  if (event.source !== window.parent || event.origin !== production) return;
  const { page, referrer } = event.data || {};
  if (!titles.has(page) || typeof referrer !== 'string') return;
  if (referrer) {
    try {
      const from = new URL(referrer);
      if (!['https:', 'http:'].includes(from.protocol) || from.origin !== referrer) return;
    } catch { return; }
  }
  const id = document.querySelector('meta[name="jg-ga4"]').content;
  if (!/^G-[A-Z0-9]+$/.test(id)) return;
  window.removeEventListener('message', countLawPage);
  const view = { page_location: production + page, page_title: titles.get(page), page_referrer: referrer };
  window.dataLayer = [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', id, { ...view, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  gtag('event', 'page_view', view);
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.append(tag);
}

// 독립 실행과 쿼리·해시가 붙은 측정 문서는 태그를 시작하지 않는다
if (window !== window.top && window.parent === window.top && location.href === production + '/src/core/law-pageview.html') {
  window.addEventListener('message', countLawPage);
}
