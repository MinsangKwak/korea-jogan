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
    card.append(head, el('p', { class: 'kj-track__sum' }, item.summary));

    const grid = el('div', { class: 'kj-track__grid' });
    const ol = el('ol', { class: 'kj-timeline' });
    item.steps.forEach((st) => {
      const li = el('li', st.done ? { class: 'is-done' } : {});
      li.append(el('b', {}, st.d ? longDate(st.d) : '예정'), el('span', {}, st.t));
      ol.append(li);
    });
    grid.append(ol);

    const side = el('div', { class: 'kj-track__side' });
    side.append(progressBox(item, today));
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
    box.append(card);
  });
  $('trackMeta').textContent = '사안 ' + list.length + '건 · 오늘 기준 · ' + longDate(data.updated) + ' 갱신';
  $('track').hidden = false;
  toggleSectionNav('track', true);
}

async function loadTrackers() {
  try {
    const data = await fetchJSON('data/trackers.json');
    return data && Array.isArray(data.items) ? data : { items: [] };
  } catch { return { items: [] }; }
}
