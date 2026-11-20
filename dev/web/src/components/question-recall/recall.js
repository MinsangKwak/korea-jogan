'use strict';

document.querySelectorAll('[data-question-recall]').forEach((recall) => {
  const controls = recall.querySelector('[data-recall-controls]');
  const status = recall.querySelector('[data-recall-status]');
  const explanation = recall.querySelector('details');

  controls.addEventListener('change', () => {
    status.textContent = '';
  });
  controls.querySelector('[data-recall-check]').addEventListener('click', () => {
    const selected = controls.querySelector('input:checked');
    if (!selected) {
      status.textContent = '답을 하나 골라 주세요.';
      controls.querySelector('input').focus();
      return;
    }
    status.textContent = selected.hasAttribute('data-correct')
      ? '맞았습니다. 사건을 돌려받은 서울고등법원이 다음 재판을 맡습니다.'
      : '주문을 다시 읽어 보세요. 대법원이 사건을 보낸 곳은 서울고등법원입니다.';
    explanation.open = true;
  });
  controls.hidden = false;
});
