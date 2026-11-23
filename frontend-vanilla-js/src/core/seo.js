'use strict';

// 정적 발행본의 제목과 공유 정보는 유지하고 원본 미리보기의 지난 호만 보완한다.
function renderHead() {
  const publishedDate = document.querySelector('meta[name="kj-date"]')?.content;
  if (!VIEWING_PAST || publishedDate === D.date) return;
  const headline = D.lead?.headline || D.headline || '';
  const date = ISSUE.getUTCFullYear() + '년 ' + longDate(D.date);
  const title = (headline ? headline + ' | ' : '') + date + ' 대한민국 조간';
  const summary = (date + ' 대한민국 조간. ' + (D.lead?.standfirst || '')).trim();
  const url = issueUrl(D.date);
  document.title = title;
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
  for (const [selector, value] of [
    ['meta[name="description"]', summary],
    ['meta[property="og:type"]', 'article'],
    ['meta[property="og:url"]', url],
    ['meta[property="og:title"]', title],
    ['meta[property="og:description"]', summary],
    ['meta[name="twitter:title"]', title],
    ['meta[name="twitter:description"]', summary]
  ]) {
    document.querySelector(selector)?.setAttribute('content', value);
  }
}
