'use strict';
// 산업: 주력산업과 수출입

function renderIndustry() {
  const T = D.trade;
  responsiveDisclosure($('industryChart'));
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
    v.append(el('b', {}, (it.approx ? '약 ' : '') + it.v + '억$'), el('span', { class: 'kj-bar__change' }, ' ' + it.y));
    r.append(el('span', { class: 'kj-bar__lab' }, it.k), tr, v);
    $('bars').append(r);
  });

  renderIndustryChoices(D.industries);
}

function renderIndustryChoices(industries) {
  if (!industries.length) return;
  const list = $('inds');
  const intro = el('header', { class: 'industry-choices__head' });
  intro.append(el('h3', { id: 'industryChoicesTitle' }, '주요 산업 한눈에 보기'), el('p', {}, '산업을 고르면 요약과 수치의 출처를 볼 수 있습니다.'));
  list.before(intro);
  list.setAttribute('role', 'group');
  list.setAttribute('aria-labelledby', 'industryChoicesTitle');

  const detail = el('section', { id: 'industryDetail', class: 'industry-detail', 'aria-labelledby': 'industryDetailTitle', hidden: '' });
  const title = el('h4', { id: 'industryDetailTitle', tabindex: '-1' });
  const close = el('button', { class: 'industry-detail__close kj-btn kj-btn--secondary', type: 'button' }, '닫기');
  const head = el('header', { class: 'industry-detail__head' });
  const body = el('div', { class: 'industry-detail__body' });
  head.append(title, close);
  detail.append(head, body);
  list.after(detail);

  let active = null;
  function reset() {
    if (!active) return;
    active.setAttribute('aria-expanded', 'false');
    active.querySelector('.industry-choice__action-text').textContent = '자세히 보기';
    detail.hidden = true;
    body.replaceChildren();
    active.focus({ preventScroll: true });
    active.scrollIntoView({ block: 'nearest' });
    active = null;
  }
  close.addEventListener('click', reset);

  industries.forEach((industry) => {
    const tile = el('article', { class: 'industry-choice' });
    const button = el('button', { class: 'industry-choice__button', type: 'button', 'aria-expanded': 'false', 'aria-controls': detail.id });
    const [label, value] = industry.f[0] || ['대표 지표', '자료 없음'];
    const name = el('span', { class: 'industry-choice__name' }, industry.name);
    const qualifier = /^(.*?)(\s+)(\([^()]+\))$/.exec(industry.name);
    if (qualifier) name.replaceChildren(document.createTextNode(qualifier[1] + qualifier[2]), el('small', {}, qualifier[3]));
    const action = el('span', { class: 'industry-choice__action' });
    const actionText = el('span', { class: 'industry-choice__action-text' }, '자세히 보기');
    action.append(actionText, svgIcon('M6 9l6 6 6-6'));
    button.append(name, el('span', { class: 'industry-choice__label' }, label), el('strong', { class: 'industry-choice__value' }, value), action);
    tile.append(button);
    list.append(tile);

    button.addEventListener('click', () => {
      if (active === button) { reset(); return; }
      if (active) {
        active.setAttribute('aria-expanded', 'false');
        active.querySelector('.industry-choice__action-text').textContent = '자세히 보기';
      }
      active = button;
      button.setAttribute('aria-expanded', 'true');
      actionText.textContent = '접기';
      title.textContent = industry.name + ' 상세';
      body.replaceChildren(industryDetailContent(industry));
      detail.hidden = false;
      title.focus({ preventScroll: true });
      const bounds = title.getBoundingClientRect();
      const clearance = parseFloat(getComputedStyle(title).scrollMarginBlockStart) || 0;
      if (bounds.top < clearance || bounds.bottom > innerHeight - clearance) title.scrollIntoView({ block: 'start' });
    });
  });
}

function industryDetailContent(industry) {
  const content = document.createDocumentFragment();
  const facts = el('ul', { class: 'industry-detail__facts', 'aria-label': industry.name + ' 수치와 출처' });
  industry.f.forEach(([label, value, source]) => {
    const row = el('li');
    row.append(el('span', { class: 'industry-detail__label' }, label), el('strong', { class: 'industry-detail__value' }, value), el('span', { class: 'industry-detail__source' }, source));
    facts.append(row);
  });
  const related = el('p', { class: 'industry-detail__article' });
  related.append(el('b', {}, '관련 기사'), el('span', {}, industry.news[0]), el('a', { href: industry.news[2], target: '_blank', rel: 'noopener' }, industry.news[1]));
  content.append(readingText(industry.sum, 'industry-detail__summary'), facts, related);
  return content;
}
