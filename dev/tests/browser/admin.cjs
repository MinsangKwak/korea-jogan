'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openBrowser } = require('./browser.cjs');
const web = path.resolve(__dirname, '../../web');

function publishedIndex() {
  const issues = path.join(web, 'data/issues');
  const index = JSON.parse(fs.readFileSync(path.join(issues, 'index.json'), 'utf8'));
  const published = index.issues.filter((date) => JSON.parse(fs.readFileSync(path.join(issues, date + '.json'), 'utf8')).status === 'published');
  return { ...index, latest: published[0], issues: published };
}
const clientId = '123456789-test.apps.googleusercontent.com';
const storageKey = 'jogan.admin.oauth-client-id';
const scope = 'https://www.googleapis.com/auth/analytics.readonly';
const gis = `window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){
  window.testAuth=()=>options.callback({access_token:'test-only-token',expires_in:3600,scope:'${scope}'});
  window.testDeny=()=>options.callback({error:'access_denied'});
  window.testPopup=()=>options.error_callback({type:'popup_closed'});
}}},hasGrantedAllScopes:()=>true,revoke:()=>{window.testRevoked=true}}}};`;
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
let browser;
let count = 0;
const row = (metrics, dimension) => ({ metricValues: metrics.map((value) => ({ value: String(value) })), dimensionValues: dimension === undefined ? [] : [].concat(dimension).map((value) => ({ value })) });
const report = (metrics, dimension) => ({ rows: [row(metrics, dimension)], metadata: { timeZone: 'Asia/Seoul' } });
// 요청한 차원·기간에 맞춰 GA4 응답을 흉내 낸다
function fake(item, state) {
  const dimension = item.dimensions?.[0]?.name;
  if (!dimension) return item.dateRanges[0].startDate === 'today' ? report([4, 480, 8]) : item.metrics.length === 4 ? report([12, 39, 15, 1800]) : report([12, 2160, 39]);
  if (dimension === 'date') return { rows: state.trendRows || ['20261019', '20261020', '20261021'].map((date, index) => row([index + 2, index * 3], date)) };
  if (dimension === 'dateHour') return { rows: state.trendRows || ['2026110600', '2026110608', '2026110614'].map((date, index) => row([index * 2, index * 3], date)) };
  if (dimension === 'sessionSourceMedium') return { ...report([7, 5, 210], 'naver_cafe / referral'), metadata: { subjectToThresholding: !!state.threshold } };
  if (dimension === 'sessionCampaignName') return report([4, 3, 180], ['202611_readership', 'threads / social']);
  if (dimension === 'landingPage') return report([3, 2, 0], '/topics/muan-airport/');
  if (dimension === 'newVsReturning') return { rows: [row([5, 4, 100], 'new'), row([2, 1, 80], 'returning')] };
  if (dimension === 'eventName' && item.metrics[0].name === 'eventCount') return report([3, 2], 'reader_feed_copy');
  if (dimension === 'eventName') return { rows: [row([7, 7, 0], 'section_media'), row([5, 9, 600], 'dwell_media'), row([2, 2, 0], 'section_fiscal'), row([2, 2, 90], 'dwell_fiscal')] };
  if (dimension === 'pagePath') return report([22, 10, 1200], '<img src=x onerror=alert(1)> 조간');
  if (dimension === 'sessionDefaultChannelGroup') return report([10], 'Organic Search');
  if (dimension === 'region') return report([5], 'Busan');
  if (dimension === 'deviceCategory') return report([4], 'mobile');
  throw new Error('예상하지 못한 보고서: ' + dimension);
}

