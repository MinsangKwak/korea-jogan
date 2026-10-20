# 일일 발행 절차

매일 00시(한국 시간) 예약 작업이 이 절차대로 그날 호의 **초안**을 만들어 `dev`에 올립니다. 사람이 머리기사와 핵심 숫자를 원문과 대조해 승인한 뒤에만 `main`과 `deploy`를 같은 커밋으로 올립니다. `deploy`에 올라가면 `deploy-pages.yml`이 승인 여부까지 다시 검사한 뒤 GitHub Pages에 배포합니다. 브랜치 규칙은 [BRANCHES.md](BRANCHES.md), 커밋 규칙은 [COMMITS.md](COMMITS.md)를 따릅니다.

## 원칙

- 숫자는 공식 발표 원문이나 그 발표를 인용한 기사에 있는 것만 씁니다. 기억이나 추측으로 채우지 않습니다. 확인하지 못한 값은 빼거나 "미확인"으로 적습니다.
- 기사 본문을 읽지 못하고 검색 요약만 봤으면 `read`·`body_read`를 `false`로 둡니다.
- 정당 공방과 인물 평가는 넣지 않습니다. 정부 발표, 통계, 사건 사실 위주로 씁니다.
- 요약은 기사 문장을 베끼지 않고 새로 씁니다. 결론을 먼저, 1~2문장, `~합니다`체로 씁니다.
- 언론 주제의 기사 목록에는 제목과 링크만 둡니다. 기사 본문을 저장하지 않습니다.
- 지표의 상승·하락은 방향만 적고 좋고 나쁨을 평가하지 않습니다.
- 조간의 기준은 **전날 23:59까지 발표·보도된 것**입니다. 시장 숫자는 전 거래일 종가를 씁니다. 그날 장중 자료(시초가 등)는 넣지 않습니다.

## 순서

1. `git fetch origin` 뒤 `dev` 브랜치로 가서 `origin/dev`와 맞춥니다. 오늘 날짜(KST)를 `YYYY-MM-DD`로 정합니다. `public/data/issues/index.json`의 `latest` 호를 읽어 새 호의 틀로 씁니다.
2. 먼저 `python3 scripts/fetch_rss.py --date YYYY-MM-DD`로 언론사 RSS에서 전날 기사 목록(`data/raw/rss/YYYY-MM-DD.json`, 제목·링크·날짜·언론사)을 받습니다. 하위 에이전트에게 이 목록을 넘겨, 전국·지역·언론 주제의 기사 후보를 검색보다 먼저 여기서 고르게 합니다. 목록에 있어도 본문은 AI 접근을 허용한 매체에서만 읽고, 막힌 매체 기사는 제목·링크만 쓰며 `read`·`body_read`를 `false`로 둡니다.
3. 아래 수집을 하위 에이전트로 동시에 돌립니다. 각 에이전트에게 위 원칙과 결과 JSON 모양(지난 호의 같은 항목)을 그대로 넘깁니다.
   - 핵심 숫자(`nums`): 전 거래일 코스피·코스닥 종가, 원·달러 환율, 두바이유·휘발유 평균가. 출처 기관과 원문 링크 필수. `ECOS_API_KEY`가 있으면 먼저 `python3 scripts/fetch_ecos.py --date YYYY-MM-DD`와 `python3 scripts/ecos_nums.py YYYY-MM-DD`를 돌리고, `data/raw/ecos/YYYY-MM-DD.nums.json`에 있는 항목(코스피·코스닥·환율·기준금리)은 기사 검색 대신 그 값을 씁니다.
   - 전국 뉴스(`national`): 지난 하루 분야별 2~4건, 총 18~24건과 흐름 3줄. 분야는 사회, 사건·안전, 날씨·재난, 안보·외교, 국제(한국 관련), 과학·IT, 생활·물가, 문화·스포츠.
   - 지역 뉴스(`regions`): 17개 시도마다 2~3건, 지역 언론 우선, 시도별 한 줄. 두 에이전트로 나눕니다(수도권·강원·충청 / 영호남·제주).
   - 언론 주제(`themes`): 그날 국내외 보도가 가장 많이 몰린 주제 2~3개. 주제마다 언론사별 기사 1건씩(국내 8곳 이상, 해외는 있으면), AI 요약 4~5줄, 기사마다 기준이 달라 갈린 숫자(`diffs`), 검색 키워드(`keywords`).
   - 상설 지표: 재정(`fiscal`, `debt`), 국민연금(`nps`), 수출입·산업(`trade`, `items`, `industries`)은 새 공식 발표가 있을 때만 고칩니다. 없으면 지난 호 값을 그대로 둡니다.
