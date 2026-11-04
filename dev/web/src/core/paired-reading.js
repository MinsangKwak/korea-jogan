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
  let frame = 0;

  function update() {
    frame = 0;
    const active = wide.matches && (!disclosure || disclosure.open);
    grid.toggleAttribute('data-paired-reading', active);
    // Measure the inner columns so the shared cap never changes their natural height.
    const heights = active ? columns.map((column) => column.getBoundingClientRect().height) : [0, 0];
    const limit = Math.min(...heights);
    if (active) grid.style.setProperty('--paired-block-size', `${limit}px`);
    else grid.style.removeProperty('--paired-block-size');
    panes.forEach((pane, index) => {
      const overflow = active && heights[index] - limit > 1;
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
    panes.forEach((pane, index) => pane.replaceWith(columns[index]));
    readingPairs.delete(grid);
  });
  schedule();
}
