'use strict';
// 전국 뉴스

function renderNational() {
  const N = D.national;
  if (!N) { $('national').hidden = true; return; }
  $('natMeta').textContent = N.items.length + '건 · ' + asOfText();
  const flow = $('natFlow');
  flow.textContent = '';
  flow.append(el('h4', {}, '오늘 전국 뉴스의 흐름'));
  const ol = el('ol');
  N.flow.forEach((t) => ol.append(el('li', {}, t)));
  flow.append(ol);

  const cats = ['전체'].concat(NAT_CATS.filter((c) => N.items.some((i) => i.cat === c)));
  const ctrl = $('natCtrl');
  if (!ctrl.childNodes.length) {
    cats.forEach((c) => {
      const n = c === '전체' ? N.items.length : N.items.filter((i) => i.cat === c).length;
      const b = el('button', { class: 'kj-chip', type: 'button', 'aria-pressed': String(c === natCat) }, c + ' ');
      b.append(el('span', { class: 'kj-count' }, String(n)));
      b.addEventListener('click', () => {
        natCat = c;
        $('natList').dataset.open = '';
        ctrl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        renderNational();
      });
      ctrl.append(b);
    });
  }
  const box = $('natList');
  box.textContent = '';
  let list = N.items.filter((i) => natCat === '전체' || i.cat === natCat);
  // 전체 보기에서는 분야 순서대로 정렬해 같은 분야가 모여 보이게 한다
  list = list.slice().sort((a, b) => NAT_CATS.indexOf(a.cat) - NAT_CATS.indexOf(b.cat));
  list.forEach((it) => box.append(newsItem(it, it.cat + (it.region && it.region !== '전국' ? ' · ' + it.region : ''))));
  collapse(box, { noun: '건' });
}
