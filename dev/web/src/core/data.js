'use strict';
// 발행 데이터 불러오기

// 발행 데이터는 페이지 안에 실려 있으면 그것을, 없으면 data/issues/에서 읽는다
// 주소에 ?d=YYYY-MM-DD가 있고 발행 목록에 있는 날이면 그 호를, 아니면 최신 호를 연다
async function loadIssue() {
  const inline = document.getElementById('issue-data');
  if (inline) return JSON.parse(inline.textContent);
  // index.html 머리에서 미리 시작한 요청을 쓴다. 다시 불러오기면 새로 받는다
  const pre = window.KJ_DATA;
  window.KJ_DATA = null;
  const { index, date, issue } = await (pre || window.kjFetchIssue());
  INDEX = index;
  VIEWING_PAST = date !== INDEX.latest;
  return issue;
}