4. 결과를 합쳐 `public/data/issues/YYYY-MM-DD.json`을 만듭니다. `status`는 `draft`로 둡니다. `date`, `collectedAt`, `lead`(머리기사·요약·핵심 수치 3개), `briefs`(4~6개), `agenda`(이번 주 일정)를 새로 씁니다.
5. `index.json`의 `latest`를 오늘로 바꾸고 `issues` 목록 맨 앞에 오늘을 넣습니다.
6. `python3 scripts/validate.py`를 돌립니다. 실패하면 고칠 수 있는 것은 고치고, 끝내 고치지 못하면 그 섹션을 지난 호 값으로 되돌린 뒤 다시 검사합니다. 검사를 통과하지 못하면 올리지 않습니다.
7. `data(issue): YYYY-MM-DD호 초안` 제목으로 `dev`에 커밋하고 push 합니다. **자동 작업은 여기서 멈춥니다.** `main`·`deploy`에는 올리지 않고, 확인할 항목(머리기사, 핵심 숫자, 갈린 숫자)과 원문 링크를 보고합니다.

## 사람 확인과 공개

8. 확인하는 사람이 로컬에서 `python3 -m http.server -d public 8000`으로 초안을 열고 `lead`, `nums`, `themes[].diffs`를 원문과 대조합니다. 틀린 값은 고치거나 뺍니다.
9. `python3 scripts/approve.py YYYY-MM-DD --by 이름`으로 `published`로 바꾸고 `python3 scripts/validate.py --deploy`를 돌립니다.
10. `data(issue): YYYY-MM-DD호 승인` 제목으로 `dev`에 커밋합니다. 이어서 `git push origin dev:main`, `git push origin dev:deploy`로 세 브랜치를 같은 커밋으로 맞춥니다. 빨리 감기가 안 되면(누가 `main`에 따로 올린 경우) 억지로 덮어쓰지 말고 멈춥니다.
11. 배포가 끝나면 `https://minsangkwak.github.io/korea-jogan/data/issues/index.json`의 `latest`가 오늘인지 확인합니다. 승인이 늦어지는 동안 화면은 지난 호를 보여 주며, 맨 위에 '오늘 호는 아직 발행되지 않았습니다'를 띄웁니다.

## 정정

오류 신고(GitHub 이슈 '오류 신고' 양식)가 들어오면 원문과 대조합니다. 맞으면 그 호의 JSON을 고치고 `public/data/corrections.json`에 한 줄을 더한 뒤 `fix(issue): YYYY-MM-DD호 항목 정정`으로 커밋하고 위 10번처럼 올립니다. 이슈에는 정정 커밋을 남기고 닫습니다. 형식은 [DATA.md](DATA.md#correctionsjson)에 있습니다.

## 접속이 막힌 매체

막히는 이유는 두 가지입니다. 연합뉴스·KBS·한겨레·NYT 등은 robots.txt로 AI 수집(ClaudeBot·anthropic-ai 등)을 막았고, 매일경제·FT·Economist·WSJ 등은 서버가 403·401로 막거나 유료벽이 있습니다. 우회해서 읽지 않습니다.

- **기사 목록:** `scripts/fetch_rss.py`가 언론사가 공개한 RSS에서 제목·링크·날짜만 받습니다. 연합뉴스·조선·한겨레처럼 AI 본문 접근을 막은 매체도 목록에는 넣을 수 있습니다.
- **본문:** AI 접근을 허용한 매체에서만 읽습니다. 조선일보처럼 RSS에 본문 전체가 들어 있어도 수집기는 본문을 받지 않고, 요약에도 쓰지 않습니다.
- **RSS가 없거나 막힌 곳:** 중앙·매일경제·KBS는 RSS를 찾지 못했거나 403입니다. 한겨레 RSS는 날짜가 없어 전날 목록에 들어오지 않습니다. 동아·MBC는 연결이 자주 끊깁니다. 피드별 성공·실패는 결과 파일의 `feeds`에 남습니다.

막힌 매체는 다른 매체로 대체하고, 대체한 사실을 `limits`에 적습니다. 피드 주소는 `scripts/feeds.json`에서 고칩니다.
