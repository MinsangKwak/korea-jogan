'use strict';
// 경제: 지표 비교, 선택한 지표의 근거, 최신 공식 숫자 띠

function renderNums() {
  D.nums.slice(0, 4).forEach((m) => {
    const a = el('a', { href: '#economy' });
    a.append(el('span', {}, m.k), el('b', {}, m.v), el('small', { class: 'news-quick__change' }, m.d), el('small', { class: 'news-quick__base' }, m.src.base));
    $('quickNums').append(a);
  });
  const list = $('nums');
  const metrics = D.nums;
  const toggles = [];
  const detail = el('section', { id: 'econDetail', class: 'econ-detail', 'aria-labelledby': 'econDetailTitle', hidden: '' });
  const header = el('div', { class: 'econ-detail__header' });
  const title = el('h3', { id: 'econDetailTitle', tabindex: '-1' });
  const close = el('button', { type: 'button', id: 'econDetailClose', class: 'kj-btn kj-btn--ghost', 'aria-label': '지표 상세 닫기' }, '닫기');
  const body = el('div', { class: 'econ-detail__body' });
  header.append(title, close);
  detail.append(header, body);
  list.after(detail);
  let selected = -1;

  const closeDetail = () => {
    const opener = toggles[selected];
    if (!opener) return;
    selected = -1;
    opener.setAttribute('aria-expanded', 'false');
    detail.hidden = true;
    body.replaceChildren();
    list.dispatchEvent(new Event('economy-detail-change'));
    const target = opener.closest('[inert]') ? $('econViewport') : opener;
    target?.focus();
  };
  close.addEventListener('click', closeDetail);

  metrics.forEach((m, index) => {
    const t = el('div', { class: 'kj-stat' });
    t.append(el('span', { class: 'kj-stat__k' }, m.k), el('span', { class: 'kj-stat__v' }, m.v));
    const row = el('div', { class: 'kj-stat__row' });
    row.append(el('span', { class: 'kj-dir kj-dir--' + m.dir, 'aria-label': DIR_LABEL[m.dir] + ' ' + m.d }, m.d));
    const button = el('button', {
      class: 'econ-detail-toggle', type: 'button', 'aria-controls': detail.id, 'aria-expanded': 'false', 'aria-label': m.k + ' 기준·출처'
    }, '기준·출처');
    button.append(svgIcon('M6 9l6 6 6-6'));
    button.addEventListener('click', () => {
      if (selected === index) { closeDetail(); return; }
      if (selected !== -1) toggles[selected].setAttribute('aria-expanded', 'false');
      selected = index;
      button.setAttribute('aria-expanded', 'true');
      const reference = el('div', { class: 'econ-detail__reference' });
      reference.append(el('h4', {}, '기준·집계 설명'), el('p', { class: 'kj-stat__ref' }, m.ref));
      const source = el('div', { class: 'econ-detail__source' });
      const disclosure = srcDisclosure(m.src, '경제 · ' + m.k);
      disclosure.open = true;
      source.append(gradeBadge(m.grade), disclosure);
      title.textContent = m.k + ' 기준·출처';
      body.replaceChildren(reference, source);
      detail.hidden = false;
      list.dispatchEvent(new Event('economy-detail-change'));
      title.focus({ preventScroll: true });
      const bounds = detail.getBoundingClientRect();
      if (bounds.top < 0 || bounds.top > innerHeight - Math.min(bounds.height, 240)) {
        title.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
    toggles.push(button);
    t.append(row, el('span', { class: 'econ-base' }, '기준일 · ' + m.src.base), button);
    list.append(t);
  });
  setupEconomyCarousel(list, detail);
}

let economySwiperRequest = null;

// 경제 지표에 가까워졌을 때만 같은 출처의 라이브러리를 읽는다
function loadEconomySwiper() {
  if (economySwiperRequest) return economySwiperRequest;
  const load = (kind, url) => new Promise((resolve) => {
    const node = kind === 'script' ? document.createElement('script') : document.createElement('link');
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 8000);
    if (kind === 'script') { node.src = url; node.async = true; }
    else { node.rel = 'stylesheet'; node.href = url; }
    node.onload = () => finish(true);
    node.onerror = () => finish(false);
    document.head.append(node);
  });
  economySwiperRequest = Promise.all([
    load('style', 'assets/vendor/swiper/swiper-14.4.0.min.css'),
    load('script', 'assets/vendor/swiper/swiper-14.4.0.min.js')
  ]).then((loaded) => loaded.every(Boolean) && typeof window.Swiper === 'function');
  return economySwiperRequest;
}

// 초기화에 실패해도 여섯 지표와 출처는 기존 격자 목록으로 남는다
function setupEconomyCarousel(list, detail) {
  const cards = Array.from(list.children);
  if (cards.length < 2 || list.closest('.econ-carousel')) return;
  const shell = el('div', { class: 'econ-carousel', id: 'econCarousel' });
  const viewport = el('div', { class: 'econ-carousel__viewport', id: 'econViewport' });
  list.before(shell);
  viewport.append(list);
  shell.append(viewport);
  list.dataset.carouselState = 'static';
  const activate = async () => {
    list.dataset.carouselState = 'loading';
    const loaded = await loadEconomySwiper();
    // 늦게 도착한 코드가 이미 읽던 긴 목록을 줄이지 않도록 한다
    if (!loaded || list.getBoundingClientRect().top < -80 || list.contains(document.activeElement) || !detail.hidden) {
      list.dataset.carouselState = 'static';
      return;
    }
    initEconomyCarousel(shell, viewport, list, cards, detail);
  };
  if ('IntersectionObserver' in window) {
    const lazy = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      lazy.disconnect();
      activate();
    }, { rootMargin: '800px 0px' });
    lazy.observe(shell);
  } else activate();
}

