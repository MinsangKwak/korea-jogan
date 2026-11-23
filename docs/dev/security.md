# 기사 지면과 읽기 API의 보안 설계

누구나 기사와 판례를 읽을 수 있습니다. 공개 기사 조회, 기사 발행, 운영 통계 조회에 필요한 권한을 분리했습니다. 예를 들어 Swagger에서 특정 호를 조회하면 발행된 요약과 원문 주소를 받습니다. 기사를 정정하려면 배포 과정을 거쳐야 합니다.

## 구현에서 확인할 수 있는 것

| 대상 | 줄이려는 위험 | 적용한 조치와 확인할 코드 |
| --- | --- | --- |
| 뉴스·판례 화면 | 기사 제목이나 출처가 화면에서 명령으로 해석되는 문제 | 기사 본문을 텍스트로 넣고 정적 출력은 HTML·JSON 형식별로 인코딩합니다. 원문 버튼은 사용자 이름·암호가 없는 절대 HTTP(S) 주소를 확인한 뒤 연결합니다. 페이지별 스크립트 해시로 CSP를 생성합니다. [화면 공통 함수](../../frontend-vanilla-js/src/core/ui.js) · [HTML 생성](../../backend-python/pipeline/build/build_pages.py) · [CSP 생성](../../backend-python/pipeline/build/build_security.py) |
| 관리자 통계 | 발행 상태를 보러 온 사람에게 방문·검색 통계 권한까지 전달되는 문제 | 발행일과 기사 건수는 공개합니다. GA4와 Search Console은 Google의 읽기 전용 범위와 해당 속성 권한을 요구합니다. 토큰은 창의 메모리에 보관하고, 허용한 Google API 주소로만 전송하며 리디렉션을 차단합니다. 종료·만료 시 정리합니다. [토큰을 보내는 조건](../../frontend-vanilla-js/admin/api.js) · [관리자 인증](../../frontend-vanilla-js/admin/app.js) |
| 방문 통계 | 검색어·공유 주소의 매개변수가 GA4로 전달되는 문제 | 지면과 검색 진입 페이지에서 읽은 경로를 기록합니다. 주소의 쿼리 중 형식이 맞는 캠페인 UTM 4종만 남기고, 외부 유입은 출처 도메인까지만 보냅니다. [GA4 주소 처리](../../frontend-vanilla-js/src/core/metrics.js) |
| 기사 저장소 | 미발행 자료 노출, 요청을 통한 DB 수정 | 공개 호 목록과 발행 상태를 검사한 뒤 기사 제목·요약·출처 등 지정한 필드만 내보냅니다. 정식 발행과 시범호를 표시하고 초안은 제외합니다. 호 날짜와 기사 ID를 고정된 SQL에 매개변수로 전달합니다. [기사 저장·조회 구현](../../backend-python/edition_api.py) |
| 발행·배포 | 검사 중 코드가 바뀌거나 작업에 필요 없는 단계에서 비밀값을 받는 문제 | PR 검사는 저장소 읽기 권한으로 수행합니다. Pages 배포는 대상 커밋과 최신 main을 대조합니다. 예약 판단 단계는 ECOS 키의 등록 여부만 받고, 실제 키는 경제 지표를 수집하는 단계에서 읽습니다. [검사 권한](../../.github/workflows/check.yml) · [배포 단계](../../.github/workflows/deploy-pages.yml) |

## 배포 환경별 적용 범위

- **조간 지면 · GitHub Pages**　기사 HTML에 메타 CSP를 넣고, 판례면에는 외부 사이트로 이동할 때 참조 주소를 전달하지 않는 정책을 적용합니다. 메타 CSP가 지원하는 지시문에는 한계가 있습니다. `frame-ancestors`처럼 서버 응답 헤더가 필요한 정책은 환경별로 따로 확인해야 합니다. [지면 정책](../../backend-python/pipeline/build/build_security.py) · [MDN의 CSP 적용 범위](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- **기사 조회 · Python**　GET·HEAD만 처리하고 SQLite는 읽기 전용으로 엽니다. 쓰기 메서드는 405, 없는 기사는 404, 저장소 오류는 503을 반환합니다. JSON 응답에 정확한 콘텐츠 형식과 `nosniff`를 지정하고, 오류 응답에는 `no-store`와 일반화한 메시지를 씁니다. [요청 처리·응답 헤더](../../backend-python/article_http.py) · [OWASP의 매개변수 바인딩 설명](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- **Swagger UI**　같은 사이트의 명세와 기사 조회 경로를 사용합니다. 문서에서 실행할 수 있는 메서드는 GET이며, 다른 출처 요청과 리디렉션을 차단하고 Swagger의 인증정보 저장·외부 명세 검증·URL 쿼리를 통한 설정 변경을 끕니다. 보호된 미리보기에서는 같은 출처의 로그인 세션을 사용합니다. 배포에 포함한 Swagger UI 배포본의 JS·CSS에는 무결성 해시를 지정합니다. [문서 실행 설정](../../backend-python/public/api/docs/initialize.js) · [API 문서](https://korea-jogan.com/api/docs/) · [Swagger UI 설정 기준](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)

공개 기사 API는 키 없이 읽을 수 있습니다. 앱에는 사용자별 호출 횟수 제한이 없습니다. 공개 데이터는 제3자도 읽고 복사할 수 있습니다. 이 문서에서 확인한 범위는 애플리케이션 코드, 배포 설정, 정상 응답과 로컬 회귀 검사입니다.

## 검증을 따라가려면

- 공개 목록에 없는 초안, 정정·철회된 기사, 잘못된 입력 때문에 빌드가 실패한 경우를 로컬 임시 DB로 확인합니다. [백엔드 테스트](../../backend-python/tests/)
- 테스트용 기사와 브라우저에서 지면의 CSP 동작을 확인합니다. 관리자 검사는 모의 Google 응답을 사용해 미승인·권한 부족·만료와 연결 해제 후 화면을 확인합니다. [지면 검사](../../tests/browser/security.cjs) · [관리자 검사](../../tests/browser/admin.cjs)
- 공개본에서는 배포한 커밋의 발행일, 호 목록, 그날의 기사와 원문 주소가 서로 일치하는지 대조합니다. [배포본 검증](../../backend-python/pipeline/publish/verify_publication.py)
