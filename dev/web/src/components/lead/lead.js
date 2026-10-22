'use strict';
// 홈 머리기사

function renderLead() {
  const L = D.lead;
  // 좁은 화면에서는 연도를 숨겨 호 정보가 한 줄에 들어가게 한다
  const dateEl = $('issueDate');
  dateEl.textContent = '';
  dateEl.append(el('span', { class: 'y' }, ISSUE.getUTCFullYear() + '년 '), document.createTextNode(ISSUE.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' })));
  $('issueDate').setAttribute('datetime', D.date);
  $('leadSkel').remove();
  $('leadBox').removeAttribute('aria-busy');
  $('leadKicker').textContent = L.kicker;
  $('leadH').textContent = L.headline;
  $('leadStand').textContent = L.standfirst;
  $('leadMeta').textContent = L.meta;
  L.facts.forEach((f) => {
    const li = el('li');
    li.append(el('span', { class: 't' }, f.t), el('span', { class: 'v' }, f.v), el('span', { class: 'm' }, f.m));
    $('leadFacts').append(li);
  });
  D.briefs.forEach((b) => {
    const li = el('li');
    const a = el('a', { href: b.href });
    a.append(el('span', { class: 'bk' }, b.k), el('span', { class: 'bm' }, b.m));
    // 처리기한처럼 날짜가 있는 항목은 남은 날을 배지로 붙인다
    if (b.dday) a.append(el('span', { class: 'kj-badge kj-badge--brand' }, dday(parseDate(b.dday))));
    li.append(a);
    $('briefs').append(li);
  });
  collapse($('briefs'), { noun: '개', name: '오늘 꼭 볼 숫자' });
}
