# 대한민국 조간 문서 안내

[프로젝트 소개](../../README.md)에서 담당 범위와 운영 화면을 보고, 아래에서 궁금한 구현의 근거를 확인할 수 있습니다.

## 프로젝트를 살펴볼 때

| 궁금한 점 | 먼저 읽을 문서 | 확인할 수 있는 사례 |
| --- | --- | --- |
| 기사와 판례를 왜 한 화면에 놓았나? | [서비스 기획](planning/01-product.md) | 기사를 읽다가 생긴 질문을 관련 판결문까지 연결한 이유 |
| UI를 어떤 단위로 나눴나? | [기술 구조와 설계 판단](dev/architecture.md) | 날짜별 HTML 생성, 지면 컴포넌트, 자료 일부를 불러오지 못했을 때의 처리 |
| 모바일과 키보드에서 무엇이 달라지나? | [화면·접근성 가이드](design/guide.md) | 읽는 순서, 패널 닫기와 포커스 복귀, 큰 글자·테마 |
| 호별 기사는 어떻게 저장하고 조회하나? | [기사 API](dev/article-api.md) | SQLite 동기화, 날짜별 검색과 Swagger UI에서 직접 실행하는 순서 |
| 유입 개선을 어떻게 평가하나? | [검색·재방문 검증 계획](planning/growth.md) | 질문별 검색 노출과 클릭, 독자의 원문 열람을 집계하는 방법 |

[오늘 정치 한 장](https://korea-jogan.com/) · [판례 검색](https://korea-jogan.com/law/) · [프로젝트 Notion](https://app.notion.com/p/3ffcbbdd109b8167a28dd65769e55676)

## 편집·데이터 기준

- 보도와 판결을 연결하는 요건, 원문 대조 범위, 자동 발행·정정 기준. [기사와 판례 선정](planning/law-data.md#기사와-판례-선정-기록) · [초안 편집](planning/editorial.md) · [통합 기획 Notion](https://app.notion.com/p/3decbbdd109b812e8a90f88de1c66a33)
- 판례와 법령의 자료원, 의안·공포·시행 집계, 호별 데이터 필드와 검사 규칙. [법률 자료](planning/law-data.md) · [데이터 규격](planning/data-spec.md)
- 추적 중인 사안의 진행 단계와 다음 확인 일정. [이슈 추적](https://korea-jogan.com/#track) · [현재 추적 데이터](../../frontend-vanilla-js/data/trackers.json)

## 구현을 검증하는 코드

날짜별 발행과 정정은 [Python 검사](../tests/pipeline/)에서, 판례 검색 규칙은 [Node.js 검사](../tests/frontend/)에서 확인합니다. [Playwright 검사](../tests/browser/)는 공개 지면과 관리자 화면을 열어 키보드 포커스, 날짜 이동, 조회 실패 후 복구를 검증합니다. SQLite 저장소와 JSON 응답의 일치는 [백엔드 검사](../tests/backend/)에서 다룹니다.

## 개발·운영 기준

- **발행과 복구** — 매일 발행할 데이터 준비, 검사 실패 시 복구 순서, 운영 도메인에서의 확인. [운영 런북](planning/runbook.md) · [브랜치·배포](dev/branches.md)
- **날짜별 변경 이력** — 첫 공개부터 오늘까지 하루에 한 주요 기능을 날짜별로 묶었습니다. [업데이트 노트](dev/updates.md)
- **보안과 장애 대응** — 공개 화면·관리자·기사 API에 적용한 보호 조치, 이전 장애의 증상과 복구 근거. [보안 설계와 검증](dev/security.md) · [장애·검사 기록](dev/changelog.md)
- **운영 검증** — 발행 확인, 관리자 공개 현황과 권한별 GA4·검색 조회. [관리자 연결](dev/ga4-admin.md) · [운영 Notion](https://app.notion.com/p/40ecbbdd109b8192be79d2ad87e1b95d)
- **디자인 자산** — 지면·공유 이미지와 외부 라이브러리의 출처·이용 조건. [브랜드 자산](design/illustrations.md) · [Swiper 원본·라이선스](design/swiper.md)
- **개발 참여** — 새 로컬 작업본 설정, 브랜치와 커밋 작성 규칙. [저장소 작업 지침](AGENTS.md) · [커밋 기준](dev/commits.md)
