'use strict';
// 진입점. 데이터를 읽고 컴포넌트를 차례로 그린다. 다른 스크립트를 모두 읽은 뒤 마지막에 실행한다

// 로딩 화면을 걷는다. 투명하게 사라진 뒤 지운다
function hideLoader() {
  const l = $('loader');
  if (!l) return;
  l.classList.add('is-done');
  setTimeout(() => l.remove(), 300);
}

// 불러오기·그리기 실패: 원인 추정과 다시 불러오기 단추. 나머지 섹션은 숨긴다
function renderLoadError() {
  // 데이터를 못 읽어도 배포 때 넣어 둔 요약은 보이게 한다
  document.documentElement.classList.remove('js');
  $('notice').textContent = '오늘 호 데이터를 불러오지 못했습니다.';
  $('heroGrid').hidden = true;
  document.querySelectorAll('main .kj-sec').forEach((s) => { s.hidden = true; });
  const st = el('div', { class: 'kj-state kj-state--error', role: 'alert' });
  st.append(el('h4', {}, '오늘 호를 불러오지 못했습니다'), el('p', {}, '네트워크가 불안정하거나 발행 데이터를 고치는 중일 수 있습니다. 잠시 뒤 다시 시도해 주세요.'));
  const b = el('button', { class: 'kj-btn kj-btn--primary kj-btn--sm', type: 'button' }, '다시 불러오기');
  b.addEventListener('click', () => location.reload());
  st.append(b);
  $('loadError').append(st);
  $('loadError').hidden = false;
}

async function boot() {
  setupMetrics();
  renderNav();
  setupBig();
  setupShare();
  setupDrawer();
  setupToTop();
  try {
    D = await loadIssue();
  } catch (e) {
    renderLoadError();
    setupNav();
    trackView('', false);
    hideLoader();
    return;
  }
  // 그리는 도중 오류가 나도 반쯤 그린 화면에 멈추지 않고 오류 화면과 배포 때 넣은 요약을 보여 준다
  try {
    renderAll();
  } catch (e) {
    console.error(e);
    renderLoadError();
    setupNav();
    hideLoader();
    return;
  }
  // 모든 섹션을 그린 뒤에야 검색엔진용 요약을 지운다
  if ($('seoDigest')) $('seoDigest').remove();
  hideLoader();
  trackView(D.date, VIEWING_PAST);
  // 정정 기록과 최신 숫자 띠는 실패해도 본문에 영향이 없어 화면을 연 뒤 따로 읽는다
  renderCorrections(await loadCorrections());
  renderLive();
}

function renderAll() {
  ISSUE = parseDate(D.date);
  renderHead();
  renderStale();
  renderNotice();
  renderAsOf();
  renderLead();
  renderSplits();
  renderMediaMeta();
  renderNational();
  renderRegions();
  renderPolitics();
  renderNums();
  renderIndustry();
  renderFiscal();
  showTheme(D.themes[0].id);
  renderLimits();
  renderArchive();
  setupControls();
  renderDrawerSubs();
  setupNav();
}

boot();
