# 2026.11.03 지면·삽화·보안 변경

**2026.11.03의 두 번째 변경 묶음으로, 지면 여백·픽셀 삽화·보안 정책을 정리한 기록입니다.** 전국 뉴스 1면·이슈 추적 2면과 이후 섹션 순서는 유지했습니다.

반영 순서는 [문구·화면 모드](changes-2026-11-03.md) → **이 문서** → [섹션 배치·모바일 읽기](changes-2026-11-03-sections.md)입니다. 아래 ‘오른쪽 진행 정보 고정’은 당시 배치입니다. 현재는 사안 카드 자체를 PC 두 열로 배치하며, 최신 기준은 후속 기록을 따릅니다.

## 당시 지면과 조작

| 영역 | 적용한 내용 |
| --- | --- |
| 전체 지면 | 최대 1,600px, PC 좌우 32px·모바일 20px 여백 |
| 전국 뉴스 | 작은 화면 한 열, 중간 화면 두 열, PC 세 열, 넓은 화면 전체 목록 최대 네 열. 처음 보이는 3건 옆에 빈 열을 남기지 않음 |
| 기사 카드 | PC 24px·모바일 20px 안쪽 여백, 내용에 맞는 높이와 위쪽 정렬 |
| 읽기 설정 | 글자 확대는 손잡이·켬/끔·aria-pressed를 함께 쓰는 토글. 화면 모드는 기기 설정·라이트·다크 선택 목록 |
| 전체 메뉴 | 읽기 설정을 위에 모으고 분야 목록과 분리. 닫기 영역을 유지하며 본문만 화면 높이 안에서 스크롤 |
| 추적 정보 | 1,100px 이상·창 높이 600px 이상에서 오른쪽 진행 정보를 고정하고 화면 높이에서 152px을 뺀 범위 안에서 스크롤. 키보드 접근과 영역 이름 제공 |
| 짧은 창·모바일 | 본문 추적 정보는 자연스러운 세로 흐름으로 표시. 고정 메뉴·추적 모달은 내부 스크롤과 닫기 유지 |
| 푸터 | 브랜드·읽기 안내, 수집 한계/출처, 지난 호/정정, 제작/라이선스로 구획. 1,024px 이하 한 열. 메뉴에서 이동한 제목이 고정 탐색에 가려지지 않도록 128px 이동 여백 |

## 픽셀 삽화와 공유

제호 아래에 가상의 새벽 도시·신문 배달 자전거를 그린 픽셀 삽화를 넣었습니다. 실제 보도 사진이 아니며 AI 생성 삽화임을 지면과 공유 카드에 표시합니다. 모바일용 720px WebP는 약 62KB, PC용 1,536px WebP는 약 206KB입니다. 크기를 미리 지정하고 비동기로 디코딩합니다.

OG·Twitter 이미지와 NewsArticle 구조화 데이터는 `og-pixel.png`를 가리킵니다. SVG 픽셀 신문을 원본으로 탭·앱·터치 아이콘과 ICO를 맞췄고 아이콘 링크에는 버전을 붙였습니다. [파일과 생성 프롬프트](../../design/illustrations.md)를 함께 기록했습니다.

## 정적 페이지의 보안

[보안 정책 생성기](../../dev/pipeline/build/build_security.py)는 실제 인라인 실행 코드의 SHA-256 해시를 계산합니다. 최신 호·지난 호를 최종 HTML로 만든 뒤 해시를 갱신하며 관리자 정책도 같은 방식으로 생성합니다. 기사 JSON과 JSON-LD는 실행 코드로 취급하지 않습니다.

- 자체 코드와 명시한 GA4·GoatCounter·Google 인증 출처만 스크립트로 허용합니다. 공개면과 관리자면의 외부 연결 범위를 나눴습니다. 기존 GA4 설정을 유지하기 위해 Google 신호·연동 측정에서 사용하는 Google/국내 Google·DoubleClick·Google 신디케이션 연결과 Tag Manager 프레임도 명시적으로 허용합니다. 광고나 신호 기능을 새로 켜지는 않습니다.
- 임의 인라인 코드·이벤트 속성·eval·object·base·worker를 차단합니다.
- 외부 글꼴의 기존 인라인 onload를 외부 비동기 스크립트로 옮겨 첫 지면을 차단하지 않습니다.
- 외부 사이트에는 referrer의 경로와 검색어를 보내지 않습니다.

기존 그래프의 동적 너비 때문에 인라인 스타일은 허용합니다. 현재 호스팅인 GitHub Pages에서는 응답 헤더를 직접 설정할 수 없어 메타 CSP를 사용합니다. 이 방식은 frame-ancestors·HSTS·X-Frame-Options·nosniff 응답 헤더를 제공하지 않습니다. 로그인·API를 포함한 허용 목록 변경 시 관리자 검사를 함께 실행해야 합니다.

참고: [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP), [메타에서 지원하지 않는 frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors), [Google 인증 CSP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [GA4 CSP](https://developers.google.com/tag-platform/security/guides/csp).

## 당시 확인 범위

이 변경 묶음에서 Python 56건, 공개 지면 Chromium 57건, 관리자 Chromium 21건, CSP Chromium 3건을 통과했습니다. 데이터 16개 호의 배포 규칙과 토큰 일치도 확인했습니다. 후속 섹션 변경에서 늘어난 검사 수와 구분합니다.

브라우저 검사는 320~1,920px의 가로 넘침, 라이트·다크와 큰 글자, 카드 여백·열 수·삽화 로드·푸터, 480px 높이의 메뉴/추적 하단과 닫기, PC 오른쪽 내부 스크롤을 다룹니다. CSP 검사는 최신·지난 호·관리자 정상 동작 및 허용 출처를 확인하고, 실제 브라우저에서 코드·이벤트·외부 스크립트·연결·object 주입이 차단되는지 확인합니다. Google 인증과 통계 API 응답은 자동 검사에서 모의 응답을 사용하며 실제 계정의 지표 값까지 검증하는 것은 아닙니다.

당시 작업은 폴더·역할별 커밋으로 나눠 검증한 뒤 `dev → main → deploy` 경로로 반영했습니다. 이 기록의 기능 배포 기준은 [`98a6d9f`](https://github.com/MinsangKwak/korea-jogan/commit/98a6d9f712471f1daff7ac14cb653cf1161fe97b)이며, 후속 변경과 합쳐 현재 검사 수로 다시 쓰지 않습니다.
