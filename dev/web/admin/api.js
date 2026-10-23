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

function realtime(dimensions, metrics) {
  return {
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
    limit: '30', returnPropertyQuota: true,
    ...(dimensions.length && dimensions[0] !== 'minutesAgo' ? { orderBys: [{ metric: { metricName: metrics[0] }, desc: true }] } : {})
  };
}

export async function loadRealtime(token, signal) {
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${CONFIG.propertyId}:runRealtimeReport`;
  // 전체 이용자 수는 내역을 더하지 않고 차원 없는 중복 제거 집계를 쓴다
  const bodies = [
    realtime([], ['activeUsers', 'screenPageViews', 'eventCount']),
    realtime(['minutesAgo'], ['eventCount']),
    realtime(['unifiedScreenName'], ['activeUsers']),
    realtime(['deviceCategory'], ['activeUsers'])
  ];
  const results = await Promise.allSettled(bodies.map((body) => request(endpoint, { token, signal, body })));
  const failed = results.find((result) => result.status === 'rejected' && [401, 403].includes(result.reason.status)) || results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((result) => result.value);
}

export async function loadReports(token, period, signal) {
  const startDate = { today: 'today', '7daysAgo': '6daysAgo', '28daysAgo': '27daysAgo' }[period];
  if (!startDate) throw new ApiError(400, 'INVALID_PERIOD');
  const common = {
    dateRanges: [{ startDate, endDate: 'today' }],
    dimensionFilter: { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: CONFIG.hostname } } },
    returnPropertyQuota: true
  };
  const data = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${CONFIG.propertyId}:batchRunReports`, {
    token, signal, body: { requests: [
      { ...common, metrics: ['activeUsers', 'screenPageViews', 'sessions'].map((name) => ({ name })) },
      { ...common, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: '10' },
      { ...common, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: '10' }
    ] }
  });
  if (!Array.isArray(data.reports) || data.reports.length !== 3) throw new ApiError(502, 'INVALID_RESPONSE');
  return data.reports;
}

export function values(report) {
  return (report.rows?.[0]?.metricValues || []).map((value) => Number(value.value) || 0);
}

export function rows(report) {
  return (report.rows || []).map((row) => ({ label: row.dimensionValues?.[0]?.value || '(not set)', value: Number(row.metricValues?.[0]?.value) || 0 }));
}

export function explain(error) {
  if (error.code === 'SERVICE_DISABLED' || error.code === 'ACCESS_NOT_CONFIGURED') return 'Google Cloud에서 Google Analytics Data API를 사용 설정한 뒤 다시 연결해 주세요.';
  if (error.status === 401) return '인증이 만료되었습니다. Google 계정으로 다시 연결해 주세요.';
  if (error.status === 403) return '이 계정으로 통계를 읽을 수 없습니다. 속성 559927668의 조회 권한과 Analytics Data API 사용 설정을 확인해 주세요.';
  if (error.status === 429) return 'Google API 요청 한도에 도달했습니다. 자동 갱신을 멈췄습니다. 잠시 후 새로고침해 주세요.';
  if (error.name === 'AbortError') return '요청 시간이 초과되었습니다. 네트워크를 확인하고 새로고침해 주세요.';
  return '통계를 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.';
}
