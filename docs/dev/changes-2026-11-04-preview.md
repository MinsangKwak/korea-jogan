# 2026.11.04 개발 미리보기와 일일 발행 분리

**개발 코드는 보호된 미리보기에서 검토하고, 매일의 뉴스는 안정 코드에 데이터만 가져와 발행하도록 나누는 변경입니다.** `dev`의 실험 코드가 아침 발행에 함께 공개되는 경로를 없애는 것이 목적입니다.

[환경과 DNS 안내](environments.md) · [브랜치 절차](branches.md) · [자동화 상태](publish-automation.md) · [이전 검색 개선](changes-2026-11-04-seo.md)

## 확인 상태

| 구분 | 현재 기록 |
| --- | --- |
| 작업 시작 기준 | 앞선 검색·편집 변경 `03fcc102` 이후 |
| Vercel 프로젝트 | `minsangkwaks-projects`의 Hobby 프로젝트 `korea-jogan-dev`, GitHub 저장소 연결 확인 |
| 배포 보호 | 모든 배포에 Vercel Authentication 설정, 현재 OWNER 1명 |
| 개발 도메인 | `dev.korea-jogan.com`을 Git 브랜치 `dev`에 연결 |
| DNS | NXDOMAIN. Gabia CNAME 추가 필요 |
| 첫 Vercel 배포 | [`f4df437b`](https://vercel.com/minsangkwaks-projects/korea-jogan-dev/EQcoTBWNJtHv8bAjHEn6gwogBsEN) READY. [보호된 기본 주소](https://korea-jogan-dev-git-dev-minsangkwaks-projects.vercel.app) 확인 |
| 소스·CI | [PR #91](https://github.com/MinsangKwak/korea-jogan/pull/91) → `f4df437b95e7786b701ae8e107735ecc3e72ced9`. Python 144건·브라우저 114건 통과 |
| 초기 운영 반영·Pages | 검증된 `f4df437b`가 운영에 반영됨. [배포 #41755244224](https://github.com/MinsangKwak/korea-jogan/actions/runs/41755244224) 성공, 공개 빌드 정보 대조 완료 |
| Codex 예약 지시 | 00시 `main` 기반 `daily` 작성과 06:05 안정 SHA 읽기 전용 확인으로 모두 갱신·활성 확인 |
| 후속 승격 검사 보완 | 원시 Vercel 상태 응답을 대조한 로컬 22건·전체 Python 147건 통과. [PR #92](https://github.com/MinsangKwak/korea-jogan/pull/92)의 CI·반영 기록으로 통합 결과 확인 |
| 첫 일일 실행 | 2026.11.05 예정, 실제 조사·발행 결과 미확인 |

이 기록은 설정 등록·구현·원격 반영·실제 배포를 구분합니다. 이전 검색 개선의 성과·검사 수를 이 변경의 검증 결과로 옮겨 적지 않습니다.

## 바뀌는 운영 기준

| 항목 | 이전 경로 | 이번 기준 |
| --- | --- | --- |
| 개발 검토 | `dev`와 운영 발행 경로가 연결 | `dev`는 보호된 Vercel 미리보기 |
| 안정 코드 | 일일 발행에서 `dev` 전체 반영 | 검토한 코드만 `main`으로 승격 |
| 일일 조사 | `dev`에 초안 저장 | `main`에서 만든 `daily/YYYY-MM-DD`에 오늘 자료만 저장 |
| 아침 발행 | `dev` 전체를 `main`·`deploy`로 빨리 감기 | 고정한 `daily` SHA의 허용 데이터만 안정 `main`에 반영 |
| 일반 코드 공개 | 세 브랜치의 일괄 동기화 | 정확한 `dev` SHA의 CI·해당 배포 성공·운영자 인증/관리자 확인·조상 관계 확인 후 승격 |

오늘 데이터의 허용 범위는 날짜별 JSON·발행 색인·실제 새 근거가 있는 `trackers.json`입니다. 과거 호·코드·워크플로·문서를 일일 브랜치에 섞지 않습니다. 소스 브랜치 코드를 실행하거나 전체 병합하지 않고, `main`의 검사 코드로 자료를 검증합니다.

## 개발 미리보기의 경계

개발 빌드는 `dist-preview`를 별도로 만들고 공개된 호만 포함합니다. 모든 HTML의 `noindex`·응답 헤더·크롤링 제한, GA4 비활성화와 관리자 읽기 전용 안내를 적용하는 범위입니다. 실제 접근 경계는 Vercel Authentication입니다.

첫 Vercel 배포는 `f4df437b95e7786b701ae8e107735ecc3e72ced9`로 READY를 확인했습니다. 인증된 연결로 `preview-build.json`을 HTTP 200으로 읽어 `commit`·`branch: dev`·최신 호 2026-11-04·17개 호와 `noindex`·비공개 캐시 헤더를 대조했습니다. 비로그인 요청의 `/`·`/data/issues/index.json`·`/src/core/metrics.js`·`/preview-build.json`은 모두 Vercel 로그인으로 302 이동했습니다. 기본 개발 주소의 보호 경계 확인이며, 사용자 도메인은 DNS 연결 후 별도로 확인합니다.

## 운영자가 추가할 DNS

| 위치 | 레코드 | 호스트 | 대상 | TTL |
| --- | --- | --- | --- | --- |
| Gabia DNS | CNAME | `dev` | `cname.vercel-dns.com.` | 기본값 |

루트 A 레코드는 유지합니다. 저장 뒤 Vercel 도메인 확인과 HTTPS·로그인 보호·실제 화면을 확인합니다. [환경별 확인 순서](environments.md#완료-확인-순서)

## 발행과 자동화

00시 조사·초안·편집 예약은 `main` 기반 `daily/YYYY-MM-DD`에 저장하도록 지시 갱신·활성을 확인했습니다. 06:05 예약도 안정 SHA·공개 빌드 정보의 읽기 전용 확인으로 갱신했습니다. 첫 2026.11.05 실행·조사·공개 결과는 아직 확인하지 않았습니다.

06:05 Codex는 공개 상태와 실패 원인을 읽기 전용으로 확인합니다. 직접 워크플로 실행은 도구 기능 부재와 대체 재실행의 자동 승인 검토 거절로 확인 대기 상태를 유지합니다. 실제 발행은 기존 GitHub 06:07·06:37·07:17·08:17 예약이 맡습니다. [전체 이관 상태](publish-automation.md#현재-상태)

새 아침 발행 경로는 고정한 일일 커밋의 CI·허용 파일·동시 변경을 확인한 뒤 안정 코드에 오늘 자료만 반영합니다. 코드 승격은 검토한 정확한 `dev` SHA의 CI와 해당 Vercel 배포 성공을 확인하고 운영자의 `admin_preview_verified` 입력으로 인증 경계·관리자 검토를 구분합니다. 토큰 없는 CI가 실시간 Vercel 인증 정책까지 자동 증명하지는 않습니다. Pages는 실제 배포 소스 SHA·호 날짜를 `build-info.json`에 기록하며, 해당 SHA의 배포 성공과 공개 빌드 정보를 확인해야 완료입니다. 아침 발행은 `main` 참조·15분 제한과 날짜/배포 SHA를 함께 보는 복구 확인을 적용합니다. 최초 정책 반영은 개발 배포 검증 뒤 별도 반영 기록을 남깁니다.

## 초기 반영과 남은 확인

초기 전환 중 기존 예약 아침 발행이 이미 검증된 `f4df437b95e7786b701ae8e107735ecc3e72ced9`를 `main`·`deploy`에 반영했습니다. [Pages 실행](https://github.com/MinsangKwak/korea-jogan/actions/runs/41755244224)은 성공했고 공개 `build-info.json`의 `sourceSha`가 같은 SHA, `environment`가 `production`, `issueDate`가 `2026-11-04`인 것을 확인했습니다. 사이트맵의 29개 주소도 확인했습니다. 이것은 최초 반영의 실제 경로이며 새 `promote.yml`을 실행했다는 기록이 아닙니다. 대기·실행 중인 이전 경로 작업은 남아 있지 않음을 확인했고, 이후 아침 발행은 새 안정 코드의 데이터 선별 경로를 사용합니다.

후속 승격 검사는 결합 상태 응답에서 생략되는 생성자 정보를 원시 상태 응답으로 대조하도록 보완합니다. 실제 Vercel 봇 응답을 사용한 로컬 22개 검사를 통과했습니다. 통합 검사·반영 이력은 [PR #92](https://github.com/MinsangKwak/korea-jogan/pull/92), 현재 운영 소스는 [공개 빌드 정보](https://korea-jogan.com/build-info.json)로 확인합니다. 첫 일일 조사·발행과 Gabia DNS 연결은 별도의 운영 확인 항목입니다.

## 검증 결과를 남길 항목

- 개발 빌드의 공개 호만 포함, 모든 HTML/헤더의 검색 차단, GA4 비활성화, 관리자 안내
- 일일 브랜치의 코드·과거 호 혼입 차단, CI 실패·동시 변경·중복 발행 처리
- 코드 승격의 정확한 SHA·CI·Vercel 배포·조상 관계 확인
- 실제 Vercel 보호 배포·DNS·HTTPS·모바일/PC 화면
- 안정본 반영·Pages 배포와 첫 일일 조사·공개 결과

위 초기 커밋의 검증·배포와 후속 보완의 검증을 구분합니다. 후속 통합 결과는 연결한 PR과 공개 빌드 정보에서 확인하고, 첫 일일 실행은 실제 완료 후 별도 운영 기록으로 남깁니다.
