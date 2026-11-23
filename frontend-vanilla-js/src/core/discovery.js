'use strict';

const questionPage = document.querySelector('main[data-question-id]');
if (questionPage) {
  function countAction(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target.closest?.('a[href][data-question-action]');
    const action = link?.dataset.questionAction;
    if (['source', 'term', 'calendar'].includes(action)) track('question_' + action);
  }
  questionPage.addEventListener('click', countAction);
  questionPage.addEventListener('auxclick', countAction);
}

setupMetrics();
trackView('', false);
track('discovery_open', metaContent('kj-page-kind'));
