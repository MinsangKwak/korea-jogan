'use strict';

// 지면마다 공유할 주소를 정하고 같은 공유 창과 복사 피드백을 사용한다
function connectPaperShare(buttons, getData) {
  let opener;
  let timer;
  let dialog = document.getElementById('shareDialog');
  let status = document.getElementById('shareStatus');
  if (!status) {
    status = document.createElement('p');
    status.className = 'reading-toast';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  function manual(url) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'reading-share';
      dialog.setAttribute('aria-labelledby', 'paperShareTitle');
      dialog.innerHTML = '<form method="dialog"><h2 id="paperShareTitle">지면 공유</h2><button type="submit">닫기</button></form><label>공유할 주소<input type="url" readonly></label><p>주소를 선택해 복사하세요.</p>';
      document.body.append(dialog);
    }
    if (dialog.open) return;
    const field = dialog.querySelector('input');
    field.value = url;
    dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }), { once: true });
    dialog.showModal();
    field.focus();
    field.select();
  }
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', async () => {
      const data = getData();
      if (!data) return;
      opener = button;
      if (navigator.share) {
        try { await navigator.share(data); return; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
      try {
        await navigator.clipboard.writeText(data.url);
        clearTimeout(timer);
        status.textContent = '링크를 복사했습니다.';
        timer = setTimeout(() => { status.textContent = ''; }, 2400);
      } catch { manual(data.url); }
    });
  }
}

const paperDirectory = document.querySelector('.paper-directory');
if (paperDirectory) {
  connectPaperShare([document.getElementById('shareBtn')], () => ({
    title: document.title, url: new URL(location.pathname, location.origin).href
  }));
  document.addEventListener('click', (event) => {
    if (!paperDirectory.contains(event.target)) paperDirectory.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !paperDirectory.open) return;
    paperDirectory.open = false;
    paperDirectory.querySelector('summary').focus();
  });
  paperDirectory.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !paperDirectory.contains(event.relatedTarget)) paperDirectory.open = false;
  });
}
