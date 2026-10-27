'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
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
const report = (metrics, dimensions = []) => ({ rows: [{ metricValues: metrics.map((value) => ({ value: String(value) })), dimensionValues: dimensions.map((value) => ({ value })) }], metadata: { timeZone: 'Asia/Seoul' } });

async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, colorScheme: options.dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  if (!options.noConfig) await context.addInitScript(({ key, id }) => localStorage.setItem(key, id), { key: storageKey, id: clientId });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const state = { error: options.error, empty: options.empty, hang: false, delay: false, batchError: false };
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
      const trend = { rows: ['20261019', '20261020', '20261021'].map((date, index) => ({ dimensionValues: [{ value: date }], metricValues: [{ value: String(index + 2) }, { value: String(index * 3) }] })) };
      if (url.pathname.endsWith(':batchRunReports')) return route.fulfill({ json: { reports: state.empty ? [{}, {}, {}, {}, {}] : [report([12, 39, 15]), report([22], ['/2026-10-23']), report([10], ['Organic Search']), trend, report([7], ['section_media'])] } });
      if (state.empty) return route.fulfill({ json: {} });
      const dimension = body.dimensions[0]?.name;
      const json = !dimension ? report([4, 8, 18]) : dimension === 'minutesAgo' ? report([18], ['0']) : dimension === 'deviceCategory' ? report([4], ['mobile']) : dimension === 'eventName' ? report([3], ['section_regions']) : dimension === 'city' ? report([2], ['Seoul']) : dimension === 'region' ? report([5], ['Busan']) : report([4], ['<img src=x onerror=alert(1)> 조간']);
      return route.fulfill({ json });
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
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
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
    assert.equal(await page.locator('#liveUsers').innerText(), '4');
  });
  for (const width of [320, 390, 768, 1440]) {
    await check('통계·토큰 비저장·전체 폭 ' + width, { width, dark: width === 768 }, async ({ page, requests }) => {
      await connect(page); await settled(page);
      assert.equal(await page.locator('#liveUsers').innerText(), '4');
      assert.equal(await page.locator('#liveViews').innerText(), '8');
      assert.equal(await page.locator('#reportUsers').innerText(), '12');
      assert.equal(await page.locator('#minuteChart .admin-bar').count(), 30);
      assert.ok((await page.locator('#livePages').innerText()).includes('<img src=x onerror=alert(1)>'));
      assert.equal(await page.locator('#livePages img').count(), 0);
      const data = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.deepEqual(data.local, { [storageKey]: clientId });
      assert.deepEqual(data.session, {});
      assert.ok(data.scroll <= data.width, JSON.stringify(data));
      assert.equal(requests.length, 8);
      assert.equal(await page.locator('#trendChart .admin-bar').count(), 3);
      assert.ok((await page.locator('#trendAxis').innerText()).includes('최고 10/21'));
      assert.ok((await page.locator('#sections').innerText()).includes('언론'));
      assert.ok((await page.locator('#liveSections').innerText()).includes('지역'));
      assert.ok((await page.locator('#regions').innerText()).includes('부산'));
      assert.ok((await page.locator('#cities').innerText()).includes('서울'));
      const sectionRequest = requests.find((item) => item.postDataJSON()?.requests?.[4]).postDataJSON().requests[4];
      assert.equal(sectionRequest.dimensionFilter.andGroup.expressions[1].filter.stringFilter.value, 'section_');
      const batch = requests.find((item) => item.url().endsWith(':batchRunReports')).postDataJSON();
      assert.equal(batch.requests[0].dateRanges[0].startDate, '6daysAgo');
      assert.equal(batch.requests[0].dimensionFilter.filter.stringFilter.value, 'korea-jogan.com');
      if (process.env.SCREENSHOT_DIR && [390, 1440].includes(width)) {
        fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'admin-' + width + '.png'), fullPage: true });
      }
      await page.locator('#disconnect').click();
      assert.equal(await page.locator('#privateData').isVisible(), false);
      assert.equal(await page.locator('#liveUsers').innerText(), '—');
      assert.equal(await page.locator('#livePages').innerText(), '');
      assert.equal(await page.evaluate(() => window.testRevoked), true);
      assert.equal(await page.locator('#connect').evaluate((element) => element === document.activeElement), true);
    });
  }
  await check('0명과 빈 목록을 정상 데이터로 표시', { empty: true }, async ({ page }) => {
    await connect(page); await settled(page);
    assert.equal(await page.locator('#liveUsers').innerText(), '0');
    assert.ok((await page.locator('#livePages').innerText()).includes('데이터가 없습니다'));
  });
  for (const status of [401, 403, 429, 500]) {
    await check('Google API ' + status + ' 처리', { error: status }, async ({ page }) => {
      await connect(page); await settled(page);
      if (status === 401 || status === 403) {
        assert.equal(await page.locator('#privateData').isVisible(), false);
        assert.ok((await page.locator('#authMessage').innerText()).includes(status === 401 ? '만료' : '권한'));
      } else {
        assert.ok((await page.locator('#realtimeError').innerText()).includes(status === 429 ? '한도' : '불러오지 못했습니다'));
        assert.equal(await page.locator('#liveUsers').innerText(), '—');
      }
    });
  }
  await check('API 비활성화 안내', { error: 403, disabledApi: true }, async ({ page }) => {
    await connect(page); await settled(page);
    assert.ok((await page.locator('#authMessage').innerText()).includes('사용 설정'));
  });
  await check('조회 도중 권한 회수 시 이전 통계 제거', {}, async ({ page, state }) => {
    await connect(page); await settled(page);
    assert.equal(await page.locator('#liveUsers').innerText(), '4');
    state.error = 403;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await page.locator('#privateData').isVisible(), false);
    assert.equal(await page.locator('#liveUsers').innerText(), '—');
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
    assert.equal(await page.locator('#liveUsers').innerText(), '4');
  });
  await check('기간 변경·중복 클릭 방지·부분 실패와 재시도', {}, async ({ page, requests, state }) => {
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
    assert.equal(await page.locator('#liveUsers').innerText(), '4');
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
    assert.equal(await page.locator('#liveUsers').innerText(), '—');
    assert.equal(await page.locator('#connection').innerText(), '연결 전');
  });
  await check('60초 갱신·숨긴 탭 중지·5분 보고서 캐시', {}, async ({ page, requests }) => {
    await page.clock.install();
    await connect(page); await settled(page);
    const firstCount = requests.length;
    await page.clock.runFor(60010); await settled(page);
    assert.equal(requests.length, firstCount + 6);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(60010);
    assert.equal(requests.length, firstCount + 6);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await settled(page);
    assert.equal(requests.length, firstCount + 12);
  });
  await check('12초 요청 중단 후 재시도', {}, async ({ page, state, requests }) => {
    await page.clock.install();
    await connect(page); await settled(page);
    state.hang = true;
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('refresh').disabled);
    while (requests.length < 14) await page.waitForTimeout(10);
    await page.clock.runFor(12010); await settled(page);
    assert.ok((await page.locator('#realtimeError').innerText()).includes('초과'));
    assert.equal(await page.locator('#liveUsers').innerText(), '4');
    state.hang = false;
    await page.locator('#refresh').click(); await settled(page);
    assert.equal(await page.locator('#realtimeError').innerText(), '');
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
  console.log('관리자 브라우저 검사 ' + count + '건 통과');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
