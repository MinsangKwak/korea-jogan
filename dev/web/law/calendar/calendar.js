import { element, link } from '../reading-dom.js';
import { loadLegislation } from './records.js';

const byId = (id) => document.getElementById('cal-' + id);
const labels = { proposed: '법률안 제안', promulgated: '법률 공포', effective: '법률 시행' };
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
const initialQuery = (new URLSearchParams(location.search).get('q') || '').trim().slice(0, 200);
const pageSize = 12;
let selected = today;
let scope = initialQuery ? 'search' : 'day';
let kind = 'all';
let query = initialQuery;
let page = 1;
let data;
let failed = false;
let matching = [];
let counts = new Map();

function displayDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return year + '년 ' + month + '월' + (day ? ' ' + day + '일' : '');
}

function normal(value) {
  return value.normalize('NFKC').replace(/[\s-]+/g, '').toLocaleLowerCase('ko');
}

function prepareMatches() {
  const term = normal(query);
  matching = (data?.events || []).filter((event) => {
    if (kind !== 'all' && event.kind !== kind) return false;
    return !term || normal(event.number).includes(term) || normal(event.title).includes(term) ||
      event.related?.some((other) => normal(other.title).includes(term));
  });
  counts = new Map();
  for (const event of matching) counts.set(event.date, (counts.get(event.date) || 0) + 1);
}

function monthDate() {
  return new Date(selected.slice(0, 7) + '-01T00:00:00Z');
}

function drawMonth() {
  const first = monthDate();
  const month = selected.slice(0, 7);
  const offset = first.getUTCDay();
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const length = last.getUTCDate();
  const rows = document.createDocumentFragment();
  let total = 0;
  let row;
  for (let cellIndex = 0; cellIndex < 7 * Math.ceil((offset + length) / 7); cellIndex++) {
    if (cellIndex % 7 === 0) {
      row = element('tr');
      rows.append(row);
    }
    const cell = element('td');
    row.append(cell);
    const day = cellIndex - offset + 1;
    if (day < 1 || day > length) continue;
    const date = month + '-' + String(day).padStart(2, '0');
    const count = counts.get(date) || 0;
    total += count;
    const button = element('button', 'cal-day');
    button.type = 'button';
    button.dataset.date = date;
    button.tabIndex = selected === date ? 0 : -1;
    button.setAttribute('aria-pressed', String(scope === 'day' && selected === date));
    if (date === today) button.setAttribute('aria-current', 'date');
    const countText = count ? count.toLocaleString('ko-KR') + '건 수록' : data ? '수록 일정 없음' : '자료 확인 전';
    button.setAttribute('aria-label', displayDate(date) + ' ' + countText);
    button.append(element('span', 'cal-digit', day + '일'));
    if (count) button.append(' ', element('span', 'cal-count', count.toLocaleString('ko-KR') + '건'));
    cell.append(button);
  }
  byId('days').replaceChildren(rows);
  byId('month-title').textContent = displayDate(month);
  byId('month').value = month;
  byId('prev').disabled = month === '2025-01';
  byId('next').disabled = month === '9999-12';
  byId('whole').textContent = '이달 전체 보기' + (data ? ' · ' + total.toLocaleString('ko-KR') + '건' : '');
}

function sourceLink(title, url) {
  const anchor = link(title, url);
  anchor.rel = 'noreferrer';
  anchor.append(element('span', 'cal-sr', ' 공식 원문'));
  return anchor;
}

function recordRow(event) {
  const row = element('li');
  const meta = element('div', 'cal-meta');
  const label = event.kind === 'effective' && event.date > today ? '시행 예정' : labels[event.kind];
  const time = element('time', '', event.date.replace(/-/g, '.'));
  time.dateTime = event.date;
  meta.append(element('span', 'cal-kind cal-' + event.kind, label), time, element('span', '', event.number));
  if (event.indirectOnly) meta.append(element('span', '', '관련 법률 원문'));
  row.append(meta, sourceLink(event.title, event.url));
  if (event.related?.length) {
    const details = element('details');
    const related = element('ul');
    for (const law of event.related) {
      const item = element('li');
      item.append(sourceLink(law.title, law.url));
      related.append(item);
    }
    details.append(element('summary', '', '함께 개정된 법률 ' + event.related.length + '개'), related);
    row.append(details);
  }
  return row;
}

function drawResults() {
  const month = selected.slice(0, 7);
  const heading = scope === 'search' ? '전체 기간 검색 결과' : scope === 'future' ? '다가오는 시행 일정' :
    scope === 'month' ? displayDate(month) + ' 전체 일정' : displayDate(selected) + ' 일정';
  const list = matching.filter((event) => {
    if (scope === 'day') return event.date === selected;
    if (scope === 'month') return event.date.startsWith(month);
    if (scope === 'future') return event.kind === 'effective' && event.date > today;
    return true;
  });
  list.sort((a, b) => (scope === 'search' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) ||
    a.title.localeCompare(b.title, 'ko') || a.number.localeCompare(b.number));
  const pages = Math.ceil(list.length / pageSize);
  byId('result-title').textContent = heading;
  byId('total').textContent = failed ? '' : !data ? '입법 자료를 불러오는 중입니다.' :
    list.length ? '수록 일정 ' + list.length.toLocaleString('ko-KR') + '건' : '조건에 맞는 수록 일정이 없습니다.';
  byId('records').replaceChildren(...list.slice((page - 1) * pageSize, page * pageSize).map(recordRow));
  byId('pages').hidden = pages < 2;
  byId('pages').querySelector('span').textContent = page + ' / ' + pages + ' 페이지';
  byId('page-prev').disabled = page <= 1;
  byId('page-next').disabled = page >= pages;
  const warning = failed ? '입법 자료를 불러오지 못했습니다.' : data?.warning;
  byId('error').hidden = !warning;
  byId('error').querySelector('p').textContent = warning || '';
}

