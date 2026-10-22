#!/usr/bin/env node
'use strict';
// 공유 미리보기 이미지(dev/web/assets/images/og.png, 1200×630)를 card.html에서, 앱 아이콘(icon-512·icon-192·apple-touch-icon)을 icon.html에서 그린다
// 사용: node design/og/build.mjs  (Playwright와 Chromium이 필요하다. 카드나 아이콘을 바꿀 때만 돌린다)
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', '..', 'dev', 'web', 'assets', 'images');
// CJS로 받으면 chromium이 default 안에 들어 있다
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const chromium = pw.chromium || pw.default.chromium;

// [원본, 저장할 파일, 화면 너비, 화면 높이, 배율]. 아이콘은 512 원본을 배율로 줄여 찍는다
const SHOTS = [
  ['card.html', 'og.png', 1200, 630, 1],
  ['icon.html', 'icon-512.png', 512, 512, 1],
  ['icon.html', 'icon-192.png', 512, 512, 192 / 512],
  ['icon.html', 'apple-touch-icon.png', 512, 512, 180 / 512]
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [src, out, width, height, scale] of SHOTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto('file://' + path.join(here, src), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(pub, out), type: 'png' });
  await page.close();
  console.log('저장: dev/web/assets/images/' + out);
}
await browser.close();
