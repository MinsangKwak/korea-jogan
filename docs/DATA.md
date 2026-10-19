# 발행 데이터 형식

**하루 한 호를 `public/data/issues/YYYY-MM-DD.json` 파일 하나에 담습니다.** 화면은 `index.json`의 `latest`가 가리키는 호를 읽습니다. 검사 규칙은 [scripts/validate.py](../scripts/validate.py)가 정하고, 이 문서는 그 규칙과 화면이 쓰는 형식을 설명합니다. ✔ 표시는 검사 스크립트가 확인하는 항목입니다.

## index.json

```json
{ "latest": "2026-10-19", "issues": ["2026-10-19"] }
```

| 키 | 뜻 |
| --- | --- |
| `latest` | 화면이 여는 호. ✔ `issues` 안에 있어야 합니다 |
| `issues` | 발행한 호 목록, 최신이 맨 앞. ✔ 목록의 파일이 모두 있어야 하고, 모두 검사합니다 |

## 호 파일의 최상위 항목

✔ `date`, `lead`, `briefs`, `nums`, `themes`, `items`, `industries`, `trade`, `debt`, `fiscal`, `nps`, `agenda`, `limits`는 필수입니다.

| 키 | 형식 | 화면 | 내용 |
| --- | --- | --- | --- |
| `date` | `"YYYY-MM-DD"` | 전체 | 발행일. ✔ 파일 이름과 같아야 합니다 |
| `collectedAt` | ISO 8601 | 머리 | 수집 시각(한국 시간, `+09:00` 포함). ✔ `published` 호는 발행일 06:00보다 늦으면 안 됩니다 |
| `status` | 문자열 | 맨 위 안내 | ✔ `prototype`(시안) · `draft`(사람 확인 전 초안) · `published`(사람이 확인한 공개 호). 아래 [status · review](#status--review) |
| `review` | 객체 | 맨 위 안내 | `published` 호를 확인한 사람과 시각 `{by, at, scope}`. ✔ `published`면 `by`·`at` 필수 |
| `headline`, `topic`, `notes` | 문자열 | 머리 | 오늘의 한 줄, 주제, 비고 |
| `lead` | 객체 | 홈 | 머리기사. 아래 [lead](#lead) |
| `briefs` | 배열 | 홈 | 오늘 꼭 볼 숫자 `{k, m, href}` 4~6개 |
| `nums` | 배열 | 경제 | 핵심 숫자. 아래 [nums](#nums) |
| `national` | 객체 | 전국 | 아래 [national · regions](#national--regions) |
| `regions` | 객체 | 지역 | 아래 [national · regions](#national--regions) |
| `agenda`, `agendaSrc` | 배열, 문자열 | 정치 | 이번 주 일정 `{day, dow, cat, t}`과 출처 |
| `items` | 배열 | 산업 | 수출입 품목 `{k: 품목, v: 금액, y: 전년 대비, c: 색 구분}`. ✔ `v`는 0보다 큰 숫자 |
| `industries` | 배열 | 산업 | 주력산업 `{name, sum, f, news}`. `f`는 `[항목, 값, 출처]` 목록 |
| `trade` | 객체 | 산업 | 수출입 개요 `{intro, stats, src, oct}` |
| `debt` | 배열 | 재정 | 아래 [debt](#debt) |
| `fiscal` | 객체 | 재정 | 월간 재정동향·요약·전망 `{monthly, summary, outlook}`(각 `{k, m, v}` 목록)과 출처 문자열 |
| `nps` | 객체 | 재정 | 국민연금 `{kv, alloc, reform}`과 출처. `alloc`은 `{a: 자산군, amt: 금액, s: 비중%}` |
| `themes` | 배열 | 언론 | 아래 [themes](#themes) |
| `limits` | 문자열 배열 | 하단 | 수집 방법과 한계. 대체한 매체, 넓힌 날짜 범위 등 |

## status · review

자동 작업은 `draft`로만 씁니다. 사람이 머리기사(`lead`), 핵심 숫자(`nums`), 기준이 갈린 숫자(`themes[].diffs`)를 원문과 대조한 뒤 `scripts/approve.py`로 `published`로 바꿉니다.

```json
{ "status": "published", "review": { "by": "확인한 사람", "at": "2026-10-20T07:40+09:00", "scope": ["lead", "nums", "themes.diffs"] } }
```

| 규칙 | 내용 |
| --- | --- |
| ✔ 배포 | `validate.py --deploy`(배포 워크플로)는 목록에 `draft` 호가 있으면 실패합니다 |
| ✔ 수집 시각 | 조간은 00시 발행입니다. 시장 숫자는 전 거래일 종가를 쓰고, 그날 장중 자료는 넣지 않습니다. `published` 호의 `collectedAt`은 발행일 06:00(한국 시간)을 넘을 수 없습니다 |
| `prototype` | 승인 규칙을 적용하지 않는 시안. 화면에 '시안 호'로 표시합니다 |

## corrections.json

`public/data/corrections.json`은 모든 호의 정정 기록입니다. 화면 맨 아래 '정정 기록'에 최근 것부터 보여 줍니다.

```json
{ "items": [{ "date": "2026-10-20", "issue": "2026-10-19", "section": "경제 · 원·달러 환율", "before": "1,470.2원", "after": "1,471.2원", "reason": "기준 시각 오기" }] }
```

| 키 | 규칙 |
| --- | --- |
| `date` | 정정한 날. ✔ `YYYY-MM-DD` |
| `issue` | 고친 호. ✔ `index.json`의 `issues`에 있어야 합니다 |
| `section`, `before`, `after`, `reason` | ✔ 모두 필수. 무엇을 무엇으로, 왜 고쳤는지 |

정정할 때는 그 호의 JSON을 고치고, 같은 커밋에서 이 파일에 한 줄을 더합니다. 제목은 `fix(issue): YYYY-MM-DD호 항목 정정`입니다.

## lead

```json
{
  "kicker": "분류",
  "headline": "머리기사 제목",
  "standfirst": "요약 1~2문장",
  "facts": [{ "t": "항목", "v": "값", "m": "기준·출처" }],
  "meta": "발표·수집 정보"
}
```

`facts`는 핵심 수치 3개입니다.

## nums

```json
{
  "k": "원·달러 환율",
  "v": "값",
  "dir": "up",
  "d": "변동폭",
  "ref": "기준 설명",
  "grade": "A",
  "src": { "name": "기관", "title": "자료 제목", "pub": "발표일", "base": "기준일", "url": "https://..." }
}
```

| 키 | 규칙 |
| --- | --- |
| `dir` | ✔ `up`·`down`·`flat`만. 화면에는 상승·하락·보합으로만 표시합니다 |
| `grade` | 출처 신뢰도. A 공식 확정 통계 · B 공식 잠정 통계 · C 공식 정책 발표 · D 언론 보도·민간 집계 · E 분석·계산 |
| `src.name`, `src.url` | ✔ 기관 이름과 `https` 링크 필수. 공식 발표를 기사로 인용했으면 `title`에 그 사실을 적습니다 |
| `src.pub`, `src.base` | 발표일과 기준일을 구분합니다 |

## national · regions

```json
{
  "flow": ["오늘의 흐름 1", "2", "3"],
  "items": [{
    "cat": "사회",
    "title": "기사 제목",
    "outlet": "언론사",
    "url": "https://...",
    "date": "YYYY-MM-DD",
    "body_read": true,
    "summary": "직접 쓴 1~2문장 요약",
    "figures": ["기사 속 숫자"]
  }]
}
```

| 키 | 규칙 |
| --- | --- |
| `national.items[].cat` | 사회 · 사건·안전 · 날씨·재난 · 안보·외교 · 국제 · 과학·IT · 생활·물가 · 문화·스포츠 |
| `regions.items[].region` | ✔ 17개 시도 이름만(서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주) |
| `regions.summary` | 시도 이름을 키로 한 한 줄 요약 |
| `url`, `summary` | ✔ 기사마다 `https` 링크와 요약 필수 |
| `body_read` | 본문을 읽지 못하고 검색 요약만 봤으면 `false` |

## themes

언론 섹션의 주제 하나입니다. 위에는 요약과 갈린 숫자, 아래에는 기사 링크만 보여 줍니다.

```json
{
  "id": "kospi",
  "title": "주제 이름",
  "keywords": ["검색어"],
  "period": "기사 수집 기간",
  "summary": ["AI 요약 4~5줄"],
  "diffs": [{ "q": "질문", "a": "답", "cols": ["열"], "rows": [["값"]] }],
  "articles": [{ "outlet": "언론사", "region": "국내", "title": "제목", "url": "https://...", "date": "YYYY-MM-DD", "read": true }]
}
```

| 키 | 규칙 |
| --- | --- |
| `summary`, `articles`, `keywords` | ✔ 모두 비어 있으면 안 됩니다 |
| `articles[].url` | ✔ `https` 링크 필수. 기사 본문은 저장하지 않습니다 |
| `articles[].region` | `국내` 또는 `해외` |
| `diffs` | 기사마다 기준이 달라 갈린 숫자. 예: 지난주 코스피 하락률 14.46%와 11.21%(출발점 차이). 주제마다 첫 번째 항목이 홈 '오늘 기준이 갈린 숫자'에 나옵니다 |
| `diffs[].pick` | 선택. 홈 카드에 크게 보여 줄 두 줄의 번호 `[i, j]`. 없으면 `rows`의 처음과 마지막 줄 첫 열을 씁니다 |
| `keywords` | 주제 검색에 쓰는 낱말. 제목과 함께 검색 점수를 매깁니다 |

## debt

국가채무 연도별 값입니다. 한 줄이 `[연도, 금액(조 원), GDP 대비 비율(%), 구분]`입니다.

```json
[[2015, 591.5, 34, "결산"], [2030, 1734.1, 49, "중기전망"]]
```

| 규칙 | 내용 |
| --- | --- |
| ✔ 순서 | 연도 오름차순 |
| ✔ 범위 | 금액 100~5,000조, 비율 10~150% |
| 구분 | `결산`이 아니면 화면에서 전망 막대로 그리고 구분을 함께 적습니다 |
| 빠진 연도 | 금액을 확인하지 못한 해는 넣지 않습니다. 화면이 '미확인' 줄로 표시합니다 |

## 새 호를 만들 때

1. 지난 호를 복사해 틀로 쓰고 `date`, `collectedAt`, `lead`, `briefs`, `agenda`, `national`, `regions`, `themes`, `nums`를 새로 씁니다.
2. 재정·국민연금·수출입은 새 공식 발표가 있을 때만 바꿉니다.
3. `status`를 `draft`로 두고, `index.json`의 `latest`를 바꾸고 `issues` 맨 앞에 넣은 뒤 `python3 scripts/validate.py`를 돌립니다.
4. 사람이 확인한 뒤 `python3 scripts/approve.py YYYY-MM-DD --by 이름`으로 공개 호로 바꿉니다.

전체 절차는 [DAILY_RUNBOOK.md](DAILY_RUNBOOK.md)에 있습니다.
