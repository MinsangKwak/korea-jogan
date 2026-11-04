# 공유 이미지·아이콘과 삽화 기록

**공유 미리보기에는 ‘첫 빛’을, 지면과 아이콘에는 `ㅈ` 심벌을 사용합니다.** 조간이 펼쳐지는 종이 뒤로 해가 뜨는 이미지는 링크를 공유할 때만 표시합니다.

[현재 지면 기준](guide.md) · [공개 메타태그](../dev/web/index.html) · [이미지 생성 도구](og/build.mjs)

## 자산과 용도

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| [`news-dawn-pixel.webp`](../dev/web/assets/images/news-dawn-pixel.webp) | 1,536×512px · 206,470바이트 | 이전 PC용 상단 삽화 원본 |
| [`news-dawn-pixel-720.webp`](../dev/web/assets/images/news-dawn-pixel-720.webp) | 720×240px · 62,004바이트 | 이전 모바일용 상단 삽화 원본 |
| [`og-first-light.png`](../dev/web/assets/images/og-first-light.png) | 1,200×630px | OG·Twitter 공유 미리보기 |
| [`og-pixel.png`](../dev/web/assets/images/og-pixel.png) | 1,200×630px | 이전 공유 이미지 주소 보존 |
| [`jogan-symbol.svg`](../dev/web/assets/images/jogan-symbol.svg) | 정사각 SVG | 제호·앱 아이콘의 `ㅈ` 심벌 원본 |
| [`favicon.svg`](../dev/web/assets/images/favicon.svg) | 정사각 SVG | 브라우저 탭용 심벌 |
| [`jogan-logo.svg`](og/jogan-logo.svg) | 가로형 SVG | 심벌과 제호를 조합한 로고 원본 |
| [`icon-512.png`](../dev/web/assets/images/icon-512.png) | 512×512px | 웹 앱 아이콘 |
| [`icon-192.png`](../dev/web/assets/images/icon-192.png) | 192×192px | 웹 앱 아이콘 |
| [`apple-touch-icon.png`](../dev/web/assets/images/apple-touch-icon.png) | 180×180px | Apple 홈 화면 아이콘 |
| [`favicon.ico`](../dev/web/favicon.ico) | 16·32·48px | 작은 브라우저 파비콘 |

상단 WebP 두 파일은 자산 기록에 남겨 두었습니다. 개발 지면에서는 표시하지 않고 페이지를 열 때도 요청하지 않습니다.

‘첫 빛’은 승인한 생성 이미지를 1,200×630px PNG로 맞춘 자산이며 특정 호의 날짜나 수치를 담지 않습니다. [아이콘 렌더링 원본](og/icon.html)은 `ㅈ` 심벌 SVG를 사용합니다. [이전 픽셀 카드](og/card.html)는 자산 기록으로 남깁니다.

## OG·아이콘을 갱신할 때

렌더링에는 Playwright와 Chromium이 필요합니다. 저장소 루트에서 아래 순서로 브라우저 검사 의존성을 준비합니다.

```bash
cd dev/tests/browser
npm ci
npx playwright install chromium
cd ../../..
```

아이콘을 갱신할 때 심벌과 파비콘 SVG를 맞춘 뒤 앱 아이콘과 ICO를 다시 만듭니다.

```bash
node design/og/build.mjs
```

도구는 `dev/tests/browser`의 Playwright를 사용합니다. 기존 브라우저를 쓸 때는 `CHROMIUM_PATH`, 다른 Playwright 모듈을 쓸 때는 `PLAYWRIGHT_MODULE`을 지정할 수 있습니다. `ㅈ` 심벌은 글꼴에 의존하지 않습니다. 공유 이미지를 바꿀 때는 새 원본을 별도 이름의 PNG로 내보냅니다.

이미지 주소를 바꾸면 다음 참조도 함께 확인합니다.

| 변경 대상 | 확인할 참조 |
| --- | --- |
| OG 파일명 | 공개 OG·Twitter 메타태그, [호별 생성기](../dev/pipeline/build/build_pages.py)의 NewsArticle 이미지 |
| 아이콘·버전 | 공개 페이지·[관리자](../dev/web/admin/index.html)·[manifest](../dev/web/manifest.webmanifest) |

현재 공유 카드는 `og-first-light.png`, 아이콘 링크 버전은 `first-light-20261104`입니다. 이전 공유 이미지와 다른 주소를 사용하며, 실제 출력 크기와 참조가 맞는지 확인합니다.

## 이전 픽셀 삽화 생성 기록

삽화는 내장 `image_gen`으로 새로 생성했습니다. 입력 이미지 편집은 사용하지 않았습니다. 저장된 생성 PNG 원본은 **2,172×724px**이며 이전 지면에는 압축한 WebP 두 크기를 사용했습니다. 새벽 도시·강·자전거·신문의 가상 풍경으로, 특정 사건을 재현한 보도 자료가 아닙니다.

```text
Use case: illustration-story. Asset: wide panoramic masthead illustration for a Korean data-driven morning newspaper website, Korea Jogan. Create a warm, witty, meticulously crafted 16-bit pixel-art scene of a South Korean city waking up at dawn: small newspaper delivery bicycle and folded morning newspaper in the foreground, layered contemporary city rooftops, a gentle river and distant low mountains. Calm blue, ivory, muted peach morning light with crisp square pixels and a restrained editorial feel. Wide landscape composition, approximately 3:1 ratio, all important detail within the central band so it can crop responsively. It will sit underneath the newspaper masthead and above real news. This is a playful decorative illustration, never an illustration of an actual incident: no politicians, no disaster, no aircraft, no protest, no victim, no charts or numeric claims. No lettering, no text, no logo, no watermark. Designed to look appealing on both an ivory light newsprint layout and a charcoal dark layout.
```

같은 프롬프트도 동일한 결과를 보장하지 않습니다. WebP는 이전에 사용한 자산으로 보관합니다.
