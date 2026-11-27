'use strict';

import { copyField } from './clipboard.js';

// 공개 지면의 독자 행동을 기존 내부 접속 제외 기준에 따라 기록한다
function note(action) {
  if (typeof window.track === 'function') window.track('reader_' + action);
}

// 구독 신청은 Buttondown 규칙대로 일반 폼 제출로 새 창에 보낸다
// 보안 확인(CAPTCHA)이나 주소 오류 안내를 독자가 그 창에서 이어서 처리해야 해서 fetch를 쓰지 않는다
function subscribe(form) {
  note('email_submit');
  form.querySelector('#readerEmailStatus').textContent = '새 창에서 신청 결과를 확인해 주세요. 받은편지함의 확인 메일에서 링크를 누르면 구독이 완료됩니다.';
}

// 스크립트가 있을 때만 아이디 @ 메일 서비스 선택으로 바꾸고, 없으면 한 칸짜리 주소 입력을 그대로 쓴다
// 실제로 보내는 값은 원래 칸(name="email") 하나라서 Buttondown 쪽 규칙은 그대로다
function splitEmail(form) {
  const whole = form.querySelector('#readerEmailInput');
  const split = form.querySelector('#readerEmailSplit');
  const local = form.querySelector('#readerEmailLocal');
  const domain = form.querySelector('#readerEmailDomain');
  const custom = form.querySelector('#readerEmailCustom');
  if (!whole || !split || !local || !domain || !custom) return;
  const syncCustom = () => {
    custom.hidden = domain.value !== '';
    custom.required = domain.value === '';
  };
  // 자동완성이 주소 전체를 넣으면 @ 뒤를 목록에서 고르거나 직접 입력으로 옮긴다
  const spill = () => {
    const at = local.value.indexOf('@');
    if (at < 0) return;
    const host = local.value.slice(at + 1).trim().toLowerCase();
    local.value = local.value.slice(0, at);
    const known = [...domain.options].some((option) => option.value && option.value === host);
    domain.value = known ? host : '';
    if (!known) custom.value = host;
    syncCustom();
  };
  const compose = () => {
    const host = (domain.value || custom.value).trim().replace(/^@/, '');
    whole.value = local.value.trim() + '@' + host;
  };
  form.querySelector('#readerEmailWhole').hidden = true;
  whole.required = false;
  split.hidden = false;
  local.required = true;
  syncCustom();
  local.addEventListener('input', () => { local.setCustomValidity(''); spill(); });
  custom.addEventListener('input', () => local.setCustomValidity(''));
  domain.addEventListener('change', () => {
    local.setCustomValidity('');
    syncCustom();
    if (!custom.hidden) custom.focus();
  });
  // 브라우저 기본 검사 뒤에 합친 주소를 한 번 더 확인하고, 틀리면 새 창을 열지 않는다
  form.addEventListener('submit', (event) => {
    compose();
    if (whole.checkValidity() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(whole.value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    local.setCustomValidity('이메일 주소를 다시 확인해 주세요.');
    local.reportValidity();
  });
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
  if (emailForm) {
    splitEmail(emailForm);
    emailForm.addEventListener('submit', () => subscribe(emailForm));
  }
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
