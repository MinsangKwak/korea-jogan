# 대한민국 조간

**공식 통계로 읽는 오늘의 대한민국. 수치의 출처와 기준을 함께 보여 주는 비영리 데이터 신문입니다.**
매일 00시(한국 시간)에 전국·17개 시도 뉴스, 핵심 경제 숫자, 주력산업, 국가 재정을 한 화면에 모아 발행합니다. 기획부터 데이터 조사, 화면, 검사, 자동 발행, 배포까지 혼자 만들고 운영합니다.

### [▶ 대한민국 조간 바로가기](https://minsangkwak.github.io/korea-jogan/)

[서비스](https://minsangkwak.github.io/korea-jogan/) · [문서 안내](docs/README.md) · [서비스 기획](docs/portfolio/01-product.md) · [구조와 자동화](docs/portfolio/02-architecture.md) · [발행 데이터 형식](docs/DATA.md)

> 2026-10-19 기준으로 `main`·`dev`·`deploy`는 같은 커밋이며, 2026-10-19호 하나가 GitHub Pages에 배포돼 있습니다. 이 호의 `status`는 `prototype`(시안)입니다.

## 포트폴리오 — 두 장으로 읽기

| 순서 | 문서 | 확인할 내용 |
| --- | --- | --- |
| 01 | [서비스 기획](docs/portfolio/01-product.md) | 왜 만들었는지, 누구를 위한 화면인지, 무엇을 넣고 뺐는지 |
| 02 | [구조와 자동화](docs/portfolio/02-architecture.md) | 정적 사이트 구조, 검사 → 발행 → 배포 흐름, 기술 선택 이유 |

## 프로젝트 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 해결하려는 문제 | 정확한 수치 없이 '폭락', '최악' 같은 표현만 앞세우는 기사, 같은 사실이 기준점에 따라 다른 숫자로 보도되는 문제 |
| 주요 독자 | 20대부터 70대까지. 모바일로 아침에 한 번 훑어보는 독자를 기준으로 화면을 짰습니다 |
| 주요 기능 | 머리기사와 핵심 숫자, 전국 뉴스, 17개 시도 지도, 임기·선거·예산 D-Day, 주력산업·수출입, 국가채무 연도별 추이, 국민연금, 주제·키워드별 언론 보도 비교 |
| 화면 | 정적 HTML 한 장 · 바닐라 JavaScript(`'use strict'`) · CSS 변수 · 빌드 도구 없음 |
| 데이터 | 날짜별 JSON 한 개. 공식 발표 원문과 그 발표를 인용한 기사에서만 수치를 가져옵니다 |
| 검사·배포 | Python 검사 스크립트 · GitHub Actions · GitHub Pages(`deploy` 브랜치 전용) |
| 자동 발행 | Claude 예약 작업이 매일 00시에 조사 → 초안 JSON 작성 → 검사 → `dev` 커밋. 사람이 머리기사·핵심 숫자를 대조해 승인한 뒤 배포 |
| 운영 | 1인 운영, 비영리. 광고·회원 기능 없음 |

## 대표 구현과 근거

**문제 → 해결 방법 → 코드 근거** 순서로 정리했습니다.

| 문제 | 구현한 접근 | 확인할 근거 |
| --- | --- | --- |
| 출처 없는 숫자가 화면에 올라갈 수 있음 | 핵심 숫자마다 출처 기관과 `https` 원문 링크를 필수로 두고, 빠지면 배포를 멈춤. 기준일·발표일도 함께 표시 | [발행 전 검사](scripts/validate.py) · [배포 워크플로](.github/workflows/deploy-pages.yml) |
| 같은 사실이 기사마다 다른 숫자로 보도됨 | 주제별로 언론사 기사 링크를 모으고, 기준이 갈린 숫자(`diffs`)를 표로 나란히 표시 | [화면](public/index.html) · [데이터 형식](docs/DATA.md#themes) |
| 확정치·잠정치·전망치가 섞여 보임 | 출처 신뢰도 A~E 등급, 국가채무 막대에 결산·전망 구분, 금액을 확인하지 못한 해는 막대 대신 '미확인' 표시 | [화면 `renderFiscal`](public/index.html) |
| 기사 수가 많아 모바일에서 길어짐 | 전국 뉴스 접기·펼치기, 860px 이하에서 하단 분류 메뉴, 현재 섹션 표시(`aria-current`) | [화면 `setupNav`](public/index.html) |
| 20~70대 독자의 글자 크기 차이 | '가 글자 크게' 단추로 기준 글자 크기를 바꾸고 선택을 기기에 저장 | [화면 `setupBig`](public/index.html) |
| AI가 쓴 숫자가 그대로 나가면 틀린 데이터가 배포될 수 있음 | 자동 작업은 `draft`까지만 쓰고, 사람이 원문과 대조해 `approve.py`로 승인해야 `deploy` 검사(`--deploy`)를 통과 | [일일 발행 절차](docs/DAILY_RUNBOOK.md) · [승인](scripts/approve.py) · [발행 전 검사](scripts/validate.py) |
| 틀린 숫자를 고쳐도 독자가 알 수 없음 | 화면마다 GitHub 이슈 양식으로 이어지는 오류 신고, 바닥글의 정정 기록(`corrections.json`) | [정정 기록 형식](docs/DATA.md#correctionsjson) · [오류 신고 양식](.github/ISSUE_TEMPLATE/correction.yml) |
| 승인이 늦으면 어제 숫자를 오늘 숫자로 읽음 | 최신 호가 한국 시간 오늘이 아니면 맨 위에 미발행 띠, 제호 옆에 수집 시각 | [화면 `renderStale`](public/index.html) |
| 이 서비스만의 기능(갈린 숫자 비교)이 맨 아래에 묻힘 | 홈 머리기사 아래 '오늘 기준이 갈린 숫자' 카드, 언론 섹션을 두 번째로 | [화면 `renderSplits`](public/index.html) |
| 커밋 기록만으로 변경 흐름을 읽기 어려움 | `종류(범위): 제목` 규칙과 로컬 훅·PR 검사 | [커밋 규칙](docs/COMMITS.md) · [제목 검사](scripts/check_commit_msg.mjs) |

## 화면 구성

넓은 화면에서는 위쪽 분류 메뉴가 따라오고, 860px 이하에서는 하단 메뉴로 섹션을 옮겨 다닙니다. BBC·CNN 같은 뉴스 사이트의 배치를 참고했습니다.

| 메뉴 | 내용 |
| --- | --- |
| 홈 | 머리기사·요약·핵심 수치 3개, 오늘 꼭 볼 숫자, 오늘 기준이 갈린 숫자 카드 |
| 언론 | 주제·키워드 검색. 위에는 AI 요약과 기준이 갈린 숫자, 아래에는 언론사별 기사 제목과 링크만 |
| 전국 | 분야별 전국 뉴스(사회·사건·안전·날씨·재난·안보·외교·국제·과학·IT·생활·물가·문화·스포츠)와 흐름 요약 3줄 |
| 지역 | 17개 시도 타일 지도. 시도를 누르면 지역 언론 기사와 시도별 한 줄 요약 |
| 정치 | 대통령 임기 경과율, 선거·예산 처리기한 D-Day, 이번 주 일정. 정당 공방과 인물 평가는 넣지 않습니다 |
| 경제 | 증시·환율·유가 핵심 숫자. 상승·보합·하락 방향만 표시하고 좋고 나쁨을 평가하지 않습니다 |
| 산업 | 반도체 밖의 주력산업(철강·조선·자동차·석유화학·에너지)과 수출입 |
| 재정 | 국가채무 연도별 추이(결산·전망 구분), 월간 재정동향, 국민연금 자산 배분과 개혁 내용 |

바닥글에는 수집 한계, 출처 신뢰도, 지난 호 목록(`?d=YYYY-MM-DD`), RSS, 정정 기록과 오류 신고가 있습니다. 제호의 '공유' 단추는 지금 보는 호의 링크를 건넵니다.

2026-10-19호에는 전국 뉴스 22건, 시도 뉴스 49건, 언론 주제 3개(국내외 기사 42건), 국가채무 14개 연도를 담았습니다.

## 디렉터리

```text
korea-jogan/
├── public/                         GitHub Pages로 배포하는 정적 사이트. 이 폴더만 배포됩니다
│   ├── index.html                  화면 전체(HTML·CSS·JS 한 파일). 데이터는 아래 JSON에서 읽습니다
│   ├── og.png                      공유 미리보기 이미지(1200×630). scripts/og/에서 만듭니다
│   └── data/
│       ├── corrections.json        정정 기록
│       └── issues/                 날짜별 발행 데이터
│           ├── index.json          최신 호(latest)와 발행 목록(issues)
│           └── YYYY-MM-DD.json     그날 호. 형식은 docs/DATA.md
├── data/raw/                       공공 API 수집 원본(기관별). 지금은 ECOS 자리만 있습니다
├── scripts/
│   ├── validate.py                 발행 전 검사. --deploy면 승인 전 초안도 막습니다
│   ├── approve.py                  사람이 확인한 초안을 공개(published)로 바꿉니다
│   ├── build_feed.py               RSS(feed.xml). 배포할 때 만듭니다
│   ├── ecos_nums.py                ECOS 원본을 핵심 숫자(nums) 꼴로 바꿉니다
│   ├── og/                         공유 미리보기 카드(card.html)와 이미지 생성(build.mjs)
│   ├── tests/                      스크립트 시험(unittest)
│   ├── check_commit_msg.mjs        커밋 제목 검사(메시지 파일 또는 --range)
│   └── fetch_ecos.py               한국은행 ECOS 수집기(환율·기준금리·코스피·코스닥, ECOS_API_KEY 필요)
├── .githooks/
│   └── commit-msg                  로컬 커밋 제목 검사 훅
├── .github/workflows/
│   ├── check.yml                   dev·main push와 PR에서 데이터 검사·스크립트 시험, PR 커밋 제목 검사
│   ├── deploy-pages.yml            deploy push 시 배포 규칙까지 검사하고 RSS를 만든 뒤 GitHub Pages 배포
│   └── daily.yml                   ECOS 원본 수집(수동 실행)
├── docs/
│   ├── README.md                   문서 안내
│   ├── portfolio/
│   │   ├── 01-product.md           서비스 기획
│   │   └── 02-architecture.md      구조와 자동화
│   ├── DATA.md                     발행 JSON 형식과 검사 규칙
│   ├── DAILY_RUNBOOK.md            매일 00시 자동 발행 절차
│   ├── BRANCHES.md                 dev → main → deploy 흐름과 저장소 설정
│   └── COMMITS.md                  커밋 제목 규칙
├── LICENSE                         MIT
└── README.md
```

## 브랜치와 배포

```text
main ──(맞춤)──▶ dev ──(PR 병합)──▶ main ──(그대로 올림)──▶ deploy ──▶ GitHub Pages
```

| 브랜치 | 역할 |
| --- | --- |
| `dev` | 개발 중인 소스와 데이터. 모든 작업과 일일 발행이 여기서 시작합니다 |
| `main` | 검사를 통과한 최종본 |
| `deploy` | 배포 전용. 여기에 올라온 커밋만 GitHub Pages에 나갑니다 |

`main`과 `deploy`에는 직접 커밋하지 않습니다. 자세한 순서와 저장소 설정은 [docs/BRANCHES.md](docs/BRANCHES.md)에 있습니다. 커밋 제목은 [docs/COMMITS.md](docs/COMMITS.md)의 `종류(범위): 제목` 꼴을 따릅니다.

## 매일 발행

매일 00시(한국 시간) Claude 예약 작업이 [docs/DAILY_RUNBOOK.md](docs/DAILY_RUNBOOK.md) 절차대로 그날 호를 만듭니다.

1. 분야별 하위 에이전트가 공식 발표와 기사를 동시에 조사합니다(핵심 숫자 · 전국 · 지역 두 묶음 · 언론 주제).
2. 결과를 합쳐 `public/data/issues/YYYY-MM-DD.json`을 쓰고 `index.json`의 `latest`를 바꿉니다.
3. `status: "draft"`로 두고 `scripts/validate.py`를 통과하면 `data(issue): YYYY-MM-DD호 초안`으로 `dev`에 커밋합니다. 자동 작업은 여기서 멈춥니다.
4. 사람이 머리기사·핵심 숫자·갈린 숫자를 원문과 대조하고 `scripts/approve.py`로 승인합니다.
5. `main`과 `deploy`를 같은 커밋으로 빨리 감기합니다. `deploy-pages.yml`이 승인 여부까지 검사하고 RSS를 만든 뒤 배포합니다.

검사에 실패하면 올리지 않습니다. 재정·국민연금·수출입 같은 상설 지표는 새 공식 발표가 있을 때만 바꿉니다.

## 로컬에서 보기

`index.html`은 JSON을 `fetch`로 읽기 때문에 파일을 바로 열면 데이터가 비어 보입니다. 간단한 서버로 엽니다.

```bash
python3 -m http.server -d public 8000
# http://localhost:8000
```

데이터를 고친 뒤에는 검사를 돌리고, 커밋 제목 훅을 켜 둡니다.

```bash
python3 scripts/validate.py
python3 -m unittest discover -s scripts/tests
git config core.hooksPath .githooks
```

실행 기준은 CI와 같은 Python 3.12 · Node 22입니다.

## 데이터 원칙

- 숫자는 공식 발표 원문이나 그 발표를 인용한 기사에 있는 것만 씁니다. 기억이나 추측으로 채우지 않습니다.
- 잠정·확정·전망과 발표일·기준일·수집일을 구분합니다. 출처마다 신뢰도 등급(A 공식 확정 ~ E 분석·계산)을 붙입니다.
- 기사 본문을 읽지 못하고 검색 요약만 봤으면 그 사실을 데이터에 남깁니다(`read`·`body_read`).
- 기사 본문은 저장·재배포하지 않습니다. 제목·직접 쓴 짧은 요약·링크만 둡니다.
- 정부·정당·인물을 평가하지 않습니다.

## 알려진 한계

- 수집 환경에서 일부 국내외 매체(조선·중앙·동아·한겨레·매일경제·연합뉴스·KBS, FT·WSJ·NYT·BBC·Economist) 접속이 막힙니다. 다른 매체로 대체하고 그 사실을 화면 하단 '수집 방법과 한계'에 적습니다.
- 공공 API 수집기는 아직 ECOS 뼈대만 있습니다. 지금 수치는 공식 발표 원문과 기사를 조사해 채웁니다.
- 방문 측정(GoatCounter)은 주소를 넣어야 켜집니다. 지금은 꺼져 있습니다.
- `ECOS_API_KEY`를 아직 등록하지 않아 ECOS 수집기와 변환기는 시험 데이터로만 확인했습니다.

## 다음 단계

- [x] 화면과 발행 데이터 분리(JSON)
- [x] 전국·17개 시도 뉴스, 주제·키워드 검색
- [x] 검사 통과 시 자동 초안(매일 00시), 사람 승인 뒤 배포
- [x] 정정 기록과 오류 신고
- [x] 홈 '오늘 기준이 갈린 숫자', 미발행 표시
- [x] 지난 호 아카이브(`?d=`), RSS(`/feed.xml`), 공유 미리보기
- [x] `dev` → `main` → `deploy` 분리와 GitHub Pages 배포
- [ ] `ECOS_API_KEY` 등록, KOSIS·관세청·국회 수집기 추가
- [ ] GoatCounter 주소 등록, 1차 독자 가설 확정([서비스 기획](docs/portfolio/01-product.md#1차-독자-가설-확정-필요))

## 비밀 관리

API 키는 GitHub Secrets에만 둡니다. 페이지나 코드, 문서에 넣지 않습니다.

| Secret | 용도 |
| --- | --- |
| `ECOS_API_KEY` | 한국은행 ECOS |
| `KOSIS_API_KEY` | 통계청 KOSIS(예정) |
| `DATA_GO_KR_API_KEY` | 공공데이터포털(관세청·국회, 예정) |

## 라이선스

- 코드: [MIT](LICENSE)
- 이 서비스가 쓴 글: CC BY 4.0
- 원자료: 각 기관의 이용조건(공공누리 유형)을 따릅니다.
