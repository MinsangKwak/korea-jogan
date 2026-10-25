'use strict';
// 전체 초기화와 렌더링을 같은 오류 경계에서 처리한다

function finishLoading(ok) {
  clearTimeout(window.kjLoadTimer);
  document.documentElement.classList.remove('is-loading', 'load-timeout');
  $('pageLoading').hidden = true;
  $('main').setAttribute('aria-busy', 'false');
  document.documentElement.dataset.loadState = ok ? 'ready' : 'error';
}

function renderLoadError() {
  document.documentElement.classList.remove('js');
  document.title = '호를 불러오지 못했습니다 | 대한민국 조간';
  $('noticeBox').hidden = false;
  $('notice').textContent = '호를 불러오지 못했습니다. 아래에 요약이 있으면 먼저 읽을 수 있습니다.';
  $('heroGrid').hidden = true;
  $('splitBox').hidden = true;
  $('live').hidden = true;
  $('statusChip').hidden = true;
  document.querySelectorAll('main .kj-sec').forEach((section) => { section.hidden = true; });
  const state = el('div', { class: 'kj-state kj-state--error', role: 'alert' });
  state.append(el('h4', {}, '호를 불러오지 못했습니다'), el('p', {}, '연결 상태를 확인한 뒤 다시 불러와 주세요. 요약은 계속 읽을 수 있습니다.'));
  const retry = el('button', { class: 'kj-btn kj-btn--primary kj-btn--sm', type: 'button' }, '다시 불러오기');
  retry.addEventListener('click', () => location.reload());
  state.append(retry);
  $('loadError').replaceChildren(state);
  $('loadError').hidden = false;
}

async function boot() {
  const started = performance.now();
  $('main').setAttribute('aria-busy', 'true');
  let ok = false;
  try {
    setupMetrics();
    renderNav();
    setupBig();
    setupShare();
    setupDrawer();
    setupToTop();
    setupNav();
    D = await loadIssue();
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
    if ($('seoDigest')) $('seoDigest').remove();
    ok = true;
  } catch (error) {
    renderLoadError();
  } finally {
    finishLoading(ok);
  }
  trackLoad(ok, Math.round(performance.now() - started));
  trackView(ok ? D.date : '', ok && VIEWING_PAST);
  if (ok) trackSections();
  if (ok) {
    loadCorrections().then(renderCorrections).catch(() => { $('fixes').textContent = '정정 기록을 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.'; });
    renderLive().catch(() => { $('live').hidden = true; });
  }
}

boot();
