import { CONFIG } from './config.js';
import { request, loadRealtime, loadReports, values, rows, explain } from './api.js';

const $ = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat('ko-KR').format(value);
const clock = (value = new Date()) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(value) + ' KST';
const scope = 'https://www.googleapis.com/auth/analytics.readonly';
const storageKey = 'jogan.admin.oauth-client-id';
let clientId = CONFIG.clientId;
try { clientId ||= localStorage.getItem(storageKey) || ''; } catch {}
let token = '';
let expiry = 0;
let epoch = 0;
let controller;
let timer;
let expiryTimer;
let busy = false;
let paused = false;
let lastReport = 0;
let googleLoading;
let authPending = false;

// 신문 화면의 섹션 id → 메뉴 이름. 이벤트 이름은 section_<id>로 들어온다
const SECTION_NAMES = { home: '홈', media: '언론', national: '전국', regions: '지역', politics: '정치', economy: '경제', industry: '산업', fiscal: '재정' };
const LIST_IDS = ['livePages', 'devices', 'liveSections', 'cities', 'topPages', 'channels', 'sections', 'regions'];
// GA4는 지역·도시 이름을 영어로 준다. 국내 시·도와 그 도시 이름만 한국어로 바꾸고 나머지는 그대로 둔다
const PLACE_NAMES = {
  Seoul: '서울', Busan: '부산', Incheon: '인천', Daegu: '대구', Daejeon: '대전', Gwangju: '광주', Ulsan: '울산',
  'Sejong-si': '세종', Sejong: '세종', 'Gyeonggi-do': '경기', 'Gangwon-do': '강원', 'Gangwon State': '강원',
  'Chungcheongbuk-do': '충북', 'North Chungcheong': '충북', 'Chungcheongnam-do': '충남', 'South Chungcheong': '충남',
  'Jeollabuk-do': '전북', 'North Jeolla': '전북', 'Jeonbuk State': '전북', 'Jeollanam-do': '전남', 'South Jeolla': '전남',
  'Gyeongsangbuk-do': '경북', 'North Gyeongsang': '경북', 'Gyeongsangnam-do': '경남', 'South Gyeongsang': '경남',
  'Jeju-do': '제주', Jeju: '제주', 'Jeju-si': '제주'
};
const placeRows = (data) => data.map((item) => ({ ...item, label: PLACE_NAMES[item.label] || item.label }));
const sectionRows = (data) => data.map((item) => ({ ...item, label: SECTION_NAMES[item.label.replace(/^section_/, '')] || item.label.replace(/^section_/, '') }));

function validClient(value) { return /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value); }
function message(text) { $('authMessage').textContent = text; }
function connection(text) { $('connection').textContent = text; }

function emptyPanels() {
  for (const id of ['liveUsers', 'liveViews', 'reportUsers', 'reportViews', 'reportSessions']) $(id).textContent = '—';
  for (const id of [...LIST_IDS, 'minuteChart', 'trendChart']) $(id).replaceChildren();
  $('trendAxis').replaceChildren();
  $('eventTotal').textContent = '—';
  $('minuteChart').setAttribute('aria-label', '연결 전');
  $('realtimeTime').textContent = '불러오기 전';
  $('reportTime').textContent = '기간별 보고서는 GA4 속성 시간대를 따르며, 오늘의 수치는 집계가 늦을 수 있습니다.';
  $('realtimeError').textContent = '';
  $('reportError').textContent = '';
}

function disconnect(text = '연결을 해제했습니다. 다시 연결하면 최신 통계를 조회합니다.') {
  token = '';
  expiry = 0;
  authPending = false;
  epoch += 1;
  controller?.abort();
  clearTimeout(timer);
  clearTimeout(expiryTimer);
  busy = false;
  lastReport = 0;
  $('privateData').hidden = true;
  $('disconnect').hidden = true;
  $('connect').hidden = false;
  $('connect').disabled = false;
  $('refresh').disabled = false;
  $('refresh').textContent = '새로고침';
  $('realtimeSection').removeAttribute('aria-busy');
  emptyPanels();
  $('authTitle').textContent = 'Google 계정으로 통계 연결';
  connection('연결 전');
  message(text);
}

function googleLibrary() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleLoading) return googleLoading;
  googleLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error) => {
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Google 인증 도구 시간 초과')), CONFIG.timeoutMs);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => finish(window.google?.accounts?.oauth2 ? null : new Error('Google 인증 도구 오류'));
    script.onerror = () => finish(new Error('Google 인증 도구 연결 실패'));
    document.head.append(script);
  }).catch((error) => { googleLoading = null; throw error; });
  return googleLoading;
}

