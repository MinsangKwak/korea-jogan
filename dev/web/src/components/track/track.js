'use strict';
// 추적: 결론이 날 때까지 남기는 사안의 타임라인과 진행 상황

// 지난 호는 그날의 기록이라 지금 상황을 덧붙이지 않는다. 최신 호에서만 보인다
function renderTrack(data) {
  const list = (data && data.items) || [];
  if (!list.length || VIEWING_PAST) { $('track').hidden = true; toggleSectionNav('track', false); return; }
  const today = parseDate(todayKST());
  const box = $('trackList');
  box.replaceChildren();
  list.forEach((item) => {
    const card = el('article', { class: 'kj-track' });
    const head = el('div', { class: 'kj-track__head' });
    head.append(el('h3', {}, item.title), el('span', { class: 'kj-badge' }, item.status));
    card.id = 'issue-' + item.id;
    card.append(head, el('p', { class: 'kj-track__sum' }, item.summary));
    if (item.phases) card.append(trackingPhases(item));

    const grid = el('div', { class: 'kj-track__grid' });
    const ol = el('ol', { class: 'kj-timeline' });
    item.steps.forEach((st) => {
      const li = el('li', st.done ? { class: 'is-done' } : {});
      li.append(el('b', {}, st.d ? longDate(st.d) : '예정'), el('span', {}, st.t));
      ol.append(li);
    });
    grid.append(ol);

    const side = el('div', { class: 'kj-track__side' });
    if (!item.periodUnknown) side.append(progressBox(item, today));
    else side.append(el('p', { class: 'kj-prog__label' }, item.label));
    side.append(el('p', { class: 'kj-prog__next' }, item.next));
    if (item.links && item.links.length) {
      side.append(el('h4', { class: 'kj-track__linkh' }, '최근 기사'));
      const ul = el('ul', { class: 'kj-track__links' });
      item.links.forEach((a) => {
        const li = el('li');
        const who = el('b', {}, a.outlet);
        who.append(el('small', {}, a.date.slice(5).replace('-', '/')));
        const link = el('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.title);
        link.addEventListener('click', () => track('track-link', item.id + ' · ' + a.outlet));
        li.append(who, link);
        ul.append(li);
      });
      side.append(ul);
    }
    side.append(el('p', { class: 'kj-prog__note' }, item.note));
    grid.append(side);
    card.append(grid);
    if (item.links.some((a) => a.summary)) card.append(trackingArticles(item));
    box.append(card);
  });
  $('trackMeta').textContent = '사안 ' + list.length + '건 · 오늘 기준 · ' + longDate(data.updated) + ' 갱신';
  $('track').hidden = false;
  toggleSectionNav('track', true);
  setupTrackingPanel(data);
}

async function loadTrackers() {
  try {
    const data = await fetchJSON('data/trackers.json');
    return data && Array.isArray(data.items) ? data : { items: [] };
  } catch { return { items: [] }; }
}

// 진행 단계는 편집상 정리이며 경과일로 계산한 해결률이 아니다
function trackingPhases(item) {
  const ol = el('ol', { class: 'tracking-phases', 'aria-label': '진행 단계' });
  item.phases.forEach((name, i) => {
    const li = el('li', { class: i < item.phaseIndex ? 'is-done' : i === item.phaseIndex ? 'is-current' : '' });
    if (i === item.phaseIndex) li.setAttribute('aria-current', 'step');
    li.append(el('span', { 'aria-hidden': 'true' }), el('b', {}, name), el('small', {}, i < item.phaseIndex ? '이전 단계' : i === item.phaseIndex ? '현재 확인' : '후속 확인'));
    ol.append(li);
  });
  return ol;
}

function trackingArticles(item) {
  const table = el('table', { class: 'tracking-articles' });
  table.append(el('caption', {}, '관련 기사 · 날짜와 매체별 확인 기록'));
  const thead = el('thead');
  const tr = el('tr');
  ['보도일·매체', '기사·원문', '핵심 내용·확인 범위'].forEach((t) => tr.append(el('th', { scope: 'col' }, t)));
  thead.append(tr);
  const body = el('tbody');
  item.links.forEach((a) => {
    const row = el('tr');
    const date = el('td', { 'data-label': '보도일·매체' });
    date.append(el('time', { datetime: a.date }, a.date), el('b', {}, a.outlet));
    const title = el('td', { 'data-label': '기사·원문' });
    title.append(el('small', {}, a.topic || '보도'), el('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.title));
    const summary = el('td', { 'data-label': '핵심 내용·확인 범위' });
    summary.append(el('p', {}, a.summary || ''), el('small', {}, a.verification || '원문 링크'));
    row.append(date, title, summary);
    body.append(row);
  });
  table.append(thead, body);
  return table;
}

function setupTrackingPanel(data) {
  const dialog = $('trackingDialog');
  const content = $('trackingContent');
  const bar = $('trackingBar');
  const reopen = $('trackingReopen');
  let opener = null;
  let hidden = false;
  try { hidden = sessionStorage.getItem('jogan-tracking-hidden') === '1'; } catch {}
  bar.hidden = hidden;
  reopen.hidden = false;
  reopen.textContent = '추적 ' + data.items.length;
  $('trackingExpand').textContent = '이슈 추적 · ' + data.items.length + '건  펼치기';
  const open = (event) => {
    opener = event.currentTarget;
    content.replaceChildren();
    data.items.forEach((item) => {
      const article = el('article', { class: 'tracking-summary' });
      article.append(el('small', {}, item.status), el('h3', {}, item.shortTitle || item.title), el('small', {}, longDate(data.updated) + ' 자료 대조 · 보도에 따른 편집상 단계'));
      if (item.phases) article.append(trackingPhases(item));
      article.append(el('p', {}, item.summary), el('p', { class: 'tracking-next' }, item.next));
      const details = el('details');
      details.append(el('summary', {}, '기사·타임라인 자세히 보기'));
      const card = $('issue-' + item.id).cloneNode(true);
      card.removeAttribute('id');
      details.append(card);
      article.append(details);
      content.append(article);
    });
    dialog.showModal();
    document.body.classList.add('is-locked');
    $('trackingClose').focus({ preventScroll: true });
  };
  $('trackingExpand').onclick = open;
  reopen.onclick = open;
  $('trackingHide').onclick = () => {
    bar.hidden = true;
    try { sessionStorage.setItem('jogan-tracking-hidden', '1'); } catch {}
    reopen.focus({ preventScroll: true });
  };
  $('trackingClose').onclick = () => dialog.close();
  dialog.onclick = (event) => { if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  } };
  dialog.onclose = () => {
    document.body.classList.remove('is-locked');
    if (opener) opener.focus({ preventScroll: true });
  };
}
