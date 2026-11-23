'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { openBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../../..');
const origin = 'https://jogan.test';
const dataPath = '/law/data/';
const manifestPath = dataPath + 'catalogue-status.json';
const privateMarker = 'local-only-reader-7341';
const source = id => 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=' + id;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webp': 'image/webp' };

async function surface(browser, web, width, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', ...options });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), body: request.postData(), referrer: request.headers().referer }));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.fulfill({ body: '', contentType: 'application/javascript' });
    const routePath = /^\/\d{4}-\d{2}-\d{2}$/.test(url.pathname) ? url.pathname + '.html' : url.pathname;
    const filename = path.join(web, routePath, routePath.endsWith('/') ? 'index.html' : '');
    try {
      const body = await fs.promises.readFile(filename);
      return route.fulfill({ body, contentType: types[path.extname(filename)] || 'application/octet-stream' });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  return { page, requests, context, errors };
}

async function press(locator, key = 'Enter') {
  await locator.focus();
  await locator.press(key);
}

async function checkLawPrivacy(page, requests) {
  const state = await page.evaluate(() => ({
    page: location.href, history: history.state, events: window.dataLayer || [],
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
  }));
  assert.ok(!JSON.stringify([state, requests]).includes(privateMarker), '입력한 사연이 주소·요청·저장소·분석 이벤트에 포함됨');
  assert.equal(requests.some(request => new URL(request.url).origin !== origin), false, '법률면의 외부 자동 요청');
  assert.equal(await page.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /(?:^|; )connect-src 'self'(?:;|$)/);
}

async function readerFlow(browser, web) {
  const { context, page, requests, errors } = await surface(browser, web, 320);
  try {
    await page.goto(origin + '/law/?theme=property');
    const result = page.locator('#lawOutput');
    await result.locator('.desk-record').first().waitFor();
    const input = page.locator('#lawQuery');
    await input.fill('문');
    await input.press('Enter');
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await input.evaluate(node => node === document.activeElement), true);

    await input.fill('보증금 ' + privateMarker);
    await input.press('Enter');
    await page.locator('#lawStatus').filter({ hasText: privateMarker }).waitFor();
    assert.equal(await page.locator('#lawResultTitle:focus').count(), 1);
    await checkLawPrivacy(page, requests);
    await input.fill('2024마8598');
    await input.press('Enter');
    const original = result.getByRole('link', { name: /공식 판례 원문 · 2024마8598/ });
    await original.waitFor();
    assert.equal(await original.getAttribute('href'), source(612117));
    const first = page.locator('[data-law-save-id="612117"]');
    await press(first, 'Space');
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    await checkLawPrivacy(page, requests);

    await press(page.getByRole('link', { name: '생활 법률 이슈', exact: true }));
    const topics = page.getByRole('list', { name: '생활 쟁점 목록' });
    await topics.waitFor();
    assert.ok(await topics.getByRole('link').count() >= 6);
    await press(topics.locator('a[href="?issue=rental-deposit"]'));
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    await press(page.locator('[data-law-save-id="207484"]'));
    await press(page.getByRole('link', { name: '보관한 판례 비교하기' }));
    await page.reload();
    const left = page.getByRole('combobox', { name: '첫 번째 판례' });
    const right = page.getByRole('combobox', { name: '두 번째 판례' });
    await left.selectOption('612117');
    assert.equal(await right.locator('option[value="612117"]').count(), 0);
    await right.selectOption('207484');
    const pair = page.getByRole('region', { name: '두 판례 비교' });
    assert.deepEqual(await pair.getByRole('link').evaluateAll(links => links.map(link => link.href)), [source(612117), source(207484)]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '모바일 비교 화면 넘침');
    await press(pair.getByRole('button', { name: '비교 선택 초기화' }));
    assert.equal(await left.evaluate(node => node === document.activeElement), true);
    assert.equal(await pair.getByRole('article').count(), 0);

    await page.goBack();
    const calendar = page.getByRole('link', { name: '입법 일정 보기' });
    assert.equal(new URL(await calendar.getAttribute('href'), origin).searchParams.get('q'), '주택임대차보호법');
    await press(calendar);
    await page.locator('#cal-records li > a').first().waitFor();
    assert.equal(await page.locator('#cal-q').inputValue(), '주택임대차보호법');
    assert.match(await page.locator('#cal-records li > a').first().getAttribute('href'), /^https:\/\/(?:[\w-]+\.)*(?:assembly|law|lawmaking)\.go\.kr\//);
    await page.locator('#cal-q').fill(privateMarker);
    await page.locator('#cal-q').press('Enter');
    assert.equal(await page.locator('#cal-result-title:focus').count(), 1);
    await checkLawPrivacy(page, requests);
    await press(page.locator('#cal-today'));
    const today = page.locator('#cal-days [aria-current="date"]');
    const seoulDate = await page.evaluate(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()));
    assert.equal(await today.getAttribute('data-date'), seoulDate);
    await press(page.locator('#cal-prev'));
    assert.notEqual(await page.locator('#cal-month').inputValue(), seoulDate.slice(0, 7));
    await press(page.locator('#cal-next'));
    assert.equal(await page.locator('#cal-month').inputValue(), seoulDate.slice(0, 7));
    await press(today, 'ArrowRight');
    const next = new Date(seoulDate + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    assert.equal(await page.locator('#cal-days [aria-pressed="true"]:focus').getAttribute('data-date'), next.toISOString().slice(0, 10));
    assert.deepEqual(errors, []);
    console.log('통과: 사건번호 검색 → 생활 쟁점 → 보관·비교 → 입법 캘린더, 키보드·사연 비공개');
  } finally {
    await context.close();
  }
}

async function coverFlow(browser, web) {
  const catalogue = JSON.parse(fs.readFileSync(path.join(web, 'data/news-case-pairs.json'), 'utf8')).pairs;
  const { context, page, requests, errors } = await surface(browser, web, 390);
  try {
    await page.goto(origin);
    await page.waitForFunction(() => document.documentElement.dataset.loadState === 'ready');
    const issueDate = await page.locator('#issueDate').getAttribute('datetime');
    const [featured] = catalogue.filter(pair => pair.issueDate <= issueDate).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    assert.ok(featured, '운영 호에 함께 읽을 기사가 필요합니다.');
    const story = page.locator('#caseEditionStory');
    assert.equal(await story.locator('#casePairArticle').getAttribute('href'), featured.articleUrl);
    assert.equal(await story.locator('#casePairRuling').getAttribute('href'), source(featured.caseId));
    assert.match(await story.textContent(), new RegExp(featured.caseNumber));
    const search = page.locator('#frontCaseQuery');
    assert.ok(await search.evaluate(input => input.labels.length && input.labels[0].textContent.trim()));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const lawEntry = page.locator('#cats a[href="/law/"]');
      for (const element of [page.locator('#frontQuestion'), lawEntry]) {
        const box = await element.boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= 844, width + 'px 첫 화면에 오늘의 질문과 판례 자료실이 보여야 합니다.');
      }
      await press(lawEntry);
      assert.equal(page.url(), origin + '/law/');
      await page.goBack();
      await page.waitForFunction(() => document.documentElement.dataset.loadState === 'ready');
    }
    await press(page.locator('#politicsFront a[href="#caseEdition"]'));
    await page.waitForURL(origin + '/#caseEdition');
    assert.equal(await search.isVisible(), true);
    const searchBox = await search.boundingBox();
    assert.ok(searchBox && searchBox.y >= 0 && searchBox.y < 844, '기사와 판례 바로가기를 누르면 판례 검색으로 이동합니다.');
    const choices = page.locator('#caseEditionChoices');
    const second = choices.locator('button[data-pair-id]').filter({ hasNotText: featured.question }).first();
    if (await choices.isVisible()) {
      await press(choices.locator('summary'));
      const id = await second.getAttribute('data-pair-id');
      const next = catalogue.find(pair => pair.id === id);
      await press(second);
      assert.equal(await story.locator('#casePairQuestion').innerText(), next.question);
      assert.equal(await story.locator('#casePairRuling').getAttribute('href'), source(next.caseId));
    }
    await search.fill('2024마8598');
    await search.press('Enter');
    const original = page.locator('#lawOutput a[href*="precSeq=612117"]');
    await original.first().waitFor();
    assert.equal(page.url(), origin + '/law/');
    assert.equal(await page.locator('#lawQuery').inputValue(), '2024마8598');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('jg:law-search-once')), null);

    await page.goto(origin);
    const events = [];
    await page.exposeFunction('collectCoverAction', (...args) => events.push(args));
    await page.evaluate(() => { window.track = (...args) => window.collectCoverAction(...args); });
    await page.locator('#frontCaseQuery').fill(privateMarker);
    await page.locator('#frontCaseQuery').press('Enter');
    await page.waitForURL(origin + '/law/');
    await page.locator('#lawStatus').filter({ hasText: privateMarker }).waitFor();
    const state = await page.evaluate(() => [location.href, history.state, Object.entries(localStorage), Object.entries(sessionStorage), window.dataLayer]);
    assert.ok(!JSON.stringify([requests, state, events]).includes(privateMarker), '1면 검색 입력이 요청·리퍼러·저장소·분석에 잔류함');
    for (const name of ['reader_law_open', 'reader_law_from_search', 'reader_law_edition_entry']) {
      assert.equal(events.filter(([event]) => event === name).length, 1, '1면 검색 1회 집계 ' + name);
    }
    await page.reload();
    await page.locator('[data-theme-id]').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('#lawQuery').inputValue(), '');
    assert.deepEqual(errors, []);
    console.log('통과: 정치 질문에서 기사·판례로 이동, PC·모바일 판례 검색, 입력 1회 전달과 폐기');
  } finally {
    await context.close();
  }
}

