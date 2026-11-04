'use strict';
// 전국 뉴스

function renderNational() {
  const N = D.national;
  if (!N) { $('national').hidden = true; return; }
  $('natMeta').textContent = N.items.length + '건 · ' + asOfText();
  const flow = $('natFlow');
  flow.textContent = '';
  flow.append(el('summary', {}, '오늘의 흐름 ' + N.flow.length + '가지'));
  const ol = el('ol');
  N.flow.forEach((t) => ol.append(el('li', {}, t)));
  flow.append(ol);
  responsiveDisclosure(flow);

  const cats = ['전체'].concat(NAT_CATS.filter((c) => N.items.some((i) => i.cat === c)));
  const ctrl = $('natCtrl');
  if (!ctrl.childNodes.length) {
    cats.forEach((c) => {
      const n = c === '전체' ? N.items.length : N.items.filter((i) => i.cat === c).length;
      const b = el('button', { class: 'kj-chip', type: 'button', 'aria-pressed': String(c === natCat) }, c + ' ');
      b.append(el('span', { class: 'kj-count' }, String(n)));
      b.addEventListener('click', () => {
        if (natCat === c) return;
        natCat = c;
        ctrl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        renderNational();
      });
      ctrl.append(b);
    });
  }
  const box = $('natList');
  const sorted = N.items.filter((i) => natCat === '전체' || i.cat === natCat)
    .sort((a, b) => NAT_CATS.indexOf(a.cat) - NAT_CATS.indexOf(b.cat));
  // 전체 지면에서는 한 분야가 첫 목록을 채우지 않도록 분야별 첫 기사를 앞에 둔다
  const seen = new Set();
  const leadItems = [];
  const remaining = [];
  sorted.forEach((item) => {
    (seen.has(item.cat) ? remaining : leadItems).push(item);
    seen.add(item.cat);
  });
  const list = leadItems.concat(remaining);
  clearReadingPair(box);
  box.replaceChildren();
  box.classList.toggle('nat-board--single', list.length < 2);
  if (!list.length) {
    box.append(el('p', {}, '이 분야에 표시할 뉴스가 없습니다.'));
    return;
  }

  const reading = el('div', { id: 'natArticle', class: 'nat-reading' });
  const headlines = el('ul', { id: 'natHeadlines', class: 'nat-headlines' });
  const buttons = [];
  const select = (index, move = false) => {
    const item = list[index];
    const label = item.cat + (item.region && item.region !== '전국' ? ' · ' + item.region : '');
    const article = newsItem(item, label);
    const title = article.querySelector('h3');
    title.id = 'natArticleTitle';
    title.tabIndex = -1;
    article.setAttribute('aria-labelledby', title.id);
    const link = title.querySelector('a');
    title.textContent = link.textContent;
    link.className = 'nat-original';
    link.textContent = '기사 원문 보기';
    link.setAttribute('aria-label', item.title + ' 기사 원문 보기');
    link.append(svgIcon('M13 5h6v6M19 5l-9 9M11 5H5v14h14v-6'));
    article.append(link);
    reading.replaceChildren(article);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    if (move) {
      if (reading.parentElement.classList.contains('paired-pane')) reading.parentElement.scrollTop = 0;
      title.focus({ preventScroll: true });
      reading.scrollIntoView({ block: 'start' });
    }
  };

  box.append(reading);
  if (list.length > 1) {
    const chooser = el('section', { class: 'nat-chooser', 'aria-labelledby': 'natChooserTitle' });
    chooser.append(el('h3', { id: 'natChooserTitle' }, '기사 골라 읽기'), headlines);
    box.append(chooser);
    list.forEach((item, index) => {
      const row = el('li');
      const button = el('button', { class: 'nat-headline', type: 'button', 'aria-controls': reading.id, 'aria-pressed': 'false' });
      const meta = el('span', { class: 'nat-headline__meta' });
      meta.append(el('span', {}, item.cat + ' · ' + item.outlet), el('span', { class: 'nat-headline__state', 'aria-hidden': 'true' }, '읽는 중'));
      button.append(meta, el('strong', {}, item.title));
      button.addEventListener('click', () => select(index, true));
      buttons.push(button);
      row.append(button);
      headlines.append(row);
    });
    collapse(headlines, { limit: 5, noun: '건', start: true });
  }
  select(0);
  matchReadingColumns(box, 1000, ['선택한 전국 기사', '전국 기사 제목 목록']);
}
