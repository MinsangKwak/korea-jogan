import { loadSearch, inspectSearchUrl, searchError } from './search-api.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const $ = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat('ko-KR').format(value);
const decimal = (value) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);
const reportRows = (data) => Array.isArray(data?.rows) ? data.rows : [];

export function initSearch({ getClientId, validClient, prepareGoogle, renderTable, missingClient, disconnected }) {
  if (!$('searchConnect')) return { reset() {} };
  let token = '', site = '', expiry = 0, generation = 0, inspection = 0;
  let controller, inspectController, expiryTimer, pending = false, busy = false;

  function clearReports() {
    for (const id of ['searchQueries', 'searchPages']) $(id).replaceChildren();
    for (const id of ['searchClicks', 'searchImpressions', 'searchCtr', 'searchPosition']) $(id).textContent = '—';
  }
  function reset(text = '검색 연결을 해제했습니다.') {
    generation += 1; inspection += 1;
    controller?.abort(); inspectController?.abort(); clearTimeout(expiryTimer);
    token = ''; site = ''; expiry = 0; busy = false; pending = false;
    $('searchData').hidden = true;
    $('searchConnect').hidden = false; $('searchConnect').disabled = false;
    $('searchDisconnect').hidden = true; $('searchDisconnect').disabled = true; $('searchRefresh').disabled = true;
    $('searchInspect').disabled = true;
    $('searchInspectData').replaceChildren(); $('searchInspectMessage').textContent = '';
    $('searchProperty').textContent = ''; $('searchRange').textContent = ''; $('searchSitemap').textContent = '';
    $('searchError').textContent = ''; $('searchState').textContent = '연결 전';
    $('searchMessage').textContent = text;
    clearReports();
  }
  function validToken() {
    if (!token) return false;
    if (Date.now() >= expiry) { reset('검색 연결이 만료되었습니다. Google 검색에 다시 연결해 주세요.'); return false; }
    return true;
  }
  function formattedRows(report) {
    return reportRows(report).map((row) => ({ label: row.keys?.[0] || '제공된 이름 없음', value: Number(row.clicks) || 0, cells: [number(row.clicks || 0), number(row.impressions || 0), decimal((row.ctr || 0) * 100) + '%', row.impressions ? decimal(row.position || 0) : '—'] }));
  }
  function render(data) {
    site = data.site;
    const total = reportRows(data.summary)[0] || {};
    $('searchClicks').textContent = number(total.clicks || 0);
    $('searchImpressions').textContent = number(total.impressions || 0);
    $('searchCtr').textContent = decimal((total.ctr || 0) * 100) + '%';
    $('searchPosition').textContent = total.impressions ? decimal(total.position || 0) : '—';
    renderTable($('searchQueries'), formattedRows(data.queries), '검색어', ['클릭', '노출', 'CTR', '평균 순위']);
    renderTable($('searchPages'), formattedRows(data.pages), '검색 결과의 페이지', ['클릭', '노출', 'CTR', '평균 순위']);
    const dates = reportRows(data.dates).map((row) => row.keys?.[0]).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date || '')).sort();
    $('searchRange').textContent = `${data.range.startDate} ~ ${data.range.endDate} · 미국 태평양 시간 · 확정 자료 중 노출 기록 ${dates.length}일` + (dates.length ? ` · 마지막 기록 ${dates.at(-1)}` : '');
    $('searchProperty').textContent = site;
    $('searchConsoleLink').href = 'https://search.google.com/search-console?resource_id=' + encodeURIComponent(site);
    const sitemap = (data.sitemaps.sitemap || []).find((entry) => entry.path === 'https://korea-jogan.com/sitemap.xml');
    $('searchSitemap').textContent = sitemap ? `Google 사이트맵 등록 기록: ${sitemap.isPending ? '처리 중' : '기록 있음'} · 오류 ${number(sitemap.errors || 0)}건 · 경고 ${number(sitemap.warnings || 0)}건` : 'Google에 이 사이트맵을 제출한 기록이 없습니다. Search Console에서 sitemap.xml 제출 상태를 확인해 주세요.';
    $('searchData').hidden = false;
    $('searchInspect').disabled = false;
  }
  async function refresh(replace = false) {
    if (!validToken() || (busy && !replace)) return;
    const current = ++generation;
    controller?.abort(); controller = new AbortController();
    const hadData = !$('searchData').hidden;
    if (replace) { clearReports(); $('searchData').hidden = true; }
    busy = true; $('searchRefresh').disabled = true;
    $('searchState').textContent = '조회 중'; $('searchError').textContent = '';
    try {
      const data = await loadSearch(token, { days: Number($('searchDays').value), country: $('searchCountry').value, site, signal: controller.signal });
      if (current !== generation) return;
      render(data);
      $('searchState').textContent = '조회 완료';
      $('searchMessage').textContent = '검색 노출·클릭은 GA4 방문과 별도로 확인합니다. 검색어·페이지 표는 상위 10개이며 일부 검색어는 Google의 개인정보 보호 기준으로 생략될 수 있습니다.';
    } catch (error) {
      if (current !== generation) return;
      if (error.status === 401 || error.status === 403) { reset(searchError(error)); return; }
      $('searchError').textContent = searchError(error) + (!replace && hadData ? ' 표시된 값은 마지막 조회 결과입니다.' : '');
      $('searchState').textContent = '조회 실패';
    } finally {
      if (current === generation) { busy = false; $('searchRefresh').disabled = !token; }
    }
  }
  $('searchConnect').disabled = false;
  $('searchConnect').addEventListener('click', async () => {
    if (pending) return;
    if (!validClient(getClientId())) { missingClient(); return; }
    if (!window.google?.accounts?.oauth2) {
      $('searchConnect').disabled = true;
      try { await prepareGoogle(); $('searchMessage').textContent = '준비되었습니다. Google 검색 연결을 눌러 계정을 선택해 주세요.'; }
      catch { $('searchMessage').textContent = 'Google 인증 도구를 불러오지 못했습니다. 연결 상태와 팝업 설정을 확인해 주세요.'; }
      $('searchConnect').disabled = false;
      return;
    }
    const current = ++generation;
    pending = true; $('searchConnect').disabled = true;
    $('searchMessage').textContent = 'Google 창에서 조회할 계정을 선택하고 검색 읽기 권한을 허용해 주세요.';
    const fail = () => {
      if (current !== generation) return;
      pending = false; $('searchConnect').disabled = false;
      $('searchMessage').textContent = '검색 연결이 완료되지 않았습니다. 팝업과 읽기 권한 동의를 확인한 뒤 다시 연결해 주세요.';
    };
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: getClientId(), scope: SCOPE, include_granted_scopes: false,
      callback: (result) => {
        if (current !== generation) return;
        if (result.error || !result.access_token || !window.google.accounts.oauth2.hasGrantedAllScopes(result, SCOPE)) { fail(); return; }
        const lifetime = Number(result.expires_in) * 1000 - 30000;
        if (!Number.isFinite(lifetime) || lifetime <= 0) { reset('인증 유효 시간을 확인하지 못했습니다. 다시 연결해 주세요.'); return; }
        token = result.access_token; expiry = Date.now() + lifetime; pending = false;
        expiryTimer = setTimeout(() => reset('검색 연결이 만료되었습니다. 다시 연결해 주세요.'), lifetime);
        $('searchConnect').hidden = true; $('searchDisconnect').hidden = false; $('searchDisconnect').disabled = false;
        refresh();
      }, error_callback: fail
    });
    try { client.requestAccessToken({ prompt: 'select_account' }); } catch { fail(); }
  });
  $('searchRefresh').addEventListener('click', () => refresh());
  ['searchDays', 'searchCountry'].forEach((id) => $(id).addEventListener('change', () => refresh(true)));
  $('searchDisconnect').addEventListener('click', () => {
    const previous = token;
    reset('검색 연결을 해제했습니다.'); disconnected();
    if (previous) window.google?.accounts?.oauth2.revoke(previous, () => {});
    $('searchConnect').focus();
  });
  $('searchInspect').addEventListener('click', async () => {
    if (!validToken() || !site) return;
    const current = ++inspection;
    const target = $('searchTarget').value;
    inspectController?.abort(); inspectController = new AbortController();
    $('searchInspect').disabled = true; $('searchInspectMessage').textContent = 'Google에 기록된 색인 상태를 확인하고 있습니다.';
    $('searchInspectData').replaceChildren();
    try {
      const data = await inspectSearchUrl(token, site, target, inspectController.signal);
      if (current !== inspection) return;
      const names = { PASS: '통과', FAIL: '문제 확인', NEUTRAL: '확인 필요', VERDICT_UNSPECIFIED: '판단 자료 없음' };
      $('searchInspectMessage').textContent = 'Google 기록: ' + (names[data.verdict] || '판단 자료 없음') + ' · ' + (data.coverageState || '상세 상태 미제공');
      for (const [label, value] of [['조회한 주소', target], ['Google 대표 주소', data.googleCanonical], ['사이트 대표 주소', data.userCanonical], ['마지막 수집 시각', data.lastCrawlTime]]) {
        const row = document.createElement('div');
        const term = document.createElement('dt'), detail = document.createElement('dd');
        term.textContent = label; detail.textContent = value || '제공된 기록 없음';
        row.append(term, detail); $('searchInspectData').append(row);
      }
    } catch (error) {
      if (current !== inspection) return;
      if (error.status === 401 || error.status === 403) { reset(searchError(error)); return; }
      $('searchInspectMessage').textContent = searchError(error);
    } finally { if (current === inspection) $('searchInspect').disabled = !token; }
  });
  $('searchTarget').addEventListener('change', () => {
    inspection += 1; inspectController?.abort();
    $('searchInspectData').replaceChildren();
    $('searchInspectMessage').textContent = '선택한 주소의 Google 기록을 조회해 주세요.';
    $('searchInspect').disabled = !token || !site;
  });
  window.addEventListener('pagehide', () => reset('Google 검색에 다시 연결해 주세요.'));
  return { reset };
}
