# 기술 구조와 설계 판단

**정적 화면과 날짜별 JSON을 중심으로, 수집·검사·페이지 생성을 배포 전 작업으로 분리했습니다.** 상시 서버나 DB 없이 운영하며, 발행 단위와 확인 상태, 변경 이력을 Git 커밋으로 관리합니다. 아래에 각 구조를 선택한 이유와 한계, 변경할 때 함께 확인해야 할 코드 경로를 정리했습니다. 2026-11-09 저장소 기준입니다.

[문서 안내](../README.md) · [데이터 규격](../planning/data-spec.md) · [브랜치·환경·배포](branches.md) · [디자인 가이드](../../design/guide.md) · [런북](../planning/runbook.md)

## 전체 구조

| 영역 | 위치 | 책임 |
| --- | --- | --- |
| 정적 지면 | [dev/web/](../../dev/web/) | HTML·CSS·바닐라 JS, 원본 발행 데이터 |
| 공통 로직 | [src/core/](../../dev/web/src/core/) | 데이터 로딩(`data.js`)·서식·출처 UI(`ui.js`)·반응형 펼침·테마·측정(`metrics.js`)·주소(`seo.js`) |
| 섹션 렌더링 | [src/components/](../../dev/web/src/components/) | 헤더·탐색·전국·추적·언론·지역·정치·경제·산업·재정·바닥글. 모듈마다 첫 줄 주석이 책임을 적음 |
| 관리자 | [dev/web/admin/](../../dev/web/admin/) | 공개 발행 현황, Google OAuth로 GA4·검색 실적 조회 ([연결 안내](ga4-admin.md)) |
| 발행 데이터 | [dev/web/data/](../../dev/web/data/) | 호별 JSON·색인·추적·정정 |
| 수집 | [pipeline/collect/](../../dev/pipeline/collect/) | RSS 목록·ECOS 원자료 수집·변환 |
| 검사·공개 | [pipeline/publish/](../../dev/pipeline/publish/) | 형식·공개 조건 검사, 승인, 일일 데이터 선별, 공개 확인, 자동 승격, IndexNow |
| 생성 | [pipeline/build/](../../dev/pipeline/build/) | 토큰 CSS·호별 HTML·CSP 해시·RSS·사이트맵·고정 주소 페이지·`live.json`·`build-info.json`·개발 미리보기 |
| 자동 검사 | [dev/tests/](../../dev/tests/) | Python 시험과 Chromium 검사 6개 파일 |

[RSS 수집기](../../dev/pipeline/collect/fetch_rss.py)는 제목·링크·발행일을 모아 전날 날짜 범위로 거르고 URL 중복을 제거합니다. 피드별 실패 내역을 남기되, 다른 피드의 수집은 계속 진행합니다. [ECOS 수집기](../../dev/pipeline/collect/fetch_ecos.py)는 발행일 전날까지의 원자료와 수집 시각을 저장하고, HTTP 응답뿐 아니라 본문의 `RESULT` 오류도 확인합니다. 수집 자료를 기사·수치로 정리하는 과정과 JSON 형식·공개 조건을 검사하는 과정은 분리했습니다.

## 데이터 지도

화면·페이지 생성기·검사기는 `dev/web/data/` 아래 발행 JSON을 함께 읽습니다. 테마·큰 글자·추적 막대 숨김은 브라우저 저장소에서 관리하며 기사 JSON과 분리합니다. 아래 표에는 각 파일을 읽고 쓰는 코드의 관계를 정리했습니다. 필드별 정의는 [데이터 규격](../planning/data-spec.md)을 따릅니다.

