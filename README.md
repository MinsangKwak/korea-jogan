# 대한민국 조간

**전국 뉴스와 장기 이슈, 공식 숫자를 출처·기준일과 함께 읽는 데이터 신문입니다.** 기사마다 다르게 보도한 숫자는 집계 기간과 기준을 나란히 비교하고, 사람이 확인한 호와 자동으로 발행한 호를 구분합니다.

[서비스](https://korea-jogan.com/) · [운영 화면](https://korea-jogan.com/admin/) · [문서 안내](docs/README.md) · [개발·운영 환경](docs/dev/environments.md) · [최신 환경 변경](docs/dev/changes-2026-11-04-preview.md)

## 현재 제공하는 화면

**2026.11.04 기능 기준입니다.** PC에서는 여러 정보를 나란히 비교하고, 모바일에서는 요약·현재 단계·숫자·기준일·검색을 먼저 보여 줍니다. 보조 내용을 접어도 핵심 정보는 남습니다.

| 영역 | 현재 동작 |
| --- | --- |
| 전국 뉴스 · 1면 | 분야별 기사와 오늘의 흐름. 화면 폭과 큰 글자 선택에 맞춰 기사 열 수 조정 |
| 이슈 추적 · 2면 | 선관위 특검·무안공항 참사의 단계·다음 확인·타임라인·근거 기사. PC는 사안 카드 두 개를 나란히 배치 |
| 머리기사·수치 비교 | 대표 기사와 핵심 수치, 기준이 갈린 숫자 비교. PC 보조 목록은 머리기사 높이 안에서 스크롤 |
| 언론·지역·정치 | 주제 검색과 매체별 비교, 17개 시도 선택, 임기·D-Day·일정. PC 언론 검색은 제목 옆에 배치 |
| 경제 지표 | 가로 순환 슬라이드와 이전·다음·자동 넘김 제어. 읽는 동작에서는 멈추고 기준일·출처를 표시 |
| 산업·재정 | PC 산업 요약 옆에 품목별 수출 그래프 배치. 국가채무·국민연금은 수치와 근거로 확인 |
| 공통 읽기 도구 | 기기 설정·라이트·다크, 글자 확대, 전체 메뉴, 맨 위로, 지난 호·정정 기록 |
| 주제별 고정 주소 | [지난 호](https://korea-jogan.com/archive/)·[추적 사안](https://korea-jogan.com/topics/)·[경제 지표 기록](https://korea-jogan.com/indicators/). 스크립트 없이도 본문·근거·내부 링크 제공 |

읽는 순서는 **전국 → 이슈 추적 → 홈 → 지역 → 언론 → 정치 → 경제 → 산업 → 재정**의 9개 섹션입니다. 모바일에서는 보조 주제·타임라인·상세 집계·산업 그래프를 기본으로 접고, PC에서는 펼쳐 둡니다. 긴 근거 기사 표는 건수를 표시해 필요할 때 읽게 합니다.

상단 추적 막대는 현재 세션에서 숨겼다가 다시 열 수 있습니다. 지난 호에는 현재 추적 상태를 덧붙이지 않습니다. 경제 슬라이드는 해당 영역 근처에서 같은 출처의 라이브러리를 불러오고, 준비에 실패하면 전체 지표 목록을 유지합니다.

[현재 디자인 기준](design/guide.md) · [픽셀 삽화·OG·파비콘](design/illustrations.md) · [섹션 배치·접기·순환 탐색](docs/dev/changes-2026-11-03-sections.md)

## 어떤 문제를 풀었는가

같은 사건의 숫자도 집계 기간이나 비교 시점에 따라 달라집니다. 숫자만 요약하면 독자가 원문을 다시 찾아야 하므로 **값·출처·기준일·확인 범위를 함께 보여 주는 것**을 중심으로 설계했습니다.

1인 프로젝트로 기획, 정보 구조, UI, 데이터 규격, 검사와 배포 흐름을 구성했습니다. AI는 자료 조사·초안과 삽화 제작에 활용하며, AI의 형식 검사를 사람의 원문 대조로 표현하지 않습니다.

| 담당 영역 | 구현과 판단 | 확인할 문서 |
| --- | --- | --- |
| 서비스 기획 | 하루 한 호, 9개 섹션, 출처·정정·확인 상태 공개 | [기획 배경과 범위](docs/planning/01-product.md) |
| UX/UI·퍼블리싱 | PC 비교 배치와 모바일 핵심 정보 우선, 테마·타이포그래피·디자인 토큰 | [디자인 가이드](design/guide.md) |
| 프론트엔드 | JSON 렌더링, 공통 탐색·반응형 펼침, 오류 복구, 지연 로딩 슬라이드 | [기술 구조](docs/dev/architecture.md) |
| 데이터·운영 | 데이터 검사, 사람 확인과 자동 공개, 정정·호별 페이지·배포 | [데이터 규격](docs/planning/data-spec.md) · [운영 런북](docs/planning/runbook.md) |

구현 범위와 의사결정을 기록한 프로젝트입니다. 사용자 증가·읽기 시간 단축·검색 순위 개선 등의 성과는 측정 근거가 확보되기 전까지 제시하지 않습니다.

## 자료가 공개되기까지

00시 Codex가 안정 `main`에서 `daily/YYYY-MM-DD`를 만들고 새 자료 조사·사실 초안·문장 편집·검사를 거쳐 오늘 자료만 저장합니다. 아침 발행은 고정한 일일 SHA의 CI와 허용 파일을 확인한 뒤 **안정 코드에 데이터만 반영**합니다. 개발 `dev`의 미완성 코드나 일일 브랜치 전체를 운영에 병합하지 않습니다.

06:05 Codex는 공개 상태를 읽기 전용으로 확인하고 실제 공개는 GitHub의 06:07·06:37·07:17·08:17 예약이 담당합니다. Codex 예약 2개는 첫 예약 2026.11.05로 등록·활성을 확인했으며, 00시 일일 브랜치 작성과 06:05 안정 SHA·공개 빌드 확인으로 지시 갱신도 완료했습니다. 첫 실행 결과는 아직 미확인입니다. [자동화 상태](docs/dev/publish-automation.md) · [초안 편집 기준](docs/planning/editorial.md)

사람이 원문과 대조한 호에는 편집자 확인을, 그렇지 않은 호에는 자동 발행을 표시합니다. 두 경로 모두 검사를 통과해야 공개되며, 검사 실패·오늘 호 누락·브랜치 충돌 시 공개를 중단합니다.

| 데이터 | 표시하는 의미 |
| --- | --- |
| 날짜별 조간 JSON | 그 호에 실은 기사·수치와 수집 한계 |
| `review`·`review.auto` | 확인 주체·시각과 사람 확인 또는 자동 발행 구분 |
| `trackers.json` | 최신 호에서 별도로 읽는 장기 이슈의 확인 기록 |
| `live.json` | 발행 본문과 별도로 갱신하는 ECOS 최신 일별 확정 통계 |
| 정정 기록 | 수정 전후 내용·이유·대상 호 |

진행 단계는 보도에 따른 편집상 정리이며 공식 해결률이 아닙니다. 최종 발표일이 미확정이면 기간 백분율을 표시하지 않고, 계획과 완료·송치와 유죄 확정을 구분합니다.

[발행 절차와 실패 대응](docs/planning/runbook.md) · [배포 구조](docs/dev/architecture.md) · [프로젝트 Notion](https://www.notion.so/3ffcbbdd109b8167a28dd65769e55676)

## 개발 미리보기와 운영 환경

| 구분 | 역할·주소 | 확인 상태 |
| --- | --- | --- |
| 개발 `dev` | Vercel `korea-jogan-dev`, 보호된 미리보기 | 첫 `f4df437b` 배포 READY·인증 경계·메타데이터 확인 |
| 개발 도메인 | `dev.korea-jogan.com`, `dev` 브랜치 연결 | Gabia CNAME 추가 필요. 현재 DNS NXDOMAIN |
| 안정 `main` | 검토한 코드와 선별 반영한 일일 자료 | 코드 승격과 일일 발행의 기준 |
| 운영 `deploy` | [korea-jogan.com](https://korea-jogan.com/) · GitHub Pages | 승인된 코드와 공개 자료 제공 |

개발 미리보기는 별도 `dist-preview`에 공개 호만 생성하고 검색 제외·GA4 비활성·관리자 읽기 전용 기준을 적용합니다. 코드 승격은 검토한 정확한 SHA의 CI·해당 Vercel 배포 성공·운영자의 인증/관리자 확인·조상 관계를 확인합니다. 기본 Vercel 주소와 운영 Pages의 초기 `f4df437b` 반영을 확인했습니다. 실제 Vercel 응답을 사용하는 승격 검사의 통합 결과는 [PR #92](https://github.com/MinsangKwak/korea-jogan/pull/92)에서 확인합니다. 사용자 개발 도메인의 DNS와 첫 일일 실행은 별도로 확인합니다.

[DNS 설정과 접근 권한](docs/dev/environments.md) · [코드와 일일 데이터의 두 경로](docs/dev/branches.md) · [이번 변경 상태](docs/dev/changes-2026-11-04-preview.md)

## 기술과 실행

화면은 HTML·CSS·바닐라 JavaScript, 수집·검사·생성은 Python으로 구성합니다. 운영은 프레임워크·번들러·상시 서버·DB 없이 GitHub Pages에서 제공하고 개발은 보호된 Vercel에서 검토하며, 경제 슬라이드용 Swiper는 라이선스와 버전을 기록해 로컬에 보관합니다.

CI 기준은 Python 3.12와 Node.js 22입니다. 저장소 루트에서 HTTP 서버로 실행합니다.

```bash
python3 -m http.server -d dev/web 8000
```

브라우저에서 `http://localhost:8000`을 엽니다. 데이터·생성 결과 검사는 다음과 같습니다.

```bash
python3 dev/pipeline/publish/validate.py
python3 dev/pipeline/build/build_tokens.py --check
python3 -m unittest discover -s dev/tests
```

Chromium 검사는 별도로 준비합니다.

```bash
cd dev/tests/browser
npm ci
npx playwright install chromium
npm test
```

공개 지면·관리자·CSP 검사를 함께 실행합니다. 2026.11.03 기능 배포는 자동 검사 148건과 운영 사이트 검사 34건을 통과했습니다. 이는 기능 검증 기록이며 실제 계정의 유입 수치나 사용자 성과를 뜻하지 않습니다. [검증 범위와 배포 근거](docs/dev/changes-2026-11-03-sections.md)

운영 화면은 공개 발행 현황과, Google OAuth 연결 후 권한이 있는 GA4 통계를 제공합니다. OAuth 클라이언트 설정과 권한·오류 대응은 [관리자 연결 안내](docs/dev/ga4-admin.md)를 따릅니다.

## 문서와 저장소

| 찾는 내용 | 시작할 위치 |
| --- | --- |
| 전체 문서·최신 변경·지난 기록 | [문서 안내](docs/README.md) |
| 화면·공통 로직·섹션별 구현 | [dev/web/src/](dev/web/src/) |
| 수집·검사·페이지 생성 | [dev/pipeline/](dev/pipeline/) |
| 자동 검사 | [dev/tests/](dev/tests/) |
| 디자인 토큰·삽화·공유 이미지 | [design/](design/) |
| 환경·브랜치·커밋·배포 규칙 | [개발·운영 환경](docs/dev/environments.md) · [브랜치 운영](docs/dev/branches.md) · [커밋 작성](docs/dev/commits.md) |

일반 코드는 `dev`의 정확한 SHA를 CI·보호된 미리보기에서 검토한 뒤 `main`·`deploy`로 승격합니다. 일일 자료는 `main` 기반 `daily`에서 별도로 준비해 데이터만 가져옵니다. 문서 변경은 문서별 목적과 커밋을 구분하며, 병합 방식은 해당 작업의 요청을 따릅니다.

## 한계와 다음 과제

- **자료 수집:** ECOS와 RSS 수집기를 갖췄지만 모든 지표가 API에 연결된 상태는 아닙니다. KOSIS·관세청·국회 수집은 후속 과제입니다.
- **자료의 성격:** ECOS 띠는 장중 시세가 아닌 최신 일별 확정값입니다. 본문을 읽지 못한 기사는 그 사실과 수집 한계를 남깁니다.
- **검사의 범위:** 형식·하위 필드·링크 형태·호 상태 검사가 원문의 진위와 계산 정확성까지 보증하지는 않습니다. 공개 이후에도 대조와 정정이 필요합니다.
- **측정:** GA4 코드·관리자 조회를 구현했습니다. 실제 이용 흐름을 검토해 독자 가설과 섹션 우선순위를 검증하는 일은 별도 과제입니다.
- **호스팅:** GitHub Pages에서 메타 CSP를 사용합니다. 응답 헤더가 필요한 보안 기능까지 설정한 것은 아닙니다. [적용 범위](docs/dev/changes-2026-11-03-layout.md#정적-페이지의-보안)

ECOS 키는 GitHub Secrets의 `ECOS_API_KEY`로 관리합니다. 키·토큰을 저장소에 넣지 않습니다.

## 이전 화면과 변경 기록

아래 이미지는 **2026.10.30 당시 운영 화면**입니다. 최신 배치·접기·슬라이드 동작은 위 설명과 [현재 디자인 기준](design/guide.md)을 따릅니다.

<table>
<tr><th>PC · 2026.10.30</th><th>모바일 · 2026.10.30</th></tr>
<tr><td><img src="docs/assets/service-desktop-20261030.jpg" alt="2026년 10월 30일 PC 운영 화면" width="760"></td><td><img src="docs/assets/service-mobile-20261030.jpg" alt="2026년 10월 30일 모바일 운영 화면" width="250"></td></tr>
</table>

[개발 환경·일일 발행 분리](docs/dev/changes-2026-11-04-preview.md) · [검색 도착 페이지·편집](docs/dev/changes-2026-11-04-seo.md) · [섹션·모바일 변경](docs/dev/changes-2026-11-03-sections.md) · [지면·이미지·보안 변경](docs/dev/changes-2026-11-03-layout.md) · [문장·테마 개선](docs/dev/changes-2026-11-03.md) · [2026.10.30 기록](docs/dev/changes-2026-10-30.md) · [Figma 설계 출발점](https://www.figma.com/design/Eep2qLjiPT9jhDUyLU8Zjx)

## 이용 조건

코드는 [MIT](LICENSE), 서비스에서 직접 작성한 글은 CC BY 4.0을 적용합니다. 기사·통계 등 원자료의 이용 조건은 각 권리자·기관을 따릅니다. Swiper의 라이선스와 원본은 [vendor 기록](dev/web/assets/vendor/swiper/README.md)에 보관합니다.
