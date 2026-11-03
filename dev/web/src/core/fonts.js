'use strict';
// 외부 글꼴은 첫 지면을 차단하지 않고, 인라인 이벤트 없이 적용한다
(function () {
  const sheet = document.getElementById('fontStyles');
  if (!sheet) return;
  const apply = () => { sheet.media = 'all'; };
  sheet.addEventListener('load', apply, { once: true });
  if (sheet.sheet) apply();
})();
