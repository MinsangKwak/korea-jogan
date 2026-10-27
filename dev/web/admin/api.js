import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(status, code = '') {
    super('GA4 요청 실패');
    this.status = status;
    this.code = code;
  }
}

export async function request(url, { token, body, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, CONFIG.timeoutMs);
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: body ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : {},
      ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal
    });
    let data;
    try { data = await response.json(); }
    catch { throw new ApiError(response.status || 502, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      const reason = data.error?.details?.flatMap((item) => [item.reason]).find(Boolean);
      throw new ApiError(response.status, reason || data.error?.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// 신문 화면이 보내는 섹션 이벤트만 고른다. section_<id>는 읽은 사람, dwell_<id>는 머문 시간(초, value)
const prefix = (value) => ({ filter: { fieldName: 'eventName', stringFilter: { matchType: 'BEGINS_WITH', value } } });
const sectionFilter = { orGroup: { expressions: [prefix('section_'), prefix('dwell_')] } };
const metric = (...names) => names.map((name) => ({ name }));
const byFirst = (name) => ({ orderBys: [{ metric: { metricName: name }, desc: true }] });

// 기간 보고서와 '오늘·최근 7일' 고정 지표를 batchRunReports 두 번으로 받는다(한 번에 5개까지)
export async function loadReports(token, period, signal) {
  const startDate = { today: 'today', '7daysAgo': '6daysAgo', '28daysAgo': '27daysAgo' }[period];
  if (!startDate) throw new ApiError(400, 'INVALID_PERIOD');
  const host = { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: CONFIG.hostname } } };
  const range = (from) => ({ dateRanges: [{ startDate: from, endDate: 'today' }], dimensionFilter: host, returnPropertyQuota: true });
  const common = range(startDate);
  // 오늘은 시간대별, 그 밖의 기간은 날짜별로 추이를 그린다
  const step = period === 'today' ? 'dateHour' : 'date';
  const glance = metric('activeUsers', 'userEngagementDuration', 'screenPageViews');
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${CONFIG.propertyId}:batchRunReports`;
  const batch = (requests) => request(url, { token, signal, body: { requests } });
  const [main, more] = await Promise.all([
    batch([
      { ...common, metrics: metric('activeUsers', 'screenPageViews', 'sessions', 'userEngagementDuration') },
      { ...range('today'), metrics: glance },
      { ...range('6daysAgo'), metrics: glance },
      { ...common, dimensions: [{ name: step }], metrics: metric('activeUsers', 'screenPageViews'), orderBys: [{ dimension: { dimensionName: step } }], limit: '200' },
      { ...common, dimensionFilter: { andGroup: { expressions: [host, sectionFilter] } }, dimensions: [{ name: 'eventName' }], metrics: metric('totalUsers', 'eventCount', 'eventValue'), ...byFirst('totalUsers'), limit: '40' }
    ]),
    batch([
      { ...common, dimensions: [{ name: 'pagePath' }], metrics: metric('screenPageViews', 'activeUsers', 'userEngagementDuration'), ...byFirst('screenPageViews'), limit: '10' },
      { ...common, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: metric('sessions'), ...byFirst('sessions'), limit: '10' },
      { ...common, dimensions: [{ name: 'region' }], metrics: metric('activeUsers'), ...byFirst('activeUsers'), limit: '10' },
      { ...common, dimensions: [{ name: 'deviceCategory' }], metrics: metric('activeUsers'), ...byFirst('activeUsers'), limit: '10' }
    ])
  ]);
  if (main.reports?.length !== 5 || more.reports?.length !== 4) throw new ApiError(502, 'INVALID_RESPONSE');
  return [...main.reports, ...more.reports];
}

export function values(report) {
  return (report.rows?.[0]?.metricValues || []).map((value) => Number(value.value) || 0);
}

// 첫 지표는 value, 둘째는 second, 전체는 metrics로 돌려준다
export function rows(report) {
  return (report.rows || []).map((row) => {
    const metrics = (row.metricValues || []).map((item) => Number(item.value) || 0);
    return { label: row.dimensionValues?.[0]?.value || '(not set)', value: metrics[0] || 0, second: metrics[1] || 0, metrics };
  });
}

export function explain(error) {
  if (error.code === 'SERVICE_DISABLED' || error.code === 'ACCESS_NOT_CONFIGURED') return 'Google Cloud에서 Google Analytics Data API를 사용 설정한 뒤 다시 연결해 주세요.';
  if (error.status === 401) return '인증이 만료되었습니다. Google 계정으로 다시 연결해 주세요.';
  if (error.status === 403) return '이 계정으로 통계를 읽을 수 없습니다. 속성 559927668의 조회 권한과 Analytics Data API 사용 설정을 확인해 주세요.';
  if (error.status === 429) return 'Google API 요청 한도에 도달했습니다. 자동 갱신을 멈췄습니다. 잠시 후 새로고침해 주세요.';
  if (error.name === 'AbortError') return '요청 시간이 초과되었습니다. 네트워크를 확인하고 새로고침해 주세요.';
  return '통계를 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.';
}
