'use strict';

// 빌드된 지면은 그대로 읽고, 원본 미리보기나 다른 호의 데이터가 열릴 때에만 채운다.
async function showPoliticsFront(issue) {
  const front = $('politicsFront');
  const datedPage = document.querySelector('meta[name="kj-date"]') || VIEWING_PAST || new URLSearchParams(location.search).get('d') === issue.date;
  const view = datedPage ? 'edition' : 'home';
  if (!front || (front.dataset.issueDate === issue.date && front.dataset.frontView === view)) return;
  front.hidden = true;
  const cutoff = datedPage ? issue.date : todayKST();
  const data = await fetchJSON('data/political-questions.json');
  const entries = data.questions.flatMap((entry) => [entry, ...(entry.pastEditions || [])]
    .filter((version) => (datedPage ? version.editionFrom || version.checkedAt : version.checkedAt) <= cutoff)
    .map((version) => ({ ...entry, ...version })))
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt) || a.id.localeCompare(b.id));
  const lead = entries.find((entry) => entry.kind === 'issue');
  if (!lead) return;
  const path = (entry) => entry.trackerId ? '/topics/' + encodeURIComponent(entry.trackerId) + '/' : '/politics/' + encodeURIComponent(entry.id) + '/';
  const source = lead.sources[0];
  $('frontEyebrow').textContent = lead.eyebrow;
  $('frontQuestion').textContent = lead.question;
  $('frontAnswer').textContent = lead.answer;
  $('frontChecked').dateTime = lead.checkedAt;
  $('frontChecked').textContent = lead.checkedAt.replaceAll('-', '.') + '.';
  $('frontDetail').href = path(lead);
  $('frontSource').removeAttribute('href');
  $('frontSource').hidden = !safeSourceHref(source?.url);
  if (!$('frontSource').hidden) {
    $('frontSource').href = source.url;
    $('frontSource').textContent = '근거 원문 보기';
    $('frontSource').setAttribute('aria-label', '근거 원문 보기 · ' + source.label);
  }
  for (const [kind, id] of [['policy', 'frontPolicy'], ['term', 'frontTerm']]) {
    const entry = entries.find((item) => item.kind === kind);
    $(id + 'Item').hidden = !entry;
    if (entry) {
      $(id).href = path(entry);
      $(id).querySelector('strong').textContent = entry.question;
    }
  }
  const article = (issue.national?.items || []).find((item) =>
    ['정치', '정치·국회', '안보·외교'].includes(item.cat) && item.title && item.date && item.date <= issue.date && safeSourceHref(item.url));
  $('frontEdition').hidden = !article;
  if (article) {
    $('frontEditionLabel').textContent = longDate(issue.date) + '호 정치·외교';
    $('frontEditionStory').textContent = article.title;
    $('frontEditionStory').href = article.url;
  }
  front.dataset.issueDate = issue.date;
  front.dataset.frontView = view;
  front.hidden = false;
}