function table(target, data, heading, metric) {
  target.replaceChildren();
  if (!data.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = '이 기간에 집계된 데이터가 없습니다.';
    target.append(empty);
    return;
  }
  const element = document.createElement('table');
  element.className = 'admin-table';
  const caption = document.createElement('caption');
  caption.className = 'kj-sr';
  caption.textContent = heading + ' · ' + metric;
  element.append(caption);
  const head = element.createTHead().insertRow();
  for (const label of [heading, metric]) {
    const th = document.createElement('th');
    th.scope = 'col'; th.textContent = label; head.append(th);
  }
  const body = element.createTBody();
  // 막대 길이는 목록의 가장 큰 값 대비 비율. 값은 오른쪽 숫자 열이 그대로 읽힌다
  const max = Math.max(1, ...data.map((entry) => entry.value));
  for (const entry of data) {
    const row = body.insertRow();
    const name = row.insertCell();
    const label = document.createElement('span');
    label.textContent = entry.label === '(not set)' ? '분류되지 않음' : entry.label;
    const meter = document.createElement('span');
    meter.className = 'admin-meter';
    meter.setAttribute('aria-hidden', 'true');
    meter.style.setProperty('--w', Math.max(2, entry.value / max * 100) + '%');
    name.append(label, meter);
    row.insertCell().textContent = number(entry.value);
  }
  target.append(element);
}

// 기간 추이: 날짜(오늘은 시간)별 활성 사용자 막대. 조회수는 막대에 올리면 함께 보인다
function trend(data, hourly) {
  const points = data.map((item) => {
    const key = item.label;
    const text = hourly ? Number(key.slice(8, 10)) + '시' : Number(key.slice(4, 6)) + '/' + Number(key.slice(6, 8));
    return { key, text, users: item.value, views: item.second };
  }).sort((a, b) => a.key.localeCompare(b.key));
  const box = $('trendChart');
  box.replaceChildren();
  $('trendAxis').replaceChildren();
  if (!points.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = '이 기간에 집계된 데이터가 없습니다.';
    box.append(empty);
    box.setAttribute('aria-label', '이 기간에 집계된 데이터가 없습니다');
    return;
  }
  const max = Math.max(1, ...points.map((point) => point.users));
  box.style.setProperty('--n', points.length);
  for (const point of points) {
    const bar = document.createElement('div');
    bar.className = 'admin-bar';
    bar.style.height = Math.max(2, point.users / max * 100) + '%';
    bar.title = `${point.text} · 활성 사용자 ${number(point.users)}명 · 조회수 ${number(point.views)}`;
    if (!point.users) bar.dataset.zero = '';
    box.append(bar);
  }
  box.setAttribute('aria-label', '활성 사용자 추이: ' + points.map((point) => `${point.text} ${point.users}명`).join(', '));
  const peak = points.reduce((a, b) => (b.users > a.users ? b : a));
  for (const text of [points[0].text, '최고 ' + peak.text + ' · ' + number(peak.users) + '명', points.at(-1).text]) {
    const span = document.createElement('span');
    span.textContent = text;
    $('trendAxis').append(span);
  }
}

function chart(data) {
  const counts = Array(30).fill(0);
  for (const item of data) {
    const minute = Number(item.label);
    if (Number.isInteger(minute) && minute >= 0 && minute < 30) counts[29 - minute] = item.value;
  }
  const max = Math.max(1, ...counts);
  $('minuteChart').replaceChildren();
  counts.forEach((value, index) => {
    const bar = document.createElement('div');
    bar.className = 'admin-bar';
    bar.style.height = Math.max(2, value / max * 100) + '%';
    bar.title = `${29 - index}분 전 · 이벤트 ${number(value)}건`;
    if (!value) bar.dataset.zero = '';
    $('minuteChart').append(bar);
  });
  $('minuteChart').setAttribute('aria-label', '분당 이벤트: ' + counts.map((count, index) => `${29 - index}분 전 ${count}건`).join(', '));
}

function renderRealtime(reports) {
  const totals = values(reports[0]);
  $('liveUsers').textContent = number(totals[0] || 0);
  $('liveViews').textContent = number(totals[1] || 0);
  $('eventTotal').textContent = '총 ' + number(totals[2] || 0) + '건';
  chart(rows(reports[1]));
  table($('livePages'), rows(reports[2]), '페이지 제목', '활성 사용자');
  const labels = { desktop: '데스크톱', mobile: '모바일', tablet: '태블릿' };
  table($('devices'), rows(reports[3]).map((item) => ({ ...item, label: labels[item.label] || item.label })), '기기', '활성 사용자');
  table($('liveSections'), sectionRows(rows(reports[4])), '섹션', '활성 사용자');
  table($('cities'), placeRows(rows(reports[5])), '도시', '활성 사용자');
  $('realtimeTime').textContent = clock() + ' 갱신';
}

