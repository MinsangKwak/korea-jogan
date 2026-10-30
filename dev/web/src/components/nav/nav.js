'use strict';
// 분야 메뉴, 하단 탭바, 오른쪽 세로 메뉴, 전체 메뉴 서랍, 맨 위로 단추

function renderNav() {
  SECTIONS.forEach(([sid, name]) => {
    const li = el('li');
    li.append(el('a', { href: '#' + sid, 'data-sec': sid, 'data-group': sid }, name));
    $('catNav').append(li);
  });
  TABS.forEach(([name, secs, icon]) => {
    const li = el('li');
    const a = el('a', { href: '#' + secs[0], 'data-sec': secs[0], 'data-group': secs.join(' ') });
    a.append(svgIcon(icon), document.createTextNode(name));
    li.append(a);
    $('tabNav').append(li);
  });
  // 좁은 화면에서는 탭바 마지막 칸이 전체 메뉴를 연다
  const li = el('li');
  const more = el('button', { type: 'button', id: 'tabMenu', 'aria-controls': 'drawer', 'aria-expanded': 'false', 'aria-haspopup': 'dialog' });
  more.append(svgIcon(MENU_ICON), document.createTextNode('메뉴'));
  li.append(more);
  $('tabNav').append(li);
  // 넓은 화면 오른쪽 세로 메뉴
  SECTIONS.forEach(([sid, name]) => {
    const item = el('li');
    item.append(el('a', { href: '#' + sid, 'data-sec': sid, 'data-group': sid }, name));
    $('railNav').append(item);
  });
  // 전체 메뉴의 섹션 목록. 하위 항목은 데이터를 읽은 뒤 renderDrawerSubs가 채운다
  SECTIONS.forEach(([sid, name, desc]) => {
    const item = el('li', { id: 'dn-' + sid });
    const a = el('a', { class: 'kj-drawer__sec', href: '#' + sid, 'data-sec': sid, 'data-group': sid });
    a.append(el('b', {}, name), el('span', {}, desc));
    item.append(a);
    $('drawerNav').append(item);
  });
}

// 비어 있거나 지난 호라 감춘 섹션은 메뉴에서도 뺀다. 눌러도 아무 데도 가지 않는 링크를 남기지 않는다
function toggleSectionNav(sid, shown) {
  document.querySelectorAll('[data-sec="' + sid + '"]').forEach((a) => {
    const li = a.closest('li');
    if (li) li.hidden = !shown;
  });
}

// 전체 메뉴에서 섹션 안의 항목(언론 주제, 전국 분야, 시도)으로 바로 간다
function renderDrawerSubs() {
  const add = (sid, items) => {
    if (!items.length) return;
    const ul = el('ul', { class: 'kj-drawer__subs' });
    items.forEach(([label, go]) => {
      const li = el('li');
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', () => { closeDrawer(false); go(); track('menu-sub', sid + ' · ' + label); });
      li.append(b);
      ul.append(li);
    });
    $('dn-' + sid).append(ul);
  };
  const jump = (id) => () => $(id).scrollIntoView({ block: 'start' });
  add('home', [['오늘 꼭 볼 숫자', jump('briefH')]].concat($('splitBox').hidden ? [] : [['기준이 갈린 숫자', jump('splitBox')]]));
  add('media', D.themes.map((t) => [t.title, () => { setQuery(''); showTheme(t.id); $('tresult').scrollIntoView({ block: 'start' }); }]));
  if (D.national) {
    const cats = NAT_CATS.filter((c) => D.national.items.some((i) => i.cat === c));
    add('national', cats.map((c) => [c, () => {
      const chip = Array.from($('natCtrl').querySelectorAll('button')).find((x) => x.firstChild.textContent.trim() === c);
      if (chip) chip.click();
      $('national').scrollIntoView({ block: 'start' });
    }]));
  }
  if (D.regions) add('regions', REGIONS.map(([name]) => [name, () => { selectRegion(name); $('regions').scrollIntoView({ block: 'start' }); }]));
  $('drawerReport').href = reportUrl('');
}

let drawerOpener = null;
let drawerFrame = 0;

