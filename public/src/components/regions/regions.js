'use strict';
// 지역: 권역별 시도 선택과 시도 뉴스

function renderRegions() {
  const R = D.regions;
  if (!R) { $('regions').hidden = true; return; }
  const count = (name) => R.items.filter((i) => i.region === name).length;
  const covered = REGIONS.filter(([name]) => count(name)).length;
  $('regMeta').textContent = R.items.length + '건 · ' + covered + '개 시도 · ' + asOfText();
  const map = $('tmap');
  map.textContent = '';
  // 한 줄에 권역 이름과 그 권역의 시도 칩을 둔다. 맨 위 '전국' 줄은 모든 시도 보기
  const row = (label, chips) => {
    const r = el('div', { class: 'kj-tmap__row', role: 'group', 'aria-label': label });
    const box = el('div', { class: 'kj-tmap__chips' });
    chips.forEach((c) => box.append(c));
    r.append(el('span', { class: 'kj-tmap__label', 'aria-hidden': 'true' }, label), box);
    map.append(r);
  };
  const chip = (name, n, pressed, onPick) => {
    const attrs = { class: 'kj-rtile', type: 'button', 'aria-label': name + ' ' + n + '건' };
    // 기사가 없는 시도는 고를 수 없게 하고 점선으로 표시한다
    if (n) attrs['aria-pressed'] = String(pressed);
    else attrs['aria-disabled'] = 'true';
    const t = el('button', attrs, name);
    t.append(el('small', { 'aria-hidden': 'true' }, String(n)));
    if (n) t.addEventListener('click', onPick);
    return t;
  };
  row('전국', [chip('전체', R.items.length, region === '', () => selectRegion(''))]);
  REGION_GROUPS.forEach(([label, names]) => row(label, names.map((name) => chip(name, count(name), region === name, () => selectRegion(name)))));
  // 한 줄 띠(좁은 화면)에서는 고른 시도가 띠 가운데 오도록 띠만 가로로 민다
  const picked = map.querySelector('[aria-pressed="true"]');
  if (picked && map.scrollWidth > map.clientWidth) map.scrollLeft = picked.offsetLeft - map.offsetLeft - (map.clientWidth - picked.offsetWidth) / 2;

  const box = $('rlist');
  box.textContent = '';
  if (!region) {
    box.append(el('h3', {}, '시도별 한 줄'));
    const ul = el('ul', { class: 'digest' });
    REGIONS.forEach(([name]) => {
      const li = el('li');
      const n = count(name);
      const b = el('button', { class: 'rn', type: 'button' }, name);
      b.append(el('small', {}, n + '건'));
      if (n) b.addEventListener('click', () => selectRegion(name));
      else b.disabled = true;
      const first = R.items.find((i) => i.region === name);
      li.append(b, el('p', {}, R.summary[name] || (first ? first.summary : '이번 호에는 확인한 기사가 없습니다.')));
      ul.append(li);
    });
    box.append(ul);
    collapse(ul, { noun: '곳', name: '시도별 한 줄' });
    return;
  }
  box.append(el('h3', {}, region));
  if (R.summary[region]) box.append(el('p', { class: 'rsum' }, R.summary[region]));
  const items = el('div', { class: 'rnews' });
  R.items.filter((i) => i.region === region).forEach((it) => items.append(newsItem(it, it.cat)));
  box.append(items);
  collapse(items, { noun: '건', name: region + ' 기사' });
  const back = el('button', { class: 'kj-btn kj-btn--secondary', type: 'button' }, '전국 한눈에 보기');
  back.addEventListener('click', () => selectRegion(''));
  box.append(back);
}

function selectRegion(name) {
  region = name;
  renderRegions();
  // 좁은 화면에서는 지도 아래 목록으로 내려가 바로 읽게 한다
  if (window.matchMedia('(max-width: 900px)').matches) $('rlist').scrollIntoView({ block: 'start' });
}
