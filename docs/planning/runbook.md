# 일일 발행 절차

매일 00시(한국 시간) 예약 작업이 이 절차대로 그날 호의 **초안**을 만들어 `dev`에 올리고, 06시 `publish.yml`이 그 호를 `main`과 `deploy`에 같은 커밋으로 올립니다. 그때까지 사람이 승인했으면 '편집자 확인' 호가, 승인이 없으면 검사를 통과한 초안이 '자동 발행' 호로 공개됩니다. `deploy`에 올라간 뒤에는 `deploy-pages.yml`이 승인 여부까지 다시 검사하고 GitHub Pages에 배포합니다. 브랜치 규칙은 [BRANCHES.md](../dev/branches.md), 커밋 규칙은 [COMMITS.md](../dev/commits.md)를 따릅니다.

## 원칙

- 숫자는 공식 발표 원문이나 그 발표를 인용한 기사에 있는 것만 씁니다. 기억이나 추측으로 채우지 말고, 확인하지 못한 값은 빼거나 "미확인"으로 적습니다.
- 기사 본문을 읽지 못했으면 `read`·`body_read`를 `false`로 둡니다. 검색 요약만 본 경우와, 막힌 매체라 제목·링크만 쓴 경우가 여기에 해당합니다.
- 정부 발표, 통계, 사건 사실 위주로 쓰고 정당 공방과 인물 평가는 넣지 않습니다.
- 요약은 기사 문장을 베끼지 않고 새로 씁니다. 결론부터 1~2문장, `~합니다`체입니다.
- 언론 주제의 기사 목록에는 제목과 링크만 두고, 기사 본문은 저장하지 않습니다.
- 지표는 오르내린 방향만 적고 좋고 나쁨은 평가하지 않습니다.
- 조간의 기준은 **전날 23:59까지 발표·보도된 것**입니다. 시장 숫자는 전 거래일 종가를 쓰고, 그날 장중 자료(시초가 등)는 넣지 않습니다.

## 순서

1. `git fetch origin` 뒤 `dev` 브랜치로 가서 `origin/dev`와 맞춥니다. 오늘 날짜(KST)를 `YYYY-MM-DD`로 정하고, `dev/web/data/issues/index.json`의 `latest` 호를 읽어 새 호의 틀로 씁니다.
2. `python3 dev/pipeline/collect/fetch_rss.py --date YYYY-MM-DD`로 언론사 RSS의 전날 기사 목록(`dev/pipeline/collect/raw/rss/YYYY-MM-DD.json`, 제목·링크·날짜·언론사)을 먼저 받습니다. 하위 에이전트는 전국·지역·언론 주제의 기사 후보를 검색보다 이 목록에서 먼저 고릅니다. 목록에 있는 기사라도 본문은 AI 접근을 허용한 매체에서만 읽습니다.
3. 아래 수집을 하위 에이전트로 동시에 돌립니다. 각 에이전트에게는 위 원칙과 결과 JSON 모양(지난 호의 같은 항목)을 그대로 넘깁니다.
   - 핵심 숫자(`nums`): 전 거래일 코스피·코스닥 종가, 원·달러 환율, 두바이유·휘발유 평균가. 출처 기관과 원문 링크가 반드시 있어야 합니다. `ECOS_API_KEY`가 있으면 `python3 dev/pipeline/collect/fetch_ecos.py --date YYYY-MM-DD`와 `python3 dev/pipeline/collect/ecos_nums.py YYYY-MM-DD`를 먼저 돌리고, `dev/pipeline/collect/raw/ecos/YYYY-MM-DD.nums.json`에 있는 항목(코스피·코스닥·환율·기준금리)은 기사 검색 대신 그 값을 씁니다.
   - 전국 뉴스(`national`): 지난 하루 분야별 2~4건, 총 18~24건과 흐름 3줄. 분야는 사회, 사건·안전, 날씨·재난, 안보·외교, 국제(한국 관련), 과학·IT, 생활·물가, 문화·스포츠입니다.
   - 지역 뉴스(`regions`): 17개 시도마다 2~3건을 지역 언론 우선으로 모으고 시도별로 한 줄을 씁니다. 에이전트는 수도권·강원·충청 / 영호남·제주 둘로 나눕니다.
   - 언론 주제(`themes`): 그날 국내외 보도가 가장 많이 몰린 주제 2~3개. 주제마다 언론사별 기사 1건씩(국내 8곳 이상, 해외는 있으면), AI 요약 4~5줄, 기사마다 기준이 달라 갈린 숫자(`diffs`), 검색 키워드(`keywords`)를 담습니다.
   - 상설 지표: 재정(`fiscal`, `debt`), 국민연금(`nps`), 수출입·산업(`trade`, `items`, `industries`)은 새 공식 발표가 있을 때만 고치고, 없으면 지난 호 값을 둡니다.
