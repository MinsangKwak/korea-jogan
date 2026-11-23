import { request, ApiError, sitesUrl, inspectionUrl, searchProperties } from './api.js';
import { loadPilotQuestions } from './question-pilot.js';

const ORIGIN = 'https://korea-jogan.com';
export const SEARCH_TARGETS = [ORIGIN + '/', ORIGIN + '/politics/', ORIGIN + '/topics/', ORIGIN + '/topics/muan-airport/', ORIGIN + '/indicators/', ORIGIN + '/indicators/usd-krw/'];
const BRAND_QUERY = '(?i)(대한민국\\s*조간|코리아\\s*조간|korea[-\\s]*jogan|오늘\\s*정치\\s*한\\s*장)';
let pilotTargets = new Map();
let inspectionTopics = new Map();

export async function loadInspectionQuestions() {
  const questions = await loadPilotQuestions();
  pilotTargets = new Map(questions.map(({ path, label }) => [ORIGIN + path, label]));
  return Array.from(pilotTargets).filter(([url]) => url.startsWith(ORIGIN + '/politics/'));
}

export async function loadInspectionTopics() {
  const { items } = await request('/data/trackers.json');
  const topics = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) continue;
    if (typeof item.title !== 'string' || !item.title.trim() || !item.summary || !(item.steps?.length || item.links?.length)) continue;
    const url = ORIGIN + '/topics/' + item.id + '/';
    if (!topics.has(url)) topics.set(url, item.shortTitle || item.title);
  }
  inspectionTopics = topics;
  return Array.from(topics);
}

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
    const data = await request(sitesUrl, { token, signal });
    const entries = data.siteEntry || [];
    site = searchProperties.find((url) => entries.some((entry) => entry.siteUrl === url && ['siteOwner', 'siteFullUser', 'siteRestrictedUser'].includes(entry.permissionLevel)));
  }
  if (!searchProperties.includes(site)) throw new ApiError(403, 'NO_SITE');
  const range = searchRange(days);
  const filters = [{ dimension: 'page', operator: 'includingRegex', expression: '^https://korea-jogan[.]com/' }];
  if (country === 'kor') filters.push({ dimension: 'country', operator: 'equals', expression: 'kor' });
  const common = { ...range, type: 'web', dataState: 'final', dimensionFilterGroups: [{ groupType: 'and', filters }] };
  const endpoint = sitesUrl + '/' + encodeURIComponent(site);
  const query = (dimensions, rowLimit = 10) => request(endpoint + '/searchAnalytics/query', { token, signal, body: { ...common, dimensions, rowLimit } });
  async function loadPilot() {
    const questions = await loadPilotQuestions();
    const pathPattern = '^https://korea-jogan[.]com(' + questions.map(({ path }) => path).join('|') + ')$';
    const pilotFilters = [
      { dimension: 'page', operator: 'includingRegex', expression: pathPattern },
      { dimension: 'query', operator: 'excludingRegex', expression: BRAND_QUERY },
      ...filters.filter((item) => item.dimension === 'country')
    ];
    const report = await request(endpoint + '/searchAnalytics/query', { token, signal, body: {
      ...common, dimensions: ['page'], rowLimit: questions.length, dimensionFilterGroups: [{ groupType: 'and', filters: pilotFilters }]
    } });
    return questions.map(({ label, path }) => {
      const row = report.rows?.find((item) => item.keys?.[0] === ORIGIN + path);
      return { label, impressions: row?.impressions || 0, clicks: row?.clicks || 0 };
    });
  }
  const [summary, queries, pages, dates, sitemaps, pilot] = await Promise.all([
    query([]), query(['query']), query(['page']), query(['date'], 31), request(endpoint + '/sitemaps', { token, signal }),
    loadPilot().catch((error) => {
      if (error.status === 401 || error.status === 403) throw error;
      return null;
    })
  ]);
  return { site, range, summary, queries, pages, dates, sitemaps, pilot };
}

export async function inspectSearchUrl(token, site, url, signal) {
  if (!searchProperties.includes(site) || !(SEARCH_TARGETS.includes(url) || inspectionTopics.has(url) || pilotTargets.has(url))) throw new ApiError(400, 'INVALID_TARGET');
  const data = await request(inspectionUrl, { token, signal, body: { inspectionUrl: url, siteUrl: site, languageCode: 'ko-KR' } });
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
