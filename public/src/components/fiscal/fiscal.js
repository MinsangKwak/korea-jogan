'use strict';
// 재정: 국가채무와 국민연금

function renderFiscal() {
  const F = D.fiscal;
  kvRows($('fisMonthly'), F.monthly);
  $('fisMonthlySrc').textContent = F.monthlySrc;
  kvRows($('fisSummary'), F.summary);
  kvRows($('fisOutlook'), F.outlook);
  $('fisOutlookSrc').textContent = F.outlookSrc;
  $('debtSrc').textContent = F.debtSrc;

  const box = $('debtChart');
  const max = Math.max(...D.debt.map((d) => d[1]));
  D.debt.forEach(([y, v, r, kind], i) => {
    const prev = i > 0 ? D.debt[i - 1] : null;
    // 금액을 확인하지 못한 해는 막대를 그리지 않고 '미확인'으로 적는다
    if (prev && y - prev[0] > 1) {
      const gap = el('li', { class: 'kj-bar kj-bar--unknown' });
      const span = y - prev[0] === 2 ? String(prev[0] + 1) : (prev[0] + 1) + '~' + String(y - 1).slice(2);
      gap.append(el('span', { class: 'kj-bar__lab' }, span), el('span', { class: 'kj-bar__tr' }), el('span', { class: 'kj-bar__v' }, '—'));
      box.append(gap);
    }
    const settled = kind === '결산';
    const row = el('li', { class: 'kj-bar' + (settled ? ' kj-bar--semi' : ' kj-bar--forecast') });
    const lab = el('span', { class: 'kj-bar__lab' }, y + ' ');
    lab.append(el('span', { class: 'kj-badge ' + (settled ? 'kj-badge--brand' : 'kj-badge--dashed') }, kind));
    const tr = el('span', { class: 'kj-bar__tr' });
    const b = el('span', { class: 'kj-bar__b' });
    b.style.width = (v / max * 100) + '%';
    tr.append(b);
    const parts = ['GDP 대비 ' + r.toFixed(1) + '%'];
    if (prev) parts.push((y - prev[0] > 1 ? (y - prev[0]) + '년간 ' : '전년 대비 ') + '+' + one(v - prev[1]) + '조');
    const val = el('span', { class: 'kj-bar__v' });
    val.append(el('b', {}, one(v) + '조'));
    row.append(lab, tr, val, el('span', { class: 'kj-bar__m' }, parts.join(' · ')));
    box.append(row);
  });

  const N = D.nps;
  kvRows($('npsKv'), N.kv);
  const bar = $('npsBar');
  bar.setAttribute('aria-label', '자산군별 비중: ' + N.alloc.map((a) => a.a + ' ' + a.s + '%').join(', '));
  // 조각 색은 차트 계열 c1~c6 순서. 6개를 넘으면 마지막 색을 다시 쓴다
  N.alloc.forEach((a, i) => {
    const c = 'c' + Math.min(i + 1, 6);
    const seg = el('i', { class: c });
    seg.style.width = Math.max(a.s, 0.4) + '%';
    bar.append(seg);
    const li = el('li');
    li.append(el('span', { class: 'kj-sw ' + c, 'aria-hidden': 'true' }), el('span', {}, a.a), el('span', {}, a.amt + ' · ' + a.s.toFixed(1) + '%'));
    $('npsList').append(li);
  });
  $('npsSrc').textContent = N.src;
  kvRows($('npsReform'), N.reform);
  $('npsReformSrc').textContent = N.reformSrc;
}
