'use strict';
// 여러 컴포넌트가 함께 쓰는 DOM 조각: 요소 생성, 목록 접기, 아이콘, 출처, 뉴스 항목

function el(tag, attrs, text) {
  const n = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
  if (text !== undefined) n.textContent = text;
  return n;
}

// 목록 항목이 COLLAPSE_AT개를 넘으면 앞의 몇 개만 보이고, 목록 바로 뒤 '더보기' 단추로 펼친다
// 같은 목록을 다시 그린 뒤 또 불러도 된다. 펼침 상태는 목록의 data-open에 남는다
const COLLAPSE_AT = 3;
let collapseSeq = 0;
function collapse(list, opts = {}) {
  const limit = opts.limit || COLLAPSE_AT;
  const items = Array.from(list.children);
  let bar = list.nextElementSibling && list.nextElementSibling.classList.contains('kj-more') ? list.nextElementSibling : null;
  if (items.length <= limit) {
    items.forEach((x) => { x.hidden = false; });
    if (bar) bar.remove();
    return;
  }
  if (!list.id) list.id = 'cl' + (++collapseSeq);
  if (!bar) {
    bar = el('div', { class: 'kj-more' + (opts.start ? ' kj-more--start' : '') });
    const btn = el('button', { class: 'kj-btn kj-btn--secondary', type: 'button', 'aria-controls': list.id });
    btn.addEventListener('click', () => {
      const open = list.dataset.open !== '1';
      list.dataset.open = open ? '1' : '';
      applyCollapse(list, bar, limit, opts.noun || '건');
      track('more', (opts.name || list.id) + (open ? ' 펼침' : ' 접음'));
      // 접을 때 목록 머리가 화면 위로 지나갔으면 목록 처음으로 돌아간다
      if (!open && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: 'start' });
    });
    bar.append(btn);
    list.after(bar);
  }
  applyCollapse(list, bar, limit, opts.noun || '건');
}

function applyCollapse(list, bar, limit, noun) {
  const open = list.dataset.open === '1';
  const items = Array.from(list.children);
  items.forEach((x, i) => { x.hidden = !open && i >= limit; });
  const btn = bar.querySelector('button');
  btn.textContent = '';
  btn.append(document.createTextNode(open ? '접기' : '더보기 (' + (items.length - limit) + noun + ')'), svgIcon('M6 9l6 6 6-6'));
  btn.setAttribute('aria-expanded', String(open));
}

// 접힌 목록 안의 항목으로 바로 가야 할 때(전체 메뉴, 홈 카드) 그 목록을 펼친다
function expandFor(item) {
  const list = item.parentElement;
  if (!item.hidden || !list) return;
  const bar = list.nextElementSibling;
  if (bar && bar.classList.contains('kj-more')) bar.querySelector('button').click();
}

function svgIcon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

// 이름 · 기준 · 값 목록(kj-kv)
function kvRows(ul, rows) {
  rows.forEach((r) => {
    const li = el('li');
    li.append(el('span', { class: 'k' }, r.k));
    if (r.m) li.append(el('span', { class: 'm' }, r.m));
    li.append(el('span', { class: 'v' }, r.v));
    ul.append(li);
  });
}

// 오류 신고는 GitHub 이슈 양식으로 연다. 호 날짜와 위치를 미리 채운다
function reportUrl(where) {
  const q = new URLSearchParams({ template: 'correction.yml', title: ('[오류] ' + D.date + ' ' + where).trim(), issue: D.date });
  if (where) q.set('where', where);
  return REPO + '/issues/new?' + q.toString();
}

// 출처는 네이티브 details로 접어 두고 누르면 펼친다
function srcDisclosure(s, where) {
  const det = el('details', { class: 'kj-src' });
  det.append(el('summary', {}, '출처 · ' + s.name.split(' ')[0]));
  const panel = el('div', { class: 'kj-src__panel' });
  const dl = el('dl');
  [['기관', s.name], ['확인 자료', s.title], ['발표일', s.pub], ['기준', s.base]].forEach(([a, b]) => dl.append(el('dt', {}, a), el('dd', {}, b || '미확인')));
  dl.append(el('dt', {}, '링크'));
  const dd = el('dd');
  dd.append(el('a', { href: s.url, target: '_blank', rel: 'noopener' }, '원문 열기'));
  dl.append(dd);
  panel.append(dl);
  if (where) {
    const rep = el('a', { class: 'report', href: reportUrl(where), target: '_blank', rel: 'noopener' }, '이 숫자 오류 신고');
    rep.addEventListener('click', () => track('report', where));
    panel.append(rep);
  }
  det.append(panel);
  det.addEventListener('toggle', () => { if (det.open) track('src-open', s.name); });
  return det;
}

function gradeBadge(g) {
  const s = el('span', { class: 'kj-grade kj-grade--' + String(g).toLowerCase(), title: '출처 신뢰도 ' + g });
  s.append(el('b', {}, g), document.createTextNode('신뢰도'));
  return s;
}

function newsItem(it, label) {
  const a = el('article', { class: 'kj-newscard' });
  const cat = el('span', { class: 'kj-newscard__cat' }, label);
  if (!it.body_read) cat.append(el('span', { class: 'kj-badge kj-badge--muted' }, '본문 미확인'));
  a.append(cat);
  const h = el('h3');
  h.append(el('a', { href: it.url, target: '_blank', rel: 'noopener' }, it.title));
  a.append(h, el('p', {}, it.summary));
  if (it.figures && it.figures.length) {
    const f = el('ul', { class: 'kj-figs', 'aria-label': '기사 속 수치' });
    it.figures.forEach((x) => f.append(el('li', {}, x)));
    a.append(f);
  }
  const src = el('div', { class: 'kj-newscard__src' });
  src.append(el('span', {}, it.outlet + ' · ' + it.date.slice(5).replace('-', '/')));
  if (it.figure_source) src.append(el('span', {}, '수치 출처 ' + it.figure_source));
  a.append(src);
  return a;
}
