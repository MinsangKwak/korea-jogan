import { isThemeId, officialCaseUrl, parseCases, themes } from './search-core.js';
import { element, link, readingHeader } from './reading-dom.js';

const prefix = 'jogan.law.saved.';
const catalogues = new Map();

function savedEntries() {
  try {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .map(key => ({ id: Number(key.slice(prefix.length)), theme: localStorage.getItem(key) }))
      .filter(entry => Number.isSafeInteger(entry.id) && entry.id > 0 && isThemeId(entry.theme));
  } catch {
    return [];
  }
}

export function getSavedCount() {
  return savedEntries().length;
}

function isSaved(id) {
  try {
    return isThemeId(localStorage.getItem(prefix + id));
  } catch {
    return false;
  }
}

function showState(button, saved) {
  button.setAttribute('aria-pressed', String(saved));
  button.textContent = saved ? '보관됨' : '보관';
}

function announceFailure() {
  let notice = document.getElementById('law-save-error');
  if (!notice) {
    notice = element('p', 'law-save-error');
    notice.id = 'law-save-error';
    notice.setAttribute('role', 'alert');
    document.querySelector('main').prepend(notice);
  }
  notice.textContent = '브라우저 저장 공간을 사용할 수 없습니다. 이 브라우저의 사이트 저장 설정을 확인해 주세요.';
}

export function createSaveButton(record, theme) {
  const button = element('button', 'law-save');
  button.type = 'button';
  button.dataset.lawSaveId = String(record.id);
  button.setAttribute('aria-label', record.title + ' ' + record.number + ' 보관');
  showState(button, isSaved(record.id));
  button.addEventListener('click', () => {
    const key = prefix + record.id;
    try {
      if (isSaved(record.id)) localStorage.removeItem(key);
      else localStorage.setItem(key, theme);
    } catch {
      announceFailure();
      return;
    }
    document.getElementById('law-save-error')?.remove();
    syncButtons();
    window.dispatchEvent(new Event('jogan-law-saved'));
  });
  return button;
}

function syncButtons() {
  for (const button of document.querySelectorAll('[data-law-save-id]')) {
    showState(button, isSaved(button.dataset.lawSaveId));
  }
}

window.addEventListener('storage', event => {
  if (event.key && !event.key.startsWith(prefix)) return;
  syncButtons();
  window.dispatchEvent(new Event('jogan-law-saved'));
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  syncButtons();
  window.dispatchEvent(new Event('jogan-law-saved'));
});

function loadCatalogue(theme) {
  if (!catalogues.has(theme)) {
    const url = new URL('data/' + themes[theme].file, import.meta.url);
    const pending = fetch(url).then(async response => {
      if (!response.ok) throw new Error('판례 파일을 열지 못했습니다.');
      const records = parseCases(await response.json(), theme);
      return new Map(records.map(record => [record.id, record]));
    }).catch(error => {
      catalogues.delete(theme);
      throw error;
    });
    catalogues.set(theme, pending);
  }
  return catalogues.get(theme);
}

function caseSource(record) {
  const source = link('판결문 원문', officialCaseUrl(record), 'law-reading-source');
  source.setAttribute('aria-label', record.number + ' 판결문 원문');
  source.rel = 'noreferrer';
  return source;
}

function comparedCase(record) {
  const article = element('article', 'law-compared-case');
  article.setAttribute('aria-label', record.number + ' 비교 자료');
  const details = element('dl', 'law-case-facts');
  for (const [name, value] of [['사건번호', record.number], ['선고일', record.date], ['법원', record.court], ['주제', record.topics.join(' · ')]]) {
    details.append(element('dt', '', name), element('dd', '', value));
  }
  article.append(element('h3', '', record.title), details,
    element('h4', '', '판시사항'), element('p', 'law-comparison-text', record.summary), caseSource(record));
  return article;
}

