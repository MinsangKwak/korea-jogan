'use strict';

window.newsCaseEdition = (() => {
  const byId = (id) => document.getElementById(id);
  const form = byId('frontCaseSearch');
  const input = byId('frontCaseQuery');
  const error = byId('frontCaseError');
  const story = byId('casePair');
  const empty = byId('casePairEmpty');
  const choices = byId('caseEditionChoices');
  const list = byId('caseEditionList');
  const dateText = (iso) => iso.replaceAll('-', '.');
  let embedded = null;
  try {
    embedded = JSON.parse(byId('news-case-data').textContent);
  } catch {
    // 인라인 자료가 비었으면 발행 호를 확인한 뒤 같은 출처의 공개 자료를 읽는다.
  }
  let records = embedded?.pairs || [];
  let visible = [];
  let fullEdition;
  let revision = 0;

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
    if (text) {
      input.setAttribute('aria-describedby', error.id);
    } else {
      input.removeAttribute('aria-describedby');
      input.removeAttribute('aria-invalid');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query.length < 2) {
      input.setAttribute('aria-invalid', 'true');
      showError('두 글자 이상의 키워드나 사건번호를 입력해 주세요.');
      input.focus();
      return;
    }
    try {
      sessionStorage.setItem('jg:law-search-once', query);
    } catch {
      showError('이 브라우저에서는 검색어를 넘길 수 없습니다. 자료실 전체에서 검색해 주세요.');
      return;
    }
    input.value = '';
    showError('');
    form.dispatchEvent(new Event('jogan:law-search-open', { bubbles: true }));
    location.assign('/law/');
  });
  input.addEventListener('input', () => { if (!error.hidden) showError(''); });
  form.hidden = false;

  function showEmpty(text) {
    story.hidden = true;
    choices.hidden = true;
    empty.textContent = text;
    empty.hidden = false;
  }

  function select(id) {
    const entry = visible.find((item) => item.id === id);
    if (!entry) return false;
    const article = byId('casePairArticle');
    const ruling = byId('casePairRuling');
    const search = byId('casePairSearch');
    story.dataset.issueDate = entry.issueDate;
    byId('casePairDate').textContent = dateText(entry.issueDate) + ' 기사와 함께 읽는 판례';
    byId('casePairQuestion').textContent = entry.question;
    byId('casePairContext').textContent = entry.context;
    const href = safeSourceHref(entry.articleUrl);
    if (href) article.href = href;
    else article.removeAttribute('href');
    article.querySelector('span').textContent = href ? '기사 원문' : '기사 원문 주소 미확인';
    article.querySelector('strong').textContent = entry.articleTitle;
    if (Number.isSafeInteger(entry.caseId) && entry.caseId > 0) {
      ruling.href = 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=' + entry.caseId;
    } else {
      ruling.removeAttribute('href');
    }
    ruling.querySelector('span').textContent = '대법원 · ' + dateText(entry.caseDate) + '.';
    ruling.querySelector('strong').textContent = entry.caseNumber + ' · ' + entry.caseTitle;
    search.href = '/law/?' + new URLSearchParams({ theme: entry.theme, q: entry.keyword });
    search.textContent = '‘' + entry.keyword + '’ 관련 판례 더 찾기 →';
    list.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.pairId === entry.id)));
    empty.hidden = true;
    story.hidden = false;
    return true;
  }

  function renderChoices() {
    list.replaceChildren(...visible.map((entry) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const date = document.createElement('time');
      date.dateTime = entry.issueDate;
      date.textContent = dateText(entry.issueDate);
      button.type = 'button';
      button.dataset.pairId = entry.id;
      button.append(date, document.createTextNode(entry.question));
      button.addEventListener('click', () => {
        select(entry.id);
        choices.open = false;
        byId('casePairQuestion').focus();
      });
      item.append(button);
      return item;
    }));
    choices.hidden = visible.length < 2;
  }

  async function showIssue(date, published) {
    const request = ++revision;
    const embeddedDate = document.querySelector('meta[name="kj-date"]')?.content || INDEX.latest;
    if (!embedded || date !== embeddedDate) {
      showEmpty('이 호의 기사와 판례를 불러오고 있습니다.');
      try {
        fullEdition ??= fetchJSON('/data/news-case-pairs.json');
        const data = await fullEdition;
        if (request !== revision) return;
        records = data.pairs;
      } catch {
        if (request !== revision) return;
        fullEdition = null;
        showEmpty('이 호의 기사와 판례를 불러오지 못했습니다. 판례 검색은 이용할 수 있습니다.');
        return;
      }
    } else {
      records = embedded.pairs;
    }
    visible = records.filter((entry) => entry.issueDate <= date && published.includes(entry.issueDate))
      .sort((left, right) => right.issueDate.localeCompare(left.issueDate)).slice(0, 3);
    if (!visible.length) {
      showEmpty('이 호까지 연결된 기사·판례가 없습니다. 검색에서 원하는 판례를 찾아보세요.');
      return;
    }
    renderChoices();
    const requested = new URLSearchParams(location.search).get('pair');
    if (!select(requested)) select(visible[0].id);
    window.dispatchEvent(new Event('news-case-ready'));
  }

  function find(articleUrl, issueDate) {
    return records.find((entry) => entry.articleUrl === articleUrl && entry.issueDate === issueDate);
  }

  return { showIssue, select, find };
})();
