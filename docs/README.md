# 문서 안내

**현재 동작은 기획·기술·디자인 문서에서, 날짜별 변경은 변경 기록에서 확인합니다.** 아래 표에서 주제별 기준 문서를 찾을 수 있습니다. 이전 날짜의 테스트 수·기사 수·운영 조건은 그 시점의 값입니다.

[프로젝트 README](../README.md) · [서비스](https://korea-jogan.com/) · [운영 화면](https://korea-jogan.com/admin/) · [작업 지침 AGENTS.md](../AGENTS.md)

| 질문 | 문서 | 소유 주제 |
| --- | --- | --- |
| 누구를 위해 무엇을 약속하나, 호 상태와 확인 주체는 | [서비스 기획](planning/01-product.md) | 독자·문제·읽기 흐름·호 상태·검증 가설·후속 과제 |
| 데이터는 어떤 모양이고 무엇을 검사하나 | [데이터 규격](planning/data-spec.md) | 호·색인·추적·정정·`live.json` 필드와 검사 범위 |
| 하루가 어떻게 흘러가고 멈추면 어디부터 보나 | [운영 런북](planning/runbook.md) | 조사 원칙, 1~5단계, 06:05 감독, 장애 추적 순서(11/05 사례), 정정, 추적 갱신 |
| 초안 문장을 어디까지 고칠 수 있나 | [초안 편집 기준](planning/editorial.md) | 결론 먼저 쓰기, 허용 필드, 사실 보존 검사, 00시 실행 순서 |
| 검색·소개·재방문은 어떻게 보나 | [검색·소개·재방문 운영](planning/growth.md) | 측정 기준선, 고정 도착 페이지, RSS 안내, Search Console, UTM |
| 코드는 어떻게 구성됐고 바꾸면 어디가 깨지나 | [기술 구조](dev/architecture.md) | 전체 구조, 데이터 지도, 설계 트레이드오프, 변경 영향 범위, 로딩·오류 경계, 검사 범위 |
| 브랜치·배포·개발 환경은 | [브랜치·환경·배포](dev/branches.md) | 브랜치 역할, 승격 순서, 워크플로 표, Vercel·DNS, 일일 경로 보호 조건 |
| 커밋 제목은 어떻게 쓰나 | [커밋 기준](dev/commits.md) | 종류·범위·길이, 검사기 |
| 관리자 연결·GA4·검색 API는 | [GA4·검색 연결](dev/ga4-admin.md) | OAuth 설정, 표시 정보, 읽기 이벤트 해석, 오류 처리 |
| 언제 무엇이 바뀌었나 | [변경 기록](dev/changelog.md) | 2026.10.23 ~ 2026.11.09 날짜별 배포·복구·당시 검사 수 |
| 화면 배치와 UI 기준은 | [디자인 가이드](../design/guide.md) · [공유 이미지·아이콘](../design/illustrations.md) | 그리드, 펼침 기본값, 테마, 토큰, 브랜드 자산 |
| 과거 조사 근거는 | [무안공항 참사 대조 기록](research/muan-airport-20261030.md) | 2026.10.30 확인 범위. 현재 단계는 [trackers.json](../dev/web/data/trackers.json) |
| Swiper 원본·라이선스는 | [vendor README](../dev/web/assets/vendor/swiper/README.md) | 버전·원본·SHA-256 |

원문 접근 여부·사람의 대조·AI 형식 검사는 서로 다른 일이며, 데이터 검사 통과와 실제 이용자 성과도 구분해 기록합니다.
