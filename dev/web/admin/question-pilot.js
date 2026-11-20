import { request } from './api.js';

const PILOT_IDS = ['lee-jae-myung-trials', 'regional-student-loan-interest', 'reversal-and-remand'];
let catalog;

export function loadPilotQuestions() {
  if (!catalog) {
    catalog = request('/data/political-questions.json').then(({ questions }) => PILOT_IDS.map((id) => {
      const question = questions.find((item) => item.id === id);
      if (!question?.question || (question.trackerId && !/^[a-z0-9-]+$/.test(question.trackerId))) throw new Error('질문 목록을 확인해 주세요.');
      return { label: question.question, path: question.trackerId ? '/topics/' + question.trackerId + '/' : '/politics/' + id + '/' };
    })).catch((error) => { catalog = undefined; throw error; });
  }
  return catalog;
}
