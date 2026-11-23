'use strict';

const questionPage = document.querySelector('main[data-question-id]');
const questionMetrics = {};
if (questionPage) {
  const source = new URL(location.href);
  const page = new URL(source.pathname, source.origin);
  for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const value = source.searchParams.get(name);
    if (/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value || '')) page.searchParams.set(name, value);
  }
  questionMetrics.page_location = page.href;
  questionMetrics.page_referrer = document.referrer ? document.referrer.split(/[?#]/)[0] : '';
  function countAction(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target.closest?.('a[href][data-question-action]');
    const action = link?.dataset.questionAction;
    if (['source', 'term', 'calendar'].includes(action)) track('question_' + action);
  }
  questionPage.addEventListener('click', countAction);
  questionPage.addEventListener('auxclick', countAction);
}

setupMetrics(questionMetrics);
trackView('', false, questionMetrics);
track('discovery_open', metaContent('kj-page-kind'));
