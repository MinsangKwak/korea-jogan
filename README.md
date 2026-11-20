# 대한민국 조간

**대한민국 조간은 오늘의 뉴스와 수치를 읽고, 같은 주제의 판례와 입법 원문까지 확인할 수 있는 광고 없는 데이터 신문입니다.** 신문에는 수치의 출처·기준일과 편집자 확인 여부를, 상설 판례 자료실에는 사건번호·선고일과 공식 원문을 표시합니다.

[오늘의 조간](https://korea-jogan.com/) · [판례 검색](https://korea-jogan.com/law/) · [입법 캘린더](https://korea-jogan.com/law/calendar/) · [운영 화면](https://korea-jogan.com/admin/) · [문서 안내](docs/README.md) · [통합 기획·편집 기준 Notion](https://app.notion.com/p/3decbbdd109b812e8a90f88de1c66a33) · [Figma](https://www.figma.com/design/Eep2qLjiPT9jhDUyLU8Zjx)

## 어떤 문제를 풀었는가

같은 사건을 다뤄도 집계 기간이나 비교 시점에 따라 수치가 달라질 수 있습니다. 1면의 **기사와 판례**에서는 한 보도에서 나온 질문을 이전 대법원 판단과 함께 읽습니다. 예를 들어 수능 집행정지 신청 보도와 집행정지 요건을 다룬 별개 사건을 각 원문으로 엽니다. 생활어·사건번호로 바로 검색하거나, 오늘의 머리기사와 핵심 수치로 이동할 수 있습니다. [기사와 판례](https://korea-jogan.com/#caseEdition) · [선정 기준과 출처](docs/planning/news-case-pairs.md)

예를 들어 [전세보증금 이슈](https://korea-jogan.com/law/?issue=rental-deposit)에서 두 판례의 쟁점과 원문을 열고, [판례 보관함](https://korea-jogan.com/law/?view=saved)에서 판시사항을 비교할 수 있습니다. [입법 캘린더](https://korea-jogan.com/law/calendar/)는 한국 시간의 현재 달부터 열립니다. 2025년 1월 이후의 법률안 제안·법률 공포·시행을 날짜별로 보고, 앞으로 시행될 일정과 공식 다음 관보 예고도 확인할 수 있습니다.

개인 프로젝트로 기획부터 정보 구조와 UI, 데이터 규격, 검사·배포 흐름까지 구성했습니다. AI는 자료 조사·초안·삽화에 활용하며, 자동 검사와 사람의 원문 대조를 구분해 기록합니다.

| 담당 영역 | 구현과 판단 | 문서 |
| --- | --- | --- |
| 서비스 기획 | 하루 한 호와 상설 판례면, 공식 출처·정정·확인 상태 공개 | [기획](docs/planning/01-product.md) |
| UX/UI·퍼블리싱 | PC 비교 배치와 모바일 핵심 정보 우선, 읽기 설정·키보드 탐색·패널 닫기와 포커스 복귀 | [디자인 가이드](design/guide.md) · [브랜드 자산](design/illustrations.md) |
| 프론트엔드 | 지면별 컴포넌트, 분야별 판례 검색·결과·보관·비교, 상태 안내와 키보드 탐색 | [기술 구조](docs/dev/architecture.md) |
| 데이터·운영 | 데이터 검사, 사람 확인/자동 공개, 정정, 호별 페이지·RSS·배포 | [데이터 규격](docs/planning/data-spec.md) · [런북](docs/planning/runbook.md) |

## 자료가 공개되기까지

조사·편집한 자료는 날짜별 JSON으로 저장합니다. Python 검사를 거친 뒤 해당 호의 HTML·RSS·사이트맵을 생성합니다. 일일 발행은 **검사한 일일 SHA의 데이터만 안정 코드에 반영**해 개발 중인 기능이 공개되지 않도록 했습니다. 검사 실패·오늘 호 누락·브랜치 충돌이 있으면 발행을 중단하고, 배포 후에도 공개 데이터의 날짜·상태·소스 SHA를 대조합니다.

사람이 원문과 대조한 호는 '편집자 확인', 자동 검사만 거쳐 공개한 호는 '자동 발행'으로 표시합니다. 발행한 본문·현재의 이슈 추적·별도 갱신하는 최신 숫자·정정 기록은 데이터 파일을 나눠 관리합니다. 각 필드와 확인 상태의 의미는 [데이터 규격](docs/planning/data-spec.md), 읽고 쓰는 코드의 관계는 [데이터 지도](docs/dev/architecture.md#데이터-지도)에 있습니다.

예약 시각·발행 절차·장애 추적은 [런북](docs/planning/runbook.md), 브랜치·워크플로·개발 미리보기는 [브랜치·환경·배포](docs/dev/branches.md), 실제 복구 이력은 [변경 기록](docs/dev/changelog.md)에 있습니다.

판례·입법 자료는 독립적으로 갱신하는 수록본입니다. 판례는 15개 분야의 고유 일련번호로, 국회 제안은 의안번호로 집계합니다. 한 판례가 여러 분야에 속할 수 있습니다. 주요 원자료·보완 기간·실행 명령은 [판례·입법 자료의 출처와 갱신](docs/planning/law-data.md)에 있습니다.

## 기술과 실행

화면은 HTML·CSS·바닐라 JavaScript로 구현했고, 데이터 수집·검사·생성에는 Python 3.12를 사용합니다. Node.js 22는 검사 도구 실행에 사용합니다. 프레임워크·번들러·상시 서버·DB 없이 운영은 GitHub Pages, 개발 검토는 인증 보호된 Vercel에서 합니다. Swiper는 [라이선스·버전을 기록](dev/web/assets/vendor/swiper/README.md)해 로컬에 둡니다. 선택 이유와 제약은 [설계 트레이드오프](docs/dev/architecture.md#설계-트레이드오프)에 정리했습니다.

```bash
python3 -m http.server -d dev/web 8000            # http://localhost:8000
python3 dev/pipeline/publish/validate.py          # 데이터 검사
python3 dev/pipeline/build/build_tokens.py --check
python3 -m unittest discover -s dev/tests
cd dev/tests/browser && npm ci && npx playwright install chromium && npm test
```

ECOS 키는 GitHub Secrets `ECOS_API_KEY`로 관리하며 키·토큰을 저장소에 넣지 않습니다. 운영 화면의 Google OAuth·GA4·검색 연결은 [관리자 연결 안내](docs/dev/ga4-admin.md)를 따릅니다.

| 찾는 내용 | 위치 |
| --- | --- |
| 화면·공통 로직·섹션별 구현 | [dev/web/src/](dev/web/src/) |
| 판례 자료실·입법 캘린더 | [dev/web/law/](dev/web/law/) · [자료 갱신 코드](dev/pipeline/law/) |
| 수집·검사·페이지 생성 | [dev/pipeline/](dev/pipeline/) |
| 자동 검사 | [dev/tests/](dev/tests/) |
| 디자인 토큰·삽화·공유 이미지 | [design/](design/) |
| 작업 규칙 | [AGENTS.md](AGENTS.md) · [커밋 기준](docs/dev/commits.md) |

## 한계와 다음 과제

- **자료 수집** — 신문 지표에는 수동 조사 항목이 있습니다. 입법 캘린더의 2026년 9월 24일 이후 법률안 보완분은 의원발의 자료로, 같은 기간 정부·위원장 제안이 빠질 수 있습니다.
- **개인 보관함** — 선택한 판례의 식별번호와 분야를 현재 브라우저에 저장합니다. 이전 Casewise 도메인에 보관한 목록은 자동 이전되지 않으며 기존 호스팅이 종료되면 그 주소 접근도 보장할 수 없습니다.
- **검사의 범위:** 형식·하위 필드·링크 형태·호 상태 검사가 원문의 진위와 계산 정확성까지 보증하지 않습니다. 공개 이후에도 대조와 정정이 필요합니다.
- **측정:** GA4·검색 실적 조회를 구현했으나 실제 이용 흐름으로 독자 가설을 검증하는 일은 별도 과제입니다([검색·소개·재방문 운영](docs/planning/growth.md)).
- **호스팅:** GitHub Pages는 메타 CSP만 가능하며 응답 헤더가 필요한 보안 기능은 미설정입니다.

## 이전 화면

2026.10.30 당시 운영 화면입니다. 최신 배치는 [디자인 가이드](design/guide.md)를 따릅니다.

<table>
<tr><th>PC · 2026.10.30</th><th>모바일 · 2026.10.30</th></tr>
<tr><td><img src="docs/assets/service-desktop-20261030.jpg" alt="2026년 10월 30일 PC 운영 화면" width="760"></td><td><img src="docs/assets/service-mobile-20261030.jpg" alt="2026년 10월 30일 모바일 운영 화면" width="250"></td></tr>
</table>

## 이용 조건

코드는 [MIT](LICENSE), 서비스에서 직접 작성한 글은 CC BY 4.0입니다. 기사·통계 등 원자료의 이용 조건은 각 권리자·기관을 따릅니다.