function renderReports(reports, periodLabel) {
  const totals = values(reports[0]);
  for (const [index, id] of ['reportUsers', 'reportViews', 'reportSessions'].entries()) $(id).textContent = number(totals[index] || 0);
  table($('topPages'), rows(reports[1]), '페이지 경로', '조회수');
  table($('channels'), rows(reports[2]), '채널', '세션');
  trend(rows(reports[3]), $('period').value === 'today');
  table($('sections'), sectionRows(rows(reports[4])), '섹션', '읽은 사용자');
  table($('regions'), placeRows(rows(reports[5])), '지역', '활성 사용자');
  $('reportTime').textContent = `${periodLabel} · ${reports[0].metadata?.timeZone || 'GA4 속성 시간대'} 기준 · ${clock()} 조회 · 오늘의 수치는 집계가 늦을 수 있습니다.`;
}

function schedule() {
  clearTimeout(timer);
  if (!token || paused || document.hidden) return;
  timer = setTimeout(() => refresh(), CONFIG.refreshMs);
}

async function refresh(forceReports = false) {
  if (!token || busy || document.hidden) return;
  if (Date.now() >= expiry) return disconnect('인증이 만료되었습니다. Google 계정으로 다시 연결해 주세요.');
  const currentEpoch = epoch;
  controller = new AbortController();
  const signal = controller.signal;
  busy = true;
  $('refresh').disabled = true;
  $('refresh').textContent = '불러오는 중…';
  $('realtimeSection').setAttribute('aria-busy', 'true');
  connection('갱신 중');
  const period = $('period').value;
  const label = $('period').selectedOptions[0].textContent;
  const needsReport = forceReports || Date.now() - lastReport >= CONFIG.reportRefreshMs;
  const apply = async (load, render, errorId) => {
    try {
      const data = await load();
      if (currentEpoch !== epoch) return;
      render(data);
      $(errorId).textContent = '';
    } catch (error) {
      if (currentEpoch !== epoch) return;
      if (error.status === 401 || error.status === 403) return disconnect(explain(error));
      if (error.status === 429) paused = true;
      $(errorId).textContent = explain(error) + ' 표시된 기존 수치는 마지막 조회 결과입니다.';
    }
  };
  const jobs = [apply(() => loadRealtime(token, signal), renderRealtime, 'realtimeError')];
  if (needsReport) jobs.push(apply(() => loadReports(token, period, signal), (data) => {
    renderReports(data, label);
    lastReport = Date.now();
  }, 'reportError'));
  await Promise.all(jobs);
  if (currentEpoch !== epoch) return;
  busy = false;
  $('refresh').disabled = false;
  $('refresh').textContent = '새로고침';
  $('realtimeSection').removeAttribute('aria-busy');
  const degraded = $('realtimeError').textContent || $('reportError').textContent;
  connection(degraded ? '일부 조회 실패' : '연결됨 · 자동 갱신');
  schedule();
}

function authorize() {
  if (!validClient(clientId)) {
    $('setup').open = true;
    message('최초 연결에 필요한 OAuth 클라이언트 ID를 설정해 주세요.');
    $('clientId').focus();
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    $('connect').disabled = true;
    message('Google 인증 도구를 준비하고 있습니다.');
    googleLibrary().then(() => {
      $('connect').disabled = false;
      message('준비되었습니다. 연결 버튼을 눌러 Google 계정을 선택해 주세요.');
    }).catch(() => {
      $('connect').disabled = false;
      message('Google 인증 도구를 불러오지 못했습니다. 광고 차단 설정과 네트워크를 확인하고 다시 눌러 주세요.');
    });
    return;
  }
  const authEpoch = ++epoch;
  authPending = true;
  $('connect').disabled = true;
  message('Google 창에서 조회할 계정을 선택해 주세요.');
  const fail = () => {
    if (authEpoch !== epoch) return;
    authPending = false;
    $('connect').disabled = false;
    message('연결이 완료되지 않았습니다. 팝업 허용과 Google 동의 화면을 확인하고 다시 연결해 주세요.');
  };
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId, scope, include_granted_scopes: false,
    callback: (result) => {
      if (authEpoch !== epoch) return;
      if (result.error || !result.access_token || !window.google.accounts.oauth2.hasGrantedAllScopes(result, scope)) return fail();
      authPending = false;
      token = result.access_token;
      expiry = Date.now() + Math.max(0, Number(result.expires_in) * 1000 - 30000);
      if (!Number.isFinite(expiry) || expiry <= Date.now()) return disconnect('인증 유효 시간을 확인할 수 없습니다. 다시 연결해 주세요.');
      expiryTimer = setTimeout(() => disconnect('인증이 만료되었습니다. Google 계정으로 다시 연결해 주세요.'), expiry - Date.now());
      $('privateData').hidden = false;
      $('connect').hidden = true;
      $('disconnect').hidden = false;
      $('setup').open = false;
      paused = false;
      $('authTitle').textContent = 'Google 통계 연결됨';
      message('대한민국 조간의 통계를 조회합니다. 연결 해제 시 이 화면의 통계를 지웁니다.');
      refresh(true);
    }, error_callback: fail
  });
  try { client.requestAccessToken({ prompt: 'select_account' }); } catch { fail(); }
}

