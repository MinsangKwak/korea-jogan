'use strict';
// 전국 뉴스와 IT 뉴스. 같은 목록 화면에 지면별 자료만 바꿔 그린다

function itEdition() {
  if (D.it && D.it.items.length) return D.it;
  const items = D.national ? D.national.items.filter((i) => i.cat === '과학·IT') : [];
  return items.length ? { flow: [], items } : null;
}

// IT 지면에서는 목록 밖의 전국 섹션을 CSS로 감춘다. 자료가 없으면 전국 지면으로 돌아간다
function setNewsView(view) {
  const next = view === 'it' && itEdition() ? 'it' : 'national';
  if (next === newsView && document.body.dataset.view === next) return;
  newsView = next;
  natCat = '전체';
  document.body.dataset.view = next;
  document.querySelectorAll('[data-view-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewTab === next)));
  renderNational();
}

function setupNewsView() {
  const tabs = $('viewTabs');
  tabs.hidden = !itEdition();
  // 고른 지면은 이 브라우저에 기억한다. 저장소가 막혀 있으면 매번 IT 지면으로 연다
  const VIEW_KEY = 'kj-view';
  let saved = '';
  try { saved = localStorage.getItem(VIEW_KEY) || ''; } catch (error) { saved = ''; }
  tabs.querySelectorAll('[data-view-tab]').forEach((b) => b.addEventListener('click', () => {
    setNewsView(b.dataset.viewTab);
    try { localStorage.setItem(VIEW_KEY, newsView); } catch (error) { saved = ''; }
    window.scrollTo({ top: 0 });
    track('view-tab', b.dataset.viewTab);
  }));
  const inNational = (id) => {
    const target = id && document.getElementById(id);
    return Boolean(target && target.closest('main'));
  };
  // IT 지면에서 전국 지면의 섹션으로 가는 링크를 누르면 전국 지면을 먼저 연다
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link && newsView === 'it' && inNational(link.getAttribute('href').slice(1))) setNewsView('national');
  }, true);
  let hash = '';
  try { hash = decodeURIComponent(location.hash.slice(1)); } catch (error) { hash = ''; }
  setNewsView(inNational(hash) || saved === 'national' ? 'national' : 'it');
}

function renderNational() {
  const it = newsView === 'it';
  const N = it ? itEdition() : D.national;
  const order = it ? IT_CATS : NAT_CATS;
  const name = it ? 'IT' : '전국';
  if (!N) { $('national').hidden = true; return; }
  $('natH').textContent = '오늘의 ' + name + ' 뉴스';
  $('natMeta').textContent = N.items.length + '건 · ' + asOfText();
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
  // 지면을 바꾸면 분야 단추도 그 지면의 분야로 다시 만든다
  if (ctrl.dataset.view !== newsView) {
    ctrl.replaceChildren();
    ctrl.dataset.view = newsView;
  }
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
