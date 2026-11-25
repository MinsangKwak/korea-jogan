# 기술 구조와 설계 판단

Python이 발행 전에 신문과 정치 질문을 HTML로 만듭니다. 독자는 페이지가 열리자마자 본문과 출처를 읽고, 바닐라 JavaScript로 판례를 검색하거나 판결문 읽기 문제를 풀 수 있습니다. 공개 지면은 GitHub Pages에서 제공합니다.

## 전체 구조

### 화면에서 코드까지

| 독자가 하는 일 | 구현에서 내린 결정 | 구현과 검증 |
| --- | --- | --- |
| 검색 결과에서 정치 질문의 근거 확인하기 | 질문마다 고정 주소를 부여합니다. 질문·한 줄 답·확인일·근거 원문을 HTML에 담아 첫 화면에서 바로 읽을 수 있습니다. | [질문 생성기](../../../backend-python/pipeline/build/build_politics.py) · [질문 페이지 생성 검사](../../tests/pipeline/test_politics_build.py) |
| 1면에 사건번호를 입력해 판결문 찾기 | 검색어를 같은 탭의 판례면에 한 번 전달하고 판례면이 읽은 직후 삭제합니다. 브라우저 검사로 검색어가 주소·요청·분석 이벤트에도 남지 않는지 확인합니다. | [1면 검색](../../../frontend-vanilla-js/src/components/news-case/edition.js) · [판례면](../../../frontend-vanilla-js/law/desk.js) · [독자 동선 검사](../../tests/browser/law.cjs) |
| 파기환송 판결문을 읽고 다음 재판을 맡을 법원 고르기 | 자바스크립트를 꺼도 해설과 판결문을 열 수 있게 했습니다. 선택 없이 확인하면 첫 선택지로 포커스를 옮기고 상태 메시지로 안내합니다. | [문제 마크업](../../../backend-python/pipeline/build/question_recall.py) · [응답 처리](../../../frontend-vanilla-js/src/components/question-recall/recall.js) · [키보드·스크립트 비활성 검사](../../tests/browser/question-recall.cjs) |

### 코드의 책임

| 영역 | 위치 | 역할 |
| --- | --- | --- |
| 독자 화면 | [공통 UI·로딩](../../../frontend-vanilla-js/src/core/) · [지면 컴포넌트](../../../frontend-vanilla-js/src/components/) | 날짜·출처·테마 등 공통 동작을 섹션별 기사 렌더링과 분리 |
| 법률 자료실 | [판례 검색·보관·비교](../../../frontend-vanilla-js/law/) · [입법 캘린더](../../../frontend-vanilla-js/law/calendar/) | 독자가 연 화면에 필요한 수록본을 읽어 브라우저에서 검색 |
| 관리자 | [관리자 화면](../../../frontend-vanilla-js/admin/) · [운영 문서](ga4-admin.md) | 발행·법률 파일 상태 표시, Google 권한을 연결하면 GA4·검색 실적 조회 |
| 기사 저장·조회 | [백엔드 API](article-api.md) · [독자 검색 컴포넌트](../../../frontend-vanilla-js/src/components/national/edition-search.js) | 발행일과 원문 보도일을 분리해 SQLite에 기록하고, 지면과 함께 배포한 JSON을 날짜별 검색에 사용 |
| 수집 | [RSS·ECOS](../../../backend-python/pipeline/collect/) · [판례·입법](../../../backend-python/pipeline/law/) | RSS 중복 제거·피드별 실패 기록, ECOS 본문 오류 확인, 법률 수록본과 검수 목록 생성 |
| 생성·발행 | [빌드](../../../backend-python/pipeline/build/) · [검사와 발행](../../../backend-python/pipeline/publish/) | 호별 HTML·RSS·사이트맵 생성, 일일 데이터 선별, 배포 뒤 공개된 호와 소스 버전 대조 |

## 데이터 지도

[발행 JSON](../../../frontend-vanilla-js/data/)을 화면·페이지 생성기·검사기가 함께 읽습니다. 테마·글자 크기 등 독자의 설정은 브라우저에 저장합니다. [필드별 규격](../planning/data-spec.md)

