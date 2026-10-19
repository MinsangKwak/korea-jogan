#!/usr/bin/env node
'use strict';
// 공유 미리보기 이미지(public/og.png, 1200×630)를 card.html에서 그린다
// 사용: node scripts/og/build.mjs  (Playwright와 Chromium이 필요하다. 카드를 바꿀 때만 돌린다)
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'public', 'og.png');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + path.join(here, 'card.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log('저장: public/og.png');
