'use strict';
// 오래 끄는 사안의 진행 막대. 언론 주제와 추적 섹션이 함께 쓴다

// base는 세는 기준 날짜다. 호에 실은 막대는 그 호의 날짜로, 추적 섹션은 오늘로 센다
function progressBox(p, base) {
  const span = Math.max(1, daysBetween(parseDate(p.start), parseDate(p.end)) + 1);
  const gone = Math.min(span, Math.max(0, daysBetween(parseDate(p.start), base) + 1));
  const left = span - gone;
  const pct = Math.round(gone / span * 100);
  const since = daysBetween(parseDate(p.since), base);

  const box = el('div', { class: 'kj-prog' });
  box.append(el('h4', {}, p.label));
  const big = el('p', { class: 'kj-prog__big' });
  big.append(el('strong', {}, String(since)), document.createTextNode('일'));
  box.append(big, el('p', { class: 'kj-prog__since' }, p.sinceLabel));

  const bar = el('div', {
    class: 'kj-prog__bar', role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': String(span), 'aria-valuenow': String(gone),
    'aria-valuetext': p.label + ' ' + span + '일 중 ' + gone + '일 지남'
  });
  const fill = el('span');
  fill.style.width = pct + '%';
  bar.append(fill);
  box.append(bar);
  box.append(el('p', { class: 'kj-prog__meta' }, span + '일 중 ' + gone + '일 지남 · ' + (left > 0 ? '남은 ' + left + '일(' + longDate(p.end) + '까지)' : '기한 지남')));
  return box;
}
