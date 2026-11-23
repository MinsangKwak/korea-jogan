import { themes, themeIds, isThemeId, searchCases, parseCases, officialCaseUrl, extractSituation, createMemo } from './search-core.js';
import { renderLibrary, createSaveButton } from './library.js';
import { renderTopics } from './topics.js';
import { issues } from './topics-data.js';
import { element, link } from './reading-dom.js';

const byId = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pageSize = 8;
const cache = new Map();
const keywordPicks = ['전세보증금 반환', '퇴직금', '개인정보 유출', '상속포기'];
let theme = isThemeId(params.get('theme')) ? params.get('theme') : 'all';
const incomingQuery = takeSearchFromFrontPage();
let query = (params.get('q') || incomingQuery).trim().slice(0, 8000);
let topic = '전체';
let page = 1;
let revision = 0;
let results = [];
let highlightTerms = [];

function takeSearchFromFrontPage() {
  try {
    const key = 'jg:law-search-once';
    const value = sessionStorage.getItem(key);
    if (value !== null) sessionStorage.removeItem(key);
    return location.search ? '' : (value || '');
  } catch {
    return '';
  }
}

let editionRequest;
function newsByCase() {
  if (!editionRequest) {
    editionRequest = fetch('/data/news-case-pairs.json')
      .then(response => {
        if (!response.ok) throw new Error('기사 목록을 불러오지 못했습니다.');
        return response.json();
      })
      .then(({ pairs }) => {
        const grouped = new Map();
        for (const pair of pairs) {
          if (!Number.isSafeInteger(pair.caseId) || !/^\d{4}-\d{2}-\d{2}$/.test(pair.issueDate) || !pair.id || !pair.articleTitle) continue;
          if (!grouped.has(pair.caseId)) grouped.set(pair.caseId, []);
          grouped.get(pair.caseId).push(pair);
        }
        return grouped;
      })
      .catch(() => {
        editionRequest = undefined;
        return new Map();
      });
  }
  return editionRequest;
}

function addNewsLinks(row, caseId) {
  newsByCase().then(grouped => {
    const matches = grouped.get(caseId);
    if (!row.isConnected || !matches) return;
    const links = element('div', 'desk-related-news');
    links.append(element('strong', '', '이 판례와 함께 읽는 기사'));
    for (const pair of matches) {
      const article = link(pair.articleTitle, '/' + pair.issueDate + '?pair=' + encodeURIComponent(pair.id) + '#caseEdition');
      links.append(element('time', '', pair.issueDate.replaceAll('-', '.')), article);
    }
    row.append(links);
  });
}

function button(text, action, className) {
  const item = element('button', className, text);
  item.type = 'button';
  item.addEventListener('click', action);
  return item;
}

function pressState(item, pressed) {
  item.setAttribute('aria-pressed', String(pressed));
  return item;
}

function headingFocus() {
  byId('lawResultTitle').focus();
}

function clearError() {
  byId('lawError').hidden = true;
  byId('lawQuery').removeAttribute('aria-invalid');
  byId('lawQuery').setAttribute('aria-describedby', 'lawHelp');
}

function setQuery(value, moveFocus) {
  clearError();
  byId('lawQuery').value = value;
  if (value.trim().length < 2) {
    const error = byId('lawError');
    error.textContent = '두 글자 이상의 키워드나 사건번호를 입력해 주세요.';
    error.hidden = false;
    byId('lawQuery').setAttribute('aria-invalid', 'true');
    byId('lawQuery').setAttribute('aria-describedby', 'lawHelp lawError');
    byId('lawQuery').focus();
    return;
  }
  query = value.trim();
  topic = '전체';
  clearSharedQuery();
  refresh(moveFocus);
}

function clearSharedQuery() {
  if (!location.search) return;
  const url = new URL(location.href);
  url.searchParams.delete('q');
  if (theme === 'all') url.searchParams.delete('theme');
  else url.searchParams.set('theme', theme);
  history.replaceState(null, '', url);
}

function selectTheme(id) {
  theme = id;
  topic = '전체';
  clearError();
  clearSharedQuery();
  refresh(false);
}

function themeControls() {
  const items = [['all', '전체 분야'], ...themeIds.map(id => [id, themes[id].label])];
  const groups = new Map();
  const options = byId('lawTheme');
  for (const [id, label] of items) {
    options.add(new Option(label, id));
    const key = themes[id]?.group || '';
    if (!groups.has(key)) {
      const group = element('div');
      if (key) group.append(element('h3', '', key));
      groups.set(key, group);
      byId('lawThemeList').append(group);
    }
    const control = button(label, () => selectTheme(id));
    control.dataset.themeId = id;
    groups.get(key).append(control);
  }
  options.addEventListener('change', () => selectTheme(options.value));
}

