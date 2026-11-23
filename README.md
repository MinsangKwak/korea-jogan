# 대한민국 조간

**뉴스에서 생긴 질문을 기사·판결문·법령 원문까지 따라가며 읽는 광고 없는 데이터 신문입니다.** 예를 들어 ‘파기환송이 무슨 뜻인가요?’로 들어온 독자는 한 줄 설명을 읽고, 실제 판결 주문에서 어느 법원이 다음 재판을 맡는지 확인할 수 있습니다.

**곽민상 · 1인 기획·UI 설계·프론트엔드 개발·운영**

HTML·CSS·바닐라 JavaScript로 접근 가능한 지면을 만들고, Python·SQLite로 전국·지역 기사를 정제해 제공합니다.

[운영 서비스](https://korea-jogan.com/) · [파기환송 직접 읽기](https://korea-jogan.com/politics/reversal-and-remand/) · [Notion 프로젝트 소개](https://app.notion.com/p/3ffcbbdd109b8167a28dd65769e55676)

## 기술 스택과 코드 위치

| 폴더 | 기술 | 확인할 구현 |
| --- | --- | --- |
| [frontend-vanilla-js/](frontend-vanilla-js/) | HTML · CSS · 바닐라 JavaScript | 키보드로 조작하는 [판례 검색](frontend-vanilla-js/law/)과 [날짜별 기사 찾기](frontend-vanilla-js/src/components/national/edition-search.js), 글자 확대·동작 줄이기를 지원하는 지면 컴포넌트 |
| [backend-python/](backend-python/) | Python · SQLite | [기사 저장소와 읽기 API](backend-python/README.md). 기사 정정 시 같은 ID로 내용을 갱신하고, 호 날짜·보도일·원문을 함께 저장 |
| [tests/](tests/) · [GitHub Actions](.github/workflows/) | unittest · Playwright · GitHub Actions | 지난 호·키보드 조작 검사, API와 지면 대조, 검증한 커밋의 배포 |

**기사 한 건이 독자에게 도달하는 과정**

발행 목록에 오른 [호별 지면 원본](frontend-vanilla-js/data/issues/)에서 전국·지역 기사를 뽑아 SQLite에 저장합니다. 같은 데이터로 날짜별·기사별 JSON을 만들어 지면과 함께 배포합니다. 독자가 ‘날짜별 기사 찾기’를 열면 선택한 날짜의 자료를 읽어 제목·언론사·지역으로 검색합니다. [기사 찾기](https://korea-jogan.com/#editionSearch) · [공개 API](https://korea-jogan.com/api/v1/index.json)

## 대표 구현 세 가지

| 독자가 겪는 상황 | 설계·구현한 내용 | 확인할 자료 |
| --- | --- | --- |
| 판례의 정식 명칭을 몰라 같은 내용을 다시 검색해야 합니다. | ‘전세금’과 ‘임대차보증금’처럼 생활어와 법률 용어를 연결했습니다. 결과에 사건번호·선고일을 표시하고 해당 판결문을 바로 엽니다. | [전세보증금 사례](https://korea-jogan.com/law/?issue=rental-deposit) · [검색 규칙](frontend-vanilla-js/law/search-core.js) |
| 키보드로 판결문 문제를 풀 때 어떤 답을 선택했고 다음에 무엇을 할 수 있는지 알아야 합니다. | 라디오 버튼으로 답을 선택하고, 선택 없이 확인하면 첫 선택지로 포커스를 보냅니다. 결과는 보조기기에 알리고, 자바스크립트를 꺼도 해설과 원문을 열 수 있게 했습니다. | [문제 컴포넌트](frontend-vanilla-js/src/components/question-recall/recall.js) · [키보드 회귀 검사](tests/browser/question-recall.cjs) |
| 나중에 갱신한 내용을 오래된 기사에 붙이면 당시 독자가 알았던 사실이 달라집니다. | 질문의 마지막 확인일과 사건의 실제 변경일을 분리했습니다. 날짜별 호를 생성할 때 그날까지 확인한 질문만 싣고, 각 질문의 고정 주소에 답과 출처를 함께 넣었습니다. | [호별 페이지 생성](backend-python/pipeline/build/build_politics.py) · [날짜 경계 검사](tests/pipeline/test_politics_build.py) |

검색 규칙, 질문 본문, 답을 확인하는 동작을 분리해 편집 데이터와 UI를 독립적으로 바꿀 수 있습니다. 대표 질문과 답 옆에 새벽 삽화를 두고, 모바일에서는 답과 근거 링크를 읽은 뒤 풍경과 관련 질문으로 넘어갑니다. [기술 구조](docs/dev/architecture.md) · [화면·접근성 설계](docs/design/guide.md) · [Figma](https://www.figma.com/design/Eep2qLjiPT9jhDUyLU8Zjx)

[PC·모바일에서 현재 1면 열기](https://korea-jogan.com/) · [이슈 추적 카드 보기](https://korea-jogan.com/#track)

<details>
<summary>11월 23일 운영 1면 캡처 보기</summary>

![11월 23일 PC 1면. 재판 기일에 관한 질문과 답 옆에 새벽 삽화가 있고 그 아래에 생활 정책과 시사용어가 이어진다](docs/assets/current-home-desktop.webp)

</details>

## 기획부터 운영까지

- **기사와 판례를 어떻게 연결했나.** 같은 쟁점을 다룬 보도와 과거 판결을 한 지면에 놓고 각각의 날짜·사건번호·원문을 표시했습니다. 입법 캘린더는 제안·공포·시행을 나눠 보여 줍니다. [기사와 판례](https://korea-jogan.com/#caseEdition) · [입법 캘린더](https://korea-jogan.com/law/calendar/) · [수록 범위](docs/planning/law-data.md)
- **AI를 어디에 사용했나.** 조사·초안·삽화 제작에 활용했습니다. 자동 검사를 통과한 호와 사람이 원문을 대조한 호를 지면에서 구별하고, 공개 뒤 발견한 오류는 변경 전후와 이유를 기록합니다. [편집 기준](docs/planning/editorial.md) · [정정 기록](https://korea-jogan.com/#fixH)
- **발행 성공을 어떻게 확인하나.** 운영 도메인에서 해당 호가 열리고, 공개된 빌드의 커밋이 배포 대상으로 지정한 커밋과 일치하는지 확인합니다. [공개 빌드 기록](https://korea-jogan.com/build-info.json) · [발행·복구 절차](docs/planning/runbook.md)
- **첫 독자를 어떻게 찾을 것인가.** 첫 4주간 외부 방문자 100명을 목표로 삼았습니다. 질문별로 검색 노출·클릭과 원문 열람을 살펴봅니다. 방문자와 반복 가능한 클릭 횟수는 별도로 집계합니다. [독자 유입 검증 계획](docs/planning/growth.md) · [관리자 화면](https://korea-jogan.com/admin/)

## 로컬 실행과 검증

Python 3.12와 Node.js 22를 사용합니다. 질문 상세·지난 호까지 보려면 저장소 루트에서 미리보기를 빌드한 뒤 `http://localhost:8001`을 엽니다.

```bash
python3 backend-python/pipeline/build/build_preview.py
python3 -m http.server -d dist-preview 8001
```

<details>
<summary>데이터·디자인 토큰·브라우저 검사 명령</summary>

```bash
python3 backend-python/pipeline/publish/validate.py
python3 backend-python/pipeline/build/build_tokens.py --check
python3 -m unittest discover -s tests
python3 -m unittest discover -s backend-python/tests
cd tests/browser && npm ci && npx playwright install chromium && npm test
```

ECOS 키는 GitHub Secrets에서 관리합니다. GA4·Search Console 실적 조회에는 해당 속성의 읽기 권한이 필요합니다. [관리자 연결 안내](docs/dev/ga4-admin.md)

</details>

<details>
<summary>자료의 수록 범위</summary>

일부 지표는 수동으로 조사합니다. 2026년 9월 24일 이후 보완한 법률안은 의원발의 자료여서 일부 정부·위원장 제안이 빠질 수 있습니다. 판례 보관함은 이용 중인 브라우저에 저장됩니다. GitHub Pages에서는 응답 헤더로만 설정할 수 있는 보안 기능에 제약이 있습니다. [데이터 규격](docs/planning/data-spec.md) · [기술 구조](docs/dev/architecture.md)

</details>

[전체 문서 안내](docs/README.md) · [통합 기획·편집 기준](https://app.notion.com/p/3decbbdd109b812e8a90f88de1c66a33) · [검증·운영 기록](https://app.notion.com/p/40ecbbdd109b8192be79d2ad87e1b95d)

코드는 [MIT](LICENSE), 직접 작성한 글은 CC BY 4.0입니다. 기사·통계 등 원자료의 이용 조건은 각 권리자·기관을 따릅니다.