async function returnToCoverage(browser, web) {
  const catalogue = JSON.parse(fs.readFileSync(path.join(web, 'data/news-case-pairs.json'), 'utf8')).pairs;
  const record = catalogue.find(pair => pair.section === 'national');
  const { context, page, errors } = await surface(browser, web, 390);
  try {
    await page.goto(origin + '/' + record.issueDate + '#national');
    const headline = page.locator('#natHeadlines button').filter({ hasText: record.articleTitle });
    await headline.waitFor({ state: 'attached' });
    if (!await headline.isVisible()) await press(page.locator('button[aria-controls="natHeadlines"]'));
    await press(headline);
    const caseLink = page.locator('#natArticle .article-law-link');
    const target = new URL(await caseLink.getAttribute('href'), origin);
    assert.equal(target.searchParams.get('q'), record.caseNumber);
    await press(caseLink);
    const result = page.locator('.desk-record').filter({ has: page.locator('a[href="' + source(record.caseId) + '"]') });
    const back = result.locator('.desk-related-news a').filter({ hasText: record.articleTitle });
    await press(back);
    assert.equal(new URL(page.url()).pathname, '/' + record.issueDate);
    assert.equal(new URL(page.url()).searchParams.get('pair'), record.id);
    assert.equal(new URL(page.url()).hash, '#caseEdition');
    assert.equal(await page.locator('#casePairQuestion').innerText(), record.question);
    assert.deepEqual(errors, []);
    console.log('통과: 전국 기사에서 해당 선례를 찾고 동일한 쟁점과 발행 호로 돌아오기');
  } finally {
    await context.close();
  }
}

