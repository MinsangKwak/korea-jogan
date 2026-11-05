'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const { chromium } = require('playwright');
const { launchOptions } = require('./browser.cjs');

(async () => {
  const server = await chromium.launchServer({ ...launchOptions(), host: '127.0.0.1' });
  try {
    process.env.JOGAN_BROWSER_WS = server.wsEndpoint();
    const first = await chromium.connect(server.wsEndpoint());
    const second = await chromium.connect(server.wsEndpoint());
    try {
      const left = await first.newContext();
      const right = await second.newContext();
      await left.addCookies([{ name: 'isolation', value: 'private', domain: 'jogan.test', path: '/' }]);
      assert.deepEqual(await right.cookies(), []);
      await first.close();
      assert.equal(second.isConnected(), true);
      await right.close();
    } finally {
      await first.close();
      await second.close();
    }
    console.log('브라우저 엔진 1회 시작 · 검사 연결과 저장소 격리 확인');
    const files = ['smoke.cjs', 'admin.cjs', 'security.cjs', 'discovery.cjs', 'preview.cjs', 'daily.cjs'].map((file) => path.join(__dirname, file));
    const stream = run({ files, concurrency: 2 });
    stream.on('test:fail', () => { process.exitCode = 1; });
    const completed = new Promise((resolve, reject) => { stream.once('end', resolve); stream.once('error', reject); });
    stream.compose(spec).pipe(process.stdout, { end: false });
    await completed;
  } finally {
    delete process.env.JOGAN_BROWSER_WS;
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
