# 이슈 추적과 경제 지표에 사용하는 Swiper 14.4.0

이슈 추적과 경제 지표는 지면에 가까워지면 같은 출처에서 Swiper를 한 번만 불러옵니다. PC 이슈 추적은 독자가 직접 넘기며, 경제 지표는 자동 넘김을 끄고 켤 수 있습니다. 라이브러리를 불러오지 못하면 기본 목록을 보여 줍니다. [공용 로더](../../../src/core/swiper.js) · [이슈 추적](../../../src/components/track/carousel.js) · [경제 지표](../../../src/components/economy/economy.js)

## 보관한 원본

[공식 npm 패키지](https://registry.npmjs.org/swiper/-/swiper-14.4.0.tgz)의 파일을 내용 변경 없이 보관했습니다. JS는 모든 모듈이 든 압축본, CSS는 슬라이드 배치에 필요한 core 압축본입니다. 실행에 필요하지 않은 소스맵은 보관하지 않습니다.

| 저장 파일 | npm 원본 파일 |
| --- | --- |
| `swiper-14.4.0.min.js` | `swiper-bundle.min.js` |
| `swiper-14.4.0.min.css` | `swiper.min.css` |

라이선스는 MIT이며 원문을 [LICENSE](LICENSE)에 보관합니다. 사용법은 [공식 API 문서](https://swiperjs.com/swiper-api), 버전 기록은 [공식 변경 이력](https://swiperjs.com/changelog)을 참조합니다.

## 파일 무결성

| 파일 | SHA-256 |
| --- | --- |
| swiper-14.4.0.min.js | `2ec62f21a16674b6b3eb3e3509b6307af6b7dc5eb1d48c81708a9e62c4926c7a` |
| swiper-14.4.0.min.css | `8f947870cc023adad6b38c45c96806debc41f8552bcf74eb27f0f6b1dbc69427` |

버전을 갱신할 때는 원본·라이선스·파일명·해시를 함께 기록하고, 순환·키보드·자동 넘김 정지·격자 목록 복구를 브라우저 검사로 확인합니다.
