# 이슈 추적과 경제 지표에 사용하는 Swiper 14.4.0

이슈 추적과 경제 지표는 지면에 가까워지면 같은 출처에서 Swiper를 한 번만 불러옵니다. PC에서 이슈가 세 건 이상이면 처음부터 한 줄에 두 장이 보입니다. 준비가 끝나면 버튼이나 방향키로 한 장씩 넘깁니다. 라이브러리를 받지 못해도 가로 스크롤과 Tab 키로 모든 이슈를 읽을 수 있습니다. 작은 화면에서는 세로 목록으로 읽습니다.

경제 지표의 자동 넘김은 독자가 끄고 켤 수 있습니다. 라이브러리를 받지 못하면 지표 목록을 그대로 보여 줍니다. [공용 로더](../../../frontend-vanilla-js/src/core/swiper.js) · [이슈 추적](../../../frontend-vanilla-js/src/components/track/carousel.js) · [경제 지표](../../../frontend-vanilla-js/src/components/economy/economy.js)

## 보관한 원본

[공식 npm 패키지](https://registry.npmjs.org/swiper/-/swiper-14.4.0.tgz)의 파일을 내용 변경 없이 보관했습니다. JS는 모든 모듈이 든 압축본, CSS는 슬라이드 배치에 필요한 core 압축본입니다. 실행에 필요하지 않은 소스맵은 보관하지 않습니다.

| 저장 파일 | npm 원본 파일 |
| --- | --- |
| [swiper-14.4.0.min.js](../../../frontend-vanilla-js/assets/vendor/swiper/swiper-14.4.0.min.js) | `swiper-bundle.min.js` |
| [swiper-14.4.0.min.css](../../../frontend-vanilla-js/assets/vendor/swiper/swiper-14.4.0.min.css) | `swiper.min.css` |

라이선스는 MIT이며 원문을 [LICENSE](../../../frontend-vanilla-js/assets/vendor/swiper/LICENSE)에 보관합니다. 사용법은 [공식 API 문서](https://swiperjs.com/swiper-api), 버전 기록은 [공식 변경 이력](https://swiperjs.com/changelog)을 참조합니다.

## 파일 무결성

| 파일 | SHA-256 |
| --- | --- |
| swiper-14.4.0.min.js | `2ec62f21a16674b6b3eb3e3509b6307af6b7dc5eb1d48c81708a9e62c4926c7a` |
| swiper-14.4.0.min.css | `8f947870cc023adad6b38c45c96806debc41f8552bcf74eb27f0f6b1dbc69427` |

버전을 갱신할 때는 원본·라이선스·파일명·해시를 함께 기록하고, 순환·키보드·자동 넘김 정지·격자 목록 복구를 브라우저 검사로 확인합니다.
