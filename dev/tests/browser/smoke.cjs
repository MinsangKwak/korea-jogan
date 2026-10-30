'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-browser-'));
const web = path.join(temp, 'web');
fs.cpSync(path.join(repo, 'dev/web'), web, { recursive: true });
execFileSync('python3', ['-c', 'import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);import build_pages as b;b.PUBLIC=Path(sys.argv[2]);b.ISSUES=b.PUBLIC/"data/issues";b.build()', path.join(repo, 'dev/pipeline/build'), web]);
// 화면이 실제로 쓰는 목록은 생성한 index.html에 실린 것이다.
// data/issues/index.json에는 공개 전 초안도 들어 있어 그대로 쓰면 아침마다 결과가 달라진다
const embedded = (id) => JSON.parse(fs.readFileSync(path.join(web, 'index.html'), 'utf8')
  .match(new RegExp('<script type="application/json" id="' + id + '">(.*?)</script>', 's'))[1].replace(/\\u003c/g, '<'));
const index = embedded('issue-index');
const latestPath = '/data/issues/' + index.latest + '.json';
const latest = JSON.parse(fs.readFileSync(path.join(web, latestPath)));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let browser;
let checks = 0;
async function pageFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, reducedMotion: 'reduce', colorScheme: options.dark ? 'dark' : 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'jogan.test') return route.abort();
    if (options.missingMain && url.pathname === '/src/main.js') return route.abort();
    if (options.delay && url.pathname === '/data/issues/index.json') await new Promise((resolve) => setTimeout(resolve, options.delay));
    // 배포본에는 공개 전 초안이 올라가지 않는다. 페이지에 실린 목록과 같은 것을 돌려줘 아침에도 같은 경로를 시험한다
    if (url.pathname === '/data/issues/index.json') return route.fulfill({ json: index });
    if (options.hung && url.pathname === latestPath) return;
    if (options.missing && url.pathname === latestPath) return route.fulfill({ status: 404, body: '' });
    if (options.bad && url.pathname === latestPath) {
      const data = structuredClone(latest);
      options.bad(data);
      return route.fulfill({ json: data });
    }
    if (options.badLive && url.pathname === '/data/live.json') return route.fulfill({ json: { updatedAt: 'bad', items: [{}] } });
    if (options.slowExtras && url.pathname === '/data/corrections.json') await new Promise((resolve) => setTimeout(resolve, 2500));
    let file = path.join(web, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!path.extname(file)) file += '.html';
    try {
      let body = fs.readFileSync(file);
      if (path.extname(file) === '.html') {
        body = body.toString();
        if (options.missing || options.delay || options.hung) body = body.replace(/(<script type="application\/json" id="issue-(?:data|index)">).*?(<\/script>)/gs, '$1null$2');
        if (options.bad) body = body.replace(/(<script type="application\/json" id="issue-data">)(.*?)(<\/script>)/s, (_all, open, json, close) => {
          const data = JSON.parse(json);
          options.bad(data);
          return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
        });
      }
      return await route.fulfill({ body, contentType: mime[path.extname(file)] || 'application/octet-stream' });
    }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  return { page, context, errors };
}
async function ready(page, state = 'ready') {
  await page.waitForFunction((expected) => document.documentElement.dataset.loadState === expected, state);
}
async function check(name, options, run) {
  const { page, context, errors } = await pageFor(options);
  try {
    await run(page);
    assert.deepEqual(errors, [], '처리되지 않은 브라우저 오류');
    checks += 1;
    console.log('통과:', name);
  } finally { await context.close(); }
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  for (const width of [320, 360, 390, 430, 768, 900, 1440]) {
    await check('최신 호·전체 폭 ' + width, { width }, async (page) => {
      await page.goto('http://jogan.test/');
      await ready(page);
      assert.equal(await page.locator('#seoDigest').count(), 0);
      assert.equal(await page.locator('#pageLoading').isVisible(), false);
      assert.equal(await page.evaluate(() => window.dataLayer.filter((entry) => entry[0] === 'event' && entry[1] === 'app_ready').length), 1);
      for (const big of [false, true]) {
        if (big) await page.locator('#bigBtn').click();
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
        assert.ok(size.scroll <= size.width + 1, JSON.stringify({ width, big, size }));
      }
      if (width === 390 && process.env.SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.locator('#bigBtn').click();
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'mobile-home.png') });
        await page.locator('#regions').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'mobile-regions.png') });
      }
    });
  }
  await check('지난 호 URL·보관 목록', {}, async (page) => {
    const past = index.issues.at(-1);
    await page.goto('http://jogan.test/' + past);
    await ready(page);
    assert.equal(await page.locator('#issueDate').getAttribute('datetime'), past);
    // 지난 호는 선택 상자로 고르고, 지금 보는 호가 미리 골라져 있다
    assert.equal(await page.locator('#archSel option').count(), index.issues.length);
    assert.equal(await page.locator('#archSel').inputValue(), past);
    assert.match(await page.locator('#archSel option').first().innerText(), /^\d{4}\.\d{2}\.\d{2} \([일월화수목금토]\) · 최신$/);
    await page.locator('#archSel').selectOption(index.issues[1]);
    assert.equal(page.url(), 'http://jogan.test/' + past);
    await Promise.all([page.waitForURL('http://jogan.test/' + index.issues[1]), page.locator('#archive button').click()]);
    assert.equal(await page.locator('#stale').isVisible(), true);
    assert.equal(await page.locator('#live').isVisible(), false);
  });
  for (const date of index.issues.slice(1, -1)) {
    await check('지난 호 렌더링 ' + date, {}, async (page) => {
      await page.goto('http://jogan.test/' + date);
      await ready(page);
      assert.equal(await page.locator('#issueDate').getAttribute('datetime'), date);
    });
  }
  await check('배포본은 본문 JSON을 다시 요청하지 않음', {}, async (page) => {
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.equal(requests.some((url) => url.startsWith('/data/issues/')), false);
  });
  await check('기존 날짜 쿼리 주소', {}, async (page) => {
    const past = index.issues.at(-1);
    await page.goto('http://jogan.test/?d=' + past);
    await ready(page);
    assert.equal(await page.locator('#issueDate').getAttribute('datetime'), past);
  });
  await check('느린 접속·로딩 표시·보조 요청 분리', { delay: 700, slowExtras: true }, async (page) => {
    await page.goto('http://jogan.test/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#pageLoading').isVisible(), true);
    await ready(page);
    assert.equal(await page.locator('#fixes li').count(), 0);
    assert.equal(await page.locator('#main').getAttribute('aria-busy'), 'false');
  });
  for (const [name, options] of [
    ['자료 404', { missing: true }],
    ['빈 주제', { bad: (data) => { data.themes = []; } }],
    ['렌더링 도중 오류', { bad: (data) => { data.nps.alloc[0].s = '잘못된 비율'; } }]
  ]) {
    await check(name + '·요약 보존·재시도', options, async (page) => {
      await page.goto('http://jogan.test/');
      await ready(page, 'error');
      assert.equal(await page.locator('#loadError').isVisible(), true);
      assert.equal(await page.locator('#seoDigest').isVisible(), true);
      assert.equal(await page.locator('#heroGrid').isVisible(), false);
      assert.equal(await page.locator('#pageLoading').isVisible(), false);
      assert.equal(await page.locator('#loadError button').textContent(), '다시 불러오기');
    });
  }
  await check('모바일 메뉴·Esc·포커스 복귀·지역 선택', { dark: true }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    await page.locator('#tabMenu').click();
    assert.equal(await page.locator('#drawer').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'tabMenu');
    await page.waitForFunction(() => document.getElementById('drawer').hidden);
    assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('is-locked')), false);
    await page.locator('#tmap button').filter({ hasText: '서울' }).click();
    assert.equal(await page.locator('#rlist > h3').textContent(), '서울');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
  });
  await check('비교 표 세로 배치·검색 결과 없음', { bad: (data) => { data.themes[0].diffs[0].pick = '편집 메모'; } }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.ok((await page.locator('#splits .sv').first().innerText()).trim());
    await page.locator('#tresult details').first().locator('summary').click();
    const table = page.locator('#tresult table').first();
    assert.equal(await table.locator('td[data-label]').count() > 0, true);
    assert.ok(await table.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    await page.locator('#tq').fill('존재하지않는주제XYZ');
    await page.locator('#tform').evaluate((node) => node.requestSubmit());
    assert.ok((await page.locator('#tresult').innerText()).includes('맞는 주제가'));
  });
  await check('추적 섹션 타임라인·지난 호에서는 숨김', { width: 1280 }, async (page) => {
    const trackers = JSON.parse(fs.readFileSync(path.join(web, 'data/trackers.json'), 'utf8'));
    await page.goto('http://jogan.test/');
    await ready(page);
    await page.locator('#track:not([hidden])').waitFor();
    assert.ok(await page.locator('[data-sec="track"]:visible').count() > 0);
    const item = trackers.items[0];
    assert.equal(await page.locator('#track .kj-track:first-child .kj-timeline li').count(), item.steps.length);
    assert.equal(await page.locator('#track .kj-track:first-child .kj-timeline li.is-done').count(), item.steps.filter((s) => s.done).length);
    // 날짜가 아직 없는 단계는 '예정'으로 적는다
    assert.equal(await page.locator('#track .kj-track:first-child .kj-timeline li:not(.is-done) b').first().innerText(), '예정');
    assert.equal(await page.locator('#track .kj-track:first-child .kj-track__links li a').count(), item.links.length);
    const bar = page.locator('#track .kj-prog__bar');
    assert.equal(await bar.getAttribute('role'), 'progressbar');
    assert.ok(Number(await bar.getAttribute('aria-valuenow')) > 0);
    const muan = page.locator('#issue-muan-airport');
    assert.equal(await muan.locator('.tracking-articles tbody tr').count(), 4);
    assert.equal(await muan.locator('[aria-current="step"]').innerText(), '전문 분석\n현재 확인');
    assert.equal(await muan.locator('[role="progressbar"]').count(), 0);
    await page.locator('#trackingExpand').click();
    assert.equal(await page.locator('#trackingDialog').evaluate((d) => d.open), true);
    await page.locator('#trackingContent details').last().locator('summary').click();
    assert.equal(await page.locator('#trackingDialog .tracking-articles tbody tr').count(), 4);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'trackingExpand');
    await page.locator('#trackingHide').click();
    await page.reload();
    await ready(page);
    await page.locator('#trackingReopen:not([hidden])').waitFor();
    assert.equal(await page.locator('#trackingBar').isHidden(), true);
    await page.locator('#trackingReopen').click();
    await page.locator('#trackingClose').click();
    // 지난 호는 그날의 기록이라 지금 상황을 덧붙이지 않는다
    await page.goto('http://jogan.test/' + index.issues.at(-1));
    await ready(page);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#track').isHidden(), true);
    // 감춘 섹션으로 가는 메뉴는 남기지 않는다
    assert.equal(await page.locator('[data-sec="track"]:visible').count(), 0);
  });
  await check('모바일 추적 기사·큰 글자·스크롤 복귀', { width: 320 }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    await page.locator('#trackingExpand').waitFor();
    await page.locator('#bigBtn').click();
    await page.evaluate(() => window.scrollTo(0, 900));
    const before = await page.evaluate(() => window.scrollY);
    await page.locator('#trackingExpand').click();
    await page.locator('#trackingContent details').last().locator('summary').click();
    assert.equal(await page.locator('#trackingDialog').evaluate((d) => d.scrollWidth <= d.clientWidth + 1), true);
    assert.equal(await page.locator('#trackingDialog table').count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('trackingDialog').open);
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before) < 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  await check('머리기사 우선 배치·진행 막대', { width: 1280 }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.ok(await page.locator('#catNav a').first().evaluate((a) => a.getBoundingClientRect().height >= 44));
    const padding = await page.locator('#heroGrid').evaluate((e) => parseFloat(getComputedStyle(e).paddingRight));
    assert.ok(padding <= 24);
    await page.waitForFunction(() => document.querySelector('#catNav a[data-sec="home"]').getAttribute('aria-current') === 'true');
    const order = await page.evaluate(() => [...document.querySelectorAll('main > section')].map((s) => s.id));
    assert.deepEqual(order.slice(0, 4), ['home', 'national', 'regions', 'media']);
    // 진행 막대는 progress를 적은 주제에만 그린다
    const withProgress = latest.themes.find((t) => t.progress);
    if (withProgress) {
      await page.locator('#tchips button', { hasText: withProgress.title.slice(0, 12) }).first().click();
      // 추적 섹션에도 같은 막대가 있어 언론 섹션 안으로 좁혀서 본다
      const bar = page.locator('#tresult .kj-prog__bar');
      assert.equal(await bar.getAttribute('role'), 'progressbar');
      // 오늘이 아니라 그 호의 날짜로 세야 지난 호를 나중에 열어도 숫자가 그대로다
      const day = 86400000;
      const between = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / day);
      const p = withProgress.progress;
      assert.equal(Number(await bar.getAttribute('aria-valuemax')), between(p.start, p.end) + 1);
      assert.equal(Number(await bar.getAttribute('aria-valuenow')), between(p.start, latest.date) + 1);
      assert.equal(await page.locator('#tresult .kj-prog__big strong').innerText(), String(between(p.since, latest.date)));
      assert.equal(await page.locator('#tresult .kj-prog__steps li').count(), p.steps.length);
      const width = await bar.locator('> span').evaluate((e) => e.style.width);
      assert.match(width, /^\d+%$/);
    }
    const plain = latest.themes.find((t) => !t.progress);
    if (plain) {
      await page.locator('#tchips button', { hasText: plain.title.slice(0, 12) }).first().click();
      assert.equal(await page.locator('#tresult .kj-prog').count(), 0);
    }
  });
  await check('섹션 읽기·체류 시간 측정', { width: 1280 }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    const events = (prefix) => page.evaluate((p) => window.dataLayer.filter((entry) => entry[0] === 'event' && String(entry[1]).startsWith(p)).map((entry) => [entry[1], entry[2] && entry[2].value]), prefix);
    // 메뉴로 고른 섹션은 바로 한 번 세고, 지나쳐 간 섹션은 3초를 넘기지 않아 세지 않는다
    await page.locator('a[data-sec="fiscal"]:visible').first().click();
    await page.locator('a[data-sec="fiscal"]:visible').first().click();
    assert.deepEqual(await events('section_'), [['section_fiscal', undefined]]);
    await page.waitForTimeout(1600);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const dwell = await events('dwell_');
    assert.equal(dwell.length, 1, JSON.stringify(dwell));
    assert.equal(dwell[0][0], 'dwell_fiscal');
    assert.ok(dwell[0][1] >= 1 && dwell[0][1] <= 3, JSON.stringify(dwell));
    // 숨긴 동안은 시간을 더하지 않아 다시 숨겨도 보낼 것이 없다
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal((await events('dwell_')).length, 1);
  });
  await check('보조 숫자 오류가 본문에 영향 없음', { badLive: true }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.equal(await page.locator('#leadH').isVisible(), true);
  });
  await check('응답 무한 대기 시 12초 제한', { hung: true }, async (page) => {
    await page.clock.install();
    const pending = page.waitForRequest('**' + latestPath);
    await page.goto('http://jogan.test/');
    await pending;
    await page.clock.runFor(12500);
    await ready(page, 'error');
    assert.equal(await page.locator('#pageLoading').isVisible(), false);
    assert.equal(await page.locator('#seoDigest').isVisible(), true);
  });
  await check('스크립트 누락 시 로딩 종료·정적 요약', { missingMain: true }, async (page) => {
    await page.clock.install();
    await page.goto('http://jogan.test/');
    await page.clock.runFor(21000);
    await ready(page, 'error');
    assert.equal(await page.locator('#seoDigest').isVisible(), true);
    assert.equal(await page.locator('#loadingRetry').isVisible(), true);
  });
  console.log('브라우저 검사 완료:', checks);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
});
