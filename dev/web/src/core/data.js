'use strict';
// 발행 데이터 불러오기

// 발행 데이터는 페이지 안에 실려 있으면 그것을, 없으면 data/issues/에서 읽는다
// 주소에 ?d=YYYY-MM-DD가 있고 발행 목록에 있는 날이면 그 호를, 아니면 최신 호를 연다
async function loadIssue() {
  const inline = document.getElementById('issue-data');
  if (inline) return JSON.parse(inline.textContent);
  const get = async (path) => {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res.json();
  };
  INDEX = await get('data/issues/index.json');
  // 호별 페이지(/YYYY-MM-DD)는 kj-date로, 예전 주소는 ?d=로 날짜를 받는다
  const page = document.querySelector('meta[name="kj-date"]');
  const want = new URLSearchParams(location.search).get('d') || (page && page.content);
  const date = want && INDEX.issues.includes(want) ? want : INDEX.latest;
  VIEWING_PAST = date !== INDEX.latest;
  return get('data/issues/' + date + '.json');
}