$('connect').addEventListener('click', authorize);
$('disconnect').addEventListener('click', () => {
  const previousToken = token;
  disconnect();
  if (previousToken) window.google?.accounts?.oauth2.revoke(previousToken, () => {});
  $('connect').focus();
});
$('refresh').addEventListener('click', () => { paused = false; refresh(true); });
$('period').addEventListener('change', () => {
  epoch += 1;
  controller?.abort();
  busy = false;
  lastReport = 0;
  for (const id of ['reportUsers', 'reportViews', 'reportSessions']) $(id).textContent = '—';
  for (const id of ['topPages', 'channels', 'sections', 'regions', 'trendChart', 'trendAxis']) $(id).replaceChildren();
  $('reportTime').textContent = '선택한 기간의 통계를 불러오고 있습니다.';
  paused = false;
  refresh(true);
});
$('configForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = $('clientId').value.trim();
  if (!validClient(value)) {
    $('clientId').setAttribute('aria-invalid', 'true');
    $('configError').textContent = 'apps.googleusercontent.com으로 끝나는 OAuth 클라이언트 ID를 입력해 주세요.';
    $('clientId').focus(); return;
  }
  disconnect('설정을 적용했습니다. Google 계정으로 연결해 주세요.');
  clientId = value;
  let saved = true;
  try { localStorage.setItem(storageKey, value); } catch { saved = false; }
  $('clientId').removeAttribute('aria-invalid');
  $('configError').textContent = '';
  if (!saved) message('이 브라우저에서 저장이 제한되어 이번 창에서만 설정을 유지합니다. Google 계정으로 연결해 주세요.');
  googleLibrary().catch(() => {});
  $('connect').focus();
});
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) { if (token) connection('자동 갱신 일시 정지'); }
  else if (token && !paused) refresh();
});
window.addEventListener('pagehide', () => disconnect());
window.addEventListener('pageshow', (event) => { if (event.persisted) disconnect('Google 계정으로 다시 연결해 주세요.'); });
window.addEventListener('focus', () => {
  if (authPending) $('connect').disabled = false;
});
$('clientId').value = clientId;
if (!validClient(clientId)) {
  $('setup').open = true;
  message('최초 연결에는 Google OAuth 설정이 필요합니다. 아래 안내에서 클라이언트 ID를 등록해 주세요.');
} else googleLibrary().catch(() => {});

async function loadPublishing() {
  $('retryPublish').hidden = true;
  $('publishMessage').textContent = '공개된 최신 호를 확인하고 있습니다.';
  try {
    const index = await request('/data/issues/index.json');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(index.latest) || !Array.isArray(index.issues) || !index.issues.includes(index.latest)) throw new Error('잘못된 색인');
    const issue = await request('/data/issues/' + index.latest + '.json');
    if (issue.status !== 'published' || issue.date !== index.latest) throw new Error('공개 상태 불일치');
    $('latestIssue').textContent = index.latest;
    $('issueCount').textContent = number(index.issues.length) + '개';
    const review = issue.review || {};
    $('reviewMode').textContent = review.auto === true ? '자동 발행' : review.by ? '편집자 확인 기록' : '확인 기록 없음';
    const date = new Date(review.at);
    $('reviewTime').textContent = Number.isNaN(date.getTime()) ? '기록 없음' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(date) + ' KST';
    $('publishData').hidden = false;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    $('publishMessage').textContent = (today === index.latest ? '오늘 호가 공개되어 있습니다.' : '최신 공개 호는 ' + index.latest + '입니다. 오늘 호 발행 여부를 확인해 주세요.') + ' · ' + clock() + ' 확인';
  } catch {
    $('publishData').hidden = true;
    $('publishMessage').textContent = '공개 호 정보를 확인하지 못했습니다. 배포 기록과 네트워크를 확인해 주세요.';
    $('retryPublish').hidden = false;
  }
}
$('retryPublish').addEventListener('click', loadPublishing);
loadPublishing();
