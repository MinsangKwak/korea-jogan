'use strict';
// 전국 뉴스와 IT 뉴스. 같은 목록 화면에 지면별 자료만 바꿔 그린다

function itEdition() {
  if (D.it && D.it.items.length) return D.it;
  const items = D.national ? D.national.items.filter((i) => i.cat === '과학·IT') : [];
  return items.length ? { flow: [], items } : null;
}

function setNewsView(view) {
  if (document.body.dataset.view === view) return;
  newsView = view;
  natCat = '전체';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view-tab]').forEach((link) => {
    if (link.dataset.viewTab === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  renderNational();
}

function setupNewsView() {
  let initial = itEdition() ? 'it' : 'national';
  try { if (localStorage.getItem('kj-view') === 'national') initial = 'national'; } catch {}

  function destination(hash) {
    if (hash === '#itBriefing') return 'it';
    const target = document.getElementById(hash.slice(1));
    if (hash === '#natChooserTitle' || hash === '#natArticleTitle') return null;
    if (target?.closest('main > section, main > aside:not([data-reader-tools]), main > .tracking-bar')) return 'national';
    return null;
  }
  function syncLocation(event) {
    const view = destination(location.hash) || history.state?.joganView || (event ? newsView : initial);
    setNewsView(view);
    history.replaceState({ ...history.state, joganView: view }, '');
  }
  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const next = destination(link.hash);
    if (!next) return;
    setNewsView(next);
    if (link.dataset.viewTab) {
      try { localStorage.setItem('kj-view', next); } catch {}
      track('view-tab', next);
    }
  }, true);
  window.addEventListener('hashchange', syncLocation);
  syncLocation();
}

function renderNational() {
  const it = newsView === 'it';
  const N = it ? itEdition() : D.national;
  const order = it ? IT_CATS : NAT_CATS;
  const name = it ? 'IT' : '전국';
  const heading = $('natH');
  const tag = it ? 'h1' : 'h2';
  if (heading.localName !== tag) heading.replaceWith(el(tag, { id: 'natH' }));
  $('natH').textContent = it ? 'IT 브리핑' : '오늘의 전국 뉴스';
  $('national').hidden = false;
  $('natFlow').hidden = !N?.flow?.length;
  if (!N) {
    $('natMeta').textContent = '수록 기사 0건';
    $('natCategory').closest('.nat-mobile-tools').hidden = true;
    $('natCtrl').replaceChildren();
    delete $('natCtrl').dataset.view;
    clearReadingPair($('natList'));
    const empty = el('p', { class: 'nat-empty' }, '이 호에는 ' + name + ' 기사가 없습니다. ');
    empty.append(el('a', { href: it ? '#home' : '/archive/' }, it ? '종합 뉴스 읽기' : '지난 호 보기'));
    $('natList').replaceChildren(empty);
    return;
  }
  $('natCategory').closest('.nat-mobile-tools').hidden = false;
  const categoryCount = new Set(N.items.map((item) => item.cat)).size;
  $('natMeta').textContent = N.items.length + '건 · ' + (it ? categoryCount + '개 분야' : asOfText());
  const flow = $('natFlow');
  flow.hidden = !N.flow.length;
  flow.textContent = '';
  flow.append(el('summary', {}, '오늘의 흐름 ' + N.flow.length + '가지'));
  const ol = el('ol');
  N.flow.forEach((t) => ol.append(el('li', {}, t)));
  flow.append(ol);
  responsiveDisclosure(flow);

  const cats = ['전체'].concat(order.filter((c) => N.items.some((i) => i.cat === c)));
  const ctrl = $('natCtrl');
  const selectCategory = (category) => {
    if (natCat === category) return;
    natCat = category;
    renderNational();
  };
  const mobileCategory = $('natCategory');
  // 지면을 바꾸면 분야 단추도 그 지면의 분야로 다시 만든다
  if (ctrl.dataset.view !== newsView) {
    ctrl.replaceChildren();
    mobileCategory.replaceChildren();
    ctrl.dataset.view = newsView;
  }
  if (!ctrl.childNodes.length) {
    cats.forEach((c) => {
      const n = c === '전체' ? N.items.length : N.items.filter((i) => i.cat === c).length;
      const b = el('button', { class: 'kj-chip', type: 'button', 'aria-pressed': String(c === natCat) }, c + ' ');
      b.append(el('span', { class: 'kj-count' }, String(n)));
      b.dataset.category = c;
      b.addEventListener('click', () => selectCategory(c));
      mobileCategory.append(el('option', { value: c }, c + ' · ' + n + '건'));
      ctrl.append(b);
    });
  }
  ctrl.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.category === natCat)));
  mobileCategory.value = natCat;
  mobileCategory.onchange = () => selectCategory(mobileCategory.value);
  const box = $('natList');
  const sorted = N.items.filter((i) => natCat === '전체' || i.cat === natCat)
    .sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
  // 전체 지면에서는 한 분야가 첫 목록을 채우지 않도록 분야별 첫 기사를 앞에 둔다
  const seen = new Set();
  const leadItems = [];
  const remaining = [];
  sorted.forEach((item) => {
    (seen.has(item.cat) ? remaining : leadItems).push(item);
    seen.add(item.cat);
  });
  const list = leadItems.concat(remaining);
  $('natJump').hidden = list.length < 2;
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
    if (link) {
      title.textContent = item.title;
      link.className = 'nat-original';
      link.textContent = '기사 원문 보기';
      link.setAttribute('aria-label', item.title + ' 기사 원문 보기');
      link.append(svgIcon('M13 5h6v6M19 5l-9 9M11 5H5v14h14v-6'));
      article.append(link);
    }
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
    chooser.append(el('h3', { id: 'natChooserTitle', tabindex: '-1' }, '기사 골라 읽기'), headlines);
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
  matchReadingColumns(box, 1000, ['선택한 ' + name + ' 기사', name + ' 기사 제목 목록']);
}

// 다른 날짜로 여는 예전 주소에도 그 호의 정적 지면과 같은 자료를 쓴다
async function showEditionWeather(issue) {
  const issueDate = issue.date;
  const section = $('weatherSpread');
  if (!section) return;
  if (section.dataset.issueDate === issueDate) {
    section.hidden = !section.querySelector('.weather-spread__source[href]');
    return;
  }
  section.hidden = true;
  const editions = await fetchJSON('data/edition-weather.json');
  const report = editions[issueDate];
  if (!report || !issue.national?.items?.some((item) => item.url === report.url)) return;

  const url = safeSourceHref(report.url);
  if (!url) return;
  const field = (name) => section.querySelector('.weather-spread__' + name);
  const date = el('time', { datetime: issueDate }, longDate(issueDate) + '호');
  field('meta').replaceChildren(date, report.region ? ' · ' + report.region : '');
  field('summary').textContent = report.headline;
  field('facts').replaceChildren(...report.facts.map((fact) => el('li', {}, fact)));
  const source = field('source');
  source.href = url;
  const sourceDate = el('time', { datetime: report.sourceDate }, longDate(report.sourceDate) + ' 보도');
  source.replaceChildren(report.outlet + ' 원문 · ', sourceDate);
  section.dataset.issueDate = issueDate;
  section.hidden = false;
}
