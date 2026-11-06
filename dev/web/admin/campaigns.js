import { copyField } from '../src/core/clipboard.js';

const ORIGIN = 'https://korea-jogan.com';
const TOPICS = {
  muan: {
    path: '/topics/muan-airport/', content: 'timeline_a',
    title: '[이슈 추적] 무안공항 참사, 지금 어디까지 진행됐을까?',
    lines: ['관련 보도를 읽어도 앞뒤 흐름이 헷갈릴 때 참고할 수 있는 기록입니다.', '현재 단계와 다음 확인 사항을 날짜별 기록·근거 기사와 함께 볼 수 있습니다.', '새로 확인된 내용과 확인이 필요한 부분을 구분해 정리합니다.']
  },
  exchange: {
    path: '/indicators/usd-krw/', content: 'exchange_a',
    title: '[경제 숫자] 환율 기사마다 숫자가 다르다면, 기준일을 확인해 보세요',
    lines: ['원·달러 환율의 호별 기록을 기준일·출처와 함께 모았습니다.', '조간 발행일과 실제 자료의 관측 시점을 나눠 비교할 수 있습니다.', '장중 시세가 아닌 조간에 수록한 기록을 확인하는 페이지입니다.']
  },
  daily: {
    path: '/', content: 'morning_a',
    title: '[아침 뉴스] 핵심 숫자와 출처를 함께 보는 대한민국 조간',
    lines: ['전국 뉴스와 경제 숫자를 출처·기준일과 함께 정리합니다.', '이슈의 진행 상황은 따로 기록하고, 지난 호도 다시 볼 수 있습니다.', '발행되는 새 호는 RSS로 받아볼 수 있습니다.']
  }
};
const CHANNELS = { naver_cafe: 'referral', threads: 'social', kakao: 'referral', blog: 'referral', newsletter: 'email' };
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function campaignDraft(topicId, source, campaign, content) {
  const topic = Object.hasOwn(TOPICS, topicId) ? TOPICS[topicId] : null;
  if (!topic || !Object.hasOwn(CHANNELS, source) || !ID.test(campaign) || !ID.test(content)) return null;
  const url = new URL(topic.path, ORIGIN);
  url.search = new URLSearchParams({ utm_source: source, utm_medium: CHANNELS[source], utm_campaign: campaign, utm_content: content });
  return { url: url.href, text: [topic.title, '', ...topic.lines, '', url.href].join('\n') };
}

function initCampaignTools() {
  const form = document.getElementById('campaignForm');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).replace(/\D/g, '');
  $('campaignName').value = month + '_readership';
  let validated = false;

  function render(showErrors = false) {
    const fields = [$('campaignName'), $('campaignContent')];
    const invalid = fields.find((field) => !ID.test(field.value));
    for (const field of fields) {
      if (showErrors && !ID.test(field.value)) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }
    const draft = campaignDraft($('campaignTopic').value, $('campaignChannel').value, fields[0].value, fields[1].value);
    $('campaignError').textContent = showErrors && !draft ? '캠페인·글 구분은 영문 소문자나 숫자로 시작하고 소문자·숫자·밑줄·하이픈으로 64자 이내 입력해 주세요.' : '';
    $('campaignUrl').value = draft?.url || '';
    $('campaignDraft').value = draft?.text || '';
    $('copyCampaignLink').disabled = !draft;
    $('copyCampaignDraft').disabled = !draft;
    $('campaignStatus').textContent = '';
    if (showErrors && invalid) invalid.focus();
    return !!draft;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.isComposing) return;
    validated = true;
    if (render(true)) $('campaignStatus').textContent = '선택한 주제와 채널로 홍보 글과 링크를 만들었습니다.';
  });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.isComposing) event.preventDefault();
  });
  form.addEventListener('input', () => render(validated));
  $('campaignTopic').addEventListener('change', () => {
    $('campaignContent').value = TOPICS[$('campaignTopic').value]?.content || '';
    render(validated);
  });
  $('campaignChannel').addEventListener('change', () => render(validated));
  $('copyCampaignLink').addEventListener('click', () => copyField($('campaignUrl'), $('copyCampaignLink'), $('campaignStatus')));
  $('copyCampaignDraft').addEventListener('click', () => copyField($('campaignDraft'), $('copyCampaignDraft'), $('campaignStatus')));
  render();
}

initCampaignTools();
