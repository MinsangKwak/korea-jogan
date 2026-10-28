'use strict';
// 바닥글: 수집 한계, 지난 호, 정정 기록

function renderLimits() {
  D.limits.forEach((t) => $('limits').append(el('li', {}, t)));
  collapse($('limits'), { noun: '개', name: '수집 한계', start: true });
}

// 지난 호는 선택 상자로 고르고 '이 호 보기'로 옮겨 간다
// 고르기만 해도 바로 옮기면 키보드 화살표로 훑는 사이에 페이지가 바뀌어 버튼을 따로 둔다
function renderArchive() {
  const select = $('archSel');
  const latest = INDEX ? INDEX.latest : D.date;
  const list = INDEX ? INDEX.issues : [D.date];
  list.forEach((d) => {
    const day = '일월화수목금토'[parseDate(d).getUTCDay()];
    const option = el('option', { value: d }, d.replace(/-/g, '.') + ' (' + day + ')' + (d === latest ? ' · 최신' : ''));
    if (d === D.date) option.selected = true;
    select.append(option);
  });
  $('archive').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = select.value;
    track('archive', d);
    location.href = d === latest ? './' : d;
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
    const data = await fetchJSON('data/corrections.json');
    if (!Array.isArray(data.items)) throw new Error('정정 기록 형식 오류');
    return data.items;
  } catch (e) {
    throw new Error('정정 기록 불러오기 실패');
  }
}
