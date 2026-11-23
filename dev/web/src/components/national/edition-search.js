'use strict';

function setupEditionSearch(issueDate) {
  const panel = $('editionSearch');
  const dateSelect = $('editionSearchDate');
  const query = $('editionSearchQuery');
  const status = $('editionSearchStatus');
  const retry = $('editionSearchRetry');
  const list = $('editionSearchList');
  const editionPage = $('editionSearchPage');
  const base = '/api/v1/';
  let articles = [];
  let initialized = false;
  let request = 0;

  function showResults() {
    const term = query.value.trim().normalize('NFC').toLocaleLowerCase('ko');
    const results = articles.filter((article) => [article.title, article.outlet, article.region]
      .some((value) => value && value.normalize('NFC').toLocaleLowerCase('ko').includes(term)));
    list.replaceChildren();
    list.dataset.open = '';
    for (const article of results) {
      const row = el('li');
      const meta = [article.region || '전국', article.outlet];
      if (article.date) meta.push('보도일 ' + article.date);
      const headline = /^https?:\/\//i.test(article.url) ? el('a', { href: article.url }, article.title) : el('span', {}, article.title);
      row.append(el('small', {}, meta.join(' · ')), headline);
      list.append(row);
    }
    status.textContent = results.length ? dateSelect.value + '호 · ' + results.length + '건' : '이 날짜에 조건과 일치하는 기사가 없습니다.';
    collapse(list, { limit: 6, noun: '건', name: '날짜별 기사' });
  }

  async function load() {
    const current = ++request;
    status.textContent = '기사 목록을 불러오는 중입니다.';
    retry.hidden = true;
    query.disabled = true;
    articles = [];
    list.replaceChildren();
    collapse(list);
    try {
      if (!dateSelect.options.length) {
        const index = await fetchJSON(base + 'index.json');
        if (index.version !== 1 || !Array.isArray(index.editions) || !index.editions.some((row) => row.date === index.latest)) throw new Error('기사 색인 오류');
        for (const edition of index.editions) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(edition.date)) throw new Error('기사 날짜 오류');
        }
        dateSelect.replaceChildren(...index.editions.map((edition) => el('option', { value: edition.date }, edition.status === 'prototype' ? edition.date + ' (시범호)' : edition.date)));
        dateSelect.value = index.editions.some((row) => row.date === issueDate) ? issueDate : index.latest;
        dateSelect.disabled = false;
      }
      const date = dateSelect.value;
      editionPage.href = '/' + date;
      editionPage.textContent = date + ' 조간 전체 보기';
      const edition = await fetchJSON(base + 'editions/' + date + '.json');
      if (current !== request) return;
      if (edition.version !== 1 || edition.date !== date || !Array.isArray(edition.articles)) throw new Error('기사 목록 오류');
      articles = edition.articles;
      query.disabled = false;
      showResults();
    } catch {
      if (current !== request) return;
      status.textContent = '기사 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      retry.hidden = false;
    }
  }

  panel.addEventListener('toggle', () => {
    if (panel.open && !initialized) {
      initialized = true;
      load();
    }
  });
  dateSelect.addEventListener('change', load);
  query.addEventListener('input', showResults);
  retry.addEventListener('click', load);
  panel.hidden = false;
}
