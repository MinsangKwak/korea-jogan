# 공유 이미지·아이콘과 삽화 기록

**지면 상단의 삽화는 2026.11.04 개발 화면에서 제거했습니다.** 공유 미리보기에는 픽셀 풍경을, 파비콘에는 픽셀 신문을 유지합니다.

[현재 지면 기준](guide.md) · [공개 메타태그](../dev/web/index.html) · [이미지 생성 도구](og/build.mjs)

## 자산과 용도

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| [`news-dawn-pixel.webp`](../dev/web/assets/images/news-dawn-pixel.webp) | 1,536×512px · 206,470바이트 | 이전 PC용 상단 삽화 원본 |
| [`news-dawn-pixel-720.webp`](../dev/web/assets/images/news-dawn-pixel-720.webp) | 720×240px · 62,004바이트 | 이전 모바일용 상단 삽화 원본 |
| [`og-pixel.png`](../dev/web/assets/images/og-pixel.png) | 1,200×630px | OG·Twitter 공유 미리보기 |
| [`favicon.svg`](../dev/web/assets/images/favicon.svg) | 64×64 viewBox | 픽셀 신문 아이콘 원본 |
| [`icon-512.png`](../dev/web/assets/images/icon-512.png) | 512×512px | 웹 앱 아이콘 |
| [`icon-192.png`](../dev/web/assets/images/icon-192.png) | 192×192px | 웹 앱 아이콘 |
| [`apple-touch-icon.png`](../dev/web/assets/images/apple-touch-icon.png) | 180×180px | Apple 홈 화면 아이콘 |
| [`favicon.ico`](../dev/web/favicon.ico) | 16·32·48px | 작은 브라우저 파비콘 |

상단 WebP 두 파일은 자산 기록에 남겨 두었습니다. 개발 지면에서는 표시하지 않고 페이지를 열 때도 요청하지 않습니다.

[공유 카드](og/card.html)는 제호·읽기 안내·삽화를 배치하고 특정 호의 숫자를 고정하지 않습니다. [아이콘 렌더링 원본](og/icon.html)은 같은 SVG를 참조합니다. 파비콘은 생성형 삽화를 잘라 만든 이미지가 아닙니다.

## OG·아이콘을 갱신할 때

렌더링에는 Playwright와 Chromium이 필요합니다. 저장소 루트에서 아래 순서로 브라우저 검사 의존성을 준비합니다.

```bash
cd dev/tests/browser
npm ci
npx playwright install chromium
cd ../../..
```

공유 카드와 아이콘을 모두 다시 만들거나, 아이콘만 선택해 만들 수 있습니다.

```bash
node design/og/build.mjs
node design/og/build.mjs --icons-only
```

도구는 `dev/tests/browser`의 Playwright를 사용합니다. 기존 브라우저를 쓸 때는 `CHROMIUM_PATH`, 다른 Playwright 모듈을 쓸 때는 `PLAYWRIGHT_MODULE`을 지정할 수 있습니다. 공유 카드의 지정 서체는 Noto Sans KR입니다. 로컬에 없으면 대체 글꼴을 사용하므로 같은 한글 모양으로 재현하려면 해당 서체를 설치해야 합니다. 픽셀 아이콘은 글꼴에 의존하지 않습니다.

이미지 주소를 바꾸면 다음 참조도 함께 확인합니다.

| 변경 대상 | 확인할 참조 |
| --- | --- |
| OG 파일명 | 공개 OG·Twitter 메타태그, [호별 생성기](../dev/pipeline/build/build_pages.py)의 NewsArticle 이미지 |
| 아이콘·버전 | 공개 페이지·[관리자](../dev/web/admin/index.html)·[manifest](../dev/web/manifest.webmanifest) |

현재 공유 카드는 `og-pixel.png`, 아이콘 링크 버전은 `pixel-20261103`입니다. 이전 공유 이미지와 다른 주소를 사용하며, 실제 출력 크기와 참조가 맞는지 확인합니다.

## 생성 기록과 원본 프롬프트

삽화는 내장 `image_gen`으로 새로 생성했습니다. 입력 이미지 편집은 사용하지 않았습니다. 저장된 생성 PNG 원본은 **2,172×724px**이며 이전 지면에는 압축한 WebP 두 크기를 사용했습니다. 새벽 도시·강·자전거·신문의 가상 풍경으로, 특정 사건을 재현한 보도 자료가 아닙니다.

```text
Use case: illustration-story. Asset: wide panoramic masthead illustration for a Korean data-driven morning newspaper website, Korea Jogan. Create a warm, witty, meticulously crafted 16-bit pixel-art scene of a South Korean city waking up at dawn: small newspaper delivery bicycle and folded morning newspaper in the foreground, layered contemporary city rooftops, a gentle river and distant low mountains. Calm blue, ivory, muted peach morning light with crisp square pixels and a restrained editorial feel. Wide landscape composition, approximately 3:1 ratio, all important detail within the central band so it can crop responsively. It will sit underneath the newspaper masthead and above real news. This is a playful decorative illustration, never an illustration of an actual incident: no politicians, no disaster, no aircraft, no protest, no victim, no charts or numeric claims. No lettering, no text, no logo, no watermark. Designed to look appealing on both an ivory light newsprint layout and a charcoal dark layout.
```

같은 프롬프트도 동일한 결과를 보장하지 않습니다. WebP는 이전에 사용한 자산으로 보관합니다.
