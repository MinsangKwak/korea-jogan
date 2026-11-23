'use strict';
// 홈: 오늘 기준이 갈린 숫자

// 갈린 숫자는 표 첫 열에 모여 있다. pick이 있으면 그 두 줄을, 없으면 처음과 마지막 줄을 크게 보여 준다
function splitValues(c) {
  const vals = c.rows.map((r) => r[0]);
  const validPick = Array.isArray(c.pick) && c.pick.length === 2 && c.pick.every((i) => Number.isInteger(i) && i >= 0 && i < vals.length);
  const [i, j] = validPick ? c.pick : [0, vals.length - 1];
  return vals[i] === vals[j] ? [vals[i]] : [vals[i], vals[j]];
}

// 홈에는 주제마다 첫 번째 갈린 숫자 하나씩만 둔다. 나머지는 언론 섹션에서 본다
function renderSplits() {
  const withDiffs = D.themes.filter((t) => t.diffs && t.diffs.length);
  if (!withDiffs.length) return;
  const total = withDiffs.reduce((n, t) => n + t.diffs.length, 0);
  $('splitBox').hidden = false;
  $('splitMeta').textContent = '같은 사실을 매체마다 다른 숫자로 썼습니다 · 이 호에서 ' + total + '건';
  withDiffs.slice(0, 3).forEach((t) => {
    const c = t.diffs[0];
    const card = el('article', { class: 'scard' });
    const sv = el('div', { class: 'sv', 'aria-label': '갈린 값: ' + splitValues(c).join(', ') });
    splitValues(c).forEach((v) => sv.append(el('span', {}, v)));
    const more = el('button', { class: 'kj-btn kj-btn--ghost', type: 'button' }, t.diffs.length > 1 ? '왜 다른지 보기 · 이 주제 ' + t.diffs.length + '건' : '왜 다른지 보기');
    more.addEventListener('click', () => { track('split-home', c.q); openDiff(t.id, 0); });
    card.append(el('span', { class: 'st' }, t.title), sv, el('h3', {}, c.q), el('p', {}, c.a), more);
    $('splits').append(card);
  });
}