async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, hasTouch: !!options.touch, colorScheme: options.dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  if (!options.noConfig) await context.addInitScript(({ key, id }) => localStorage.setItem(key, id), { key: storageKey, id: clientId });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const state = { error: options.error, empty: options.empty, trendRows: options.trendRows, threshold: options.threshold, hang: false, delay: false, batchError: false };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'accounts.google.com') {
      if (options.gisFailed) return route.abort();
      return route.fulfill({ body: gis, contentType: 'application/javascript' });
    }
    if (url.hostname === 'analyticsdata.googleapis.com') {
      requests.push(route.request());
      assert.equal(route.request().headers().authorization, 'Bearer test-only-token');
      assert.equal(route.request().method(), 'POST');
      assert.ok(url.pathname.includes('properties/559927668:'));
      if (state.hang) return;
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, 200));
      if (state.error || (state.batchError && url.pathname.endsWith(':batchRunReports'))) {
        const status = state.error || 500;
        return route.fulfill({ status, json: { error: { status: status === 403 ? 'PERMISSION_DENIED' : 'ERROR', ...(options.disabledApi ? { details: [{ reason: 'SERVICE_DISABLED' }] } : {}) } } });
      }
      const body = route.request().postDataJSON();
      assert.ok(url.pathname.endsWith(':batchRunReports'));
      return route.fulfill({ json: { reports: body.requests.map((item) => (state.empty ? {} : fake(item, state))) } });
    }
    if (url.hostname !== 'jogan.test') return route.abort();
    if (options.publishFailed && url.pathname === '/data/issues/index.json') return route.fulfill({ status: 404, body: '' });
    // 배포용 기본 클라이언트 ID와 상관없이 미설정 상태부터 검사한다
    // 배포본에는 공개된 호만 올라가므로, 아침 발행 전 dev의 초안은 색인에서 뺀다
    if (url.pathname === '/data/issues/index.json') return route.fulfill({ json: publishedIndex() });
    if (url.pathname === '/admin/config.js') return route.fulfill({ body: fs.readFileSync(path.join(web, 'admin/config.js'), 'utf8').replace(/clientId: '[^']*'/, "clientId: ''"), contentType: mime['.js'] });
    let file = path.join(web, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    try { return await route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://jogan.test/admin/');
  return { context, page, errors, requests, state };
}

async function connect(page) {
  await page.waitForFunction(() => !!window.google?.accounts?.oauth2);
  await page.locator('#connect').click();
  await page.evaluate(() => window.testAuth());
}

async function settled(page) {
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
}

async function check(name, options, fn) {
  const fixtureData = await fixture(options);
  try {
    await fn(fixtureData);
    assert.deepEqual(fixtureData.errors, []);
    count += 1;
    console.log('통과:', name);
  } finally { await fixtureData.context.close(); }
}

(async () => {
  // 배포 설정의 클라이언트 ID는 비어 있거나 공개 웹 클라이언트 ID 꼴이어야 한다(보안 비밀번호 금지)
  const deployed = /clientId: '([^']*)'/.exec(fs.readFileSync(path.join(web, 'admin/config.js'), 'utf8'))[1];
  assert.ok(deployed === '' || /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(deployed), deployed);
  browser = await openBrowser();
  await check('로그인 없이 주제별 소개와 채널별 추적 링크 생성', { noConfig: true, width: 320 }, async ({ page, requests }) => {
    await page.locator('#campaignUrl').waitFor();
    await page.waitForFunction(() => document.getElementById('campaignUrl').value.includes('utm_source='));
    assert.equal(await page.locator('#privateData').isVisible(), false);
    await page.locator('#campaignTopic').selectOption('exchange');
    await page.locator('#campaignChannel').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.locator('#campaignName').fill('readership_test');
    await page.locator('#campaignContent').fill('exchange_b');
    await page.locator('#campaignForm button').click();
    const url = new URL(await page.locator('#campaignUrl').inputValue());
    assert.equal(url.origin, 'https://korea-jogan.com');
    assert.equal(url.pathname, '/indicators/usd-krw/');
    assert.deepEqual(Object.fromEntries(url.searchParams), { utm_source: 'threads', utm_medium: 'social', utm_campaign: 'readership_test', utm_content: 'exchange_b' });
    assert.match(await page.locator('#campaignDraft').inputValue(), /환율 기사마다 숫자가 다르다면/);
    assert.equal((await page.locator('#campaignDraft').inputValue()).split('\n').filter(Boolean).length, 5);
    assert.equal(requests.length, 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  });
  await check('잘못된 캠페인 입력을 차단하고 첫 오류에 포커스', {}, async ({ page }) => {
    await page.waitForFunction(() => !!document.getElementById('campaignUrl').value);
    await page.locator('#campaignName').fill('<img src=x onerror=alert(1)>');
    await page.locator('#campaignForm button').click();
    assert.equal(await page.locator('#campaignName').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#campaignName').evaluate((field) => field === document.activeElement), true);
    assert.equal(await page.locator('#copyCampaignDraft').isDisabled(), true);
    assert.equal(await page.locator('#campaignUrl').inputValue(), '');
    assert.equal(await page.locator('#campaignForm img').count(), 0);
    await page.locator('#campaignName').fill('readership_1');
    assert.equal(await page.locator('#campaignName').getAttribute('aria-invalid'), null);
    assert.equal(await page.locator('#copyCampaignDraft').isEnabled(), true);
  });
  await check('홍보 글 복사 성공과 제한 환경의 직접 복사 안내', {}, async ({ page, requests }) => {
    await page.waitForFunction(() => !!document.getElementById('campaignUrl').value);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.testCopiedText = value; } } }));
    await page.locator('#copyCampaignDraft').click();
    await page.waitForFunction(() => document.getElementById('campaignStatus').textContent.includes('복사했습니다'));
    assert.equal(await page.evaluate(() => window.testCopiedText), await page.locator('#campaignDraft').inputValue());
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } }));
    await page.locator('#copyCampaignLink').click();
    await page.waitForFunction(() => document.getElementById('campaignStatus').textContent.includes('직접 복사'));
    assert.equal(await page.locator('#campaignUrl').evaluate((field) => field === document.activeElement && field.selectionEnd === field.value.length), true);
    assert.equal(await page.locator('#copyCampaignLink').isEnabled(), true);
    assert.equal(requests.length, 0);
  });
  await check('미설정 안내와 공개 발행 현황, 로그인 전 비공개 통계 없음', { noConfig: true }, async ({ page, requests }) => {
    assert.equal(await page.locator('#setup').getAttribute('open'), '');
    assert.equal(await page.locator('#privateData').isVisible(), false);
    await page.locator('#publishData').waitFor({ state: 'visible' });
    assert.equal(requests.length, 0);
    await page.locator('#connect').click();
    assert.equal(await page.locator('#clientId').evaluate((element) => element === document.activeElement), true);
    await page.locator('#clientId').fill('client-secret');
    await page.locator('#configForm button').click();
    assert.equal(await page.locator('#clientId').getAttribute('aria-invalid'), 'true');
    await page.locator('#clientId').fill(clientId);
    await page.locator('#configForm button').click();
    await connect(page);
    await settled(page);
    assert.equal(await page.locator('#todayUsers').innerText(), '4');
  });
  for (const width of [320, 390, 768, 1440]) {
    await check('통계·토큰 비저장·전체 폭 ' + width, { width, dark: width === 768 }, async ({ page, requests }) => {
      await connect(page); await settled(page);
      assert.equal(await page.locator('#todayUsers').innerText(), '4');
      assert.equal(await page.locator('#todayTime').innerText(), '2분');
      assert.equal(await page.locator('#todayNote').innerText(), '오늘 0시부터 · 조회수 8');
      assert.equal(await page.locator('#weekUsers').innerText(), '12');
      assert.equal(await page.locator('#weekTime').innerText(), '3분');
      assert.equal(await page.locator('#reportUsers').innerText(), '12');
      assert.equal(await page.locator('#reportTimeAvg').innerText(), '2분 30초');
      assert.ok((await page.locator('#topPages').innerText()).includes('<img src=x onerror=alert(1)>'));
      assert.equal(await page.locator('#topPages img').count(), 0);
      const data = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.deepEqual(data.local, { [storageKey]: clientId, 'kj-internal': '1' });
      assert.deepEqual(data.session, {});
      assert.ok(data.scroll <= data.width, JSON.stringify(data));
      assert.equal(requests.length, 3);
      assert.equal(await page.locator('#trendChart .admin-bar').count(), 3);
      assert.ok((await page.locator('#trendAxis').innerText()).includes('최고 10/21'));
      // 섹션은 총 체류 시간 순서로, 읽은 사람·1인 평균·총 체류를 함께 보인다
      const sectionRows = await page.locator('#sections tbody tr').allInnerTexts();
      assert.equal(sectionRows.length, 2);
      assert.match(sectionRows[0], /언론\s+7\s+2분\s+10분/);
      assert.match(sectionRows[1], /재정\s+2\s+45초\s+1분 30초/);
      assert.ok((await page.locator('#regions').innerText()).includes('부산'));
      assert.ok((await page.locator('#devices').innerText()).includes('모바일'));
      const batches = requests.map((item) => item.postDataJSON());
      const main = batches.find((item) => item.requests.length === 5 && !item.requests[0].dimensions).requests;
      assert.deepEqual(main[4].dimensionFilter.andGroup.expressions[1].orGroup.expressions.map((item) => item.filter.stringFilter.value), ['section_', 'dwell_']);
      assert.deepEqual(main.slice(0, 3).map((item) => item.dateRanges[0].startDate), ['6daysAgo', 'today', '6daysAgo']);
      assert.equal(main[0].dimensionFilter.filter.stringFilter.value, 'korea-jogan.com');
      if (process.env.SCREENSHOT_DIR && [390, 1440].includes(width)) {
        fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'admin-' + width + '.png'), fullPage: true });
      }
      await page.locator('#disconnect').click();
      assert.equal(await page.locator('#privateData').isVisible(), false);
      assert.equal(await page.locator('#todayUsers').innerText(), '—');
      assert.equal(await page.locator('#topPages').innerText(), '');
      assert.equal(await page.locator('#todayNote').innerText(), '오늘 0시부터 · 고유 사용자');
      assert.equal(await page.locator('#weekNote').innerText(), '오늘 포함 7일 · 고유 사용자');
      assert.equal(await page.evaluate(() => window.testRevoked), true);
      assert.equal(await page.locator('#connect').evaluate((element) => element === document.activeElement), true);
    });
  }
  await check('유입·캠페인·첫 페이지·재방문의 기간 일치와 실제 단위', { width: 320 }, async ({ page, requests }) => {
    await connect(page); await settled(page);
    assert.match(await page.locator('#sources').innerText(), /naver_cafe \/ referral\s+7\s+5\s+30초/);
    assert.match(await page.locator('#campaigns').innerText(), /202611_readership · threads \/ social\s+4\s+3\s+45초/);
    assert.match(await page.locator('#landings').innerText(), /\/topics\/muan-airport\/\s+3\s+2\s+0초/);
    assert.match(await page.locator('#returning').innerText(), /재방문\s+2\s+1\s+40초/);
    assert.match(await page.locator('#readerActions').innerText(), /RSS 주소 복사\s+3\s+2/);
    assert.ok(await page.locator('#sources').evaluate((element) => element.scrollWidth > element.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.locator('#period').selectOption('28daysAgo'); await settled(page);
    const acquisition = requests.map((item) => item.postDataJSON()).findLast((item) => item.requests[0].dimensions?.[0]?.name === 'sessionSourceMedium');
    assert.equal(acquisition.requests.length, 5);
    assert.ok(acquisition.requests.every((item) => item.dateRanges[0].startDate === '27daysAgo'));
    assert.ok(acquisition.requests.every((item) => item.limit === '10' || item.limit === '5'));
    await page.locator('#disconnect').click();
    for (const id of ['sources', 'campaigns', 'landings', 'returning', 'readerActions']) assert.equal(await page.locator('#' + id).textContent(), '');
  });
  await check('Google의 소규모 자료 생략과 빈 유입 보고서를 구분', { threshold: true }, async ({ page, state }) => {
    await connect(page); await settled(page);
    assert.match(await page.locator('#acquisitionNote').innerText(), /일부 소규모 자료가 생략/);
    state.empty = true;
    await page.locator('#refresh').click(); await settled(page);
    assert.match(await page.locator('#sources').innerText(), /집계된 데이터가 없습니다/);
    assert.match(await page.locator('#readerActions').innerText(), /집계된 데이터가 없습니다/);
  });
  await check('추이 툴팁의 실제 수치·0명·호버 유지·Esc 닫기', { width: 1440, trendRows: [row([12, 89], '20261106'), row([1234, 2345], '20261104'), row([0, 0], '20261105')] }, async ({ page, requests }) => {
    await connect(page); await settled(page);
    const points = page.locator('#trendChart button');
    const tooltip = page.getByRole('tooltip');
    await points.first().hover({ position: { x: 8, y: 180 } });
    assert.equal(await tooltip.isVisible(), true);
    assert.equal(await page.locator('#trendTooltipDate').innerText(), '2026년 11월 4일');
    assert.equal(await page.locator('#trendTooltipUsers').innerText(), '1,234명');
    assert.equal(await page.locator('#trendTooltipViews').innerText(), '2,345회');
    await tooltip.hover();
    assert.equal(await tooltip.isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await tooltip.isVisible(), false);
    await points.nth(1).hover({ position: { x: 8, y: 180 } });
    assert.equal(await page.locator('#trendTooltipUsers').innerText(), '0명');
    assert.equal(await page.locator('#trendTooltipViews').innerText(), '0회');
    await points.last().hover({ position: { x: 8, y: 180 } });
    assert.equal(await page.locator('#trendTooltipDate').innerText(), '2026년 11월 6일');
    assert.equal(await page.locator('#trendTooltipViews').innerText(), '89회');
    assert.equal(requests.length, 3);
    if (process.env.SCREENSHOT_DIR) await page.locator('#trendPlot').locator('..').screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'admin-tooltip-desktop.png') });
    await page.locator('h1').hover();
    assert.equal(await tooltip.isVisible(), false);
  });
  await check('추이 키보드 이동·기간별 시간·재조회와 연결 해제 정리', {}, async ({ page, state }) => {
    await connect(page); await settled(page);
    const points = page.locator('#trendChart button');
    const tooltip = page.getByRole('tooltip');
    await points.first().focus();
    assert.match(await points.first().getAttribute('aria-label'), /2026년 10월 19일 · 방문자 2명 · 조회수 0회/);
    assert.equal(await tooltip.isVisible(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#trendTooltipDate').innerText(), '2026년 10월 20일');
    await page.keyboard.press('Escape');
    assert.equal(await tooltip.isVisible(), false);
    assert.equal(await points.nth(1).evaluate((point) => point === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await tooltip.isVisible(), true);
    state.delay = true;
    await page.locator('#period').selectOption('today');
    assert.equal(await tooltip.isVisible(), false);
    await settled(page);
    await points.first().focus();
    assert.equal(await page.locator('#trendTooltipDate').innerText(), '2026년 11월 6일 0시');
    assert.equal(await page.locator('#trendTooltipUsers').innerText(), '0명');
    state.empty = true;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await tooltip.isVisible(), false);
    assert.equal(await points.count(), 0);
    state.empty = false;
    await page.locator('#refresh').click(); await settled(page);
    await points.first().focus();
    await page.locator('#disconnect').click();
    assert.equal(await tooltip.isVisible(), false);
    assert.equal(await page.locator('#trendTooltipDate').textContent(), '');
    assert.equal(await page.locator('#trendTooltipUsers').textContent(), '');
    assert.equal(await page.locator('#trendTooltipViews').textContent(), '');
    assert.equal(await points.count(), 0);
  });
  await check('320px 터치·28개 열 가로 이동·다크 화면 툴팁 경계', { width: 320, touch: true, trendRows: Array.from({ length: 28 }, (_, index) => row([index, index * 3], new Date(Date.UTC(2026, 9, 10 + index)).toISOString().slice(0, 10).replaceAll('-', ''))) }, async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('jogan-theme', 'dark'));
    await page.reload();
    await connect(page); await settled(page);
    await page.locator('#period').selectOption('28daysAgo'); await settled(page);
    const points = page.locator('#trendChart button');
    const tooltip = page.getByRole('tooltip');
    assert.ok((await points.first().boundingBox()).width >= 24);
    for (const point of [points.first(), points.last()]) {
      await point.scrollIntoViewIfNeeded();
      await point.tap({ position: { x: 12, y: 180 } });
      assert.equal(await tooltip.isVisible(), true);
      const tip = await tooltip.boundingBox();
      const plot = await page.locator('#trendPlot').boundingBox();
      assert.ok(tip.x >= plot.x - 1 && tip.x + tip.width <= plot.x + plot.width + 1, JSON.stringify({ tip, plot }));
    }
    assert.equal(await page.locator('#trendTooltipDate').innerText(), '2026년 11월 6일');
    assert.equal(await page.locator('#trendTooltipUsers').innerText(), '27명');
    assert.equal(await page.locator('#trendTooltipViews').innerText(), '81회');
    assert.ok(await page.locator('#trendViewport').evaluate((viewport) => viewport.scrollLeft > 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    if (process.env.SCREENSHOT_DIR) await page.locator('#trendPlot').locator('..').screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'admin-tooltip-mobile-dark.png') });
    await page.locator('h1').tap();
    assert.equal(await tooltip.isVisible(), false);
  });
  await check('0명과 빈 목록을 정상 데이터로 표시', { empty: true }, async ({ page }) => {
    await connect(page); await settled(page);
    assert.equal(await page.locator('#todayUsers').innerText(), '0');
    assert.equal(await page.locator('#todayTime').innerText(), '—');
    assert.ok((await page.locator('#topPages').innerText()).includes('데이터가 없습니다'));
    assert.ok((await page.locator('#sections').innerText()).includes('데이터가 없습니다'));
  });
  for (const status of [401, 403, 429, 500]) {
    await check('Google API ' + status + ' 처리', { error: status }, async ({ page }) => {
      await connect(page); await settled(page);
      if (status === 401 || status === 403) {
        assert.equal(await page.locator('#privateData').isVisible(), false);
        assert.ok((await page.locator('#authMessage').innerText()).includes(status === 401 ? '만료' : '권한'));
      } else {
        assert.ok((await page.locator('#reportError').innerText()).includes(status === 429 ? '한도' : '불러오지 못했습니다'));
        assert.equal(await page.locator('#todayUsers').innerText(), '—');
      }
    });
  }
  await check('API 비활성화 안내', { error: 403, disabledApi: true }, async ({ page }) => {
    await connect(page); await settled(page);
    assert.ok((await page.locator('#authMessage').innerText()).includes('사용 설정'));
  });
  await check('조회 도중 권한 회수 시 이전 통계 제거', {}, async ({ page, state }) => {
    await connect(page); await settled(page);
    assert.equal(await page.locator('#todayUsers').innerText(), '4');
    state.error = 403;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await page.locator('#privateData').isVisible(), false);
    assert.equal(await page.locator('#todayUsers').innerText(), '—');
    assert.equal(await page.locator('#topPages').innerText(), '');
  });
  await check('팝업 종료·동의 거절 후 재시도', {}, async ({ page }) => {
    await page.waitForFunction(() => !!window.google);
    for (const action of ['testPopup', 'testDeny']) {
      await page.locator('#connect').click();
      await page.evaluate((name) => window[name](), action);
      assert.equal(await page.locator('#connect').isEnabled(), true);
      assert.equal(await page.locator('#privateData').isVisible(), false);
    }
    await connect(page); await settled(page);
    assert.equal(await page.locator('#todayUsers').innerText(), '4');
  });
  await check('기간 변경·중복 클릭 방지·조회 실패와 재시도', {}, async ({ page, requests, state }) => {
    await connect(page); await settled(page);
    state.delay = true;
    await page.locator('#period').selectOption('28daysAgo');
    assert.equal(await page.locator('#refresh').isEnabled(), false);
    assert.equal(await page.locator('#reportUsers').innerText(), '—');
    await settled(page);
    const batches = requests.filter((item) => item.url().endsWith(':batchRunReports'));
    assert.equal(batches.at(-1).postDataJSON().requests[0].dateRanges[0].startDate, '27daysAgo');
    state.batchError = true;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await page.locator('#reportUsers').innerText(), '12');
    assert.ok((await page.locator('#reportError').innerText()).includes('마지막 조회 결과'));
    state.batchError = false;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await page.locator('#reportError').innerText(), '');
  });
  await check('연결 해제 뒤 늦게 온 응답 차단', {}, async ({ page, state }) => {
    await connect(page); await settled(page);
    state.delay = true;
    await page.locator('#refresh').click();
    await page.locator('#disconnect').click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#privateData').isVisible(), false);
    assert.equal(await page.locator('#todayUsers').innerText(), '—');
    assert.equal(await page.locator('#connection').innerText(), '연결 전');
  });
  await check('5분 갱신·숨긴 탭 중지', {}, async ({ page, requests }) => {
    await page.clock.install();
    await connect(page); await settled(page);
    const firstCount = requests.length;
    await page.clock.runFor(60010);
    assert.equal(requests.length, firstCount);
    await page.clock.runFor(240010); await settled(page);
    assert.equal(requests.length, firstCount + 3);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(300010);
    assert.equal(requests.length, firstCount + 3);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await settled(page);
    assert.equal(requests.length, firstCount + 6);
  });
  await check('12초 요청 중단 후 재시도', {}, async ({ page, state, requests }) => {
    await page.clock.install();
    await connect(page); await settled(page);
    state.hang = true;
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('refresh').disabled);
    while (requests.length < 4) await page.waitForTimeout(10);
    await page.clock.runFor(12010); await settled(page);
    assert.ok((await page.locator('#reportError').innerText()).includes('초과'));
    assert.equal(await page.locator('#todayUsers').innerText(), '4');
    state.hang = false;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await page.locator('#reportError').innerText(), '');
  });
  await check('인증 만료 시 수치 제거', {}, async ({ page }) => {
    await page.clock.install();
    await connect(page); await settled(page);
    await page.clock.fastForward(3600000);
    assert.equal(await page.locator('#privateData').isVisible(), false);
    assert.equal(await page.locator('#reportUsers').innerText(), '—');
    assert.ok((await page.locator('#authMessage').innerText()).includes('만료'));
  });
  await check('발행 정보 실패와 복구 동작', { publishFailed: true }, async ({ page }) => {
    await page.locator('#retryPublish').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#publishData').isVisible(), false);
    await page.locator('#retryPublish').click();
    await page.locator('#retryPublish').waitFor({ state: 'visible' });
  });
  await check('Google 인증 스크립트 차단 안내', { gisFailed: true }, async ({ page }) => {
    await page.locator('#connect').click();
    await page.waitForFunction(() => !document.getElementById('connect').disabled);
    await page.waitForFunction(() => document.getElementById('authMessage').textContent.includes('불러오지 못했습니다'));
    assert.equal(await page.locator('#privateData').isVisible(), false);
  });
  await check('신문에서 저장한 화면 모드를 관리자에도 적용', {}, async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('jogan-theme', 'dark'));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    assert.equal(await page.locator('html').evaluate((e) => getComputedStyle(e).colorScheme), 'dark');
    await page.evaluate(() => localStorage.setItem('jogan-theme', 'light'));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
    assert.equal(await page.locator('html').evaluate((e) => getComputedStyle(e).colorScheme), 'light');
  });
  console.log('관리자 브라우저 검사 ' + count + '건 통과');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
