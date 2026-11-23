# 대한민국 조간 기사 API

발행 목록에 오른 호에서 **전국 뉴스와 지역 뉴스**를 추출해 SQLite에 저장합니다. 사이트와 외부 독자는 호 목록, 날짜별 기사, 기사 한 건을 각각 JSON으로 읽을 수 있습니다. 운영 지면에는 같은 SQLite 조회 결과를 파일로 내보내므로 기사 조회에 별도 서버 요금이나 API 키가 들지 않습니다.

## 공개 API

| GET 경로 | 응답 |
| --- | --- |
| [/api/v1/index.json](https://korea-jogan.com/api/v1/index.json) | 최근 공개 호와 날짜 내림차순의 호 목록. 각 항목에 날짜·발행 상태·기사 건수·호별 조회 주소가 있습니다. |
| [/api/v1/editions/2026-11-23.json](https://korea-jogan.com/api/v1/editions/2026-11-23.json) | 해당 호의 전국 기사와 지역 기사. 각 지면 안에서 편집 순서를 따릅니다. |
| `/api/v1/articles/{id}.json` | 호별 응답에서 선택한 기사 한 건. 각 기사의 원문으로 가려면 `url`을 사용합니다. |

호 목록과 호별 응답에는 `version: 1`이 있습니다. 발행 상태는 정식 호 `published`와 공개 시안 `prototype`으로 구분합니다. 빈 발행 목록의 응답은 `latest: null`, `editions: []`입니다. 없는 호·기사 주소의 HTTP 상태는 404입니다.

| 기사 필드 | 의미 |
| --- | --- |
| `id`, `editionDate`, `section`, `region` | 지면에 실린 기사 ID, 조간 발행일, 전국(`national`)·지역(`regions`) 구분, 출처 데이터에 적힌 지역. 지역 표기가 없으면 `null`입니다. |
| `title`, `summary`, `cat` | 해당 호에서 편집한 제목·요약·분야 |
| `outlet`, `url`, `date` | 언론사, 보도 원문 주소, 조간 데이터에 기록된 원문 보도일 |
| `body_read`, `figures`, `figure_source` | 수집 당시 보도 본문 확인 여부, 지면의 수치 목록, 수치의 출처. 마지막 필드는 원자료에 있을 때만 제공합니다. |

ID는 호 날짜·지면·지역면의 지역명·원문 URL에서 계산합니다. 제목이나 요약을 정정하고 기사 순서를 바꿔도 같은 주소를 유지합니다. 같은 보도가 다른 호나 다른 지역 지면에도 실렸다면 각 편집본을 개별 기사로 저장합니다. 기사 건수는 이 편집본 기준입니다.

## 발행과 정정

1. 발행 과정이 검사한 날짜별 원본과 발행 목록을 준비합니다.
2. 백엔드는 공개된 호의 허용 필드만 정규화합니다. 초안과 목록에서 빠진 호는 DB와 다음 공개 결과에서 빠집니다.
3. 변경된 호만 SQLite 트랜잭션에서 교체합니다. 정정된 호에서 삭제한 기사도 함께 지웁니다. 재실행하면 같은 기사 주소와 내용이 나옵니다.
4. 같은 DB에서 전체 JSON을 임시 경로에 쓴 뒤 출력 경로를 교체합니다. 유효하지 않은 기사 때문에 생성이 실패하면 기존 DB와 공개 파일을 보존합니다.
5. 지면과 `/api/v1/`을 같은 배포물로 게시합니다. 저장소에 보관한 날짜별 원본으로 SQLite와 API 파일을 다시 만들 수 있습니다.

GitHub Actions의 새 배포 실행은 그 커밋의 지면 원본으로 SQLite를 다시 구성합니다. 예약 실행을 제외한 배포에서는 데이터베이스를 Actions 아티팩트로 30일 보관하고, 웹에는 조회용 JSON을 공개합니다. 로컬에서 같은 데이터베이스를 다시 사용하면 바뀐 호만 갱신합니다.

## 로컬 실행

Python 3.10 이상에서 저장소 루트를 기준으로 실행합니다. SQLite에는 파이썬 표준 라이브러리를 사용합니다.

```bash
python3 backend-python/edition_api.py build \
  --issues frontend-vanilla-js/data/issues \
  --database backend-python/var/articles.sqlite3 \
  --output backend-python/var/public/api/v1

python3 backend-python/edition_api.py serve \
  --database backend-python/var/articles.sqlite3 --port 8080
```

두 번째 명령은 SQLite를 읽기 전용으로 열고 `http://127.0.0.1:8080/api/v1/index.json`에서 JSON을 제공합니다. GET과 HEAD를 지원합니다. SQL로 확인하려면 `editions`의 `date`와 `articles`의 `edition_date`를 연결합니다. API 파일용 출력 경로와 데이터베이스 파일은 분리합니다.

```bash
python3 -m unittest discover -s backend-python/tests
```
