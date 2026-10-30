'use strict';
// 경제: 핵심 숫자 카드와 최신 공식 숫자 띠

function renderNums() {
  D.nums.slice(0, 4).forEach((m) => {
    const a = el('a', { href: '#economy' });
    a.append(el('span', {}, m.k), el('b', {}, m.v), el('small', {}, m.d + ' · ' + m.ref));
    $('quickNums').append(a);
  });
  D.nums.forEach((m) => {
    const t = el('div', { class: 'kj-stat' });
    t.append(el('span', { class: 'kj-stat__k' }, m.k), el('span', { class: 'kj-stat__v' }, m.v));
    const row = el('div', { class: 'kj-stat__row' });
    row.append(el('span', { class: 'kj-dir kj-dir--' + m.dir, 'aria-label': DIR_LABEL[m.dir] + ' ' + m.d }, m.d));
    const foot = el('div', { class: 'kj-stat__foot' });
    foot.append(gradeBadge(m.grade), srcDisclosure(m.src, '경제 · ' + m.k));
    t.append(row, el('span', { class: 'kj-stat__ref' }, m.ref), foot);
    $('nums').append(t);
  });
}

// 승인된 조간과 별개인 자동 갱신 숫자(data/live.json). 없거나 못 읽으면 띠를 숨긴 채 둔다
// 지난 호를 볼 때는 그날 숫자와 헷갈리지 않게 보이지 않는다
async function renderLive() {
  if (VIEWING_PAST) return;
  let L = null;
  try {
    L = await fetchJSON('data/live.json');
  } catch (e) {
    return;
  }
  if (!L || !L.items || !L.items.length) return;
  const ul = $('liveList');
  const day = (m) => m.src.base.slice(5).replace('-', '/');
  // 기준일이 모두 같으면 항목마다 적지 않고 맨 위에 한 번만 적는다
  const oneDay = L.items.every((m) => m.src.base === L.items[0].src.base) ? day(L.items[0]) : '';
  L.items.forEach((m) => {
    const li = el('li');
    li.append(el('span', { class: 'k' }, m.k), el('span', { class: 'v' }, m.v));
    li.append(el('span', { class: 'kj-dir kj-dir--' + m.dir, 'aria-label': DIR_LABEL[m.dir] + ' ' + m.d }, m.d));
    if (!oneDay) li.append(el('small', {}, day(m) + ' 기준'));
    ul.append(li);
  });
  const at = new Date(L.updatedAt);
  const hours = (Date.now() - at.getTime()) / 3600000;
  const sameDay = new Date(at.getTime() + 9 * 3600000).toISOString().slice(0, 10) === todayKST();
  const when = at.toLocaleString('ko-KR', sameDay ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  // 평일 낮에는 1시간마다 갱신한다. 반나절 넘게 멈췄으면 그 사실을 함께 적는다
  // 안내 줄은 한 줄에 들어가게 출처를 줄여 쓰고, 전체 이름은 마우스를 올리면 보인다
  $('liveMeta').textContent = (oneDay ? oneDay + ' 기준 · ' : '') + when + ' 갱신' + (hours > 12 ? ' · 갱신이 늦어지고 있습니다' : '') + ' · 출처 ECOS';
  $('liveMeta').title = '출처: ' + L.source;
  $('live').hidden = false;
}
