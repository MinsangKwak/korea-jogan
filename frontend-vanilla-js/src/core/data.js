'use strict';
// 발행 데이터 불러오기

const DATA_TIMEOUT_MS = 12000;

async function fetchJSON(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_TIMEOUT_MS);
  try {
    const response = await fetch(path, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error('자료 응답 오류: ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function assertIssue(issue) {
  if (!issue || !Array.isArray(issue.themes) || !issue.themes.length) throw new Error('언론 주제 누락');
  issue.themes.forEach((theme) => {
    if (!theme || typeof theme.id !== 'string' || !theme.id.trim() || !Array.isArray(theme.articles) || !Array.isArray(theme.keywords) || !Array.isArray(theme.summary)) throw new Error('언론 주제 형식 오류');
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.date)) throw new Error('호 날짜 오류');
  return issue;
}

// 발행 데이터는 페이지 안에 실려 있으면 그것을, 없으면 data/issues/에서 읽는다
// 주소에 ?d=YYYY-MM-DD가 있고 발행 목록에 있는 날이면 그 호를, 아니면 최신 호를 연다
async function loadIssue() {
  const inline = document.getElementById('issue-data');
  const inlineIssue = inline ? JSON.parse(inline.textContent) : null;
  const embeddedIndex = document.getElementById('issue-index');
  INDEX = embeddedIndex && JSON.parse(embeddedIndex.textContent);
  if (!INDEX) INDEX = await fetchJSON('data/issues/index.json');
  if (!INDEX || !Array.isArray(INDEX.issues) || !INDEX.issues.includes(INDEX.latest) || !INDEX.issues.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('발행 목록 오류');
  // 호별 페이지(/YYYY-MM-DD)는 kj-date로, 예전 주소는 ?d=로 날짜를 받는다
  const page = document.querySelector('meta[name="kj-date"]');
  const want = new URLSearchParams(location.search).get('d') || (page && page.content);
  const date = want && INDEX.issues.includes(want) ? want : INDEX.latest;
  VIEWING_PAST = date !== INDEX.latest;
  const issue = inlineIssue && inlineIssue.date === date ? inlineIssue : await fetchJSON('data/issues/' + date + '.json');
  if (issue.date !== date) throw new Error('요청한 호와 응답 날짜 불일치');
  return assertIssue(issue);
}
