# 판례·입법 자료의 출처와 갱신

조간은 판례와 입법 자료를 `dev/web/law/data/`에 직접 배포한다. 독자의 검색어는 브라우저에서 처리한다. 판례 일련번호, 의안 식별자, 법령 일련번호로 각 기관의 상세 원문에 연결한다.

## 수록 범위와 집계 단위

| 자료 | 2026년 11월 19일 배포본 | 무엇을 세는가 | 출처 |
| --- | ---: | --- | --- |
| 판례 | 고유 판례 18,460건, 15개 분야 19,634행 | 2026년 10월 공개 정제본에서 주제별로 뽑은 대법원 판례. 사건이 여러 분야에 들어갈 수 있다. 선고일은 1948-05-27~2026-08-12다. | 원출처 [법제처 국가법령정보센터](https://www.law.go.kr/precSc.do), 정제 김준호 [고정 리비전](https://huggingface.co/datasets/joonhok-exo-ai/korean_law_open_data_precedents/tree/0e2049bf3f3bae288b40e95a0553923d8d5246c0) |
| 법률안 제안 | 의안번호 15,297개 | 2025-01-01~2026-09-23 의원·정부·위원장 제안 13,994건. 2026-09-24부터 의원발의 1,303건을 추가했다. 마지막 제안일은 2026-11-18이다. | [열린국회정보](https://open.assembly.go.kr), [KNA 제22대 스냅숏](https://github.com/kyusik-yang/kna/tree/0cfe29f73f929713140d6b50eee0ef6f70e175cf), [나라바로](https://narabaro.fingr.io/bills) |
| 법률 공포·시행 | 법률 판본 3,305행 | 2025년 1월 이후 공포되거나 시행되는 법률의 이름·공포번호·공포일·시행일 조합. 한 공포번호에 여러 법률 또는 시행일이 연결될 수 있다. 공포는 날짜·공포번호별로 묶고 시행은 날짜별로 표시한다. | [법제처 공동활용](https://open.law.go.kr/LSO/lab/lawListSupport.do), [Legalize KR 이력](https://github.com/legalize-kr/legalize-kr/tree/dc068291fbfd896ed790da671cacb3c303295732), [공식 보완 근거](../../dev/pipeline/law/law_calendar_supplement.json) |
| 다음 관보 발행예고 | 예고 문서 1건 | 11월 19일 확인한 11월 20일자 제21366호 법률 분류는 0건이다. 예고 기간이 끝나면 독자가 새 목차를 확인하도록 공식 예고로 연결한다. | [대한민국 전자관보](https://gwanbo.go.kr/user/pblicteNoti/tomorrowOfctt.do) |

판례 카드는 국가법령정보센터의 판시사항에서 해당 분야와 맞는 항목 하나를 발췌한다. 사건번호와 일련번호가 있는 대법원 자료를 대상으로 하며 수록 기준에 맞는 전체 항목을 싣는다. 의안이 공포될 날짜는 추정하지 않는다. 시행 예정일은 이미 공포된 법률의 확인된 일정이다. 이후 정부·위원장 제안, 개별 조문별 시행일, 자료원에 빠진 판본은 달력에 잡히지 않을 수 있다.

## 분야·정제 규칙과 권리 고지

- 분류어·추천어·예시는 [themes.json](../../dev/pipeline/law/themes.json), 대표 판례와 생활어 연결은 [curated_cases.json](../../dev/pipeline/law/curated_cases.json)에서 수정한다. 판례 생성기가 브라우저용 `themes.js`도 함께 만든다.
- 판례 원자료의 출처와 리비전·기준월은 [case-source.json](../../dev/pipeline/law/case-source.json)에 보존한다. 김준호의 정제본은 데이터 카드에 `openrail`로 표기되어 있다. 데이터 재배포 시 법제처와 정제자 정보를 함께 표시하고 해당 자료의 이용 조건을 확인한다. [데이터 카드](https://huggingface.co/datasets/joonhok-exo-ai/korean_law_open_data_precedents/blob/0e2049bf3f3bae288b40e95a0553923d8d5246c0/README.md)
- 법률안과 법률 판본의 JSON 안에도 기관·정제 자료 링크와 수록 범위가 들어 있다. 조간의 자체 작성물에 적용하는 라이선스와 외부 자료의 이용 조건을 구별한다. [조간 이용 조건](../../README.md)
- 이관 당시 검색 규칙·정제기·기초 배포본의 이력은 `MinsangKwak/casewiseAi@1b887b2f16259442e82fbcfac3012669472f703d`다. 독자용 검색과 아래의 갱신 절차는 조간 저장소와 각 원자료만 사용한다.

## 재생성과 검수

저장소 루트에서 실행한다. 일간 신문 발행과 별개로 운영자가 원자료를 갱신한다. Python 3.12, Git, Node.js 22 이상을 사용한다. 판례와 의안의 Parquet를 읽을 때만 PyArrow가 필요하다.

```sh
python -m venv /tmp/jogan-law-env
/tmp/jogan-law-env/bin/pip install pyarrow==22.0.0 huggingface_hub
```

판례 공개본의 고정 리비전으로부터 다섯 조각을 받아 필터링한다. 새 공개본을 채택할 때는 `case-source.json`의 리비전·기준월을 먼저 확인한다.

```sh
/tmp/jogan-law-env/bin/python - <<'PY'
import json
from pathlib import Path
from huggingface_hub import snapshot_download

source = json.loads(Path("dev/pipeline/law/case-source.json").read_text())
snapshot_download(source["dataset"], repo_type="dataset", revision=source["revision"],
                  allow_patterns="data/train-*.parquet", local_dir="/tmp/jogan-precedents")
PY
/tmp/jogan-law-env/bin/python dev/pipeline/law/build_precedents.py /tmp/jogan-precedents/data
```

의안은 고정된 KNA 파일의 SHA-256을 대조한 뒤 나라바로의 최신 내보내기와 과거 페이지를 이어 붙인다. 법률은 Legalize KR 이력에서 판본별 원문 식별자를 읽고 법제처에서 확인한 보완 목록을 병합한다. 관보는 현재 다음 호 목차의 법률 건수를 읽는다.

```sh
/tmp/jogan-law-env/bin/python dev/pipeline/law/bills.py
git clone --bare --single-branch --no-tags --shallow-since=2022-01-01 https://github.com/legalize-kr/legalize-kr.git /tmp/jogan-law-archive.git
python dev/pipeline/law/build_law_calendar.py /tmp/jogan-law-archive.git --as-of "$(TZ=Asia/Seoul date +%F)"
python dev/pipeline/law/refresh_gazette.py
```

이미 받은 법령 아카이브로 다시 갱신할 때는 `git -C /tmp/jogan-law-archive.git fetch origin HEAD` 후 `--revision FETCH_HEAD`를 지정한다. 2026-11-19 배포본을 재현하려면 해당 커밋이 있는 아카이브에서 `--revision dc068291fbfd896ed790da671cacb3c303295732 --as-of 2026-11-19`를 사용한다. 나라바로와 관보의 최근 페이지 내용은 시점에 따라 달라진다. 수집 오류나 예고 지연 시 마지막 검증본을 유지하고 오류를 확인한 뒤 다시 실행한다.

검수 목록의 SHA-256과 바이트 수는 배포되는 18개 자료 파일에서 직접 계산한다. 관리 화면이 읽는 분야별 행 수, 고유 판례 수, 자료 기준일, 최신 선고·제안일도 같은 명령에서 생성한다. 입법 기준일은 의안·법률 자료 기준일 중 이른 날짜이며 관보 확인일은 별도로 표시한다.

```sh
python dev/pipeline/law/build_status.py
python dev/pipeline/law/build_status.py --check
python -m unittest discover -s dev/tests -p test_law_data.py
```

테스트는 인터넷 없이 실제 자료로 분야별 JSON·테마 모듈의 재생성 결과, 검수 목록, 분야별 추천 검색, 사건번호와 생활어의 검색 순위, 보완 판례, 관보 예고 처리와 원문 주소를 확인한다. 변경된 자료와 검수 목록을 같은 변경으로 배포한다.
