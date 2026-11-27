import { copyField } from './clipboard.js';

// 공개 지면의 독자 행동을 기존 내부 접속 제외 기준에 따라 기록한다
function note(action) {
  if (typeof window.track === 'function') window.track('reader_' + action);
}

// 구독 폼을 사이트 안에서 보내고 결과를 바로 알린다
// Buttondown 결과 페이지로 넘어가면 브라우저에 따라 빈 화면만 보여 독자가 성공 여부를 알 수 없다
// fetch가 막힌 환경이면 원래 폼 제출로 넘긴다
async function subscribe(event, form) {
  event.preventDefault();
  const status = form.querySelector('#readerEmailStatus');
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  status.textContent = '구독 신청을 보내는 중입니다.';
  let response;
  try {
    response = await fetch(form.action, { method: 'POST', body: new FormData(form), mode: 'cors' });
  } catch {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    status.textContent = '';
    form.submit();
    return;
  }
  button.disabled = false;
  button.removeAttribute('aria-busy');
  if (response.ok) {
    note('email_subscribed');
    form.reset();
    status.textContent = '신청했습니다. 받은편지함의 확인 메일에서 링크를 누르면 구독이 완료됩니다. 메일이 없으면 스팸함도 확인해 주세요.';
  } else {
    status.textContent = '구독 신청을 처리하지 못했습니다. 이메일 주소를 확인하고 다시 시도해 주세요.';
  }
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
  const emailForm = panel.querySelector('#readerEmail');
  if (emailForm) emailForm.addEventListener('submit', (event) => subscribe(event, emailForm));
  document.querySelectorAll('[data-reader-subscribe]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    details.open = true;
    details.querySelector('summary').focus();
    details.scrollIntoView({ block: 'nearest' });
  }));
}

const questionCopy = document.getElementById('questionLinkCopy');
if (questionCopy) {
  const permalink = document.getElementById('questionPermalink');
  const status = document.getElementById('questionCopyStatus');
  questionCopy.addEventListener('click', () => copyField(permalink, questionCopy, status));
  questionCopy.hidden = false;
}

const edition = document.getElementById('caseEdition');
let editionSeen = false;
let editionEntered = false;
let editionInView = false;
let editionObserver;

function noteEditionView() {
  if (!editionObserver || editionSeen || document.hidden) return;
  editionSeen = true;
  note('law_edition_view');
  editionObserver.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (editionInView) noteEditionView();
}

if (edition && 'IntersectionObserver' in window) {
  editionObserver = new IntersectionObserver(([entry]) => {
    editionInView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
    onVisibility();
  }, { threshold: 0.5 });
  editionObserver.observe(document.getElementById('caseEditionTitle') || edition);
  document.addEventListener('visibilitychange', onVisibility);
}

function noteLawEntry(source) {
  note('law_open');
  note('law_from_' + source);
  if (source === 'edition' || source === 'search') {
    noteEditionView();
    if (editionSeen && !editionEntered) {
      editionEntered = true;
      note('law_edition_entry');
    }
  }
}

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  if (edition?.contains(link) && link.dataset.lawEntry === 'ruling' && link.origin === 'https://www.law.go.kr') {
    noteEditionView();
    note('law_official_open');
    return;
  }
  if (link.origin !== location.origin || !link.pathname.startsWith('/law/')) return;
  if (edition?.contains(link) && link.dataset.lawEntry === 'edition') noteLawEntry('edition');
  else if (link.classList.contains('article-law-link') || link.dataset.lawEntry === 'article') noteLawEntry('article');
  else noteLawEntry('navigation');
});

document.addEventListener('jogan:law-search-open', (event) => {
  if (event.target instanceof HTMLFormElement && event.target.matches('form[data-law-entry="search"]') && edition?.contains(event.target)) {
    noteLawEntry('search');
  }
});