function initEconomyCarousel(shell, viewport, list, cards, detail) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { enabled: !motion.matches, hovered: false, focused: false, visible: false };
  const count = cards.length;
  const toolbar = el('div', { class: 'econ-carousel__toolbar' });
  const label = el('p', { id: 'econHint', class: 'econ-carousel__hint' }, '핵심 지표 ' + count + '개 · 옆으로 넘겨 보세요');
  const actions = el('div', { class: 'econ-carousel__actions', role: 'group', 'aria-label': '경제 지표 넘기기' });
  const counter = el('span', { id: 'econCounter', class: 'econ-carousel__counter', 'aria-live': 'off' }, '1 / ' + count);
  const previous = el('button', { type: 'button', id: 'econPrev', 'aria-label': '이전 경제 지표', 'aria-controls': 'nums' }, '이전');
  const next = el('button', { type: 'button', id: 'econNext', 'aria-label': '다음 경제 지표', 'aria-controls': 'nums' }, '다음');
  const playback = el('button', { type: 'button', id: 'econPlayback', 'aria-controls': 'nums' });
  const announcement = el('span', { class: 'kj-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  actions.append(counter, previous, next, playback);
  toolbar.append(label, actions);
  shell.prepend(toolbar);
  shell.append(announcement);
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-roledescription', '캐러셀');
  shell.setAttribute('aria-labelledby', 'ecoH');
  shell.setAttribute('aria-describedby', 'econHint');
  viewport.setAttribute('tabindex', '0');
  viewport.setAttribute('aria-label', '경제 지표 목록, 좌우 방향키로 넘기기');
  viewport.classList.add('swiper');
  list.classList.remove('kj-stats');
  list.classList.add('swiper-wrapper');
  cards.forEach((card, index) => {
    card.classList.add('swiper-slide');
    card.dataset.econIndex = String(index);
    card.setAttribute('role', 'group');
    card.setAttribute('aria-roledescription', '슬라이드');
    card.setAttribute('aria-label', (index + 1) + ' / ' + count + ' · ' + D.nums[index].k);
  });
  shell.classList.add('is-ready');
  const visibleCount = () => {
    const desired = innerWidth >= 1350 ? 4 : innerWidth >= 1100 ? 3 : innerWidth >= 700 ? 2 : innerWidth >= 380 && !document.documentElement.classList.contains('big') ? 1.08 : 1;
    return Math.min(count, desired);
  };
  let swiper;
  const syncVisibility = () => {
    if (!swiper || swiper.destroyed) return;
    const bounds = viewport.getBoundingClientRect();
    cards.forEach((card) => {
      const box = card.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(box.right, bounds.right) - Math.max(box.left, bounds.left)) / Math.max(box.width, 1);
      const visible = fraction > .5;
      if (!visible && card.contains(document.activeElement)) viewport.focus({ preventScroll: true });
      card.inert = !visible;
      card.setAttribute('aria-hidden', String(!visible));
    });
    counter.textContent = (swiper.realIndex + 1) + ' / ' + count;
    const locked = swiper.isLocked;
    previous.disabled = locked;
    next.disabled = locked;
  };
  const syncAutoplay = () => {
    if (!swiper || swiper.destroyed) return;
    const run = state.enabled && !state.hovered && !state.focused && state.visible && !document.hidden && !swiper.isLocked && detail.hidden;
    if (run && !swiper.autoplay.running) swiper.autoplay.start();
    if (!run && swiper.autoplay.running) swiper.autoplay.stop();
    playback.setAttribute('aria-pressed', String(state.enabled));
    playback.textContent = state.enabled ? '자동 넘김 끄기' : '자동 넘김 켜기';
    playback.disabled = swiper.isLocked || !detail.hidden;
    shell.dataset.autoplay = run ? 'running' : 'paused';
  };
  const stopReading = () => {
    state.enabled = false;
    syncAutoplay();
  };
  try {
    swiper = new window.Swiper(viewport, {
      init: false,
      speed: motion.matches ? 0 : 350,
      slidesPerView: visibleCount(),
      spaceBetween: innerWidth > 900 ? 24 : 16,
      slidesPerGroup: 1,
      loop: count >= 5,
      rewind: count < 5,
      loopAddBlankSlides: false,
      watchOverflow: true,
      watchSlidesProgress: true,
      a11y: { enabled: false },
      autoplay: { delay: 8000, disableOnInteraction: false, pauseOnMouseEnter: false },
      on: {
        init() { syncVisibility(); syncAutoplay(); },
        slideChange() { syncVisibility(); },
        transitionEnd() { syncVisibility(); },
        resize() { syncVisibility(); syncAutoplay(); },
        touchEnd() { syncAutoplay(); },
        sliderFirstMove() { stopReading(); }
      }
    });
    swiper.init();
  } catch {
    if (swiper && !swiper.destroyed && typeof swiper.destroy === 'function') {
      try { swiper.destroy(true, true); } catch {}
    }
    cards.forEach((card) => {
      card.inert = false;
      ['aria-hidden', 'role', 'aria-roledescription', 'aria-label', 'style'].forEach((attribute) => card.removeAttribute(attribute));
      card.classList.remove('swiper-slide');
      list.append(card);
    });
    list.classList.remove('swiper-wrapper');
    list.classList.add('kj-stats');
    list.dataset.carouselState = 'static';
    viewport.classList.remove('swiper');
    viewport.removeAttribute('tabindex');
    viewport.removeAttribute('aria-label');
    ['role', 'aria-roledescription', 'aria-labelledby', 'aria-describedby'].forEach((attribute) => shell.removeAttribute(attribute));
    shell.classList.remove('is-ready');
    toolbar.remove();
    announcement.remove();
    return;
  }
  list.dataset.carouselState = 'ready';
  const announce = () => { announcement.textContent = (swiper.realIndex + 1) + '번째 지표, ' + D.nums[swiper.realIndex].k; };
  const move = (direction) => {
    stopReading();
    if (direction > 0) swiper.slideNext();
    else swiper.slidePrev();
    announce();
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  playback.addEventListener('click', () => { state.enabled = !state.enabled; syncAutoplay(); });
  viewport.addEventListener('keydown', (event) => {
    if (event.target !== viewport || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 1 : -1);
  });
  shell.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'mouse') return; state.hovered = true; syncAutoplay(); });
  shell.addEventListener('pointerleave', () => { state.hovered = false; syncAutoplay(); });
  shell.addEventListener('focusin', () => { state.focused = true; syncAutoplay(); });
  shell.addEventListener('focusout', (event) => { state.focused = shell.contains(event.relatedTarget); syncAutoplay(); });
  list.addEventListener('pointerdown', stopReading, { passive: true });
  list.addEventListener('economy-detail-change', () => { if (detail.hidden) syncAutoplay(); else stopReading(); });
  document.addEventListener('visibilitychange', syncAutoplay);
  motion.addEventListener('change', () => { if (motion.matches) state.enabled = false; swiper.params.speed = motion.matches ? 0 : 350; syncAutoplay(); });
  const resize = () => {
    swiper.params.slidesPerView = visibleCount();
    swiper.params.spaceBetween = innerWidth > 900 ? 24 : 16;
    swiper.update();
    syncVisibility();
    syncAutoplay();
  };
  window.addEventListener('resize', resize);
  new MutationObserver(resize).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { state.visible = entries.some((entry) => entry.isIntersecting); syncAutoplay(); }, { threshold: .1 }).observe(viewport);
  } else { state.visible = true; syncAutoplay(); }
}