| 파일 | 역할 | 쓰는 쪽 | 읽는 쪽 |
| --- | --- | --- | --- |
| `issues/YYYY-MM-DD.json` | 하루 한 호 | 00시 조사 초안, `approve.py` | 화면 전 섹션, `build_pages`·`build_feed`·`build_discovery`, 관리자, `validate.py` |
| `issues/index.json` | `{latest, issues[]}` | 조사, `prepare_daily.py` | `data.js`, 관리자, `build_*`, `verify_publication.py` |
| `trackers.json` | 장기 사안. 최신 호에서만 표시 | 조사(근거가 바뀐 날만, `updated` = 발행일) | `track.js`, `build_discovery`(`/topics/`), `validate.py` |
| `corrections.json` | 전체 호의 정정 이력 | 운영자 | `footer.js`, `validate.py` |
| `live.json` | ECOS 최신 일별 확정값. Git에 없음 | `build_live.py`(배포 시) | `economy.js` 숫자 띠 |
| `build-info.json` | 실제 배포 소스. Git에 없음 | `build_info.py`(배포 시) | `verify_publication.py`, 관리자, 복구 확인 |

호의 필드와 작성 조건은 [최상위 항목](../planning/data-spec.md#호의-최상위-항목)·[중첩 구조 검사](../planning/data-spec.md#중첩-구조와-최소-개수-검사), 공개 상태는 [status·review](../planning/data-spec.md#status--review)에서 관리합니다. 필드 변경 시 함께 확인할 코드는 아래 [변경 영향 범위](#변경-영향-범위)에 모았습니다.

## 설계 트레이드오프

| 선택 | 대안 | 얻은 것 | 치르는 비용 | 바뀔 조건 |
| --- | --- | --- | --- | --- |
| 정적 HTML + JSON (GitHub Pages) | 상시 서버·DB | 서버·DB 운영 없음, 발행 단위가 커밋으로 남음, 배포 SHA로 공개본 식별 | 응답 헤더 불가 → 메타 CSP만, HSTS·`frame-ancestors`·`nosniff` 미설정. 호가 쌓이면 색인 분할·전체 검색 재설계 | 로그인·댓글·전체 호 검색 요구 |
| 배포 전 Python 검사 | 브라우저 런타임 검증만 | 잘못된 데이터가 공개되기 전에 멈춤. 실패 로그가 파일·필드·현재 값을 지목 | 검사 규칙을 직접 유지. 필드 추가마다 validator·`assertIssue()`·회귀 검사 함께 갱신 | JSON Schema 등 도구 도입 시 규칙 이관 |
| 바닐라 JS, 전역 스크립트 | 프레임워크·번들러 | 빌드 환경 없음, 소스 그대로 디버깅, vendor는 Swiper 하나 | 스크립트 순서·전역 이름·의존성 갱신 수동 관리 | 컴포넌트 수·상태 공유가 늘어 전역 관리가 실수의 원인이 될 때 |
| 운영=Pages, 개발=보호된 Vercel | 한 호스팅에 환경 두 개 | 미완성 코드가 자동 발행에 섞이지 않음. 개발은 인증 뒤 | `deploy-pages.yml`과 `vercel.json`/`build_preview.py` 두 설정 유지. 개발·운영 SHA가 달라 승격 전 이력 통합 필요 | 운영에도 응답 헤더·인증이 필요할 때 |
| 06시 자동 발행 + `review.auto` | 사람 승인 전 공개 금지 | 사람이 없어도 매일 발행. 확인 여부를 숨기지 않음 | 자동 호는 사실 확인 전 공개 → 정정 절차 필수 | 검토 인력이 생기면 자동 경로를 보조로 |
| `daily/*`에서 데이터만 선별 반영 | 일일 브랜치 전체 병합 | 코드·과거 호·워크플로가 데이터 발행에 섞이지 않음 | `prepare_daily.py`의 허용 경로·색인·동시 변경 검사 유지 | — |

## 변경 영향 범위

### 호 JSON 필드를 추가·이름 변경·삭제할 때

| 지점 | 파일 | 무엇이 깨지나 |
| --- | --- | --- |
| 구조 검사 | `validate.py` `check_structure()`·`REQUIRED` | 새 필드를 안 넣으면 검사가 통과해도 화면이 비고, 이름을 바꾸면 모든 과거 호가 실패 |
| 시험 | `dev/tests/test_scripts.py`(기준 호 `2026-10-19.json` 복사·변형) | 기준 호에 필드가 없으면 시험 자체가 깨짐 |
| 브라우저 방어 | `core/data.js` `assertIssue()` | `themes[].id/articles/keywords/summary`·`date`를 바꾸면 전체 로딩 실패 화면 |
| 화면 | `lead.js`(`lead`,`briefs`,`themes`), `economy.js`(`nums`), `splits.js`·`media.js`(`themes`), `national.js`, `regions.js`, `politics.js`(`agenda`,`agendaSrc`), `industry.js`(`industries`,`items`,`trade`), `fiscal.js`(`debt`,`fiscal`,`nps`), `header.js`(`status`,`review`,`collectedAt`,`late`), `footer.js`(`limits`) | 해당 섹션만 깨지지만 `main.js`는 한 `try/catch`라 예외가 나면 **전체** 오류 화면 |
| 검색·RSS | `build_pages.py`(`lead`, `nums`, `themes[].diffs[].q`, `national.items[].cat`, `review`), `build_feed.py`(`lead`, `diffs.q`, `status`), `build_discovery.py`(`nums`, `review.scope`, `status`) | `/YYYY-MM-DD`, `feed.xml`, `/archive/`·`/topics/`·`/indicators/` |
| 관리자 | `admin/app.js`(`index.latest`, `status`, `review.by/at/auto`) | 공개 상태 표시 |
| 발행·검증 | `prepare_daily.py`(`index`, `status`, `trackers.updated/items`), `build_info.py`·`verify_publication.py`(`index.latest`, `status`, `date`) | 아침 발행 중단 또는 공개 확인 실패 |
| 문서 | `docs/planning/data-spec.md`, 이 문서 | 규격과 코드 불일치 |

### 그 밖의 변경

| 바꾸는 것 | 함께 봐야 하는 곳 |
| --- | --- |
| `index.html`·`admin/index.html`의 인라인 스크립트 | `build_security.py`가 배포 시 CSP 해시 재계산(수동 해시 유지 금지). `security.cjs` 통과 확인 |
| `trackers.json` 구조 | `validate.py check_trackers()`, `track.js`, `build_discovery.py`, `prepare_daily.py`의 `updated` 규칙 |
| 발행 시각·cron | `publish.yml` cron 5개, `validate.py` `COLLECT_DEADLINE`(06:00), 런북·AGENTS.md의 시각 서술, Codex 예약 |
| `design/tokens.json` | `build_tokens.py`로 CSS 재생성. CI `--check`가 불일치를 막음 |
| 허용 데이터 경로 | `prepare_daily.py`의 `permitted`와 `publish.yml`의 `git add` 목록 |
| 관리자 외부 연결(로그인·API) | `build_security.py` 허용 목록과 관리자 브라우저 검사 |

## 브라우저의 로딩과 오류 경계

배포용 HTML에는 공개된 호의 `issue-data`와 `issue-index`를 포함합니다. 브라우저는 내장 데이터를 우선 쓰고 없으면 색인과 날짜별 JSON을 요청합니다. 저장소 색인에는 초안이 포함될 수 있어 생성 페이지의 공개 목록과 구분합니다.

[main.js](../../dev/web/src/main.js)는 초기화와 섹션 렌더링을 같은 `try/catch`에서 처리하고, 모두 성공한 뒤에만 정적 검색 요약을 제거합니다. 초기화에 실패하면 기존 요약을 유지하고 재시도 화면을 표시합니다. 보조 데이터는 본문 준비 뒤에 읽습니다.

| 자원 | 실패·지연 시 |
| --- | --- |
| 호 본문 | 요청 12초 제한, 요약 보존·오류·재시도 |
| 메인 스크립트 | 20초 타이머가 지연 안내·정적 요약·재시도 표시 |
| 추적 데이터 | 영역 숨김, 본문 성공은 유지 |
| 정정 데이터 | 다시 확인 안내 |
| 최신 숫자 | 숫자 띠 숨김 |
| 외부 글꼴 | 비동기 적용, 기본 글꼴로 읽기 가능 |
| 경제 슬라이더 | 영역 800px 전 지연 로드, 실패·늦은 전환 시 전체 격자 유지 |

PC·모바일 배치, 펼침 기본값, 경제 순환, 테마·탐색 동작은 [디자인 가이드](../../design/guide.md)가 단일 기준입니다. 데이터 문자열은 [ui.js](../../dev/web/src/core/ui.js)의 `textContent`로 삽입합니다.

## 공개 본문·최신 숫자·관리자·검색의 구분

- 날짜별 조간은 발행 당시의 기록이고, `live.json`은 별도로 생성하는 ECOS 최신 일별 확정값입니다. 장중 시세가 아니며 수집 실패가 조간 배포를 막지 않습니다. 지난 호에서는 현재의 추적 상태와 숫자 띠를 숨깁니다. 갱신 시각과 배포 방식은 [워크플로 표](branches.md#워크플로와-실행-환경)를 따릅니다.
- `/admin/`의 공개 발행 상태와 권한 있는 계정의 GA4·검색 실적 조회를 구분합니다. OAuth 토큰은 메모리에서만 쓰며 브라우저가 Google API를 직접 호출합니다. 인증·조회 실패 처리는 [관리자 문서](ga4-admin.md), 개발 환경의 읽기 전용 범위는 [개발 미리보기](branches.md#개발-미리보기-vercel)에 있습니다.
- [build_pages.py](../../dev/pipeline/build/build_pages.py)는 최신 호와 `/YYYY-MM-DD`에 제목·설명·canonical·요약·구조화 데이터를 만들고, [index.html](../../dev/web/index.html)의 초기 스크립트는 기존 `?d=` 주소를 호별 주소로 옮깁니다. [build_security.py](../../dev/pipeline/build/build_security.py)는 실제 인라인 실행 코드의 해시로 메타 CSP를 생성합니다. [IndexNow 알림](../../dev/pipeline/publish/indexnow.py)의 실패는 배포를 중단하지 않습니다. 검색 도착 페이지·RSS·사이트맵의 운영 기준은 [검색·재방문 문서](../planning/growth.md)에 있습니다.

## 검사 범위 (2026-11-09 기준)

| 검사 | 범위 | 명령 |
| --- | --- | --- |
| 데이터·배포 규칙 | 색인의 모든 호 + `corrections.json` + `trackers.json`: 필수값·하위 구조·허용 상태·링크 형식·수치 범위·미확정 기간 모순. `--deploy`는 초안 차단 | `python3 dev/pipeline/publish/validate.py [--deploy]` |
| 토큰 | `design/tokens.json` ↔ `tokens.css` | `python3 dev/pipeline/build/build_tokens.py --check` |
| Python | `dev/tests/test_*.py` 14개 파일, 166개 | `python3 -m unittest discover -s dev/tests` |
| 브라우저 | 공개 지면(최신·지난 호·로딩·오류·탐색·반응형·슬라이드), 관리자(모의 인증·API), CSP(허용·차단), 검색 페이지, 개발 미리보기, 일일 후보 — 6개 파일, 엔진 1개 | `cd dev/tests/browser && npm ci && npx playwright install chromium && npm test` |
| 커밋 제목 | 종류·범위·72자·마침표 | `node dev/tools/check_commit_msg.mjs --range origin/main..HEAD` |

2026-11-09 기준 커밋 `e0ab6c7`의 [통합 검사](https://github.com/MinsangKwak/korea-jogan/actions/runs/42578253130)에서 위 데이터·Python·브라우저 검사가 통과했습니다. 당시 색인은 22개 호(`published` 21개·`prototype` 1개)이며, 검사 수와 호 수는 해당 커밋의 값입니다.

형식 검사와 링크 확인만으로는 원문의 진위, 실제 접속 가능 여부, 계산 정확성이나 지역별 기사 수까지 보장할 수 없습니다. 날짜별 검증 이력은 [변경 기록](changelog.md)에 보존합니다.