async function staticCover(browser, web) {
  const catalogue = JSON.parse(fs.readFileSync(path.join(web, 'data/news-case-pairs.json'), 'utf8')).pairs;
  const { context, page } = await surface(browser, web, 390, { javaScriptEnabled: false });
  try {
    await page.goto(origin);
    const index = JSON.parse(await page.locator('#issue-index').textContent());
    const dated = catalogue.map(pair => pair.issueDate).sort();
    const issue = dated[dated.length - 1];
    const article = catalogue.find(pair => pair.issueDate === issue);
    await page.goto(origin + '/' + issue);
    const story = page.locator('#caseEditionStory');
    assert.ok(await story.isVisible());
    assert.equal(await story.locator('#casePairArticle').getAttribute('href'), article.articleUrl);
    assert.equal(await story.locator('#casePairRuling').getAttribute('href'), source(article.caseId));
    assert.ok(await story.locator('#casePairRuling').isVisible());
    const before = index.issues.find(date => date < dated[0]);
    if (before) {
      await page.goto(origin + '/' + before);
      assert.ok(await page.locator('#casePairEmpty').isVisible());
      assert.equal(await story.locator('a[href*="precSeq="]').count(), 0);
      assert.ok(await page.locator('#caseEdition a[href="/law/"]:visible').count() > 0);
    }
    console.log('통과: 자바스크립트 없는 날짜별 지면에서 원문 읽기와 지난 호 검색');
  } finally {
    await context.close();
  }
}