// 승인된 조간과 별개인 자동 갱신 숫자(data/live.json). 없거나 못 읽으면 띠를 숨긴 채 둔다
// 지난 호를 볼 때는 그날 숫자와 헷갈리지 않게 보이지 않는다
async function renderLive() {
  if (VIEWING_PAST) return;
  let L = null;
  try {
    L = await fetchJSON('data/live.json');
  } catch (e) {
    return;
  }
  if (!L || !L.items || !L.items.length) return;
  const ul = $('liveList');
  const day = (m) => m.src.base.slice(5).replace('-', '/');
  // 기준일이 모두 같으면 항목마다 적지 않고 맨 위에 한 번만 적는다
  const oneDay = L.items.every((m) => m.src.base === L.items[0].src.base) ? day(L.items[0]) : '';
  L.items.forEach((m) => {
    const li = el('li');
    li.append(el('span', { class: 'k' }, m.k), el('span', { class: 'v' }, m.v));
    li.append(el('span', { class: 'kj-dir kj-dir--' + m.dir, 'aria-label': DIR_LABEL[m.dir] + ' ' + m.d }, m.d));
    if (!oneDay) li.append(el('small', {}, day(m) + ' 기준'));
    ul.append(li);
  });
  const at = new Date(L.updatedAt);
  const hours = (Date.now() - at.getTime()) / 3600000;
  const sameDay = new Date(at.getTime() + 9 * 3600000).toISOString().slice(0, 10) === todayKST();
  const when = at.toLocaleString('ko-KR', sameDay ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  // 평일 낮에는 1시간마다 갱신한다. 반나절 넘게 멈췄으면 그 사실을 함께 적는다
  // 안내 줄은 한 줄에 들어가게 출처를 줄여 쓰고, 전체 이름은 마우스를 올리면 보인다
  $('liveMeta').textContent = (oneDay ? oneDay + ' 기준 · ' : '') + when + ' 갱신' + (hours > 12 ? ' · 갱신이 늦어지고 있습니다' : '') + ' · 출처 ECOS';
  $('liveMeta').title = '출처: ' + L.source;
  $('live').hidden = false;
}
