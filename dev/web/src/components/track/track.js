'use strict';
// 추적: 결론이 날 때까지 남기는 사안의 타임라인과 진행 상황

// 지난 호는 그날의 기록이라 지금 상황을 덧붙이지 않는다. 최신 호에서만 보인다
function renderTrack(data) {
  renderChangeStrip(data);
  const list = (data && data.items) || [];
  if (!list.length || VIEWING_PAST) { $('track').hidden = true; toggleSectionNav('track', false); return; }
  const today = parseDate(todayKST());
  const box = $('trackList');
  clearReadingPair(box);
  box.replaceChildren();
  const paired = list.length === 2 && typeof ResizeObserver === 'function';
  list.forEach((item) => {
    const card = el('article', { class: 'kj-track' });
    const head = el('div', { class: 'kj-track__head' });
    head.append(el('h3', {}, item.title), el('span', { class: 'kj-badge' }, item.status));
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) {
      head.append(el('a', {
        href: '/topics/' + item.id + '/',
        class: 'kj-track__permalink',
        'aria-label': '이 이슈의 전체 기록 · ' + item.title,
      }, '이 이슈의 전체 기록'));
    }
    card.id = 'issue-' + item.id;
    card.append(head, readingText(item.summary, 'kj-track__sum'));
    const keyword = item.trackingKeywords?.exact?.[0];
    if (keyword) {
      const line = el('p', { class: 'kj-track__keywords' });
      line.append(el('strong', {}, '추적 키워드'), ' ' + keyword);
      card.append(line);
    }
    if (item.phases) card.append(trackingPhases(item));

    const body = el('div', { class: 'kj-track__body' });
    if (!paired) {
      body.tabIndex = 0;
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', item.title + ' 진행 상황과 확인 기록');
    }
    const grid = el('div', { class: 'kj-track__grid' });
    const ol = el('ol', { class: 'kj-timeline' });
    item.steps.forEach((st) => {
      const li = el('li', st.done ? { class: 'is-done' } : {});
      const when = st.d ? longDate(st.d) : (item.periodUnknown ? '일정 미확정' : '예정');
      li.append(el('b', {}, when), el('span', {}, st.t));
      ol.append(li);
    });
    const timeline = el('details', { class: 'kj-track__timeline' });
    timeline.append(el('summary', {}, '진행 일정 ' + item.steps.length + '건'), ol);
    responsiveDisclosure(timeline);
    grid.append(timeline);

    const side = el('div', { class: 'kj-track__side' });
    if (!item.periodUnknown) side.append(progressBox(item, today));
    else side.append(el('p', { class: 'kj-prog__label' }, item.label));
    side.append(el('p', { class: 'kj-prog__next' }, item.next));
    const hasArticleTable = item.links.some((link) => link.summary);
    if (item.links && item.links.length && !hasArticleTable) {
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
    grid.prepend(side);
    body.append(grid);
    if (hasArticleTable) {
      const sources = el('details', { class: 'kj-track__sources' });
      sources.append(el('summary', {}, '관련 기사 ' + item.links.length + '건과 확인 기록'), trackingArticles(item));
      responsiveDisclosure(sources, { wideOpen: item.links.length <= 3 });
      body.append(sources);
    }
    card.append(body);
    box.append(card);
  });
  $('trackMeta').textContent = '사안 ' + list.length + '건 · 오늘 기준 · ' + longDate(data.updated) + ' 갱신';
  $('track').hidden = false;
  if (paired) matchReadingColumns(box, 1100, list.map((item) => item.title + ' 진행 상황과 확인 기록'));
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

  const controls = $('changeControls');
  const previous = $('changePrev');
  const next = $('changeNext');
  const position = $('changePosition');

  function offsets() {
    const start = list.firstElementChild.offsetLeft;
    const limit = list.scrollWidth - list.clientWidth;
    return Array.from(list.children, (card) => Math.min(card.offsetLeft - start, limit));
  }

  function active(stops) {
    return stops.reduce((best, stop, i) =>
      Math.abs(stop - list.scrollLeft) < Math.abs(stops[best] - list.scrollLeft) ? i : best, 0);
  }

  function update() {
    controls.hidden = list.scrollWidth <= list.clientWidth + 1;
    if (controls.hidden) return;
    const stops = offsets();
    const index = active(stops);
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === stops.length - 1));
    const label = stops.length + '개 중 ' + (index + 1) + '번째';
    if (position.textContent !== label) position.textContent = label;
  }

  function move(direction) {
    const stops = offsets();
    const target = stops[active(stops) + direction];
    if (target !== undefined) list.scrollTo({ left: target, behavior: 'instant' });
  }

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  list.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(list);
  else window.addEventListener('resize', update);
  update();
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
  reopen.hidden = !hidden;
  reopen.textContent = '추적 ' + data.items.length;
  $('trackingExpand').textContent = '이슈 추적 · ' + data.items.length + '건 · 펼쳐 보기';
  const open = (event) => {
    opener = event.currentTarget;
    content.replaceChildren();
    data.items.forEach((item) => {
      const article = el('article', { class: 'tracking-summary' });
      article.append(el('small', {}, item.status), el('h3', {}, item.shortTitle || item.title), el('small', {}, longDate(data.updated) + ' 자료 대조 · 보도에 따른 편집상 단계'));
      if (item.phases) article.append(trackingPhases(item));
      article.append(readingText(item.summary), readingText(item.next, 'tracking-next'));
      const details = el('details');
      details.append(el('summary', {}, '기사·타임라인 자세히 보기'));
      const card = $('issue-' + item.id).cloneNode(true);
      card.removeAttribute('id');
      const permalink = card.querySelector('.kj-track__permalink');
      if (permalink) article.append(permalink);
      card.querySelectorAll('.kj-track__sources').forEach((sources) => sources.replaceWith(sources.querySelector('.tracking-articles')));
      card.querySelectorAll('.kj-track__timeline').forEach((timeline) => timeline.replaceWith(timeline.querySelector('.kj-timeline')));
      card.querySelectorAll('.kj-track__head, .kj-track__sum, .tracking-phases, .kj-prog__next').forEach((node) => node.remove());
      if (item.links.some((link) => link.summary)) card.querySelectorAll('.kj-track__linkh, .kj-track__links').forEach((node) => node.remove());
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
