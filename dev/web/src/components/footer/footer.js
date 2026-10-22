'use strict';
// 바닥글: 수집 한계, 지난 호, 정정 기록

function renderLimits() {
  D.limits.forEach((t) => $('limits').append(el('li', {}, t)));
  collapse($('limits'), { noun: '개', name: '수집 한계', start: true });
}

function renderArchive() {
  const ul = $('archive');
  const list = INDEX ? INDEX.issues : [D.date];
  list.forEach((d) => {
    const li = el('li');
    const a = el('a', { href: d === (INDEX && INDEX.latest) ? './' : d }, d.replace(/-/g, '.'));
    if (d === D.date) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', () => track('archive', d));
    li.append(a);
    ul.append(li);
  });
}

function renderCorrections(list) {
  const ul = $('fixes');
  $('reportLink').href = reportUrl('');
  $('reportLink').addEventListener('click', () => track('report', 'footer'));
  if (!list.length) { ul.append(el('li', {}, '아직 정정한 내용이 없습니다.')); return; }
  // 최근 정정이 위로 오게 한다
  list.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach((c) => {
    const li = el('li');
    li.append(el('div', { class: 'fw' }, c.date.replace(/-/g, '.') + ' 정정 · ' + c.issue.replace(/-/g, '.') + '호 · ' + c.section));
    const p = el('div');
    p.append(el('del', {}, c.before), document.createTextNode(' → '), el('strong', {}, c.after));
    li.append(p, el('div', { class: 'fw' }, '이유: ' + c.reason));
    ul.append(li);
  });
}

// 정정 기록을 못 읽어도 오늘 호는 그대로 보여 준다
async function loadCorrections() {
  try {
    const res = await fetch('data/corrections.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    return (await res.json()).items || [];
  } catch (e) {
    return [];
  }
}
