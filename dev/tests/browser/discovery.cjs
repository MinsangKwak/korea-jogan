'use strict';
// 검색 도착 페이지는 스크립트 없이 읽히고 모바일과 측정 제외 기준도 유지해야 한다
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-discovery-'));
const web = path.join(temp, 'web');
fs.cpSync(path.join(repo, 'dev/web'), web, { recursive: true });
const pages = JSON.parse(execFileSync('python3', ['-c', 'import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);import build_pages as b;b.PUBLIC=Path(sys.argv[2]);b.ISSUES=b.PUBLIC/"data/issues";written=b.build();print(json.dumps(["/"+str(p.relative_to(b.PUBLIC)).removesuffix("index.html") for p in written if p.parent!=b.PUBLIC]))', path.join(repo, 'dev/pipeline/build'), web], { encoding: 'utf8' }));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const origin = 'http://jogan.test';
let browser;
let checks = 0;

async function surface(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, reducedMotion: 'reduce', colorScheme: options.dark ? 'dark' : 'light', javaScriptEnabled: options.javaScriptEnabled !== false });
  if (options.human) await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  if (options.internal) await context.addInitScript(() => localStorage.setItem('kj-internal', '1'));
  await context.addInitScript(() => {
    window.discoveryCspEvents = [];
    addEventListener('securitypolicyviolation', (event) => window.discoveryCspEvents.push(event.effectiveDirective + ': ' + event.blockedURI));
  });
  const page = await context.newPage();
  const errors = [], missing = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.href);
      return route.fulfill({ status: 200, body: '', contentType: route.request().resourceType() === 'script' ? mime['.js'] : mime['.css'] });
    }
    let file = path.join(web, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    if (!path.extname(file)) file += '.html';
    try { return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' }); }
    catch { missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
  });
  return { page, context, errors, missing, external };
}

async function check(name, options, run) {
  const state = await surface(options);
  try {
    await run(state);
    assert.deepEqual(state.errors, [], '처리되지 않은 브라우저 오류');
    assert.deepEqual(state.missing, [], '정적 파일 누락');
    if (options.javaScriptEnabled !== false) assert.deepEqual(await state.page.evaluate(() => window.discoveryCspEvents), [], 'CSP 위반');
    console.log('통과:', name);
    checks += 1;
  } finally { await state.context.close(); }
}

(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  try {
    assert.ok(pages.length >= 3, '검색 도착 페이지가 생성되지 않음');
    await check('전체 검색 페이지의 본문·근거가 JavaScript 없이 밝게 읽힘', { javaScriptEnabled: false, dark: true }, async ({ page }) => {
      const titles = new Set();
      for (const routePath of pages) {
        const response = await page.goto(origin + routePath);
        assert.equal(response.status(), 200, routePath);
        assert.equal(await page.locator('html').evaluate((e) => getComputedStyle(e).colorScheme), 'light', routePath);
        assert.equal(await page.locator('main h1').count(), 1, routePath);
        assert.ok((await page.locator('main h1').textContent()).trim(), routePath);
        assert.equal(await page.locator('main h1').isVisible(), true, routePath);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://korea-jogan.com' + routePath);
        const title = await page.title();
        assert.ok(!titles.has(title), '중복 제목: ' + title);
        titles.add(title);
        assert.ok(await page.locator('main a[href^="/"]').count(), '내부 링크 없음: ' + routePath);
        const kind = await page.locator('meta[name="kj-page-kind"]').getAttribute('content');
        if (kind === 'topic') {
          assert.equal(await page.locator('#timeline').isVisible(), true);
          assert.equal(await page.locator('#sources').isVisible(), true);
          assert.ok(await page.locator('main table a[href^="http"]').count(), routePath);
        }
        if (kind === 'indicator') {
          assert.equal(await page.locator('#history').isVisible(), true);
          assert.ok(await page.locator('main tbody tr').count(), routePath);
          assert.match(await page.locator('main').innerText(), /실시간 시세가 아닌 호별 수록 기록/);
          assert.match(await page.locator('main table thead').innerText(), /자료 기준·발표/);
        }
      }
    });

    for (const width of [320, 390, 1440]) {
      await check('전체 검색 페이지의 모바일·PC 너비 ' + width, { width }, async ({ page }) => {
        for (const routePath of pages) {
          await page.goto(origin + routePath);
          await page.locator('#discoveryTheme:enabled').waitFor();
          const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(size.scroll <= size.width + 1, JSON.stringify({ routePath, width, size }));
          assert.equal(await page.locator('main h1').isVisible(), true, routePath);
        }
      });
    }

    await check('밝은 화면 기본·화면과 글자 크기 저장·정적 본문 유지', { dark: true }, async ({ page }) => {
      await page.goto(origin + '/indicators/');
      await page.locator('#discoveryTheme:enabled').waitFor();
      const heading = await page.locator('main h1').textContent();
      const theme = page.getByRole('switch', { name: '어두운 화면', exact: true });
      const size = page.getByRole('switch', { name: '글자 크게', exact: true });
      const headingSize = () => page.locator('main h1').evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      const normal = await headingSize();
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'light');
      assert.equal(await theme.getAttribute('aria-checked'), 'false');
      await theme.press('Space');
      await size.press('Enter');
      assert.ok(await headingSize() > normal);
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
      await page.reload();
      await page.locator('#discoveryTheme:enabled').waitFor();
      assert.equal(await theme.getAttribute('aria-checked'), 'true');
      assert.equal(await size.getAttribute('aria-checked'), 'true');
      await theme.click();
      assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('jogan-theme')), null);
      await page.reload();
      await page.locator('#discoveryTheme:enabled').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await theme.getAttribute('aria-checked'), 'false');
      assert.equal(await page.locator('main h1').textContent(), heading);
    });

    for (const options of [{}, { human: true, internal: true }]) {
      await check(options.internal ? '내부 방문은 새 페이지에서도 측정 제외' : '자동화 방문은 새 페이지에서도 측정 제외', options, async ({ page, external }) => {
        await page.goto(origin + '/topics/');
        assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
        assert.equal(external.some((url) => /googletagmanager|google-analytics/.test(url)), false);
      });
    }

    await check('사람 방문은 실제 경로와 제목으로 page_view 한 번 기록', { human: true }, async ({ page, external }) => {
      const url = origin + '/indicators/kospi/?utm_source=test';
      assert.ok(pages.includes('/indicators/kospi/'));
      await page.goto(url);
      const events = await page.evaluate(() => window.dataLayer.filter((entry) => entry[0] === 'event').map((entry) => ({ name: entry[1], params: entry[2] })));
      const views = events.filter((event) => event.name === 'page_view');
      assert.equal(views.length, 1);
      assert.equal(views[0].params.page_location, url);
      assert.equal(views[0].params.page_title, await page.title());
      assert.equal(events.filter((event) => event.name === 'discovery_open').length, 1);
      assert.ok(external.some((endpoint) => endpoint.startsWith('https://www.googletagmanager.com/gtag/js?id=')));
    });
    console.log('검색 페이지 브라우저 검사 ' + checks + '개 통과 · 생성 페이지 ' + pages.length + '개');
  } finally {
    await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
