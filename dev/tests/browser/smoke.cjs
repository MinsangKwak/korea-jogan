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
const trackers = JSON.parse(fs.readFileSync(path.join(web, 'data/trackers.json'), 'utf8'));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
let browser;
let checks = 0;
async function pageFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: options.height || 844 }, reducedMotion: 'reduce', colorScheme: options.dark ? 'dark' : 'light' });
  // 측정은 자동화 브라우저에서 꺼지므로, 사람 브라우저처럼 보이게 한 뒤 시험한다. automation 옵션이면 그대로 둔다
  if (!options.automation) await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  if (options.blockStorage) await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'jogan.test') return route.abort();
    if (options.missingMain && url.pathname === '/src/main.js') return route.abort();
    if (options.slowTheme && url.pathname === '/src/core/theme.js') await new Promise((resolve) => setTimeout(resolve, 2500));
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
async function setScreenDark(page, on) {
  const toggle = page.locator('#themeToggle:enabled');
  await toggle.waitFor();
  if ((await toggle.getAttribute('aria-checked') === 'true') !== on) await toggle.click();
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
      if ([390, 1440].includes(width) && process.env.SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.locator('#bigBtn').click();
        const name = width === 390 ? 'mobile' : 'desktop';
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '-home.png') });
        if (width === 390) {
          await page.locator('#regions').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'mobile-regions.png') });
        } else {
          await setScreenDark(page, true);
          await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'desktop-dark.png') });
        }
      }
    });
  }
  await check('밝은 화면 기본·키보드 전환·저장과 메뉴 동기화', { dark: true }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    const root = page.locator('html');
    const theme = page.getByRole('switch', { name: '어두운 화면', exact: true }).and(page.locator('#themeToggle'));
    const assertLight = async () => {
      assert.equal(await root.getAttribute('data-theme'), 'light');
      assert.equal(await root.getAttribute('data-color-mode'), 'light');
      assert.equal(await root.evaluate((e) => getComputedStyle(e).colorScheme), 'light');
      assert.equal(await theme.getAttribute('aria-checked'), 'false');
    };
    await page.locator('#themeToggle:enabled').waitFor();
    assert.equal(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), true);
    await assertLight();
    await theme.press('Space');
    assert.equal(await theme.getAttribute('aria-checked'), 'true');
    assert.equal(await root.getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('jogan-theme')), 'dark');
    await page.reload();
    await ready(page);
    await page.locator('#themeToggle:enabled').waitFor();
    assert.equal(await theme.getAttribute('aria-checked'), 'true');
    assert.equal(await root.getAttribute('data-color-mode'), 'dark');
    await page.locator('#menuBtn').click();
    const drawerTheme = page.getByRole('switch', { name: '어두운 화면', exact: true }).and(page.locator('#drawerThemeToggle'));
    assert.equal(await drawerTheme.getAttribute('aria-checked'), 'true');
    await drawerTheme.press('Enter');
    await assertLight();
    assert.equal(await page.evaluate(() => localStorage.getItem('jogan-theme')), null);
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await assertLight();
    await page.evaluate(() => localStorage.setItem('jogan-theme', 'system'));
    await page.reload();
    await ready(page);
    await page.locator('#themeToggle:enabled').waitFor();
    await assertLight();
  });
  await check('느린 테마 조작 스크립트가 본문 표시를 막지 않음', { slowTheme: true }, async (page) => {
    await page.goto('http://jogan.test/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    assert.equal(await page.locator('#themeToggle').isDisabled(), true);
    assert.equal(await page.locator('#leadH').isVisible(), true);
    await setScreenDark(page, true);
    assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
  });
  await check('저장소 차단 시에도 화면 모드 전환', { blockStorage: true }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    await setScreenDark(page, true);
    assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
    await setScreenDark(page, false);
    assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'light');
  });
  await check('링크 복사 권한이 없을 때 직접 공유·키보드 복귀', { width: 320 }, async (page) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('복사 제한'); } } });
    });
    const past = index.issues.at(-1);
    await page.goto('http://jogan.test/' + past);
    await ready(page);
    await page.locator('#shareBtn').press('Enter');
    const dialog = page.getByRole('dialog', { name: '이 호 공유' });
    await dialog.waitFor();
    const url = dialog.locator('#shareUrl');
    assert.equal(await url.inputValue(), 'https://korea-jogan.com/' + past);
    assert.equal(await url.evaluate((input) => input === document.activeElement && input.selectionEnd === input.value.length), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement.id === 'shareBtn');
  });
  for (const width of [320, 390, 1440]) {
    await check('밝기별 발행 배지·추적 헤더·읽기 확대 ' + width, { width }, async (page) => {
      await page.goto('http://jogan.test/');
      await ready(page);
      await page.locator('#trackingExpand').waitFor();
      for (const mode of ['light', 'dark']) {
        await setScreenDark(page, mode === 'dark');
        const ratio = await page.locator('#statusChip').evaluate((e) => {
          const lum = (value) => { const a = value.match(/[\d.]+/g).slice(0, 3).map(Number).map((c) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); return a[0] * .2126 + a[1] * .7152 + a[2] * .0722; };
          const s = getComputedStyle(e), a = lum(s.color), b = lum(s.backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        assert.ok(ratio >= 4.5, mode + ' ' + ratio);
      }
      const original = await page.locator('#leadH').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      await page.locator('#bigBtn').click();
      assert.ok(await page.locator('#leadH').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)) > original);
      assert.equal(await page.locator('#leadStand').textContent(), latest.lead.standfirst);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.locator('#trackingExpand').click();
      assert.equal(await page.locator('#trackingContent .tracking-summary > .tracking-phases').count(), trackers.items.length);
      assert.equal(await page.locator('#trackingContent details .tracking-phases').count(), 0);
      await page.locator('#trackingContent details > summary').first().click();
      await page.locator('#trackingDialog').evaluate((d) => { d.scrollTop = d.scrollHeight; });
      const stickyHead = await page.locator('#trackingDialog > header').boundingBox();
      const close = await page.locator('#trackingClose').boundingBox();
      const dialog = await page.locator('#trackingDialog').boundingBox();
      assert.ok(stickyHead.y <= dialog.y + 2, JSON.stringify({ stickyHead, dialog }));
      assert.ok(close.y >= dialog.y && close.y + close.height <= dialog.y + dialog.height);
      await page.locator('#trackingClose').click();
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
  await check('기존 날짜 쿼리 주소는 호별 주소로 옮김', {}, async (page) => {
    const past = index.issues.at(-1);
    await page.goto('http://jogan.test/?d=' + past);
    await page.waitForURL('http://jogan.test/' + past);
    await ready(page);
    assert.equal(await page.locator('#issueDate').getAttribute('datetime'), past);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://korea-jogan.com/' + past);
    // 발행하지 않은 날짜는 옮기지 않는다. 없는 주소로 보내면 404가 된다
    await page.goto('http://jogan.test/?d=1999-01-01');
    await ready(page);
    assert.match(page.url(), /\?d=1999-01-01$/);
    assert.equal(await page.locator('#issueDate').getAttribute('datetime'), index.latest);
    // d만 빼고 나머지 값은 들고 간다. kj-internal 같은 표시가 사라지면 안 된다
    await page.goto('http://jogan.test/?d=' + past + '&kj-internal=1#media');
    await page.waitForURL('http://jogan.test/' + past + '?kj-internal=1#media');
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
    await setScreenDark(page, true);
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
    await page.goto('http://jogan.test/');
    await ready(page);
    await page.locator('#track:not([hidden])').waitFor();
    assert.ok(await page.locator('[data-sec="track"]:visible').count() > 0);
    const item = trackers.items[0];
    assert.equal(await page.locator('#track .kj-track:first-child .kj-timeline li').count(), item.steps.length);
    assert.equal(await page.locator('#track .kj-track:first-child .kj-timeline li.is-done').count(), item.steps.filter((s) => s.done).length);
    // 날짜가 아직 없는 단계는 '예정'으로 적는다
    assert.equal(await page.locator('#track .kj-track:first-child .kj-timeline li:not(.is-done) b').first().innerText(), '예정');
    const hasArticleTable = item.links.some((link) => link.summary);
    assert.equal(await page.locator('#track .kj-track:first-child .kj-track__links li a').count(), hasArticleTable ? 0 : item.links.length);
    if (hasArticleTable) assert.equal(await page.locator('#track .kj-track:first-child .tracking-articles tbody tr').count(), item.links.length);
    const bar = page.locator('#track .kj-prog__bar');
    assert.equal(await bar.getAttribute('role'), 'progressbar');
    assert.ok(Number(await bar.getAttribute('aria-valuenow')) > 0);
    // 기사와 단계는 날마다 늘어나므로 자료에서 읽어 맞춘다
    const muanData = trackers.items.find((t) => t.id === 'muan-airport');
    const muan = page.locator('#issue-muan-airport');
    assert.equal(await muan.locator('.tracking-articles tbody tr').count(), muanData.links.length);
    assert.equal(await muan.locator('[aria-current="step"]').innerText(), muanData.phases[muanData.phaseIndex] + '\n현재 확인');
    assert.equal(await muan.locator('[role="progressbar"]').count(), 0);
    const sources = muan.locator('.kj-track__sources');
    assert.equal(await sources.getAttribute('open'), null);
    await sources.locator('> summary').click();
    assert.equal(await muan.locator('.tracking-articles').isVisible(), true);
    await sources.locator('> summary').click();
    await page.locator('#trackingExpand').click();
    assert.equal(await page.locator('#trackingDialog').evaluate((d) => d.open), true);
    await page.locator('#trackingContent details').last().locator('summary').click();
    const allLinks = trackers.items.reduce((n, t) => n + t.links.length, 0);
    assert.equal(await page.locator('#trackingDialog .tracking-articles tbody tr').count(), allLinks);
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
    assert.equal(await page.locator('#trackingDialog table').count(), trackers.items.filter((t) => t.links && t.links.length).length);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('trackingDialog').open);
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before) < 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  for (const dark of [false, true]) {
    for (const width of [320, 390, 1440]) {
      await check('도구 상태 대비·기간 여백·맨 위로 ' + width + (dark ? ' 다크' : ' 라이트'), { width, dark }, async (page) => {
        await page.goto('http://jogan.test/');
        await ready(page);
        await setScreenDark(page, dark);
        const big = page.getByRole('switch', { name: '글자 크게', exact: true }).and(page.locator('#bigBtn'));
        const contrast = () => big.evaluate((button) => {
          const rgb = (value) => value.match(/[\d.]+/g).map(Number);
          const lum = (value) => {
            const [r, g, b] = value.slice(0, 3).map((c) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
            return .2126 * r + .7152 * g + .0722 * b;
          };
          const layers = [];
          for (let el = button; el; el = el.parentElement) layers.unshift(rgb(getComputedStyle(el).backgroundColor));
          const paper = layers.reduce((under, [r, g, b, alpha = 1]) => [r, g, b].map((channel, i) => channel * alpha + under[i] * (1 - alpha)), [255, 255, 255]);
          const a = lum(rgb(getComputedStyle(button).color)), b = lum(paper);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        for (const toggle of [big, page.locator('#themeToggle')]) {
          const target = await toggle.boundingBox();
          assert.ok(target.width >= 44 && target.height >= 44, '읽기 도구 터치 영역');
        }
        await big.click();
        assert.equal(await big.getAttribute('aria-checked'), 'true');
        assert.ok(await contrast() >= 4.5);
        await page.mouse.move(0, 0);
        assert.ok(await contrast() >= 4.5);
        await page.getByRole('button', { name: '공유', exact: true }).first().waitFor();
        const meta = await page.locator('.kj-mast__meta').boundingBox();
        const actions = await page.locator('.kj-mast__actions').boundingBox();
        if (width <= 900) assert.ok(actions.y >= meta.y + meta.height - 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('#track:not([hidden])').waitFor();
        const panel = page.locator('#track .kj-prog').first();
        assert.ok(await panel.evaluate((p) => parseFloat(getComputedStyle(p).paddingLeft)) >= 20);
        const order = await page.evaluate(() => [...document.querySelectorAll('main > section')].map((s) => s.id));
        assert.deepEqual(order, ['national', 'track', 'home', 'regions', 'media', 'politics', 'economy', 'industry', 'fiscal']);
        await page.evaluate(() => window.scrollTo(0, 1200));
        await page.waitForFunction(() => getComputedStyle(document.getElementById('toTop')).opacity === '1');
        const top = page.getByRole('button', { name: '맨 위로', exact: true });
        assert.equal(await top.isVisible(), true);
        await top.click();
        await page.waitForFunction(() => scrollY === 0);
        assert.equal(await page.locator('.kj-mast__logo').evaluate((e) => e === document.activeElement), true);
      });
    }
  }
  await check('전국 1면·추적 2면·진행 막대', { width: 1280 }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.ok(await page.locator('#catNav a').first().evaluate((a) => a.getBoundingClientRect().height >= 44));
    const lead = await page.locator('#leadBox').boundingBox();
    const front = await page.locator('#natH').boundingBox();
    assert.ok(Math.abs(lead.x - front.x) <= 1, '전국 뉴스와 머리기사의 읽기 시작점 정렬');
    await page.waitForFunction(() => document.querySelector('#catNav a[data-sec="national"]').getAttribute('aria-current') === 'true');
    assert.equal(await page.locator('#natFlow').getAttribute('open'), '');
    await page.locator('#natFlow > summary').click();
    assert.equal(await page.locator('#natFlow').getAttribute('open'), null);
    await page.locator('#natFlow > summary').click();
    assert.equal(await page.locator('#natFlow > ol > li').count(), latest.national.flow.length);
    const order = await page.evaluate(() => [...document.querySelectorAll('main > section')].map((s) => s.id));
    assert.deepEqual(order.slice(0, 4), ['national', 'track', 'home', 'regions']);
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
  await check('자동화·내부 브라우저는 측정하지 않음', { automation: true }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.equal(await page.evaluate(() => typeof window.dataLayer), 'undefined');
    assert.equal(await page.evaluate(() => document.querySelector('script[src*="googletagmanager"]')), null);
  });
  await check('내부 표시 켜고 끄기', {}, async (page) => {
    await page.goto('http://jogan.test/?kj-internal=1');
    await ready(page);
    assert.equal(await page.evaluate(() => typeof window.dataLayer), 'undefined');
    await page.goto('http://jogan.test/');
    await ready(page);
    assert.equal(await page.evaluate(() => typeof window.dataLayer), 'undefined');
    await page.goto('http://jogan.test/?kj-internal=0');
    await ready(page);
    assert.equal(await page.evaluate(() => Array.isArray(window.dataLayer)), true);
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
  for (const width of [390, 1440, 1920]) {
    await check('전국 기사 읽기 배치·삽화 제거·푸터 ' + width, { width }, async (page) => {
      const illustrations = [];
      page.on('request', (request) => { if (/\/news-dawn-pixel(?:-720)?\.webp$/.test(new URL(request.url()).pathname)) illustrations.push(request.url()); });
      await page.goto('http://jogan.test/');
      await ready(page);
      await page.locator('#natList .kj-newscard').first().waitFor();
      const readGrid = () => page.locator('#natList').evaluate((node) => {
        const css = getComputedStyle(node);
        return { columns: css.gridTemplateColumns.split(' ').filter((value) => parseFloat(value) > 0).length, align: css.alignItems };
      });
      const grid = await readGrid();
      assert.equal(grid.columns, width < 1000 ? 1 : 2);
      assert.equal(grid.align, 'start');
      const articleBox = await page.locator('#natArticle').boundingBox();
      const chooserBox = await page.locator('.nat-chooser').boundingBox();
      if (width < 1000) assert.ok(chooserBox.y >= articleBox.y + articleBox.height);
      else {
        assert.ok(articleBox.width > chooserBox.width);
        assert.ok(Math.abs(articleBox.y - chooserBox.y) <= 1);
      }
      assert.equal(await page.locator('.news-illustration').count(), 0);
      assert.deepEqual(illustrations, []);
      assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'), /og-pixel\.png$/);
      const choice = page.locator('#natHeadlines .nat-headline').nth(1);
      const selectedTitle = await choice.locator('strong').innerText();
      const selected = latest.national.items.find((item) => item.title === selectedTitle);
      await choice.press('Space');
      assert.equal(await page.locator('#natArticleTitle').innerText(), selectedTitle);
      assert.equal(await page.locator('#natArticleTitle').evaluate((node) => node === document.activeElement), true);
      assert.equal(await choice.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#natArticle .kj-reading').textContent(), selected.summary);
      assert.equal(await page.locator('#natArticle .nat-original').getAttribute('href'), selected.url);
      assert.equal(await page.locator('#natArticle .nat-original').getAttribute('target'), '_blank');
      if (width >= 1600) {
        const visible = await page.locator('#natHeadlines .nat-headline:visible').count();
        const more = page.locator('#natHeadlines + .kj-more button');
        await more.click();
        assert.ok(await page.locator('#natHeadlines .nat-headline:visible').count() > visible);
        assert.equal((await readGrid()).columns, grid.columns);
        await more.click();
        assert.equal(await page.locator('#natHeadlines .nat-headline:visible').count(), visible);
      }
      await page.locator('#bigBtn').click();
      assert.equal(await page.locator('#bigBtn [data-big-state]').innerText(), '켬');
      assert.equal(await page.locator('#drawerBig').getAttribute('aria-checked'), 'true');
      assert.ok((await readGrid()).columns <= grid.columns);
      await page.locator('#bigBtn').click();
      await page.locator('#foot').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#archSel option').count() > 0);
      assert.equal(await page.locator('#foot #limitsH').count(), 1);
      assert.equal(await page.locator('#foot #fixH').count(), 1);
      if (width === 390) {
        for (const id of ['limitsH', 'archH', 'fixH']) {
          await page.locator('#menuBtn').click();
          await page.locator('[data-jump="' + id + '"]').click();
          await page.locator('#drawer').waitFor({ state: 'hidden' });
          const target = await page.locator('#' + id).boundingBox();
          const sticky = await page.locator('.news-sticky').boundingBox();
          assert.ok(target.y >= sticky.y + sticky.height, id + ' 제목이 고정 메뉴에 가려짐');
        }
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    });
  }
  for (const width of [390, 1440]) {
    await check('짧은 창 메뉴·추적 하단과 닫기 ' + width, { width, height: 480 }, async (page) => {
      await page.goto('http://jogan.test/');
      await ready(page);
      await page.locator('#menuBtn').click();
      await page.locator('#drawerBig').click();
      assert.equal(await page.locator('#drawerBig [data-big-state]').innerText(), '켬');
      const body = page.locator('.kj-drawer__body');
      await body.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const end = await page.locator('.kj-drawer__links a').last().boundingBox();
      assert.ok(end.y >= 0 && end.y + end.height <= 480);
      const drawerClose = await page.locator('.kj-drawer__close').boundingBox();
      assert.ok(drawerClose.y >= 0 && drawerClose.y + drawerClose.height <= 480);
      await page.locator('.kj-drawer__close').click();
      await page.locator('#trackingExpand').click();
      await page.locator('#trackingContent details summary').last().click();
      await page.locator('#trackingDialog').evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const close = await page.locator('#trackingClose').boundingBox();
      assert.ok(close.y >= 0 && close.y + close.height <= 480);
      await page.locator('#trackingClose').click();
      if (width > 1100) assert.equal(await page.locator('#trackList .kj-track__side').first().evaluate((node) => getComputedStyle(node).position), 'static');
    });
  }
  await check('PC 이슈 카드 두 열·내부 스크롤·키보드 접근', { width: 1920 }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    const cards = page.locator('#trackList > .kj-track');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    assert.ok(Math.abs(first.y - second.y) < 2 && second.x > first.x + first.width, '두 이슈가 같은 행에 나란히 배치');
    const side = page.locator('#trackList > .kj-track > .kj-track__body').first();
    await side.waitFor();
    const size = await side.evaluate((node) => ({ height: node.clientHeight, scroll: node.scrollHeight, overflow: getComputedStyle(node).overflowY, position: getComputedStyle(node).position }));
    assert.equal(size.position, 'static');
    assert.equal(size.overflow, 'auto');
    assert.ok(size.height <= 844 * .72 + 1);
    assert.equal(await side.getAttribute('tabindex'), '0');
    await side.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => { const node = document.querySelector('#trackList .kj-track__body'); return node.scrollTop + node.clientHeight >= node.scrollHeight - 1; });
  });
  for (const width of [390, 900, 1100, 1440, 1920]) {
    await check('섹션 좌우 배치·주요 기사 높이 기준 ' + width, { width }, async (page) => {
      await page.goto('http://jogan.test/');
      await ready(page);
      for (const big of [false, true]) {
        if (big) await page.locator('#bigBtn').click();
        const lead = await page.locator('#leadBox').boundingBox();
        const aside = await page.locator('.briefs-box').boundingBox();
        if (width > 900) {
          assert.ok(Math.abs(lead.height - aside.height) < 2, JSON.stringify({ lead, aside }));
          assert.equal(await page.locator('.briefs-box').evaluate((node) => getComputedStyle(node).overflowY), 'auto');
          await page.locator('.briefs-box').focus();
          await page.keyboard.press('End');
          await page.waitForFunction(() => { const node = document.querySelector('.briefs-box'); return node.scrollTop + node.clientHeight >= node.scrollHeight - 1; });
        } else {
          assert.ok(aside.y >= lead.y + lead.height);
          assert.equal(await page.locator('.briefs-box').evaluate((node) => getComputedStyle(node).overflowY), 'visible');
        }
        const title = await page.locator('#media .kj-sechead').boundingBox();
        const search = await page.locator('#tform').boundingBox();
        const summary = await page.locator('.industry-summary').boundingBox();
        const chart = await page.locator('.industry-chart').boundingBox();
        if (width >= 1100) {
          assert.ok(search.x >= title.x + title.width && search.y < title.y + title.height);
          assert.ok(chart.x >= summary.x + summary.width && Math.abs(chart.y - summary.y) < 2);
        } else {
          assert.ok(search.y >= title.y + title.height);
          assert.ok(chart.y >= summary.y + summary.height);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      }
    });
  }
  for (const width of [390, 1440, 1920]) {
    await check('경제 지표 순환·키보드·출처 읽기 ' + width, { width }, async (page) => {
      let vendorRequests = 0;
      page.on('request', (request) => { if (request.url().includes('/assets/vendor/swiper/')) vendorRequests += 1; });
      await page.goto('http://jogan.test/');
      await ready(page);
      assert.equal(vendorRequests, 0, '첫 지면은 슬라이더 다운로드 없이 준비');
      await page.locator('#economy').evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.locator('#nums[data-carousel-state="ready"]').waitFor();
      assert.ok(vendorRequests >= 2);
      assert.equal(await page.locator('#econPlayback').getAttribute('aria-pressed'), 'false');
      const count = latest.nums.length;
      assert.equal(await page.locator('#nums > .swiper-slide').count(), count);
      const numbers = await page.locator('#nums > .swiper-slide').evaluateAll((cards) => cards.map((card) => ({ index: Number(card.dataset.econIndex), value: card.querySelector('.kj-stat__v').textContent, ref: card.querySelector('.kj-stat__ref').textContent })).sort((a, b) => a.index - b.index));
      assert.deepEqual(numbers.map((card) => [card.value, card.ref]), latest.nums.map((item) => [item.v, item.ref]));
      await page.locator('#econPrev').click();
      await page.waitForFunction((expected) => document.getElementById('econViewport').swiper.realIndex === expected, count - 1);
      await page.locator('#econNext').click();
      await page.waitForFunction(() => document.getElementById('econViewport').swiper.realIndex === 0);
      await page.locator('#econViewport').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.getElementById('econViewport').swiper.realIndex === 1);
      await page.locator('#econPlayback').click();
      assert.equal(await page.locator('#econPlayback').getAttribute('aria-pressed'), 'true');
      const source = page.locator('#nums .swiper-slide-active .kj-src > summary');
      await source.click();
      await page.waitForFunction(() => document.getElementById('econPlayback').getAttribute('aria-pressed') === 'false');
      assert.equal(await page.locator('#nums .swiper-slide-active .kj-src[open] a').first().isVisible(), true);
      await source.click();
      assert.equal(await page.locator('#econPlayback').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    });
  }
  await check('경제 라이브러리 실패 시 전체 지표 목록 유지', { width: 390 }, async (page) => {
    await page.route('**/assets/vendor/swiper/**', (route) => route.abort());
    await page.goto('http://jogan.test/');
    await ready(page);
    await page.locator('#economy').evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => document.querySelector('script[src*="swiper-14"]') && document.getElementById('nums').dataset.carouselState === 'static');
    assert.equal(await page.locator('#nums.kj-stats > .kj-stat:visible').count(), latest.nums.length);
    assert.equal(await page.locator('#econPlayback').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  });
  await check('경제 자동 넘김·가리기·포커스·동작 줄이기', { width: 1440 }, async (page) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://jogan.test/');
    await ready(page);
    await page.locator('#economy').evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.locator('#nums[data-carousel-state="ready"]').waitFor();
    await page.waitForFunction(() => document.getElementById('econCarousel').dataset.autoplay === 'running');
    await page.waitForFunction(() => document.getElementById('econViewport').swiper.realIndex !== 0, null, { timeout: 12000 });
    await page.locator('#econViewport').focus();
    await page.waitForFunction(() => document.getElementById('econCarousel').dataset.autoplay === 'paused');
    await page.evaluate(() => document.activeElement.blur());
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.getElementById('econCarousel').dataset.autoplay === 'running');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#econCarousel').getAttribute('data-autoplay'), 'paused');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.getElementById('econPlayback').getAttribute('aria-pressed') === 'false');
    assert.equal(await page.locator('#econCarousel').getAttribute('data-autoplay'), 'paused');
  });
  await check('PC 기본 펼침·모바일 핵심 우선·선택 기억', { width: 1440 }, async (page) => {
    await page.goto('http://jogan.test/');
    await ready(page);
    const selectors = ['#natFlow', '.lead-extras', '#trackList .kj-track__timeline', '#industryChart', '#nums .econ-reference'];
    for (const selector of selectors) assert.equal(await page.locator(selector).first().evaluate((node) => node.open), true, selector);
    const extras = page.locator('.lead-extras');
    await extras.locator('> summary').click();
    assert.equal(await extras.evaluate((node) => node.open), false);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const selector of selectors) await page.waitForFunction((selector) => !document.querySelector(selector).open, selector);
    assert.equal(await page.locator('#leadH').isVisible(), true);
    assert.equal(await page.locator('#nums .kj-stat__v').first().isVisible(), true);
    assert.ok((await page.locator('#nums .econ-base').first().innerText()).includes(latest.nums[0].src.base));
    await page.locator('#natFlow > summary').click();
    await extras.locator('> summary').click();
    await page.setViewportSize({ width: 1440, height: 844 });
    await page.waitForFunction(() => !document.querySelector('.lead-extras').open);
    assert.equal(await page.locator('#natFlow').evaluate((node) => node.open), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.lead-extras').open && document.getElementById('natFlow').open);
    await extras.locator('> summary').click();
    await page.locator('#menuBtn').click();
    await page.locator('#dn-home .kj-drawer__subs button').filter({ hasText: '오늘 꼭 볼 숫자' }).click();
    await page.locator('#drawer').waitFor({ state: 'hidden' });
    assert.equal(await extras.evaluate((node) => node.open), true, '메뉴로 숨긴 내용에 바로 이동하면 먼저 펼침');
  });
  console.log('브라우저 검사 완료:', checks);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
});
