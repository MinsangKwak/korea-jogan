'use strict';
// 실제 초안이 있으면 그 호를 임시 시안으로 그리며 원본 상태와 사람 확인 기록은 바꾸지 않는다
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-daily-browser-'));
const web = path.join(temp, 'web');
fs.cpSync(path.join(repo, 'dev/web'), web, { recursive: true });
const issues = path.join(web, 'data/issues');
const sourceIndex = JSON.parse(fs.readFileSync(path.join(issues, 'index.json'), 'utf8'));
const sourceIssue = JSON.parse(fs.readFileSync(path.join(issues, sourceIndex.latest + '.json'), 'utf8'));
assert.equal(sourceIssue.date, sourceIndex.latest, '최신 호 색인과 후보 날짜 불일치');
assert.ok(sourceIndex.issues.includes(sourceIndex.latest), '최신 후보가 발행 목록에 없음');
const actualDraft = sourceIssue.status === 'draft';
const candidate = structuredClone(sourceIssue);
if (!actualDraft) {
  const tomorrow = new Date(candidate.date + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  candidate.date = tomorrow.toISOString().slice(0, 10);
  candidate.status = 'draft';
  delete candidate.review;
  sourceIndex.latest = candidate.date;
  sourceIndex.issues.unshift(candidate.date);
}
// draft를 제외하는 배포 빌드에서도 후보 자체를 검사하도록 임시 복사본만 시안으로 바꾼다
candidate.status = 'prototype';
fs.writeFileSync(path.join(issues, candidate.date + '.json'), JSON.stringify(candidate));
fs.writeFileSync(path.join(issues, 'index.json'), JSON.stringify(sourceIndex));
execFileSync('python3', ['-c', 'import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);import build_pages as b;b.PUBLIC=Path(sys.argv[2]);b.ISSUES=b.PUBLIC/"data/issues";b.build()', path.join(repo, 'dev/pipeline/build'), web]);
const builtHome = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const builtIndex = JSON.parse(builtHome.match(/<script type="application\/json" id="issue-index">(.*?)<\/script>/s)[1]);
assert.equal(builtIndex.latest, candidate.date, '후보 대신 이전 공개 호를 빌드함');
const builtIssue = JSON.parse(builtHome.match(/<script type="application\/json" id="issue-data">(.*?)<\/script>/s)[1]);
assert.deepEqual(builtIssue, candidate, '빌드에 실제 후보 내용이 실리지 않음');
const origin = 'http://jogan.test';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const sections = ['national', 'track', 'home', 'regions', 'media', 'politics', 'economy', 'industry', 'fiscal'];
let browser;
let checks = 0;

async function surface(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'light' });
  await context.addInitScript(() => {
    window.dailyCspEvents = [];
    addEventListener('securitypolicyviolation', (event) => window.dailyCspEvents.push(event.effectiveDirective + ': ' + event.blockedURI));
  });
  const page = await context.newPage();
  const errors = [], telemetry = [], missing = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (/googletagmanager|google-analytics|gc\.zgo\.at/.test(url.hostname)) telemetry.push(url.href);
      return route.fulfill({ status: 200, body: '', contentType: route.request().resourceType() === 'script' ? mime['.js'] : mime['.css'] });
    }
    let file = path.join(web, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    if (!path.extname(file)) file += '.html';
    try {
      let body = fs.readFileSync(file);
      if (options.brokenRender && path.extname(file) === '.html') {
        body = body.toString().replace(/(<script type="application\/json" id="issue-data">)(.*?)(<\/script>)/s, (_all, start, json, end) => {
          const broken = JSON.parse(json);
          broken.lead.facts = null;
          return start + JSON.stringify(broken).replace(/</g, '\\u003c') + end;
        });
      }
      return route.fulfill({ body, contentType: mime[path.extname(file)] || 'application/octet-stream' });
    } catch {
      if (url.pathname !== '/data/live.json') missing.push(url.pathname);
      return route.fulfill({ status: 404, body: '' });
    }
  });
  return { page, context, errors, telemetry, missing };
}

async function candidateReady(page) {
  await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.loadState));
  assert.equal(await page.locator('html').getAttribute('data-load-state'), 'ready', '후보 호 렌더링 실패');
}

