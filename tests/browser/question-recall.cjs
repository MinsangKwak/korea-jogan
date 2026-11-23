'use strict';
const assert = require('node:assert/strict');

async function checkQuestionRecall(check, origin) {
  const permalink = origin + '/politics/reversal-and-remand/';
  await check('스크립트 없이 판결문 문제와 출처 읽기', { javaScriptEnabled: false, width: 320 }, async ({ page }) => {
    await page.goto(permalink);
    const recall = page.locator('[data-question-recall]');
    assert.equal(await recall.getByRole('group', { name: /다음 재판/ }).isVisible(), true);
    assert.equal(await recall.getByRole('button', { name: '답 확인하기' }).count(), 0);
    await recall.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await recall.getByRole('link', { name: /판결문 원문/ }).isVisible(), true);
  });

  await check('선택 없는 확인·키보드 응답·오답과 정답 해설', { width: 320 }, async ({ page }) => {
    await page.goto(permalink);
    const recall = page.locator('[data-question-recall]');
    const checkAnswer = recall.getByRole('button', { name: '답 확인하기' });
    const choices = recall.getByRole('radio');
    const status = recall.getByRole('status');
    const saved = () => page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
    const initialStorage = await saved();
    await checkAnswer.click();
    assert.match(await status.innerText(), /하나 골라/);
    assert.equal(await choices.first().evaluate((input) => input === document.activeElement), true);
    await page.keyboard.press('Space');
    await checkAnswer.press('Enter');
    assert.match(await status.innerText(), /다시 읽어/);
    assert.equal(await recall.getByRole('link', { name: /판결문 원문/ }).isVisible(), true);
    await choices.first().focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await status.innerText(), '');
    await checkAnswer.press('Space');
    assert.match(await status.innerText(), /맞았습니다/);
    assert.equal(page.url(), permalink);
    assert.deepEqual(await saved(), initialStorage);
    await page.reload();
    assert.equal(await choices.last().isChecked(), false);
  });
}

module.exports = { checkQuestionRecall };
