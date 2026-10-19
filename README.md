# 대한민국 조간

공식 통계로 읽는 오늘의 대한민국. 수치의 출처와 기준을 함께 보여 주는 비영리 데이터 신문입니다.

## 왜 만드나

많은 기사가 정확한 수치 없이 '폭락', '최악' 같은 표현만 앞세웁니다. 같은 사실도 기준점에 따라 다른 숫자가 됩니다. 이 서비스는 공식 수치와 그 출처·기준을 나란히 보여 주고, 판단은 독자에게 맡깁니다.

- 숫자는 공식 원문이 있는 것만 씁니다. LLM이 숫자를 만들지 않습니다.
- 잠정·확정·전망, 발표일·기준일·수집일을 구분합니다.
- 정부·정당·인물을 평가하지 않습니다. 지표는 상승·보합·하락으로만 표시합니다.
- 검증에 실패한 데이터는 발행하지 않습니다.

## 화면 구성

| 메뉴 | 내용 |
| --- | --- |
| 오늘 | 오늘의 한 줄 |
| 정치 | 대통령 임기, 선거·예산 처리기한 D-Day |
| 경제 | 증시·환율·유가 핵심 숫자 |
| 산업 | 반도체 밖의 주력산업(철강·조선·자동차·석유화학·에너지)과 수출입 |
| 재정 | 국가채무 연도별 추이, 국민연금 기금 운용 |
| 언론 | 한 주제를 국내외 언론 20곳이 어떻게 썼는지 수치·표현·해석 비교 |

## 구조

```text
public/                  GitHub Pages로 배포하는 정적 사이트
  index.html             화면. 데이터는 아래 JSON에서 읽는다
  data/issues/           날짜별 발행 데이터
    index.json           latest와 발행 목록
    YYYY-MM-DD.json
data/raw/                수집 원본(기관별)
scripts/
  fetch_ecos.py          한국은행 ECOS 수집
  validate.py            발행 전 검사(출처 누락, 값 범위, 날짜 등)
.github/workflows/
  check.yml              dev·main push와 PR에서 데이터·커밋 제목 검사
  deploy-pages.yml       deploy에 push하면 검사 후 배포
  daily.yml              한국은행 ECOS 원본 수집(수동 실행)
docs/
  BRANCHES.md            dev → main → deploy 흐름
  COMMITS.md             커밋 제목 규칙
  DAILY_RUNBOOK.md       매일 00시 자동 발행 절차
```

브랜치는 `dev`(개발) → `main`(최종본) → `deploy`(배포 전용) 한 방향으로 흐릅니다. 자세한 규칙은 [docs/BRANCHES.md](docs/BRANCHES.md)에 있습니다. 커밋 제목은 [docs/COMMITS.md](docs/COMMITS.md)를 따르고, 로컬에서 `git config core.hooksPath .githooks`로 검사 훅을 켤 수 있습니다.

## 로컬에서 보기

`index.html`은 JSON을 `fetch`로 읽기 때문에 파일을 바로 열면 데이터가 비어 보입니다. 간단한 서버로 엽니다.

```bash
python3 -m http.server -d public 8000
# http://localhost:8000
```

발행 데이터를 고친 뒤에는 검사를 돌립니다.

```bash
python3 scripts/validate.py
```

## 비밀 관리

API 키는 GitHub Secrets에만 둡니다. 페이지나 코드에 넣지 않습니다.

| Secret | 용도 |
| --- | --- |
| `ECOS_API_KEY` | 한국은행 ECOS |
| `KOSIS_API_KEY` | 통계청 KOSIS(예정) |
| `DATA_GO_KR_API_KEY` | 공공데이터포털(관세청·국회, 예정) |

## 현재 상태와 다음 단계

지금은 2026-10-19자 시안 호 하나만 있습니다. 이 호의 데이터는 공식 발표 원문과, 그 발표를 인용한 기사로 확인했습니다. 기사 분석은 AI 요약 도구로 본문을 읽은 결과입니다.

- [x] 제호·오늘의 한 줄·재정·연금 칸도 JSON에서 읽도록 분리
- [ ] KOSIS·관세청·국회 수집기 추가
- [ ] 원본 → 발행 JSON 생성 스크립트(build_issue.py)
- [ ] daily.yml 예약 실행 켜기, 검사 통과 시 자동 커밋·배포
- [ ] 지난 호 아카이브, RSS(`/feed.xml`)

## 라이선스

- 코드: MIT
- 이 서비스가 쓴 글: CC BY 4.0
- 원자료: 각 기관의 이용조건(공공누리 유형)을 따릅니다. 기사 본문은 저장·재배포하지 않고 제목·짧은 요약·링크만 씁니다.
