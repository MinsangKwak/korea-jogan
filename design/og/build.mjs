#!/usr/bin/env node
'use strict';
// 공유 미리보기(1200×630)는 card.html에서, 앱 아이콘과 ICO는 icon.html에서 그린다
// 사용: node design/og/build.mjs  (Playwright와 Chromium이 필요하다. 카드나 아이콘을 바꿀 때만 돌린다)
// 아이콘만 다시 만들려면 --icons-only를 붙인다
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', '..', 'dev', 'web', 'assets', 'images');
// CJS로 받으면 chromium이 default 안에 들어 있다
const require = createRequire(path.join(here, '..', '..', 'dev', 'tests', 'browser', 'package.json'));
const pw = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const chromium = pw.chromium || pw.default.chromium;

// [원본, 저장할 파일, 화면 너비, 화면 높이, 배율]. 아이콘은 512 원본을 배율로 줄여 찍는다
const SHOTS = [
  ['card.html', 'og-pixel.png', 1200, 630, 1],
  ['icon.html', 'icon-512.png', 512, 512, 1],
  ['icon.html', 'icon-192.png', 512, 512, 192 / 512],
  ['icon.html', 'apple-touch-icon.png', 512, 512, 180 / 512]
];

const browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
for (const [src, out, width, height, scale] of SHOTS) {
  if (process.argv.includes('--icons-only') && src !== 'icon.html') continue;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto('file://' + path.join(here, src), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(pub, out), type: 'png' });
  await page.close();
  console.log('저장: dev/web/assets/images/' + out);
}
// PNG 자료를 담는 표준 ICO 컨테이너. 탭·즐겨찾기의 작은 크기도 각각 그린다
const icoImages = [];
for (const size of [16, 32, 48]) {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await page.goto('file://' + path.join(here, 'icon.html'), { waitUntil: 'load' });
  icoImages.push({ size, data: await page.screenshot({ type: 'png' }) });
  await page.close();
}
const directory = Buffer.alloc(6 + icoImages.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(icoImages.length, 4);
let offset = directory.length;
icoImages.forEach(({ size, data }, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(data.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await fs.writeFile(path.join(pub, '..', '..', 'favicon.ico'), Buffer.concat([directory, ...icoImages.map(({ data }) => data)]));
console.log('저장: dev/web/favicon.ico');
await browser.close();