function comparison(records, selected) {
  const compare = element('section', 'law-comparison');
  compare.setAttribute('aria-label', '두 판례 비교');
  compare.append(element('h2', '', '두 판례 비교'));
  if (records.length < 2) {
    compare.append(element('p', '', '서로 다른 판례를 두 건 이상 보관하면 판시사항을 함께 읽을 수 있습니다.'));
    return compare;
  }
  const controls = element('div', 'law-compare-selectors');
  const results = element('div', 'law-compare-pair');
  const notice = element('p', 'law-reading-sr');
  notice.setAttribute('role', 'status');
  const selectors = ['첫 번째 판례', '두 번째 판례'].map((name, i) => {
    const label = element('label', 'law-compare-select');
    const select = element('select');
    label.append(element('span', '', name), select);
    controls.append(label);
    select.addEventListener('change', () => {
      selected[i] = select.value;
      refresh();
    });
    return select;
  });

  const reset = element('button', 'law-clear', '비교 선택 초기화');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    selected.fill('');
    refresh();
    selectors[0].focus();
  });
  function refresh() {
    for (const [i, select] of selectors.entries()) {
      const options = records.filter(record => String(record.id) !== selected[1 - i])
        .map(record => new Option(record.number + ' · ' + record.title, String(record.id)));
      select.replaceChildren(new Option('판례 선택', ''), ...options);
      select.value = selected[i];
    }
    const pair = selected.map(id => records.find(record => String(record.id) === id));
    const complete = pair.every(Boolean);
    results.replaceChildren(...(complete ? pair.map(comparedCase) : []));
    notice.textContent = complete ? pair.map(record => record.number).join(' 및 ') + ' 비교 자료를 열었습니다.' : '';
    reset.hidden = !selected.some(Boolean);
  }
  refresh();
  compare.append(controls, reset, notice, results);
  return compare;
}

let detachLibrary;
export function renderLibrary(root) {
  detachLibrary?.();
  document.title = '내 판례 보관함 | 대한민국 조간';
  const header = readingHeader('내 판례 보관함', '이 브라우저에 보관한 판례의 판시사항을 비교하고 국가법령정보센터의 원문을 확인하세요.');
  const body = element('div', 'law-saved-body');
  root.replaceChildren(header, body);
  let generation = 0;
  const selected = ['', ''];
  async function update() {
    const request = ++generation;
    const focusedButton = body.querySelector('[data-law-save-id]:focus');
    const previousButtons = Array.from(body.querySelectorAll('[data-law-save-id]'));
    const entries = savedEntries();
    if (!entries.length) {
      const empty = element('section', 'law-reading-empty');
      const start = link('판례 찾아보기', '/law/', 'law-reading-primary');
      empty.append(element('h2', '', '보관한 판례가 없습니다'), element('p', '', '판례 검색 결과나 생활 법률 이슈에서 보관을 누르세요.'), start);
      body.replaceChildren(empty);
      if (focusedButton) start.focus();
      return;
    }
    if (!body.childElementCount) {
      const loading = element('p', '', '보관한 판례를 불러오는 중입니다.');
      loading.setAttribute('role', 'status');
      body.append(loading);
    }
    const themesToLoad = [...new Set(entries.map(entry => entry.theme))];
    const loaded = await Promise.allSettled(themesToLoad.map(loadCatalogue));
    if (request !== generation || !root.contains(body)) return;
    const catalog = new Map(themesToLoad.map((theme, i) => [theme, loaded[i].value]));
    const rows = entries.map(entry => ({ ...entry, record: catalog.get(entry.theme)?.get(entry.id) }));
    const records = rows.flatMap(row => row.record ? [row.record] : []);
    for (const i of [0, 1]) {
      if (!records.some(record => String(record.id) === selected[i])) selected[i] = '';
    }
    const list = element('ul', 'law-saved-list');
    for (const { id, theme, record } of rows) {
      const item = element('li', 'law-saved-row');
      const data = record || { id, number: String(id), title: '판례 식별번호' };
      const meta = element('div');
      const source = link(record ? record.title : '공식 판례 ' + id, officialCaseUrl(data), 'law-reading-source');
      source.rel = 'noreferrer';
      meta.append(source, element('p', 'law-reading-meta', record ? [themes[theme].label, record.court, record.date, record.number].join(' · ') : themes[theme].label + ' · 판례 정보 미확인'));
      item.append(meta, createSaveButton(data, theme));
      list.append(item);
    }
    const section = element('section', 'law-saved-section');
    section.append(element('h2', '', '보관한 판례 ' + rows.length + '건'), list);
    if (loaded.some(result => result.status === 'rejected')) {
      const error = element('div', 'law-reading-empty');
      const retry = element('button', 'law-clear', '다시 불러오기');
      retry.type = 'button';
      retry.addEventListener('click', update);
      error.setAttribute('role', 'alert');
      error.append(element('p', '', '일부 판례 자료를 불러오지 못했습니다.'), retry);
      section.prepend(error);
    }
    body.replaceChildren(comparison(records, selected), section);
    if (focusedButton) {
      const buttons = body.querySelectorAll('[data-law-save-id]');
      buttons[Math.min(previousButtons.indexOf(focusedButton), buttons.length - 1)]?.focus();
    }
  }
  window.addEventListener('jogan-law-saved', update);
  detachLibrary = () => {
    ++generation;
    window.removeEventListener('jogan-law-saved', update);
  };
  update();
}
