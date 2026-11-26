'use strict';
// 추적: 결론이 날 때까지 남기는 사안의 타임라인과 진행 상황

let stopTrackCarousel = null;

// 지난 호는 그날의 기록이라 지금 상황을 덧붙이지 않는다. 최신 호에서만 보인다
function renderTrack(data) {
  renderChangeStrip(data);
  const list = (data && data.items) || [];
  const box = $('trackList');
  stopTrackCarousel?.();
  stopTrackCarousel = null;
  box.replaceChildren();
  if (!list.length || VIEWING_PAST) {
    $('track').hidden = true;
    $('trackingBar').hidden = true;
    $('trackingReopen').hidden = true;
    toggleSectionNav('track', false);
    return;
  }
  for (const item of list) box.append(issuePreview(item));
  $('trackMeta').textContent = '사안 ' + list.length + '건 · 오늘 기준 · ' + longDate(data.updated) + ' 갱신';
  $('track').hidden = false;
  stopTrackCarousel = setupIssueCarousel('track', box, $('track').querySelector('.kj-wrap'));
  toggleSectionNav('track', true);
  setupTrackingPanel(data);
}

async function loadTrackers() {
  try {
    const data = await fetchJSON('data/trackers.json');
    return data && Array.isArray(data.items) ? data : { items: [] };
  } catch { return { items: [] }; }
}

function renderChangeStrip(data) {
  const section = $('changeStrip');
  if (!section) return;
  if (VIEWING_PAST || section.hasAttribute('data-change-archive')) {
    section.hidden = true;
    return;
  }
  const list = $('changeList');
  if (section.dataset.changeEdition !== D.date) {
    list.replaceChildren(...changeCards(data, D.date));
  }
  section.hidden = list.children.length === 0;
  if (section.hidden || section.dataset.enhanced) return;
  section.dataset.enhanced = 'true';
  markChangesSinceVisit(list);

  setupIssueCarousel('change', list, section, matchMedia('(max-width: 700px)'));
}

function markChangesSinceVisit(list) {
  if (!['/', '/index.html'].includes(location.pathname) || new URLSearchParams(location.search).has('d')) return;
  const today = todayKST();
  let baseline = '';
  try {
    const lastVisit = localStorage.getItem('jogan-last-home-visit');
    if (lastVisit === today) {
      const [visitDay, beforeDay] = (sessionStorage.getItem('jogan-home-visit-baseline') || '').split('/');
      if (visitDay === today) baseline = beforeDay;
    } else {
      baseline = lastVisit || '';
      sessionStorage.setItem('jogan-home-visit-baseline', today + '/' + baseline);
      localStorage.setItem('jogan-last-home-visit', today);
    }
  } catch { return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseline) || baseline >= today) return;
  const parsed = new Date(baseline + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== baseline) return;
  for (const when of list.querySelectorAll('time[datetime]')) {
    if (when.dateTime > baseline && when.dateTime <= today) when.after(el('span', { class: 'change-strip__since' }, '지난 방문 뒤 변경'));
  }
}

// 빌드 전 원본 지면도 동일한 사건 날짜와 링크를 보여 준다
function changeCards(data, issueDate) {
  const changes = [];
  const seen = new Set();
  for (const item of data?.items || []) {
    if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || '') || seen.has(item.id)) continue;
    if (!item.title || !item.summary) continue;
    seen.add(item.id);
    let latest;
    for (const step of item.steps || []) {
      if (step?.done !== true || step.contextOnly || !step.t) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(step.d) || step.d > issueDate) continue;
      const day = new Date(step.d + 'T00:00:00Z');
      if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== step.d) continue;
      if (!latest || step.d >= latest.d) latest = step;
    }
    if (latest) changes.push({ item, step: latest });
  }
  changes.sort((a, b) => b.step.d.localeCompare(a.step.d));
  return changes.slice(0, 3).map(({ item, step }) => {
    const li = el('li');
    const link = el('a', { class: 'change-strip__card', href: '/topics/' + item.id + '/' });
    link.append(el('time', { datetime: step.d }, '변경일 ' + step.d.replaceAll('-', '.')),
      el('h3', {}, item.shortTitle || item.title), el('p', {}, step.brief || step.t));
    li.append(link);
    return li;
  });
}

function issuePreview(item) {
  const card = el('article', { class: 'issue-preview', id: 'issue-' + item.id });
  const copy = el('div', { class: 'issue-preview__copy' });
  const phase = item.phases?.[item.phaseIndex];
  const meta = el('p', { class: 'issue-preview__meta' });
  meta.append(el('span', { class: 'kj-badge kj-badge--brand' }, item.status));
  if (phase) meta.append(el('span', {}, '현재 단계 · ' + phase));
  const summary = readingText(item.summary);
  const lead = summary.querySelector('.kj-reading__lead')?.textContent || item.summary;
  copy.append(meta, el('h3', {}, item.title), el('p', { class: 'issue-preview__lead' }, lead));
  card.append(copy);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) {
    const foot = el('div', { class: 'issue-preview__foot' });
    foot.append(el('span', {}, '진행 기록 ' + item.steps.length + '건 · 관련 기사 ' + item.links.length + '건'),
      el('a', { class: 'kj-track__permalink', href: '/topics/' + item.id + '/', 'aria-label': item.title + ' · 이슈 상세 보기' }, '이슈 상세 보기 →'));
    card.append(foot);
  }
  return card;
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
  reopen.hidden = !hidden;
  reopen.textContent = '추적 ' + data.items.length;
  $('trackingExpand').textContent = '이슈 추적 · ' + data.items.length + '건 · 목록 보기';
  const open = (event) => {
    opener = event.currentTarget;
    content.replaceChildren();
    data.items.forEach((item) => {
      const article = el('article', { class: 'tracking-summary' });
      article.append(el('small', {}, item.status), el('h3', {}, item.shortTitle || item.title));
      const link = $('issue-' + item.id).querySelector('.kj-track__permalink');
      if (link) article.append(link.cloneNode(true));
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
    reopen.hidden = false;
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
