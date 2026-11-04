'use strict';
// 개발 빌드의 지면과 격리 정책을 오프라인으로 검사하며 배포 서버의 접근 인증은 별도로 확인한다
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-preview-browser-'));
const source = path.join(temp, 'source');
const web = path.join(temp, 'preview');
const origin = 'https://dev.korea-jogan.com';
const commit = '0123456789abcdef0123456789abcdef01234567';
const branch = 'dev';
fs.cpSync(path.join(repo, 'dev/web'), source, { recursive: true });
const built = JSON.parse(execFileSync('python3', ['-c', 'import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);import build_preview as b;print(json.dumps(b.build(source=Path(sys.argv[2]),output=Path(sys.argv[3]),origin=sys.argv[4],commit=sys.argv[5],branch=sys.argv[6])))', path.join(repo, 'dev/pipeline/build'), source, web, origin, commit, branch], { encoding: 'utf8' }));
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
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
    await check('개발 첫 화면의 초기화·CSP·운영 측정 제외', {}, async ({ page }) => {
      await page.goto(origin + '/');
      await ready(page);
      await identity(page);
      assert.equal(await page.locator('#leadH').isVisible(), true);
      assert.equal(await page.locator('#pageLoading').isVisible(), false);
      assert.equal(await page.locator('meta[name="jg-ga4"]').getAttribute('content'), '');
      assert.equal(await page.locator('meta[name="jg-goatcounter"]').getAttribute('content'), '');
      assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      assert.match(policy, /connect-src 'self'(?:;|$)/);
      assert.match(policy, /frame-src 'none'(?:;|$)/);
      assert.ok(!policy.includes('googletagmanager.com'));
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

    for (const width of [320, 1440]) {
      await check('개발 화면의 모바일·PC 너비와 배너 ' + width, { width }, async ({ page }) => {
        for (const routePath of ['/', '/topics/', '/indicators/kospi/']) {
          await page.goto(origin + routePath);
          if (routePath === '/') await ready(page);
          await identity(page);
          const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(size.scroll <= size.width + 1, JSON.stringify({ routePath, width, size }));
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
      await page.locator('#discoveryTheme').selectOption('dark');
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
      await page.locator('#discoveryTheme').selectOption('light');
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
