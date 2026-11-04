'use strict';

const readingPairs = new WeakMap();

function clearReadingPair(grid) {
  readingPairs.get(grid)?.();
}

function matchReadingColumns(grid, width, labels, disclosure = null) {
  clearReadingPair(grid);
  const columns = Array.from(grid.children);
  if (columns.length !== 2 || typeof ResizeObserver !== 'function') return;

  const wide = matchMedia(`(min-width: ${width}px) and (min-height: 600px)`);
  const panes = columns.map((column) => {
    const pane = el('div', { class: 'paired-pane' });
    column.before(pane);
    pane.append(column);
    return pane;
  });
  const note = el('p', { class: grid.classList.contains('kj-wrap') ? 'kj-wrap paired-scroll-note' : 'paired-scroll-note', hidden: '' });
  grid.after(note);
  let frame = 0;

  function update() {
    frame = 0;
    const active = wide.matches && (!disclosure || disclosure.open);
    grid.toggleAttribute('data-paired-reading', active);
    // Measure the inner columns so the shared cap never changes their natural height.
    const heights = active ? columns.map((column) => column.getBoundingClientRect().height) : [0, 0];
    const limit = Math.min(...heights);
    const longer = active ? heights.findIndex((height) => height - limit > 1) : -1;
    if (active) grid.style.setProperty('--paired-block-size', `${limit}px`);
    else grid.style.removeProperty('--paired-block-size');
    note.hidden = longer === -1;
    const side = longer === 0 ? 'start' : 'end';
    if (longer !== -1 && note.dataset.side !== side) {
      note.dataset.side = side;
      note.textContent = (longer === 0 ? '왼쪽' : '오른쪽') + ' 열에서 아래로 스크롤해 더 읽기 ↓';
    }
    panes.forEach((pane, index) => {
      const overflow = index === longer;
      pane.toggleAttribute('data-paired-overflow', overflow);
      if (overflow) {
        pane.tabIndex = 0;
        pane.setAttribute('role', 'region');
        pane.setAttribute('aria-label', labels[index]);
      } else {
        pane.removeAttribute('tabindex');
        pane.removeAttribute('role');
        pane.removeAttribute('aria-label');
      }
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  const observer = new ResizeObserver(schedule);
  columns.forEach((column) => observer.observe(column, { box: 'border-box' }));
  wide.addEventListener('change', schedule);
  disclosure?.addEventListener('toggle', schedule);
  readingPairs.set(grid, () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    wide.removeEventListener('change', schedule);
    disclosure?.removeEventListener('toggle', schedule);
    grid.removeAttribute('data-paired-reading');
    grid.style.removeProperty('--paired-block-size');
    note.remove();
    panes.forEach((pane, index) => pane.replaceWith(columns[index]));
    readingPairs.delete(grid);
  });
  schedule();
}