function reflectTheme() {
  const config = themes[theme];
  byId('lawTheme').value = theme;
  for (const control of byId('lawThemeList').querySelectorAll('button')) {
    pressState(control, control.dataset.themeId === theme);
  }
  byId('lawKeywords').replaceChildren(...(config?.keywords || keywordPicks).map(
    word => button(word, () => setQuery(word, true)),
  ));
  const filter = byId('lawTopics');
  filter.hidden = !config;
  if (!config) return;
  const controls = ['전체', ...Object.keys(config.topics)].map(name => {
    const control = button(name, () => {
      topic = name;
      refresh(false);
      byId('lawTopics').querySelector('[aria-pressed="true"]')?.focus();
    });
    return pressState(control, topic === name);
  });
  filter.replaceChildren(...controls);
}

async function loadTheme(id) {
  if (!cache.has(id)) {
    const load = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(new URL('./data/' + themes[id].file, import.meta.url), { signal: controller.signal });
        if (!response.ok) throw new Error('판례 자료 응답 실패');
        return parseCases(await response.json(), id).map(record => ({ ...record, theme: id }));
      } finally {
        clearTimeout(timer);
      }
    };
    cache.set(id, load().catch(error => { cache.delete(id); throw error; }));
  }
  return cache.get(id);
}

function summaryExcerpt(text) {
  const excerpt = element('p');
  if (!highlightTerms.length) {
    excerpt.textContent = text;
    return excerpt;
  }
  const pattern = new RegExp(highlightTerms.join('|'), 'giu');
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    excerpt.append(text.slice(offset, match.index), element('mark', '', match[0]));
    offset = match.index + match[0].length;
  }
  excerpt.append(text.slice(offset));
  return excerpt;
}

