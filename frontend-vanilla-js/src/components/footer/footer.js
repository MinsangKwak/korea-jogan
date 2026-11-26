'use strict';
// 바닥글: 수집 한계, 지난 호, 정정 기록

function renderLimits() {
  $('limits').replaceChildren(...D.limits.map((text) => el('li', {}, text)));
  $('footLimitCount').textContent = D.limits.length + '건';
  const collected = $('asOf').textContent;
  $('footEdition').textContent = D.date.replaceAll('-', '.') + '호' + (collected ? ' · ' + collected : '');
  $('footLimits').hidden = !D.limits.length;
  if (location.hash === '#limitsH') $('footLimits').open = true;
  document.addEventListener('click', (event) => {
    if (event.target.closest('a[href="#limitsH"]')) $('footLimits').open = true;
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#limitsH') $('footLimits').open = true;
  });
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
  const status = $('fixStatus');
  if (!list || !list.length) {
    status.textContent = list ? '아직 정정한 내용이 없습니다.' : '정정 기록을 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.';
    return;
  }
  const sorted = list.slice().sort((a, b) => b.date.localeCompare(a.date));
  $('fixLabel').textContent = '정정 ' + sorted.length + '건 · 최근 ' + sorted[0].date.replace(/-/g, '.');
  status.hidden = true;
  ul.closest('details').hidden = false;
  // 최근 정정이 위로 오게 한다
  sorted.forEach((c) => {
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
