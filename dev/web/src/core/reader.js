import { copyField } from './clipboard.js';

// 공개 지면의 독자 행동을 기존 내부 접속 제외 기준에 따라 기록한다
function note(action) {
  if (typeof window.track === 'function') window.track('reader_' + action);
}

const panel = document.querySelector('[data-reader-tools]');
if (panel) {
  const details = panel.querySelector('#readerSubscribe');
  const field = panel.querySelector('#readerFeed');
  const button = panel.querySelector('#readerFeedCopy');
  const status = panel.querySelector('#readerFeedStatus');
  button.disabled = false;
  button.addEventListener('click', async () => {
    if (await copyField(field, button, status)) note('feed_copy');
  });
  panel.querySelectorAll('[data-reader-action]').forEach((link) => link.addEventListener('click', () => note(link.dataset.readerAction)));
  details.addEventListener('toggle', () => { if (details.open) note('subscribe_open'); });
  document.querySelectorAll('[data-reader-subscribe]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    details.open = true;
    details.querySelector('summary').focus();
    details.scrollIntoView({ block: 'nearest' });
  }));
}