function openDrawer(opener) {
  const dr = $('drawer');
  drawerOpener = opener;
  dr.hidden = false;
  document.body.classList.add('is-locked');
  ['menuBtn', 'tabMenu', 'railMenu'].forEach((id) => $(id).setAttribute('aria-expanded', 'true'));
  // 숨김을 푼 다음 프레임에 열림 상태를 줘야 미끄러지는 전환이 보인다
  cancelAnimationFrame(drawerFrame);
  drawerFrame = window.requestAnimationFrame(() => dr.classList.add('is-open'));
  dr.querySelector('.kj-drawer__close').focus();
  track('menu-open', opener ? opener.id : '');
}

// 섹션으로 이동하며 닫을 때는 포커스를 연 단추로 돌리지 않는다
function closeDrawer(restoreFocus = true) {
  const dr = $('drawer');
  if (dr.hidden) return;
  cancelAnimationFrame(drawerFrame);
  dr.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  ['menuBtn', 'tabMenu', 'railMenu'].forEach((id) => $(id).setAttribute('aria-expanded', 'false'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => { if (!dr.classList.contains('is-open')) dr.hidden = true; }, reduce ? 0 : 230);
  if (restoreFocus && drawerOpener) drawerOpener.focus();
}

function setupDrawer() {
  const dr = $('drawer');
  const panel = dr.querySelector('.kj-drawer__panel');
  $('menuBtn').addEventListener('click', (e) => openDrawer(e.currentTarget));
  $('tabMenu').addEventListener('click', (e) => openDrawer(e.currentTarget));
  $('railMenu').addEventListener('click', (e) => openDrawer(e.currentTarget));
  dr.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => closeDrawer()));
  dr.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    closeDrawer(false);
    $(a.dataset.jump).scrollIntoView({ block: 'start' });
  }));
  // 서랍 안의 글자 크기·공유 단추는 제호의 같은 단추를 그대로 누른다
  const big = $('drawerBig');
  const syncBig = () => big.setAttribute('aria-pressed', $('bigBtn').getAttribute('aria-pressed'));
  big.addEventListener('click', () => { $('bigBtn').click(); syncBig(); });
  $('bigBtn').addEventListener('click', syncBig);
  syncBig();
  $('drawerShare').addEventListener('click', () => $('shareBtn').click());
  // Esc로 닫고, Tab은 서랍 안에서만 돈다
  dr.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    const items = Array.from(panel.querySelectorAll('a[href], button')).filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

function setupToTop() {
  $('toTop').addEventListener('click', () => {
    window.scrollTo({ top: 0 });
    // 맨 위로 간 뒤에는 키보드 사용자가 길을 잃지 않게 제호로 포커스를 옮긴다
    document.querySelector('.kj-mast__logo').focus({ preventScroll: true });
    track('to-top', '');
  });
}

function setupNav() {
  const links = Array.from(document.querySelectorAll('[data-sec]'));
  const targets = Array.from(document.querySelectorAll('main > section'));
  const cats = $('cats');
  links.forEach((a) => a.addEventListener('click', (e) => {
    // 해시 이동 대신 직접 스크롤해 미리보기 틀 안에서도 확실히 움직이게 한다
    e.preventDefault();
    closeDrawer(false);
    $(a.dataset.sec).scrollIntoView({ block: 'start' });
    // 메뉴로 고른 섹션은 머문 시간과 상관없이 읽은 섹션으로 센다
    noteSection(a.dataset.sec);
  }));
  let current = '';
  let ticking = false;
  const toTop = $('toTop');
  const update = () => {
    ticking = false;
    // 한 화면 넘게 내려가면 맨 위로 단추를 보인다. 숨었을 때는 키보드 순서에서도 뺀다
    const far = window.scrollY > window.innerHeight;
    toTop.classList.toggle('is-shown', far);
    toTop.tabIndex = far ? 0 : -1;
    // 분야 메뉴가 화면 위에 붙으면 그림자로 본문과 나눈다
    cats.classList.toggle('is-stuck', cats.getBoundingClientRect().top <= 0 && window.scrollY > 0);
    // 화면 위쪽 기준선을 지난 섹션 중 마지막 것을 지금 읽는 분야로 본다
    const line = window.matchMedia('(max-width: 860px)').matches ? 80 : 140;
    let cur = 'home';
    targets.forEach((t) => { if (!t.hidden && t.getBoundingClientRect().top <= line) cur = t.id; });
    if (cur === current) return;
    current = cur;
    // 탭바는 묶은 섹션 중 하나만 읽어도 현재 칸으로 표시한다
    links.forEach((a) => {
      if (a.dataset.group.split(' ').includes(cur)) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  new ResizeObserver(update).observe($('main'));
  update();
}