async function check(name, options, run) {
  const state = await surface(options);
  try {
    await state.page.goto(origin + '/');
    await run(state.page);
    assert.deepEqual(state.errors, [], '처리되지 않은 후보 브라우저 오류');
    assert.deepEqual(state.telemetry, [], '자동화 검사가 운영 조회를 생성함');
    assert.deepEqual(state.missing, [], '후보의 정적 파일 누락');
    assert.deepEqual(await state.page.evaluate(() => window.dailyCspEvents), [], '후보 CSP 위반');
    console.log('통과:', name);
    checks += 1;
  } finally { await state.context.close(); }
}

(async () => {
  try {
    console.log('일일 후보 검사:', actualDraft ? '실제 draft ' + candidate.date : '실제 draft 없음 · 모의 초안 ' + candidate.date + ' (원본 ' + sourceIssue.date + ' 복사)');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
    await check('후보의 실제 날짜·머리기사와 9개 섹션 전체 초기화', {}, async (page) => {
      await candidateReady(page);
      assert.deepEqual(await page.evaluate(() => D), candidate);
      assert.equal(await page.evaluate(() => INDEX.latest), candidate.date);
      assert.equal(await page.locator('#issueDate').getAttribute('datetime'), candidate.date);
      assert.equal(await page.locator('#leadH').textContent(), candidate.lead.headline);
      assert.equal(await page.locator('#leadStand').textContent(), candidate.lead.standfirst);
      assert.equal(await page.locator('#leadFacts > li').count(), candidate.lead.facts.length);
      await page.locator('#track').waitFor({ state: 'visible' });
      for (const section of sections) assert.equal(await page.locator('#' + section).isVisible(), true, section);
      assert.match(await page.locator('#natMeta').textContent(), new RegExp('^' + candidate.national.items.length + '건'));
      assert.ok((await page.locator('#natList').textContent()).includes(candidate.national.items[0].title));
      assert.match(await page.locator('#regMeta').textContent(), new RegExp('^' + candidate.regions.items.length + '건'));
      assert.equal(await page.locator('#agenda > li').count(), candidate.agenda.length);
      assert.deepEqual(await page.locator('#nums .kj-stat__v').allTextContents(), candidate.nums.map((item) => item.v));
      assert.equal(await page.locator('#tradeIntro').textContent(), candidate.trade.intro);
      assert.deepEqual(await page.locator('#tradeStats .v').allTextContents(), candidate.trade.stats.map((item) => item.v));
      assert.equal(await page.locator('#bars > li').count(), candidate.items.length);
      assert.equal(await page.locator('#inds > article').count(), candidate.industries.length);
      assert.deepEqual(await page.locator('#fisMonthly .v').allTextContents(), candidate.fiscal.monthly.map((item) => item.v));
      assert.equal(await page.locator('#npsList > li').count(), candidate.nps.alloc.length);
      assert.equal(await page.locator('#seoDigest').count(), 0);
      assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
    });

    await check('모든 후보 언론 주제와 요약·기사 목록 렌더링', {}, async (page) => {
      await candidateReady(page);
      assert.equal(await page.locator('#tchips > button').count(), candidate.themes.length);
      for (let index = 0; index < candidate.themes.length; index += 1) {
        const theme = candidate.themes[index];
        await page.locator('#tchips > button').nth(index).click();
        assert.equal(await page.locator('#tresult > h3').textContent(), theme.title);
        assert.deepEqual(await page.locator('#tresult .kj-ai > ul > li').allTextContents(), theme.summary);
        assert.equal(await page.locator('#tresult .links a').count(), theme.articles.length);
      }
    });

    for (const width of [320, 1440]) {
      await check('후보 지면의 모바일·PC 너비 ' + width, { width }, async (page) => {
        await candidateReady(page);
        const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(size.scroll <= size.width + 1, JSON.stringify({ date: candidate.date, width, size }));
        assert.equal(await page.locator('#leadH').textContent(), candidate.lead.headline);
      });
    }

    await check('JSON을 읽어도 렌더링이 깨진 후보는 성공 판정하지 않음', { brokenRender: true }, async (page) => {
      await assert.rejects(candidateReady(page), /후보 호 렌더링 실패/);
      assert.equal(await page.locator('#loadError').isVisible(), true);
      assert.equal(await page.locator('#seoDigest').count(), 1);
    });
    console.log('일일 후보 브라우저 검사 ' + checks + '개 통과 · ' + (actualDraft ? '실제 초안' : '모의 초안 경로') + ' · 원본 JSON 변경 없음');
  } finally {
    if (browser) await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
