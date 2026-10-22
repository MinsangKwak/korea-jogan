'use strict';
// 산업: 주력산업과 수출입

function renderIndustry() {
  const T = D.trade;
  $('tradeIntro').textContent = T.intro;
  T.stats.forEach((s) => {
    const d = el('div');
    const dir = el('div', { class: 'd' });
    dir.append(el('span', { class: 'kj-dir kj-dir--' + s.dir, 'aria-label': DIR_LABEL[s.dir] + ' ' + s.d }, s.d));
    d.append(el('div', { class: 'k' }, s.k), el('div', { class: 'v' }, s.v), dir);
    $('tradeStats').append(d);
  });
  $('tradeSrc').textContent = '출처: ' + T.src;
  $('octNote').append(el('h4', {}, T.oct.q), el('p', {}, T.oct.a));

  const max = Math.max(...D.items.map((i) => i.v));
  D.items.forEach((it) => {
    const r = el('li', { class: 'kj-bar' + (BAR_CLASS[it.c] || '') });
    const tr = el('span', { class: 'kj-bar__tr' });
    const b = el('span', { class: 'kj-bar__b' });
    b.style.width = (it.v / max * 100) + '%';
    tr.append(b);
    const v = el('span', { class: 'kj-bar__v' });
    v.append(el('b', {}, (it.approx ? '약 ' : '') + it.v + '억$'), document.createTextNode(' ' + it.y));
    r.append(el('span', { class: 'kj-bar__lab' }, it.k), tr, v);
    $('bars').append(r);
  });

  D.industries.forEach((d) => {
    const a = el('article', { class: 'kj-panel kj-panel--hl' });
    a.append(el('h3', {}, d.name), el('p', { class: 'sum' }, d.sum));
    const ul = el('ul', { class: 'kj-kv' });
    kvRows(ul, d.f.map(([k, v, m]) => ({ k, v, m })));
    const p = el('p', { class: 'news' });
    p.append(document.createTextNode('관련 기사 · ' + d.news[0] + ' '));
    p.append(el('a', { href: d.news[2], target: '_blank', rel: 'noopener' }, d.news[1]));
    a.append(ul, p);
    $('inds').append(a);
  });
  collapse($('inds'), { noun: '개 산업', name: '주력산업' });
}
