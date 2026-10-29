'use strict';
// 언론: 주제 칩, 주제 검색, 매체별 비교

// 검색어에서 뜻이 없는 말은 빼고, 남은 말이 주제 키워드에 들어 있거나 키워드를 품으면 점수를 준다
const STOP = ['우리나라', '한국', '대한민국', '현재', '오늘', '지금', '최근', '요즘', '관련', '뉴스', '기사', '현황', '상황'];
let themeId = '';

function scoreTheme(t, q) {
  const tokens = q.replace(/[^0-9A-Za-z가-힣\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.includes(w));
  const words = t.keywords.concat([t.title]);
  let score = 0;
  tokens.forEach((w) => {
    if (words.some((k) => k.includes(w) || w.includes(k))) score += 1;
  });
  return { score, tokens: tokens.length };
}

function renderThemeChips() {
  const box = $('tchips');
  box.textContent = '';
  D.themes.forEach((t) => {
    const b = el('button', { class: 'kj-chip', type: 'button', 'aria-pressed': String(t.id === themeId) }, t.title + ' ');
    b.append(el('span', { class: 'kj-count' }, String(t.articles.length)));
    b.addEventListener('click', () => { setQuery(''); showTheme(t.id); });
    box.append(b);
  });
}

// 오래 끄는 사안은 진행 막대로 어디까지 왔는지 보인다. progress를 적은 주제에만 그린다
// 날짜 계산은 한국 시간 기준이고, 끝난 기한을 넘겨도 막대는 100%에서 멈춘다
function renderProgress(p) {
  // 그 호를 낸 날로 센다. 오늘 날짜로 세면 지난 호를 나중에 열 때 본문과 숫자가 어긋난다
  // 기간은 시작일과 마지막 날을 모두 센다. '수사 90일'과 같은 말과 수를 맞춘다
  const span = Math.max(1, daysBetween(parseDate(p.start), parseDate(p.end)) + 1);
  const gone = Math.min(span, Math.max(0, daysBetween(parseDate(p.start), ISSUE) + 1));
  const left = span - gone;
  const pct = Math.round(gone / span * 100);
  const since = daysBetween(parseDate(p.since), ISSUE);

  const box = el('aside', { class: 'kj-prog', 'aria-labelledby': 'progH' });
  box.append(el('h4', { id: 'progH' }, p.label));
  const big = el('p', { class: 'kj-prog__big' });
  big.append(el('strong', {}, String(since)), document.createTextNode('일'));
  box.append(big, el('p', { class: 'kj-prog__since' }, p.sinceLabel));

  const bar = el('div', {
    class: 'kj-prog__bar', role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': String(span), 'aria-valuenow': String(gone),
    'aria-valuetext': p.label + ' ' + span + '일 중 ' + gone + '일 지남'
  });
  const fill = el('span');
  fill.style.width = pct + '%';
  bar.append(fill);
  box.append(bar);
  box.append(el('p', { class: 'kj-prog__meta' }, span + '일 중 ' + gone + '일 지남 · ' + (left > 0 ? '남은 ' + left + '일(' + longDate(p.end) + '까지)' : '기한 지남')));

  const ol = el('ol', { class: 'kj-prog__steps' });
  p.steps.forEach((st) => {
    const li = el('li');
    li.append(el('b', {}, longDate(st.d)), el('span', {}, st.t));
    ol.append(li);
  });
  box.append(ol);
  box.append(el('p', { class: 'kj-prog__next' }, p.next));
  box.append(el('p', { class: 'kj-prog__note' }, p.note));
  return box;
}

function showTheme(id) {
  themeId = id;
  renderThemeChips();
  const t = D.themes.find((x) => x.id === id);
  const box = $('tresult');
  box.textContent = '';
  const dom = t.articles.filter((a) => a.region === '국내');
  const fr = t.articles.filter((a) => a.region === '해외');
  box.append(el('h3', {}, t.title), el('p', { class: 'tmeta' }, '기사 ' + t.articles.length + '건 · 국내 ' + dom.length + ' · 해외 ' + fr.length + ' · ' + t.period));

  const ai = el('section', { class: 'kj-ai', 'aria-label': 'AI 요약' });
  const ah = el('p', { class: 'kj-ai__h' });
  ah.append(el('span', { class: 'kj-badge kj-badge--solid' }, 'AI 요약'), document.createTextNode('핵심만 먼저'));
  const ul = el('ul');
  t.summary.forEach((x) => ul.append(el('li', {}, x)));
  ai.append(ah, ul, el('p', { class: 'kj-ai__note' }, '아래 기사와 공식 발표를 바탕으로 AI가 정리했습니다. 원문과 다를 수 있으니 중요한 내용은 링크로 확인해 주세요.'));
  // 진행 막대가 있는 주제는 요약 오른쪽에 둔다. 좁은 화면에서는 요약 아래로 내려간다
  if (t.progress) {
    const top = el('div', { class: 'kj-themetop' });
    top.append(ai, renderProgress(t.progress));
    box.append(top);
  } else box.append(ai);

  if (t.diffs && t.diffs.length) {
    box.append(el('h4', { class: 'sub' }, '기준이 달라 갈린 숫자 ' + t.diffs.length + '건'));
    const diffs = el('div', { class: 'diffs' });
    box.append(diffs);
    t.diffs.forEach((c) => {
      const det = el('details', { class: 'kj-acc' });
      det.addEventListener('toggle', () => { if (det.open) track('split-open', c.q); });
      const sm = el('summary');
      sm.append(el('h4', {}, c.q), el('p', {}, c.a));
      const body = el('div', { class: 'kj-acc__body kj-tbl' });
      const table = el('table');
      const thead = el('thead');
      const hr = el('tr');
      c.cols.forEach((h) => hr.append(el('th', { scope: 'col' }, h)));
      thead.append(hr);
      const tb = el('tbody');
      c.rows.forEach((r) => {
        const tr = el('tr');
        r.forEach((v, i) => tr.append(el('td', { 'data-label': c.cols[i], ...(i === 0 ? { class: 'n' } : {}) }, v)));
        tb.append(tr);
      });
      table.append(thead, tb);
      body.append(table);
      det.append(sm, body);
      diffs.append(det);
    });
    collapse(diffs, { noun: '건', name: '갈린 숫자' });
  }

  box.append(el('h4', { class: 'sub' }, '언론사별 기사'));
  const links = el('div', { class: 'links' });
  [['국내', dom, ''], ['해외', fr, 'f']].forEach(([name, list, cls]) => {
    if (!list.length) return;
    const col = el('div', { class: cls });
    col.append(el('h4', {}, name + ' ' + list.length));
    const ulx = el('ul');
    list.forEach((a) => {
      const li = el('li');
      const who = el('b', {}, a.outlet);
      who.append(el('small', {}, (a.date ? a.date.slice(5).replace('-', '/') : '발표일 미확인') + (a.read ? '' : ' · 본문 미확인')));
      li.append(who, el('a', { href: a.url, target: '_blank', rel: 'noopener', lang: name === '해외' ? 'en' : 'ko' }, a.title));
      ulx.append(li);
    });
    col.append(ulx);
    links.append(col);
  });
  box.append(links);
  // 목록이 화면에 붙은 뒤 접어야 단추가 목록 바로 뒤에 들어간다
  links.querySelectorAll('ul').forEach((u) => collapse(u, { noun: '건', name: '언론사별 기사', start: true }));
}

function openDiff(id, idx) {
  setQuery('');
  showTheme(id);
  const det = $('tresult').querySelectorAll('details.kj-acc')[idx];
  if (!det) return;
  expandFor(det);
  det.open = true;
  det.scrollIntoView({ block: 'start' });
  det.querySelector('summary').focus({ preventScroll: true });
}

function setQuery(v) {
  $('tq').value = v;
  $('tclear').hidden = !v;
}

function searchTheme(q) {
  const ranked = D.themes.map((t) => ({ t, ...scoreTheme(t, q) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  // 입력한 글은 보내지 않고 어느 주제가 걸렸는지만 센다
  track('search', ranked.length ? ranked[0].t.title : '결과 없음');
  if (ranked.length) { showTheme(ranked[0].t.id); return; }
  themeId = '';
  renderThemeChips();
  const box = $('tresult');
  box.textContent = '';
  // 빈 결과: 무엇이 없는지, 대신 볼 주제, 다음 행동
  const st = el('div', { class: 'kj-state' });
  st.append(el('h4', {}, '"' + q + '"에 맞는 주제가 이 호에는 없습니다'), el('p', {}, '이 호에서 다룬 주제는 ' + D.themes.map((t) => t.title).join(' · ') + '입니다.'));
  const b = el('button', { class: 'kj-btn kj-btn--secondary kj-btn--sm', type: 'button' }, '첫 주제 보기');
  b.addEventListener('click', () => { setQuery(''); showTheme(D.themes[0].id); });
  st.append(b);
  box.append(st);
}

function renderMediaMeta() {
  const n = D.themes.reduce((s, t) => s + t.articles.length, 0);
  $('mediaMeta').textContent = '주제 ' + D.themes.length + '개 · 기사 ' + n + '건 · ' + asOfText();
}

function setupControls() {
  $('tform').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('tq').value.trim();
    if (q) searchTheme(q);
  });
  $('tq').addEventListener('input', () => { $('tclear').hidden = !$('tq').value; });
  $('tclear').addEventListener('click', () => { setQuery(''); $('tq').focus(); });
}
