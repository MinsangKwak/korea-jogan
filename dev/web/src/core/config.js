'use strict';
// 화면 전체가 함께 쓰는 상수와 상태. 모든 스크립트보다 먼저 읽는다

const DAY = 86400000;
const REPO = 'https://github.com/MinsangKwak/korea-jogan';
// [id, 이름, 전체 메뉴에 보일 한 줄 설명]
const SECTIONS = [
  ['home', '홈', '머리기사, 오늘 꼭 볼 숫자, 기준이 갈린 숫자'],
  ['media', '언론', '주제별 언론 보도와 매체마다 다른 숫자'],
  ['national', '전국', '분야별 전국 뉴스와 오늘의 흐름'],
  ['regions', '지역', '17개 시도 소식'],
  ['politics', '정치', '임기, 선거·예산 D-Day, 이번 주 일정'],
  ['economy', '경제', '증시·환율·유가 핵심 숫자'],
  ['industry', '산업', '주력산업과 수출입'],
  ['fiscal', '재정', '국가채무와 국민연금']
];
const MENU_ICON = 'M4 7h16M4 12h16M4 17h16';
// 하단 탭바는 8개 분야를 5칸으로 묶는다. [이름, 묶은 섹션, 아이콘 경로]
const TABS = [
  ['홈', ['home'], 'M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z'],
  ['언론', ['media'], 'M5 5h14v14H5zM8 9h8M8 12h8M8 15h5'],
  ['전국·지역', ['national', 'regions'], 'M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21zM12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  ['정치', ['politics'], 'M4 20h16M6 17V10M10 17V10M14 17V10M18 17V10M3 10l9-6 9 6z'],
  ['경제·재정', ['economy', 'industry', 'fiscal'], 'M4 19h16M6 16V9M11 16V5M16 16v-5']
];
// 시도는 권역별로 묶어 고른다. 지도 모양 격자는 빈칸이 생겨 찾기 어려웠다
const REGION_GROUPS = [
  ['수도권', ['서울', '인천', '경기']],
  ['강원', ['강원']],
  ['충청', ['대전', '세종', '충북', '충남']],
  ['호남', ['광주', '전북', '전남']],
  ['영남', ['부산', '대구', '울산', '경북', '경남']],
  ['제주', ['제주']]
];
const REGIONS = REGION_GROUPS.flatMap(([, names]) => names.map((n) => [n]));
const NAT_CATS = ['사회', '사건·안전', '날씨·재난', '안보·외교', '국제', '과학·IT', '생활·물가', '문화·스포츠'];
const DIR_LABEL = { up: '상승', down: '하락', flat: '보합' };
const BAR_CLASS = { semi: ' kj-bar--semi', trad: ' kj-bar--trad' };

let D = null;
let INDEX = null;
let VIEWING_PAST = false;
let ISSUE = new Date();
let natCat = '전체';
let region = '';