function update(next, focus) {
  page = 1;
  scope = next;
  const url = new URL(location.href);
  if (url.searchParams.has('q') && url.searchParams.get('q').trim() !== query) {
    url.searchParams.delete('q');
    history.replaceState(history.state, '', url);
  }
  const spread = byId('spread');
  const first = byId(scope === 'search' || scope === 'future' ? 'results' : 'sheet');
  if (spread.firstElementChild !== first) spread.prepend(first);
  byId('query-status').hidden = !query;
  byId('query-status').querySelector('strong').textContent = query;
  for (const button of document.querySelectorAll('[data-kind]')) button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  drawMonth();
  drawResults();
  if (focus === 'day') byId('days').querySelector('[tabindex="0"]')?.focus();
  if (focus === 'results') byId('result-title').focus();
}

function setMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2025-01') {
    byId('month').value = selected.slice(0, 7);
    return;
  }
  selected = month === today.slice(0, 7) ? today : month + '-01';
  update('month');
}

function stepMonth(step) {
  const date = monthDate();
  date.setUTCMonth(date.getUTCMonth() + step);
  setMonth(date.toISOString().slice(0, 7));
}

function changePage(step) {
  page += step;
  drawResults();
  byId('result-title').focus();
}

function drawCoverage() {
  byId('asof').textContent = data ? '자료 기준일 ' + data.asOf.replace(/-/g, '.') : '';
  const coverage = byId('coverage');
  coverage.replaceChildren();
  if (!data) {
    coverage.append(element('dt', '', '수록 범위'), element('dd', '', '자료 확인 전입니다.'));
  } else {
    coverage.append(element('dt', '', labels.proposed), element('dd', '', data.coverage.proposed),
      element('dt', '', '공포·시행'), element('dd', '', data.coverage.promulgated));
  }
  const gazette = data?.gazette;
  byId('gazette').hidden = !gazette || gazette.issueDate <= today;
  if (!byId('gazette').hidden) {
    byId('gazette').textContent = displayDate(gazette.issueDate) + ' 관보 제' + gazette.issueNumber +
      '호 · 게재 예고 법률 ' + gazette.lawCount + '건 (' + gazette.checkedOn + ' 확인)';
  }
}

async function readData() {
  const controller = new AbortController();
  data = undefined;
  failed = false;
  prepareMatches();
  drawMonth();
  drawResults();
  drawCoverage();
  try {
    data = await loadLegislation(controller.signal);
  } catch {
    failed = true;
  }
  prepareMatches();
  const restoreDay = byId('days').contains(document.activeElement);
  drawMonth();
  if (restoreDay) byId('days').querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
  drawResults();
  drawCoverage();
}

byId('days').addEventListener('click', (event) => {
  const date = event.target.closest('[data-date]')?.dataset.date;
  if (date) { selected = date; update('day', 'day'); }
});
byId('days').addEventListener('keydown', (event) => {
  const date = event.target.closest('[data-date]')?.dataset.date;
  if (!date) return;
  const value = new Date(date + 'T00:00:00Z');
  const weekday = value.getUTCDay();
  const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
  if (!Object.hasOwn(steps, event.key)) return;
  event.preventDefault();
  value.setUTCDate(value.getUTCDate() + steps[event.key]);
  const target = value.toISOString().split('T')[0];
  if (target.length === 10 && target >= '2025-01-01') { selected = target; update('day', 'day'); }
});
byId('prev').addEventListener('click', () => stepMonth(-1));
byId('next').addEventListener('click', () => stepMonth(1));
byId('month').addEventListener('change', (event) => setMonth(event.target.value));
byId('whole').addEventListener('click', () => update('month', 'results'));
byId('page-next').addEventListener('click', () => changePage(1));
byId('page-prev').addEventListener('click', () => changePage(-1));
byId('future').addEventListener('click', () => {
  kind = 'effective'; query = ''; byId('q').value = ''; prepareMatches(); update('future', 'results');
});
byId('today').addEventListener('click', () => {
  selected = today; kind = 'all'; query = ''; byId('q').value = ''; prepareMatches(); update('day');
});
for (const button of document.querySelectorAll('[data-kind]')) {
  button.addEventListener('click', () => {
    kind = button.dataset.kind;
    prepareMatches();
    update(scope === 'future' && kind !== 'effective' ? 'month' : scope);
  });
}
byId('q').value = query;
byId('search').addEventListener('submit', (event) => {
  event.preventDefault();
  query = byId('q').value.trim();
  prepareMatches();
  update('search', 'results');
});
byId('clear').addEventListener('click', () => {
  query = ''; byId('q').value = ''; prepareMatches(); update('day'); byId('q').focus();
});
byId('retry').addEventListener('click', () => { byId('result-title').focus(); readData(); });
update(scope);
readData();
