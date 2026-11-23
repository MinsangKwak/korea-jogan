import { issues } from './topics-data.js';
import { officialCaseUrl } from './search-core.js';
import { createSaveButton } from './library.js';
import { element, link, readingHeader } from './reading-dom.js';

function topicList() {
  const list = element('ul', 'law-topic-index');
  list.setAttribute('aria-label', '생활 쟁점 목록');
  for (const issue of issues) {
    const item = element('li');
    const entry = link('', '?issue=' + issue.slug, 'law-topic-card');
    entry.append(element('span', 'law-reading-kicker', issue.category),
      element('h2', '', issue.title), element('span', 'law-topic-terms', issue.terms.join(' · ')));
    item.append(entry);
    list.append(item);
  }
  return list;
}

function caseFile(record, theme) {
  const row = element('li', 'law-reading-case');
  const title = element('h3', '', record.question);
  const metadata = element('p', 'law-reading-meta', '대법원 · ');
  const date = element('time', '', record.date.replace(/-/g, '.'));
  date.dateTime = record.date;
  metadata.append(date, ' · ' + record.number);
  const actions = element('div', 'law-reading-actions');
  const source = link(record.title + ' 원문', officialCaseUrl(record), 'law-reading-source');
  source.rel = 'noreferrer';
  source.setAttribute('aria-label', record.title + ' 원문 · ' + record.number);
  actions.append(source, createSaveButton(record, theme));
  row.append(title, metadata, actions);
  return row;
}

export function renderTopics(root, slug = '') {
  const issue = issues.find(item => item.slug === slug);
  if (!issue) {
    const intro = readingHeader('생활 법률 이슈', slug
      ? '요청한 쟁점을 찾을 수 없습니다. 아래 목록에서 살펴볼 질문을 고르세요.'
      : '일상의 질문에서 시작해 대법원 판례와 관련 법률의 공포·시행 일정을 읽습니다.');
    root.replaceChildren(intro, topicList());
    document.title = '생활 법률 이슈 | 대한민국 조간';
    return;
  }

  const header = readingHeader(issue.title, issue.description);
  header.prepend(link('생활 법률 이슈 전체', '?view=issues', 'law-reading-back'), element('p', 'law-reading-kicker', issue.category));
  const layout = element('div', 'law-topic-layout');
  const cases = element('section', 'law-topic-cases');
  const heading = element('h2', '', '판례로 읽는 쟁점');
  const list = element('ol', 'law-reading-cases');
  for (const record of issue.cases) list.append(caseFile(record, issue.theme));
  cases.append(heading, list, link('보관한 판례 비교하기', '?view=saved', 'law-reading-source'));

  const related = element('aside', 'law-topic-related');
  related.setAttribute('aria-label', '관련 법률');
  const searchLink = link('입법 일정 보기', '/law/calendar/?q=' + encodeURIComponent(issue.law), 'law-reading-primary');
  related.append(element('h2', '', '함께 볼 법률'), element('h3', '', issue.law),
    element('p', '', '이 법률명이 들어간 법률안과 공포·시행 일정을 확인하세요.'), searchLink);
  layout.append(cases, related);
  root.replaceChildren(header, layout);
  document.title = issue.title + ' | 대한민국 조간';
}
