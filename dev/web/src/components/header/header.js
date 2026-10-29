'use strict';
// 제호: 호 날짜·수집 시각, 상태 안내, 공유, 글자 크게

// 조간은 00시 발행. 최신 호가 오늘 날짜가 아니면 지난 호를 보고 있다고 먼저 알린다
function renderStale() {
  const msg = $('staleMsg');
  if (VIEWING_PAST) {
    msg.append(document.createTextNode('지난 호(' + longDate(D.date) + ')를 보고 있습니다. '), el('a', { href: './' }, '최신 호 보기'));
    $('stale').hidden = false;
    return;
  }
  const today = todayKST();
  if (D.date >= today) return;
  msg.textContent = '오늘(' + longDate(today) + ') 호는 아직 발행되지 않았습니다. 아래는 ' + longDate(D.date) + ' 호입니다.';
  $('stale').hidden = false;
}

// 공유는 휴대폰 공유 창을 먼저 쓰고, 없으면 링크를 복사한다. 링크는 지금 보는 호를 가리킨다
function setupShare() {
  const btn = $('shareBtn');
  btn.addEventListener('click', async () => {
    if (!D) return;
    const url = issueUrl(D.date);
    const data = { title: '대한민국 조간 · ' + longDate(D.date), text: D.lead.headline, url };
    track('share', D.date);
    if (navigator.share) {
      try { await navigator.share(data); } catch (e) { /* 사용자가 공유 창을 닫은 경우 */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      $('shareLbl').textContent = '링크 복사됨';
      btn.setAttribute('aria-label', '링크 복사됨');
    } catch (e) {
      window.prompt('이 링크를 복사하세요', url);
    }
    setTimeout(() => { $('shareLbl').textContent = '공유'; btn.removeAttribute('aria-label'); }, 2000);
  });
}

function asOfText() {
  const t = new Date(D.collectedAt);
  if (!D.collectedAt || Number.isNaN(t.getTime())) return longDate(D.date) + ' 호';
  return t.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }) + ' 수집';
}

function renderAsOf() {
  if (!D.collectedAt) return;
  const t = new Date(D.collectedAt);
  if (Number.isNaN(t.getTime())) return;
  // 발행일과 같은 날 모았으면 날짜는 이미 옆에 있으니 시각만 적는다
  const kst = new Date(t.getTime() + 9 * 3600000).toISOString();
  const opts = kst.slice(0, 10) === D.date ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' };
  $('asOf').textContent = t.toLocaleString('ko-KR', opts) + ' 수집';
}

// 호 상태(시안·초안·공개)에 따라 맨 위 안내 문구를 바꾼다. 자세한 한계는 바닥글로 잇는다
function renderNotice() {
  const box = $('notice');
  box.textContent = '';
  const st = D.status;
  const more = el('a', { href: '#limitsH' }, '수집 한계 보기');
  // 정상(편집자 확인)일 때는 띠를 접고 제호 안에 확인 표시만 둔다. 초안·시안은 띠로 경고한다
  if (st === 'published' && D.review) {
    const at = new Date(D.review.at);
    const hm = at.toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
    const full = at.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
    const chip = $('statusChip');
    chip.textContent = '';
    // 사람 확인 없이 06시에 자동으로 나간 호는 확인 표시 대신 자동 발행으로 알린다
    if (D.review.auto) {
      chip.append(svgIcon('M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18'), document.createTextNode('자동 발행 ' + hm));
      chip.setAttribute('aria-label', '사람이 원문과 대조하기 전에 ' + full + '에 자동으로 발행한 호. 숫자가 정정될 수 있습니다. 수집 한계 보기');
      chip.title = full + '에 자동 발행. 사람이 원문과 대조하기 전이라 숫자가 정정될 수 있습니다';
    } else {
      chip.append(svgIcon('M5 12.5 10 17 19 7'), document.createTextNode('편집자 확인 ' + hm));
      chip.setAttribute('aria-label', '편집자 확인을 마친 호. 머리기사와 핵심 숫자를 ' + full + '에 원문과 대조했습니다. 수집 한계 보기');
      chip.title = '머리기사와 핵심 숫자를 ' + full + '에 원문과 대조했습니다';
    }
    chip.hidden = false;
    // 06시를 넘겨 모은 호는 띠를 남겨 늦게 수집한 이유와 자료 기준 시각을 알린다
    if (D.late && D.late.reason) {
      const cut = new Date(D.late.cutoff);
      const cutText = Number.isNaN(cut.getTime()) ? '' : ' 기본 자료 기준은 ' + cut.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }) + '입니다. ';
      box.append(el('strong', {}, '늦게 수집한 호입니다.'), document.createTextNode(' ' + D.late.reason + '.' + cutText), more);
      $('noticeBox').hidden = false;
      return;
    }
    $('noticeBox').hidden = true;
    return;
  } else if (st === 'draft') {
    box.append(el('strong', {}, '확인 전 초안입니다.'), document.createTextNode(' 사람이 원문과 대조하기 전이라 숫자가 바뀔 수 있습니다. '), more);
  } else {
    box.append(el('strong', {}, '시안 호입니다.'), document.createTextNode(' 수치는 공식 발표 원문이나 그 발표를 인용한 기사로 확인했습니다. '), more);
  }
}

function setupBig() {
  const btn = $('bigBtn');
  const apply = (on) => {
    document.documentElement.classList.toggle('big', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  // 글자 크기 선택은 이 기기에만 저장한다. 저장소가 막혀도 화면은 그대로 동작
  try { apply(localStorage.getItem('jg_big') === '1'); } catch (e) { apply(false); }
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    apply(on);
    try { localStorage.setItem('jg_big', on ? '1' : '0'); } catch (e) { /* 저장 실패는 무시 */ }
  });
}
