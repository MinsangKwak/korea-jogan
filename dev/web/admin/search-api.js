import { request, ApiError } from './api.js';

const ORIGIN = 'https://korea-jogan.com';
const API = 'https://www.googleapis.com/webmasters/v3/sites/';
const SITES = [ORIGIN + '/', 'sc-domain:korea-jogan.com'];
export const SEARCH_TARGETS = [ORIGIN + '/', ORIGIN + '/topics/', ORIGIN + '/topics/muan-airport/', ORIGIN + '/indicators/', ORIGIN + '/indicators/usd-krw/'];

// Search Console의 날짜는 태평양 시간으로 계산하고 처리 지연을 고려해 3일 전까지 조회한다
export function searchRange(days, now = new Date()) {
  if (![7, 28].includes(days)) throw new ApiError(400, 'INVALID_PERIOD');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const end = new Date(day + 'T12:00:00Z');
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export async function loadSearch(token, { days, country, site, signal }) {
  if (!['all', 'kor'].includes(country)) throw new ApiError(400, 'INVALID_COUNTRY');
  if (!site) {
    const data = await request(API.slice(0, -1), { token, signal });
    const entries = data.siteEntry || [];
    site = SITES.find((url) => entries.some((entry) => entry.siteUrl === url && ['siteOwner', 'siteFullUser', 'siteRestrictedUser'].includes(entry.permissionLevel)));
  }
  if (!SITES.includes(site)) throw new ApiError(403, 'NO_SITE');
  const range = searchRange(days);
  const filters = [{ dimension: 'page', operator: 'includingRegex', expression: '^https://korea-jogan[.]com/' }];
  if (country === 'kor') filters.push({ dimension: 'country', operator: 'equals', expression: 'kor' });
  const common = { ...range, type: 'web', dataState: 'final', dimensionFilterGroups: [{ groupType: 'and', filters }] };
  const endpoint = API + encodeURIComponent(site);
  const query = (dimensions, rowLimit = 10) => request(endpoint + '/searchAnalytics/query', { token, signal, body: { ...common, dimensions, rowLimit } });
  const [summary, queries, pages, dates, sitemaps] = await Promise.all([
    query([]), query(['query']), query(['page']), query(['date'], 31), request(endpoint + '/sitemaps', { token, signal })
  ]);
  return { site, range, summary, queries, pages, dates, sitemaps };
}

export async function inspectSearchUrl(token, site, url, signal) {
  if (!SITES.includes(site) || !SEARCH_TARGETS.includes(url)) throw new ApiError(400, 'INVALID_TARGET');
  const data = await request('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { token, signal, body: { inspectionUrl: url, siteUrl: site, languageCode: 'ko-KR' } });
  if (!data.inspectionResult?.indexStatusResult) throw new ApiError(502, 'INVALID_RESPONSE');
  return data.inspectionResult.indexStatusResult;
}

export function searchError(error) {
  if (error.code === 'NO_SITE') return '이 계정에 korea-jogan.com의 Search Console 조회 권한이 없습니다. 해당 속성의 권한이 있는 계정으로 연결해 주세요.';
  if (error.status === 401) return '검색 연결이 만료되었습니다. Google 검색에 다시 연결해 주세요.';
  if (error.status === 403) return 'Google Cloud의 Search Console API 사용 설정과 이 계정의 속성 조회 권한을 확인한 뒤 다시 연결해 주세요.';
  if (error.status === 429) return 'Google 검색 조회 한도에 도달했습니다. 잠시 후 새로고침해 주세요.';
  if (error.name === 'AbortError') return '검색 조회 시간이 초과됐습니다. 연결 상태를 확인한 뒤 다시 조회해 주세요.';
  return '검색 자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
}
