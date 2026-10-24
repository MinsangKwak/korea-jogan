#!/usr/bin/env node
'use strict';
// 실제 브라우저로 화면이 끝까지 그려지는지 본다. 데이터 검사(validate.py)를 통과한 호가 화면에서 깨지지 않는지 확인하는 마지막 단계다
// 사용: python dev/pipeline/build/build_pages.py 를 먼저 돌린 뒤 node dev/tests/browser/smoke.mjs
// Playwright가 필요하다. 다른 위치의 Playwright를 쓰려면 PLAYWRIGHT_MODULE에 경로를 넣는다
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..', '..', 'web');
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const chromium = pw.chromium || pw.default.chromium;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

// GitHub Pages처럼 /YYYY-MM-DD 를 YYYY-MM-DD.html 로 연다
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(web, p);
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(web) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = 'http://127.0.0.1:' + server.address().port;
const index = JSON.parse(fs.readFileSync(path.join(web, 'data', 'issues', 'index.json'), 'utf8'));
const past = index.issues.find((d) => d !== index.latest);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const failures = [];
const check = (name, ok, detail) => { console.log((ok ? '통과 ' : '실패 ') + name + (detail ? ' · ' + detail : '')); if (!ok) failures.push(name); };

// 바깥 글꼴·측정 요청은 막아 시험이 네트워크에 흔들리지 않게 한다
async function open(url, { width = 390, mutate } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: width < 700 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  if (mutate) {
    await page.route(/data\/issues\/\d{4}-\d{2}-\d{2}\.json/, async (r) => {
      const res = await r.fetch();
      const data = await res.json();
      mutate(data);
      r.fulfill({ response: res, json: data });
    });
  }
  await page.goto(base + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return { page, errors };
}

// 1. 최신 호, 휴대폰 폭
{
  const { page, errors } = await open('/');
  const s = await page.evaluate(() => ({
    lead: document.getElementById('leadH').textContent.trim(),
    loader: !!document.getElementById('loader'),
    digest: !!document.getElementById('seoDigest'),
    sw: document.documentElement.scrollWidth,
    vw: document.documentElement.clientWidth,
    tabs: Array.from(document.querySelectorAll('#tabNav li')).map((li) => li.getBoundingClientRect().right)
  }));
  check('최신 호 머리기사', s.lead.length > 0, s.lead.slice(0, 30));
  check('로딩 화면이 걷힘', !s.loader);
  check('검색용 요약이 지워짐', !s.digest);
  check('가로 넘침 없음(390px)', s.sw <= s.vw, s.sw + '/' + s.vw);
  check('하단 탭이 화면 안', s.tabs.every((r) => r <= s.vw + 1), s.tabs.map(Math.round).join(','));
  check('스크립트 오류 없음', errors.length === 0, errors.join(' | '));
  // 2. 모바일 전체 메뉴 열고 닫기
  await page.click('#tabMenu');
  const open1 = await page.evaluate(() => !document.getElementById('drawer').hidden && document.activeElement && document.getElementById('drawer').contains(document.activeElement));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => document.getElementById('drawer').hidden && document.activeElement.id === 'tabMenu');
  check('전체 메뉴 열기·포커스', open1);
  check('Esc로 닫고 포커스 돌려줌', closed);
  await page.close();
}

// 3. 지난 호 페이지
if (past) {
  const { page, errors } = await open('/' + past);
  const s = await page.evaluate(() => ({ date: document.getElementById('issueDate').getAttribute('datetime'), canon: document.querySelector('link[rel=canonical]').href }));
  check('지난 호 페이지가 그 날짜를 엶', s.date === past, s.date);
  check('지난 호 canonical', s.canon.endsWith('/' + past), s.canon);
  check('지난 호 스크립트 오류 없음', errors.length === 0, errors.join(' | '));
  await page.close();
}

// 4. 자료가 빠진 호: 그리기가 실패해도 오류 화면과 요약을 보여 주고 로딩 화면에 갇히지 않는다
{
  const { page } = await open('/', { mutate: (d) => { d.themes = []; } });
  const s = await page.evaluate(() => ({
    error: !document.getElementById('loadError').hidden,
    loader: !!document.getElementById('loader'),
    digestShown: (() => { const d = document.getElementById('seoDigest'); return !!d && getComputedStyle(d).display !== 'none'; })()
  }));
  check('자료 누락 시 오류 화면', s.error);
  check('자료 누락 시 로딩 화면이 걷힘', !s.loader);
  check('자료 누락 시 요약을 보여 줌', s.digestShown);
  await page.close();
}

// 5. 넓은 화면
{
  const { page, errors } = await open('/', { width: 1280 });
  const s = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
  check('가로 넘침 없음(1280px)', s.sw <= s.vw, s.sw + '/' + s.vw);
  check('넓은 화면 스크립트 오류 없음', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
server.close();
console.log(failures.length ? `\n실패 ${failures.length}개` : '\n모두 통과');
process.exit(failures.length ? 1 : 0);