| 파일 | 역할 | 쓰는 쪽 | 읽는 쪽 |
| --- | --- | --- | --- |
| `issues/YYYY-MM-DD.json` | 하루 한 호 | 00시 조사 초안, `approve.py` | 화면 전 섹션, `build_pages`·`build_feed`·`build_discovery`, 관리자, `validate.py` |
| `issues/index.json` | `{latest, issues[]}` | 조사, `prepare_daily.py` | `data.js`, 관리자, `build_*`, `verify_publication.py` |
| `trackers.json` | 장기 사안. 최신 호에서만 표시 | 조사 및 편집 | `track.js`, `build_change_strip`, `build_discovery`(`/topics/`), `validate.py` |
| `political-questions.json` | 질문·답·근거·확인일과 실제 변경일 | 편집자가 근거와 다음 확인 사항 기록 | `build_politics.py`, 1면·질문별 고정 페이지 |
| `news-case-pairs.json` | 보도와 관련 선례의 출처·사건번호·연결 설명 | 편집자가 [선정 기준](../planning/law-data.md#기사와-판례-선정-기록)에 따라 기록 | 호별 정적 지면 생성기·1면 컴포넌트 |
| `corrections.json` | 전체 호의 정정 이력 | 운영자 | `footer.js`, `validate.py` |
| `live.json` | ECOS 최신 일별 확정값. Git에 없음 | `build_live.py`(배포 시) | `economy.js` 숫자 띠 |
| `build-info.json` | 실제 배포 소스. Git에 없음 | `build_info.py`(배포 시) | `verify_publication.py`, 관리자, 복구 확인 |

[법률 수록본](../../../frontend-vanilla-js/law/data/)은 판례면을 열 때 불러옵니다. 판례 보관함은 선택한 식별번호와 분야를 현재 도메인의 브라우저 저장소에 보관하고, 판결 내용은 해당 분야 파일에서 다시 읽습니다. [보관함 구현](../../../frontend-vanilla-js/law/library.js) · [자료의 범위와 갱신 방법](../planning/law-data.md)

## 설계 트레이드오프

| 선택 | 선택 이유 | 유지 비용과 한계 |
| --- | --- | --- |
| GitHub Pages의 정적 HTML과 JSON | 지면에 올린 각 호의 내용과 공개 버전을 Git 이력으로 대조할 수 있습니다. | Pages에서 사용자 지정 응답 헤더를 설정할 수 없어 CSP는 HTML 메타 태그에 둡니다. |
| 호별 JSON을 배포 전에 검사 | 필수값이나 공개 상태에 오류가 있으면 해당 호와 필드를 식별할 수 있습니다. | 필드를 바꾸면 Python 검사와 브라우저의 `assertIssue()`를 함께 갱신하고 발행된 모든 호를 검사합니다. |
| 바닐라 JS와 지면별 컴포넌트 | 판례 검색·보관·렌더링은 ES 모듈로 나눠 각각 검사합니다. | 신문 쪽 공통 스크립트의 실행 순서와 전역 의존성은 직접 관리합니다. |
| PR 검사와 운영 배포 | PR에서 `verify-ci`를 확인하고 `main`에 병합합니다. Pages는 배포할 커밋의 검사와 공개본 확인을 거칩니다. 보호된 Vercel 미리보기는 화면을 미리 봐야 할 때만 `dev/` 브랜치로 붙입니다. | 미리보기와 Pages의 빌드 설정을 함께 유지합니다. [현재 배포 절차](branches.md) |
| 06시 자동 발행 | 매일 같은 시각에 발행을 시작하고 호마다 자동 발행 또는 편집자 확인 상태를 표시합니다. | 자동 호는 발행 뒤 원문 대조와 정정이 필요합니다. [운영 런북](../planning/runbook.md) |
| 일일 브랜치에서 데이터만 반영 | 아침 호를 발행할 때 지정된 호와 색인 등 허용한 자료만 갱신합니다. | 발행 허용 경로·색인·동시 변경 검사 규칙을 유지합니다. |

## 변경 영향 범위

### 호 JSON 필드를 추가·이름 변경·삭제할 때

| 지점 | 파일 | 무엇이 깨지나 |
| --- | --- | --- |
| 구조 검사 | `validate.py` `check_structure()`·`REQUIRED` | 필수값 누락을 검사하고, 필드명 변경 시 전체 공개 자료의 호환성을 확인 |
| 시험 | `project/tests/pipeline/test_scripts.py`(호별 JSON을 복제한 시험 자료) | 기준 호에 필드가 없으면 시험 자체가 깨짐 |
| 브라우저 방어 | `core/data.js` `assertIssue()` | `themes[].id/articles/keywords/summary`·`date`를 바꾸면 전체 로딩 실패 화면 |
| 화면 | `lead.js`(`lead`,`briefs`,`themes`), `economy.js`(`nums`), `splits.js`·`media.js`(`themes`), `national.js`, `regions.js`, `politics.js`(`agenda`,`agendaSrc`), `industry.js`(`industries`,`items`,`trade`), `fiscal.js`(`debt`,`fiscal`,`nps`), `header.js`(`status`,`review`,`collectedAt`,`late`), `footer.js`(`limits`) | 해당 섹션만 깨지지만 `main.js`는 한 `try/catch`라 예외가 나면 **전체** 오류 화면 |
| 검색·RSS | `build_pages.py`(`lead`, `nums`, `themes[].diffs[].q`, `national.items[].cat`, `review`), `build_feed.py`(`lead`, `diffs.q`, `status`), `build_discovery.py`(`nums`, `review.scope`, `status`) | `/YYYY-MM-DD`, `feed.xml`, `/archive/`·`/topics/`·`/indicators/` |
| 관리자 | `admin/app.js`(`index.latest`, `status`, `review.by/at/auto`) | 공개 상태 표시 |
| 발행·검증 | `prepare_daily.py`(`index`, `status`, `trackers.updated/items`), `build_info.py`·`verify_publication.py`(`index.latest`, `status`, `date`) | 아침 발행 중단 또는 공개 확인 실패 |
| 문서 | `project/docs/planning/data-spec.md`, 이 문서 | 규격과 코드 불일치 |

### 그 밖의 변경

| 바꾸는 것 | 함께 봐야 하는 곳 |
| --- | --- |
| `index.html`·`admin/index.html`의 인라인 스크립트 | `build_security.py`가 배포 시 CSP 해시 재계산(수동 해시 유지 금지). `security.cjs` 통과 확인 |
| `trackers.json` 구조 | `validate.py check_trackers()`, `track.js`, `build_discovery.py`, `prepare_daily.py`의 `updated` 규칙 |
| 발행 시각·cron | `publish.yml` cron 5개, `validate.py` `COLLECT_DEADLINE`(06:00), 런북·AGENTS.md의 시각 서술, Codex 예약 |
| `frontend-vanilla-js/src/styles/tokens.json` | `build_tokens.py`로 CSS 재생성. CI `--check`가 불일치를 막음 |
| 허용 데이터 경로 | `prepare_daily.py`의 `permitted`와 `publish.yml`의 `git add` 목록 |
| 관리자 외부 연결(로그인·API) | `build_security.py` 허용 목록과 관리자 브라우저 검사 |
| 판례·입법 원자료나 집계 변경 | [자료 갱신 절차](../planning/law-data.md), 검색·캘린더의 중복 제거 기준, 검수 목록과 [관리자 검사](ga4-admin.md#판례-자료의-건수와-무결성) |

## 브라우저의 로딩과 오류 경계

배포용 HTML에는 공개된 호의 `issue-data`와 `issue-index`를 포함합니다. 브라우저는 내장 데이터를 우선 쓰고 없으면 색인과 날짜별 JSON을 요청합니다. 저장소 색인에는 초안이 포함될 수 있어 생성 페이지의 공개 목록과 구분합니다.

[main.js](../../../frontend-vanilla-js/src/main.js)는 초기화와 섹션 렌더링을 같은 `try/catch`에서 처리하고, 모두 성공한 뒤에만 정적 검색 요약을 제거합니다. 초기화에 실패하면 기존 요약을 유지하고 재시도 화면을 표시합니다. 보조 데이터는 본문 준비 뒤에 읽습니다.

| 자원 | 실패·지연 시 |
| --- | --- |
| 호 본문 | 요청 12초 제한, 요약 보존·오류·재시도 |
| 메인 스크립트 | 20초 타이머가 지연 안내·정적 요약·재시도 표시 |
| 추적 데이터 | 상세 추적 영역은 숨김. 최신 호 HTML에 담긴 최근 변화 카드와 나머지 본문은 유지 |
| 입법 캘린더 | 의안·공포 법률·관보 예고 중 읽은 자료는 표시하고, 읽지 못한 자료원을 안내. [자료원별 로딩](../../../frontend-vanilla-js/law/calendar/records.js) |
| 정정 데이터 | 다시 확인 안내 |
| 최신 숫자 | 숫자 띠 숨김 |
| 지면 글꼴 | 기기에 설치된 한글 명조·고딕을 먼저 사용하고 한글 글리프가 없으면 같은 출처의 WOFF2를 불러옴 |
| 지면 CSS·JS | 홈·날짜별 조간의 CSS와 실행 순서가 같은 스크립트를 배포 시 묶고, 내용 해시를 URL에 붙입니다. 새 코드와 기존 캐시를 구분하며 같은 파일은 다음 호에서도 재사용합니다. |
| 경제 슬라이더 | 영역 800px 전 지연 로드, 실패·늦은 전환 시 전체 격자 유지 |

배치·테마·탐색 동작은 [디자인 가이드](../design/guide.md)에 정리했습니다. 동적으로 그리는 신문 본문의 문자열은 공통 UI 함수에서 `textContent`로 삽입합니다. [UI 함수](../../../frontend-vanilla-js/src/core/ui.js)

## 공개 본문·최신 숫자·관리자·검색의 구분

- 날짜별 조간은 발행 당시의 기록이고, `live.json`은 별도로 생성하는 ECOS 최신 일별 확정값입니다. 장중 시세가 아니며 수집 실패가 조간 배포를 막지 않습니다. 지난 호에서는 현재의 추적 상태와 숫자 띠를 숨깁니다. 갱신 시각과 배포 방식은 [워크플로 표](branches.md#워크플로와-실행-환경)를 따릅니다.
- `/admin/`에서 공개 발행 상태와 법률 수록 파일을 확인할 수 있습니다. GA4·검색 실적은 권한 있는 계정이 별도로 연결합니다. OAuth 토큰은 메모리에서만 쓰며 브라우저가 Google API를 직접 호출합니다. 인증·조회 실패 처리는 [관리자 문서](ga4-admin.md), 개발 환경의 읽기 전용 범위는 [개발 미리보기](branches.md#개발-미리보기-vercel)에 있습니다.
- [build_pages.py](../../../backend-python/pipeline/build/build_pages.py)는 최신 호와 `/YYYY-MM-DD`에 제목·설명·canonical·요약·구조화 데이터를 만들고, [index.html](../../../frontend-vanilla-js/index.html)의 날짜 탐색은 호별 주소를 사용합니다. [build_security.py](../../../backend-python/pipeline/build/build_security.py)는 실제 인라인 실행 코드의 해시로 메타 CSP를 생성합니다. [IndexNow 알림](../../../backend-python/pipeline/publish/indexnow.py)의 실패는 배포를 중단하지 않습니다. 검색 도착 페이지·RSS·사이트맵의 운영 기준은 [검색·재방문 문서](../planning/growth.md)에 있습니다.

## 검사 범위

[CI 검사 정의](../../../.github/actions/verify/action.yml)에서 Python 3.12와 Node.js 22를 사용합니다. 아래 명령은 저장소 루트 기준입니다.

| 확인할 항목 | 검사 범위 | 명령 |
| --- | --- | --- |
| 발행 자료 | 호별 필수값, 상태, 링크 형식과 수치의 일관성. 배포 검사에서는 초안도 걸러냅니다. | `python3 backend-python/pipeline/publish/validate.py --deploy` |
| 디자인 토큰 | 원본 JSON과 생성된 CSS의 일치 | `python3 backend-python/pipeline/build/build_tokens.py --check` |
| 생성기·발행기 | 질문별 페이지, 호별 HTML, 발행 자료 선별과 공개본 검증 | `python3 -m unittest discover -s project/tests` |
| 독자·관리자 화면 | Chromium에서 판례 검색, 키보드 조작, 지면 로딩·오류, 관리자 권한별 상태와 미리보기 확인 | `cd project/tests/browser && npm ci && npx playwright install chromium && npm test` |
| PR 커밋 제목 | 종류·범위·길이·문장부호 | `node project/tools/check_commit_msg.mjs --range origin/main..HEAD` |

판결문과 보도 원문의 사실관계, 인용 수치의 계산 과정은 편집자가 직접 대조합니다. [편집 기준](../planning/editorial.md)
