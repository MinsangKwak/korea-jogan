# 지면 이미지와 앱 아이콘

‘오늘 정치 한 장’의 대표 질문에는 새벽 배경을, 신문 링크를 공유할 때는 신문 뒤로 해가 뜨는 ‘첫 빛’ 이미지를 사용합니다. 제호와 앱 아이콘은 같은 `ㅈ` 심벌을 씁니다. [운영 지면](https://korea-jogan.com/) · [디자인 가이드](guide.md)

## 자산과 용도

| 사용하는 곳 | 파일 | 표시 기준 |
| --- | --- | --- |
| 1면 정치 질문 | [politics-first-light.webp](../../../frontend-vanilla-js/assets/images/politics-first-light.webp) | 412×474px. [지면 CSS](../../../frontend-vanilla-js/src/styles/politics-front.css)에서 장식용 배경으로 적용합니다. 질문과 답은 HTML 본문입니다. |
| 링크 공유 | [og-first-light.png](../../../frontend-vanilla-js/assets/images/og-first-light.png) | 1,200×630px. OG·Twitter 미리보기와 기사의 구조화 데이터에서 사용합니다. |
| 제호·브라우저 탭 | [심벌 SVG](../../../frontend-vanilla-js/assets/images/jogan-symbol.svg) · [파비콘 SVG](../../../frontend-vanilla-js/assets/images/favicon.svg) · [favicon.ico](../../../frontend-vanilla-js/favicon.ico) | 벡터 심벌을 사용하고 ICO에는 16·32·48px 크기를 담습니다. |
| 앱과 홈 화면 | [512px](../../../frontend-vanilla-js/assets/images/icon-512.png) · [192px](../../../frontend-vanilla-js/assets/images/icon-192.png) · [Apple 180px](../../../frontend-vanilla-js/assets/images/apple-touch-icon.png) | 웹 앱 매니페스트와 홈 화면 아이콘 선언에 연결합니다. |

## OG·아이콘을 갱신할 때

공유 이미지를 교체하면 원본 크기와 대체 설명을 확인하고, 홈의 `og:image`·`twitter:image` 및 기사 생성기의 이미지 주소를 함께 바꿉니다. [홈 메타태그](../../../frontend-vanilla-js/index.html) · [호별 페이지 생성기](../../../backend-python/pipeline/build/build_pages.py)

앱 아이콘은 심벌 SVG를 읽는 [아이콘 원본](../../tools/og/icon.html)에서 생성합니다. 심벌과 파비콘 SVG를 맞춘 뒤 저장소 루트에서 아래 명령을 실행합니다. [생성 도구](../../tools/og/build.mjs)

```bash
(cd project/tests/browser && npm ci && npx playwright install chromium)
node project/tools/og/build.mjs
```

생성 결과는 크기별 PNG 세 개와 ICO입니다. 브라우저 실행 파일은 `CHROMIUM_PATH`, Playwright 모듈은 `PLAYWRIGHT_MODULE`로 지정할 수 있습니다. 아이콘 주소가 바뀌면 홈과 관리자 페이지의 선언 및 매니페스트의 경로를 확인합니다. [관리자 메타태그](../../../frontend-vanilla-js/admin/index.html) · [앱 매니페스트](../../../frontend-vanilla-js/manifest.webmanifest)