4. 결과를 합쳐 `dev/web/data/issues/YYYY-MM-DD.json`을 만들고 `status`는 `draft`로 둡니다. `date`, `collectedAt`, `lead`(머리기사·요약·핵심 수치 3개), `briefs`(4~6개), `agenda`(이번 주 일정)는 새로 씁니다.
5. `index.json`의 `latest`를 오늘로 바꾸고 `issues` 목록 맨 앞에 오늘을 넣습니다.
6. `python3 dev/pipeline/publish/validate.py`를 돌립니다. 검사를 통과하지 못하면 올리지 않습니다. 실패한 곳은 고치고, 끝내 고치지 못한 섹션은 지난 호 값으로 되돌린 뒤 다시 검사합니다.
7. `data(issue): YYYY-MM-DD호 초안` 제목으로 `dev`에 커밋하고 push 합니다. 예약 작업은 여기서 멈추고, 확인할 항목(머리기사, 핵심 숫자, 갈린 숫자)과 원문 링크를 보고합니다.

## 사람 확인과 공개

06시 전에 사람이 확인할 수 있으면 아래 8~10번을 합니다. 확인하지 못하면 06시 `publish.yml`이 `python3 dev/pipeline/publish/approve.py YYYY-MM-DD --auto`로 자동 발행하고 `data(issue): YYYY-MM-DD호 자동 발행` 커밋을 `dev`에 남깁니다. 이 호는 화면에 '자동 발행'으로 보이며, 나중에 틀린 값이 나오면 아래 '정정' 절차로 고칩니다.

8. 확인하는 사람이 로컬에서 `python3 -m http.server -d dev/web 8000`으로 초안을 열고 `lead`, `nums`, `themes[].diffs`를 원문과 대조합니다. 틀린 값은 고치거나 뺍니다.
9. `python3 dev/pipeline/publish/approve.py YYYY-MM-DD --by 이름`으로 `published`로 바꾸고 `python3 dev/pipeline/publish/validate.py --deploy`를 돌립니다.
10. `data(issue): YYYY-MM-DD호 승인` 제목으로 `dev`에 커밋하고 push 합니다. 06:00에 `publish.yml`이 `main`·`deploy`를 같은 커밋으로 빨리 감기하고 배포를 실행합니다. 06시가 지나 승인했다면 Actions에서 `아침 발행`을 수동 실행합니다. 누가 `main`에 따로 올려 빨리 감기가 안 되면 워크플로가 실패로 멈춥니다. 이때는 억지로 덮어쓰지 말고 브랜치를 맞춥니다.
11. 배포가 끝나면 `https://korea-jogan.com/data/issues/index.json`의 `latest`가 오늘인지 확인합니다. 오늘 호가 없거나 검사에 실패해 올리지 못했으면 화면은 지난 호를 보여 주고, 맨 위에 '오늘 호는 아직 발행되지 않았습니다'를 띄웁니다.

## 정정

오류 신고(GitHub 이슈 '오류 신고' 양식)가 들어오면 원문과 대조합니다. 신고가 맞으면 그 호의 JSON을 고치고 `dev/web/data/corrections.json`에 한 줄을 더한 뒤, `fix(issue): YYYY-MM-DD호 항목 정정`으로 커밋해 위 10번처럼 올립니다. 이슈에는 정정 커밋을 남기고 닫습니다. 형식은 [DATA.md](data-spec.md#correctionsjson)에 있습니다.

## 접속이 막힌 매체

막힌 매체는 우회해서 읽지 않고 다른 매체로 대체하며, 대체한 사실을 `limits`에 적습니다. 막히는 이유는 두 가지입니다. 연합뉴스·KBS·한겨레·NYT 등은 robots.txt로 AI 수집(ClaudeBot·anthropic-ai 등)을 막았고, 매일경제·FT·Economist·WSJ 등은 서버가 403·401로 막거나 유료벽이 있습니다.

- **기사 목록:** `dev/pipeline/collect/fetch_rss.py`가 언론사가 공개한 RSS에서 제목·링크·날짜만 받습니다. 그래서 연합뉴스·조선·한겨레처럼 AI 본문 접근을 막은 매체도 목록에는 들어갑니다.
- **본문:** AI 접근을 허용한 매체에서만 읽습니다. 조선일보처럼 RSS에 본문 전체가 들어 있어도 수집기는 본문을 받지 않고 요약에도 쓰지 않습니다.
- **RSS가 없거나 막힌 곳:** 중앙·매일경제·KBS는 RSS를 찾지 못했거나 403입니다. 한겨레 RSS는 날짜가 없어 전날 목록에 들어오지 않고, 동아·MBC는 연결이 자주 끊깁니다. 피드별 성공·실패는 결과 파일의 `feeds`에 남습니다.

피드 주소는 `dev/pipeline/collect/feeds.json`에서 고칩니다.
