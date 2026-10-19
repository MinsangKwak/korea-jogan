# 브랜치와 배포 흐름

| 브랜치 | 역할 | 누가 올리나 |
| --- | --- | --- |
| `dev` | 개발 중인 소스와 데이터. 모든 작업은 여기서 시작합니다 | 개발 작업, 일일 발행 |
| `main` | 검사를 통과한 최종본 | `dev`에서 병합 |
| `deploy` | 배포 전용. 여기에 올라온 것만 GitHub Pages에 나갑니다 | `main`에서 그대로 올림 |

## 흐름

```text
dev ──(PR 또는 일일 발행)──▶ main ──(그대로 올림)──▶ deploy ──▶ GitHub Pages
```

- 처음 `dev`와 `deploy`는 `main`에서 만들었습니다. 그 뒤로는 `dev → main → deploy` 한 방향으로만 흐릅니다.
- `main`과 `deploy`에는 직접 커밋하지 않습니다. `deploy`는 항상 `main`과 같은 커밋을 가리킵니다.
- 화면·스크립트 변경: `dev`에서 작업 브랜치를 따서 `dev`로 PR → `dev → main` PR(`sync: dev → main`) → `main`을 `deploy`로 올림.
- 일일 발행: 예약 작업이 `dev`에 `data(issue)` 커밋을 올리고, 검사를 통과하면 `main`과 `deploy`를 같은 커밋으로 빨리 감기(fast-forward)합니다.
- 다 쓴 작업 브랜치는 병합 뒤 원격과 로컬에서 지웁니다.

## 검사와 배포 워크플로

| 워크플로 | 언제 | 무엇 |
| --- | --- | --- |
| `check.yml` | `dev`·`main` push, PR | 데이터 검사, PR 커밋 제목 검사 |
| `deploy-pages.yml` | `deploy` push, 수동 실행 | 데이터 검사 뒤 GitHub Pages 배포 |
| `daily.yml` | 수동 실행 | 한국은행 ECOS 원본 수집(준비 중) |

## 저장소 설정

GitHub Pages는 `github-pages` 환경을 통해 배포합니다. Settings → Environments → `github-pages` → Deployment branches에 `deploy`가 허용돼 있어야 합니다.