function downloadMemo() {
  const file = new Blob(['\uFEFF', createMemo(query, results)], { type: 'text/plain;charset=utf-8' });
  const href = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = '조간-판례-검색메모.txt';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function recordRow(record) {
  const row = element('li', 'desk-record');
  const head = element('div', 'desk-record-header');
  const info = element('div');
  info.append(element('p', 'desk-meta', [themes[record.theme].label, record.court, record.date.replace(/-/g, '.'), record.number].join(' · ')));
  const title = element('h3');
  const source = link(record.title, officialCaseUrl(record));
  source.setAttribute('aria-label', record.title + ' 공식 판례 원문 · ' + record.number);
  source.rel = 'noreferrer';
  source.append(element('span', 'desk-source-label', '원문 보기'));
  title.append(source);
  info.append(title);
  head.append(info, createSaveButton(record, record.theme));
  const details = element('details');
  details.append(element('summary', '', '판시사항 읽기'), summaryExcerpt(record.summary));
  row.append(head, details);
  addNewsLinks(row, record.id);
  return row;
}

function renderPage() {
  const pages = Math.ceil(results.length / pageSize);
  const start = (page - 1) * pageSize;
  const list = element('ol', 'desk-record-list');
  list.start = start + 1;
  list.append(...results.slice(start, start + pageSize).map(recordRow));
  byId('lawOutput').replaceChildren(list);
  const pager = byId('lawPager');
  pager.hidden = pages < 2;
  if (pages < 2) return;
  function change(next) {
    page = next;
    renderPage();
    headingFocus();
  }
  const prev = button('이전', () => change(page - 1));
  const next = button('다음', () => change(page + 1));
  prev.disabled = page === 1;
  next.disabled = page === pages;
  pager.replaceChildren(prev, element('span', '', page + ' / ' + pages), next);
}

function landing() {
  revision++;
  results = [];
  byId('lawCount').textContent = '';
  byId('lawStatus').textContent = '';
  byId('lawReset').hidden = true;
  byId('lawMemo').hidden = true;
  byId('lawPager').hidden = true;
  byId('lawResultTitle').textContent = '생활 질문에서 시작하기';
  const list = element('ul', 'desk-issue-list');
  for (const issue of issues.slice(0, 3)) {
    const row = element('li');
    const anchor = link('', '?issue=' + encodeURIComponent(issue.slug));
    anchor.append(element('small', '', themes[issue.theme].label), element('span', '', issue.title));
    row.append(anchor);
    list.append(row);
  }
  const all = button('수록 판례 전체 둘러보기', () => refresh(true), 'desk-link desk-more');
  byId('lawOutput').replaceChildren(list, all);
}

function resultRecovery(failed) {
  if (failed.length) {
    return button('자료 다시 불러오기', () => refresh(true), 'desk-link');
  }
  if (theme !== 'all' && query) {
    return button('전체 분야에서 같은 검색어 찾기', () => { selectTheme('all'); headingFocus(); }, 'desk-link');
  }
  if (topic !== '전체') {
    return button('주제 필터 해제', () => { topic = '전체'; refresh(true); }, 'desk-link');
  }
  return link('국가법령정보센터에서 판례 찾기', 'https://www.law.go.kr/precSc.do', 'desk-link');
}

async function refresh(moveFocus) {
  const current = ++revision;
  const requested = theme === 'all' ? themeIds : [theme];
  const loaded = [];
  const failed = [];
  page = 1;
  reflectTheme();
  byId('lawReset').hidden = !query;
  byId('lawMemo').hidden = true;
  const label = theme === 'all' ? '전체 분야' : themes[theme].label;
  byId('lawResultTitle').textContent = query ? label + ' 검색 결과' : label + ' 판례';
  byId('lawCount').textContent = '';
  byId('lawOutput').replaceChildren();
  byId('lawPager').hidden = true;
  byId('lawStatus').textContent = label + ' 판례 자료를 불러오고 있습니다.';
  if (moveFocus) headingFocus();
  for (let i = 0; i < requested.length; i += 4) {
    const ids = requested.slice(i, i + 4);
    const batch = await Promise.allSettled(ids.map(loadTheme));
    if (current !== revision) return;
    batch.forEach((entry, index) => {
      if (entry.status === 'fulfilled') loaded.push(...entry.value);
      else failed.push(themes[ids[index]].label);
    });
  }
  const ranked = query ? searchCases(loaded, query, topic) : searchCases(loaded, '', topic)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const seen = new Set();
  results = ranked.filter(record => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
  const n = results.length.toLocaleString('ko-KR');
  byId('lawCount').textContent = loaded.length ? n + '건' : '';
  const scope = failed.length ? failed.join(' · ') + ' 분야를 불러오지 못했습니다. ' : '';
  byId('lawStatus').textContent = scope + (loaded.length
    ? query ? '“' + query.slice(0, 65) + (query.length > 65 ? '…' : '') + '” 검색 결과 ' + n + '건입니다.'
      : label + '의 수록 판례 ' + n + '건을 최근 선고일 순으로 표시합니다.'
    : '연결을 확인하고 자료를 다시 불러오세요.');
  const terms = query ? [...extractSituation(query).keywords, ...(query.match(/[\p{L}\p{N}]+/gu) || [])] : [];
  highlightTerms = [...new Set(terms)].filter(term => /^[\p{L}\p{N} ]{2,64}$/u.test(term)).slice(0, 24)
    .sort((a, b) => b.length - a.length);
  byId('lawMemo').hidden = !query || !results.length;
  renderPage();
  if (!results.length || failed.length) byId('lawOutput').append(resultRecovery(failed));
}

async function updateStats() {
  try {
    const response = await fetch(new URL('./data/catalogue-status.json', import.meta.url));
    if (!response.ok) return;
    const status = await response.json();
    if (Number.isSafeInteger(status.uniqueCases) && status.uniqueCases > 0 && /^\d{4}-\d{2}$/.test(status.caseAsOf)) {
      byId('lawUniqueCount').textContent = status.uniqueCases.toLocaleString('ko-KR');
      byId('lawSourceDate').textContent = status.caseAsOf.replace('-', '.') + ' 공개자료 기준';
    }
  } catch {
    return;
  }
}

function openDesk() {
  byId('lawThemeCount').textContent = String(themeIds.length);
  updateStats();

  themeControls();
  reflectTheme();
  const field = byId('lawQuery');
  field.value = query;
  byId('lawMemo').addEventListener('click', downloadMemo);
  field.addEventListener('input', clearError);
  byId('lawReset').addEventListener('click', () => {
    field.value = query = '';
    topic = '전체';
    clearError();
    clearSharedQuery();
    if (theme === 'all') landing();
    else refresh(false);
    field.focus();
  });
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  byId('lawSearch').addEventListener('submit', event => {
    event.preventDefault();
    setQuery(field.value, true);
  });
  if (query || theme !== 'all') refresh(false);
  else landing();
}

const issueSlug = params.get('issue');
const view = issueSlug ? 'issues' : params.get('view');
if (view === 'saved' || view === 'issues') {
  byId('lawSearchPage').hidden = true;
  const supplement = byId('lawSupplement');
  supplement.hidden = false;
  const nav = document.querySelector('.press-nav');
  nav.querySelector('[aria-current]')?.removeAttribute('aria-current');
  nav.querySelector('[href="/law/?view=' + view + '"]').setAttribute('aria-current', 'page');
  if (view === 'saved') renderLibrary(supplement);
  else renderTopics(supplement, issueSlug || '');
} else {
  openDesk();
}
