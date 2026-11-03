# 픽셀 삽화와 공유 이미지

**2026년 11월 3일 공개 지면에 아침 풍경의 픽셀 삽화를 추가했습니다.** 신문을 펼치기 전 가볍게 볼 수 있는 장식이며, 특정 사건을 재현한 보도 자료가 아닙니다. 새벽 도시·강·자전거·신문을 조합한 가상의 풍경이고 화면에 `AI 생성 삽화 · 실제 보도 사진이 아닙니다`를 표시합니다.

## 파일과 표시 기준

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| [`news-dawn-pixel.webp`](../dev/web/assets/images/news-dawn-pixel.webp) | 1,536×512px · 206,470바이트 | PC용 상단 삽화 |
| [`news-dawn-pixel-720.webp`](../dev/web/assets/images/news-dawn-pixel-720.webp) | 720×240px · 62,004바이트 | 작은 화면용 상단 삽화 |
| [`og-pixel.png`](../dev/web/assets/images/og-pixel.png) | 1,200×630px | OG·Twitter 공유 미리보기 |
| [`favicon.svg`](../dev/web/assets/images/favicon.svg) | 64×64 viewBox | 픽셀 신문 파비콘 원본 |
| [`icon-512.png`](../dev/web/assets/images/icon-512.png) | 512×512px | 웹 앱 아이콘 |
| [`icon-192.png`](../dev/web/assets/images/icon-192.png) | 192×192px | 웹 앱 아이콘 |
| [`apple-touch-icon.png`](../dev/web/assets/images/apple-touch-icon.png) | 180×180px | Apple 홈 화면 아이콘 |
| [`favicon.ico`](../dev/web/favicon.ico) | 16·32·48px | 작은 브라우저 파비콘 |

생성 원본은 2,048×683px이며 웹에는 압축한 WebP 두 크기를 사용합니다. `picture`의 `srcset`으로 화면에 맞는 파일을 고르고, 원본 크기를 명시해 로딩 중 지면이 밀리는 것을 줄입니다. PC에서는 4:1, 900px 이하에서는 5:2 비율로 일부를 잘라 보여 줍니다. 삽화의 문구는 이미지 안에 넣지 않고 HTML 설명으로 제공합니다.

OG 이미지는 [공유 카드 원본](og/card.html)에서 제호·읽기 안내·삽화를 함께 배치합니다. 일반 지면의 삽화를 사용한 이미지임을 표시하며 특정 호의 숫자를 그림에 고정하지 않습니다. 파비콘은 생성형 삽화를 잘라 쓰지 않고 작은 크기에 맞는 SVG 픽셀 신문으로 만들었습니다. [아이콘 렌더링 원본](og/icon.html)은 같은 SVG를 참조합니다.

## 생성 기록

삽화는 내장 `image_gen` 도구로 새로 생성했습니다. 편집할 입력 이미지는 사용하지 않았습니다. 다음 프롬프트로 가상 풍경과 픽셀 표현을 지정했습니다.

```text
Use case: illustration-story. Asset: wide panoramic masthead illustration for a Korean data-driven morning newspaper website, Korea Jogan. Create a warm, witty, meticulously crafted 16-bit pixel-art scene of a South Korean city waking up at dawn: small newspaper delivery bicycle and folded morning newspaper in the foreground, layered contemporary city rooftops, a gentle river and distant low mountains. Calm blue, ivory, muted peach morning light with crisp square pixels and a restrained editorial feel. Wide landscape composition, approximately 3:1 ratio, all important detail within the central band so it can crop responsively. It will sit underneath the newspaper masthead and above real news. This is a playful decorative illustration, never an illustration of an actual incident: no politicians, no disaster, no aircraft, no protest, no victim, no charts or numeric claims. No lettering, no text, no logo, no watermark. Designed to look appealing on both an ivory light newsprint layout and a charcoal dark layout.
```

이미지 생성은 같은 프롬프트를 사용해도 동일한 결과를 보장하지 않습니다. 공개된 WebP가 현재 지면의 기준 파일입니다.

## OG·아이콘 다시 만들기

삽화나 공유 카드·아이콘 원본을 바꾼 뒤 저장소 루트에서 실행합니다. Playwright와 Chromium이 필요합니다.

```bash
node design/og/build.mjs
```

아이콘만 다시 만들 때는 `--icons-only`를 붙입니다. 빌드 파일은 SVG를 기준으로 PNG 아이콘과 여러 크기를 담은 ICO를 생성합니다.

```bash
node design/og/build.mjs --icons-only
```

공유 카드 파일명은 `og-pixel.png`로 구분해 이전 공유 이미지와 다른 주소를 사용합니다. 파일명을 다시 바꾸면 공개 메타태그와 호별 페이지의 구조화 데이터 경로도 함께 수정합니다. 아이콘은 공개 페이지·관리자 페이지·manifest에서 같은 버전의 파일을 참조해야 합니다.