async function adminIntegrity(browser, web) {
  const { context, page, requests, errors } = await surface(browser, web, 1440);
  const manifest = JSON.parse(fs.readFileSync(path.join(web, manifestPath), 'utf8'));
  const expected = manifest.files.map(entry => dataPath + entry.file).sort();
  const dataRequests = () => requests.map(request => new URL(request.url).pathname).filter(url => url.startsWith(dataPath));
  try {
    assert.equal(expected.length, 18);
    await page.route(origin + manifestPath, route => route.fulfill({ status: 503, body: '' }), { times: 1 });
    await page.goto(origin + '/admin/');
    await page.locator('#retryLaw:visible').waitFor();
    assert.deepEqual(dataRequests(), [manifestPath]);
    await press(page.locator('#retryLaw'));
    await page.locator('#lawDetails:not([hidden])').waitFor();
    assert.deepEqual(dataRequests(), [manifestPath, manifestPath], '검사 버튼을 누르기 전에 원자료를 내려받음');
    assert.match(await page.locator('#lawStatusMessage').textContent(), /18개 파일/);
    assert.equal(await page.locator('#lawFileRows tr').count(), 18);
    await press(page.locator('#lawDetails summary'));

    const entry = manifest.files.find(item => item.file === 'gazette-preview.json');
    const bytes = fs.readFileSync(path.join(web, dataPath, entry.file));
    bytes[bytes.length - 1] ^= 1;
    await page.route(origin + dataPath + entry.file, route => route.fulfill({ body: bytes, contentType: 'application/json' }), { times: 1 });
    const verify = page.locator('#verifyLaw');
    await press(verify);
    const status = page.locator('#lawVerification');
    await status.filter({ hasText: '일치 17개 / 확인 실패 1개' }).waitFor();
    assert.deepEqual(dataRequests().slice(2).sort(), expected);
    const failed = page.locator('#lawFileRows tr').filter({ has: page.locator('[data-failed="true"]') });
    assert.equal(await failed.count(), 1);
    assert.equal(await failed.getByRole('rowheader').textContent(), entry.label);

    await press(verify);
    await status.filter({ hasText: '일치 18개 / 확인 실패 0개' }).waitFor();
    assert.deepEqual(dataRequests().slice(2 + expected.length).sort(), expected);
    assert.equal(await page.locator('#lawFileRows td[data-failed]').count(), 0);
    assert.equal(await page.locator('#lawFileRows').getByRole('cell', { name: '일치', exact: true }).count(), 18);
    assert.deepEqual(errors, []);
    console.log('통과: 관리자 수록 목록 자동 조회·재시도, 동일 길이 파일 변경 감지와 18개 SHA-256 복구');
  } finally {
    await context.close();
  }
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-law-'));
  let browser;
  try {
    const web = path.join(temp, 'web');
    fs.cpSync(path.join(repo, 'frontend-vanilla-js'), web, { recursive: true });
    const build = [
      'import sys', 'from pathlib import Path', 'sys.path.insert(0, sys.argv[1])', 'import build_pages as pages',
      'pages.PUBLIC = Path(sys.argv[2])', 'pages.ISSUES = pages.PUBLIC / "data/issues"', 'pages.build()',
    ].join('\n');
    execFileSync('python3', ['-c', build, path.join(repo, 'backend-python/pipeline/build'), web]);
    browser = await openBrowser();
    await coverFlow(browser, web);
    await staticCover(browser, web);
    await returnToCoverage(browser, web);
    await readerFlow(browser, web);
    await adminIntegrity(browser, web);
  } finally {
    await browser?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
