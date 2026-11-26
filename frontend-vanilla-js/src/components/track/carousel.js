'use strict';

const EDITION_SLIDE_DELAY = 8000;

function editionPlayback(region, viewport, button, advance, signal, preference) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = preference ?? !motion.matches;
  let visible = !('IntersectionObserver' in window);
  let hovered = false;
  let timer;
  let available = true;

  function sync() {
    clearTimeout(timer);
    const running = available && enabled && visible && !hovered && !document.hidden && !region.contains(document.activeElement);
    button.textContent = enabled ? '자동 넘김 끄기' : '자동 넘김 켜기';
    button.setAttribute('aria-pressed', String(enabled));
    viewport.dataset.autoplay = running ? 'running' : 'paused';
    if (running) timer = setTimeout(() => { advance(); sync(); }, EDITION_SLIDE_DELAY);
  }
  function pause() { enabled = false; sync(); }
  button.addEventListener('click', () => { enabled = !enabled; sync(); }, { signal });
  region.addEventListener('pointerenter', (event) => { hovered = event.pointerType === 'mouse'; sync(); }, { signal });
  region.addEventListener('pointerleave', () => { hovered = false; sync(); }, { signal });
  region.addEventListener('focusin', sync, { signal });
  region.addEventListener('focusout', () => queueMicrotask(() => { if (!signal.aborted) sync(); }), { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  window.addEventListener('pageshow', sync, { signal });
  window.addEventListener('pagehide', () => clearTimeout(timer), { signal });
  motion.addEventListener('change', () => { if (motion.matches) pause(); }, { signal });
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }, { threshold: 0 }) : null;
  observer?.observe(viewport);
  signal.addEventListener('abort', () => { clearTimeout(timer); observer?.disconnect(); }, { once: true });
  sync();
  return { pause, setAvailable(value) { available = value; sync(); } };
}

function setupSlideGestures(viewport, list, isActive, advance, pause, signal) {
  let pointer = null;
  let swiped = false;
  viewport.addEventListener('keydown', (event) => {
    if (!isActive() || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (event.target !== viewport) viewport.focus({ preventScroll: true });
    advance(event.key === 'ArrowRight' ? 1 : -1);
  }, { signal });
  viewport.addEventListener('pointerdown', (event) => {
    if (!isActive() || !event.isPrimary || event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
    swiped = false;
    if (event.pointerType !== 'mouse') pause();
  }, { signal });
  viewport.addEventListener('dragstart', (event) => { if (pointer) event.preventDefault(); }, { signal });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointer?.id) return;
    const dx = event.clientX - pointer.x;
    swiped = Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(event.clientY - pointer.y) * 1.4;
    pointer = null;
    if (swiped) {
      if (list.contains(document.activeElement)) viewport.focus({ preventScroll: true });
      advance(dx < 0 ? 1 : -1);
    }
  }, { signal });
  window.addEventListener('pointercancel', () => { pointer = null; }, { signal });
  viewport.addEventListener('click', (event) => {
    if (swiped && event.detail) { event.preventDefault(); event.stopImmediatePropagation(); swiped = false; }
  }, { capture: true, signal });
}

function setupIssueCarousel(prefix, list, region, compact = null) {
  const slides = Array.from(list.children);
  const controls = $(prefix + 'Controls');
  const previous = $(prefix + 'Prev');
  const next = $(prefix + 'Next');
  const position = $(prefix + 'Position');
  const viewport = prefix === 'track' ? $('trackViewport') : list;
  const listeners = new AbortController();
  const { signal } = listeners;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0;
  let rotating = false;
  const playback = editionPlayback(region, viewport, $(prefix + 'Playback'), () => move(1), signal);

  function display() {
    slides.forEach((card, i) => {
      card.inert = rotating && i !== active;
      if (card.inert) card.setAttribute('aria-hidden', 'true');
      else card.removeAttribute('aria-hidden');
    });
    position.textContent = (active + 1) + ' / ' + slides.length;
  }

  function move(direction, manual = false) {
    if (!rotating) return;
    if (manual) playback.pause();
    active = (active + direction + slides.length) % slides.length;
    display();
    if (!motion.matches) slides[active].animate?.([{ transform: 'translateX(' + (direction * 32) + 'px)', opacity: .35 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'ease-out' });
    if (manual) $(prefix + 'Announcement').textContent = position.textContent + ' · ' + slides[active].querySelector('h3').textContent;
  }
  function layout() {
    rotating = slides.length > 1 && (!compact || compact.matches);
    const focused = slides.findIndex((card) => card.contains(document.activeElement));
    if (focused >= 0) active = focused;
    if (!rotating && controls.contains(document.activeElement)) slides[active].querySelector('a')?.focus({ preventScroll: true });
    controls.hidden = !rotating;
    viewport.tabIndex = rotating ? 0 : -1;
    list.classList.toggle('issue-deck', rotating);
    if (rotating) viewport.setAttribute('aria-roledescription', '캐러셀');
    else viewport.removeAttribute('aria-roledescription');
    display();
    playback.setAvailable(rotating);
  }
  function fromHash() {
    const index = slides.findIndex((card) => card.id && '#' + card.id === location.hash);
    if (index >= 0) { active = index; playback.pause(); display(); }
  }
  previous.addEventListener('click', () => move(-1, true), { signal });
  next.addEventListener('click', () => move(1, true), { signal });
  setupSlideGestures(viewport, list, () => rotating, (by) => move(by, true), playback.pause, signal);
  viewport.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const index = slides.findIndex((card) => card.contains(link));
    if (index >= 0) {
      playback.pause();
      history.replaceState({ ...history.state, issueReturn: { prefix, href: link.href, top: link.getBoundingClientRect().top } }, '');
    }
  }, { capture: true, signal });
  compact?.addEventListener('change', layout, { signal });
  window.addEventListener('hashchange', fromHash, { signal });
  fromHash();
  const back = history.state?.issueReturn;
  const backIndex = back?.prefix === prefix && performance.getEntriesByType('navigation')[0]?.type === 'back_forward'
    ? slides.findIndex((card) => card.querySelector('a')?.href === back.href) : -1;
  if (backIndex >= 0) { active = backIndex; playback.pause(); }
  layout();
  if (backIndex >= 0) requestAnimationFrame(() => {
    const link = slides[backIndex].querySelector('a');
    if (signal.aborted || !link.getClientRects().length) return;
    link.focus({ preventScroll: true });
    window.scrollBy({ top: link.getBoundingClientRect().top - back.top, behavior: 'instant' });
  });
  return () => {
    listeners.abort();
    controls.hidden = true;
    list.classList.remove('issue-deck');
    slides.forEach((card) => { card.inert = false; card.removeAttribute('aria-hidden'); });
  };
}
