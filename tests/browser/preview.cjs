'use strict';
// 개발 빌드의 지면과 격리 정책을 오프라인으로 검사하며 배포 서버의 접근 인증은 별도로 확인한다
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { openBrowser } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-preview-browser-'));
const source = path.join(temp, 'source');
const web = path.join(temp, 'preview');
const origin = 'https://dev.korea-jogan.com';
const commit = '0123456789abcdef0123456789abcdef01234567';
const branch = 'dev';
fs.cpSync(path.join(repo, 'frontend-vanilla-js'), source, { recursive: true });
const built = JSON.parse(execFileSync('python3', ['-c', 'import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);import build_preview as b;print(json.dumps(b.build(source=Path(sys.argv[2]),output=Path(sys.argv[3]),origin=sys.argv[4],commit=sys.argv[5],branch=sys.argv[6])))', path.join(repo, 'backend-python/pipeline/build'), source, web, origin, commit, branch], { encoding: 'utf8' }));
const index = JSON.parse(fs.readFileSync(path.join(web, 'data/issues/index.json'), 'utf8'));
const older = index.issues.find((date) => date !== index.latest);
const vercel = JSON.parse(fs.readFileSync(path.join(repo, 'vercel.json'), 'utf8'));
const fixtureHeaders = Object.fromEntries(vercel.headers.filter((entry) => entry.source === '/(.*)').flatMap((entry) => entry.headers).map((header) => [header.key, header.value]));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
let browser;
let checks = 0;

async function surface(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'light' });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.previewCspEvents = [];
    addEventListener('securitypolicyviolation', (event) => window.previewCspEvents.push(event.effectiveDirective + ': ' + event.blockedURI));
  });
  const page = await context.newPage();
  const errors = [], telemetry = [], missing = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (/googletagmanager|google-analytics|analyticsdata\.googleapis|accounts\.google\.com|oauth2\.googleapis|gc\.zgo\.at/.test(url.hostname)) telemetry.push(url.href);
      return route.fulfill({ status: 200, body: '', contentType: route.request().resourceType() === 'script' ? mime['.js'] : mime['.css'] });
    }
    let file = path.join(web, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    if (!path.extname(file)) file += '.html';
    try { return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream', headers: fixtureHeaders }); }
    catch {
      if (url.pathname !== '/data/live.json') missing.push(url.pathname);
      return route.fulfill({ status: 404, body: '', headers: fixtureHeaders });
    }
  });
  return { page, context, errors, telemetry, missing };
}

async function check(name, options, run) {
  const state = await surface(options);
  try {
    await run(state);
    assert.deepEqual(state.errors, [], '처리되지 않은 브라우저 오류');
    assert.deepEqual(state.telemetry, [], '개발 지면의 운영 측정·인증 요청');
    assert.deepEqual(state.missing, [], '개발 정적 파일 누락');
    assert.deepEqual(await state.page.evaluate(() => window.previewCspEvents), [], 'CSP 위반');
    checks += 1;
    console.log('통과:', name);
  } finally { await state.context.close(); }
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.loadState === 'ready');
}

async function identity(page) {
  const banner = await page.locator('#previewBanner').innerText();
  assert.match(banner, /개발 검증 환경/);
  assert.ok(banner.includes('브랜치 ' + branch));
  assert.equal(await page.locator('#previewBanner code').textContent(), commit);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
}

