'use strict';

function setupTrackCarousel(list) {
  const viewport = $('trackViewport');
  const controls = $('trackControls');
  const previous = $('trackPrev');
  const next = $('trackNext');
  const position = $('trackPosition');
  const cards = Array.from(list.children);
  const desktop = matchMedia('screen and (min-width: 1100px)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const { signal } = listeners;
  let swiper = null;
  let observer = null;
  let nearby = false;
  let loading = false;
  list.dataset.carouselState = 'static';

  function syncPosition() {
    if (!swiper || swiper.destroyed) return;
    const first = swiper.activeIndex;
    const last = Math.min(first + 2, cards.length);
    cards.forEach((card, index) => {
      const hidden = index < first || index >= last;
      if (hidden && card.contains(document.activeElement)) viewport.focus({ preventScroll: true });
      card.inert = hidden;
      card.setAttribute('aria-hidden', String(hidden));
    });
    previous.setAttribute('aria-disabled', String(first === 0));
    next.setAttribute('aria-disabled', String(last === cards.length));
    const range = (first + 1) + '–' + last + ' / ' + cards.length;
    if (position.textContent !== range) position.textContent = range;
  }

  function restoreList() {
    const first = swiper?.activeIndex || 0;
    const moveFocus = controls.contains(document.activeElement) || document.activeElement === viewport;
    if (swiper && !swiper.destroyed) {
      try { swiper.destroy(true, true); } catch {}
    }
    swiper = null;
    cards.forEach((card) => {
      card.inert = false;
      card.removeAttribute('aria-hidden');
      card.classList.remove('swiper-slide', 'swiper-slide-active', 'swiper-slide-prev', 'swiper-slide-next');
      card.removeAttribute('style');
    });
    list.classList.remove('swiper-wrapper');
    list.removeAttribute('style');
    viewport.classList.remove('swiper');
    controls.hidden = true;
    list.dataset.carouselState = 'static';
    viewport.removeAttribute('tabindex');
    viewport.removeAttribute('role');
    viewport.removeAttribute('aria-label');
    viewport.removeAttribute('aria-roledescription');
    if (moveFocus) cards[first]?.querySelector('a, summary')?.focus({ preventScroll: true });
  }

  function targetCard() {
    return document.getElementById(location.hash.slice(1))?.closest('.kj-track');
  }

  async function updateLayout() {
    if (!desktop.matches) {
      if (swiper) restoreList();
      return;
    }
    if (!nearby || swiper || loading) return;
    loading = true;
    list.dataset.carouselState = 'loading';
    const loaded = await loadLocalSwiper();
    loading = false;
    if (signal.aborted) return;
    if (!loaded || !desktop.matches) {
      list.dataset.carouselState = 'static';
      return;
    }
    const reading = document.activeElement.closest('.kj-track') || targetCard();
    const first = Math.max(0, Math.min(cards.indexOf(reading), cards.length - 2));
    viewport.classList.add('swiper');
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-roledescription', '캐러셀');
    viewport.setAttribute('aria-label', '이슈 추적 목록, 좌우 방향키로 넘기기');
    list.classList.add('swiper-wrapper');
    cards.forEach((card) => card.classList.add('swiper-slide'));
    try {
      swiper = new window.Swiper(viewport, {
        init: false,
        initialSlide: first,
        slidesPerView: 2,
        spaceBetween: 32,
        speed: motion.matches ? 0 : 300,
        touchStartPreventDefault: false,
        a11y: { enabled: false },
        on: { activeIndexChange: syncPosition }
      });
      swiper.init();
    } catch {
      restoreList();
      return;
    }
    list.dataset.carouselState = 'ready';
    syncPosition();
    controls.hidden = false;
  }

  function move(direction) {
    if (!swiper) return;
    if (direction < 0) swiper.slidePrev();
    else swiper.slideNext();
  }

  previous.addEventListener('click', () => move(-1), { signal });
  next.addEventListener('click', () => move(1), { signal });
  viewport.addEventListener('keydown', (event) => {
    if (!swiper || event.target !== viewport || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  }, { signal });
  window.addEventListener('hashchange', () => {
    const index = cards.indexOf(targetCard());
    if (swiper && index >= 0 && cards[index].inert) swiper.slideTo(index);
  }, { signal });
  motion.addEventListener('change', () => {
    if (swiper) swiper.params.speed = motion.matches ? 0 : 300;
  }, { signal });
  desktop.addEventListener('change', updateLayout, { signal });

  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      nearby = true;
      updateLayout();
    }, { rootMargin: '400px 0px' });
    observer.observe(viewport);
  } else {
    nearby = true;
    updateLayout();
  }
  return () => {
    listeners.abort();
    observer?.disconnect();
    restoreList();
  };
}
