'use strict';
// 숫자·날짜 서식과 DOM 조회 단축 함수

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('ko-KR');
const one = (v) => v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return utc(y, m, d); };
// 발행 기준은 한국 시간. 기기 시간대와 상관없이 오늘 날짜를 KST로 구한다
const todayKST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const longDate = (s) => parseDate(s).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' });
// 호별 공개 주소. 로컬에서 열어도 canonical에 적힌 공개 도메인을 바탕으로 만든다
const issueUrl = (d) => { const c = document.querySelector('link[rel="canonical"]'); return new URL(d, c ? c.href : location.href).href; };
// D-Day는 지난 날이면 D+로 쓴다
const dday = (date) => { const n = daysBetween(ISSUE, date); return n >= 0 ? 'D-' + fmt(n) : 'D+' + fmt(-n); };