(async () => {
  try {
    browser = await openBrowser();
    await check('Swagger UI에서 실제 발행 색인 조회', {}, async ({ page }) => {
      await page.goto(origin + '/api/docs/');
      await identity(page);
      const op = page.locator('.opblock').filter({ has: page.getByText('발행 호 목록', { exact: true }) });
      await op.locator('.opblock-summary-control').click();
      await op.getByRole('button', { name: 'Try it out', exact: true }).click();
      const returned = page.waitForResponse(origin + '/api/v1/index.json');
      await op.getByRole('button', { name: 'Execute', exact: true }).click();
      const response = await returned;
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).latest, index.latest);
      assert.equal((await op.locator('.live-responses-table tbody td.response-col_status').innerText()).trim(), '200');
    });
    await check('개발 첫 화면의 초기화·CSP·운영 측정 제외', {}, async ({ page }) => {
      await page.goto(origin + '/');
      await ready(page);
      await identity(page);
      assert.equal(await page.locator('#leadH').isVisible(), true);
      assert.equal(await page.locator('#pageLoading').isVisible(), false);
      await page.getByRole('switch', { name: '어두운 화면', exact: true }).click();
      await page.getByRole('switch', { name: '글자 크게', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
      assert.equal(await page.locator('meta[name="jg-ga4"]').getAttribute('content'), '');
      assert.equal(await page.locator('meta[name="jg-goatcounter"]').getAttribute('content'), '');
      assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      assert.match(policy, /connect-src 'self'(?:;|$)/);
      assert.match(policy, /frame-src 'none'(?:;|$)/);
      assert.ok(!policy.includes('googletagmanager.com'));
    });

    await check('날짜별 기사 검색은 펼칠 때만 API에서 선택한 호를 읽으며 실패 후 재시도할 수 있다', {}, async ({ page }) => {
      const requests = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
      });
      await page.goto(origin + '/' + older);
      await ready(page);
      assert.equal(requests.length, 0);
      const olderPath = origin + '/api/v1/editions/' + older + '.json';
      await page.route(olderPath, (route) => route.fulfill({ status: 503, body: '' }), { times: 1 });
      await page.locator('#editionSearch summary').focus();
      await page.keyboard.press('Enter');
      await page.locator('#editionSearchRetry').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#editionSearchDate').inputValue(), older);
      await page.locator('#editionSearchRetry').click();
      await page.locator('#editionSearchQuery:enabled').waitFor();
      assert.equal(await page.locator('#editionSearchPage').getAttribute('href'), '/' + older);
      const articles = JSON.parse(fs.readFileSync(path.join(web, 'api/v1/editions', index.latest + '.json'))).articles;
      await page.locator('#editionSearchDate').selectOption(index.latest);
      await page.locator('#editionSearchQuery:enabled').waitFor();
      assert.ok((await page.locator('#editionSearchStatus').innerText()).includes(articles.length + '건'));
      const article = articles.find((row) => row.section === 'regions') || articles[0];
      await page.locator('#editionSearchQuery').fill(article.title);
      const original = page.locator('#editionSearchList a').filter({ hasText: article.title }).first();
      assert.equal(await original.getAttribute('href'), article.url);
      await page.locator('#editionSearchQuery').fill('찾을수없는검사용문자열');
      assert.match(await page.locator('#editionSearchStatus').innerText(), /일치하는 기사가 없습니다/);
    });

    await check('배너와 빌드 메타데이터의 정확한 dev 커밋 일치', {}, async ({ page }) => {
      await page.goto(origin + '/');
      await ready(page);
      await identity(page);
      const metadata = await page.evaluate(async () => (await fetch('/preview-build.json')).json());
      assert.deepEqual(metadata, built);
      assert.equal(metadata.commit, commit);
      assert.equal(metadata.branch, branch);
      assert.equal(metadata.origin, origin);
      assert.equal(metadata.latest, index.latest);
    });

    await check('개발 canonical·구조화 데이터와 사이트맵의 주소 격리', {}, async ({ page }) => {
      for (const routePath of ['/', '/' + index.latest, '/topics/', '/indicators/']) {
        await page.goto(origin + routePath);
        if (routePath === '/' || routePath === '/' + index.latest) await ready(page);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), origin + routePath);
        const graphs = await page.locator('script[type="application/ld+json"]').allTextContents();
        assert.ok(graphs.length);
        for (const graph of graphs) {
          JSON.parse(graph);
          assert.ok(!graph.includes('https://korea-jogan.com'), routePath);
          assert.ok(graph.includes(origin), routePath);
        }
      }
      const sitemap = await page.evaluate(async () => (await fetch('/sitemap.xml')).text());
      assert.ok(sitemap.includes(origin + '/topics/'));
      assert.ok(!sitemap.includes('https://korea-jogan.com'));
    });

    await check('최신·지난 호의 내장 데이터와 파일 경로 유지', {}, async ({ page }) => {
      assert.ok(older, '검사할 지난 호 없음');
      for (const date of [index.latest, older]) {
        const response = await page.goto(origin + '/' + date);
        assert.equal(response.status(), 200);
        await ready(page);
        await identity(page);
        assert.equal(await page.evaluate(() => D.date), date);
        assert.equal(await page.locator('meta[name="kj-date"]').getAttribute('content'), date);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), origin + '/' + date);
        assert.equal(await page.locator('#leadH').isVisible(), true);
      }
    });

    await check('재판 질문의 지난 호 판본을 브라우저에서도 복원', {}, async ({ page }) => {
      const date = '2026-11-23';
      await page.goto(origin + '/' + date);
      await ready(page);
      const front = page.locator('#politicsFront');
      const answer = await page.locator('#frontAnswer').textContent();
      const source = await page.locator('#frontSource').getAttribute('href');
      assert.equal(await page.locator('#frontChecked').getAttribute('datetime'), '2026-11-20');
      await page.evaluate(async () => {
        delete document.getElementById('politicsFront').dataset.frontView;
        document.getElementById('frontAnswer').textContent = '';
        await showPoliticsFront(D);
      });
      assert.equal(await front.getAttribute('data-front-view'), 'edition');
      assert.equal(await page.locator('#frontAnswer').textContent(), answer);
      assert.equal(await page.locator('#frontSource').getAttribute('href'), source);
      assert.equal(await page.locator('#frontChecked').getAttribute('datetime'), '2026-11-20');
    });

    await check('날씨 기사 원문과 보도일을 읽고 자료가 없는 지난 호로 키보드 이동', {}, async ({ page }) => {
      const date = '2026-11-23';
      const past = '2026-11-11';
      const issue = JSON.parse(fs.readFileSync(path.join(web, 'data/issues', date + '.json'), 'utf8'));
      const story = issue.national.items.find((item) => item.title.includes('23일 전국에 비'));
      await page.goto(origin + '/' + date);
      await ready(page);
      const spread = page.locator('#weatherSpread');
      assert.ok(await spread.isVisible());
      assert.equal(await spread.locator('.weather-spread__summary').textContent(), story.title);
      assert.ok((await spread.innerText()).includes(story.outlet));
      const source = spread.getByRole('link');
      assert.equal(await source.getAttribute('href'), story.url);
      assert.ok(await spread.locator('time[datetime="' + story.date + '"]').isVisible());
      assert.ok(await spread.locator('time[datetime="' + date + '"]').isVisible());
      await source.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      assert.ok(await source.evaluate((link) => link === document.activeElement && link.matches(':focus-visible')));
      await page.locator('#archSel').selectOption(past);
      await Promise.all([page.waitForURL(origin + '/' + past), page.locator('#archive button').press('Enter')]);
      await ready(page);
      assert.equal(await page.locator('#issueDate').getAttribute('datetime'), past);
      assert.ok(await spread.isHidden());
      assert.ok(await page.locator('#national').isVisible());
      await page.goto(origin + '/' + past + '?d=' + date);
      await ready(page);
      await spread.waitFor({ state: 'visible' });
      assert.equal(await source.getAttribute('href'), story.url);
      assert.equal(await spread.locator('.weather-spread__summary').textContent(), story.title);
      await page.goto(origin + '/' + date + '?d=' + past);
      await ready(page);
      assert.ok(await spread.isHidden());
    });

    for (const width of [320, 1440]) {
      await check('개발 화면의 모바일·PC 너비와 배너 ' + width, { width }, async ({ page }) => {
        for (const routePath of ['/', '/topics/', '/indicators/kospi/']) {
          await page.goto(origin + routePath);
          if (routePath === '/') await ready(page);
          await identity(page);
          const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(size.scroll <= size.width + 1, JSON.stringify({ routePath, width, size }));
          if (routePath === '/') {
            const detail = page.locator('#frontDetail');
            await detail.focus();
            await page.keyboard.press('Tab');
            await page.keyboard.press('Shift+Tab');
            assert.ok(await detail.evaluate((link) => link === document.activeElement && link.matches(':focus-visible')));
            const motion = await detail.evaluate((link) => ({
              image: getComputedStyle(link.closest('article'), '::before').animationName,
              arrow: getComputedStyle(link.querySelector('[aria-hidden]')).transform,
            }));
            assert.deepEqual(motion, { image: 'none', arrow: 'none' });
            await page.getByRole('switch', { name: '글자 크게', exact: true }).click();
            const bounds = await page.locator('#frontQuestion, #frontAnswer, #frontDetail').evaluateAll((elements) =>
              elements.map((element) => {
                const { left, right, height } = element.getBoundingClientRect();
                return { left, right, height };
              }));
            assert.ok(bounds.every((box) => box.height > 0 && box.left >= -1 && box.right <= width + 1), JSON.stringify(bounds));
          }
        }
      });
    }

    await check('개발 이슈 본문과 화면 모드 전환', {}, async ({ page }) => {
      await page.goto(origin + '/topics/muan-airport/');
      await page.locator('#discoveryTheme:enabled').waitFor();
      await identity(page);
      assert.equal(await page.locator('main h1').isVisible(), true);
      assert.equal(await page.locator('#sources').isVisible(), true);
      assert.ok(await page.locator('main table tbody tr').count());
      const theme = page.getByRole('switch', { name: '어두운 화면', exact: true });
      await theme.click();
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
      await theme.click();
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'light');
    });

    await check('관리자 인증 제거·robots 차단과 응답 헤더 설정', {}, async ({ page }) => {
      const response = await page.goto(origin + '/admin/');
      assert.equal(response.status(), 200);
      await identity(page);
      assert.match(await page.locator('main h1').innerText(), /운영 통계를 연결하지 않습니다/);
      assert.equal(await page.locator('button, input, script[src]').count(), 0);
      assert.equal(await page.locator('a[href*="accounts.google.com"], a[href*="analytics.google.com"]').count(), 0);
      const robots = await page.evaluate(async () => {
        const result = await fetch('/robots.txt');
        return { status: result.status, text: await result.text(), robots: result.headers.get('X-Robots-Tag'), cache: result.headers.get('Cache-Control') };
      });
      assert.equal(robots.status, 200);
      assert.equal(robots.text, 'User-agent: *\nDisallow: /\n');
      assert.match(robots.robots, /noindex.*nofollow/);
      assert.match(robots.cache, /private.*no-store/);
      assert.equal(response.headers()['x-robots-tag'], fixtureHeaders['X-Robots-Tag']);
    });
    console.log('개발 지면 브라우저 검사 ' + checks + '개 통과 · 서버 접근 인증은 별도 운영 검증');
  } finally {
    if (browser) await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
