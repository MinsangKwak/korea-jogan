'use strict';
// 호에 맞춘 문서 제목과 대표 주소

// 최신 호 첫 화면은 검색용 제목을 그대로 두고, 지난 호는 호별 페이지(/YYYY-MM-DD)와 같은 제목·주소를 쓴다
function renderHead() {
  if (!VIEWING_PAST) return;
  const headline = (D.lead && D.lead.headline) || D.headline || '';
  document.title = (headline ? headline + ' | ' : '') + ISSUE.getUTCFullYear() + '년 ' + longDate(D.date) + ' 대한민국 조간';
  const url = issueUrl(D.date);
  const canon = document.querySelector('link[rel="canonical"]');
  if (canon) canon.setAttribute('href', url);
  const og = document.querySelector('meta[property="og:url"]');
  if (og) og.setAttribute('content', url);
}
