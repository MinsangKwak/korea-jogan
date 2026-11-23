'use strict';
const { chromium } = require('playwright');

const launchOptions = () => ({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });

// 전체 검사에서는 이미 실행한 엔진에 연결하고 단독 검사에서는 직접 시작한다
const openBrowser = () => process.env.JOGAN_BROWSER_WS ? chromium.connect(process.env.JOGAN_BROWSER_WS) : chromium.launch(launchOptions());

module.exports = { openBrowser, launchOptions };
