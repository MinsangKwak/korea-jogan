'use strict';
// 정치: 임기, D-Day, 이번 주 일정

function renderPolitics() {
  const start = utc(2025, 6, 4);
  const end = utc(2030, 6, 3);
  const total = daysBetween(start, end) + 1;
  // 경과일과 재임 N일째는 하루 차이가 나므로 따로 표시한다
  const elapsed = daysBetween(start, ISSUE);
  const pct = (elapsed / total * 100).toFixed(1);
  $('termDay').textContent = '재임 ' + fmt(elapsed + 1) + '일째';
  $('termElapsed').textContent = fmt(elapsed) + '일';
  $('termLeft').textContent = fmt(daysBetween(ISSUE, end)) + '일';
  $('termPct').textContent = pct + '% 경과';
  $('termFill').style.width = pct + '%';
  $('termBar').setAttribute('aria-valuenow', pct);

  // 법에 날짜가 있는 일정은 실선 배지, 규칙으로 계산한 일정은 점선 배지
  [
    ['2027년도 예산안 국회 처리기한', utc(2026, 12, 2), '헌법 제54조', true],
    ['제23대 국회의원선거', utc(2028, 4, 12), '법정 선거일 기준 예정', true],
    ['제22대 대통령선거', utc(2030, 3, 27), '현행법 기준 예상', false],
    ['제10회 전국동시지방선거', utc(2030, 6, 5), '현행법 기준 예상', false]
  ].forEach(([name, date, status, legal]) => {
    const li = el('li');
    const iso = date.toISOString().slice(0, 10);
    const m = el('span', { class: 'm' });
    m.append(el('time', { datetime: iso }, iso.replace(/-/g, '.')), el('span', { class: 'kj-badge ' + (legal ? 'kj-badge--brand' : 'kj-badge--dashed') }, status));
    li.append(el('span', { class: 'n' }, name), el('span', { class: 'd' }, dday(date)), m);
    $('elec').append(li);
  });

  D.agenda.forEach((g) => {
    const li = el('li');
    const day = el('span', { class: 'day' }, g.day);
    if (g.dow) day.append(el('small', {}, g.dow + '요일'));
    const t = el('span');
    t.append(el('span', { class: 'cat' }, g.cat), document.createTextNode(g.t));
    li.append(day, t);
    $('agenda').append(li);
  });
  collapse($('agenda'), { noun: '개', name: '이번 주 일정', start: true });
  $('agendaSrc').textContent = '출처: ' + D.agendaSrc;
}
