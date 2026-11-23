# 발행 장애와 회귀 검사 기록

발행이 멈췄을 때 같은 증상이 있었는지 확인하는 기록입니다. 다음 표에서 증상을 찾고, 해당 사례의 실행 로그와 복구 결과를 대조합니다. 운영 중 실행할 명령과 배포 기준은 [발행 런북](../planning/runbook.md)과 [배포 절차](branches.md)에 있습니다.

| 증상 | 원인 또는 확인 지점 | 기록 |
| --- | --- | --- |
| 일일 후보 검사는 성공했지만 공개가 늦음 | 예약 실행과 Pages 배포가 시작된 시각을 각각 확인 | [예약 지연](#예약-지연) |
| 브라우저 검사가 열 높이를 간헐적으로 잘못 읽음 | 더보기를 누른 뒤 레이아웃 갱신을 기다리는 조건 | [레이아웃 검사 회귀](#레이아웃-검사-회귀) |
| 관리자 최신 호 확인 단계에서 발행 중단 | 생성된 공개 HTML과 검사 환경의 JSON 색인이 가리키는 호가 다름 | [발행 복구](#20261105-발행-복구와-운영-확인) |
| CSP 검사에서 `object-src` 차단을 간헐적으로 놓침 | 필요한 종류의 이벤트가 모두 도착했는지 확인 | [CSP 검사 회귀](#csp-검사-회귀) |

## 예약 지연

2026년 11월 17일에는 09:04, 19일에는 06:11에 호가 공개됐습니다. 두 후보 모두 발행 검사에는 미리 통과했습니다. 19일 배포에서 IndexNow 200, WebSub 204 응답을 확인했습니다. GitHub 예약 지연의 직접 원인은 확인되지 않았습니다. [11월 19일 배포 로그](https://github.com/MinsangKwak/korea-jogan/actions/runs/44398854740)

11월 21일에는 감독 예약이 05:55에 도구와 연결을 준비하고 06:00에 발행을 시작하도록 조정했습니다. 정각은 실행 목표이며, 공개 여부는 Pages 배포 뒤 호 날짜와 소스 SHA로 확인합니다. [예약과 공개 확인 절차](../planning/runbook.md)

## 레이아웃 검사 회귀

2026년 11월 9일 일일 후보와 `main`에서 같은 검사가 실패했습니다. Chromium이 전국 뉴스의 ‘더보기’를 연 직후, 레이아웃 관찰자와 다음 프레임의 처리가 끝나기 전에 두 열을 측정한 것이 원인이었습니다. [실패 로그](https://github.com/MinsangKwak/korea-jogan/actions/runs/42570786738)

두 열의 높이가 맞고 넘치는 열에 `data-paired-overflow`가 붙을 때까지 기다린 뒤 수치를 읽도록 고쳤습니다. 수정 커밋 `48ef4d4`에서 전체 검사를 통과했고, 일일 후보를 다시 검사한 뒤 `74ca1bf`로 발행했습니다. [수정 후 검사](https://github.com/MinsangKwak/korea-jogan/actions/runs/42573784141) · [수정 PR](https://github.com/MinsangKwak/korea-jogan/pull/110)

## 2026.11.05 발행 복구와 운영 확인

초안의 데이터 검사는 성공했지만 관리자 공개 호를 기다리는 브라우저 검사가 실패했습니다. 검사 환경의 HTML에는 공개 호만 있었고, JSON 색인의 최신 항목은 초안이었습니다. 같은 공개 호 목록으로 HTML과 색인을 생성한 뒤 관리자가 읽는 날짜가 일치하는지 검사하도록 고쳤습니다. [실패 로그](https://github.com/MinsangKwak/korea-jogan/actions/runs/41855133036) · [수정 PR](https://github.com/MinsangKwak/korea-jogan/pull/99)

| 복구 단계 | 확인 결과 |
| --- | --- |
| 수정 후 검사 | 일일 후보 `2627e7f`와 병합 커밋 `57737ae`에서 검사 통과. [후보 검사](https://github.com/MinsangKwak/korea-jogan/actions/runs/41940255196) · [병합 후 검사](https://github.com/MinsangKwak/korea-jogan/actions/runs/41941094296) |
| 운영자 복구 | 09:24에 `d5b493a`로 발행 처리하고 09:26에 Pages 배포가 성공했습니다. 호에는 `review.auto: true`를 기록했습니다. [배포 로그](https://github.com/MinsangKwak/korea-jogan/actions/runs/41941307746) |
| 공개 대조 | 14:41에 색인·호 JSON·`build-info.json` 모두 HTTP 200. 색인 날짜, 공개 상태, 배포 SHA가 일치했습니다. |

### 자동화 이관 상태 (2026.11.05 기준)

당일 조사 예약은 초안을 저장했고, 감독 예약은 06:16에 발행 검사 실패를 보고했습니다. 운영자가 복구한 뒤 뒤늦게 시작된 예약 네 건은 이미 공개된 날짜와 SHA를 대조하고 재발행 없이 끝났습니다. 검사 실패와 예약 지연은 별도로 기록했습니다. [첫 후속 실행](https://github.com/MinsangKwak/korea-jogan/actions/runs/41948361536) · [마지막 후속 실행](https://github.com/MinsangKwak/korea-jogan/actions/runs/41961843253)

## CSP 검사 회귀

2026년 11월 5일, 관리자와 공개 지면을 검사할 때 `object-src` 차단 이벤트가 늦게 오면 차단 실패로 기록하는 문제가 있었습니다. 전체 이벤트 개수로 기다림을 끝내면 같은 지시어에서 발생한 두 이벤트가 조건을 먼저 채울 수 있었습니다.

완료 조건을 필요한 지시어 전체가 관측된 시점으로 바꿨습니다. `object-src`를 200ms 늦춘 검사에서는 홈·날짜별 호·관리자 경로가 통과했고, 이벤트를 누락시킨 검사에서는 시간 초과로 실패했습니다. [브라우저 보안 검사](../../dev/tests/browser/security.cjs)

## 배포된 HTML의 보안 정책

GitHub Pages에서는 이 사이트의 응답 헤더를 직접 설정할 수 없어, 빌드할 때 인라인 스크립트의 해시를 계산하고 HTML 메타 태그로 CSP를 적용합니다. `frame-ancestors`는 응답 헤더에서만 적용할 수 있습니다. 관리자에 필요한 Google 인증과 통계 API의 허용 대상은 관리자 HTML에서 따로 생성합니다. [보안 정책 생성기](../../dev/pipeline/build/build_security.py) · [관리자 연결](ga4-admin.md)

## 추적 자료 검사

2026년 10월 30일 무안공항 조사에는 보도일·매체·원문과 확인 범위를 기록했습니다. 사건의 최종 발표일이 미확정일 때는 기간을 근거로 진척률을 표시하지 않습니다. 검사기는 추적 단계 `phases`, 현재 단계 `phaseIndex`, 기간 미확정 여부 `periodUnknown`의 모순을 확인합니다. [사안의 근거 대조](../research/muan-airport-20261030.md) · [발행 자료 검사기](../../dev/pipeline/publish/validate.py)
