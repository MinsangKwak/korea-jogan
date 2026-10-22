# 커밋 메시지 규칙

`git log --oneline`만 읽어도 흐름이 보이도록, 제목은 `종류(범위): 무엇이 바뀌었는지` 꼴로 변경 결과만 적고 이유는 본문으로 보냅니다.

## 형식

```text
<종류>(<범위>): <제목>

<왜 바꿨는지 · 무엇을 택했는지>
```

| 자리 | 규칙 |
| --- | --- |
| 종류 | 아래 표의 값 하나. 소문자 |
| 범위 | 선택. `site` · `issue` · `scripts` · `docs` · `infra` 중 하나. 둘 이상에 걸치면 비웁니다 |
| 제목 | 한국어, 결론 먼저, 72자 안, 마침표 없음 |
| 본문 | 선택. 이유가 있을 때만 |
| 꼬리표 | `Co-Authored-By:` 같은 줄은 그대로 둡니다 |

| 범위 | 무엇 |
| --- | --- |
| `site` | `dev/web/index.html` 등 화면 |
| `issue` | `dev/web/data/issues/` 발행 데이터 |
| `scripts` | 수집·검사 스크립트 |
| `docs` | 문서 |
| `infra` | 배포·워크플로·저장소 설정 |

## 종류

| 종류 | 언제 |
| --- | --- |
| `feat` | 독자가 보는 새 기능·동작 |
| `fix` | 잘못된 동작이나 틀린 데이터를 고침 |
| `style` | 디자인·문구만. 동작은 그대로 |
| `refactor` | 동작은 같고 구조만 바꿈 |
| `docs` | 문서만 |
| `test` | 검사만 |
| `data` | 발행 데이터 갱신. 일일 발행은 `data(issue): 2026-10-20호 발행` |
| `ci` | 워크플로·배포·훅 설정 |
| `release` | 여러 변경을 묶어 판을 올릴 때 |
| `sync` | 브랜치 동기화. `sync: dev → main` · `sync: main → deploy` |
| `chore` | 위에 없는 잡일. 되도록 쓰지 않습니다 |

한 커밋에는 주제 하나만 담고, 둘이면 나눕니다. PR 제목도 같은 꼴입니다.

## 검사

| 어디 | 무엇 | 켜는 법 |
| --- | --- | --- |
| 로컬 `commit-msg` 훅 | 저장 전에 제목 꼴을 봅니다 | `git config core.hooksPath dev/tools/githooks` |
| PR 검사(`check.yml`) | PR의 커밋 제목을 모두 봅니다. 실패로 표시하되 병합을 막지는 않습니다 | 자동 |

```bash
node dev/tools/check_commit_msg.mjs .git/COMMIT_EDITMSG
node dev/tools/check_commit_msg.mjs --range origin/main..HEAD
```

2026-10-19부터 적용하는 규칙이라 그 전 커밋은 검사하지 않습니다.
