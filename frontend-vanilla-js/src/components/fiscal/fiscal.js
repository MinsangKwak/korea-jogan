'use strict';
// 재정: 국가채무와 국민연금

function fiscalSource(id, note) {
  const box = $(id);
  const parts = String(note || '').split(/(https?:\/\/[^\s<>]+)/g);
  for (const part of parts) {
    if (safeSourceHref(part)) {
      box.append(newsSourceLink(part, new URL(part).hostname + ' 원문'));
    } else {
      box.append(document.createTextNode(part));
    }
  }
  box.closest('details').hidden = !note;
}

function renderDebtYears(records) {
  const years = records.slice().sort((a, b) => a[0] - b[0]);
  const settled = years.filter((year) => year[3] === '결산');
  const recentYears = settled.slice(-2).map(([year]) => year);
  const maximum = Math.max(1, ...years.map((year) => year[1]));
  const history = $('debtHistoryList');
  const plans = $('debtPlansList');
  years.forEach(([year, value, ratio, kind], index) => {
    const isSettled = kind === '결산';
    const row = el('li', { class: 'kj-bar ' + (isSettled ? 'kj-bar--semi' : 'kj-bar--forecast') });
    const label = el('span', { class: 'kj-bar__lab' }, year + '년 ');
    label.append(el('span', { class: 'kj-badge ' + (isSettled ? 'kj-badge--brand' : 'kj-badge--dashed') }, kind));
    const track = el('span', { class: 'kj-bar__tr', 'aria-hidden': 'true' });
    const bar = el('span', { class: 'kj-bar__b' });
    bar.style.width = value / maximum * 100 + '%';
    track.append(bar);
    const amount = el('span', { class: 'kj-bar__v' });
    amount.append(el('b', {}, one(value) + '조 원'));
    const notes = ['GDP 대비 ' + ratio.toFixed(1) + '%'];
    if (index > 0) {
      const [previousYear, previousValue] = years[index - 1];
      const difference = value - previousValue;
      const prefix = year - previousYear === 1 ? '전년 대비 ' : previousYear + '년 대비 ';
      notes.push(prefix + (difference > 0 ? '+' : '') + one(difference) + '조 원');
      if (year > previousYear + 1) {
        const missing = year === previousYear + 2 ? String(year - 1) : (previousYear + 1) + '–' + (year - 1);
        notes.push(missing + '년 자료 미확인');
      }
    }
    row.append(label, track, amount, el('span', { class: 'kj-bar__m' }, notes.join(' · ')));
    if (isSettled) {
      const list = recentYears.includes(year) ? $('debtChart') : history;
      list.prepend(row);
    } else {
      plans.append(row);
    }
  });
  $('debtLatestH').hidden = settled.length === 0;
  $('debtHistory').hidden = !history.children.length;
  $('debtPlans').hidden = !plans.children.length;
  if (history.children.length) {
    $('debtHistoryLabel').textContent = '이전 연도 결산 · ' + history.children.length + '개 연도';
  }
}

function renderFiscal() {
  const F = D.fiscal;
  kvRows($('fisMonthly'), F.monthly);
  fiscalSource('fisMonthlySrc', F.monthlySrc);
  kvRows($('fisSummary'), F.summary);
  kvRows($('fisOutlook'), F.outlook);
  fiscalSource('fisOutlookSrc', F.outlookSrc);
  fiscalSource('debtSrc', F.debtSrc);
  renderDebtYears(D.debt);

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
  fiscalSource('npsSrc', N.src);
  kvRows($('npsReform'), N.reform);
  fiscalSource('npsReformSrc', N.reformSrc);
}
